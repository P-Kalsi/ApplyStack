// Lever Postings API adapter.
// Public API: https://api.lever.co/v0/postings/{site}?mode=json
// Maps external postings into the internal NormalizedJob type.

import { buildNormalizedJob, type NormalizedJob } from "../normalize";

export interface LeverPosting {
  id: string;
  text: string; // title
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number; // epoch ms
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    department?: string;
  };
  descriptionPlain?: string;
  description?: string; // HTML
  lists?: { text: string; content: string }[]; // content is HTML <li> items
}

function listsToText(lists: LeverPosting["lists"]): string {
  if (!lists?.length) return "";
  return lists
    .map((l) => {
      const items = (l.content || "")
        .split(/<\/li>/i)
        .map((chunk) => chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((t) => `- ${t}`)
        .join("\n");
      return `${l.text}\n${items}`;
    })
    .join("\n\n");
}

export function mapLeverPosting(
  raw: LeverPosting,
  site: string,
  companyLabel?: string
): NormalizedJob {
  const commitment = raw.categories?.commitment || "";
  const textParts = [raw.descriptionPlain || "", listsToText(raw.lists), commitment];
  const description = textParts.filter(Boolean).join("\n\n").trim() || null;
  return buildNormalizedJob({
    source: "lever",
    source_id: raw.id,
    company: companyLabel || site,
    title: raw.text || "Untitled role",
    location: raw.categories?.location ?? null,
    url: raw.hostedUrl ?? raw.applyUrl ?? null,
    description_html: raw.description ?? null,
    description_text: description,
    posted_at: raw.createdAt ? new Date(raw.createdAt).toISOString() : null,
  });
}

export async function fetchLeverJobs(
  site: string,
  companyLabel?: string,
  fetchImpl: typeof fetch = fetch
): Promise<NormalizedJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`;
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Lever site "${site}" returned ${res.status}`);
  }
  const data = (await res.json()) as LeverPosting[];
  return (Array.isArray(data) ? data : []).map((p) => mapLeverPosting(p, site, companyLabel));
}
