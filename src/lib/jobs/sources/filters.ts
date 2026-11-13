// Filtering and sorting for sources that publish a whole list. Pure, tested.

import type { DiscoverQuery, SortKey, SourceJob } from "./types";

/** Cities that count as "local" for a searched city (no geocoding needed). */
const METROS: string[][] = [
  ["vancouver", "burnaby", "richmond", "surrey", "coquitlam", "north vancouver", "west vancouver", "new westminster", "delta", "langley", "port coquitlam", "port moody", "maple ridge", "white rock"],
  ["toronto", "mississauga", "markham", "brampton", "vaughan", "richmond hill", "oakville", "scarborough", "north york", "etobicoke", "pickering", "ajax", "thornhill", "concord"],
  ["montreal", "montréal", "laval", "longueuil", "saint-laurent", "dorval"],
  ["ottawa", "kanata", "gatineau", "nepean"],
  ["waterloo", "kitchener", "cambridge", "guelph"],
  ["calgary", "airdrie"],
  ["edmonton", "st. albert", "sherwood park"],
  ["victoria", "saanich", "langford"],
  ["seattle", "bellevue", "redmond", "kirkland", "bothell"],
  ["san francisco", "south san francisco", "oakland", "san mateo", "palo alto", "mountain view", "sunnyvale", "san jose", "menlo park", "redwood city", "santa clara"],
  ["new york", "brooklyn", "jersey city"],
];

/** "Vancouver, BC" -> every place name that counts as local. */
export function localPlaces(location: string): string[] {
  const city = location.split(",")[0].trim().toLowerCase();
  if (!city) return [];
  const metro = METROS.find((m) => m.includes(city) || (city === "montreal" && m.includes("montréal")));
  return metro ?? [city];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function isRemote(job: Pick<SourceJob, "location" | "work_mode">): boolean {
  return job.work_mode === "remote" || /\bremote\b/i.test(job.location || "");
}

export function isLocal(job: Pick<SourceJob, "location">, places: string[]): boolean {
  if (!places.length) return true;
  const loc = (job.location || "").toLowerCase();
  return places.some((p) => new RegExp(`(^|[^a-z])${esc(p)}([^a-z]|$)`).test(loc));
}

export function matchesWorkplace(job: SourceJob, q: Pick<DiscoverQuery, "location" | "workplace">): boolean {
  const places = localPlaces(q.location);
  if (q.workplace === "remote") return isRemote(job);
  if (q.workplace === "local") return isLocal(job, places);
  return isRemote(job) || isLocal(job, places);
}

export function searchTerms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/i)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t.length >= 2);
}

function haystacks(job: SourceJob) {
  return {
    title: job.title.toLowerCase(),
    company: job.company.toLowerCase(),
    rest: `${job.location || ""}\n${job.snippet || ""}\n${job.description_text || ""}`.toLowerCase(),
  };
}

/** Every search word must appear somewhere; title hits weigh most. 0 = no match. */
export function keywordScore(job: SourceJob, q: string): number {
  const terms = searchTerms(q);
  if (!terms.length) return 1;
  const h = haystacks(job);
  let score = 0;
  for (const t of terms) {
    if (h.title.includes(t)) score += 3;
    else if (h.company.includes(t)) score += 2;
    else if (h.rest.includes(t)) score += 1;
    else return 0;
  }
  return score;
}

export function matchesQuery(job: SourceJob, q: DiscoverQuery, now = Date.now()): boolean {
  if (q.internship && job.employment_type !== "internship") return false;
  if (q.categories.length && !q.categories.some((c) => job.categories.includes(c as never))) return false;
  if (q.days) {
    const t = job.posted_at ? Date.parse(job.posted_at) : NaN;
    if (Number.isNaN(t) || now - t > q.days * 86_400_000) return false;
  }
  if (!matchesWorkplace(job, q)) return false;
  return keywordScore(job, q.q) > 0;
}

const time = (j: SourceJob) => (j.posted_at ? Date.parse(j.posted_at) || 0 : 0);

export function sortJobs<T extends SourceJob>(jobs: T[], sort: SortKey, q: string): T[] {
  const byNewest = (a: T, b: T) => time(b) - time(a);
  if (sort === "relevance" && searchTerms(q).length) {
    const score = new Map(jobs.map((j) => [j, keywordScore(j, q)]));
    return [...jobs].sort((a, b) => score.get(b)! - score.get(a)! || byNewest(a, b));
  }
  return [...jobs].sort(byNewest);
}

/** Filter, sort and window a full list. */
export function windowList(all: SourceJob[], q: DiscoverQuery, offset: number, limit: number) {
  const matching = sortJobs(all.filter((j) => matchesQuery(j, q)), q.sort, q.q);
  return { items: matching.slice(offset, offset + limit), total: matching.length };
}
