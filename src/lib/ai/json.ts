// Tolerant JSON extraction from model output. Dependency-free and tested.

/**
 * Pull the first JSON object out of a text response. Handles code fences and
 * leading/trailing prose. Throws when nothing parseable is found.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates: string[] = [];
  if (fenced) candidates.push(fenced[1]);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try next candidate
    }
  }
  throw new Error("Response did not contain a parseable JSON object.");
}
