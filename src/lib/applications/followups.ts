// Follow-up cadence for applications: which ones are due a nudge today, and
// a short draft for each. Idea adapted from career-ops' follow-up cadence
// (https://github.com/career-ops-hq/career-ops, MIT).
//
//   Applied    first follow-up 7 days after applying, a second 7 days later,
//              then (10 days after that) a suggestion to close it out
//   OA         a check-in 7 days after it moved to OA
//   Interview  a check-in 5 days after it moved to Interview
//   Your own next-action date always wins over the computed one.
//
// Follow-ups you've sent are recorded as "Followed up YYYY-MM-DD" lines in the
// application's notes, so the history is visible and editable. Drafts are
// templates, not AI output: they claim nothing about you, and anything only
// you know is left as [brackets]. Pure and unit-tested.

import type { ApplicationRow } from "../types";

export type FollowUpKind = "first" | "second" | "close_out" | "oa" | "interview" | "reminder";

export interface FollowUp {
  applicationId: string;
  company: string;
  role: string;
  kind: FollowUpKind;
  label: string;
  dueDate: string; // YYYY-MM-DD
  daysOverdue: number;
  subject: string;
  body: string;
}

const DAY = 86_400_000;
const FOLLOWED_UP_RE = /^Followed up (\d{4}-\d{2}-\d{2})/gm;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const longDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

/** Dates of the follow-ups recorded in the notes, oldest first. */
export function followUpsSent(notes: string | null): string[] {
  return [...(notes || "").matchAll(FOLLOWED_UP_RE)].map((m) => m[1]).sort();
}

/** The note line recorded when you mark a follow-up as sent. */
export function followUpNote(today: string): string {
  return `Followed up ${today}`;
}

type App = Pick<
  ApplicationRow,
  "id" | "company" | "role" | "status" | "date_applied" | "notes" | "next_action" | "next_action_date" | "created_at" | "updated_at"
>;

function draft(kind: FollowUpKind, app: App, name: string): { subject: string; body: string } {
  const sign = name ? `\n\nThank you,\n${name}` : "\n\nThank you,";
  const applied = app.date_applied ? ` on ${longDate(app.date_applied)}` : "";
  switch (kind) {
    case "first":
      return {
        subject: `Following up on my ${app.role} application`,
        body: `Hi [name or "Hiring Team"],\n\nI applied for the ${app.role} position at ${app.company}${applied} and wanted to follow up to say I'm still very interested in the role. If there's anything else I can share to help with your review, I'd be glad to send it.${sign}`,
      };
    case "second":
      return {
        subject: `Checking in: ${app.role} application`,
        body: `Hi [name or "Hiring Team"],\n\nI wanted to check in once more on my application for the ${app.role} position${applied}. I'm still very interested, and I'd appreciate any update on the timeline when you have a moment.${sign}`,
      };
    case "close_out":
      return {
        subject: "",
        body: `No reply after two follow-ups. Consider moving ${app.company} to Rejected or Withdrawn so your pipeline stays accurate; you can always move it back.`,
      };
    case "oa":
      return {
        subject: `Next steps after the ${app.role} assessment`,
        body: `Hi [name or "Hiring Team"],\n\nI recently completed the online assessment for the ${app.role} position at ${app.company} and wanted to ask about next steps and the expected timeline. Thank you for the opportunity to take part.${sign}`,
      };
    case "interview":
      return {
        subject: `Thank you: ${app.role} interview`,
        body: `Hi [interviewer's name],\n\nThank you again for taking the time to talk with me about the ${app.role} position at ${app.company}. I especially enjoyed [one thing you discussed]. I'm still very excited about the role, and I'd be glad to share anything else that would help.${sign}`,
      };
    case "reminder":
      return { subject: "", body: app.next_action || "Your reminder for this application." };
  }
}

const LABEL: Record<FollowUpKind, string> = {
  first: "First follow-up",
  second: "Second follow-up",
  close_out: "Close it out?",
  oa: "Ask about next steps",
  interview: "Interview follow-up",
  reminder: "Your reminder",
};

/** The follow-up an application needs and when, or null if none. */
export function nextFollowUp(app: App, name = ""): Omit<FollowUp, "daysOverdue"> | null {
  const base = { applicationId: app.id, company: app.company, role: app.role };
  const make = (kind: FollowUpKind, dueDate: string) => ({ ...base, kind, label: LABEL[kind], dueDate, ...draft(kind, app, name) });
  const sent = followUpsSent(app.notes);
  const last = sent[sent.length - 1];
  const changed = app.updated_at.slice(0, 10);

  if (app.next_action_date) {
    // A snoozed follow-up keeps its draft and moves its date; any other next action is your own reminder.
    const computed = app.next_action === SNOOZED ? computedFollowUp() : null;
    return computed ? { ...computed, dueDate: app.next_action_date } : make("reminder", app.next_action_date);
  }
  return computedFollowUp();

  function computedFollowUp(): Omit<FollowUp, "daysOverdue"> | null {
    return computeFor(app, sent, last, changed, make);
  }
}

/** The next_action text a snooze sets. */
export const SNOOZED = "Follow up";

function computeFor(
  app: App,
  sent: string[],
  last: string | undefined,
  changed: string,
  make: (kind: FollowUpKind, dueDate: string) => Omit<FollowUp, "daysOverdue">
): Omit<FollowUp, "daysOverdue"> | null {
  if (app.status === "applied") {
    const applied = app.date_applied || app.created_at.slice(0, 10);
    if (sent.length === 0 || !last) return make("first", addDays(applied, 7));
    if (sent.length === 1) return make("second", addDays(last, 7));
    return make("close_out", addDays(last, 10));
  }
  if (app.status === "oa") {
    if (last && last >= changed) return null; // already checked in since it moved to OA
    return make("oa", addDays(changed, 7));
  }
  if (app.status === "interview") {
    if (last && last >= changed) return null;
    return make("interview", addDays(changed, 5));
  }
  return null;
}

/** Follow-ups due today or earlier (most overdue first), and those coming up in the next `aheadDays`. */
export function followUpsDue(apps: App[], today: string, name = "", aheadDays = 3): { due: FollowUp[]; upcoming: FollowUp[] } {
  const due: FollowUp[] = [];
  const upcoming: FollowUp[] = [];
  for (const app of apps) {
    const f = nextFollowUp(app, name);
    if (!f) continue;
    const overdue = daysBetween(f.dueDate, today);
    if (overdue >= 0) due.push({ ...f, daysOverdue: overdue });
    else if (-overdue <= aheadDays) upcoming.push({ ...f, daysOverdue: overdue });
  }
  due.sort((a, b) => b.daysOverdue - a.daysOverdue);
  upcoming.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return { due, upcoming };
}

export { addDays };
