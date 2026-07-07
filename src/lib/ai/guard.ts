// Truthfulness guard: deterministic enforcement of the "never invent" rules.
// Every AI (or mock) response passes through here before persistence, so even
// a misbehaving model cannot claim skills the vault lacks, invent metrics, or
// target bullets that do not exist. Dependency-free and unit-tested.

import type { FactRow } from "../types";
import { canonicalSkill, extractSkills } from "../jobs/skills";
import type { BulletBlock } from "../resume/latex";
import { latexToPlain } from "../resume/latex";
import type { MatchReport, TailorChange } from "./schemas";

/**
 * Sanitize a match report against the set of skills the vault can truthfully
 * claim and the text of approved facts:
 *  - a keyword marked "verified" must exist in the vault skill set or in an
 *    approved fact's text; otherwise it is downgraded (related/missing)
 *  - matched_keywords may never contain vault-missing keywords
 *  - a keyword can never be both matched and missing
 */
export function sanitizeMatchReport(
  report: MatchReport,
  vaultSkills: Set<string>,
  approvedFacts: Pick<FactRow, "fact_text">[]
): MatchReport {
  const factBlob = approvedFacts.map((f) => f.fact_text.toLowerCase()).join("\n");
  const canClaim = (kw: string): boolean => {
    const c = canonicalSkill(kw);
    if (vaultSkills.has(c)) return true;
    return factBlob.includes(kw.toLowerCase());
  };

  const evidence = report.keyword_evidence.map((e) => {
    if (e.status === "verified" && !canClaim(e.keyword)) {
      return { ...e, status: "missing" as const, evidence: "No supporting Career Vault fact." };
    }
    return e;
  });

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
    const originalPlain = latexToPlain(bullet.text);

    if (change.action === "remove") {
      accepted.push({
        ...change,
        tailored_text: "",
        is_safe: true,
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
    const newSkills = extractSkills(latexToPlain(change.tailored_text));
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
    const newNumbers = Array.from(numbersIn(latexToPlain(change.tailored_text))).filter(
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
    const is_safe = isReorder || (citedFacts.length > 0 && unresolvedFactIds.length === 0);

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
