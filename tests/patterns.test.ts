import { test } from "node:test";
import assert from "node:assert/strict";
import { channelOf, computePatterns, repostKey, roleGroup } from "../src/lib/applications/patterns";
import { postingSignals, repostDates } from "../src/lib/jobs/posting-signals";
import type { KeywordEvidence } from "../src/lib/ai/schemas";
import type { ApplicationRow, ApplicationStatus } from "../src/lib/types";

let n = 0;
const app = (status: ApplicationStatus, o: Partial<ApplicationRow> = {}): ApplicationRow => ({
  id: `a${++n}`,
  user_id: "u",
  job_id: null,
  company: "Acme",
  role: "Software Developer Intern",
  status,
  date_applied: "2026-10-01",
  resume_version_id: null,
  notes: null,
  next_action: null,
  next_action_date: null,
  job_url: null,
  sort_order: 0,
  created_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...o,
});

test("roleGroup and channelOf classify titles and links", () => {
  assert.equal(roleGroup("Frontend Developer Co-op"), "Frontend");
  assert.equal(roleGroup("Full Stack Developer Intern"), "Full stack");
  assert.equal(roleGroup("Machine Learning Intern"), "AI / ML");
  assert.equal(roleGroup("Backend Software Engineer Intern"), "Backend / platform");
  assert.equal(roleGroup("Software Engineering Intern"), "Software (general)");
  assert.equal(roleGroup("Barista"), "Other");
  assert.equal(channelOf({ job_url: "https://www.linkedin.com/jobs/view/1" }), "LinkedIn");
  assert.equal(channelOf({ job_url: "https://ca.indeed.com/viewjob?jk=1" }), "Indeed");
  assert.equal(channelOf({ job_url: "https://acme.wd3.myworkdayjobs.com/x" }), "Company boards");
  assert.equal(channelOf({ job_url: "https://acme.com/careers/1" }), "Company website");
  assert.equal(channelOf({ job_url: null }), "Unknown");
  assert.equal(channelOf({ job_url: null }, { source: "simplify", url: null }), "Simplify list");
  assert.equal(channelOf({ job_url: null }, { source: "ashby", url: null }), "Company boards");
});

test("computePatterns: funnel, rates, small-sample flag, quiet applications", () => {
  const apps = [
    app("saved"),
    app("applied", { job_url: "https://www.linkedin.com/jobs/view/1", date_applied: "2026-09-01" }),
    app("applied", { job_url: "https://www.linkedin.com/jobs/view/2", date_applied: "2026-11-10" }),
    app("rejected", { job_url: "https://www.linkedin.com/jobs/view/3" }),
    app("oa", { job_url: "https://acme.com/careers/1", role: "Frontend Intern" }),
    app("interview", { job_url: "https://acme.com/careers/2", role: "Frontend Intern" }),
    app("offer", { job_url: "https://acme.com/careers/3" }),
    app("withdrawn", { date_applied: null }), // never applied: not counted
  ];
  const p = computePatterns(apps, new Map(), new Map(), new Date("2026-11-16T12:00:00Z"));
  assert.deepEqual(
    p.funnel.map((f) => f.count),
    [1, 6, 3, 2, 1]
  );
  assert.equal(p.total.applied, 6);
  assert.equal(p.total.advanced, 3);
  assert.equal(p.total.responseRate, 67); // oa, interview, offer, rejected
  const linkedin = p.byChannel.find((c) => c.label === "LinkedIn")!;
  assert.deepEqual([linkedin.applied, linkedin.advanced, linkedin.small], [3, 0, true]);
  const site = p.byChannel.find((c) => c.label === "Company website")!;
  assert.equal(site.advanceRate, 100);
  assert.ok(p.byRole.some((r) => r.label === "Frontend" && r.applied === 2));
  assert.deepEqual(p.quiet.map((q) => q.days), [76]); // the 11-10 one is only 6 days old
});

test("computePatterns counts requirements you keep missing, once per job", () => {
  const ev = (keyword: string, status: KeywordEvidence["status"]): KeywordEvidence => ({ keyword, status, evidence: "" });
  const apps = [app("applied", { job_id: "j1" }), app("rejected", { job_id: "j2" }), app("saved", { job_id: "j3" })];
  const evidence = new Map([
    ["j1", [ev("Kubernetes", "missing"), ev("kubernetes", "missing"), ev("Go", "missing")]],
    ["j2", [ev("Kubernetes", "missing"), ev("Python", "verified")]],
    ["j3", [ev("Go", "missing")]], // only saved, not applied
  ]);
  const p = computePatterns(apps, new Map(), evidence);
  assert.deepEqual(p.missing, [{ keyword: "Kubernetes", count: 2 }]);
});

test("repostKey ignores season, year and punctuation", () => {
  assert.equal(
    repostKey("Acme Inc.", "Software Engineer Intern (Summer 2027)"),
    repostKey("acme inc", "Software Engineer Intern - Fall 2026")
  );
  assert.notEqual(repostKey("Acme", "Data Intern"), repostKey("Acme", "Software Intern"));
});

test("repostDates counts earlier listings more than two weeks apart only", () => {
  const dates = repostDates("2026-11-01T00:00:00Z", [
    "2026-10-25T00:00:00Z", // same posting through another source
    "2026-09-01T00:00:00Z",
    "2026-08-28T00:00:00Z", // same week as 09-01: one listing
    "2026-06-01T00:00:00Z",
    "2026-12-01T00:00:00Z", // later, not "before"
    null,
  ]);
  assert.deepEqual(dates, ["2026-06-01", "2026-08-28"]);
  assert.deepEqual(repostDates(null, ["2026-01-01T00:00:00Z"]), []);
  const s = postingSignals({ posted_at: null, description_text: null }, new Date(), dates);
  assert.equal(s[0].id, "repost");
  assert.equal(s[0].level, "caution");
  assert.match(s[0].label, /Reposted 2 times/);
});
