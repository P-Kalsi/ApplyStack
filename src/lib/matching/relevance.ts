// Deterministic relevance filtering: ranks vault projects, experiences, and
// facts against a job BEFORE any AI call, so the model only receives the most
// relevant, truthful context (and so mock mode behaves sensibly without a key).
// Dependency-free and unit-tested.

import type { ExperienceRow, FactRow, JobRow, ProjectRow, VaultSnapshot } from "../types";
import { canonicalizeSkillList, extractSkills } from "../jobs/skills";

export interface Ranked<T> {
  item: T;
  score: number;
  matchedKeywords: string[];
}

function jobKeywordSet(job: Pick<JobRow, "skills" | "ats_keywords" | "title" | "description_text">): Set<string> {
  const list = [
    ...canonicalizeSkillList(job.skills || []),
    ...canonicalizeSkillList(job.ats_keywords || []),
    ...extractSkills(`${job.title}\n${job.description_text || ""}`),
  ];
  return new Set(list);
}

function scoreText(text: string, jobKeywords: Set<string>): { score: number; matched: string[] } {
  const found = extractSkills(text);
  const matched = found.filter((s) => jobKeywords.has(s));
  return { score: matched.length, matched };
}

export function rankProjects(
  job: Pick<JobRow, "skills" | "ats_keywords" | "title" | "description_text">,
  vault: VaultSnapshot
): Ranked<ProjectRow>[] {
  const jobKeywords = jobKeywordSet(job);
  const factsByProject = new Map<string, FactRow[]>();
  for (const f of vault.facts) {
    if (f.project_id && f.status === "approved") {
      const list = factsByProject.get(f.project_id) ?? [];
      list.push(f);
      factsByProject.set(f.project_id, list);
    }
  }
  return vault.projects
    .map((p) => {
      const factText = (factsByProject.get(p.id) ?? []).map((f) => f.fact_text).join("\n");
      const text = `${p.name}\n${p.technologies.join(" ")}\n${p.description || ""}\n${factText}`;
      const { score, matched } = scoreText(text, jobKeywords);
      return { item: p, score, matchedKeywords: matched };
    })
    .sort((a, b) => b.score - a.score);
}

export function rankExperiences(
  job: Pick<JobRow, "skills" | "ats_keywords" | "title" | "description_text">,
  vault: VaultSnapshot
): Ranked<ExperienceRow>[] {
  const jobKeywords = jobKeywordSet(job);
  const factsByExperience = new Map<string, FactRow[]>();
  for (const f of vault.facts) {
    if (f.experience_id && f.status === "approved") {
      const list = factsByExperience.get(f.experience_id) ?? [];
      list.push(f);
      factsByExperience.set(f.experience_id, list);
    }
  }
  return vault.experiences
    .map((e) => {
      const factText = (factsByExperience.get(e.id) ?? []).map((f) => f.fact_text).join("\n");
      const text = `${e.role} ${e.company}\n${e.summary || ""}\n${factText}`;
      const { score, matched } = scoreText(text, jobKeywords);
      return { item: e, score, matchedKeywords: matched };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Select the approved facts most relevant to a job, capped at `limit`.
 * Facts tied to top-ranked projects/experiences get a small boost so the
 * model receives coherent context rather than isolated trivia.
 */
export function selectRelevantFacts(
  job: Pick<JobRow, "skills" | "ats_keywords" | "title" | "description_text">,
  vault: VaultSnapshot,
  limit = 24
): Ranked<FactRow>[] {
  const jobKeywords = jobKeywordSet(job);
  const topProjects = new Set(
    rankProjects(job, vault)
      .slice(0, 3)
      .filter((r) => r.score > 0)
      .map((r) => r.item.id)
  );
  const topExperiences = new Set(
    rankExperiences(job, vault)
      .slice(0, 3)
      .filter((r) => r.score > 0)
      .map((r) => r.item.id)
  );

  return vault.facts
    .filter((f) => f.status === "approved")
    .map((f) => {
      const { score, matched } = scoreText(`${f.fact_text} ${f.keywords.join(" ")}`, jobKeywords);
      let boost = 0;
      if (f.project_id && topProjects.has(f.project_id)) boost += 1;
      if (f.experience_id && topExperiences.has(f.experience_id)) boost += 1;
      return { item: f, score: score + boost, matchedKeywords: matched };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
