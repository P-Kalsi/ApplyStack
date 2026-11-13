import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "applystack-answers-test-"));
process.env.APPLYSTACK_CONFIG = join(dir, "applystack.config.json");
process.env.APPLYSTACK_LLM_PROVIDER = "anthropic";
process.env.ANTHROPIC_API_KEY = "test-key-not-used";

import {
  answerTier,
  buildAnswerPrompt,
  checkAnswer,
  findSimilar,
  parseOptions,
  questionSimilarity,
  type AnswerRequest,
} from "../src/lib/answers/answers";
import { draftAnswers } from "../src/lib/ai/answers";
import { _internals } from "../src/lib/ai/llm";
import type { VaultSnapshot } from "../src/lib/types";

const VAULT = {
  education: [
    {
      id: "e1", user_id: "u", school: "University of British Columbia", degree: "Bachelor of Science",
      major: "Computer Science", location: "Vancouver, BC", start_date: null, expected_graduation: "May 2028",
      gpa: null, coursework: ["Computer Systems (CPSC 213)"], sort_order: 0,
    },
  ],
  experiences: [
    { id: "x1", user_id: "u", company: "Campus Tech Help Desk", role: "Software Developer Intern", location: null, start_date: "Jan 2026", end_date: null, is_current: true, summary: null, sort_order: 0 },
  ],
  projects: [
    { id: "p1", user_id: "u", name: "InsightUBC", technologies: ["TypeScript", "Node.js", "Mocha"], start_date: "Jan 2024", end_date: "Apr 2024", description: null, links: [], sort_order: 0 },
    { id: "p2", user_id: "u", name: "SaveMyGrade", technologies: ["Python", "Flask", "React"], start_date: "Feb 2026", end_date: null, description: null, links: [], sort_order: 1 },
  ],
  skills: [{ id: "s1", user_id: "u", category: "languages", items: ["Python", "TypeScript", "SQL"], sort_order: 0 }],
  facts: [
    { id: "11111111-1111-4111-8111-111111111111", user_id: "u", experience_id: null, project_id: "p1", fact_text: "Built a 75+ case unit and integration test suite (Mocha/Chai) for InsightUBC.", category: "general", keywords: ["typescript"], source: "manual", status: "approved" },
    { id: "22222222-2222-4222-8222-222222222222", user_id: "u", experience_id: null, project_id: "p2", fact_text: "Engineered data ingestion pipelines over 3,300+ professor review files in Python.", category: "general", keywords: ["python"], source: "manual", status: "approved" },
    { id: "33333333-3333-4333-8333-333333333333", user_id: "u", experience_id: null, project_id: null, fact_text: "A rejected claim about Kubernetes.", category: "general", keywords: [], source: "manual", status: "rejected" },
  ],
} as unknown as VaultSnapshot;

const Q: AnswerRequest = { question: "Strong Python and TypeScript skills (Explain how you developed this skill.)", charLimit: 140, options: [] };

test("prompt lists approved facts as F-ids with context, never rejected ones", () => {
  const p = buildAnswerPrompt(Q, VAULT, { title: "Data Intern", company: "Acme", description_text: "Python pipelines" }, new Date("2026-11-13"));
  assert.match(p.user, /\[F1\] Built a 75\+ case unit[\s\S]*\(InsightUBC\)/);
  assert.match(p.user, /\[F2\] Engineered data ingestion/);
  assert.ok(!p.user.includes("Kubernetes"));
  assert.match(p.user, /Character limit: 140/);
  assert.match(p.user, /InsightUBC \(Jan 2024–Apr 2024\)/);
  assert.match(p.user, /Job: Data Intern at Acme/);
  assert.match(p.system, /Never add a skill/);
});

test("drafts are checked: limit, unknown tech, unknown numbers, fact ids resolved", () => {
  const checked = checkAnswer(
    {
      drafts: [
        { text: "Python pipelines over 3,300+ review files (SaveMyGrade) and a 75+ case TypeScript test suite for InsightUBC.", facts: ["F2", "f1"] },
        { text: "Used Python, TypeScript and Kubernetes at 12 companies over 9 years building enormous distributed systems for everyone everywhere, every single day of the week.", facts: [] },
      ],
      choice: null,
      unsupported: "",
    },
    Q,
    VAULT
  );
  assert.deepEqual(checked.drafts[0].issues, []);
  assert.deepEqual(checked.drafts[0].factIds, ["22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111"]);
  const bad = checked.drafts[1].issues.join(" | ");
  assert.match(bad, /over the 140 limit/);
  assert.match(bad, /kubernetes/);
  assert.match(bad, /12, 9/);
});

test("choice answers must be one of the options, verbatim", () => {
  const req = { ...Q, options: ["None", "Basic", "Good", "Very Good", "Excellent"] };
  const ok = checkAnswer({ drafts: [], choice: { option: "very good", reason: "Two years of project work.", facts: ["F1"] }, unsupported: "" }, req, VAULT);
  assert.equal(ok.choice!.option, "Very Good");
  assert.deepEqual(ok.choice!.issues, []);
  const off = checkAnswer({ drafts: [], choice: { option: "Expert", reason: "x", facts: [] }, unsupported: "" }, req, VAULT);
  assert.match(off.choice!.issues[0], /isn't one of the options/);
});

test("tier: short and choice questions use the fast model", () => {
  assert.equal(answerTier(Q), "fast");
  assert.equal(answerTier({ ...Q, charLimit: null }), "smart");
  assert.equal(answerTier({ ...Q, charLimit: 2000 }), "smart");
  assert.equal(answerTier({ ...Q, charLimit: null, options: ["Yes", "No"] }), "fast");
});

test("similar questions from the answer bank", () => {
  const a = "Strong Python and TypeScript programming skills; proficiency in SQL (Explain how you developed this skill.)";
  const b = "Python and TypeScript programming skills (explain how you developed this skill)";
  const c = "Are you legally eligible to work in Canada?";
  assert.ok(questionSimilarity(a, b) > 0.5);
  assert.ok(questionSimilarity(a, c) < 0.1);
  assert.deepEqual(findSimilar(b, [{ question: c }, { question: a }]).map((x) => x.question), [a]);
  assert.deepEqual(parseOptions(" None \n\nBasic\n"), ["None", "Basic"]);
});

test("draftAnswers retries once when every draft is over the limit", async () => {
  const replies = [
    JSON.stringify({ drafts: [{ text: "x".repeat(200), facts: ["F1"] }], choice: null, unsupported: "" }),
    JSON.stringify({ drafts: [{ text: "Built a 75+ case Mocha/Chai test suite for InsightUBC in TypeScript.", facts: ["F1"] }], choice: null, unsupported: "" }),
  ];
  const prompts: string[] = [];
  const original = _internals.transport;
  _internals.transport = async ({ prompt, model }) => {
    prompts.push(`${model}: ${prompt.slice(-160)}`);
    return { text: replies.shift()!, costUsd: null };
  };
  try {
    const res = await draftAnswers(Q, VAULT, null);
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /MUST be at most 140 characters/);
    assert.equal(res.drafts.length, 1);
    assert.deepEqual(res.drafts[0].issues, []);
    assert.equal(res.model, "claude-haiku-5-5");
  } finally {
    _internals.transport = original;
  }
});
