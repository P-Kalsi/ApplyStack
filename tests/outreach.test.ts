import { test } from "node:test";
import assert from "node:assert/strict";
import { attachments, buildOutreachPrompt, checkOutreach, OUTREACH_KINDS, outreachKind } from "../src/lib/outreach/outreach";
import { makeJob, makeVault } from "./helpers";

test("kinds have limits; LinkedIn notes are 300 characters with no subject", () => {
  assert.equal(outreachKind("linkedin_recruiter")?.limit, 300);
  assert.equal(outreachKind("linkedin_peer")?.subject, false);
  assert.equal(outreachKind("nope"), null);
  assert.ok(OUTREACH_KINDS.every((k) => k.limit > 0));
});

test("attachments by kind", () => {
  assert.deepEqual(attachments("application_email", true), ["Your tailored resume (PDF)", "Your cover letter (PDF)"]);
  assert.deepEqual(attachments("application_email", false), ["Your tailored resume (PDF)"]);
  assert.deepEqual(attachments("linkedin_peer", true), []);
});

test("prompt carries the limit, the recipient placeholder and F-labelled facts", () => {
  const p = buildOutreachPrompt(makeJob(), makeVault(), [], "linkedin_recruiter", "");
  assert.match(p.user, /Character limit for the body: 300/);
  assert.match(p.user, /Recipient: \[name\]/);
  assert.match(p.user, /\[F1\]/);
  assert.match(buildOutreachPrompt(makeJob(), makeVault(), [], "referral", "Jordan", ["too long"]).user, /Recipient: Jordan[\s\S]*Fix these problems/);
});

test("checkOutreach: limit, invented skills and numbers, subject only where it belongs", () => {
  const vault = makeVault();
  const ok = checkOutreach({ subject: "x", body: "Hi [name], I build REST services in TypeScript.", facts: ["F1"] }, "linkedin_recruiter", vault);
  assert.deepEqual(ok.issues, []);
  assert.equal(ok.subject, ""); // LinkedIn notes have no subject
  const bad = checkOutreach({ subject: "Hello", body: `${"word ".repeat(70)}I ran Kubernetes for 9,999 users.`, facts: [] }, "linkedin_peer", vault);
  const text = bad.issues.join(" ");
  assert.match(text, /over the 300 limit/);
  assert.match(text, /kubernetes/i);
  assert.match(text, /9999/);
  assert.equal(checkOutreach({ subject: "Applying", body: "Hi", facts: [] }, "application_email", vault).subject, "Applying");
});
