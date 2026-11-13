// Turn a job page you copied (paste) or sent (bookmark button) into a job.
//
// The AI only *locates* things: it names the company, title and location and
// quotes the first and last words of the description. ApplyStack then checks
// every value against the page text and cuts the description out of the
// original text itself, so nothing is reworded or invented. Anything the
// page doesn't contain is left blank for you. Pure and unit-tested; the AI call
// lives in src/lib/ai/page-extract.ts.

export interface PageCapture {
  url: string;
  /** The browser tab title (document.title), when the bookmark sent it. */
  title: string;
  /** Visible page text or your paste. */
  text: string;
}

export interface AiLocated {
  company: string;
  title: string;
  location: string;
  description_start: string;
  description_end: string;
}

export interface ExtractedJob {
  company: string;
  title: string;
  location: string;
  description: string;
  url: string;
  site: string | null;
  method: "ai" | "basic";
  notes: string[];
}

export const MAX_CAPTURE_CHARS = 60_000;

export function siteOf(url: string): "linkedin" | "indeed" | "glassdoor" | null {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (/(^|\.)linkedin\.com$/.test(host)) return "linkedin";
  if (/(^|\.)indeed\.(com|ca|co\.[a-z]{2}|[a-z]{2})$/.test(host)) return "indeed";
  if (/(^|\.)glassdoor\.(com|ca|co\.[a-z]{2}|[a-z]{2})$/.test(host)) return "glassdoor";
  return null;
}

/**
 * One stable link per job, so sending the same job twice updates it instead of
 * duplicating it. LinkedIn search pages carry the job in currentJobId; Indeed
 * uses jk / vjk.
 */
export function canonicalJobUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  const site = siteOf(u.toString());
  if (site === "linkedin") {
    const id = u.searchParams.get("currentJobId") || u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/)?.[1];
    if (id) return `https://www.linkedin.com/jobs/view/${id}/`;
  }
  if (site === "indeed") {
    const jk = u.searchParams.get("jk") || u.searchParams.get("vjk");
    if (jk && /^[0-9a-f]{8,}$/i.test(jk)) return `https://${u.hostname.toLowerCase()}/viewjob?jk=${jk}`;
  }
  return u.toString();
}

export const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case- and whitespace-insensitive "does the page contain this?" */
export function foundIn(haystack: string, value: string): boolean {
  const v = squash(value).toLowerCase();
  return v.length > 0 && squash(haystack).toLowerCase().includes(v);
}

function markerRegex(marker: string): RegExp | null {
  const words = squash(marker).split(" ").filter(Boolean);
  if (words.length < 2) return null;
  return new RegExp(words.map(esc).join("\\s+"), "i");
}

/**
 * Cut the description out of the original text between the quoted start and
 * end words (inclusive). Returns null if the start can't be found.
 */
export function sliceByMarkers(text: string, start: string, end: string): string | null {
  const s = markerRegex(start);
  if (!s) return null;
  const m = s.exec(text);
  if (!m) return null;
  const from = m.index;
  let to = text.length;
  const e = markerRegex(end);
  if (e) {
    // The first occurrence of the end words after the start (pages sometimes
    // repeat the description further down).
    const hit = e.exec(text.slice(from + m[0].length));
    if (hit) to = from + m[0].length + hit.index + hit[0].length;
  }
  return tidy(text.slice(from, to));
}

/** Normalise line breaks without changing any words. */
export function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const START_MARKERS = [/about the job/i, /full job description/i, /job description/i, /about the role/i, /description\n/i];
const END_MARKERS = [
  /\n\s*show less\b/i,
  /\n\s*set alert for similar jobs/i,
  /\n\s*seniority level\b/i,
  /\n\s*report (this )?job\b/i,
  /\n\s*meet the hiring team/i,
  /\n\s*people also viewed/i,
  /\n\s*similar jobs\b/i,
  /\n\s*see more jobs\b/i,
  /\n\s*hiring insights/i,
  /\n\s*job activity\b/i,
];

/** Description without AI: from the site's "About the job" heading to its footer. */
export function basicDescription(text: string): string {
  let body = text;
  for (const re of START_MARKERS) {
    const m = re.exec(text);
    if (m) {
      body = text.slice(m.index + m[0].length);
      break;
    }
  }
  let cut = body.length;
  for (const re of END_MARKERS) {
    const m = re.exec(body);
    if (m && m.index < cut) cut = m.index;
  }
  return tidy(body.slice(0, cut));
}

/** Title, company and location from the tab title, without AI. */
export function basicFromTitle(capture: PageCapture): { title: string; company: string; location: string } {
  const t = squash(capture.title.replace(/^\(\d+\)\s*/, ""));
  const site = siteOf(capture.url);
  const out = { title: "", company: "", location: "" };
  if (!t) return out;
  if (site === "linkedin") {
    // "Software Engineer Intern | Clio | LinkedIn" (search pages: "... Jobs | LinkedIn")
    const parts = t.split(" | ");
    if (parts.length >= 3 && !/\bjobs\b/i.test(parts[0])) {
      out.title = parts[0];
      out.company = parts[1];
    }
  } else if (site === "indeed") {
    // "Software Developer Intern - Vancouver, BC - Indeed.com"
    const parts = t.split(" - ");
    if (parts.length >= 3 && /indeed/i.test(parts.at(-1)!)) {
      out.title = parts[0];
      out.location = parts.slice(1, -1).join(" - ");
    }
  } else {
    out.title = t.split(/ [|–-] /)[0];
  }
  return out;
}

export function basicExtract(capture: PageCapture, note?: string): ExtractedJob {
  const fromTitle = basicFromTitle(capture);
  const notes = note ? [note] : [];
  const description = basicDescription(capture.text);
  if (!fromTitle.company) notes.push("Couldn't tell the company; please fill it in.");
  return {
    ...fromTitle,
    description,
    url: canonicalJobUrl(capture.url),
    site: siteOf(capture.url),
    method: "basic",
    notes,
  };
}

/**
 * Check the AI's answer against the page. Values the page doesn't contain are
 * dropped; the description is cut from the original text by its markers.
 */
export function applyLocated(capture: PageCapture, ai: AiLocated): ExtractedJob {
  const page = `${capture.title}\n${capture.text}`;
  const notes: string[] = [];
  const keep = (label: string, value: string) => {
    const v = squash(value || "");
    if (!v) return "";
    if (foundIn(page, v)) return v;
    notes.push(`The AI's ${label} ("${v.slice(0, 60)}") isn't on the page, so it was left blank.`);
    return "";
  };
  const company = keep("company", ai.company);
  const title = keep("job title", ai.title);
  const location = keep("location", ai.location);

  let description = sliceByMarkers(capture.text, ai.description_start, ai.description_end);
  if (!description || description.length < 80) {
    description = basicDescription(capture.text);
    notes.push("Couldn't pin down exactly where the description starts and ends; check its first and last lines.");
  }
  const fromTitle = basicFromTitle(capture);
  return {
    company: company || fromTitle.company,
    title: title || fromTitle.title,
    location: location || fromTitle.location,
    description,
    url: canonicalJobUrl(capture.url),
    site: siteOf(capture.url),
    method: "ai",
    notes,
  };
}
