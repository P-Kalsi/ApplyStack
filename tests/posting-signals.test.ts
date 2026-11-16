import { test } from "node:test";
import assert from "node:assert/strict";
import { postingAgeDays, postingSignals } from "../src/lib/jobs/posting-signals";
import { makeJob } from "./helpers";

const NOW = new Date("2026-11-16T12:00:00Z");
const LONG = "We build cloud tooling for developers. ".repeat(15);
const ids = (job: Parameters<typeof postingSignals>[0]) => postingSignals(job, NOW).map((s) => s.id);

test("a fresh, ordinary posting has no signals", () => {
  assert.deepEqual(ids(makeJob({ posted_at: "2026-11-10T00:00:00Z", description_text: LONG })), []);
});

test("a posting that left its feed is a blocker", () => {
  const signals = postingSignals(makeJob({ is_open: false, posted_at: null, description_text: LONG }), NOW);
  assert.equal(signals[0].id, "closed");
  assert.equal(signals[0].level, "blocker");
});

test("age: 30+ days is info, 60+ days is a caution, unknown dates add nothing", () => {
  assert.deepEqual(ids(makeJob({ posted_at: "2026-10-10T00:00:00Z", description_text: LONG })), ["aging"]);
  assert.deepEqual(ids(makeJob({ posted_at: "2026-08-01T00:00:00Z", description_text: LONG })), ["stale"]);
  assert.deepEqual(ids(makeJob({ posted_at: null, description_text: LONG })), []);
  assert.equal(postingAgeDays("not a date", NOW), null);
  assert.equal(postingAgeDays("2027-01-01T00:00:00Z", NOW), null);
});

test("finds no-sponsorship wording and quotes the sentence", () => {
  for (const phrase of [
    "We are unable to sponsor visas for this role.",
    "Candidates must be authorized to work in Canada without sponsorship.",
    "Visa sponsorship is not available.",
    "This role does not offer visa sponsorship.",
  ]) {
    const s = postingSignals(makeJob({ posted_at: null, description_text: `${LONG} ${phrase}` }), NOW).find(
      (x) => x.id === "no_sponsorship"
    );
    assert.ok(s, `missed: ${phrase}`);
    assert.equal(s.quote, phrase);
  }
});

test("mentioning sponsorship positively is not flagged", () => {
  const text = `${LONG} We sponsor visas for interns and offer relocation.`;
  assert.ok(!ids(makeJob({ posted_at: null, description_text: text })).includes("no_sponsorship"));
});

test("citizenship, clearance, unpaid and fees", () => {
  const job = (t: string) => makeJob({ posted_at: null, description_text: `${LONG} ${t}` });
  assert.ok(ids(job("Must be a U.S. citizen.")).includes("citizenship"));
  assert.ok(ids(job("An active secret clearance is needed.")).includes("citizenship"));
  assert.ok(ids(job("This is an unpaid internship.")).includes("unpaid"));
  const fee = postingSignals(job("A $200 training fee is due on your first day."), NOW).find((s) => s.id === "fee");
  assert.equal(fee?.level, "blocker");
  // "paid" alone is not "unpaid".
  assert.ok(!ids(job("This is a paid internship.")).includes("unpaid"));
});

test("a short description is flagged; a missing one is left to the page", () => {
  assert.deepEqual(ids(makeJob({ posted_at: null, description_text: "Intern. Python." })), ["thin"]);
  assert.deepEqual(ids(makeJob({ posted_at: null, description_text: null })), []);
});
