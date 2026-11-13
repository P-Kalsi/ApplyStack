// Deterministic mock AI engine. Used when ANTHROPIC_API_KEY is not set (and
// in tests) so the entire product remains functional: analysis, matching and
// tailoring all run on the keyword-matching core. The mock is conservative by
// design — it only reorders and trims existing truthful content; it never
// writes new claims.

import type { JobRow, VaultSnapshot } from "../types";
import { computeMatch, vaultSkillSet } from "../matching/score";
import { rankExperiences, rankProjects } from "../matching/relevance";
import { canonicalSkill, extractSkills } from "../jobs/skills";
import type { BulletBlock } from "../resume/latex";
import { bulletPlain } from "../resume/latex";
import { reorderList, reorderTrailingList } from "../resume/reorder-list";
import type { JobAnalysis, MatchReport, TailorResult } from "./schemas";

const LANGS = new Set(["typescript", "javascript", "python", "java", "go", "c++", "c#", "c", "rust", "ruby", "kotlin", "swift", "php", "scala", "r", "sql", "bash", "html", "css"]);
const CLOUD = new Set(["aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ansible", "prometheus", "grafana", "nginx", "linux", "dns", "networking", "ci/cd", "github actions"]);
const FRAMEWORKS = new Set(["react", "next.js", "vue", "angular", "svelte", "node.js", "express", "fastapi", "flask", "django", "spring", "rails", "tailwind", "vite"]);
const TOOLS = new Set(["git", "github actions", "playwright", "jest", "pytest", "vitest", "airflow", "dbt", "pandas", "numpy", "scikit-learn", "pytorch", "tensorflow"]);

function bulletLines(text: string | null): string[] {
  return (text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());
}

export function mockAnalyzeJob(job: JobRow): JobAnalysis {
  const skills = job.skills.length
    ? job.skills.map(canonicalSkill)
    : extractSkills(`${job.title}\n${job.description_text || ""}`);
  const lines = bulletLines(job.description_text);
  const isSoft = (l: string) => /bonus|nice to have|preferred|a plus|plus:/i.test(l);
  const isHard = (l: string) => /required|must|need|pursuing|strong|experience with|proficien/i.test(l);
  const hard = lines.filter((l) => isHard(l) && !isSoft(l)).slice(0, 8);
  const soft = lines.filter(isSoft).slice(0, 8);
  const responsibilities = lines.filter((l) => !hard.includes(l) && !soft.includes(l)).slice(0, 8);
  return {
    role_category: job.categories[0] || "software-engineering",
    seniority: job.employment_type === "internship" ? "intern" : job.employment_type,
    required_skills: skills.filter((s) => !CLOUD.has(s)).slice(0, 10),
    preferred_skills: skills.slice(10, 16),
    tools: skills.filter((s) => TOOLS.has(s)),
    frameworks: skills.filter((s) => FRAMEWORKS.has(s)),
    languages: skills.filter((s) => LANGS.has(s)),
    cloud_infrastructure_keywords: skills.filter((s) => CLOUD.has(s)),
    domain_keywords: (job.ats_keywords || []).slice(0, 10),
    responsibilities,
    important_phrases: (job.ats_keywords || []).slice(0, 10),
    hard_requirements: hard,
    soft_requirements: soft,
  };
}

export function mockMatchReport(job: JobRow, vault: VaultSnapshot): MatchReport {
  const match = computeMatch(job, vault);
  const skills = vaultSkillSet(vault);
  const factBlob = vault.facts
    .filter((f) => f.status === "approved")
    .map((f) => f.fact_text.toLowerCase())
    .join("\n");
  const wanted = Array.from(new Set([...match.matchedSkills, ...match.missingSkills]));
  const keyword_evidence = wanted.map((kw) => {
    if (skills.has(kw)) {
      return {
        keyword: kw,
        status: "verified" as const,
        evidence: "Present in Career Vault skills, project stacks, or approved facts.",
      };
    }
    if (factBlob.includes(kw.toLowerCase())) {
      return {
        keyword: kw,
        status: "related" as const,
        evidence: "Mentioned in an approved Career Vault fact, but not claimed as a skill.",
      };
    }
    return { keyword: kw, status: "missing" as const, evidence: "No supporting Career Vault fact." };
  });
  const projects = rankProjects(job, vault).filter((r) => r.score > 0);
  const experiences = rankExperiences(job, vault).filter((r) => r.score > 0);
  return {
    overall_match_score: match.overall,
    skills_match_score: match.skillsScore,
    experience_match_score: match.experienceScore,
    project_match_score: match.projectScore,
    matched_keywords: match.matchedSkills,
    missing_keywords: match.missingSkills,
    keyword_evidence,
    strongest_experiences: experiences.slice(0, 3).map((r) => `${r.item.role} — ${r.item.company}`),
    strongest_projects: projects.slice(0, 3).map((r) => r.item.name),
    potential_concerns: match.missingSkills
      .slice(0, 5)
      .map((s) => `No Career Vault evidence of ${s}; do not claim it.`),
  };
}

/** Link a bullet to vault facts that state the same thing (by text or skills). */
function supportingFactIds(bullet: BulletBlock, vault: VaultSnapshot): string[] {
  const plain = bulletPlain(bullet).toLowerCase().replace(/\.$/, "");
  const bulletSkills = new Set(extractSkills(plain));
  const out: string[] = [];
  for (const f of vault.facts) {
    if (f.status !== "approved") continue;
    const factPlain = f.fact_text.toLowerCase().replace(/\.$/, "");
    if (factPlain === plain || plain.includes(factPlain) || factPlain.includes(plain)) {
      out.push(f.id);
      continue;
    }
    const factSkills = extractSkills(f.fact_text);
    const shared = factSkills.filter((s) => bulletSkills.has(s));
    if (shared.length >= 2) out.push(f.id);
  }
  return out.slice(0, 4);
}

export function mockTailor(job: JobRow, vault: VaultSnapshot, bullets: BulletBlock[]): TailorResult {
  const match = computeMatch(job, vault);
  const prioritized = new Set(match.matchedSkills);
  const changes: TailorResult["changes"] = [];
  const emphasized = new Set<string>();

  const projectBullets = bullets.filter((b) => /project/i.test(b.section || ""));
  const relevantProjectBullets = projectBullets.filter(
    (b) => extractSkills(bulletPlain(b)).some((s) => prioritized.has(s))
  );

  // Bullets per entry (job/project), so removals never empty an entry.
  const entryKey = (b: BulletBlock) => `${b.section ?? ""}::${b.entry ?? ""}`;
  const remainingPerEntry = new Map<string, number>();
  for (const b of bullets) remainingPerEntry.set(entryKey(b), (remainingPerEntry.get(entryKey(b)) ?? 0) + 1);

  for (const bullet of bullets) {
    const isSkillsLine = bullet.role === "skills" || /skill/i.test(bullet.section || "");
    const reordered =
      bullet.role === "skills"
        ? reorderList(bullet.text, prioritized)
        : reorderTrailingList(bullet.text, prioritized);
    if (reordered) {
      const moved = extractSkills(bulletPlain(bullet)).filter((s) => prioritized.has(s));
      moved.forEach((s) => emphasized.add(s));
      changes.push({
        block_id: bullet.id,
        action: isSkillsLine ? "skills_reorder" : "rewrite",
        tailored_text: reordered,
        reason: `Reordered to lead with ${moved.slice(0, 3).join(", ")} because the job description emphasizes ${moved.slice(0, 3).join(", ")}.`,
        fact_ids: isSkillsLine ? [] : supportingFactIds(bullet, vault),
        keywords: moved,
      });
      continue;
    }
    // Deprioritize clearly irrelevant project bullets when stronger ones exist.
    const isProject = /project/i.test(bullet.section || "");
    const key = entryKey(bullet);
    if (
      isProject &&
      relevantProjectBullets.length >= 2 &&
      (remainingPerEntry.get(key) ?? 0) > 1 &&
      !extractSkills(bulletPlain(bullet)).some((s) => prioritized.has(s))
    ) {
      remainingPerEntry.set(key, (remainingPerEntry.get(key) ?? 0) - 1);
      changes.push({
        block_id: bullet.id,
        action: "remove",
        tailored_text: "",
        reason:
          "This bullet does not mention any skill the job asks for; removing it makes room to emphasize matching work.",
        fact_ids: [],
        keywords: [],
      });
    }
  }

  const summaryParts = [
    changes.length
      ? `Proposed ${changes.length} conservative change(s): reordering truthful content toward the job's stack.`
      : "The master resume already leads with this job's stack; no changes proposed.",
    match.missingSkills.length
      ? `Still missing (not added, no vault support): ${match.missingSkills.join(", ")}.`
      : "",
  ].filter(Boolean);

  return {
    changes,
    keywords_added: [], // the mock never adds new keywords, only reorders
    skills_emphasized: Array.from(emphasized).sort(),
    still_missing: match.missingSkills,
    summary: summaryParts.join(" "),
  };
}
