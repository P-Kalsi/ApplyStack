import { test } from "node:test";
import assert from "node:assert/strict";
import {
  JobAnalysisSchema,
  MatchReportSchema,
  TailorResultSchema,
} from "../src/lib/ai/schemas";
import { extractJson } from "../src/lib/ai/json";

const validAnalysis = {
  role_category: "backend",
  seniority: "intern",
  required_skills: ["python"],
  preferred_skills: [],
  tools: [],
  frameworks: ["fastapi"],
  languages: ["python"],
  cloud_infrastructure_keywords: ["docker"],
  domain_keywords: [],
  responsibilities: ["Build APIs"],
  important_phrases: [],
  hard_requirements: ["CS student"],
  soft_requirements: [],
};

test("JobAnalysisSchema accepts a valid analysis", () => {
  const r = JobAnalysisSchema.safeParse(validAnalysis);
  assert.ok(r.success);
});

test("JobAnalysisSchema rejects missing keys and wrong types", () => {
  assert.equal(JobAnalysisSchema.safeParse({}).success, false);
  assert.equal(
    JobAnalysisSchema.safeParse({ ...validAnalysis, required_skills: "python" }).success,
    false
  );
});

test("MatchReportSchema bounds scores to 0-100 integers", () => {
  const base = {
    overall_match_score: 80,
    skills_match_score: 70,
    experience_match_score: 60,
    project_match_score: 90,
    matched_keywords: ["docker"],
    missing_keywords: ["kubernetes"],
    keyword_evidence: [{ keyword: "docker", status: "verified", evidence: "fact" }],
    strongest_experiences: [],
    strongest_projects: [],
    potential_concerns: [],
  };
  assert.ok(MatchReportSchema.safeParse(base).success);
  assert.equal(MatchReportSchema.safeParse({ ...base, overall_match_score: 101 }).success, false);
  assert.equal(MatchReportSchema.safeParse({ ...base, overall_match_score: -1 }).success, false);
  assert.equal(MatchReportSchema.safeParse({ ...base, overall_match_score: 79.5 }).success, false);
  assert.equal(
    MatchReportSchema.safeParse({
      ...base,
      keyword_evidence: [{ keyword: "x", status: "invented", evidence: "" }],
    }).success,
    false
  );
});

test("TailorResultSchema validates change actions", () => {
  const good = {
    changes: [
      {
        block_id: "b1",
        action: "rewrite",
        tailored_text: "Better bullet.",
        reason: "Job asks for Docker.",
        fact_ids: ["f1"],
        keywords: ["docker"],
      },
    ],
    keywords_added: ["docker"],
    skills_emphasized: ["docker"],
    still_missing: ["kubernetes"],
    summary: "One rewrite.",
  };
  assert.ok(TailorResultSchema.safeParse(good).success);
  const badAction = {
    ...good,
    changes: [{ ...good.changes[0], action: "invent" }],
  };
  assert.equal(TailorResultSchema.safeParse(badAction).success, false);
  const emptyBlockId = {
    ...good,
    changes: [{ ...good.changes[0], block_id: "" }],
  };
  assert.equal(TailorResultSchema.safeParse(emptyBlockId).success, false);
});

test("extractJson tolerates prose and code fences", () => {
  assert.deepEqual(extractJson('Here you go:\n```json\n{"a": 1}\n```\nDone.'), { a: 1 });
  assert.deepEqual(extractJson('prefix {"a": {"b": 2}} suffix'), { a: { b: 2 } });
  assert.throws(() => extractJson("no json here"));
});
