// Company boards you added in Settings (Greenhouse board tokens, Lever sites).
// Each board API returns the whole board, so boards are cached for 30 minutes
// and paged here.

import { dedupeJobs } from "../dedupe";
import { fetchGreenhouseJobs } from "../adapters/greenhouse";
import { fetchLeverJobs } from "../adapters/lever";
import { loadSources } from "../../db/jobs";
import { cached } from "./cache";
import { windowList } from "./filters";
import type { JobSourcePlugin, SourceJob } from "./types";

const BOARD_TTL_MS = 30 * 60_000;

export const boardsSource: JobSourcePlugin = {
  id: "boards",
  label: "Company boards",
  description: "Greenhouse and Lever boards you added in Settings → Company boards.",
  supports: { relevance: "keyword", radius: false },
  async status(ctx) {
    const sources = await loadSources(ctx.supabase, ctx.userId);
    return sources.length ? { ready: true } : { ready: false, message: "No company boards added (Settings → Company boards)." };
  },
  async fetchWindow(ctx, query, offset, limit) {
    const sources = await loadSources(ctx.supabase, ctx.userId);
    const failures: string[] = [];
    const lists = await Promise.all(
      sources.map((s) =>
        cached(`boards:${s.kind}:${s.token.toLowerCase()}:${s.label ?? ""}`, BOARD_TTL_MS, () =>
          s.kind === "greenhouse"
            ? fetchGreenhouseJobs(s.token, s.label, ctx.fetchImpl)
            : fetchLeverJobs(s.token, s.label, ctx.fetchImpl)
        ).catch((err) => {
          failures.push(err instanceof Error ? err.message : String(err));
          return [] as SourceJob[];
        })
      )
    );
    const all = dedupeJobs(lists.flat()) as SourceJob[];
    if (failures.length && !all.length) throw new Error(failures.join(" · "));
    return windowList(all, query, offset, limit);
  },
};
