import { test } from "node:test";
import assert from "node:assert/strict";
import { rankExperiences, rankProjects, selectRelevantFacts } from "../src/lib/matching/relevance";
import { makeJob, makeVault } from "./helpers";

test("rankProjects puts the most relevant project first", () => {
  const vault = makeVault();
  // Backend job: TypeScript, Docker, PostgreSQL, FastAPI-adjacent.
  const job = makeJob({
    skills: ["typescript", "fastapi", "postgresql", "docker"],
    description_text: "Typed APIs with FastAPI and PostgreSQL, shipped with Docker.",
  });
  const ranked = rankProjects(job, vault);
  assert.equal(ranked[0].item.name, "ProtectPibble");
  assert.ok(ranked[0].score > 0);
  assert.ok(ranked[0].matchedKeywords.includes("fastapi"));
});

test("rankProjects favors ML projects for ML jobs", () => {
  const vault = makeVault();
  const job = makeJob({
    title: "Machine Learning Intern",
    skills: ["python", "scikit-learn", "pandas", "flask"],
    description_text: "Model pipelines in Python with Scikit-learn and Pandas.",
  });
  const ranked = rankProjects(job, vault);
  assert.equal(ranked[0].item.name, "SaveMyGrade");
});

test("rankExperiences scores facts attached to the experience", () => {
  const vault = makeVault();
  const job = makeJob({
    skills: ["dns", "networking"],
    description_text: "Configure DNS and domain infrastructure.",
  });
  const ranked = rankExperiences(job, vault);
  assert.equal(ranked[0].item.company, "Early-stage startup");
  assert.ok(ranked[0].matchedKeywords.includes("dns"));
});

test("selectRelevantFacts filters to approved, relevant facts within limit", () => {
  const vault = makeVault();
  // Poison the vault with a rejected fact that would otherwise match.
  vault.facts.push({
    id: "rejected-1",
    user_id: vault.facts[0].user_id,
    experience_id: null,
    project_id: null,
    fact_text: "Built Kubernetes clusters with Terraform.",
    category: "general",
    keywords: ["kubernetes", "terraform"],
    source: "manual",
    status: "rejected",
  });
  const job = makeJob(); // asks for kubernetes + terraform among others
  const selected = selectRelevantFacts(job, vault, 5);
  assert.ok(selected.length <= 5);
  assert.ok(selected.every((r) => r.item.status === "approved"));
  assert.ok(selected.every((r) => r.item.id !== "rejected-1"));
  // The most relevant fact should be scored above zero for this job.
  assert.ok(selected[0].score > 0);
});

test("selectRelevantFacts ranks docker facts high for container-heavy jobs", () => {
  const vault = makeVault();
  const job = makeJob({
    skills: ["docker", "linux"],
    description_text: "Containerized infrastructure on Linux.",
  });
  const selected = selectRelevantFacts(job, vault, 6);
  const texts = selected.map((r) => r.item.fact_text.toLowerCase());
  assert.ok(texts.some((t) => t.includes("home lab")));
});
