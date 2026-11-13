import { test } from "node:test";
import assert from "node:assert/strict";
import { resumeCoverage, runJobAnalysis, runMatchReport, runTailorPipeline } from "../src/lib/ai/engine";
import { reorderTrailingList } from "../src/lib/resume/reorder-list";
import { applyChangesToLatex } from "../src/lib/resume/apply-changes";
import { SAMPLE_MASTER_RESUME } from "./fixtures/sample-profile";
import { JobAnalysisSchema, MatchReportSchema } from "../src/lib/ai/schemas";
import { makeJob, makeVault } from "./helpers";

// No ANTHROPIC_API_KEY in the test environment -> the engine must fall back
// to the deterministic mock and still satisfy every schema and guard.
delete process.env.ANTHROPIC_API_KEY;

test("reorderTrailingList moves prioritized items first without adding/removing", () => {
  const out = reorderTrailingList(
    "Built SaveMyGrade using React, Flask, Python, Scikit-learn, Pandas, Gemini API, and Docker.",
    new Set(["docker", "python"])
  );
  assert.ok(out);
  assert.match(out!, /using (Python, Docker|Docker, Python)/);
  // Same multiset of items, nothing invented or dropped.
  for (const item of ["React", "Flask", "Scikit-learn", "Pandas", "Gemini API"]) {
    assert.ok(out!.includes(item), `lost item ${item}`);
  }
  assert.ok(out!.endsWith("."));
});

test("reorderTrailingList leaves sentence clauses alone", () => {
  assert.equal(
    reorderTrailingList(
      "Led an AI-assisted workflow: wrote a 9-phase spec with acceptance gates, used Claude Opus as a coding agent, and delivered ~20K lines of C++/Python",
      new Set(["python"])
    ),
    null
  );
});

test("reorderTrailingList returns null when nothing changes", () => {
  assert.equal(
    reorderTrailingList("Built X using React, Flask, Python.", new Set(["react"])),
    null
  );
  assert.equal(reorderTrailingList("No list here at all", new Set(["react"])), null);
});

test("mock job analysis satisfies the schema", async () => {
  const { data, engine } = await runJobAnalysis(makeJob());
  assert.equal(engine, "mock");
  assert.ok(JobAnalysisSchema.safeParse(data).success);
  assert.equal(data.seniority, "intern");
  assert.ok(data.cloud_infrastructure_keywords.includes("docker"));
});

test("mock match report satisfies the schema and never inflates", async () => {
  const job = makeJob();
  const vault = makeVault();
  const { data: analysis } = await runJobAnalysis(job);
  const { data: report } = await runMatchReport(job, analysis, vault);
  assert.ok(MatchReportSchema.safeParse(report).success);
  assert.ok(report.missing_keywords.includes("kubernetes"));
  assert.ok(!report.matched_keywords.includes("kubernetes"));
  const verified = report.keyword_evidence.filter((e) => e.status === "verified");
  for (const e of verified) {
    assert.ok(report.matched_keywords.includes(e.keyword));
  }
});

test("tailoring pipeline produces guarded, applicable changes with provenance", async () => {
  const job = makeJob();
  const vault = makeVault();
  const { data: analysis } = await runJobAnalysis(job);
  const out = await runTailorPipeline(job, analysis, vault, SAMPLE_MASTER_RESUME);

  assert.equal(out.engine, "mock");
  assert.ok(out.guarded.accepted.length > 0, "expected at least one proposed change");
  for (const change of out.guarded.accepted) {
    assert.ok(change.reason.length > 0, "every change carries a reason");
    assert.ok(change.original_text.length > 0);
  }
  // Applying every accepted change yields a parseable, different document.
  const final = applyChangesToLatex(
    SAMPLE_MASTER_RESUME,
    out.guarded.accepted.map((c) => ({
      block_id: c.block_id,
      change_type: c.action === "remove" ? ("remove" as const) : ("rewrite" as const),
      status: "accepted" as const,
      current_text: c.tailored_text,
    }))
  );
  assert.notEqual(final, SAMPLE_MASTER_RESUME);
  assert.ok(final.includes("\\begin{document}"));
  // Scores are computed and bounded.
  assert.ok(out.scoreBefore >= 0 && out.scoreBefore <= 100);
  assert.ok(out.scoreAfter >= 0 && out.scoreAfter <= 100);
  assert.ok(out.scoreAfter >= out.scoreBefore, "tailoring must not reduce keyword coverage");
  // still_missing stays honest: kubernetes/terraform are not in the vault.
  assert.ok(out.result.still_missing.includes("kubernetes"));
  assert.ok(out.result.keywords_added.every((k) => typeof k === "string"));
});

test("resumeCoverage reflects keyword presence", () => {
  const job = makeJob();
  const score = resumeCoverage(SAMPLE_MASTER_RESUME, job);
  assert.ok(score > 0 && score <= 100);
  assert.equal(resumeCoverage("nothing relevant", job), 0);
});
