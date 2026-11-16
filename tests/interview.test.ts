import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrepPrompt, checkPrep, prepFeedback, storyBank, type RawStory } from "../src/lib/interview/prep";
import { makeJob, makeVault } from "./helpers";

const story = (o: Partial<RawStory>): RawStory => ({
  title: "Shipping a REST API",
  requirement: "REST APIs",
  situation: "My team needed a backend.",
  task: "I owned the API.",
  action: "I built REST services in TypeScript.",
  result: "We shipped it.",
  reflection_prompt: "What would you test earlier next time?",
  facts: ["F1"],
  ...o,
});

test("prompt lists facts, requirements, and asks for a reflection question, not an answer", () => {
  const p = buildPrepPrompt(makeJob(), makeVault(), ["PostgreSQL experience"]);
  assert.match(p.user, /\[F1\]/);
  assert.match(p.user, /PostgreSQL experience/);
  assert.match(p.system, /QUESTION for the candidate/);
  assert.match(buildPrepPrompt(makeJob(), makeVault(), [], ["Story \"x\": bad"]).user, /broke these rules/);
});

test("checkPrep flags invented skills, numbers and uncited stories; keeps topics and questions", () => {
  const checked = checkPrep(
    {
      stories: [
        story({}),
        story({ title: "Scaling", action: "I ran Kubernetes for 50,000 users.", facts: [] }),
        story({ title: "", action: "" }), // dropped: empty
      ],
      topics: [{ topic: "REST", why: "posting asks for REST services" }, { topic: " ", why: "" }],
      questions_to_ask: ["How is the intern project chosen?", ""],
    },
    makeVault()
  );
  assert.equal(checked.stories.length, 2);
  assert.deepEqual(checked.stories[0].issues, []);
  assert.equal(checked.stories[0].factIds.length, 1);
  const bad = checked.stories[1].issues.join(" ");
  assert.match(bad, /kubernetes/i);
  assert.match(bad, /50000/);
  assert.match(bad, /Cites no/);
  assert.equal(checked.topics.length, 1);
  assert.deepEqual(checked.questions, ["How is the intern project chosen?"]);
  assert.equal(prepFeedback(checked).length, 3);
  // The reflection is a question for you, not an answer, and isn't checked as a claim.
  assert.match(checked.stories[0].reflection_prompt, /\?$/);
});

test("storyBank merges the same story told for different jobs, most reused first", () => {
  const vault = makeVault();
  const a = checkPrep({ stories: [story({ facts: ["F1"] }), story({ title: "Other", facts: ["F2"] })], topics: [], questions_to_ask: [] }, vault);
  const b = checkPrep({ stories: [story({ title: "Same facts, new title", facts: ["F1"] })], topics: [], questions_to_ask: [] }, vault);
  const bank = storyBank([
    { jobId: "j1", label: "Acme", stories: a.stories },
    { jobId: "j2", label: "Beta", stories: b.stories },
  ]);
  assert.equal(bank.length, 2);
  assert.equal(bank[0].title, "Shipping a REST API");
  assert.deepEqual(bank[0].jobs.map((j) => j.label), ["Acme", "Beta"]);
});
