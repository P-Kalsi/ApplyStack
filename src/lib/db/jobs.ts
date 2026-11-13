// Job board data access + ingestion orchestration.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow, JobSourceRow } from "../types";
import { dedupeJobs } from "../jobs/dedupe";
import type { NormalizedJob } from "../jobs/normalize";
import { mergeSources, sourcesFromEnv, type CompanySource } from "../jobs/registry";
import { fetchGreenhouseJobs } from "../jobs/adapters/greenhouse";
import { fetchLeverJobs } from "../jobs/adapters/lever";

export interface JobFilters {
  q?: string;
  location?: string;
  remote?: boolean;
  internship?: boolean;
  categories?: string[];
  postedWithinDays?: number;
}

export async function listJobs(supabase: SupabaseClient, filters: JobFilters): Promise<JobRow[]> {
  let query = supabase.from("jobs").select("*");

  if (filters.q) {
    // Strip characters that would break the PostgREST or()/ilike syntax.
    const q = filters.q.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
    if (q) query = query.or(`title.ilike.%${q}%,company.ilike.%${q}%,description_text.ilike.%${q}%`);
  }
  if (filters.location) {
    const loc = filters.location.replace(/[%_]/g, "").trim();
    if (loc) query = query.ilike("location", `%${loc}%`);
  }
  if (filters.remote) query = query.eq("work_mode", "remote");
  if (filters.internship) query = query.eq("employment_type", "internship");
  if (filters.categories && filters.categories.length > 0) {
    query = query.overlaps("categories", filters.categories);
  }
  if (filters.postedWithinDays) {
    const cutoff = new Date(Date.now() - filters.postedWithinDays * 86400_000).toISOString();
    query = query.gte("posted_at", cutoff);
  }

  const { data, error } = await query
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(`Failed to load jobs: ${error.message}`);
  return (data || []) as JobRow[];
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

export async function loadSources(
  supabase: SupabaseClient,
  userId: string
): Promise<CompanySource[]> {
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

export interface IngestSummary {
  sources: number;
  fetched: number;
  upserted: number;
  errors: string[];
}

/**
 * Pull postings from every configured source, normalize, dedupe, and upsert
 * into the shared jobs table. Failures on one source never block the rest.
 */
export async function ingestJobs(
  supabase: SupabaseClient,
  sources: CompanySource[]
): Promise<IngestSummary> {
  const errors: string[] = [];
  const batches = await Promise.all(
    sources.map(async (source): Promise<NormalizedJob[]> => {
      try {
        if (source.kind === "greenhouse") {
          return await fetchGreenhouseJobs(source.token, source.label);
        }
        return await fetchLeverJobs(source.token, source.label);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        return [];
      }
    })
  );

  const all = dedupeJobs(batches.flat());
  let upserted = 0;
  // Upsert in chunks to stay under payload limits.
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    const { error, count } = await supabase
      .from("jobs")
      .upsert(chunk, { onConflict: "dedupe_key", ignoreDuplicates: false, count: "exact" });
    if (error) errors.push(error.message);
    else upserted += count ?? chunk.length;
  }

  return { sources: sources.length, fetched: batches.flat().length, upserted, errors };
}
