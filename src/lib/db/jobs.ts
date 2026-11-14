// Jobs table access. Discover reads jobs live from the sources
// (src/lib/jobs/sources) and only saves the jobs on the page being viewed, so
// they get an id for the job page, saving, analysis and tailoring.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow, JobSourceRow } from "../types";
import { descriptionPatch } from "../jobs/normalize";
import { canBulkFetch, fetchPosting } from "../jobs/posting";
import { mergeSources, sourcesFromEnv, type CompanySource } from "../jobs/registry";
import type { SourceJob } from "../jobs/sources/types";

/** Point at the missing migration when the database is older than the code. */
export function explainDbError(message: string): string {
  if (/is_open/.test(message)) {
    return `${message}. Your database needs an update: run supabase/migrations/0006_simplify_feed.sql in the Supabase SQL Editor.`;
  }
  if (/job_analyses_engine_check/.test(message)) {
    return `${message}. Your database needs an update: run supabase/migrations/0009_more_ai_backends.sql in the Supabase SQL Editor.`;
  }
  if (/snippet|jobs_source_check/.test(message)) {
    return `${message}. Your database needs an update: run supabase/migrations/0007_pluggable_sources.sql in the Supabase SQL Editor.`;
  }
  return message;
}

export async function getJob(supabase: SupabaseClient, id: string): Promise<JobRow | null> {
  const { data, error } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as JobRow) || null;
}

export async function savedJobIds(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("saved_jobs").select("job_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r) => r.job_id as string));
}

export async function loadSources(supabase: SupabaseClient, userId: string): Promise<CompanySource[]> {
  const { data, error } = await supabase
    .from("job_sources")
    .select("kind, token, label, enabled")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return mergeSources(
    sourcesFromEnv({
      GREENHOUSE_BOARDS: process.env.GREENHOUSE_BOARDS,
      LEVER_SITES: process.env.LEVER_SITES,
    }),
    (data || []) as Pick<JobSourceRow, "kind" | "token" | "label" | "enabled">[]
  );
}

/** Columns Discover needs (everything but the large description_html). */
const PAGE_COLUMNS =
  "id, source, source_id, company, company_slug, title, location, work_mode, employment_type, categories, url, description_text, snippet, skills, ats_keywords, posted_at, dedupe_key, is_open, created_at, updated_at";

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Make sure every job on the current page has a row in the jobs table and
 * return those rows in page order. Existing rows are never overwritten, so a
 * description you fetched or pasted survives. At most one page (≤ 50 jobs) is
 * written per call.
 */
export async function materializePage(supabase: SupabaseClient, items: SourceJob[]): Promise<JobRow[]> {
  const idFor = new Map<SourceJob, string>();
  for (const it of items) if (it.id) idFor.set(it, it.id);

  const lookup = async (pending: SourceJob[]) => {
    const bySource = new Map<string, SourceJob[]>();
    for (const it of pending) {
      if (!it.source_id) continue;
      bySource.set(it.source, [...(bySource.get(it.source) ?? []), it]);
    }
    for (const [source, list] of bySource) {
      for (const part of chunks(list, 50)) {
        const { data, error } = await supabase
          .from("jobs")
          .select("id, source_id")
          .eq("source", source)
          .in("source_id", part.map((j) => j.source_id));
        if (error) throw new Error(explainDbError(error.message));
        const ids = new Map((data || []).map((r) => [r.source_id as string, r.id as string]));
        for (const j of part) if (ids.has(j.source_id!)) idFor.set(j, ids.get(j.source_id!)!);
      }
    }
  };

  await lookup(items.filter((it) => !idFor.has(it)));

  const missing = items.filter((it) => !idFor.has(it));
  if (missing.length) {
    const rows = missing.map((j) => {
      const { id: _id, ...row } = j;
      void _id;
      return { ...row, snippet: j.snippet ?? null };
    });
    const { error } = await supabase.from("jobs").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (error) throw new Error(explainDbError(error.message));
    await lookup(missing);
    // Same job already saved from another source: match on the dedupe key.
    for (const part of chunks(items.filter((it) => !idFor.has(it)), 10)) {
      const { data } = await supabase.from("jobs").select("id, dedupe_key").in("dedupe_key", part.map((j) => j.dedupe_key));
      const ids = new Map((data || []).map((r) => [r.dedupe_key as string, r.id as string]));
      for (const j of part) if (ids.has(j.dedupe_key)) idFor.set(j, ids.get(j.dedupe_key)!);
    }
  }

  const ids = Array.from(new Set(items.map((it) => idFor.get(it)).filter(Boolean))) as string[];
  if (!ids.length) return [];
  const { data, error } = await supabase.from("jobs").select(PAGE_COLUMNS).in("id", ids);
  if (error) throw new Error(explainDbError(error.message));
  const byId = new Map(((data || []) as unknown as JobRow[]).map((r) => [r.id, r]));
  const out: JobRow[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const id = idFor.get(it);
    if (!id || seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    out.push(byId.get(id)!);
  }
  return out;
}

/**
 * Fetch full descriptions for jobs on the page being viewed (Greenhouse,
 * Lever and Ashby links only; Workday stays on-demand). Returns how many
 * jobs got one.
 */
export async function describeJobs(
  supabase: SupabaseClient,
  ids: string[],
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase
    .from("jobs")
    .select("id, url, title, location, categories, employment_type, description_text")
    .in("id", ids.slice(0, 50));
  if (error) throw new Error(error.message);
  const todo = ((data || []) as Pick<JobRow, "id" | "url" | "title" | "location" | "categories" | "employment_type" | "description_text">[])
    .filter((j) => !j.description_text && canBulkFetch(j.url));
  let described = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const job = todo[next++];
      try {
        const posting = await fetchPosting(job.url!, fetchImpl);
        if (!posting.description_text.trim()) continue;
        const { error: upErr } = await supabase
          .from("jobs")
          .update(descriptionPatch(job, posting.description_html, posting.description_text))
          .eq("id", job.id);
        if (!upErr) described++;
      } catch {
        // Closed or moved posting: it keeps "Add description".
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, todo.length) }, worker));
  return described;
}
