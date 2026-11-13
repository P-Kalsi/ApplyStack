import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeKey, importApplicationsCsv, parseCsv, parseDate } from "../src/lib/applications/csv-import";

const SHEET = [
  "App Date,Org,Job Title,Posting,Site,Interview,Decision,Decision Date",
  '7/8/2026,Applied Optimal,AI/SaaS Software Engineer Intern,,,TRUE,Pending,9/3/2026',
  '7/27/2026,Ciena,"Software Engineer, Tools Dev Intern",https://jobs.example/ciena,Workday,FALSE,Pending,9/3/2026',
  "8/4/2026,Samsara,Software Engineering Intern,,,FALSE,Rejected,9/20/2026",
  "8/4/2026,Samsara,Software Engineering Intern,,,FALSE,Pending,",
  ",NoRole Inc,,,,,,",
].join("\r\n");

test("parseCsv handles quotes, embedded commas, and CRLF", () => {
  const rows = parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n');
  assert.deepEqual(rows, [["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
});

test("parseDate normalizes common spreadsheet formats", () => {
  assert.equal(parseDate("7/8/2026"), "2026-07-08");
  assert.equal(parseDate("2026-08-12"), "2026-08-12");
  assert.equal(parseDate("8/12/26"), "2026-08-12");
  assert.equal(parseDate(""), null);
});

test("imports a spreadsheet tracker with sensible statuses", () => {
  const { rows, skipped } = importApplicationsCsv(SHEET);
  assert.equal(rows.length, 3);
  const [optimal, ciena, samsara] = rows;
  assert.equal(optimal.status, "interview", "Interview=TRUE with a pending decision");
  assert.equal(optimal.date_applied, "2026-07-08");
  assert.equal(ciena.role, "Software Engineer, Tools Dev Intern");
  assert.equal(ciena.status, "applied");
  assert.equal(ciena.job_url, "https://jobs.example/ciena");
  assert.match(ciena.notes ?? "", /Applied via Workday/);
  assert.ok(!(ciena.notes ?? "").includes("Decision"), "pending decision dates are not noted");
  assert.equal(samsara.status, "rejected");
  assert.match(samsara.notes ?? "", /Decision \(Rejected\) on 2026-09-20/);
  // Duplicate Samsara row and the row without a role are skipped.
  assert.equal(skipped.length, 2);
});

test("explicit Status column and Resume column are honoured", () => {
  const { rows } = importApplicationsCsv(
    "Company,Role,Status,Resume,Date Applied\nIBM,Software Developer Intern,Online Assessment,IBM_SoftwareDev_Intern_Resume.docx,2026-11-12\n"
  );
  assert.equal(rows[0].status, "oa");
  assert.match(rows[0].notes ?? "", /Resume: IBM_SoftwareDev_Intern_Resume\.docx/);
});

test("missing required columns produce a clear error", () => {
  const { rows, skipped } = importApplicationsCsv("Date,Something\n1/1/2026,x\n");
  assert.equal(rows.length, 0);
  assert.match(skipped[0].reason, /company column/);
});

test("dedupeKey ignores case and punctuation", () => {
  assert.equal(dedupeKey("Ciena", "Software Engineer, Tools Dev Intern"), dedupeKey("CIENA", "software engineer tools dev intern"));
});
