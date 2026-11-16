// Interview prep for a job: STAR stories built from your Career Vault and
// mapped to the posting's requirements, topics to review, and questions to
// ask. Ideas adapted from career-ops' STAR+R story bank and interview mode
// (https://github.com/career-ops-hq/career-ops, MIT).
//
// Stories may only use approved facts (cited as [F1], [F2]...) and pass the
// same skill and number checks as letters. The "R" (reflection) is never
// written for you: the model asks a question and you answer it, because what
// you learned is something only you know. Pure and unit-tested; the model
// call lives in src/lib/ai/interview.ts.

import type { BuiltPrompt } from "../ai/prompts";
import { numbersIn } from "../ai/guard";
import { factIndex, vaultCorpus } from "../answers/answers";
import { vaultSkillSet } from "../matching/score";
import { extractSkills } from "../jobs/skills";
import type { JobRow, VaultSnapshot } from "../types";

export interface RawStory {
  title: string;
  requirement: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection_prompt: string;
  facts: string[];
}

export interface RawPrep {
  stories: RawStory[];
  topics: { topic: string; why: string }[];
  questions_to_ask: string[];
}

export interface CheckedStory extends Omit<RawStory, "facts"> {
  factIds: string[];
  factTexts: string[];
  issues: string[];
}

export interface CheckedPrep {
  stories: CheckedStory[];
  topics: { topic: string; why: string }[];
  questions: string[];
}

const SYSTEM = [
  "You prepare a student for interviews for one job, using ONLY the facts provided.",
  "Write 5 to 7 STAR stories. Each story:",
  "- answers the kind of behavioral or technical question this posting's requirements suggest; name that requirement in `requirement`",
  "- has a short memorable `title` (e.g. \"Fixing malformed model output\")",
  "- `situation`, `task`, `action`, `result`: first person, 1 to 3 sentences each, every detail from the facts. Never add a skill, tool, number, teammate, employer, outcome or feeling that isn't in the facts. If a fact gives no result, say what was delivered, not an invented impact.",
  "- `reflection_prompt`: a QUESTION for the candidate to answer themselves about what they learned or would do differently. Do not answer it.",
  "- `facts`: the fact ids it uses, e.g. [\"F2\",\"F9\"]",
  "Use different facts across stories where you can; don't tell the same project twice unless it truly covers two requirements.",
  "`topics`: 4 to 8 technical topics to review, each named in the posting, with `why` quoting or paraphrasing the posting. Don't invent the company's stack.",
  "`questions_to_ask`: 4 to 6 thoughtful questions the candidate could ask the interviewer about this team and role, grounded in the posting.",
  'Respond with ONE JSON object only: {"stories":[{"title":"","requirement":"","situation":"","task":"","action":"","result":"","reflection_prompt":"","facts":["F1"]}],"topics":[{"topic":"","why":""}],"questions_to_ask":[""]}',
].join("\n");

export function buildPrepPrompt(
  job: Pick<JobRow, "title" | "company" | "description_text">,
  vault: VaultSnapshot,
  requirements: string[],
  feedback: string[] = []
): BuiltPrompt {
  const { approved } = factIndex(vault);
  const projectName = new Map(vault.projects.map((p) => [p.id, p.name]));
  const expName = new Map(vault.experiences.map((x) => [x.id, `${x.role} at ${x.company}`]));
  const lines: string[] = [];
  lines.push(`Job: ${job.title} at ${job.company}`);
  lines.push(`Job posting:\n${(job.description_text || "").slice(0, 6000)}`);
  if (requirements.length) lines.push(`\nStated requirements (from the analysis):\n${requirements.map((r) => `- ${r}`).join("\n")}`);
  lines.push("\nRoles:");
  for (const x of vault.experiences) lines.push(`- ${x.role} at ${x.company}`);
  lines.push("\nProjects:");
  for (const p of vault.projects) lines.push(`- ${p.name}: ${p.technologies.join(", ")}`);
  lines.push("\nFacts:");
  approved.forEach((f, i) => {
    const where = f.project_id ? projectName.get(f.project_id) : f.experience_id ? expName.get(f.experience_id) : null;
    lines.push(`[F${i + 1}] ${f.fact_text}${where ? ` (${where})` : ""}`);
  });
  if (feedback.length) {
    lines.push(`\nYour previous answer broke these rules. Fix them; drop a detail if no fact supports it:\n${feedback.map((f) => `- ${f}`).join("\n")}`);
  }
  return { system: SYSTEM, user: lines.join("\n") };
}

export function checkPrep(raw: RawPrep, vault: VaultSnapshot): CheckedPrep {
  const { byLabel } = factIndex(vault);
  const allowedSkills = vaultSkillSet(vault);
  const allowedNumbers = numbersIn(vaultCorpus(vault));
  const stories = raw.stories
    .filter((s) => s.title.trim() && s.action.trim())
    .map((s) => {
      const found = (s.facts || []).map((l) => byLabel.get(l.trim().toUpperCase())).filter(Boolean) as { id: string; text: string }[];
      const claimText = [s.situation, s.task, s.action, s.result].join(" ");
      const issues: string[] = [];
      const unknownSkills = extractSkills(claimText).filter((k) => !allowedSkills.has(k));
      if (unknownSkills.length) issues.push(`Mentions ${unknownSkills.join(", ")}, which isn't in your Career Vault.`);
      const cited = numbersIn(found.map((f) => f.text).join("\n"));
      const unknownNumbers = [...numbersIn(claimText)].filter((n) => !allowedNumbers.has(n) && !cited.has(n));
      if (unknownNumbers.length) issues.push(`Uses ${unknownNumbers.join(", ")}, which isn't in your facts.`);
      if (!found.length) issues.push("Cites no Career Vault fact.");
      const { facts: _facts, ...rest } = s;
      void _facts;
      return { ...rest, factIds: found.map((f) => f.id), factTexts: found.map((f) => f.text), issues };
    });
  return {
    stories,
    topics: raw.topics.filter((t) => t.topic.trim()).slice(0, 8),
    questions: raw.questions_to_ask.map((q) => q.trim()).filter(Boolean).slice(0, 6),
  };
}

export function prepFeedback(prep: CheckedPrep): string[] {
  return prep.stories.flatMap((s) => s.issues.map((i) => `Story "${s.title}": ${i}`));
}

export interface BankStory extends CheckedStory {
  jobs: { id: string; label: string }[];
}

/**
 * The story bank: stories from every job's prep, merged when they rest on
 * the same facts (the same story told for different jobs), most reused first.
 */
export function storyBank(preps: { jobId: string; label: string; stories: CheckedStory[] }[]): BankStory[] {
  const byKey = new Map<string, BankStory>();
  for (const p of preps) {
    for (const s of p.stories) {
      const key = s.factIds.length ? [...s.factIds].sort().join(",") : `title:${s.title.toLowerCase()}`;
      const cur = byKey.get(key);
      if (cur) {
        if (!cur.jobs.some((j) => j.id === p.jobId)) cur.jobs.push({ id: p.jobId, label: p.label });
      } else {
        byKey.set(key, { ...s, jobs: [{ id: p.jobId, label: p.label }] });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.jobs.length - a.jobs.length || a.issues.length - b.issues.length);
}
