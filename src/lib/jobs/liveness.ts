// Is a posting still open? Asked of the company's own job board API (the
// same public endpoints posting.ts reads descriptions from): Greenhouse,
// Lever, Ashby and Workday. Any other site gets "unknown"; ApplyStack never
// scrapes pages to guess. Idea adapted from career-ops' liveness gate
// (https://github.com/career-ops-hq/career-ops, MIT).

import { parsePostingUrl } from "./posting";
import type { CompanySource } from "./registry";
import type { JobRow } from "../types";

export type Liveness = "open" | "closed" | "unknown";

export interface LivenessResult {
  status: Liveness;
  message: string;
}

const HEADERS = { accept: "application/json", "user-agent": "ApplyStack (personal internship tracker)" };

async function get(url: string, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
}

const unknown = (message: string): LivenessResult => ({ status: "unknown", message });
const closed = (board: string): LivenessResult => ({
  status: "closed",
  message: `${board} says this posting is no longer open.`,
});
const open = (board: string): LivenessResult => ({ status: "open", message: `Still open on ${board}.` });

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Board jobs often link to the company's own careers site (Stripe's
 * stripe.com/jobs/search?gh_jid=...), which has no API. When the job came
 * from one of your company boards, rebuild the board's own posting link from
 * the board token and the posting id so it can still be checked.
 */
export function boardPostingUrl(
  job: Pick<JobRow, "source" | "source_id" | "company" | "url">,
  sources: CompanySource[]
): string | null {
  if (parsePostingUrl(job.url)) return job.url;
  if (!job.source_id) return null;
  const board = sources.find(
    (s) => s.kind === job.source && (norm(s.label || s.token) === norm(job.company) || norm(s.token) === norm(job.company))
  );
  if (!board) return null;
  const token = encodeURIComponent(board.token);
  const id = encodeURIComponent(job.source_id);
  if (board.kind === "greenhouse") return `https://boards.greenhouse.io/${token}/jobs/${id}`;
  if (board.kind === "lever") return `https://jobs.lever.co/${token}/${id}`;
  return `https://jobs.ashbyhq.com/${token}/${id}`;
}

export async function checkLiveness(rawUrl: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<LivenessResult> {
  const ref = parsePostingUrl(rawUrl);
  if (!ref) {
    return unknown(
      /indeed\.|linkedin\./i.test(rawUrl || "")
        ? "LinkedIn and Indeed can't be checked automatically. Open the link to see if it's still up."
        : "This site has no public job board API to ask. Open the link to see if it's still up."
    );
  }

  try {
    if (ref.kind === "greenhouse") {
      const res = await get(
        `https://boards-api${ref.eu ? ".eu" : ""}.greenhouse.io/v1/boards/${encodeURIComponent(ref.board)}/jobs/${ref.id}`,
        fetchImpl
      );
      if (res.status === 404) return closed("Greenhouse");
      return res.ok ? open("Greenhouse") : unknown(`Greenhouse answered HTTP ${res.status}; try again later.`);
    }

    if (ref.kind === "lever") {
      const res = await get(
        `https://api${ref.eu ? ".eu" : ""}.lever.co/v0/postings/${encodeURIComponent(ref.site)}/${ref.id}`,
        fetchImpl
      );
      if (res.status === 404) return closed("Lever");
      return res.ok ? open("Lever") : unknown(`Lever answered HTTP ${res.status}; try again later.`);
    }

    if (ref.kind === "ashby") {
      const res = await get(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.org)}?includeCompensation=false`,
        fetchImpl
      );
      if (res.status === 404) return closed("Ashby");
      if (!res.ok) return unknown(`Ashby answered HTTP ${res.status}; try again later.`);
      const data = (await res.json()) as { jobs?: { id: string; isListed?: boolean }[] };
      const job = (data.jobs ?? []).find((j) => j.id.toLowerCase() === ref.id.toLowerCase());
      return job && job.isListed !== false ? open("Ashby") : closed("Ashby");
    }

    // workday
    const res = await get(
      `${ref.origin}/wday/cxs/${encodeURIComponent(ref.tenant)}/${encodeURIComponent(ref.site)}/${ref.path}`,
      fetchImpl
    );
    if (res.status === 404 || res.status === 410) return closed("Workday");
    if (!res.ok) return unknown(`Workday answered HTTP ${res.status}; try again later.`);
    const data = (await res.json()) as { jobPostingInfo?: { canApply?: boolean } };
    if (!data.jobPostingInfo) return closed("Workday");
    return data.jobPostingInfo.canApply === false ? closed("Workday") : open("Workday");
  } catch (err) {
    return unknown(`Couldn't reach the job board (${err instanceof Error ? err.message : String(err)}).`);
  }
}
