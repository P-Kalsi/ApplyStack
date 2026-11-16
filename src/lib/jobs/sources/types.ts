// Pluggable job sources for Discover.
//
// A source turns a DiscoverQuery into one window of jobs (offset/limit) plus a
// total count. Sources with real paging (Adzuna) fetch only the pages a window
// needs; sources that only publish a whole list (Simplify's JSON file, a
// company's Greenhouse board) download it once into the cache and page it
// locally. To add a source (e.g. Job Bank Canada, JSearch), write one file
// that exports a JobSourcePlugin and add it to ALL_SOURCES in index.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedJob } from "../normalize";

export type Workplace = "both" | "local" | "remote";
/** How far around the searched place counts as local. */
export type Area = "city" | "region" | "country";
export type CareerLevel = "internship" | "early";
export type SortKey = "newest" | "relevance";

export interface DiscoverQuery {
  q: string;
  /** Free text, e.g. "Vancouver, BC". Empty = anywhere. */
  location: string;
  /** Adzuna's search radius for a city search. */
  radiusKm: number;
  /** City & nearby, the whole province/state, or the whole country. */
  area: Area;
  workplace: Workplace;
  /** Remote jobs open only to the US (for a search outside the US). */
  usRemote: boolean;
  /** Empty = every level. */
  levels: CareerLevel[];
  categories: string[];
  /** Only jobs posted within this many days. */
  days: number | null;
  sort: SortKey;
}

/** A job as a source returns it. `id` is set when it already lives in our jobs table. */
export type SourceJob = NormalizedJob & { snippet?: string | null; id?: string };

export interface SourceContext {
  supabase: SupabaseClient;
  userId: string;
  fetchImpl: typeof fetch;
}

export interface SourceStatus {
  ready: boolean;
  /** Why it's off, or how to turn it on. */
  message?: string;
}

export interface SourceWindow {
  items: SourceJob[];
  total: number;
}

export interface JobSourcePlugin {
  id: string;
  label: string;
  /** One line for the source picker / settings. */
  description: string;
  supports: {
    /** "native": the source ranks by relevance itself; "keyword": we rank by keyword match. */
    relevance: "native" | "keyword";
    /** Honours radiusKm (others match the city and its metro area). */
    radius: boolean;
  };
  status(ctx: SourceContext): SourceStatus | Promise<SourceStatus>;
  /**
   * Jobs [offset, offset + limit) for the query, in the query's sort order.
   * `chunk` is the page size the user is viewing; paging sources request
   * pages of that size so one screen costs one request.
   */
  fetchWindow(ctx: SourceContext, query: DiscoverQuery, offset: number, limit: number, chunk: number): Promise<SourceWindow>;
}
