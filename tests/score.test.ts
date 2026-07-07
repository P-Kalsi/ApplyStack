import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMatch, vaultSkillSet } from "../src/lib/matching/score";
import { makeJob, makeVault } from "./helpers";

test("vaultSkillSet only contains skills the vault can truthfully claim", () => {
  const skills = vaultSkillSet(makeVault());
  assert.ok(skills.has("react"));
  assert.ok(skills.has("docker"));
  assert.ok(skills.has("postgresql"));
  assert.ok(!skills.has("kubernetes"));
  assert.ok(!skills.has("terraform"));
});

test("computeMatch never counts skills missing from the vault", () => {
  const result = computeMatch(makeJob(), makeVault());
  assert.ok(result.matchedSkills.includes("typescript"));
  assert.ok(result.matchedSkills.includes("docker"));
  assert.ok(result.missingSkills.includes("kubernetes"));
  assert.ok(result.missingSkills.includes("terraform"));
  // A missing skill can never appear as matched.
  for (const s of result.missingSkills) {
    assert.ok(!result.matchedSkills.includes(s));
  }
});

test("computeMatch scores are bounded and consistent", () => {
  const result = computeMatch(makeJob(), makeVault());
  for (const v of [result.overall, result.skillsScore, result.experienceScore, result.projectScore]) {
    assert.ok(v >= 0 && v <= 100, `score ${v} out of range`);
  }
  // 5 of 7 requested skills exist in the vault.
  assert.equal(result.skillsScore, Math.round((5 / 7) * 100));
});

test("a perfectly matching job scores higher than a mismatched one", () => {
  const vault = makeVault();
  const good = computeMatch(
    makeJob({ skills: ["react", "typescript", "docker", "postgresql"] }),
    vault
  );
  const bad = computeMatch(
    makeJob({
      skills: ["rust", "kafka", "spark"],
      description_text: "Rust, Kafka and Spark all day.",
    }),
    vault
  );
  assert.ok(good.overall > bad.overall);
  assert.equal(good.skillsScore, 100);
  assert.equal(bad.skillsScore, 0);
});

test("empty vault produces zero skill matches", () => {
  const empty = { education: [], experiences: [], projects: [], skills: [], facts: [] };
  const result = computeMatch(makeJob(), empty);
  assert.equal(result.matchedSkills.length, 0);
  assert.equal(result.skillsScore, 0);
});
