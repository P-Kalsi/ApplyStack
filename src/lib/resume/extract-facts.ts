// Deterministic fact extraction from a master resume.
// Each bullet becomes a candidate atomic fact the user can approve or reject.
// No AI involved: extraction never invents anything, it only restates what
// the resume already says. Dependency-free and unit-tested.

import type { FactCategory } from "../types";
import { extractSkills } from "../jobs/skills";
import { bulletPlain } from "./latex";
import { documentBullets, type ResumeFormat } from "./document";

export interface ExtractedFact {
  fact_text: string;
  category: FactCategory;
  keywords: string[];
  section: string | null;
}

function categorize(text: string, section: string | null): FactCategory {
  const s = (section || "").toLowerCase();
  if (/education|coursework/.test(s)) return "education";
  if (/skill/.test(s)) return "skill";
  if (/award|certification|volunteer|interest|additional/.test(s)) return "additional";
  // Concrete numbers (percentages, counts) mark metric-bearing facts.
  if (/%|\b\d[\d,]{2,}\b|\b\d+\+/.test(text)) return "metric";
  return "general";
}

export function extractFactsFromDocument(content: string, format: ResumeFormat): ExtractedFact[] {
  const seen = new Set<string>();
  const out: ExtractedFact[] = [];
  for (const bullet of documentBullets(content, format)) {
    if (bullet.role === "skills") continue; // skills lines belong in Technical Skills, not facts
    const plain = bulletPlain(bullet);
    if (plain.length < 12) continue; // headings/fragments are not facts
    const key = plain.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      fact_text: plain,
      category: categorize(plain, bullet.section),
      keywords: extractSkills(plain),
      section: bullet.section,
    });
  }
  return out;
}

export function extractFactsFromLatex(latex: string): ExtractedFact[] {
  return extractFactsFromDocument(latex, "latex");
}
