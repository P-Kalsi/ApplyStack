// CSV import for the application tracker.
//
// Accepts the common spreadsheet layouts people already keep, e.g.
//   App Date, Org, Job Title, Posting, Site, Interview, Decision, Decision Date
// plus optional Status, Notes, Resume, Next Action, Next Action Date columns.
// Header matching is case-insensitive and tolerant of synonyms.
// Dependency-free and unit-tested.

import type { ApplicationStatus } from "../types";

export interface ImportedApplication {
  company: string;
  role: string;
  status: ApplicationStatus;
  date_applied: string | null; // YYYY-MM-DD
  job_url: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
}

export interface ImportResult {
  rows: ImportedApplication[];
  skipped: { line: number; reason: string }[];
}

/** RFC 4180-ish CSV parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["app date", "date applied", "applied", "applied on", "application date", "date"],
  company: ["org", "organization", "company", "employer"],
  role: ["job title", "title", "role", "position"],
  url: ["posting", "url", "link", "job url", "posting url"],
  site: ["site", "source", "platform", "applied via"],
  interview: ["interview", "interviewed"],
  decision: ["decision", "outcome", "result"],
  decisionDate: ["decision date"],
  status: ["status", "stage"],
  notes: ["notes", "note", "comments"],
  resume: ["resume", "resume file", "resume used", "resume version"],
  nextAction: ["next action", "next step"],
  nextActionDate: ["next action date", "next step date", "follow up date"],
};

function headerIndex(header: string[]): Partial<Record<keyof typeof COLUMN_ALIASES, number>> {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const out: Partial<Record<keyof typeof COLUMN_ALIASES, number>> = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = norm.findIndex((h) => aliases.includes(h));
    if (idx !== -1) out[key as keyof typeof COLUMN_ALIASES] = idx;
  }
  return out;
}

/** Parse M/D/YYYY, M/D/YY, YYYY-MM-DD, or "Aug 12, 2026" into YYYY-MM-DD. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

const STATUS_WORDS: [RegExp, ApplicationStatus][] = [
  [/^saved$/i, "saved"],
  [/^tailoring$/i, "tailoring"],
  [/^ready/i, "ready"],
  [/^applied|^submitted|^pending$/i, "applied"],
  [/assessment|^oa$|coding challenge|hackerrank|codesignal/i, "oa"],
  [/interview|screen/i, "interview"],
  [/offer|accepted|hired/i, "offer"],
  [/reject|declined|no$|not selected|ghost/i, "rejected"],
  [/withdr/i, "withdrawn"],
];

function statusFrom(word: string): ApplicationStatus | null {
  const w = word.trim();
  if (!w) return null;
  for (const [re, status] of STATUS_WORDS) if (re.test(w)) return status;
  return null;
}

function truthy(v: string | undefined): boolean {
  return /^(true|yes|y|1|x|✓)$/i.test((v ?? "").trim());
}

export function importApplicationsCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  const skipped: ImportResult["skipped"] = [];
  if (rows.length === 0) return { rows: [], skipped: [{ line: 1, reason: "File is empty." }] };

  const idx = headerIndex(rows[0]);
  if (idx.company === undefined || idx.role === undefined) {
    return {
      rows: [],
      skipped: [{ line: 1, reason: "Header must include a company column (Org/Company) and a role column (Job Title/Role)." }],
    };
  }
  const get = (r: string[], key: keyof typeof COLUMN_ALIASES) =>
    idx[key] === undefined ? "" : (r[idx[key]!] ?? "").trim();

  const out: ImportedApplication[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const company = get(r, "company");
    const role = get(r, "role");
    if (!company || !role) {
      skipped.push({ line, reason: "Missing company or role." });
      return;
    }
    const key = dedupeKey(company, role);
    if (seen.has(key)) {
      skipped.push({ line, reason: `Duplicate of an earlier row (${company} — ${role}).` });
      return;
    }
    seen.add(key);

    // Status precedence: explicit Status > final Decision > Interview flag > applied.
    const decision = get(r, "decision");
    const decisionStatus = statusFrom(decision);
    let status: ApplicationStatus =
      statusFrom(get(r, "status")) ??
      (decisionStatus && decisionStatus !== "applied" ? decisionStatus : null) ??
      (truthy(get(r, "interview")) ? "interview" : null) ??
      "applied";
    const date = parseDate(get(r, "date"));
    if (status === "saved" && date) status = "applied";

    const notes: string[] = [];
    const site = get(r, "site");
    if (site) notes.push(`Applied via ${site}`);
    const resume = get(r, "resume");
    if (resume) notes.push(`Resume: ${resume}`);
    const decisionDate = parseDate(get(r, "decisionDate"));
    if (decisionDate && decisionStatus && decisionStatus !== "applied") {
      notes.push(`Decision (${decision}) on ${decisionDate}`);
    }
    const extra = get(r, "notes");
    if (extra) notes.push(extra);

    const url = get(r, "url");
    out.push({
      company,
      role,
      status,
      date_applied: date,
      job_url: /^https?:\/\//i.test(url) ? url : null,
      notes: notes.length ? notes.join("\n") : null,
      next_action: get(r, "nextAction") || null,
      next_action_date: parseDate(get(r, "nextActionDate")),
    });
  });

  return { rows: out, skipped };
}

/** Normalized identity for an application (company + role). */
export function dedupeKey(company: string, role: string): string {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${n(company)}|${n(role)}`;
}
