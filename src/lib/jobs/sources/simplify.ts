// Simplify's internship list. It's published as one JSON file, so it is
// downloaded once (re-checked every 30 minutes with an ETag) and paged here.

import { fetchSimplifyListings, filterAndMap } from "../adapters/simplify";
import { feedFilter, loadFeedSettings } from "../feed-settings";
import { cached } from "./cache";
import { windowList } from "./filters";
import type { JobSourcePlugin, SourceJob } from "./types";

const LIST_TTL_MS = 30 * 60_000;

async function allJobs(fetchImpl: typeof fetch): Promise<SourceJob[]> {
  const filter = feedFilter(loadFeedSettings());
  const listings = await cached("simplify:list", LIST_TTL_MS, () => fetchSimplifyListings(fetchImpl));
  // The Settings filters (regions, terms, kinds of role) pick what the feed contains.
  return cached(`simplify:mapped:${JSON.stringify(filter)}`, LIST_TTL_MS, async () => filterAndMap(listings, filter));
}

export const simplifySource: JobSourcePlugin = {
  id: "simplify",
  label: "Simplify internships",
  description: "Simplify's community internship list (filters in Settings → Internship feed & alerts).",
  supports: { relevance: "keyword", radius: false },
  status() {
    return loadFeedSettings().simplify.enabled
      ? { ready: true }
      : { ready: false, message: "Turned off in Settings → Internship feed & alerts." };
  },
  async fetchWindow(ctx, query, offset, limit) {
    return windowList(await allJobs(ctx.fetchImpl), query, offset, limit);
  },
};
