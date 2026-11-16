// Cover letters in your own voice: prompt building and truthfulness checks.
// Pure and unit-tested; the model call lives in src/lib/ai/letters.ts.
//
// Your past letters ("writing samples") set the voice: the model sees only
// their body paragraphs (never the address block, contact details or who
// they were addressed to) and is told to borrow phrasing and structure, not
// claims. Every claim in a new letter must come from approved Career Vault
// facts and cite them as [F1], [F2]...; a paragraph that mentions a skill or
// number your vault can't back is flagged. Angles adapted from career-ops'
// cover letter mode (https://github.com/career-ops-hq/career-ops, MIT).

import type { BuiltPrompt } from "../ai/prompts";
import { numbersIn } from "../ai/guard";
import { factIndex, vaultCorpus } from "../answers/answers";
import { vaultSkillSet } from "../matching/score";
import { canonicalizeSkillList, extractSkills } from "../jobs/skills";
import type { JobRow, VaultSnapshot } from "../types";

export const LETTER_FOCUS = [
  { value: "fit", label: "Why this role fits me" },
  { value: "problems", label: "Problems I'd help solve" },
  { value: "approach", label: "How I work" },
] as const;
export type LetterFocus = (typeof LETTER_FOCUS)[number]["value"];

export const LETTER_TONE = [
  { value: "mine", label: "Like my past letters" },
  { value: "formal", label: "More formal" },
  { value: "warm", label: "Warmer, more conversational" },
] as const;
export type LetterTone = (typeof LETTER_TONE)[number]["value"];

export interface WritingSample {
  id: string;
  title: string;
  content: string;
}

export interface LetterParts {
  header: string[];
  date: string | null;
  recipient: string[];
  greeting: string | null;
  body: string[];
  closing: string[];
}

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_RE = new RegExp(`^(?:${MONTH}\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+${MONTH}\\.?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})$`, "i");
const GREETING_RE = /^(dear|hello|hi|to whom it may concern|greetings)\b/i;
const CLOSING_RE = /^(sincerely|best regards|kind regards|warm regards|regards|best|respectfully|yours (?:truly|sincerely)|thank you(?: for your (?:time|consideration))?)[,.!]?$/i;

/** Split a letter (one paragraph per line) into header, date, recipient, greeting, body and closing. */
export function splitLetter(text: string): LetterParts {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const greetingIdx = lines.findIndex((l) => GREETING_RE.test(l) && l.length < 80);
  const closingIdx = lines.findIndex((l, i) => i > greetingIdx && CLOSING_RE.test(l));
  const dateIdx = lines.findIndex((l, i) => (greetingIdx === -1 || i < greetingIdx) && DATE_RE.test(l));

  const beforeGreeting = greetingIdx === -1 ? [] : lines.slice(0, greetingIdx);
  const header = dateIdx === -1 ? [] : beforeGreeting.slice(0, dateIdx);
  const recipient = dateIdx === -1 ? [] : beforeGreeting.slice(dateIdx + 1);
  const bodyStart = greetingIdx === -1 ? 0 : greetingIdx + 1;
  const bodyEnd = closingIdx === -1 ? lines.length : closingIdx;
  return {
    header,
    date: dateIdx === -1 ? null : lines[dateIdx],
    recipient,
    greeting: greetingIdx === -1 ? null : lines[greetingIdx],
    body: lines.slice(bodyStart, bodyEnd).filter((l) => l.length > 40),
    closing: closingIdx === -1 ? [] : lines.slice(closingIdx),
  };
}

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const STREET_RE = /\b\d{1,6}\s+(?:[A-Z][a-z]+\s){1,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Way|Cres|Crescent|Pl|Place|Lane|Ln|Court|Ct)\b\.?/g;
const POSTAL_RE = /\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/g;

/** Remove contact details a letter body might mention ("contact me at ..."). */
export function redactContact(text: string): string {
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(STREET_RE, "[address]")
    .replace(POSTAL_RE, "[postal code]");
}

/** The samples most like this job (by shared skills), body paragraphs only, contact details removed. */
export function pickSamples(
  samples: WritingSample[],
  job: Pick<JobRow, "title" | "description_text" | "skills">,
  max = 3
): { id: string; body: string[] }[] {
  const wanted = new Set(
    job.skills?.length ? canonicalizeSkillList(job.skills) : extractSkills(`${job.title}\n${job.description_text || ""}`)
  );
  return samples
    .map((s, i) => {
      const body = splitLetter(s.content).body.map(redactContact);
      const have = extractSkills(body.join("\n"));
      const overlap = have.filter((k) => wanted.has(k)).length;
      return { id: s.id, body, score: overlap * 10 - i }; // ties: newest first (samples arrive newest first)
    })
    .filter((s) => s.body.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ id, body }) => ({ id, body }));
}

const FOCUS_TEXT: Record<LetterFocus, string> = {
  fit: "Lead with why this specific role and team fit the candidate's studies and the work they enjoy.",
  problems: "Lead with the problems this team is working on (from the posting) and the candidate's work that shows they could help with them.",
  approach: "Lead with how the candidate works: how they build, test, learn and collaborate, shown through their projects.",
};

const TONE_TEXT: Record<LetterTone, string> = {
  mine: "Match the voice of the writing samples as closely as you can: their vocabulary, sentence length, openings and how direct they are.",
  formal: "Keep the samples' structure but make the wording more formal and concise.",
  warm: "Keep the samples' structure but make it warmer and more conversational, still professional.",
};

const SYSTEM = [
  "You write a cover letter body for a student, in their own voice, using ONLY the facts provided.",
  "Hard rules:",
  "- Every claim about the candidate must come from the listed facts, education, roles, projects or skills. Never add a skill, tool, number, title, employer, duration, award or outcome that isn't there.",
  "- Cite the fact ids each paragraph relies on, e.g. [\"F3\",\"F12\"]. A paragraph that only talks about the company or role may cite none.",
  "- The writing samples are the candidate's past letters to OTHER employers. Copy their voice and structure, not their content: never mention a company, person, project detail or claim from a sample unless the same thing is in the facts.",
  "- Do not state work authorization, citizenship, availability dates, hours, location willingness, salary, wage subsidies or contact details. The candidate adds those.",
  "- If the posting's stated requirements include something the facts don't support, you may add one short honest sentence saying so (as the samples do, e.g. \"I want to be upfront that I have not used X yet\") and why they'd learn it quickly, grounded in facts.",
  "- No greeting line, no sign-off, no address block: body paragraphs only. 3 to 5 paragraphs, 250 to 420 words in total.",
  "- Describe the company's work only from the job posting. Don't invent facts about the company.",
  'Respond with ONE JSON object only: {"paragraphs":[{"text":"","facts":["F1"]}],"gaps":["requirement you acknowledged as missing"]}',
].join("\n");

export function buildLetterPrompt(
  job: Pick<JobRow, "title" | "company" | "location" | "description_text">,
  vault: VaultSnapshot,
  samples: { body: string[] }[],
  focus: LetterFocus,
  tone: LetterTone,
  feedback: string[] = []
): BuiltPrompt {
  const { approved } = factIndex(vault);
  const projectName = new Map(vault.projects.map((p) => [p.id, p.name]));
  const expName = new Map(vault.experiences.map((x) => [x.id, `${x.role} at ${x.company}`]));
  const lines: string[] = [];
  lines.push(`Job: ${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}`);
  lines.push(`Job posting:\n${(job.description_text || "").slice(0, 6000)}`);
  lines.push(`\nFocus: ${FOCUS_TEXT[focus]}`);
  lines.push(`Tone: ${TONE_TEXT[tone]}`);

  if (samples.length) {
    lines.push("\nWriting samples (the candidate's past letters, body only; voice reference, NOT facts):");
    samples.forEach((s, i) => lines.push(`<sample ${i + 1}>\n${s.body.join("\n\n")}\n</sample ${i + 1}>`));
  } else {
    lines.push("\nNo writing samples: write plainly and specifically, first person, no clichés.");
  }

  lines.push("\nEducation:");
  for (const e of vault.education) {
    lines.push(`- ${[e.degree, e.major].filter(Boolean).join(", ")} at ${e.school}${e.expected_graduation ? ` (expected ${e.expected_graduation})` : ""}`);
  }
  lines.push("\nRoles:");
  for (const x of vault.experiences) lines.push(`- ${x.role} at ${x.company}${x.summary ? `: ${x.summary}` : ""}`);
  lines.push("\nProjects:");
  for (const p of vault.projects) lines.push(`- ${p.name}: ${p.technologies.join(", ")}${p.description ? `. ${p.description}` : ""}`);
  lines.push("\nSkills:");
  for (const s of vault.skills) if (s.items.length) lines.push(`- ${s.category}: ${s.items.join(", ")}`);
  lines.push("\nFacts:");
  approved.forEach((f, i) => {
    const where = f.project_id ? projectName.get(f.project_id) : f.experience_id ? expName.get(f.experience_id) : null;
    lines.push(`[F${i + 1}] ${f.fact_text}${where ? ` (${where})` : ""}`);
  });
  if (feedback.length) {
    lines.push(`\nYour previous draft broke these rules. Fix them; remove the claim if no fact supports it:\n${feedback.map((f) => `- ${f}`).join("\n")}`);
  }
  return { system: SYSTEM, user: lines.join("\n") };
}

export interface RawLetter {
  paragraphs: { text: string; facts: string[] }[];
  gaps: string[];
}

export interface CheckedParagraph {
  text: string;
  factIds: string[];
  factTexts: string[];
  issues: string[];
}

export interface CheckedLetter {
  paragraphs: CheckedParagraph[];
  gaps: string[];
  words: number;
  issues: string[];
}

/** Sentences that say the candidate lacks something may name a skill they don't have. */
const NEGATION_RE = /\b(not|n't|never|no experience|haven't|have not|yet|new to|learn(?:ing)?|unfamiliar)\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

export function checkLetter(raw: RawLetter, vault: VaultSnapshot): CheckedLetter {
  const { byLabel } = factIndex(vault);
  const allowedSkills = vaultSkillSet(vault);
  const allowedNumbers = numbersIn(vaultCorpus(vault));

  const paragraphs = raw.paragraphs
    .map((p) => ({ ...p, text: p.text.replace(/\s+/g, " ").trim() }))
    .filter((p) => p.text.length > 0)
    .map((p) => {
      const found = (p.facts || [])
        .map((l) => byLabel.get(l.trim().toUpperCase()))
        .filter(Boolean) as { id: string; text: string }[];
      const issues: string[] = [];
      const unknownSkills = new Set<string>();
      for (const s of sentences(p.text)) {
        if (NEGATION_RE.test(s)) continue;
        for (const k of extractSkills(s)) if (!allowedSkills.has(k)) unknownSkills.add(k);
      }
      if (unknownSkills.size) issues.push(`Mentions ${[...unknownSkills].join(", ")}, which isn't in your Career Vault.`);
      const cited = numbersIn(found.map((f) => f.text).join("\n"));
      const unknownNumbers = [...numbersIn(p.text)].filter((n) => !allowedNumbers.has(n) && !cited.has(n));
      if (unknownNumbers.length) issues.push(`Uses ${unknownNumbers.join(", ")}, which isn't in your facts.`);
      return { text: p.text, factIds: found.map((f) => f.id), factTexts: found.map((f) => f.text), issues };
    });

  const words = paragraphs.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
  const issues: string[] = [];
  if (paragraphs.length === 0) issues.push("The draft was empty.");
  if (words > 480) issues.push(`About ${words} words; most letters fit on one page under 420.`);
  if (paragraphs.length && paragraphs.every((p) => p.factIds.length === 0)) {
    issues.push("No paragraph cites a Career Vault fact.");
  }
  return { paragraphs, gaps: raw.gaps.filter(Boolean), words, issues };
}

/** Re-check paragraphs you edited: skills and numbers only (your edits carry no fact citations). */
export function checkEdited(paragraphs: string[], vault: VaultSnapshot): string[] {
  const checked = checkLetter({ paragraphs: paragraphs.map((text) => ({ text, facts: [] })), gaps: [] }, vault);
  return checked.paragraphs.flatMap((p, i) => p.issues.map((x) => `Paragraph ${i + 1}: ${x}`));
}

/** Problems worth one automatic retry. */
export function letterFeedback(checked: CheckedLetter): string[] {
  return [...checked.issues, ...checked.paragraphs.flatMap((p, i) => p.issues.map((x) => `Paragraph ${i + 1}: ${x}`))];
}

/** "November 16, 2026" */
export function letterDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function defaultRecipient(job: Pick<JobRow, "company" | "location">): string[] {
  return ["Hiring Manager", job.company, job.location || ""].filter(Boolean);
}

/** The full letter as plain text: header (from your profile), date, recipient, greeting, body, sign-off. */
export function letterText(input: {
  header: string[];
  date: string;
  recipient: string[];
  greeting: string;
  paragraphs: string[];
  signOff: string;
  name: string;
}): string {
  return [
    ...(input.header.length ? [input.header.join("\n"), ""] : []),
    input.date,
    "",
    input.recipient.join("\n"),
    "",
    input.greeting,
    "",
    input.paragraphs.join("\n\n"),
    "",
    input.signOff,
    input.name,
  ].join("\n");
}
