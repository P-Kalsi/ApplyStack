// Prompt builders for the three AI tasks. All prompts demand structured JSON
// and forbid inventing anything not present in the provided facts. Keep these
// lean: the deterministic relevance filter has already pruned the context.

import type { FactRow, JobRow } from "../types";
import type { Ranked } from "../matching/relevance";
import type { ExperienceRow, ProjectRow } from "../types";
import type { BulletBlock } from "../resume/latex";
import type { ResumeFormat } from "../resume/document";
import type { JobAnalysis } from "./schemas";

export interface BuiltPrompt {
  system: string;
  user: string;
  maxTokens: number;
}

const JSON_ONLY =
  "Respond with a single JSON object only. No prose, no markdown fences, no commentary.";

export function jobAnalysisPrompt(job: Pick<JobRow, "title" | "company" | "description_text">): BuiltPrompt {
  return {
    system:
      "You analyze software job descriptions into structured JSON for a resume-tailoring tool. " +
      "Extract only what the description actually says; do not infer requirements it does not state. " +
      JSON_ONLY,
    user: `Analyze this job description.

Company: ${job.company}
Title: ${job.title}

<job_description>
${(job.description_text || "").slice(0, 12000)}
</job_description>

Return JSON with exactly these keys:
{
  "role_category": string,            // e.g. "backend", "frontend", "ai-ml", "devops"
  "seniority": string,                // e.g. "intern", "new grad", "senior"
  "required_skills": string[],
  "preferred_skills": string[],
  "tools": string[],
  "frameworks": string[],
  "languages": string[],
  "cloud_infrastructure_keywords": string[],
  "domain_keywords": string[],
  "responsibilities": string[],
  "important_phrases": string[],      // ATS-relevant phrases worth mirroring
  "hard_requirements": string[],
  "soft_requirements": string[]
}`,
    maxTokens: 2000,
  };
}

function factsBlock(facts: Ranked<FactRow>[]): string {
  return facts
    .map((r) => `- [${r.item.id}] ${r.item.fact_text}`)
    .join("\n");
}

export function matchPrompt(
  job: Pick<JobRow, "title" | "company">,
  analysis: JobAnalysis,
  facts: Ranked<FactRow>[],
  projects: Ranked<ProjectRow>[],
  experiences: Ranked<ExperienceRow>[],
  vaultSkills: string[]
): BuiltPrompt {
  return {
    system:
      "You compare a candidate's verified career facts against a job's parsed requirements. " +
      "You may only credit the candidate with skills and experiences present in the provided facts. " +
      "Never mark a keyword 'verified' without a supporting fact. Distinguish carefully between " +
      "'verified' (a fact proves it), 'related' (adjacent experience only), and 'missing'. " +
      JSON_ONLY,
    user: `Job: ${job.title} at ${job.company}

Parsed job requirements:
${JSON.stringify(analysis)}

Candidate's verified skills:
${vaultSkills.join(", ") || "(none)"}

Candidate's relevant projects (pre-ranked):
${projects.map((r) => `- ${r.item.name}: ${r.item.technologies.join(", ")}. ${r.item.description || ""}`).join("\n") || "(none)"}

Candidate's relevant experiences (pre-ranked):
${experiences.map((r) => `- ${r.item.role} at ${r.item.company}. ${r.item.summary || ""}`).join("\n") || "(none)"}

Candidate's verified facts:
${factsBlock(facts) || "(none)"}

Return JSON with exactly these keys:
{
  "overall_match_score": integer 0-100,
  "skills_match_score": integer 0-100,
  "experience_match_score": integer 0-100,
  "project_match_score": integer 0-100,
  "matched_keywords": string[],       // only keywords a fact or skill proves
  "missing_keywords": string[],
  "keyword_evidence": [{"keyword": string, "status": "verified"|"related"|"missing", "evidence": string}],
  "strongest_experiences": string[],
  "strongest_projects": string[],
  "potential_concerns": string[]
}
Do not inflate scores. A missing keyword must never appear in matched_keywords.`,
    maxTokens: 2500,
  };
}

export function tailorPrompt(
  job: Pick<JobRow, "title" | "company">,
  analysis: JobAnalysis,
  facts: Ranked<FactRow>[],
  bullets: BulletBlock[],
  vaultSkills: string[],
  format: ResumeFormat = "latex"
): BuiltPrompt {
  const bulletList = bullets
    .map((b) => {
      const where = [b.section, b.entry].filter(Boolean).join(" / ") || "?";
      const kind = b.role === "skills" ? " (skills list: reorder only, never add items)" : "";
      return `- id=${b.id} [${where}]${kind} ${b.text}`;
    })
    .join("\n");
  const formatRule =
    format === "docx"
      ? "5. Bullets live in a one-page Word resume: write plain text only (no LaTeX, markdown, or bullet characters) and keep each rewrite about the same length as the original so the page does not overflow.\n"
      : "5. Keep LaTeX formatting commands in tailored text when the original bullet had them, and keep each rewrite about the same length as the original.\n";
  return {
    system:
      "You tailor an existing resume to a job by rewriting, removing, or reordering EXISTING bullets. " +
      "Hard rules you must never break:\n" +
      "1. Use ONLY the provided verified facts. Never invent experience, technologies, metrics, dates, employers, degrees, or certifications.\n" +
      "2. Never claim professional use of a technology based on vague similarity.\n" +
      "3. Preserve truthful metrics exactly as written.\n" +
      "4. Do not add keywords purely for ATS manipulation; a keyword may appear only when a cited fact supports it.\n" +
      formatRule +
      "Style: concise, technical, impact-focused bullets; no first-person pronouns; avoid buzzwords " +
      "like 'leveraged', 'spearheaded', 'utilized'; prefer Context -> Action -> Result. " +
      JSON_ONLY,
    user: `Target job: ${job.title} at ${job.company}

Parsed job requirements:
${JSON.stringify(analysis)}

Candidate's verified skills (the complete allowed set):
${vaultSkills.join(", ") || "(none)"}

Verified Career Vault facts (cite ids in fact_ids):
${factsBlock(facts) || "(none)"}

Resume bullets (address by id; these are the ONLY editable units):
${bulletList}

Propose changes as JSON with exactly these keys:
{
  "changes": [{
    "block_id": string,               // an id from the list above
    "action": "rewrite" | "remove" | "skills_reorder" | "coursework",
    "tailored_text": string,          // empty for remove
    "reason": string,                 // short explanation shown to the user
    "fact_ids": string[],             // vault fact ids supporting the rewrite
    "keywords": string[]              // job keywords this change targets
  }],
  "keywords_added": string[],         // keywords newly surfaced, each fact-supported
  "skills_emphasized": string[],
  "still_missing": string[],          // requirements no fact supports (be honest)
  "summary": string
}
Only propose changes that genuinely improve fit. Leave strong bullets alone.`,
    maxTokens: 4000,
  };
}
