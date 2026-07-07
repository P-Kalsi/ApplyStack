import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findClosingBrace,
  getBullets,
  latexToPlain,
  parseResume,
  serializeResume,
} from "../src/lib/resume/latex";
import { SAMPLE_MASTER_RESUME } from "../src/lib/vault/starter";

test("findClosingBrace handles nesting and escapes", () => {
  const s = "{a {b} \\{c\\} d}";
  assert.equal(findClosingBrace(s, 0), s.length - 1);
});

test("latexToPlain strips formatting but keeps content", () => {
  assert.equal(latexToPlain("\\textbf{Docker} \\& \\emph{Linux} 95\\%"), "Docker & Linux 95%");
  assert.equal(latexToPlain("\\href{https://x.dev}{SaveMyGrade}"), "SaveMyGrade");
});

test("parse -> serialize round-trips the sample resume exactly", () => {
  const parsed = parseResume(SAMPLE_MASTER_RESUME);
  assert.equal(serializeResume(parsed), SAMPLE_MASTER_RESUME);
});

test("bullets carry their section and editable text", () => {
  const parsed = parseResume(SAMPLE_MASTER_RESUME);
  const bullets = getBullets(parsed);
  assert.ok(bullets.length >= 8);
  const dns = bullets.find((b) => b.text.includes("DNS"));
  assert.ok(dns);
  assert.equal(dns!.section, "Experience");
  const smg = bullets.find((b) => b.text.includes("SaveMyGrade using"));
  assert.equal(smg!.section, "Projects");
});

test("preamble \\item definitions never become bullets", () => {
  const parsed = parseResume(SAMPLE_MASTER_RESUME);
  for (const b of getBullets(parsed)) {
    assert.ok(b.section, "every bullet must live under a real section");
    assert.ok(!b.text.includes("#1"), "macro bodies must stay opaque");
  }
});

test("overriding one bullet changes only that bullet", () => {
  const parsed = parseResume(SAMPLE_MASTER_RESUME);
  const bullets = getBullets(parsed);
  const target = bullets.find((b) => b.text.includes("custom web form"))!;
  const out = serializeResume(
    parsed,
    new Map([[target.id, { text: "Integrated a custom web form used by real customers." }]])
  );
  assert.ok(out.includes("Integrated a custom web form used by real customers."));
  assert.ok(!out.includes("\\resumeItem{Integrated a custom web form.}"));
  // Everything else is untouched, including the preamble.
  assert.ok(out.includes("\\newcommand{\\resumeItem}[1]{\\item\\small{#1}}"));
  const reparsed = parseResume(out);
  assert.equal(getBullets(reparsed).length, bullets.length);
});

test("removing a bullet drops it cleanly", () => {
  const parsed = parseResume(SAMPLE_MASTER_RESUME);
  const target = getBullets(parsed).find((b) => b.text.includes("SiteSee using"))!;
  const out = serializeResume(parsed, new Map([[target.id, { remove: true }]]));
  assert.ok(!out.includes("Built SiteSee using"));
  // Document structure remains valid: begin/end pairs are balanced.
  const begins = (out.match(/\\begin\{/g) || []).length;
  const ends = (out.match(/\\end\{/g) || []).length;
  assert.equal(begins, ends);
});
