import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanApplyUrl,
  filterAndMap,
  locationRegions,
  mapSimplifyListing,
  matchesFeed,
  pickLocation,
  upcomingTerms,
  type FeedFilter,
  type SimplifyListing,
} from "../src/lib/jobs/adapters/simplify";
import { canBulkFetch, canFetchDescription, fetchPosting, parsePostingUrl } from "../src/lib/jobs/posting";
import { descriptionPatch } from "../src/lib/jobs/normalize";
import { createDemoClient } from "../src/lib/demo/client";
import { ingestSimplify, listJobs } from "../src/lib/db/jobs";
import type { JobRow } from "../src/lib/types";
import { defaultFeedSettings, loadFeedSettings, saveFeedSettings } from "../src/lib/jobs/feed-settings";
import { loadLlmSettings, saveLlmSettings } from "../src/lib/ai/llm";

// Isolated config for the settings tests below.
const dir = mkdtempSync(join(tmpdir(), "applystack-feed-test-"));
process.env.APPLYSTACK_CONFIG = join(dir, "applystack.config.json");

function listing(over: Partial<SimplifyListing> = {}): SimplifyListing {
  return {
    id: "id-1",
    company_name: "Jobber",
    title: "Software Engineer Intern",
    url: "https://job-boards.greenhouse.io/jobber/jobs/7900058002?utm_source=Simplify&ref=Simplify",
    locations: ["Edmonton, AB, Canada"],
    terms: ["Summer 2027"],
    category: "Software",
    active: true,
    is_visible: true,
    date_posted: 1794531669,
    ...over,
  };
}

const CANADA: FeedFilter = { regions: ["Canada"], terms: [], categories: ["Software", "AI/ML/Data"] };

// ---------------------------------------------------------------------------
// Simplify list
// ---------------------------------------------------------------------------

test("locationRegions recognises Canadian, US and remote locations", () => {
  assert.deepEqual(locationRegions("Vancouver, BC"), ["Canada"]);
  assert.deepEqual(locationRegions("Toronto, ON, Canada"), ["Canada"]);
  assert.deepEqual(locationRegions("Remote in Canada"), ["Canada", "Remote"]);
  assert.deepEqual(locationRegions("Mountain View, CA"), ["United States"]);
  assert.deepEqual(locationRegions("New York, NY, USA"), ["United States"]);
  assert.deepEqual(locationRegions("Remote in USA"), ["United States", "Remote"]);
  assert.deepEqual(locationRegions("London, UK"), []);
});

test("matchesFeed keeps open listings that pass every filter", () => {
  assert.ok(matchesFeed(listing(), CANADA));
  assert.ok(!matchesFeed(listing({ active: false }), CANADA), "closed");
  assert.ok(!matchesFeed(listing({ is_visible: false }), CANADA), "hidden");
  assert.ok(!matchesFeed(listing({ locations: ["Austin, TX"] }), CANADA), "wrong region");
  assert.ok(matchesFeed(listing({ locations: ["Austin, TX", "Toronto, ON"] }), CANADA), "any location may match");
  assert.ok(!matchesFeed(listing({ category: "Hardware" }), CANADA), "category");
  assert.ok(matchesFeed(listing({ locations: ["Austin, TX"] }), { ...CANADA, regions: [] }), "no region = any");
});

test("matchesFeed term filter, including listings without a term", () => {
  const f = { ...CANADA, terms: ["Winter 2027"] };
  assert.ok(!matchesFeed(listing(), f));
  assert.ok(matchesFeed(listing({ terms: ["Summer 2027", "Winter 2027"] }), f));
  assert.ok(!matchesFeed(listing({ terms: ["N/A"] }), f));
  assert.ok(matchesFeed(listing({ terms: ["N/A"] }), { ...f, terms: ["Winter 2027", "N/A"] }));
  assert.ok(matchesFeed(listing({ terms: [] }), { ...f, terms: ["N/A"] }), "empty terms count as not listed");
});

test("pickLocation puts locations in the chosen region first and caps the list", () => {
  const l = listing({ locations: ["Austin, TX", "Toronto, ON", "Seattle, WA", "Vancouver, BC", "Denver, CO"] });
  assert.equal(pickLocation(l, ["Canada"]), "Toronto, ON / Vancouver, BC / Austin, TX +2 more");
  assert.equal(pickLocation(listing({ locations: [] }), ["Canada"]), null);
});

test("cleanApplyUrl drops Simplify tracking parameters only", () => {
  assert.equal(
    cleanApplyUrl("https://job-boards.greenhouse.io/jobber/jobs/1?utm_source=Simplify&ref=Simplify&gh_src=abc"),
    "https://job-boards.greenhouse.io/jobber/jobs/1?gh_src=abc"
  );
  assert.equal(cleanApplyUrl("not a url"), "not a url");
});

test("mapSimplifyListing makes an internship job with no description", () => {
  const job = mapSimplifyListing(listing({ category: "AI/ML/Data", title: "Machine Learning Co-op" }), ["Canada"]);
  assert.equal(job.source, "simplify");
  assert.equal(job.source_id, "id-1");
  assert.equal(job.company, "Jobber");
  assert.equal(job.employment_type, "internship");
  assert.equal(job.description_text, null);
  assert.ok(job.categories.includes("ai-ml") && job.categories.includes("data"));
  assert.equal(job.url, "https://job-boards.greenhouse.io/jobber/jobs/7900058002");
  assert.equal(job.posted_at, new Date(1794531669 * 1000).toISOString());
  // Title says "Engineer" not "intern": still an internship.
  assert.equal(mapSimplifyListing(listing({ title: "Platform Engineer" })).employment_type, "internship");
});

test("filterAndMap applies the filter", () => {
  const out = filterAndMap([listing(), listing({ id: "2", active: false }), listing({ id: "3", locations: ["Paris"] })], CANADA);
  assert.equal(out.length, 1);
});

test("upcomingTerms starts at the current season", () => {
  assert.deepEqual(upcomingTerms(new Date("2026-11-13T12:00:00Z"), 4), ["Fall 2026", "Winter 2027", "Spring 2027", "Summer 2027"]);
  assert.deepEqual(upcomingTerms(new Date("2027-02-01T12:00:00Z"), 2), ["Winter 2027", "Spring 2027"]);
});

// ---------------------------------------------------------------------------
// Descriptions from posting links
// ---------------------------------------------------------------------------

test("parsePostingUrl recognises Greenhouse, Lever, Ashby and Workday links", () => {
  assert.deepEqual(parsePostingUrl("https://job-boards.greenhouse.io/jobber/jobs/7900058002?gh_src=x"), {
    kind: "greenhouse", board: "jobber", id: "7900058002", eu: false,
  });
  assert.deepEqual(parsePostingUrl("https://boards.greenhouse.io/orennia/jobs/5277706008"), {
    kind: "greenhouse", board: "orennia", id: "5277706008", eu: false,
  });
  assert.deepEqual(parsePostingUrl("https://boards.greenhouse.io/embed/job_app?for=later&token=123"), {
    kind: "greenhouse", board: "later", id: "123", eu: false,
  });
  assert.equal(parsePostingUrl("https://boards.greenhouse.io/embed/job_app?token=7905463"), null, "no board name");
  assert.deepEqual(parsePostingUrl("https://jobs.lever.co/eqbank/de711d74-f78a-4cdd-a4a1-fdaa6e6602c3/apply"), {
    kind: "lever", site: "eqbank", id: "de711d74-f78a-4cdd-a4a1-fdaa6e6602c3", eu: false,
  });
  assert.deepEqual(
    parsePostingUrl("http://jobs.ashbyhq.com/bree/17d8dd15-5f97-4003-8d6c-170dca13ff88/application?embed=true"),
    { kind: "ashby", org: "bree", id: "17d8dd15-5f97-4003-8d6c-170dca13ff88" }
  );
  assert.deepEqual(
    parsePostingUrl("https://ciena.wd5.myworkdayjobs.com/en-US/Careers/job/Ottawa/AI-ML-Layout-Engineering-Intern_R030123?q=1"),
    {
      kind: "workday",
      origin: "https://ciena.wd5.myworkdayjobs.com",
      tenant: "ciena",
      site: "Careers",
      path: "job/Ottawa/AI-ML-Layout-Engineering-Intern_R030123",
    }
  );
  assert.equal(parsePostingUrl("https://www.d2l.com/careers/jobs/x/8279317/"), null);
  assert.equal(parsePostingUrl("garbage"), null);
  assert.ok(canFetchDescription("https://ciena.wd5.myworkdayjobs.com/Careers/job/Ottawa/X_R1"));
  assert.ok(!canBulkFetch("https://ciena.wd5.myworkdayjobs.com/Careers/job/Ottawa/X_R1"), "Workday only on demand");
  assert.ok(canBulkFetch("https://jobs.lever.co/eqbank/de711d74-f78a-4cdd-a4a1-fdaa6e6602c3"));
});

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (!(url in routes)) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[url]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

test("fetchPosting reads a Greenhouse posting through the Job Board API", async () => {
  const calls: string[] = [];
  const f = fakeFetch(
    {
      "https://boards-api.greenhouse.io/v1/boards/jobber/jobs/7900058002": {
        id: 7900058002,
        title: "Software Engineer Intern",
        company_name: "Jobber",
        location: { name: "Edmonton, AB" },
        absolute_url: "https://job-boards.greenhouse.io/jobber/jobs/7900058002",
        content: "&lt;p&gt;Build things in &lt;b&gt;Ruby&lt;/b&gt; and React.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;PostgreSQL&lt;/li&gt;&lt;/ul&gt;",
        first_published: "2026-11-01T00:00:00Z",
      },
    },
    calls
  );
  const p = await fetchPosting("https://job-boards.greenhouse.io/jobber/jobs/7900058002", f);
  assert.equal(p.title, "Software Engineer Intern");
  assert.equal(p.company, "Jobber");
  assert.equal(p.location, "Edmonton, AB");
  assert.match(p.description_text, /Build things in Ruby and React\.\n+- PostgreSQL/);
  assert.equal(calls.length, 1);
});

test("fetchPosting reads Lever, Ashby and Workday postings", async () => {
  const f = fakeFetch({
    "https://api.lever.co/v0/postings/eqbank/de711d74-f78a-4cdd-a4a1-fdaa6e6602c3": {
      id: "de711d74-f78a-4cdd-a4a1-fdaa6e6602c3",
      text: "Software Developer Co-op",
      categories: { location: "Toronto, ON" },
      descriptionPlain: "Join our platform team.",
      lists: [{ text: "What you'll do", content: "<li>Write TypeScript</li><li>Ship APIs</li>" }],
      hostedUrl: "https://jobs.lever.co/eqbank/de711d74-f78a-4cdd-a4a1-fdaa6e6602c3",
    },
    "https://api.ashbyhq.com/posting-api/job-board/bree?includeCompensation=false": {
      jobs: [
        { id: "other", title: "Other", descriptionPlain: "x" },
        {
          id: "17d8dd15-5f97-4003-8d6c-170dca13ff88",
          title: "Software Engineering Intern",
          location: "Toronto",
          descriptionHtml: "<p>Python and Go</p>",
          descriptionPlain: "Python and Go",
        },
      ],
    },
    "https://ciena.wd5.myworkdayjobs.com/wday/cxs/ciena/Careers/job/Ottawa/AI-ML-Layout-Engineering-Intern_R030123": {
      jobPostingInfo: {
        title: "AI/ML Layout Engineering Intern",
        location: "Ottawa",
        jobDescription: "<p>Use <b>Python</b> and PyTorch.</p>",
        externalUrl: "https://ciena.wd5.myworkdayjobs.com/Careers/job/Ottawa/AI-ML-Layout-Engineering-Intern_R030123",
      },
      hiringOrganization: { name: "Ciena" },
    },
  });
  const lever = await fetchPosting("https://jobs.lever.co/eqbank/de711d74-f78a-4cdd-a4a1-fdaa6e6602c3/apply", f);
  assert.equal(lever.title, "Software Developer Co-op");
  assert.match(lever.description_text, /Join our platform team\.[\s\S]*- Write TypeScript/);

  const ashby = await fetchPosting("https://jobs.ashbyhq.com/bree/17d8dd15-5f97-4003-8d6c-170dca13ff88/application", f);
  assert.equal(ashby.title, "Software Engineering Intern");
  assert.equal(ashby.description_text, "Python and Go");

  const wd = await fetchPosting(
    "https://ciena.wd5.myworkdayjobs.com/en-US/Careers/job/Ottawa/AI-ML-Layout-Engineering-Intern_R030123",
    f
  );
  assert.equal(wd.company, "Ciena");
  assert.equal(wd.description_text, "Use Python and PyTorch.");
});

test("fetchPosting explains unsupported sites and missing postings", async () => {
  await assert.rejects(fetchPosting("https://www.d2l.com/careers/jobs/x/8279317/", fakeFetch({})), /Paste the description/);
  await assert.rejects(fetchPosting("https://boards.greenhouse.io/gone/jobs/1", fakeFetch({})), /no longer exists/);
  await assert.rejects(
    fetchPosting(
      "https://jobs.ashbyhq.com/bree/17d8dd15-5f97-4003-8d6c-170dca13ff88",
      fakeFetch({ "https://api.ashbyhq.com/posting-api/job-board/bree?includeCompensation=false": { jobs: [] } })
    ),
    /no longer on the company's job board/
  );
});

test("descriptionPatch derives skills and keeps categories", () => {
  const patch = descriptionPatch(
    { title: "Software Engineer Intern", location: "Remote in Canada", categories: ["software-engineering"], employment_type: "internship" },
    null,
    "You will build backend services in Python with FastAPI and PostgreSQL, deployed with Docker."
  );
  assert.ok(patch.skills.includes("python") && patch.skills.includes("docker"));
  assert.ok(patch.categories.includes("software-engineering") && patch.categories.includes("backend"));
  assert.equal(patch.work_mode, "remote");
  assert.ok(!("employment_type" in patch), "known type is kept");
});

// ---------------------------------------------------------------------------
// Ingest into the jobs table (demo database, isolated in a temp folder)
// ---------------------------------------------------------------------------

test("ingestSimplify adds, keeps descriptions, closes and fetches descriptions", async () => {
  const work = mkdtempSync(join(tmpdir(), "applystack-ingest-"));
  process.env.APPLYSTACK_DEMO_FILE = join(work, ".demo-data.json");
  {
    const db = createDemoClient() as never;

    const gh = listing({ id: "gh", title: "Backend Intern", url: "https://boards.greenhouse.io/jobber/jobs/42" });
    const wd = listing({
      id: "wd",
      company_name: "Ciena",
      title: "Software Co-op",
      url: "https://ciena.wd5.myworkdayjobs.com/Careers/job/Ottawa/Software-Co-op_R1",
    });
    const calls: string[] = [];
    const f = fakeFetch(
      {
        "https://boards-api.greenhouse.io/v1/boards/jobber/jobs/42": {
          id: 42,
          title: "Backend Intern",
          content: "&lt;p&gt;Go, Kubernetes and PostgreSQL services.&lt;/p&gt;",
        },
      },
      calls
    );

    const first = await ingestSimplify(db, CANADA, { listings: [gh, wd], fetchImpl: f });
    assert.equal(first.matching, 2);
    assert.equal(first.added, 2);
    assert.equal(first.described, 1, "Greenhouse described in bulk; Workday left for on-demand");
    assert.ok(calls.every((c) => !c.includes("myworkdayjobs")), "never bulk-fetches Workday");

    const feedJobs = async () => (await listJobs(db, {})).filter((j: JobRow) => j.source === "simplify");
    let jobs = await feedJobs();
    const ghRow = jobs.find((j) => j.source_id === "gh")!;
    assert.match(ghRow.description_text || "", /Kubernetes/);
    assert.ok(ghRow.skills.includes("kubernetes"));

    // Second refresh: the description survives; the Workday listing closed.
    const second = await ingestSimplify(db, CANADA, { listings: [gh, { ...wd, active: false }], fetchImpl: f });
    assert.equal(second.added, 0);
    assert.equal(second.closed, 1);
    jobs = await feedJobs();
    assert.deepEqual(jobs.map((j) => j.source_id), ["gh"]);
    assert.match(jobs[0].description_text || "", /Kubernetes/);
    const raw = JSON.parse(readFileSync(join(work, ".demo-data.json"), "utf8"));
    assert.equal(raw.jobs.find((j: { source_id: string }) => j.source_id === "wd").is_open, false);
  }
});

// ---------------------------------------------------------------------------
// Settings file: feed and AI backend share one file without clobbering
// ---------------------------------------------------------------------------

test("feed settings and AI backend settings coexist in the config file", async () => {
  assert.deepEqual(defaultFeedSettings().simplify.regions, ["Canada"]);
  saveLlmSettings({ provider: "gemini" });
  saveFeedSettings({ simplify: { terms: ["Winter 2027"] }, alerts: { interval_minutes: 60 } });
  saveLlmSettings({ provider: "openai", model_fast: "gpt-6-luna" });
  assert.deepEqual(loadFeedSettings().simplify.terms, ["Winter 2027"]);
  assert.equal(loadFeedSettings().alerts.interval_minutes, 60);
  assert.equal(loadLlmSettings().provider, "openai");
  saveFeedSettings({ last_ingest_at: "2026-11-13T00:00:00.000Z" });
  assert.equal(loadLlmSettings().model_fast, "gpt-6-luna");
  assert.ok(!readFileSync(process.env.APPLYSTACK_CONFIG!, "utf8").includes("webhook"));
});
