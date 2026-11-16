// Ashby public job board adapter.
// Public API: https://api.ashbyhq.com/posting-api/job-board/{org}
// The same data the company's jobs.ashbyhq.com page loads; no key, no login.

import { buildNormalizedJob, type NormalizedJob } from "../normalize";

export interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  isListed?: boolean;
  employmentType?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
}

export function mapAshbyJob(raw: AshbyJob, org: string, companyLabel?: string): NormalizedJob {
  const locations = [raw.location, ...(raw.secondaryLocations ?? []).map((l) => l.location)].filter(
    (l): l is string => Boolean(l)
  );
  const location = [...new Set(locations)].join(" / ") + (raw.isRemote && !/remote/i.test(locations.join(" ")) ? " (Remote)" : "");
  return buildNormalizedJob({
    source: "ashby",
    source_id: raw.id,
    company: companyLabel || org,
    title: raw.title || "Untitled role",
    location: location || null,
    url: raw.jobUrl ?? raw.applyUrl ?? null,
    description_html: raw.descriptionHtml ?? null,
    description_text: raw.descriptionPlain?.trim() || null,
    posted_at: raw.publishedAt ?? null,
  });
}

export async function fetchAshbyJobs(
  org: string,
  companyLabel?: string,
  fetchImpl: typeof fetch = fetch
): Promise<NormalizedJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=false`;
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Ashby board "${org}" returned ${res.status}`);
  }
  const data = (await res.json()) as { jobs?: AshbyJob[] };
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => mapAshbyJob(j, org, companyLabel));
}
