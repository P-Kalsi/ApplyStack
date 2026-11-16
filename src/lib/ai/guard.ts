// Truthfulness guard: deterministic enforcement of the "never invent" rules.
// Every AI (or mock) response passes through here before persistence, so even
// a misbehaving model cannot claim skills the vault lacks, invent metrics, or
// target bullets that do not exist. Dependency-free and unit-tested.

import type { FactRow } from "../types";
import { canonicalSkill, extractSkills } from "../jobs/skills";
import type { BulletBlock } from "../resume/latex";
import { bulletPlain, latexToPlain } from "../resume/latex";
import type { MatchReport, TailorChange } from "./schemas";
import { tidyKeywordEvidence } from "./keywords";

/**
 * Sanitize a match report against the set of skills the vault can truthfully
 * claim and the text of approved facts:
 *  - a keyword marked "verified" must exist in the vault skill set, an
 *    approved fact's text, or (for a field of study) your education; otherwise
 *    a technology is downgraded to "missing" and anything else to "related"
 *  - generic keywords are dropped and repeated ones merged (see keywords.ts)
 *  - matched_keywords may never contain vault-missing keywords
 *  - a keyword can never be both matched and missing
 */
export function sanitizeMatchReport(
  report: MatchReport,
  vaultSkills: Set<string>,
  approvedFacts: Pick<FactRow, "fact_text">[],
  education: { degree?: string | null; major?: string | null }[] = []
): MatchReport {
  const factBlob = approvedFacts.map((f) => f.fact_text.toLowerCase()).join("\n");
  const fields = education
    .flatMap((e) => [e.major, e.degree])
    .map((s) => (s || "").trim().toLowerCase())
    .filter((s) => s.length > 2);
  const canClaim = (kw: string): boolean => {
    const c = canonicalSkill(kw);
    if (vaultSkills.has(c)) return true;
    const lower = kw.toLowerCase();
    if (fields.some((f) => lower.includes(f))) return true;
    return factBlob.includes(lower);
  };

  const evidence = tidyKeywordEvidence(
    report.keyword_evidence.map((e) => {
      if (e.status !== "verified" || canClaim(e.keyword)) return e;
      if (extractSkills(e.keyword).length) {
        return { ...e, status: "missing" as const, evidence: "No supporting Career Vault fact." };
      }
      // Not a technology: the model saw supporting work, but no fact says it outright.
      return { ...e, status: "related" as const };
    })
  );

  const matched = Array.from(
    new Set(report.matched_keywords.filter((kw) => canClaim(kw)).map((k) => k.trim()))
  );
  const matchedSet = new Set(matched.map((m) => m.toLowerCase()));
  const demoted = report.matched_keywords.filter((kw) => !canClaim(kw));
  const missing = Array.from(
    new Set(
      [...report.missing_keywords, ...demoted]
        .map((k) => k.trim())
        .filter((kw) => !matchedSet.has(kw.toLowerCase()))
    )
  );

  return { ...report, matched_keywords: matched, missing_keywords: missing, keyword_evidence: evidence };
}

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?%?/g;

/** All numeric tokens in a piece of text (commas stripped). */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.match(NUMBER_RE) ?? []) {
    out.add(m.replace(/,/g, ""));
  }
  return out;
}

export interface GuardedChange extends TailorChange {
  is_safe: boolean;
  original_text: string;
  section: string | null;
}

export interface GuardResult {
  accepted: GuardedChange[];
  rejected: { change: TailorChange; reason: string }[];
}

/**
 * Validate proposed tailoring changes against the resume and the vault.
 * Hard rejections (change dropped entirely):
 *  - block_id does not exist in the master resume
 *  - rewrite introduces a lexicon skill that neither the vault nor the
 *    original bullet can claim (inventing technologies)
 *  - rewrite introduces numbers absent from the original bullet and from
 *    every approved supporting fact (inventing metrics)
 * Soft flags (kept, but is_safe=false so "Accept all safe" skips them):
 *  - rewrite cites no supporting facts
 *  - rewrite is much longer than the original (page-length risk)
 *  - any removal (truthful, but always a human decision)
 *  - cited fact ids that do not resolve to approved facts
 */
export function guardTailorChanges(
  changes: TailorChange[],
  bullets: BulletBlock[],
  approvedFacts: Pick<FactRow, "id" | "fact_text" | "keywords">[],
  vaultSkills: Set<string>
): GuardResult {
  const bulletById = new Map(bullets.map((b) => [b.id, b]));
  const factById = new Map(approvedFacts.map((f) => [f.id, f]));
  const accepted: GuardedChange[] = [];
  const rejected: { change: TailorChange; reason: string }[] = [];

  for (const change of changes) {
    const bullet = bulletById.get(change.block_id);
    if (!bullet) {
      rejected.push({ change, reason: `Unknown resume block "${change.block_id}".` });
      continue;
    }
    const originalPlain = bulletPlain(bullet);
    const tailoredPlain = bullet.plain
      ? change.tailored_text.replace(/\s+/g, " ").trim()
      : latexToPlain(change.tailored_text);

    if (change.action === "remove") {
      // Removing content is truthful but a judgment call: it always needs an
      // explicit decision and is never part of "Accept all safe changes".
      accepted.push({
        ...change,
        tailored_text: "",
        is_safe: false,
        original_text: bullet.text,
        section: bullet.section,
      });
      continue;
    }

    const citedFacts = change.fact_ids
      .map((id) => factById.get(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));
    const supportBlob = citedFacts.map((f) => `${f.fact_text} ${f.keywords.join(" ")}`).join("\n");

    // Rule: no invented technologies.
    const newSkills = extractSkills(tailoredPlain);
    const allowedSkills = new Set([
      ...extractSkills(originalPlain),
      ...extractSkills(supportBlob),
      ...vaultSkills,
    ]);
    const invented = newSkills.filter((s) => !allowedSkills.has(s));
    if (invented.length > 0) {
      rejected.push({
        change,
        reason: `Introduces technologies with no Career Vault support: ${invented.join(", ")}.`,
      });
      continue;
    }

    // Rule: no invented numbers/metrics.
    const allowedNumbers = new Set([...numbersIn(originalPlain), ...numbersIn(supportBlob)]);
    const newNumbers = Array.from(numbersIn(tailoredPlain)).filter(
      (n) => !allowedNumbers.has(n)
    );
    if (newNumbers.length > 0) {
      rejected.push({
        change,
        reason: `Introduces metrics with no Career Vault support: ${newNumbers.join(", ")}.`,
      });
      continue;
    }

    const unresolvedFactIds = change.fact_ids.filter((id) => !factById.has(id));
    // Pure reorders of existing content are safe by construction (nothing new
    // is claimed); rewrites must cite resolvable supporting facts to be safe.
    const isReorder = change.action === "skills_reorder" || change.action === "coursework";
    // Much longer bullets risk pushing a one-page resume onto a second page.
    const tooLong = tailoredPlain.length > originalPlain.length * 1.35 + 15;
    const is_safe =
      !tooLong && (isReorder || (citedFacts.length > 0 && unresolvedFactIds.length === 0));

    accepted.push({
      ...change,
      fact_ids: citedFacts.map((f) => f.id),
      is_safe,
      original_text: bullet.text,
      section: bullet.section,
    });
  }

  return { accepted, rejected };
}
