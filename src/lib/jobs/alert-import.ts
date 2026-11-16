// Read jobs out of a pasted LinkedIn or Indeed job-alert email. You paste the
// email you already received; nothing is fetched from LinkedIn or Indeed.
// Idea adapted from career-ops' LinkedIn alert import
// (https://github.com/career-ops-hq/career-ops, MIT).
//
// With links (a plain-text copy keeps them), each job is anchored to its
// link and the lines just before it give title, company and location. Without
// links (copying the rendered email drops them), jobs are read as blocks of
// title / company / location lines. You review and edit the list before
// anything is added. Pure and unit-tested.

import { canonicalJobUrl } from "./page-import";

export interface AlertJob {
  title: string;
  company: string;
  location: string;
  url: string | null;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
/** Non-global twin of URL_RE for .test(): a global regex keeps state between calls. */
const HAS_URL = /https?:\/\/\S/i;
const JOB_URL_RE = /linkedin\.com\/(?:comm\/)?jobs\/view\/|indeed\.[a-z.]+\/.*[?&](?:jk|vjk)=/i;

const NOISE = [
  /^view (?:job|all|similar|more)/i,
  /^(?:easy )?apply(?: now)?$/i,
  /^(?:actively recruiting|promoted|be an early applicant|new|urgently hiring|easily apply|responsive employer)\b/i,
  /^see (?:all|more) jobs/i,
  /^your job alert/i,
  /\bjob alert\b/i,
  /^\d+\s+(?:alumni|connections?|applicants?|school alumni)\b/i,
  /\b(?:alumni|connections?) work here\b/i,
  /^(?:posted\s+)?(?:\d+\s+(?:minutes?|hours?|days?|weeks?|months?)|just now|today|yesterday)\s*(?:ago)?$/i,
  /^(?:\$|ca\$|us\$)[\d,.]+/i,
  /^(?:unsubscribe|manage (?:alerts|settings)|privacy|help|linkedin|indeed|this email was intended)/i,
  /^(?:full[- ]time|part[- ]time|internship|contract|temporary|co-?op)$/i,
  /^[-–—_•·|=*\s]+$/,
  /^(?:jobs? (?:you may be interested in|for you)|top job picks|new jobs? match)/i,
];

const isNoise = (l: string) => NOISE.some((re) => re.test(l));

/** "Company · Location", "Company - Location" or "Company | Location". */
function splitCompanyLocation(line: string): [string, string] | null {
  const m = line.split(/\s+[·•|]\s+|\s+[-–—]\s+/);
  return m.length >= 2 ? [m[0].trim(), m.slice(1).join(", ").trim()] : null;
}

const looksLikeLocation = (l: string) =>
  /\b(remote|hybrid|on-?site|canada|united states|usa|[A-Z]{2}\b|BC|ON|AB|QC|vancouver|toronto|montreal|calgary|ottawa|waterloo|new york|san francisco|seattle)\b/i.test(l) && l.length < 80;

function fromLines(lines: string[], url: string | null): AlertJob | null {
  const useful = lines.filter((l) => !isNoise(l) && l.length >= 2 && l.length <= 160);
  if (!useful.length) return null;
  const [title, second = "", third = ""] = useful;
  let company = second;
  let location = third;
  const split = splitCompanyLocation(second);
  if (split && !third) [company, location] = split;
  else if (split && looksLikeLocation(split[1]) && !looksLikeLocation(third)) [company, location] = split;
  if (location && !looksLikeLocation(location) && looksLikeLocation(company)) [company, location] = [location, company];
  if (!title || !company) return null;
  return { title, company, location: looksLikeLocation(location) ? location : "", url };
}

export function parseAlertEmail(text: string): AlertJob[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out: AlertJob[] = [];
  const seen = new Set<string>();
  const push = (j: AlertJob | null) => {
    if (!j) return;
    const key = j.url ?? `${j.title}|${j.company}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(j);
  };

  const urlLines = lines
    .map((l, i) => ({ i, url: (l.match(URL_RE) ?? []).find((u) => JOB_URL_RE.test(u)) }))
    .filter((x): x is { i: number; url: string } => Boolean(x.url));

  if (urlLines.length) {
    let start = 0;
    for (const { i, url } of urlLines) {
      // The job's lines sit between the previous link and this one; text on the link line itself counts too.
      const before = lines.slice(start, i).filter((l) => !HAS_URL.test(l));
      const onLine = lines[i].replace(URL_RE, "").replace(/^view job:?/i, "").trim();
      const block = [...before.slice(-4), ...(onLine ? [onLine] : [])];
      push(fromLines(block, canonicalJobUrl(url.replace(/[.,;]+$/, ""))));
      start = i + 1;
    }
    return out;
  }

  // No links: blocks of title, company (· location), location, separated by noise lines.
  let block: string[] = [];
  const flush = () => {
    if (block.length >= 2) push(fromLines(block, null));
    block = [];
  };
  for (const l of lines) {
    if (isNoise(l)) flush();
    else {
      block.push(l);
      if (block.length === 3) flush();
    }
  }
  flush();
  return out;
}
