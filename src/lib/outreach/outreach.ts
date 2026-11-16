// Outreach drafts for a job: an application email, a referral request, a note
// to the hiring manager, and short LinkedIn notes for a recruiter or a peer.
// Same rules as cover letters: your voice from your past letters, claims only
// from approved facts (checked for invented skills and numbers), nothing sent
// for you. Ideas adapted from career-ops' email and contact modes
// (https://github.com/career-ops-hq/career-ops, MIT). Pure and unit-tested.

import type { BuiltPrompt } from "../ai/prompts";
import { factIndex } from "../answers/answers";
import { checkLetter } from "../letters/letters";
import type { JobRow, VaultSnapshot } from "../types";

export const OUTREACH_KINDS = [
  {
    value: "application_email",
    label: "Application email",
    limit: 1500,
    subject: true,
    guide: "A short email applying for the role, to a recruiter or careers inbox: who you are, why this role, two or three fit points from the facts, and that your resume is attached.",
  },
  {
    value: "referral",
    label: "Referral request",
    limit: 900,
    subject: true,
    guide: "A polite email to someone at the company asking whether they'd be comfortable referring you: why this role, one or two fit points, and an easy way to say no.",
  },
  {
    value: "hiring_manager",
    label: "Note to the hiring manager",
    limit: 1100,
    subject: true,
    guide: "A short note to the person who would manage the role: one specific thing about the team's work from the posting, the most relevant thing you've built, and interest in a brief chat.",
  },
  {
    value: "linkedin_recruiter",
    label: "LinkedIn note to a recruiter",
    limit: 300,
    subject: false,
    guide: "A LinkedIn connection note to a recruiter: the role, one fit point, a clear ask. At most 300 characters including spaces.",
  },
  {
    value: "linkedin_peer",
    label: "LinkedIn note to an engineer",
    limit: 300,
    subject: false,
    guide: "A LinkedIn connection note to an engineer on the team: genuine interest in their work from the posting, one shared interest from the facts, a light ask to hear about the team. At most 300 characters.",
  },
] as const;

export type OutreachKind = (typeof OUTREACH_KINDS)[number]["value"];

export function outreachKind(kind: string) {
  return OUTREACH_KINDS.find((k) => k.value === kind) ?? null;
}

/** What to attach, by kind; LinkedIn notes take none. */
export function attachments(kind: OutreachKind, hasLetter: boolean): string[] {
  if (kind === "application_email") return ["Your tailored resume (PDF)", ...(hasLetter ? ["Your cover letter (PDF)"] : [])];
  if (kind === "referral") return ["Your tailored resume (PDF), so they can submit it"];
  if (kind === "hiring_manager") return ["Your resume (PDF), optional"];
  return [];
}

const SYSTEM = [
  "You draft a short outreach message for a student, in their own voice, using ONLY the facts provided.",
  "- Every claim about the candidate must come from the listed facts. Never add a skill, tool, number, title, employer or outcome that isn't there. Cite the fact ids you used.",
  "- Voice samples are the candidate's past letters to OTHER employers: copy their voice, never their content or names.",
  "- Don't state work authorization, availability, salary or contact details. Don't invent anything about the recipient: use [name] if no name is given.",
  "- No flattery, no 'I hope this finds you well', no exclamation marks. Plain and specific.",
  "- Stay within the character limit, counting every character.",
  'Respond with ONE JSON object only: {"subject":"","body":"","facts":["F1"]} (subject empty for LinkedIn notes).',
].join("\n");

export function buildOutreachPrompt(
  job: Pick<JobRow, "title" | "company" | "description_text">,
  vault: VaultSnapshot,
  samples: { body: string[] }[],
  kind: OutreachKind,
  recipient: string,
  feedback: string[] = []
): BuiltPrompt {
  const k = outreachKind(kind)!;
  const { approved } = factIndex(vault);
  const lines = [
    `Message: ${k.label}. ${k.guide}`,
    `Character limit for the body: ${k.limit}`,
    `Recipient: ${recipient.trim() || "[name]"}`,
    `Job: ${job.title} at ${job.company}`,
    `Job posting (excerpt):\n${(job.description_text || "").slice(0, 3000)}`,
  ];
  if (samples.length) {
    lines.push("\nVoice samples (body only; voice reference, NOT facts):");
    samples.slice(0, 2).forEach((s, i) => lines.push(`<sample ${i + 1}>\n${s.body.join("\n\n")}\n</sample ${i + 1}>`));
  }
  lines.push("\nEducation:");
  for (const e of vault.education) lines.push(`- ${[e.degree, e.major].filter(Boolean).join(", ")} at ${e.school}`);
  lines.push("\nFacts:");
  approved.forEach((f, i) => lines.push(`[F${i + 1}] ${f.fact_text}`));
  if (feedback.length) lines.push(`\nFix these problems from your previous draft:\n${feedback.map((f) => `- ${f}`).join("\n")}`);
  return { system: SYSTEM, user: lines.join("\n") };
}

export interface RawOutreach {
  subject: string;
  body: string;
  facts: string[];
}

export interface CheckedOutreach {
  subject: string;
  body: string;
  length: number;
  limit: number;
  factTexts: string[];
  issues: string[];
}

export function checkOutreach(raw: RawOutreach, kind: OutreachKind, vault: VaultSnapshot): CheckedOutreach {
  const k = outreachKind(kind)!;
  const body = raw.body.trim();
  const checked = checkLetter({ paragraphs: [{ text: body, facts: raw.facts }], gaps: [] }, vault);
  const issues = [...(checked.paragraphs[0]?.issues ?? [])];
  if (body.length > k.limit) issues.push(`${body.length - k.limit} characters over the ${k.limit} limit.`);
  if (!body) issues.push("The draft was empty.");
  return {
    subject: k.subject ? raw.subject.trim() : "",
    body,
    length: body.length,
    limit: k.limit,
    factTexts: checked.paragraphs[0]?.factTexts ?? [],
    issues,
  };
}
