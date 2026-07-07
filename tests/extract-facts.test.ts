import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFactsFromLatex } from "../src/lib/resume/extract-facts";
import { SAMPLE_MASTER_RESUME } from "../src/lib/vault/starter";

test("extracts clean plain-text facts from resume bullets", () => {
  const facts = extractFactsFromLatex(SAMPLE_MASTER_RESUME);
  const texts = facts.map((f) => f.fact_text);
  assert.ok(
    texts.includes(
      "Built SaveMyGrade using React, Flask, Python, Scikit-learn, Pandas, Gemini API, and Docker."
    )
  );
  assert.ok(texts.includes("Configured DNS and custom domain infrastructure."));
  // No LaTeX markup leaks into fact text.
  for (const t of texts) {
    assert.ok(!t.includes("\\"), `contains latex: ${t}`);
    assert.ok(!t.includes("{"), `contains brace: ${t}`);
  }
});

test("facts carry extracted skill keywords and sections", () => {
  const facts = extractFactsFromLatex(SAMPLE_MASTER_RESUME);
  const smg = facts.find((f) => f.fact_text.startsWith("Built SaveMyGrade"))!;
  assert.ok(smg.keywords.includes("react"));
  assert.ok(smg.keywords.includes("scikit-learn"));
  assert.equal(smg.section, "Projects");
});

test("metric-bearing bullets are categorized as metrics", () => {
  const facts = extractFactsFromLatex(SAMPLE_MASTER_RESUME);
  const metric = facts.find((f) => f.fact_text.includes("3,300"));
  assert.ok(metric);
  assert.equal(metric!.category, "metric");
});

test("extraction deduplicates identical bullets", () => {
  const doubled = SAMPLE_MASTER_RESUME.replace(
    "\\resumeItem{Integrated a custom web form.}",
    "\\resumeItem{Integrated a custom web form.}\n    \\resumeItem{Integrated a custom web form.}"
  );
  const facts = extractFactsFromLatex(doubled);
  const hits = facts.filter((f) => f.fact_text === "Integrated a custom web form.");
  assert.equal(hits.length, 1);
});
