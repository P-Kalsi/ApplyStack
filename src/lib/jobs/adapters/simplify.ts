// Simplify internship list adapter.
//
// SimplifyJobs publishes its community-maintained internship list on GitHub as
// one public JSON file (the data behind github.com/SimplifyJobs/Summer2027-Internships).
// Listings carry company, title, locations, terms, category and the apply link,
// but no job description; descriptions are fetched separately (see ../posting.ts)
// or pasted by the user.
//
// Pure mapping/filtering lives here so it can be unit-tested; fetchSimplifyListings
// is the only network call.

import { buildNormalizedJob, type NormalizedJob } from "../normalize";
import type { JobCategory } from "../../types";

export const DEFAULT_SIMPLIFY_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json";

export interface SimplifyListing {
  id: string;
  company_name: string;
  title: string;
  url: string;
  locations: string[];
  terms?: string[];
  category?: string;
  active: boolean;
  is_visible?: boolean;
  date_posted?: number; // epoch seconds
  date_updated?: number;
  source?: string;
  sponsorship?: string;
  degrees?: string[];
}

export const FEED_REGIONS = ["Canada", "United States", "Remote"] as const;
export type FeedRegion = (typeof FEED_REGIONS)[number];

export const FEED_CATEGORIES = ["Software", "AI/ML/Data", "Hardware", "Product", "Quant"] as const;
export type FeedCategory = (typeof FEED_CATEGORIES)[number];

/** "Term not listed" in the UI; Simplify writes "N/A". */
export const TERM_NOT_LISTED = "N/A";

export interface FeedFilter {
  regions: FeedRegion[];
  /** Empty = any term. Include TERM_NOT_LISTED to keep listings without one. */
  terms: string[];
  categories: FeedCategory[];
}

const CANADA_RE =
  /\bCanada\b|,\s*(ON|BC|AB|QC|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b|\b(Toronto|Vancouver|Montreal|Montréal|Ottawa|Waterloo|Calgary|Edmonton|Burnaby|Markham|Mississauga|Victoria|Halifax|Winnipeg)\b/i;
const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_RE = new RegExp(`\\b(USA|United States|U\\.S\\.)\\b|,\\s*(${US_STATES})\\b`);
const REMOTE_RE = /\bremote\b/i;

export function locationRegions(location: string): FeedRegion[] {
  const out: FeedRegion[] = [];
  if (CANADA_RE.test(location)) out.push("Canada");
  if (US_RE.test(location) && !/\bCanada\b/i.test(location)) out.push("United States");
  if (REMOTE_RE.test(location)) out.push("Remote");
  return out;
}

/** True when the listing is open and passes every part of the filter. */
export function matchesFeed(l: SimplifyListing, f: FeedFilter): boolean {
  if (!l.active || l.is_visible === false) return false;
  if (!l.url || !l.title || !l.company_name) return false;

  if (f.regions.length) {
    const regions = new Set((l.locations || []).flatMap(locationRegions));
    if (!f.regions.some((r) => regions.has(r))) return false;
  }
  if (f.terms.length) {
    const terms = (l.terms || []).length ? l.terms! : [TERM_NOT_LISTED];
    if (!terms.some((t) => f.terms.includes(t))) return false;
  }
  if (f.categories.length && !f.categories.includes((l.category || "") as FeedCategory)) return false;
  return true;
}

/** Locations to show: the ones in the chosen regions first, then the rest. */
export function pickLocation(l: SimplifyListing, regions: FeedRegion[]): string | null {
  const locs = (l.locations || []).filter(Boolean);
  if (!locs.length) return null;
  const preferred = regions.length
    ? locs.filter((loc) => locationRegions(loc).some((r) => regions.includes(r)))
    : [];
  const ordered = [...preferred, ...locs.filter((x) => !preferred.includes(x))];
  return ordered.length > 3 ? `${ordered.slice(0, 3).join(" / ")} +${ordered.length - 3} more` : ordered.join(" / ");
}

/** Drop Simplify's tracking parameters from apply links. */
export function cleanApplyUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "ref"]) {
      if (/simplify/i.test(u.searchParams.get(k) || "")) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url;
  }
}

const CATEGORY_MAP: Record<string, JobCategory[]> = {
  Software: ["software-engineering"],
  "AI/ML/Data": ["ai-ml", "data"],
};

export function mapSimplifyListing(l: SimplifyListing, regions: FeedRegion[] = []): NormalizedJob {
  const job = buildNormalizedJob({
    source: "simplify",
    source_id: l.id,
    company: l.company_name,
    title: l.title,
    location: pickLocation(l, regions),
    url: cleanApplyUrl(l.url),
    posted_at: l.date_posted ? new Date(l.date_posted * 1000).toISOString() : null,
  });
  // It's an internship list, whatever the title says. Without a description we
  // only know the work mode when the location says so.
  job.employment_type = "internship";
  const loc = (job.location || "").toLowerCase();
  job.work_mode = /remote/.test(loc) ? "remote" : /hybrid/.test(loc) ? "hybrid" : "unknown";
  const extra = CATEGORY_MAP[l.category || ""] ?? [];
  job.categories = Array.from(new Set([...job.categories, ...extra]));
  return job;
}

export function filterAndMap(listings: SimplifyListing[], f: FeedFilter): NormalizedJob[] {
  return listings.filter((l) => matchesFeed(l, f)).map((l) => mapSimplifyListing(l, f.regions));
}

export function simplifyUrl(): string {
  return process.env.SIMPLIFY_LISTINGS_URL || DEFAULT_SIMPLIFY_URL;
}

export async function fetchSimplifyListings(fetchImpl: typeof fetch = fetch): Promise<SimplifyListing[]> {
  const res = await fetchImpl(simplifyUrl(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Simplify list returned HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("Simplify list was not a JSON array");
  return data as SimplifyListing[];
}

/** The next `count` terms starting with the current season, e.g. Fall 2026, Winter 2027, ... */
export function upcomingTerms(now = new Date(), count = 8): string[] {
  const seasons = ["Winter", "Spring", "Summer", "Fall"] as const;
  // Winter Jan-Apr, Spring May-Jun, Summer Jul-Aug, Fall Sep-Dec
  const m = now.getMonth();
  let idx = m <= 3 ? 0 : m <= 5 ? 1 : m <= 7 ? 2 : 3;
  let year = now.getFullYear();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${seasons[idx]} ${year}`);
    idx++;
    if (idx === 4) {
      idx = 0;
      year++;
    }
  }
  return out;
}
