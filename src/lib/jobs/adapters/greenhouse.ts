// Greenhouse Job Board API adapter.
// Public API: https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
// Maps external postings into the internal NormalizedJob type.

import { buildNormalizedJob, type NormalizedJob } from "../normalize";

export interface GreenhouseJob {
  id: number;
  title: string;
  updated_at?: string;
  first_published?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string; // HTML-escaped HTML
  company_name?: string;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

/** Greenhouse double-escapes posting HTML; unescape the outer layer once. */
function unescapeOnce(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function mapGreenhouseJob(
  raw: GreenhouseJob,
  boardToken: string,
  companyLabel?: string
): NormalizedJob {
  const html = raw.content ? unescapeOnce(raw.content) : null;
  return buildNormalizedJob({
    source: "greenhouse",
    source_id: String(raw.id),
    company: companyLabel || raw.company_name || boardToken,
    title: raw.title || "Untitled role",
    location: raw.location?.name ?? null,
    url: raw.absolute_url ?? null,
    description_html: html,
    posted_at: raw.first_published ?? raw.updated_at ?? null,
  });
}

export async function fetchGreenhouseJobs(
  boardToken: string,
  companyLabel?: string,
  fetchImpl: typeof fetch = fetch
): Promise<NormalizedJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    boardToken
  )}/jobs?content=true`;
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Greenhouse board "${boardToken}" returned ${res.status}`);
  }
  const data = (await res.json()) as GreenhouseResponse;
  return (data.jobs ?? []).map((j) => mapGreenhouseJob(j, boardToken, companyLabel));
}
