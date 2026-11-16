// A plain-language verdict on whether a job is worth applying to, built only
// from the guarded match report (never from raw model output) and the posting
// checks. Ideas adapted from career-ops (https://github.com/career-ops-hq/career-ops,
// MIT): score bands that map to a decision, evidence that is only "related" can
// never carry a job into the top band, a missing hard requirement caps the
// decision, a posting red flag holds the verdict until you check it, and the
// confidence in the evidence is reported separately from the score.
// The verdict is advice; it never hides a job. Dependency-free and unit-tested.

import type { JobAnalysis, KeywordEvidence, MatchReport } from "../ai/schemas";
import type { PostingSignal } from "../jobs/posting-signals";

export type Decision = "apply" | "consider" | "skip" | "check";
export type Confidence = "high" | "medium" | "low";

export interface Verdict {
  decision: Decision;
  headline: string;
  /** The guarded AI score the bands were read from (0-100). */
  score: number;
  /** Why the decision is what it is, most important first. */
  reasons: string[];
  confidence: Confidence;
  confidenceNote: string;
}

/** Score bands, the same thresholds as the score badges (70 / 40). */
export const APPLY_AT = 70;
export const CONSIDER_AT = 40;

const HEADLINES: Record<Decision, string> = {
  apply: "Worth applying",
  consider: "Apply if you have a reason to",
  skip: "Probably skip",
  check: "Check the posting first",
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Does the keyword appear in one of the posting's hard requirements? */
function isHardRequirement(keyword: string, hard: string[]): boolean {
  const kw = keyword.trim();
  if (!kw) return false;
  const re = new RegExp(`(^|[^a-z0-9+#])${escapeRe(kw)}([^a-z0-9+#]|$)`, "i");
  return hard.some((h) => re.test(h));
}

function rank(d: Decision): number {
  return { skip: 0, consider: 1, apply: 2, check: 3 }[d];
}

function capAt(current: Decision, ceiling: Decision): Decision {
  return rank(current) > rank(ceiling) ? ceiling : current;
}

export function computeVerdict(
  report: Pick<MatchReport, "overall_match_score" | "keyword_evidence">,
  analysis: Pick<JobAnalysis, "hard_requirements" | "required_skills"> | null,
  signals: PostingSignal[] = [],
  descriptionLength = 0
): Verdict {
  const score = Math.max(0, Math.min(100, Math.round(report.overall_match_score)));
  const evidence: KeywordEvidence[] = report.keyword_evidence;
  const hard = analysis ? [...analysis.hard_requirements, ...analysis.required_skills] : [];

  const verified = evidence.filter((e) => e.status === "verified");
  const related = evidence.filter((e) => e.status === "related");
  const missingHard = evidence.filter((e) => e.status === "missing" && isHardRequirement(e.keyword, hard));

  const reasons: string[] = [];
  let decision: Decision = score >= APPLY_AT ? "apply" : score >= CONSIDER_AT ? "consider" : "skip";
  reasons.push(
    decision === "apply"
      ? `Match score ${score} is in the apply band (${APPLY_AT}+).`
      : decision === "consider"
        ? `Match score ${score} is in the middle band (${CONSIDER_AT}–${APPLY_AT - 1}).`
        : `Match score ${score} is below ${CONSIDER_AT}.`
  );

  // A match carried by adjacent experience can't reach the top band.
  if (evidence.length > 0 && related.length > verified.length) {
    if (decision === "apply") reasons.push("Capped: more of the keywords are only related to your work than proven by it.");
    decision = capAt(decision, "consider");
  }

  if (missingHard.length > 0) {
    const names = missingHard.slice(0, 3).map((e) => e.keyword).join(", ");
    if (decision === "apply") {
      reasons.push(`Capped: you're missing a stated requirement (${names}).`);
    } else {
      reasons.push(`Missing stated requirement${missingHard.length > 1 ? "s" : ""}: ${names}.`);
    }
    decision = capAt(decision, "consider");
  }

  // A posting red flag holds the verdict until you've looked; it never changes the score.
  const blockers = signals.filter((s) => s.level === "blocker");
  if (blockers.length > 0) {
    decision = "check";
    reasons.unshift(`${blockers.map((b) => b.label).join("; ")}.`);
  }

  if (verified.length > 0 && decision !== "skip") {
    const names = verified.slice(0, 4).map((e) => e.keyword).join(", ");
    reasons.push(`Proven by your vault: ${names}.`);
  }

  // Confidence describes the evidence, not your odds, and doesn't move the score.
  let confidence: Confidence = "high";
  let confidenceNote = "Plenty of posting text and keywords backed by your vault.";
  if (descriptionLength < 400 || evidence.length < 3) {
    confidence = "low";
    confidenceNote =
      descriptionLength < 400
        ? "The posting is short, so there's little to judge it on."
        : "Only a few concrete requirements were found to compare.";
  } else if (related.length > verified.length || evidence.length < 6 || signals.some((s) => s.id === "thin")) {
    confidence = "medium";
    confidenceNote =
      related.length > verified.length
        ? "Much of the match rests on related rather than proven experience."
        : "A fairly small set of requirements to compare against.";
  }

  return { decision, headline: HEADLINES[decision], score, reasons, confidence, confidenceNote };
}
