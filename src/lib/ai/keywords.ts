// Keyword evidence cleanup: keep the list to concrete, checkable requirements.
//
// Models like to echo every phrase of a posting ("commitment to code quality",
// "Ruby and Rails communities") and to list one skill several ways. This keeps
// the evidence list short and honest: soft skills and generic practices are
// dropped (they can't be proven or disproven from facts), and phrasings of the
// same requirement are merged. Pure and unit-tested.

import type { KeywordEvidence } from "./schemas";
import { canonicalSkill, extractSkills } from "../jobs/skills";

/** Things every developer is assumed to do, or soft skills; never a "missing" item. */
const GENERIC =
  /^(software (engineering|development)|programming|coding|computer programming)$|code quality|clean code|best practices|problem[- ]solving|communicat|team ?work|collaborat|ownership|attention to detail|curiosity|curious|passion|growth mindset|eager|willing(ness)? to learn|learning|self[- ]?(starter|motivated|direct)|independen|initiative|adaptab|work ethic|fast[- ]paced|detail[- ]oriented|critical thinking|creativ|interpersonal|organi[sz]ation(al)? skills|time management|positive attitude|community|communities|culture|mission/i;

const STOP = new Set(
  "a an and or the of in on with for to at by experience experienced knowledge skills skill familiarity familiar strong solid proficiency proficient understanding working basic good excellent".split(" ")
);

const RANK: Record<KeywordEvidence["status"], number> = { verified: 0, related: 1, missing: 2 };

function words(keyword: string): Set<string> {
  return new Set(
    keyword
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .map((w) => w.replace(/^\.+|\.+$/g, ""))
      .filter((w) => w.length > 1 && !STOP.has(w))
  );
}

const subset = (a: Set<string>, b: Set<string>) => a.size > 0 && [...a].every((w) => b.has(w));

/** True when the keyword names one known technology (e.g. "Ruby on Rails", "Postgres"). */
export function isKnownSkill(keyword: string): boolean {
  return extractSkills(keyword).includes(canonicalSkill(keyword));
}

/** Soft skill or generic practice with no technology in it. */
export function isGenericKeyword(keyword: string): boolean {
  return GENERIC.test(keyword.trim()) && extractSkills(keyword).length === 0;
}

/**
 * Drop generic keywords, merge phrasings of the same requirement, and order
 * the rest verified → related → missing.
 */
export function tidyKeywordEvidence<T extends KeywordEvidence>(evidence: T[]): T[] {
  const items = evidence
    .filter((e) => e.keyword.trim() && !isGenericKeyword(e.keyword))
    .map((e) => ({ e, w: words(e.keyword), known: isKnownSkill(e.keyword), skill: canonicalSkill(e.keyword) }));

  const dropped = new Set<number>();
  items.forEach((a, i) => {
    items.forEach((b, j) => {
      if (i === j || dropped.has(i) || dropped.has(j)) return;
      const sameThing = (a.known && b.known && a.skill === b.skill) || (a.w.size > 0 && a.w.size === b.w.size && subset(a.w, b.w));
      if (sameThing) {
        // Same requirement twice: keep the better-supported one (first on ties).
        const loser = RANK[b.e.status] < RANK[a.e.status] || (RANK[b.e.status] === RANK[a.e.status] && j < i) ? i : j;
        dropped.add(loser);
        return;
      }
      if (!subset(a.w, b.w)) return;
      // a's words are all in b ("Ruby" ⊂ "Ruby and Rails communities").
      if (!b.known) dropped.add(j); // a vaguer phrase built around a: keep a
      else if (a.known && a.e.status === b.e.status) dropped.add(i); // "Ruby" vs "Ruby on Rails", same status: keep the specific one
    });
  });

  return items
    .filter((_, i) => !dropped.has(i))
    .map((x) => x.e)
    .sort((x, y) => RANK[x.status] - RANK[y.status]);
}
