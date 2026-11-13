// Deterministic, truth-preserving reordering of comma-separated lists inside
// a bullet (tech lists, skills lines). Nothing is added or removed — items
// matching the job move to the front, original relative order otherwise.
// Dependency-free and unit-tested.

import { extractSkills } from "../jobs/skills";

/** Split on top-level commas, ignoring commas inside (), [] or {}. */
export function splitListItems(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      items.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) items.push(cur.trim());
  return items.filter(Boolean);
}

function isPriority(item: string, prioritized: Set<string>): boolean {
  return extractSkills(item).some((s) => prioritized.has(s));
}

/**
 * Reorder a bare comma list ("Python, Docker, SQL") so prioritized items lead.
 * Returns null when nothing would change.
 */
export function reorderList(list: string, prioritized: Set<string>): string | null {
  const trimmed = list.trim();
  const trailing = trimmed.match(/[.;]$/)?.[0] ?? "";
  const body = trailing ? trimmed.slice(0, -1) : trimmed;
  const items = splitListItems(body);
  if (items.length < 3) return null;
  // Only reorder lists of short, skill-like items. Long items are clauses of
  // a sentence ("wrote a spec, used X, delivered Y"); shuffling them changes
  // the meaning and reads badly.
  const isShort = (it: string) => it.replace(/\([^)]*\)/g, "").trim().split(/\s+/).length <= 4 && it.length <= 45;
  if (!items.every(isShort)) return null;

  const hadAnd = /^and\s+/i.test(items[items.length - 1]);
  const cleaned = items.map((it) => it.replace(/^and\s+/i, ""));
  const front = cleaned.filter((it) => isPriority(it, prioritized));
  const back = cleaned.filter((it) => !isPriority(it, prioritized));
  if (front.length === 0 || front.length === cleaned.length) return null;

  const reordered = [...front, ...back];
  if (JSON.stringify(reordered) === JSON.stringify(cleaned)) return null;

  const joined = hadAnd
    ? `${reordered.slice(0, -1).join(", ")}, and ${reordered[reordered.length - 1]}`
    : reordered.join(", ");
  return joined + trailing;
}

/**
 * Reorder the trailing comma list of a bullet so prioritized items lead.
 * Recognizes patterns like:
 *   "Built X using A, B, and C."
 *   "\textbf{Languages}: A, B, C"
 * Returns null when there is no list, fewer than 3 items, or no change.
 */
export function reorderTrailingList(text: string, prioritized: Set<string>): string | null {
  const m = text.match(/^(.*?(?::| using | with | in ))\s*([^:]+?)$/);
  if (!m) return null;
  const [, head, listPart] = m;
  const reordered = reorderList(listPart, prioritized);
  if (!reordered) return null;
  const sep = head.endsWith(" ") ? "" : " ";
  return `${head}${sep}${reordered}`;
}
