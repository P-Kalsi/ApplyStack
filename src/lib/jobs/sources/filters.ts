// Filtering and sorting for sources that publish a whole list. Pure, tested.

import type { Area, DiscoverQuery, SortKey, SourceJob } from "./types";
import { metroOf, parsePlace, parseSearchPlace, type Country, type Place, type SearchPlace } from "../geo";
import { careerLevel } from "../normalize";

/**
 * Is the job somewhere you're searching? Places are read as city, province
 * or state and country (see geo.ts), so "BC" and "British Columbia" are the
 * same and "Canada" means the whole country.
 *   local   in the searched area (city & nearby, province, or country)
 *   remote  remote and open to your country (or North America / anywhere /
 *           no country stated); US-only remote only when you include it
 * No location = anywhere.
 */
export function matchesWorkplace(
  job: Pick<SourceJob, "location" | "work_mode">,
  q: Pick<DiscoverQuery, "location" | "workplace" | "area" | "usRemote">
): boolean {
  const search = parseSearchPlace(q.location);
  const workplace = search.remote ? "remote" : q.workplace;
  const place = parsePlace(job.location);
  const remote = isRemote(job, place);
  if (search.level === "none") return workplace === "remote" ? remote && remoteOpenTo(place, null, q.usRemote) : true;
  const local = inArea(job.location, place, search, q.area);
  const openRemote = remote && remoteOpenTo(place, search.country, q.usRemote);
  if (workplace === "local") return local;
  if (workplace === "remote") return openRemote || (remote && local);
  return local || openRemote;
}

/** Remote by its location ("Remote", "Toronto (Remote)"); the description only counts when there's no location. */
export function isRemote(job: Pick<SourceJob, "location" | "work_mode">, place: Place = parsePlace(job.location)): boolean {
  return place.remote || (!(job.location || "").trim() && job.work_mode === "remote");
}

/** Can someone in `country` take this remote job? */
export function remoteOpenTo(place: Place, country: Country | null, usRemote: boolean): boolean {
  // "Remote", "Remote - North America", "Anywhere": no country restriction. "U.S. Anywhere" is still US-only.
  if (place.countries.size === 0) return true;
  const home = country ?? "CA";
  if (place.countries.has(home)) return true;
  return home !== "US" && usRemote && place.countries.has("US");
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function inArea(raw: string | null, place: Place, search: SearchPlace, area: Area): boolean {
  // Searching a province or a country can't be narrowed to a city.
  const level = search.level === "country" ? "country" : search.level === "region" && area === "city" ? "region" : area;
  // A place in another country is never local (Richmond, VA is not Richmond, BC).
  if (search.country && place.countries.size && !place.countries.has(search.country)) return false;
  if (level === "city") {
    if (search.unknown) return new RegExp(`(^|[^a-z])${esc(search.unknown)}([^a-z]|$)`, "i").test(raw || "");
    return metroOf(search.city!).some((c) => place.cities.has(c));
  }
  if (level === "region") return Boolean(search.region && place.regions.has(search.region));
  return Boolean(search.country && place.countries.has(search.country));
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
  if (q.levels.length) {
    const level = careerLevel(job);
    if (!level || !q.levels.includes(level)) return false;
  }
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
