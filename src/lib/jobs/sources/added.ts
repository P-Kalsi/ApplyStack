// Jobs you added yourself (Discover → Add job). They already live in the
// jobs table, so they're read from there.

import type { JobRow } from "../../types";
import { windowList } from "./filters";
import type { JobSourcePlugin, SourceJob } from "./types";

/** Sources of jobs you added yourself (Add job, paste import, bookmark button). */
export const ADDED_SOURCES = ["manual", "linkedin", "indeed", "glassdoor", "seed"];

export const addedSource: JobSourcePlugin = {
  id: "added",
  label: "Added by you",
  description: "Jobs you added: Add job, paste import, and the Send to ApplyStack bookmark (LinkedIn, Indeed, any site).",
  supports: { relevance: "keyword", radius: false },
  status() {
    return { ready: true };
  },
  async fetchWindow(ctx, query, offset, limit) {
    const { data, error } = await ctx.supabase
      .from("jobs")
      .select("*")
      .in("source", ADDED_SOURCES)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const rows = ((data || []) as JobRow[]).map((r) => ({ ...r, id: r.id }) as unknown as SourceJob);
    return windowList(rows, query, offset, limit);
  },
};
