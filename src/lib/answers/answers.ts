// Application-question answers: prompt building and truthfulness checks.
// Pure and unit-tested; the model call lives in src/lib/ai/answers.ts.
//
// The model sees your approved facts as [F1], [F2], ... plus your education,
// roles and projects with dates. Every draft must cite the facts it used, fit
// the character limit, and may not mention a technology or number that isn't
// in your Career Vault; drafts that break a rule are shown with the problem,
// never silently passed.

import type { BuiltPrompt } from "../ai/prompts";
import { numbersIn } from "../ai/guard";
import { vaultSkillSet } from "../matching/score";
import { extractSkills } from "../jobs/skills";
import type { JobRow, VaultSnapshot } from "../types";

export interface AnswerRequest {
  question: string;
  /** Character limit of the answer box; null = no limit given. */
  charLimit: number | null;
  /** Options of a dropdown / radio question, one per entry. Empty = free text. */
  options: string[];
}

export interface RawDraft {
  text: string;
  facts: string[]; // "F3" style ids
}

export interface RawAnswer {
  drafts: RawDraft[];
  choice: { option: string; reason: string; facts: string[] } | null;
  unsupported: string;
}

export interface CheckedDraft {
  text: string;
  length: number;
  factIds: string[];
  factTexts: string[];
  issues: string[];
}

export interface CheckedAnswer {
  drafts: CheckedDraft[];
  choice: { option: string; reason: string; factIds: string[]; factTexts: string[]; issues: string[] } | null;
  unsupported: string;
}

/** Short answers use the fast model; essays use the smart one. */
export function answerTier(req: AnswerRequest): "fast" | "smart" {
  return req.options.length > 0 || (req.charLimit !== null && req.charLimit <= 400) ? "fast" : "smart";
}

export function factIndex(vault: VaultSnapshot) {
  const approved = vault.facts.filter((f) => f.status === "approved").slice(0, 120);
  const byLabel = new Map<string, { id: string; text: string }>();
  approved.forEach((f, i) => byLabel.set(`F${i + 1}`, { id: f.id, text: f.fact_text }));
  return { approved, byLabel };
}

const range = (a: string | null | undefined, b: string | null | undefined, current = false) =>
  `${a || "?"}–${current ? "present" : b || (a ? "present" : "?")}`;

/** Everything in the vault as text, for the number check. */
export function vaultCorpus(vault: VaultSnapshot): string {
  return [
    ...vault.education.map((e) => `${e.school} ${e.degree ?? ""} ${e.major ?? ""} ${e.start_date ?? ""} ${e.expected_graduation ?? ""} ${e.gpa ?? ""} ${e.coursework.join(" ")}`),
    ...vault.experiences.map((x) => `${x.role} ${x.company} ${x.start_date ?? ""} ${x.end_date ?? ""} ${x.summary ?? ""}`),
    ...vault.projects.map((p) => `${p.name} ${p.technologies.join(" ")} ${p.start_date ?? ""} ${p.end_date ?? ""} ${p.description ?? ""}`),
    ...vault.skills.flatMap((s) => s.items),
    ...vault.facts.filter((f) => f.status === "approved").map((f) => f.fact_text),
  ].join("\n");
}

const SYSTEM = [
  "You write answers to job application screening questions for a student, using ONLY the facts provided.",
  "Hard rules:",
  "- Every claim must come from the listed facts, education, roles or projects. Never add a skill, tool, number, title, employer, duration or outcome that isn't there.",
  "- Cite the fact ids you used (e.g. [\"F3\",\"F12\"]) for each draft.",
  "- Stay within the character limit, counting every character including spaces. Shorter is fine.",
  "- Plain, specific, first-person-implied style (no 'I am passionate'). Name concrete projects, tools and real numbers from the facts.",
  "- If the question asks for something the facts can't support (a skill, a date, a duration, eligibility, a preference), say exactly what's missing in `unsupported` and keep drafts to what IS supported. If nothing is supported, return no drafts.",
  "- Questions about work authorization, salary, relocation, availability or personal preferences can't be answered from facts: return no drafts and explain in `unsupported` that the person must answer it themselves.",
  "For multiple-choice questions (options given): pick exactly one option, copied verbatim, in `choice`, with a one-sentence reason grounded in facts.",
  "- Years of experience: count from the earliest dated relevant role or project to today; say it's project/student experience if so.",
  "- Skill-level ratings: choose the level the facts honestly support. For a student, avoid the top level unless the facts show professional-level depth, and say why.",
  "Return 2 or 3 drafts that differ (e.g. one project-focused, one skills-focused) for free-text questions.",
  'Respond with ONE JSON object only: {"drafts":[{"text":"","facts":["F1"]}],"choice":null,"unsupported":""}',
  'For choice questions: {"drafts":[],"choice":{"option":"","reason":"","facts":["F1"]},"unsupported":""}',
].join("\n");

export function buildAnswerPrompt(
  req: AnswerRequest,
  vault: VaultSnapshot,
  job: Pick<JobRow, "title" | "company" | "description_text"> | null,
  today = new Date()
): BuiltPrompt {
  const { approved } = factIndex(vault);
  const projectName = new Map(vault.projects.map((p) => [p.id, p.name]));
  const expName = new Map(vault.experiences.map((x) => [x.id, `${x.role} at ${x.company}`]));
  const lines: string[] = [];
  lines.push(`Today: ${today.toISOString().slice(0, 10)}`);
  lines.push(`Question: ${req.question.trim()}`);
  lines.push(req.charLimit ? `Character limit: ${req.charLimit} (hard maximum)` : "Character limit: none given; keep it under 600 characters.");
  if (req.options.length) lines.push(`Options (pick one, verbatim):\n${req.options.map((o) => `- ${o}`).join("\n")}`);
  if (job) {
    lines.push(`Job: ${job.title} at ${job.company}`);
    if (job.description_text) lines.push(`Job description (excerpt):\n${job.description_text.slice(0, 2500)}`);
  }
  lines.push("\nEducation:");
  for (const e of vault.education) {
    lines.push(`- ${[e.degree, e.major].filter(Boolean).join(", ")} at ${e.school} (${e.start_date || "start date not recorded"} – expected ${e.expected_graduation || "?"})${e.coursework.length ? `; coursework: ${e.coursework.join(", ")}` : ""}`);
  }
  lines.push("\nRoles:");
  for (const x of vault.experiences) lines.push(`- ${x.role} at ${x.company} (${range(x.start_date, x.end_date, x.is_current)})`);
  lines.push("\nProjects:");
  for (const p of vault.projects) lines.push(`- ${p.name} (${range(p.start_date, p.end_date)}): ${p.technologies.join(", ")}`);
  lines.push("\nSkills:");
  for (const s of vault.skills) if (s.items.length) lines.push(`- ${s.category}: ${s.items.join(", ")}`);
  lines.push("\nFacts:");
  approved.forEach((f, i) => {
    const where = f.project_id ? projectName.get(f.project_id) : f.experience_id ? expName.get(f.experience_id) : null;
    lines.push(`[F${i + 1}] ${f.fact_text}${where ? ` (${where})` : ""}`);
  });
  return { system: SYSTEM, user: lines.join("\n") };
}

/** Check a model answer against the limit and the vault; map fact labels to ids. */
export function checkAnswer(raw: RawAnswer, req: AnswerRequest, vault: VaultSnapshot): CheckedAnswer {
  const { byLabel } = factIndex(vault);
  const allowedSkills = vaultSkillSet(vault);
  const allowedNumbers = numbersIn(vaultCorpus(vault));
  const resolve = (labels: string[]) => {
    const found = labels.map((l) => byLabel.get(l.trim().toUpperCase())).filter(Boolean) as { id: string; text: string }[];
    return { factIds: found.map((f) => f.id), factTexts: found.map((f) => f.text) };
  };
  const problems = (text: string, citedTexts: string[]) => {
    const issues: string[] = [];
    if (req.charLimit && text.length > req.charLimit) issues.push(`${text.length - req.charLimit} characters over the ${req.charLimit} limit.`);
    const unknownSkills = extractSkills(text).filter((s) => !allowedSkills.has(s));
    if (unknownSkills.length) issues.push(`Mentions ${unknownSkills.join(", ")}, which isn't in your Career Vault.`);
    const cited = numbersIn(citedTexts.join("\n"));
    const unknownNumbers = [...numbersIn(text)].filter((n) => !allowedNumbers.has(n) && !cited.has(n));
    if (unknownNumbers.length) issues.push(`Uses ${unknownNumbers.join(", ")}, which isn't in your facts.`);
    return issues;
  };

  const drafts = raw.drafts
    .map((d) => d.text.trim())
    .map((text, i) => ({ text, ...resolve(raw.drafts[i].facts || []) }))
    .filter((d) => d.text.length > 0)
    .map((d) => ({ ...d, length: d.text.length, issues: problems(d.text, d.factTexts) }));

  let choice: CheckedAnswer["choice"] = null;
  if (raw.choice && req.options.length) {
    const exact = req.options.find((o) => o.trim().toLowerCase() === raw.choice!.option.trim().toLowerCase());
    const r = resolve(raw.choice.facts || []);
    choice = {
      option: exact ?? raw.choice.option,
      reason: raw.choice.reason,
      ...r,
      issues: exact ? problems(raw.choice.reason, r.factTexts).filter((i) => !/over the/.test(i)) : ["That isn't one of the options; pick one yourself."],
    };
  }
  return { drafts, choice, unsupported: raw.unsupported?.trim() ?? "" };
}

// ---------------------------------------------------------------------------
// Answer bank: find answers to similar questions you've already written
// ---------------------------------------------------------------------------

const STOP = new Set(
  "a an and are as at be by do does for from have how i if in is it its me my of on or our please the this to us we what when where which who why will with you your yours enter explain describe tell about".split(" ")
);

export function questionWords(q: string): Set<string> {
  return new Set(
    q
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .split(/[^a-z0-9+#]+/)
      .filter((w) => w.length > 1 && !STOP.has(w))
  );
}

/** Jaccard similarity of the questions' meaningful words (0..1). */
export function questionSimilarity(a: string, b: string): number {
  const x = questionWords(a);
  const y = questionWords(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

export function findSimilar<T extends { question: string }>(question: string, saved: T[], min = 0.45, limit = 3): T[] {
  return saved
    .map((s) => ({ s, score: questionSimilarity(question, s.question) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

/** "Options" box text -> list (one per line, blanks dropped). */
export function parseOptions(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}
