import { test } from "node:test";
import assert from "node:assert/strict";
import { rankAnalyzed, triageJobs } from "../src/lib/pipeline/triage";
import type { JobAnalysis, MatchReport } from "../src/lib/ai/schemas";
import { makeJob, makeVault } from "./helpers";

const LONG = "Build REST services in TypeScript and Python with Docker and PostgreSQL. ".repeat(10);

test("triage: analyze good matches, skip low ones, wait on closed or description-less jobs", () => {
  const vault = makeVault();
  const jobs = [
    makeJob({ id: "good", description_text: LONG }),
    makeJob({ id: "low", skills: ["cobol", "fortran", "mainframe"], description_text: "COBOL and Fortran on the mainframe. ".repeat(20) }),
    makeJob({ id: "closed", is_open: false, description_text: LONG }),
    makeJob({ id: "fetchable", description_text: null, url: "https://job-boards.greenhouse.io/acme/jobs/123" }),
    makeJob({ id: "paste", description_text: null, url: "https://www.linkedin.com/jobs/view/1" }),
    makeJob({ id: "done", description_text: LONG }),
  ];
  const rows = triageJobs(jobs, vault, new Set(["done"]));
  const step = Object.fromEntries(rows.map((r) => [r.jobId, r.step]));
  assert.deepEqual(step, {
    good: "analyze",
    low: "low_match",
    closed: "closed",
    fetchable: "fetch_then_analyze",
    paste: "needs_description",
    done: "done",
  });
  // A lower threshold lets the weak match through.
  const loose = triageJobs([jobs[1]], vault, new Set(), 0);
  assert.equal(loose[0].step, "analyze");
});

const analysis: JobAnalysis = {
  role_category: "backend",
  seniority: "intern",
  required_skills: [],
  preferred_skills: [],
  tools: [],
  frameworks: [],
  languages: [],
  cloud_infrastructure_keywords: [],
  domain_keywords: [],
  responsibilities: [],
  important_phrases: [],
  hard_requirements: [],
  soft_requirements: [],
};
const report = (score: number): MatchReport => ({
  overall_match_score: score,
  skills_match_score: score,
  experience_match_score: score,
  project_match_score: score,
  matched_keywords: [],
  missing_keywords: [],
  keyword_evidence: ["A", "B", "C", "D", "E", "F"].map((k) => ({ keyword: k, status: "verified" as const, evidence: "" })),
  strongest_experiences: [],
  strongest_projects: [],
  potential_concerns: [],
});

test("rankAnalyzed orders by decision, then score, and skips unanalyzed jobs", () => {
  const jobs = [
    makeJob({ id: "mid", description_text: LONG }),
    makeJob({ id: "top", description_text: LONG }),
    makeJob({ id: "closed", is_open: false, description_text: LONG }),
    makeJob({ id: "weak", description_text: LONG }),
    makeJob({ id: "none", description_text: LONG }),
  ];
  const analyses = new Map([
    ["mid", { analysis, report: report(55) }],
    ["top", { analysis, report: report(90) }],
    ["closed", { analysis, report: report(95) }],
    ["weak", { analysis, report: report(20) }],
  ]);
  const ranked = rankAnalyzed(jobs, analyses);
  assert.deepEqual(
    ranked.map((r) => [r.jobId, r.verdict.decision]),
    [
      ["top", "apply"],
      ["mid", "consider"],
      ["closed", "check"],
      ["weak", "skip"],
    ]
  );
});
