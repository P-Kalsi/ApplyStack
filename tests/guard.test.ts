import { test } from "node:test";
import assert from "node:assert/strict";
import { guardTailorChanges, numbersIn, sanitizeMatchReport } from "../src/lib/ai/guard";
import { getBullets, parseResume } from "../src/lib/resume/latex";
import { SAMPLE_MASTER_RESUME } from "./fixtures/sample-profile";
import type { MatchReport } from "../src/lib/ai/schemas";

const bullets = getBullets(parseResume(SAMPLE_MASTER_RESUME));
const webForm = bullets.find((b) => b.text.includes("custom web form"))!;
const facts = [
  { id: "f1", fact_text: "Integrated a custom web form.", keywords: ["forms"] },
  { id: "f2", fact_text: "Built and maintained a self-hosted home lab with containerized services.", keywords: ["docker"] },
  {
    id: "f3",
    fact_text:
      "SaveMyGrade uses approximately 3,300 professor review files and approximately 5,000 course catalogue records.",
    keywords: [],
  },
];
const vaultSkills = new Set(["react", "docker", "python", "typescript"]);

test("numbersIn extracts numeric tokens", () => {
  assert.deepEqual(Array.from(numbersIn("Cut load time 40% across 3,300 files")), ["40%", "3300"]);
});

test("guard rejects rewrites that invent technologies", () => {
  const { accepted, rejected } = guardTailorChanges(
    [
      {
        block_id: webForm.id,
        action: "rewrite",
        tailored_text: "Integrated a custom web form deployed on Kubernetes.",
        reason: "Job wants k8s.",
        fact_ids: ["f1"],
        keywords: ["kubernetes"],
      },
    ],
    bullets,
    facts,
    vaultSkills
  );
  assert.equal(accepted.length, 0);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, /kubernetes/i);
});

test("guard rejects rewrites that invent metrics", () => {
  const { accepted, rejected } = guardTailorChanges(
    [
      {
        block_id: webForm.id,
        action: "rewrite",
        tailored_text: "Integrated a custom web form used by 10,000 customers.",
        reason: "Sounds impressive.",
        fact_ids: ["f1"],
        keywords: [],
      },
    ],
    bullets,
    facts,
    vaultSkills
  );
  assert.equal(accepted.length, 0);
  assert.match(rejected[0].reason, /metrics/i);
});

test("guard keeps truthful rewrites and preserves existing metrics", () => {
  const smg = bullets.find((b) => b.text.includes("3,300"))!;
  const { accepted, rejected } = guardTailorChanges(
    [
      {
        block_id: smg.id,
        action: "rewrite",
        tailored_text:
          "Processed approximately 3,300 professor review files and approximately 5,000 course catalogue records with Python.",
        reason: "Lead with data scale for this data job.",
        fact_ids: ["f3"],
        keywords: ["python"],
      },
    ],
    bullets,
    facts,
    vaultSkills
  );
  assert.equal(rejected.length, 0);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].is_safe, true);
  assert.equal(accepted[0].section, "Projects");
});

test("guard drops changes targeting unknown blocks", () => {
  const { accepted, rejected } = guardTailorChanges(
    [
      {
        block_id: "b999",
        action: "rewrite",
        tailored_text: "x",
        reason: "r",
        fact_ids: [],
        keywords: [],
      },
    ],
    bullets,
    facts,
    vaultSkills
  );
  assert.equal(accepted.length, 0);
  assert.match(rejected[0].reason, /unknown/i);
});

test("guard marks rewrites without supporting facts as unsafe (not dropped)", () => {
  const { accepted } = guardTailorChanges(
    [
      {
        block_id: webForm.id,
        action: "rewrite",
        tailored_text: "Integrated a custom web form with client-side validation.",
        reason: "Emphasize frontend rigor.",
        fact_ids: [],
        keywords: [],
      },
    ],
    bullets,
    facts,
    vaultSkills
  );
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].is_safe, false);
});

test("removals always need explicit review and carry original text", () => {
  const { accepted } = guardTailorChanges(
    [
      {
        block_id: webForm.id,
        action: "remove",
        tailored_text: "ignored",
        reason: "Not relevant.",
        fact_ids: [],
        keywords: [],
      },
    ],
    bullets,
    facts,
    vaultSkills
  );
  assert.equal(accepted[0].is_safe, false);
  assert.equal(accepted[0].tailored_text, "");
  assert.equal(accepted[0].original_text, webForm.text);
});

test("sanitizeMatchReport downgrades unverifiable keywords", () => {
  const report: MatchReport = {
    overall_match_score: 90,
    skills_match_score: 90,
    experience_match_score: 90,
    project_match_score: 90,
    matched_keywords: ["docker", "kubernetes"],
    missing_keywords: [],
    keyword_evidence: [
      { keyword: "docker", status: "verified", evidence: "home lab fact" },
      { keyword: "kubernetes", status: "verified", evidence: "sounds plausible" },
    ],
    strongest_experiences: [],
    strongest_projects: [],
    potential_concerns: [],
  };
  const clean = sanitizeMatchReport(report, vaultSkills, facts);
  assert.deepEqual(clean.matched_keywords, ["docker"]);
  assert.ok(clean.missing_keywords.includes("kubernetes"));
  const kube = clean.keyword_evidence.find((e) => e.keyword === "kubernetes")!;
  assert.equal(kube.status, "missing");
  // A keyword can never be both matched and missing.
  for (const kw of clean.matched_keywords) {
    assert.ok(!clean.missing_keywords.includes(kw));
  }
});
