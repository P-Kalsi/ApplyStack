import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNormalizedJob,
  canonicalUrl,
  classifyCategories,
  htmlToText,
  inferEmploymentType,
  inferWorkMode,
  makeDedupeKey,
  slugify,
} from "../src/lib/jobs/normalize";
import { mapGreenhouseJob } from "../src/lib/jobs/adapters/greenhouse";
import { mapLeverPosting } from "../src/lib/jobs/adapters/lever";

test("slugify normalizes company names", () => {
  assert.equal(slugify("Kite & Compass"), "kite-and-compass");
  assert.equal(slugify("  Café  Résumé "), "cafe-resume");
  assert.equal(slugify("C++ Corp."), "c-corp");
});

test("canonicalUrl strips query, fragment and trailing slash", () => {
  assert.equal(
    canonicalUrl("https://Boards.Greenhouse.io/acme/jobs/123/?gh_src=abc#apply"),
    "https://boards.greenhouse.io/acme/jobs/123"
  );
  assert.equal(canonicalUrl(null), "");
});

test("htmlToText produces readable text with list bullets", () => {
  const text = htmlToText(
    "<p>We build things.</p><ul><li>Ship <b>React</b> features</li><li>Write tests</li></ul>"
  );
  assert.match(text, /We build things\./);
  assert.match(text, /- Ship React features/);
  assert.match(text, /- Write tests/);
});

test("inferWorkMode prefers explicit location hints", () => {
  assert.equal(inferWorkMode("Remote (Canada)", null), "remote");
  assert.equal(inferWorkMode("Vancouver, BC (Hybrid)", null), "hybrid");
  assert.equal(inferWorkMode("Toronto, ON", "This role is hybrid."), "hybrid");
  assert.equal(inferWorkMode("Toronto, ON", null), "onsite");
  assert.equal(inferWorkMode(null, null), "unknown");
});

test("inferEmploymentType detects internships and co-ops", () => {
  assert.equal(inferEmploymentType("Software Engineer Intern"), "internship");
  assert.equal(inferEmploymentType("Software Developer Co-op"), "internship");
  assert.equal(inferEmploymentType("New Grad Software Engineer"), "newgrad");
  assert.equal(inferEmploymentType("Senior Platform Engineer"), "other");
});

test("classifyCategories tags roles from title and body", () => {
  assert.ok(classifyCategories("Frontend Engineer Intern (React)").includes("frontend"));
  assert.ok(classifyCategories("Site Reliability Engineering Intern").includes("sre"));
  const cats = classifyCategories("Intern", "You will train machine learning models.");
  assert.ok(cats.includes("ai-ml"));
});

test("buildNormalizedJob extracts skills and builds a dedupe key", () => {
  const job = buildNormalizedJob({
    source: "manual",
    company: "Acme Corp",
    title: "Backend Intern",
    location: "Vancouver, BC",
    url: "https://acme.example/jobs/1?utm=x",
    description_text: "Use Node.js, PostgreSQL and Docker daily.",
  });
  assert.ok(job.skills.includes("node.js"));
  assert.ok(job.skills.includes("postgresql"));
  assert.ok(job.skills.includes("docker"));
  assert.equal(job.employment_type, "internship");
  assert.equal(
    job.dedupe_key,
    "acme-corp|backend-intern|vancouver-bc|https://acme.example/jobs/1"
  );
});

test("greenhouse adapter maps postings into the internal model", () => {
  const job = mapGreenhouseJob(
    {
      id: 42,
      title: "Software Engineer Intern",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/42?gh_src=x",
      location: { name: "Remote" },
      content: "&lt;p&gt;Write &lt;b&gt;Python&lt;/b&gt; services with Docker.&lt;/p&gt;",
      first_published: "2026-06-30T12:00:00Z",
    },
    "acme",
    "Acme"
  );
  assert.equal(job.source, "greenhouse");
  assert.equal(job.company, "Acme");
  assert.equal(job.work_mode, "remote");
  assert.ok(job.skills.includes("python"));
  assert.ok(job.skills.includes("docker"));
  assert.ok(job.dedupe_key.includes("acme|software-engineer-intern|remote|"));
});

test("lever adapter maps postings into the internal model", () => {
  const job = mapLeverPosting(
    {
      id: "abc",
      text: "Data Engineering Intern",
      hostedUrl: "https://jobs.lever.co/acme/abc",
      createdAt: 1750000000000,
      categories: { location: "Toronto, ON", commitment: "Internship" },
      descriptionPlain: "Build pipelines with Python and SQL.",
      lists: [{ text: "Requirements", content: "<li>Pandas</li><li>Airflow</li>" }],
    },
    "acme",
    "Acme"
  );
  assert.equal(job.source, "lever");
  assert.equal(job.employment_type, "internship");
  assert.ok(job.skills.includes("python"));
  assert.ok(job.skills.includes("pandas"));
  assert.ok(job.skills.includes("airflow"));
  assert.match(job.description_text || "", /- Pandas/);
});
