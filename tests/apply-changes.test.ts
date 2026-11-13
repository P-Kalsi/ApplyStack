import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChangesToLatex, countApplied } from "../src/lib/resume/apply-changes";
import { getBullets, parseResume } from "../src/lib/resume/latex";
import { SAMPLE_MASTER_RESUME } from "./fixtures/sample-profile";

const bullets = getBullets(parseResume(SAMPLE_MASTER_RESUME));
const webForm = bullets.find((b) => b.text.includes("custom web form"))!;
const siteSee = bullets.find((b) => b.text.includes("SiteSee using"))!;

test("proposed and rejected changes leave the master untouched", () => {
  const out = applyChangesToLatex(SAMPLE_MASTER_RESUME, [
    {
      block_id: webForm.id,
      change_type: "rewrite",
      status: "proposed",
      current_text: "SHOULD NOT APPEAR",
    },
    {
      block_id: siteSee.id,
      change_type: "remove",
      status: "rejected",
      current_text: siteSee.text,
    },
  ]);
  assert.equal(out, SAMPLE_MASTER_RESUME);
});

test("accepted rewrites are applied in place", () => {
  const out = applyChangesToLatex(SAMPLE_MASTER_RESUME, [
    {
      block_id: webForm.id,
      change_type: "rewrite",
      status: "accepted",
      current_text: "Integrated a custom web form with validated submissions.",
    },
  ]);
  assert.ok(out.includes("Integrated a custom web form with validated submissions."));
  assert.ok(!out.includes("\\resumeItem{Integrated a custom web form.}"));
});

test("edited changes use the user's edited text", () => {
  const out = applyChangesToLatex(SAMPLE_MASTER_RESUME, [
    {
      block_id: webForm.id,
      change_type: "rewrite",
      status: "edited",
      current_text: "My own wording.",
    },
  ]);
  assert.ok(out.includes("My own wording."));
});

test("accepted removals drop the bullet", () => {
  const out = applyChangesToLatex(SAMPLE_MASTER_RESUME, [
    {
      block_id: siteSee.id,
      change_type: "remove",
      status: "accepted",
      current_text: "",
    },
  ]);
  assert.ok(!out.includes("Built SiteSee using"));
});

test("mixed accept/reject applies only the accepted subset", () => {
  const changes = [
    {
      block_id: webForm.id,
      change_type: "rewrite" as const,
      status: "accepted" as const,
      current_text: "Accepted rewrite.",
    },
    {
      block_id: siteSee.id,
      change_type: "rewrite" as const,
      status: "rejected" as const,
      current_text: "Rejected rewrite.",
    },
  ];
  const out = applyChangesToLatex(SAMPLE_MASTER_RESUME, changes);
  assert.ok(out.includes("Accepted rewrite."));
  assert.ok(!out.includes("Rejected rewrite."));
  assert.ok(out.includes("Built SiteSee using"));
  assert.equal(countApplied(changes), 1);
});
