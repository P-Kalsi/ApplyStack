import { test } from "node:test";
import assert from "node:assert/strict";
import { isGenericKeyword, tidyKeywordEvidence } from "../src/lib/ai/keywords";
import { sanitizeMatchReport } from "../src/lib/ai/guard";
import type { KeywordEvidence, MatchReport } from "../src/lib/ai/schemas";

const ev = (keyword: string, status: KeywordEvidence["status"]): KeywordEvidence => ({ keyword, status, evidence: "" });

test("the noisy Shopify-style list shrinks to real requirements", () => {
  const out = tidyKeywordEvidence([
    ev("Software Engineering", "missing"),
    ev("Commitment To Code Quality", "missing"),
    ev("Problem Solving With Code", "related"),
    ev("Ownership Of Projects", "related"),
    ev("Ruby", "missing"),
    ev("Ruby On Rails", "missing"),
    ev("Commerce", "related"),
    ev("E-commerce", "missing"),
    ev("Scalable Commerce Stack", "missing"),
    ev("Infrastructure", "related"),
    ev("Merchants", "missing"),
    ev("Ruby And Rails Communities", "missing"),
    ev("TypeScript", "verified"),
  ]).map((e) => `${e.keyword}:${e.status}`);
  assert.deepEqual(out, [
    "TypeScript:verified",
    "Commerce:related",
    "Infrastructure:related",
    "Ruby On Rails:missing",
    "Merchants:missing",
  ]);
});

test("a skill and its framework both stay when the support differs", () => {
  const out = tidyKeywordEvidence([ev("Python", "verified"), ev("Python and SQL", "related"), ev("SQL", "missing")]);
  assert.deepEqual(out.map((e) => e.keyword), ["Python", "SQL"]);
  const rails = tidyKeywordEvidence([ev("Ruby", "verified"), ev("Ruby on Rails", "missing")]);
  assert.deepEqual(rails.map((e) => e.keyword), ["Ruby", "Ruby on Rails"]);
  const pg = tidyKeywordEvidence([ev("Postgres", "missing"), ev("PostgreSQL", "verified")]);
  assert.deepEqual(pg.map((e) => `${e.keyword}:${e.status}`), ["PostgreSQL:verified"]);
});

test("generic means no technology in it", () => {
  assert.ok(isGenericKeyword("Strong communication skills"));
  assert.ok(isGenericKeyword("Software Engineering"));
  assert.ok(!isGenericKeyword("Software Engineering with Go"));
  assert.ok(!isGenericKeyword("Kubernetes"));
});

test("guard: education proves the field of study; non-tech claims become related, tech ones missing", () => {
  const report: MatchReport = {
    overall_match_score: 50, skills_match_score: 50, experience_match_score: 50, project_match_score: 50,
    matched_keywords: [], missing_keywords: [],
    keyword_evidence: [
      ev("Computer Science or a related field", "verified"),
      { keyword: "Data pipelines", status: "verified", evidence: "Built ingestion scripts." },
      ev("Kubernetes", "verified"),
    ],
    strongest_experiences: [], strongest_projects: [], potential_concerns: [],
  };
  const out = sanitizeMatchReport(report, new Set(["python"]), [], [{ degree: "Bachelor of Science", major: "Computer Science" }]);
  const by = Object.fromEntries(out.keyword_evidence.map((e) => [e.keyword, e]));
  assert.equal(by["Computer Science or a related field"].status, "verified");
  assert.equal(by["Data pipelines"].status, "related");
  assert.equal(by["Data pipelines"].evidence, "Built ingestion scripts.");
  assert.equal(by["Kubernetes"].status, "missing");
});
