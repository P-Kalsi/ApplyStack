import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyLocated,
  basicDescription,
  basicExtract,
  basicFromTitle,
  canonicalJobUrl,
  foundIn,
  siteOf,
  sliceByMarkers,
  type PageCapture,
} from "../src/lib/jobs/page-import";
import { bookmarkletCode, bookmarkletHref, parseImportFragment } from "../src/lib/jobs/bookmarklet";

const LINKEDIN: PageCapture = {
  url: "https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=software%20co-op&geoId=103366113",
  title: "(2) Software Developer Co-op (Winter 2027) | Clio | LinkedIn",
  text: `Skip to main content
Home
My Network
Jobs
Clio
Software Developer Co-op (Winter 2027)
Burnaby, British Columbia, Canada · 3 days ago · Over 100 applicants
Hybrid   Internship
Easy Apply
Save
About the job
Clio is the leader in cloud-based legal technology. As a Software Developer Co-op you'll join a product team shipping features to thousands of law firms.

What you'll do
- Build features in Ruby on Rails and React
- Write automated tests and review code

What you bring
- Currently enrolled in a Computer Science co-op program
- Experience with JavaScript or TypeScript
Show less
Set alert for similar jobs
Seniority level
Internship
People also viewed
Data Analyst Intern · Hootsuite`,
};

const INDEED: PageCapture = {
  url: "https://ca.indeed.com/jobs?q=software+intern&l=Vancouver%2C+BC&vjk=3f2a9c8b7d6e5f41",
  title: "Software Developer Intern - Vancouver, BC - Indeed.com",
  text: `Software Developer Intern
Trulioo
Vancouver, BC
Internship
Full job description
Trulioo is hiring a Software Developer Intern for our identity platform team in Vancouver.
Responsibilities
Develop backend services in C# and .NET.
Work with PostgreSQL and AWS.
Requirements
Pursuing a degree in Computer Science or Software Engineering.
Report job`,
};

test("siteOf and canonical links (one link per job)", () => {
  assert.equal(siteOf(LINKEDIN.url), "linkedin");
  assert.equal(siteOf(INDEED.url), "indeed");
  assert.equal(siteOf("https://uk.indeed.com/viewjob?jk=1"), "indeed");
  assert.equal(siteOf("https://www.glassdoor.ca/job-listing/x"), "glassdoor");
  assert.equal(siteOf("https://jobs.lever.co/x/y"), null);
  assert.equal(canonicalJobUrl(LINKEDIN.url), "https://www.linkedin.com/jobs/view/4012345678/");
  assert.equal(
    canonicalJobUrl("https://www.linkedin.com/jobs/view/software-developer-co-op-at-clio-4012345678/?trk=abc"),
    "https://www.linkedin.com/jobs/view/4012345678/"
  );
  assert.equal(canonicalJobUrl(INDEED.url), "https://ca.indeed.com/viewjob?jk=3f2a9c8b7d6e5f41");
  assert.equal(canonicalJobUrl("https://ca.indeed.com/viewjob?jk=3f2a9c8b7d6e5f41&from=serp"), "https://ca.indeed.com/viewjob?jk=3f2a9c8b7d6e5f41");
  assert.equal(canonicalJobUrl("not a url"), "not a url");
});

test("basics from the tab title", () => {
  assert.deepEqual(basicFromTitle(LINKEDIN), { title: "Software Developer Co-op (Winter 2027)", company: "Clio", location: "" });
  assert.deepEqual(basicFromTitle(INDEED), { title: "Software Developer Intern", company: "", location: "Vancouver, BC" });
  assert.equal(basicFromTitle({ ...LINKEDIN, title: "Software Co-op Jobs | LinkedIn | LinkedIn" }).title, "", "search page, not a job");
});

test("basic description: from 'About the job' to the footer", () => {
  const d = basicDescription(LINKEDIN.text);
  assert.match(d, /^Clio is the leader/);
  assert.match(d, /JavaScript or TypeScript$/);
  assert.ok(!/Show less|Seniority|People also viewed/.test(d));
  const i = basicDescription(INDEED.text);
  assert.match(i, /^Trulioo is hiring/);
  assert.match(i, /Software Engineering\.$/);
});

test("sliceByMarkers cuts verbatim, ignoring spacing and case", () => {
  const out = sliceByMarkers(
    LINKEDIN.text,
    "Clio is the leader in   cloud-based legal",
    "experience with javascript or typescript"
  );
  assert.ok(out);
  assert.ok(LINKEDIN.text.includes("Write automated tests and review code"));
  assert.match(out!, /^Clio is the leader[\s\S]*Write automated tests and review code[\s\S]*JavaScript or TypeScript$/);
  assert.equal(sliceByMarkers(LINKEDIN.text, "words that are not there", "x y"), null);
});

test("AI answers are checked against the page; the description is never AI-written", () => {
  const job = applyLocated(LINKEDIN, {
    company: "Clio",
    title: "Software Developer Co-op (Winter 2027)",
    location: "Burnaby, British Columbia, Canada",
    description_start: "Clio is the leader in cloud-based legal technology. As a Software",
    description_end: "Experience with JavaScript or TypeScript",
  });
  assert.equal(job.method, "ai");
  assert.equal(job.company, "Clio");
  assert.equal(job.location, "Burnaby, British Columbia, Canada");
  assert.equal(job.site, "linkedin");
  assert.equal(job.url, "https://www.linkedin.com/jobs/view/4012345678/");
  assert.ok(foundIn(LINKEDIN.text, job.description), "description is a verbatim piece of the page");
  assert.deepEqual(job.notes, []);

  const invented = applyLocated(INDEED, {
    company: "Trulioo Inc. (Remote-first)",
    title: "Senior Platform Engineer",
    location: "Vancouver, BC",
    description_start: "a summary the model wrote itself",
    description_end: "and did not copy",
  });
  assert.equal(invented.company, "", "not on the page, left blank");
  assert.equal(invented.title, "Software Developer Intern", "falls back to the tab title");
  assert.match(invented.description, /^Trulioo is hiring/);
  assert.equal(invented.notes.length, 3);
});

test("basicExtract without AI explains what's missing", () => {
  const job = basicExtract(INDEED, "AI backend is Offline");
  assert.equal(job.method, "basic");
  assert.equal(job.company, "");
  assert.ok(job.notes.some((n) => /company/.test(n)));
});

test("bookmark: code, href and #import fragment round trip", () => {
  const code = bookmarkletCode("http://localhost:3000/");
  assert.match(code, /var A="http:\/\/localhost:3000";/);
  assert.doesNotThrow(() => new Function(code), "valid JavaScript");
  const href = bookmarkletHref("http://localhost:3000");
  assert.ok(href.startsWith("javascript:"));
  assert.equal(decodeURIComponent(href.slice("javascript:".length)), bookmarkletCode("http://localhost:3000"));
  const payload = { u: INDEED.url, t: INDEED.title, x: INDEED.text };
  const parsed = parseImportFragment(`#import=${encodeURIComponent(JSON.stringify(payload))}`);
  assert.deepEqual(parsed, payload);
  assert.equal(parseImportFragment("#something-else"), null);
  assert.equal(parseImportFragment("#import=%7Bbroken"), null);
});
