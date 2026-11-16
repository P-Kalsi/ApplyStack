import { test } from "node:test";
import assert from "node:assert/strict";
import { followUpNote, followUpsDue, followUpsSent, nextFollowUp, SNOOZED } from "../src/lib/applications/followups";
import type { ApplicationRow } from "../src/lib/types";

const app = (o: Partial<ApplicationRow>): ApplicationRow => ({
  id: "a1",
  user_id: "u",
  job_id: null,
  company: "Acme",
  role: "Software Intern",
  status: "applied",
  date_applied: "2026-11-01",
  resume_version_id: null,
  notes: null,
  next_action: null,
  next_action_date: null,
  job_url: null,
  sort_order: 0,
  created_at: "2026-10-30T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  ...o,
});

test("applied: first at +7, second 7 days after the first, then close out 10 days later", () => {
  assert.equal(nextFollowUp(app({}))?.kind, "first");
  assert.equal(nextFollowUp(app({}))?.dueDate, "2026-11-08");
  const once = app({ notes: `Recruiter: Sam\n${followUpNote("2026-11-09")}` });
  assert.deepEqual([nextFollowUp(once)?.kind, nextFollowUp(once)?.dueDate], ["second", "2026-11-16"]);
  const twice = app({ notes: `${followUpNote("2026-11-09")}\n${followUpNote("2026-11-16")}` });
  assert.deepEqual([nextFollowUp(twice)?.kind, nextFollowUp(twice)?.dueDate], ["close_out", "2026-11-26"]);
  // No applied date: fall back to when it was added.
  assert.equal(nextFollowUp(app({ date_applied: null }))?.dueDate, "2026-11-06");
});

test("OA and interview check in after a quiet stretch, once", () => {
  const oa = app({ status: "oa", updated_at: "2026-11-05T09:00:00Z" });
  assert.deepEqual([nextFollowUp(oa)?.kind, nextFollowUp(oa)?.dueDate], ["oa", "2026-11-12"]);
  assert.equal(nextFollowUp({ ...oa, notes: followUpNote("2026-11-12") }), null);
  const iv = app({ status: "interview", updated_at: "2026-11-10T09:00:00Z" });
  assert.deepEqual([nextFollowUp(iv)?.kind, nextFollowUp(iv)?.dueDate], ["interview", "2026-11-15"]);
});

test("your own next-action date wins; other statuses need nothing", () => {
  const r = nextFollowUp(app({ next_action: "Email Sam about referral", next_action_date: "2026-11-20" }));
  assert.equal(r?.kind, "reminder");
  assert.equal(r?.body, "Email Sam about referral");
  for (const status of ["saved", "tailoring", "ready", "offer", "rejected", "withdrawn"] as const) {
    assert.equal(nextFollowUp(app({ status })), null, status);
  }
});

test("a snoozed follow-up keeps its draft and moves its date", () => {
  const f = nextFollowUp(app({ next_action: SNOOZED, next_action_date: "2026-11-20" }));
  assert.equal(f?.kind, "first");
  assert.equal(f?.dueDate, "2026-11-20");
  assert.match(f?.body ?? "", /still very interested/);
});

test("drafts name the role and company, sign with your name, and leave unknowns in brackets", () => {
  const f = nextFollowUp(app({}), "Alex Example")!;
  assert.match(f.subject, /Software Intern/);
  assert.match(f.body, /Acme/);
  assert.match(f.body, /on November 1/);
  assert.match(f.body, /\[name or "Hiring Team"\]/);
  assert.match(f.body, /Thank you,\nAlex Example$/);
});

test("followUpsDue splits due and upcoming, most overdue first", () => {
  const apps = [
    app({ id: "late", date_applied: "2026-10-20" }), // due 10-27
    app({ id: "today", date_applied: "2026-11-09" }), // due 11-16
    app({ id: "soon", date_applied: "2026-11-11" }), // due 11-18
    app({ id: "later", date_applied: "2026-11-15" }), // due 11-22
    app({ id: "saved", status: "saved" }),
  ];
  const { due, upcoming } = followUpsDue(apps, "2026-11-16");
  assert.deepEqual(due.map((d) => [d.applicationId, d.daysOverdue]), [["late", 20], ["today", 0]]);
  assert.deepEqual(upcoming.map((d) => d.applicationId), ["soon"]);
});

test("followUpsSent reads only the recorded lines", () => {
  assert.deepEqual(followUpsSent("Followed up 2026-11-09\nmet at career fair\nFollowed up 2026-11-02"), ["2026-11-02", "2026-11-09"]);
  assert.deepEqual(followUpsSent(null), []);
});
