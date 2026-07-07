import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNormalizedJob } from "../src/lib/jobs/normalize";
import { dedupeJobs, splitAgainstExisting } from "../src/lib/jobs/dedupe";

function job(company: string, title: string, location: string, url: string, posted?: string) {
  return buildNormalizedJob({
    source: "manual",
    company,
    title,
    location,
    url,
    description_text: "TypeScript and React.",
    posted_at: posted ?? null,
  });
}

test("dedupeJobs collapses postings with identical normalized identity", () => {
  const a = job("Acme Corp", "Backend Intern", "Vancouver, BC", "https://a.example/j/1?src=li");
  const b = job("ACME  Corp", "Backend  Intern", "Vancouver,  BC", "https://a.example/j/1/#apply");
  const out = dedupeJobs([a, b]);
  assert.equal(out.length, 1);
});

test("dedupeJobs keeps the posting with the newer posted_at", () => {
  const older = job("Acme", "Intern", "Remote", "https://a.example/j/2", "2026-06-01T00:00:00Z");
  const newer = job("Acme", "Intern", "Remote", "https://a.example/j/2", "2026-07-01T00:00:00Z");
  const out = dedupeJobs([older, newer]);
  assert.equal(out.length, 1);
  assert.equal(out[0].posted_at, "2026-07-01T00:00:00Z");
});

test("dedupeJobs keeps distinct jobs apart", () => {
  const a = job("Acme", "Backend Intern", "Vancouver, BC", "https://a.example/j/1");
  const b = job("Acme", "Frontend Intern", "Vancouver, BC", "https://a.example/j/2");
  const c = job("Beta", "Backend Intern", "Vancouver, BC", "https://b.example/j/1");
  assert.equal(dedupeJobs([a, b, c]).length, 3);
});

test("splitAgainstExisting separates fresh jobs from known keys", () => {
  const a = job("Acme", "Backend Intern", "Vancouver, BC", "https://a.example/j/1");
  const b = job("Acme", "Frontend Intern", "Vancouver, BC", "https://a.example/j/2");
  const { fresh, known } = splitAgainstExisting([a, b], [a.dedupe_key]);
  assert.deepEqual(fresh.map((j) => j.title), ["Frontend Intern"]);
  assert.deepEqual(known.map((j) => j.title), ["Backend Intern"]);
});
