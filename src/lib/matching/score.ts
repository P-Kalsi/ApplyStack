// Deterministic match scoring between a job and the Career Vault.
// This is the fast, honest baseline used on job cards and as the ground truth
// the AI layer is checked against. It never counts a skill the vault does not
// contain. Dependency-free and unit-tested.

import type { JobRow, VaultSnapshot } from "../types";
import { canonicalizeSkillList, extractSkills } from "../jobs/skills";

export interface MatchBreakdown {
  overall: number; // 0-100
  skillsScore: number; // 0-100
  experienceScore: number; // 0-100
  projectScore: number; // 0-100
  matchedSkills: string[];
  missingSkills: string[];
}

/** Every canonical skill the vault can truthfully claim. */
export function vaultSkillSet(vault: VaultSnapshot): Set<string> {
  const items: string[] = [];
  for (const group of vault.skills) items.push(...group.items);
  for (const project of vault.projects) items.push(...project.technologies);
  for (const fact of vault.facts) {
    if (fact.status !== "approved") continue;
    items.push(...fact.keywords);
    items.push(...extractSkills(fact.fact_text));
  }
  for (const exp of vault.experiences) {
    if (exp.summary) items.push(...extractSkills(exp.summary));
  }
  for (const project of vault.projects) {
    if (project.description) items.push(...extractSkills(project.description));
  }
  return new Set(canonicalizeSkillList(items));
}

function jobSkills(job: Pick<JobRow, "skills" | "description_text" | "title">): string[] {
  const fromRow = canonicalizeSkillList(job.skills || []);
  if (fromRow.length > 0) return fromRow;
  return extractSkills(`${job.title}\n${job.description_text || ""}`);
}

function overlapScore(wanted: string[], have: Set<string>): number {
  if (wanted.length === 0) return 50; // nothing specific requested: neutral
  const hit = wanted.filter((w) => have.has(w)).length;
  return Math.round((hit / wanted.length) * 100);
}

/**
 * Score how well one vault section covers the job's skills.
 * `sectionText` is the concatenated truthful text of that section.
 */
function sectionCoverage(jobSkillList: string[], sectionText: string): number {
  const have = new Set(extractSkills(sectionText));
  return overlapScore(jobSkillList, have);
}

export function computeMatch(
  job: Pick<JobRow, "skills" | "description_text" | "title">,
  vault: VaultSnapshot
): MatchBreakdown {
  const wanted = jobSkills(job);
  const have = vaultSkillSet(vault);

  const matchedSkills = wanted.filter((w) => have.has(w)).sort();
  const missingSkills = wanted.filter((w) => !have.has(w)).sort();
  const skillsScore = overlapScore(wanted, have);

  const approvedFacts = vault.facts.filter((f) => f.status === "approved");
  const expText = [
    ...vault.experiences.map((e) => `${e.role} ${e.company} ${e.summary || ""}`),
    ...approvedFacts.filter((f) => f.experience_id).map((f) => f.fact_text),
  ].join("\n");
  const projText = [
    ...vault.projects.map((p) => `${p.name} ${p.technologies.join(" ")} ${p.description || ""}`),
    ...approvedFacts.filter((f) => f.project_id).map((f) => f.fact_text),
  ].join("\n");

  const experienceScore = sectionCoverage(wanted, expText);
  const projectScore = sectionCoverage(wanted, projText);

  const overall = Math.max(
    0,
    Math.min(100, Math.round(skillsScore * 0.5 + projectScore * 0.3 + experienceScore * 0.2))
  );

  return { overall, skillsScore, experienceScore, projectScore, matchedSkills, missingSkills };
}
