// Job board data access + ingestion orchestration.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow, JobSourceRow } from "../types";
import { dedupeJobs } from "../jobs/dedupe";
import { descriptionPatch, type NormalizedJob } from "../jobs/normalize";
import { fetchSimplifyListings, filterAndMap, type FeedFilter, type SimplifyListing } from "../jobs/adapters/simplify";
import { canBulkFetch, fetchPosting } from "../jobs/posting";
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

/** Supabase projects set up before migration 0006 lack jobs.is_open. */
export function explainDbError(message: string): string {
  if (/is_open/.test(message) || /jobs_source_check/.test(message)) {
    return `${message}. Your database needs the newest update: run supabase/migrations/0006_simplify_feed.sql in the Supabase SQL Editor.`;
  }
  return message;
}

const JOB_LIST_COLUMNS =
  "id, source, source_id, company, company_slug, title, location, work_mode, employment_type, categories, url, description_text, skills, ats_keywords, posted_at, dedupe_key, is_open, created_at, updated_at";

export async function listJobs(supabase: SupabaseClient, filters: JobFilters): Promise<JobRow[]> {
  // Everything except description_html (large, not needed for the board).
  let query = supabase.from("jobs").select(JOB_LIST_COLUMNS).eq("is_open", true);

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
    .limit(400);
  if (error) throw new Error(`Failed to load jobs: ${explainDbError(error.message)}`);
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

export interface FeedIngestSummary {
  /** Listings that passed your filters. */
  matching: number;
  added: number;
  closed: number;
  described: number;
  /** Descriptions that couldn't be fetched (closed or moved postings). */
  describeFailed: number;
  errors: string[];
}

/** How many descriptions to fetch per refresh, and how many at once. */
const DESCRIBE_PER_REFRESH = 40;
const DESCRIBE_CONCURRENCY = 5;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Pull the Simplify internship list, add new matching listings, mark listings
 * that left the feed as closed, and fetch descriptions for a batch of jobs that
 * still lack one (Greenhouse/Lever/Ashby links only). Existing rows are never
 * overwritten, so fetched or pasted descriptions survive every refresh.
 */
export async function ingestSimplify(
  supabase: SupabaseClient,
  filter: FeedFilter,
  opts: { fetchImpl?: typeof fetch; listings?: SimplifyListing[] } = {}
): Promise<FeedIngestSummary> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const errors: string[] = [];
  const listings = opts.listings ?? (await fetchSimplifyListings(fetchImpl));
  const jobs = dedupeJobs(filterAndMap(listings, filter));
  const currentKeys = new Set(jobs.map((j) => j.dedupe_key));

  const { data: openRows, error: openErr } = await supabase
    .from("jobs")
    .select("id, dedupe_key")
    .eq("source", "simplify")
    .eq("is_open", true)
    .limit(5000);
  if (openErr) throw new Error(explainDbError(openErr.message));
  const known = new Set((openRows || []).map((r) => r.dedupe_key as string));

  // 1. Add new listings (ON CONFLICT DO NOTHING keeps existing rows untouched,
  //    including the same job already pulled from a company's own board).
  const fresh = jobs.filter((j) => !known.has(j.dedupe_key));
  let added = 0;
  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    const { error } = await supabase
      .from("jobs")
      .upsert(chunk, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (error) errors.push(explainDbError(error.message));
    else added += chunk.length;
  }

  // 2. Close listings that are no longer open or no longer match.
  const gone = (openRows || []).filter((r) => !currentKeys.has(r.dedupe_key as string)).map((r) => r.id as string);
  let closed = 0;
  for (let i = 0; i < gone.length; i += 100) {
    const ids = gone.slice(i, i + 100);
    const { error } = await supabase.from("jobs").update({ is_open: false }).in("id", ids);
    if (error) errors.push(error.message);
    else closed += ids.length;
  }

  // 3. Fetch descriptions for open feed jobs that still have none.
  const { data: bare, error: bareErr } = await supabase
    .from("jobs")
    .select("id, url, title, location, categories, employment_type")
    .eq("source", "simplify")
    .eq("is_open", true)
    .is("description_text", null)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (bareErr) errors.push(bareErr.message);
  const todo = ((bare || []) as Pick<JobRow, "id" | "url" | "title" | "location" | "categories" | "employment_type">[])
    .filter((j) => canBulkFetch(j.url))
    .slice(0, DESCRIBE_PER_REFRESH);
  let described = 0;
  let describeFailed = 0;
  await mapLimit(todo, DESCRIBE_CONCURRENCY, async (job) => {
    try {
      const posting = await fetchPosting(job.url!, fetchImpl);
      if (!posting.description_text) return;
      const { error } = await supabase
        .from("jobs")
        .update(descriptionPatch(job, posting.description_html, posting.description_text))
        .eq("id", job.id);
      if (error) errors.push(error.message);
      else described++;
    } catch {
      // A closed or moved posting just stays without a description.
      describeFailed++;
    }
  });

  return { matching: jobs.length, added, closed, described, describeFailed, errors };
}
