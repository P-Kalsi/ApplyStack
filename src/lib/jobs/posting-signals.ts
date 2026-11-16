// Deterministic checks on a posting itself, separate from how well you match it:
// is it still listed, how old is it, does it rule out sponsorship, is it unpaid,
// does it ask you for money, is there enough text to judge it on.
// Ideas adapted from career-ops' "posting legitimacy" block
// (https://github.com/career-ops-hq/career-ops, MIT). As there, these are
// signals, never accusations, and missing data never counts against a posting.
// Dependency-free and unit-tested.

import type { JobRow } from "../types";

/** blocker: check before spending time on it. caution: worth knowing. info: context. */
export type SignalLevel = "blocker" | "caution" | "info";

export interface PostingSignal {
  id: "closed" | "stale" | "aging" | "no_sponsorship" | "citizenship" | "unpaid" | "fee" | "thin";
  level: SignalLevel;
  label: string;
  detail: string;
  /** The sentence in the posting that triggered the signal, when there is one. */
  quote?: string;
}

type PostingInput = Pick<JobRow, "posted_at" | "description_text"> & {
  is_open?: boolean;
  snippet?: string | null;
};

const DAY_MS = 86_400_000;

const NO_SPONSORSHIP: RegExp[] = [
  /\b(?:not|unable to|cannot|can't|won't|will not|does not|do not|is not able to)\s+(?:be\s+able\s+to\s+)?(?:offer|provide|support)?\s*(?:visa|immigration|work\s+(?:permit|visa))?\s*sponsor/i,
  /\bsponsorship\s+(?:is\s+)?(?:not\s+(?:available|offered|provided|possible)|unavailable)/i,
  /\bwithout\s+(?:the\s+need\s+for\s+)?(?:current\s+or\s+future\s+|any\s+)?(?:visa\s+|employer\s+)?sponsorship/i,
  /\bno\s+(?:visa\s+|immigration\s+)?sponsorship/i,
];

const CITIZENSHIP: RegExp[] = [
  /\b(?:U\.?S\.?|US|Canadian|American)\s+citizen(?:ship)?\b[^.]{0,40}\b(?:required|only|must)\b/i,
  /\bmust\s+(?:be|hold)\s+(?:a\s+)?(?:U\.?S\.?|US|Canadian|American)\s+citizen/i,
  /\b(?:active|current|obtain|eligible for)\s+(?:a\s+)?(?:secret|top secret|security)\s+clearance/i,
  /\bsecurity\s+clearance\s+(?:is\s+)?required/i,
];

const UNPAID: RegExp[] = [/\bunpaid\b/i, /\bfor\s+(?:academic|course|school)\s+credit\s+only\b/i, /\bvolunteer\s+(?:position|role|internship)\b/i];

const FEE: RegExp[] = [
  /\b(?:application|registration|training|placement|processing|onboarding|enrol?lment)\s+fee\b/i,
  /\b(?:pay|purchase)\s+(?:a|an|the|for)\s+(?:\w+\s+){0,2}(?:fee|kit|course|certification)\b/i,
];

/** The sentence around a match, trimmed for display. */
function sentenceAround(text: string, index: number, length: number): string {
  const before = text.slice(0, index);
  const start = Math.max(before.search(/[^.!?\n]*$/), 0);
  const rest = text.slice(index + length);
  const endRel = rest.search(/[.!?\n]/);
  const end = endRel === -1 ? text.length : index + length + endRel + 1;
  const sentence = text.slice(start, end).replace(/\s+/g, " ").trim();
  return sentence.length > 220 ? `${sentence.slice(0, 217).trimEnd()}…` : sentence;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return sentenceAround(text, m.index, m[0].length);
  }
  return null;
}

/** Whole days since a date, or null when unknown or in the future. */
export function postingAgeDays(postedAt: string | null, now: Date = new Date()): number | null {
  if (!postedAt) return null;
  const t = Date.parse(postedAt);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((now.getTime() - t) / DAY_MS);
  return days >= 0 ? days : null;
}

export function postingSignals(job: PostingInput, now: Date = new Date()): PostingSignal[] {
  const out: PostingSignal[] = [];
  const text = job.description_text || "";

  if (job.is_open === false) {
    out.push({
      id: "closed",
      level: "blocker",
      label: "No longer listed",
      detail: "The company's job board or feed no longer lists it, so it has probably closed. Check their careers page before tailoring.",
    });
  }

  const age = postingAgeDays(job.posted_at, now);
  if (age !== null && age >= 60) {
    out.push({
      id: "stale",
      level: "caution",
      label: `Posted ${age} days ago`,
      detail: "Postings this old are often filled even while they're still listed. Confirm it's open before you put time into it.",
    });
  } else if (age !== null && age >= 30) {
    out.push({
      id: "aging",
      level: "info",
      label: `Posted ${age} days ago`,
      detail: "Over a month old. Internships often fill early, so apply soon if you want it.",
    });
  }

  if (!text) return out;

  const fee = firstMatch(text, FEE);
  if (fee) {
    out.push({
      id: "fee",
      level: "blocker",
      label: "Mentions a fee for applicants",
      detail: "Real employers don't charge you to apply, train or start. Read this carefully; it may have an innocent explanation.",
      quote: fee,
    });
  }

  const sponsorship = firstMatch(text, NO_SPONSORSHIP);
  if (sponsorship) {
    out.push({
      id: "no_sponsorship",
      level: "caution",
      label: "No visa sponsorship",
      detail: "Only matters if you'd need a work permit or visa for this location.",
      quote: sponsorship,
    });
  }

  const citizenship = firstMatch(text, CITIZENSHIP);
  if (citizenship) {
    out.push({
      id: "citizenship",
      level: "caution",
      label: "Citizenship or clearance required",
      detail: "The posting limits who can be hired. Check you qualify before applying.",
      quote: citizenship,
    });
  }

  const unpaid = firstMatch(text, UNPAID);
  if (unpaid) {
    out.push({ id: "unpaid", level: "caution", label: "May be unpaid", detail: "The posting suggests no pay.", quote: unpaid });
  }

  if (text.replace(/\s+/g, " ").trim().length < 400) {
    out.push({
      id: "thin",
      level: "info",
      label: "Short description",
      detail: "There isn't much text to judge the role on, so the match score is less reliable.",
    });
  }

  return out;
}
