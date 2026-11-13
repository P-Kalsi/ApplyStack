// Source registry + one page of Discover across one or all sources.

import { adzunaSource } from "./adzuna";
import { addedSource } from "./added";
import { boardsSource } from "./boards";
import { simplifySource } from "./simplify";
import { sortJobs } from "./filters";
import type { DiscoverQuery, JobSourcePlugin, SourceContext, SourceJob } from "./types";

export type { DiscoverQuery, JobSourcePlugin, SourceContext, SourceJob } from "./types";

/** Add new sources (Job Bank Canada, JSearch, ...) here. Order = picker order. */
export const ALL_SOURCES: JobSourcePlugin[] = [simplifySource, adzunaSource, boardsSource, addedSource];

export function getSource(id: string): JobSourcePlugin | undefined {
  return ALL_SOURCES.find((s) => s.id === id);
}

export { SOURCE_BADGES, sourceBadge } from "./badges";

export interface SourceSummary {
  id: string;
  label: string;
  ready: boolean;
  message?: string;
  total?: number;
  error?: string;
}

export interface DiscoverPage {
  items: SourceJob[];
  total: number;
  page: number;
  perPage: number;
  sources: SourceSummary[];
}

export async function sourceStatuses(ctx: SourceContext): Promise<SourceSummary[]> {
  return Promise.all(
    ALL_SOURCES.map(async (s) => {
      try {
        const st = await s.status(ctx);
        return { id: s.id, label: s.label, ready: st.ready, message: st.message };
      } catch (err) {
        return { id: s.id, label: s.label, ready: false, message: err instanceof Error ? err.message : String(err) };
      }
    })
  );
}

/**
 * One page of results. A single source fetches exactly that page. "all" asks
 * each ready source for its first page*perPage jobs (cached, so moving to the
 * next page only fetches the new page), merges them in sort order and takes
 * the requested page. One failing source never hides the others.
 */
export async function fetchDiscoverPage(
  ctx: SourceContext,
  query: DiscoverQuery,
  sourceId: string,
  page: number,
  perPage: number
): Promise<DiscoverPage> {
  const statuses = await sourceStatuses(ctx);
  const chosen = sourceId === "all" ? ALL_SOURCES : ALL_SOURCES.filter((s) => s.id === sourceId);
  const active = chosen.filter((s) => statuses.find((x) => x.id === s.id)?.ready);
  const offset = (page - 1) * perPage;

  const windows = await Promise.allSettled(
    active.map((s) =>
      sourceId === "all"
        ? s.fetchWindow(ctx, query, 0, offset + perPage, perPage)
        : s.fetchWindow(ctx, query, offset, perPage, perPage)
    )
  );

  const summaries = statuses.map((st) => ({ ...st }) as SourceSummary);
  let total = 0;
  const pools: SourceJob[] = [];
  windows.forEach((w, i) => {
    const sum = summaries.find((x) => x.id === active[i].id)!;
    if (w.status === "fulfilled") {
      sum.total = w.value.total;
      total += w.value.total;
      pools.push(...w.value.items);
    } else {
      sum.error = w.reason instanceof Error ? w.reason.message : String(w.reason);
    }
  });

  let items: SourceJob[];
  if (sourceId === "all") {
    const seen = new Set<string>();
    const merged = pools.filter((j) => (seen.has(j.dedupe_key) ? false : (seen.add(j.dedupe_key), true)));
    items = sortJobs(merged, query.sort, query.q).slice(offset, offset + perPage);
  } else {
    items = pools;
  }
  return { items, total, page, perPage, sources: summaries };
}
