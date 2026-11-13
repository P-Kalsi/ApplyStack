// Discover URL parameters <-> query. Pure, shared by the page and the filter bar.

import type { DiscoverQuery, SortKey, Workplace } from "./types";

export const DEFAULT_LOCATION = "Vancouver, BC";
export const DEFAULT_RADIUS_KM = 25;
export const PER_PAGE_OPTIONS = [10, 25, 50] as const;
export const DEFAULT_PER_PAGE = 25;
export const RADIUS_OPTIONS = [10, 25, 50, 100] as const;

export interface DiscoverParams {
  query: DiscoverQuery;
  source: string;
  page: number;
  perPage: number;
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseDiscoverParams(raw: Raw): DiscoverParams {
  const loc = one(raw.location);
  const radius = Number(one(raw.radius));
  const per = Number(one(raw.per));
  const page = Number(one(raw.page));
  const days = Number(one(raw.days));
  const work = one(raw.work);
  const sort = one(raw.sort);
  return {
    query: {
      q: (one(raw.q) || "").slice(0, 200),
      location: loc === undefined ? DEFAULT_LOCATION : loc.slice(0, 120),
      radiusKm: RADIUS_OPTIONS.includes(radius as never) ? radius : DEFAULT_RADIUS_KM,
      workplace: (["both", "local", "remote"].includes(work || "") ? work : "both") as Workplace,
      internship: one(raw.internship) === "1",
      categories: (one(raw.cats) || "").split(",").filter(Boolean).slice(0, 12),
      days: days > 0 && days <= 60 ? days : null,
      sort: (sort === "relevance" ? "relevance" : "newest") as SortKey,
    },
    source: (one(raw.source) || "all").replace(/[^a-z0-9_]/g, "") || "all",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 1000) : 1,
    perPage: PER_PAGE_OPTIONS.includes(per as never) ? per : DEFAULT_PER_PAGE,
  };
}

/** Page numbers to show: 1 … p-2 p-1 [p] p+1 p+2 … last. */
export function pageList(page: number, last: number): (number | "…")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, page - 2);
  const to = Math.min(last - 1, page + 2);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < last - 1) out.push("…");
  out.push(last);
  return out;
}

export function showingText(page: number, perPage: number, shown: number, total: number): string {
  if (!total || !shown) return "No jobs match these filters";
  const from = (page - 1) * perPage + 1;
  const to = from + shown - 1;
  return `Showing ${from}–${to} of ${total.toLocaleString("en-CA")} job${total === 1 ? "" : "s"}`;
}
