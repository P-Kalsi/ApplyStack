// Fetch one posting's full description from its apply link.
//
// Supported links and the public endpoint each one uses (the same data the
// company's own careers page loads; no login, nothing bypassed):
//   Greenhouse  boards.greenhouse.io/{board}/jobs/{id}     Job Board API
//   Lever       jobs.lever.co/{site}/{id}                  Postings API
//   Ashby       jobs.ashbyhq.com/{org}/{id}                Posting API
//   Workday     {tenant}.wdN.myworkdayjobs.com/{site}/job/...   the careers site's job JSON
// Workday is only used for one posting at a time, when you ask for it.

import { htmlToText, normalizeLocation } from "./normalize";
import { mapGreenhouseJob, type GreenhouseJob } from "./adapters/greenhouse";
import { mapLeverPosting, type LeverPosting } from "./adapters/lever";

export type PostingRef =
  | { kind: "greenhouse"; board: string; id: string; eu: boolean }
  | { kind: "lever"; site: string; id: string; eu: boolean }
  | { kind: "ashby"; org: string; id: string }
  | { kind: "workday"; origin: string; tenant: string; site: string; path: string };

export interface FetchedPosting {
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description_html: string | null;
  description_text: string;
  posted_at: string | null;
}

const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

export function parsePostingUrl(raw: string | null | undefined): PostingRef | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));

  if (/^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(host)) {
    const eu = host.includes(".eu.");
    if (parts[0] === "embed") {
      const id = u.searchParams.get("token");
      const board = u.searchParams.get("for");
      return id && board && /^\d+$/.test(id) ? { kind: "greenhouse", board, id, eu } : null;
    }
    if (parts.length >= 3 && parts[1] === "jobs" && /^\d+$/.test(parts[2])) {
      return { kind: "greenhouse", board: parts[0], id: parts[2], eu };
    }
    return null;
  }

  if (/^jobs(\.eu)?\.lever\.co$/.test(host)) {
    if (parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[1])) {
      return { kind: "lever", site: parts[0], id: parts[1], eu: host.includes(".eu.") };
    }
    return null;
  }

  if (host === "jobs.ashbyhq.com") {
    if (parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[1])) {
      return { kind: "ashby", org: parts[0], id: parts[1] };
    }
    return null;
  }

  const wd = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (wd) {
    const rest = LOCALE_RE.test(parts[0] || "") ? parts.slice(1) : parts;
    const jobIdx = rest.indexOf("job");
    if (jobIdx >= 1 && rest.length > jobIdx + 1) {
      return {
        kind: "workday",
        origin: `${u.protocol}//${host}`,
        tenant: wd[1],
        site: rest[jobIdx - 1],
        path: rest.slice(jobIdx).map(encodeURIComponent).join("/"),
      };
    }
    return null;
  }
  return null;
}

export function canFetchDescription(url: string | null | undefined): boolean {
  return parsePostingUrl(url) !== null;
}

/** Links whose descriptions can be pulled in bulk during a refresh (official public APIs). */
export function canBulkFetch(url: string | null | undefined): boolean {
  const ref = parsePostingUrl(url);
  return ref !== null && ref.kind !== "workday";
}

const HEADERS = { accept: "application/json", "user-agent": "ApplyStack (personal internship tracker)" };

async function getJson(url: string, fetchImpl: typeof fetch, what: string): Promise<unknown> {
  const res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) throw new Error(`${what}: this posting no longer exists (404).`);
  if (!res.ok) throw new Error(`${what} returned HTTP ${res.status}.`);
  return res.json();
}

export async function fetchPosting(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<FetchedPosting> {
  const ref = parsePostingUrl(rawUrl);
  if (!ref) {
    throw new Error(
      /indeed\.|linkedin\./i.test(rawUrl)
        ? "Indeed and LinkedIn don't let apps read their postings (no public API, and scraping breaks their terms). Copy the description from the posting and paste it below."
        : "ApplyStack can't read descriptions from this site automatically. Paste the description instead."
    );
  }

  if (ref.kind === "greenhouse") {
    const api = `https://boards-api${ref.eu ? ".eu" : ""}.greenhouse.io/v1/boards/${encodeURIComponent(ref.board)}/jobs/${ref.id}`;
    const data = (await getJson(api, fetchImpl, "Greenhouse")) as GreenhouseJob;
    const job = mapGreenhouseJob(data, ref.board);
    return {
      title: job.title,
      company: data.company_name ?? null,
      location: job.location,
      url: job.url ?? rawUrl,
      description_html: job.description_html,
      description_text: job.description_text ?? "",
      posted_at: job.posted_at,
    };
  }

  if (ref.kind === "lever") {
    const api = `https://api${ref.eu ? ".eu" : ""}.lever.co/v0/postings/${encodeURIComponent(ref.site)}/${ref.id}`;
    const data = (await getJson(api, fetchImpl, "Lever")) as LeverPosting;
    const job = mapLeverPosting(data, ref.site);
    return {
      title: job.title,
      company: null,
      location: job.location,
      url: job.url ?? rawUrl,
      description_html: job.description_html,
      description_text: job.description_text ?? "",
      posted_at: job.posted_at,
    };
  }

  if (ref.kind === "ashby") {
    const api = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.org)}?includeCompensation=false`;
    const data = (await getJson(api, fetchImpl, "Ashby")) as {
      jobs?: {
        id: string;
        title: string;
        location?: string;
        descriptionHtml?: string;
        descriptionPlain?: string;
        jobUrl?: string;
        publishedAt?: string;
      }[];
    };
    const job = (data.jobs ?? []).find((j) => j.id === ref.id);
    if (!job) throw new Error("Ashby: this posting is no longer on the company's job board.");
    const html = job.descriptionHtml ?? null;
    return {
      title: job.title,
      company: null,
      location: normalizeLocation(job.location),
      url: job.jobUrl ?? rawUrl,
      description_html: html,
      description_text: job.descriptionPlain?.trim() || (html ? htmlToText(html) : ""),
      posted_at: job.publishedAt ?? null,
    };
  }

  // workday
  const api = `${ref.origin}/wday/cxs/${encodeURIComponent(ref.tenant)}/${encodeURIComponent(ref.site)}/${ref.path}`;
  const data = (await getJson(api, fetchImpl, "Workday")) as {
    jobPostingInfo?: {
      title?: string;
      jobDescription?: string;
      location?: string;
      additionalLocations?: string[];
      startDate?: string;
      externalUrl?: string;
    };
    hiringOrganization?: { name?: string };
  };
  const info = data.jobPostingInfo;
  if (!info?.jobDescription) throw new Error("Workday: the posting had no description.");
  const locs = [info.location, ...(info.additionalLocations ?? [])].filter(Boolean) as string[];
  return {
    title: info.title || "Untitled role",
    company: data.hiringOrganization?.name ?? null,
    location: normalizeLocation(locs.join(" / ")),
    url: info.externalUrl || rawUrl,
    description_html: info.jobDescription,
    description_text: htmlToText(info.jobDescription),
    posted_at: info.startDate ? new Date(info.startDate).toISOString() : null,
  };
}
