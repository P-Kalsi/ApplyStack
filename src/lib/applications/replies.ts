// Read an employer's reply: rejection, assessment, interview, offer, or just
// an acknowledgement. Deterministic (no AI call), and it always shows the
// sentence it went by so you can overrule it. Idea adapted from career-ops'
// reply classification (https://github.com/career-ops-hq/career-ops, MIT).
// Pure and unit-tested.

import type { ApplicationStatus } from "../types";

export type ReplyKind = "rejected" | "offer" | "interview" | "oa" | "received";

export interface ReplyReading {
  kind: ReplyKind | null;
  /** The status the application should move to, or null to leave it. */
  status: ApplicationStatus | null;
  label: string;
  evidence: string | null;
}

// Checked in this order: a rejection often mentions "interview" or
// "assessment" ("we won't be moving you to the interview stage").
const RULES: { kind: ReplyKind; status: ApplicationStatus | null; label: string; patterns: RegExp[] }[] = [
  {
    kind: "rejected",
    status: "rejected",
    label: "Rejection",
    patterns: [
      /\bunfortunately\b/i,
      /\bnot (?:be )?(?:moving|move) forward\b/i,
      /\b(?:decided|chosen|elected) to (?:move|proceed|go) forward with (?:other|another)\b/i,
      /\bwill not be (?:proceeding|moving|progressing|advancing)\b/i,
      /\b(?:regret|sorry) to (?:inform|let you know)\b/i,
      /\b(?:position|role) has (?:been|now been) filled\b/i,
      /\bnot (?:been )?selected\b/i,
      /\bpursue other candidates\b/i,
    ],
  },
  {
    kind: "offer",
    status: "offer",
    label: "Offer",
    patterns: [/\b(?:pleased|happy|excited|delighted) to (?:extend|offer)\b/i, /\boffer (?:letter|of employment)\b/i, /\bextend (?:you )?an offer\b/i],
  },
  {
    kind: "interview",
    status: "interview",
    label: "Interview invitation",
    patterns: [
      /\b(?:schedule|book|set up|arrange)\b[^.]{0,40}\b(?:interview|call|chat|conversation|meeting)\b/i,
      /\binvite you (?:to|for) (?:an? )?(?:interview|call|chat)\b/i,
      /\b(?:your )?availability\b[^.]{0,40}\b(?:interview|call|chat|next week|this week)\b/i,
      /\b(?:calendly|goodtime|cal\.com)\b/i,
      /\bnext round\b/i,
    ],
  },
  {
    kind: "oa",
    status: "oa",
    label: "Online assessment",
    patterns: [
      /\b(?:online|technical|coding|skills?) (?:assessment|test|challenge)\b/i,
      /\b(?:hackerrank|codesignal|codility|hirevue|karat|testgorilla)\b/i,
      /\btake[- ]home\b/i,
    ],
  },
  {
    kind: "received",
    status: null,
    label: "Application received",
    patterns: [/\b(?:received|receipt of) your application\b/i, /\bthank you for (?:applying|your application|your interest)\b/i],
  },
];

function sentenceOf(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(".", index) + 1, text.lastIndexOf("\n", index) + 1, 0);
  const endDot = text.indexOf(".", index);
  const endLine = text.indexOf("\n", index);
  const ends = [endDot === -1 ? text.length : endDot + 1, endLine === -1 ? text.length : endLine];
  const s = text.slice(start, Math.min(...ends)).replace(/\s+/g, " ").trim();
  return s.length > 220 ? `${s.slice(0, 217)}…` : s;
}

export function readReply(text: string): ReplyReading {
  for (const rule of RULES) {
    for (const re of rule.patterns) {
      const m = re.exec(text);
      if (m) return { kind: rule.kind, status: rule.status, label: rule.label, evidence: sentenceOf(text, m.index) };
    }
  }
  return { kind: null, status: null, label: "Couldn't tell", evidence: null };
}

/** The note line recorded when you apply a reply to an application. */
export function replyNote(today: string, reading: ReplyReading): string {
  return `Reply ${today}: ${reading.label}${reading.evidence ? ` ("${reading.evidence}")` : ""}`;
}
