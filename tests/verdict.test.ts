import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVerdict } from "../src/lib/matching/verdict";
import type { KeywordEvidence } from "../src/lib/ai/schemas";
import type { PostingSignal } from "../src/lib/jobs/posting-signals";

const ev = (keyword: string, status: KeywordEvidence["status"]): KeywordEvidence => ({ keyword, status, evidence: "" });
const analysis = { hard_requirements: ["Experience with Python and PostgreSQL"], required_skills: ["Docker"] };
const strong = [ev("Python", "verified"), ev("PostgreSQL", "verified"), ev("Docker", "verified"), ev("REST APIs", "verified"), ev("Kafka", "missing"), ev("CI/CD", "related")];
const LONG = 2000;

test("bands follow the guarded score", () => {
  assert.equal(computeVerdict({ overall_match_score: 82, keyword_evidence: strong }, analysis, [], LONG).decision, "apply");
  assert.equal(computeVerdict({ overall_match_score: 55, keyword_evidence: strong }, analysis, [], LONG).decision, "consider");
  assert.equal(computeVerdict({ overall_match_score: 20, keyword_evidence: strong }, analysis, [], LONG).decision, "skip");
});

test("a match resting on related evidence can't reach the apply band", () => {
  const mostlyRelated = [ev("Python", "verified"), ev("Kubernetes", "related"), ev("Terraform", "related"), ev("AWS", "related")];
  const v = computeVerdict({ overall_match_score: 90, keyword_evidence: mostlyRelated }, null, [], LONG);
  assert.equal(v.decision, "consider");
  assert.ok(v.reasons.some((r) => r.startsWith("Capped")));
});

test("a missing hard requirement caps the decision and is named", () => {
  const evidence = [ev("Python", "verified"), ev("Docker", "verified"), ev("REST APIs", "verified"), ev("PostgreSQL", "missing")];
  const v = computeVerdict({ overall_match_score: 85, keyword_evidence: evidence }, analysis, [], LONG);
  assert.equal(v.decision, "consider");
  assert.ok(v.reasons.some((r) => r.includes("PostgreSQL")));
});

test("a missing preferred skill does not cap", () => {
  const v = computeVerdict({ overall_match_score: 85, keyword_evidence: strong }, analysis, [], LONG);
  assert.equal(v.decision, "apply"); // Kafka is missing but isn't a stated requirement
});

test("a posting blocker holds the verdict but keeps the score", () => {
  const closed: PostingSignal = { id: "closed", level: "blocker", label: "No longer listed", detail: "" };
  const v = computeVerdict({ overall_match_score: 85, keyword_evidence: strong }, analysis, [closed], LONG);
  assert.equal(v.decision, "check");
  assert.equal(v.score, 85);
  assert.match(v.reasons[0], /No longer listed/);
});

test("caution signals never change the decision", () => {
  const caution: PostingSignal = { id: "stale", level: "caution", label: "Posted 90 days ago", detail: "" };
  assert.equal(computeVerdict({ overall_match_score: 85, keyword_evidence: strong }, analysis, [caution], LONG).decision, "apply");
});

test("confidence reflects the evidence, not the score", () => {
  assert.equal(computeVerdict({ overall_match_score: 85, keyword_evidence: strong }, analysis, [], LONG).confidence, "high");
  assert.equal(computeVerdict({ overall_match_score: 85, keyword_evidence: strong }, analysis, [], 200).confidence, "low");
  assert.equal(computeVerdict({ overall_match_score: 85, keyword_evidence: strong.slice(0, 2) }, analysis, [], LONG).confidence, "low");
  const mixed = [ev("A1", "verified"), ev("B1", "related"), ev("C1", "related"), ev("D1", "verified")];
  assert.equal(computeVerdict({ overall_match_score: 60, keyword_evidence: mixed }, null, [], LONG).confidence, "medium");
});

test("scores out of range are clamped", () => {
  assert.equal(computeVerdict({ overall_match_score: 140, keyword_evidence: strong }, analysis, [], LONG).score, 100);
});
