// Adzuna job search API (developer.adzuna.com). Real paging: each screen of
// Discover costs one request of that screen's size, cached for 15 minutes.
// Keys come from ADZUNA_APP_ID / ADZUNA_APP_KEY in .env.local and never appear
// in logs, cache keys or error messages.
//
// Adzuna only returns a short description snippet; the full description comes
// from the posting itself (Get description / paste).

import { buildNormalizedJob, classifyCategories, decodeEntities, inferEmploymentType, inferWorkMode } from "../normalize";
import { cached } from "./cache";
import type { DiscoverQuery, JobSourcePlugin, SourceJob } from "./types";

const api = () => (process.env.ADZUNA_API_URL || "https://api.adzuna.com/v1/api/jobs").replace(/\/+$/, "");
const PAGE_TTL_MS = 15 * 60_000;
const MAX_PER_REQUEST = 50;
/** Words that mark internships and co-ops in titles and descriptions. */
const INTERNSHIP_WORDS = "intern internship co-op coop student";

export interface AdzunaResult {
  id: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  contract_time?: string;
  contract_type?: string;
  category?: { label?: string; tag?: string };
}

interface AdzunaResponse {
  count?: number;
  results?: AdzunaResult[];
}

export function adzunaKeys(): { appId: string; appKey: string } | null {
  const appId = (process.env.ADZUNA_APP_ID || "").trim();
  const appKey = (process.env.ADZUNA_APP_KEY || "").trim();
  return appId && appKey ? { appId, appKey } : null;
}

export function adzunaCountry(): string {
  return (process.env.ADZUNA_COUNTRY || "ca").trim().toLowerCase();
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** Query-string parameters for one page (without the keys). Exported for tests. */
export function adzunaParams(q: DiscoverQuery, perPage: number): URLSearchParams {
  const p = new URLSearchParams();
  p.set("results_per_page", String(Math.min(MAX_PER_REQUEST, Math.max(1, perPage))));
  if (q.q.trim()) p.set("what", q.q.trim());
  if (q.internship) p.set("what_or", INTERNSHIP_WORDS);
  if (q.workplace === "remote") {
    // Remote roles anywhere in the country.
    p.set("what_and", "remote");
  } else if (q.location.trim()) {
    p.set("where", q.location.trim());
    p.set("distance", String(Math.max(1, Math.round(q.radiusKm))));
  }
  p.set("sort_by", q.sort === "relevance" && q.q.trim() ? "relevance" : "date");
  if (q.days) p.set("max_days_old", String(q.days));
  p.set("content-type", "application/json");
  return p;
}

export function mapAdzunaResult(r: AdzunaResult): SourceJob {
  const title = stripTags(r.title || "Untitled role");
  const snippet = r.description ? stripTags(r.description) : null;
  const location = r.location?.display_name || null;
  const job: SourceJob = buildNormalizedJob({
    source: "adzuna",
    source_id: String(r.id),
    company: stripTags(r.company?.display_name || "") || "Company not listed",
    title,
    location,
    url: r.redirect_url ?? null,
    posted_at: r.created ?? null,
  });
  // Only a snippet: keep it for display, but don't treat it as the description.
  job.snippet = snippet;
  job.employment_type = inferEmploymentType(title, snippet);
  job.categories = classifyCategories(title, snippet);
  job.work_mode = /remote/i.test(`${location} ${title}`) ? "remote" : inferWorkMode(null, snippet);
  return job;
}

async function fetchPage(
  q: DiscoverQuery,
  perPage: number,
  page: number,
  fetchImpl: typeof fetch
): Promise<{ results: SourceJob[]; count: number }> {
  const keys = adzunaKeys();
  if (!keys) throw new Error("Add ADZUNA_APP_ID and ADZUNA_APP_KEY to .env.local to use Adzuna.");
  const params = adzunaParams(q, perPage);
  const cacheKey = `adzuna:${adzunaCountry()}:${page}:${params.toString()}`;
  return cached(cacheKey, PAGE_TTL_MS, async () => {
    const withKeys = new URLSearchParams(params);
    withKeys.set("app_id", keys.appId);
    withKeys.set("app_key", keys.appKey);
    const url = `${api()}/${encodeURIComponent(adzunaCountry())}/search/${page}?${withKeys.toString()}`;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new Error("Couldn't reach Adzuna. Check your internet connection.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Adzuna rejected ADZUNA_APP_ID / ADZUNA_APP_KEY. Check them at developer.adzuna.com.");
    }
    if (res.status === 429) {
      throw new Error("Adzuna's rate limit for your key was reached. Pages you've already opened still work; try again later.");
    }
    if (!res.ok) throw new Error(`Adzuna returned HTTP ${res.status}.`);
    const data = (await res.json()) as AdzunaResponse;
    return { results: (data.results ?? []).map(mapAdzunaResult), count: data.count ?? 0 };
  });
}

export const adzunaSource: JobSourcePlugin = {
  id: "adzuna",
  label: "Adzuna",
  description: "Local job search across Canadian job boards and company sites (needs a free Adzuna API key).",
  supports: { relevance: "native", radius: true },
  status() {
    return adzunaKeys()
      ? { ready: true }
      : { ready: false, message: "Add ADZUNA_APP_ID and ADZUNA_APP_KEY to .env.local (free at developer.adzuna.com), then restart." };
  },
  async fetchWindow(ctx, query, offset, limit, chunk) {
    const size = Math.min(MAX_PER_REQUEST, Math.max(1, chunk));
    const first = Math.floor(offset / size) + 1;
    const last = Math.max(first, Math.ceil((offset + limit) / size));
    const items: SourceJob[] = [];
    let total = 0;
    for (let page = first; page <= last; page++) {
      const res = await fetchPage(query, size, page, ctx.fetchImpl);
      total = res.count;
      items.push(...res.results);
      if (res.results.length < size) break; // ran out
    }
    const start = offset - (first - 1) * size;
    return { items: items.slice(start, start + limit), total };
  },
};
