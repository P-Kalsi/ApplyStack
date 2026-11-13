// Jobs you added yourself (Discover → Add job). They already live in the
// jobs table, so they're read from there.

import type { JobRow } from "../../types";
import { windowList } from "./filters";
import type { JobSourcePlugin, SourceJob } from "./types";

export const addedSource: JobSourcePlugin = {
  id: "added",
  label: "Added by you",
  description: "Postings you added with Add job (any site, including Indeed and LinkedIn).",
  supports: { relevance: "keyword", radius: false },
  status() {
    return { ready: true };
  },
  async fetchWindow(ctx, query, offset, limit) {
    const { data, error } = await ctx.supabase
      .from("jobs")
      .select("*")
      .in("source", ["manual", "seed"])
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const rows = ((data || []) as JobRow[]).map((r) => ({ ...r, id: r.id }) as unknown as SourceJob);
    return windowList(rows, query, offset, limit);
  },
};
