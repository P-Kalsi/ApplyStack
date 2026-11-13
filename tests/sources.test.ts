import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "applystack-sources-test-"));
process.env.APPLYSTACK_CONFIG = join(dir, "applystack.config.json");
process.env.APPLYSTACK_DEMO_FILE = join(dir, ".demo-data.json");
process.env.SIMPLIFY_LISTINGS_URL = "https://example.test/listings.json";

import { buildNormalizedJob } from "../src/lib/jobs/normalize";
import {
  isLocal,
  keywordScore,
  localPlaces,
  matchesQuery,
  matchesWorkplace,
  sortJobs,
  windowList,
} from "../src/lib/jobs/sources/filters";
import { adzunaParams, adzunaSource, mapAdzunaResult } from "../src/lib/jobs/sources/adzuna";
import { cached, clearSourceCache } from "../src/lib/jobs/sources/cache";
import { fetchDiscoverPage, ALL_SOURCES } from "../src/lib/jobs/sources";
import { pageList, parseDiscoverParams, showingText } from "../src/lib/jobs/sources/params";
import type { DiscoverQuery, SourceContext, SourceJob } from "../src/lib/jobs/sources/types";
import { createDemoClient } from "../src/lib/demo/client";
import { materializePage } from "../src/lib/db/jobs";
import { sourceBadge } from "../src/lib/jobs/sources/badges";

const Q: DiscoverQuery = {
  q: "",
  location: "Vancouver, BC",
  radiusKm: 25,
  workplace: "both",
  internship: false,
  categories: [],
  days: null,
  sort: "newest",
};

function job(over: Partial<SourceJob> & { title?: string; location?: string | null; posted?: string } = {}): SourceJob {
  const j = buildNormalizedJob({
    source: (over.source as string) || "simplify",
    source_id: over.source_id ?? Math.random().toString(36).slice(2),
    company: over.company || "Acme",
    title: over.title || "Software Engineer Intern",
    location: over.location === undefined ? "Vancouver, BC" : over.location,
    url: over.url ?? `https://example.com/${Math.random()}`,
    posted_at: over.posted ?? "2026-11-10T00:00:00Z",
  }) as SourceJob;
  if (over.snippet) j.snippet = over.snippet;
  return j;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

test("local means the city or its metro area", () => {
  assert.ok(localPlaces("Vancouver, BC").includes("burnaby"));
  assert.deepEqual(localPlaces("Kelowna, BC"), ["kelowna"]);
  assert.deepEqual(localPlaces(""), []);
  const places = localPlaces("Vancouver, BC");
  assert.ok(isLocal({ location: "Burnaby, BC, Canada" }, places));
  assert.ok(!isLocal({ location: "Toronto, ON" }, places));
  assert.ok(!isLocal({ location: "Richmond, VA" }, localPlaces("Toronto, ON")), "word match, not substring of Richmond Hill");
});

test("workplace filter: local only, remote only, both", () => {
  const van = job({ location: "Vancouver, BC" });
  const remote = job({ location: "Remote in Canada" });
  const tor = job({ location: "Toronto, ON" });
  const w = (workplace: DiscoverQuery["workplace"]) =>
    [van, remote, tor].filter((j) => matchesWorkplace(j, { location: "Vancouver, BC", workplace })).map((j) => j.location);
  assert.deepEqual(w("local"), ["Vancouver, BC"]);
  assert.deepEqual(w("remote"), ["Remote in Canada"]);
  assert.deepEqual(w("both"), ["Vancouver, BC", "Remote in Canada"]);
  assert.ok(matchesWorkplace(tor, { location: "", workplace: "local" }), "no location = anywhere");
});

test("keyword search needs every word; title hits rank highest", () => {
  const a = job({ title: "Backend Developer Co-op", company: "Clio" });
  const b = job({ title: "Data Intern", company: "Backend Labs" });
  assert.equal(keywordScore(a, "backend co-op"), 6);
  assert.equal(keywordScore(b, "backend co-op"), 0);
  assert.ok(keywordScore(a, "backend") > keywordScore(b, "backend"));
  assert.ok(matchesQuery(a, { ...Q, q: "clio" }));
});

test("sorting by newest and by relevance", () => {
  const old = job({ title: "Python Intern", posted: "2026-10-01T00:00:00Z" });
  const recent = job({ title: "Intern", company: "Python Co", posted: "2026-11-12T00:00:00Z" });
  assert.deepEqual(sortJobs([old, recent], "newest", "python").map((j) => j.title), ["Intern", "Python Intern"]);
  assert.deepEqual(sortJobs([old, recent], "relevance", "python").map((j) => j.title), ["Python Intern", "Intern"]);
});

test("windowList pages a filtered list and reports the true total", () => {
  const all = Array.from({ length: 30 }, (_, i) =>
    job({ title: `Intern ${i}`, posted: new Date(Date.UTC(2026, 10, 1 + (i % 28))).toISOString() })
  ).concat([job({ location: "Toronto, ON" })]);
  const w = windowList(all, Q, 10, 10);
  assert.equal(w.total, 30, "Toronto job filtered out");
  assert.equal(w.items.length, 10);
});

// ---------------------------------------------------------------------------
// URL params and pagination text
// ---------------------------------------------------------------------------

test("parseDiscoverParams defaults: Vancouver, 25 km, both, 25 per page", () => {
  const p = parseDiscoverParams({});
  assert.equal(p.query.location, "Vancouver, BC");
  assert.equal(p.query.radiusKm, 25);
  assert.equal(p.query.workplace, "both");
  assert.equal(p.perPage, 25);
  assert.equal(p.page, 1);
  assert.equal(p.source, "all");
  const q = parseDiscoverParams({ location: "", per: "50", page: "3", work: "remote", sort: "relevance", radius: "999" });
  assert.equal(q.query.location, "", "empty = anywhere");
  assert.equal(q.perPage, 50);
  assert.equal(q.page, 3);
  assert.equal(q.query.radiusKm, 25, "unknown radius falls back");
  assert.equal(parseDiscoverParams({ per: "7" }).perPage, 25);
});

test("page numbers and the Showing line", () => {
  assert.deepEqual(pageList(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageList(6, 20), [1, "…", 4, 5, 6, 7, 8, "…", 20]);
  assert.equal(showingText(1, 25, 25, 312), "Showing 1–25 of 312 jobs");
  assert.equal(showingText(13, 25, 12, 312), "Showing 301–312 of 312 jobs");
  assert.equal(showingText(1, 25, 0, 0), "No jobs match these filters");
});

// ---------------------------------------------------------------------------
// Adzuna
// ---------------------------------------------------------------------------

test("adzunaParams: location + radius, remote, internship words, sort", () => {
  const p = adzunaParams({ ...Q, q: "software", internship: true, days: 14 }, 25);
  assert.equal(p.get("where"), "Vancouver, BC");
  assert.equal(p.get("distance"), "25");
  assert.equal(p.get("what"), "software");
  assert.match(p.get("what_or")!, /intern/);
  assert.equal(p.get("results_per_page"), "25");
  assert.equal(p.get("sort_by"), "date");
  assert.equal(p.get("max_days_old"), "14");
  assert.ok(!p.has("app_key"), "keys are added only when sending");
  const r = adzunaParams({ ...Q, workplace: "remote", q: "react", sort: "relevance" }, 80);
  assert.equal(r.get("where"), null);
  assert.equal(r.get("what_and"), "remote");
  assert.equal(r.get("sort_by"), "relevance");
  assert.equal(r.get("results_per_page"), "50", "capped at 50");
});

test("mapAdzunaResult keeps the snippet separate from the description", () => {
  const j = mapAdzunaResult({
    id: 4123,
    title: "<strong>Software</strong> Developer Co-op",
    description: "Work on our React &amp; Node platform…",
    redirect_url: "https://www.adzuna.ca/land/ad/4123",
    created: "2026-11-11T08:00:00Z",
    company: { display_name: "Clio" },
    location: { display_name: "Burnaby, British Columbia" },
  });
  assert.equal(j.source, "adzuna");
  assert.equal(j.title, "Software Developer Co-op");
  assert.equal(j.snippet, "Work on our React & Node platform…");
  assert.equal(j.description_text, null);
  assert.equal(j.employment_type, "internship");
  assert.equal(sourceBadge(j.source), "Adzuna");
});

function adzunaServer(total: number) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    const page = Number(url.pathname.split("/").pop());
    const per = Number(url.searchParams.get("results_per_page"));
    const start = (page - 1) * per;
    const results = Array.from({ length: Math.max(0, Math.min(per, total - start)) }, (_, i) => ({
      id: start + i + 1,
      title: `Developer ${start + i + 1}`,
      company: { display_name: "Local Co" },
      location: { display_name: "Vancouver, British Columbia" },
      created: new Date(Date.UTC(2026, 10, 12) - (start + i) * 3600_000).toISOString(),
      redirect_url: `https://www.adzuna.ca/land/ad/${start + i + 1}`,
    }));
    return new Response(JSON.stringify({ count: total, results }), { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}

test("Adzuna fetches only the page being viewed, and caches it", async () => {
  process.env.ADZUNA_APP_ID = "id123";
  process.env.ADZUNA_APP_KEY = "secret-key";
  clearSourceCache();
  const { f, calls } = adzunaServer(120);
  const ctx = { fetchImpl: f } as SourceContext;

  const p2 = await adzunaSource.fetchWindow(ctx, Q, 25, 25, 25);
  assert.equal(p2.total, 120);
  assert.deepEqual([p2.items[0].title, p2.items.at(-1)!.title], ["Developer 26", "Developer 50"]);
  assert.equal(calls.length, 1, "one request for one page");
  assert.match(calls[0], /\/ca\/search\/2\?/);
  assert.match(calls[0], /results_per_page=25/);

  await adzunaSource.fetchWindow(ctx, Q, 25, 25, 25); // back to page 2
  assert.equal(calls.length, 1, "served from cache");
});

test("Adzuna errors never leak the key", async () => {
  process.env.ADZUNA_APP_ID = "id123";
  process.env.ADZUNA_APP_KEY = "secret-key";
  clearSourceCache();
  const f = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(adzunaSource.fetchWindow({ fetchImpl: f } as SourceContext, Q, 0, 10, 10), (err: Error) => {
    assert.match(err.message, /rejected ADZUNA_APP_ID/);
    assert.ok(!err.message.includes("secret-key"));
    return true;
  });
  delete process.env.ADZUNA_APP_KEY;
  assert.equal((adzunaSource.status({} as SourceContext) as { ready: boolean }).ready, false);
});

test("cache shares one fetch between callers and drops failures", async () => {
  clearSourceCache();
  let n = 0;
  const load = async () => ++n;
  const [a, b] = await Promise.all([cached("k", 60_000, load), cached("k", 60_000, load)]);
  assert.deepEqual([a, b, n], [1, 1, 1]);
  await assert.rejects(cached("bad", 60_000, async () => Promise.reject(new Error("x"))));
  assert.equal(await cached("bad", 60_000, async () => 5), 5, "failure was not cached");
});

// ---------------------------------------------------------------------------
// One Discover page across sources + saving only that page
// ---------------------------------------------------------------------------

test("All sources: merged by date, paged, totals summed, failures isolated", async () => {
  process.env.ADZUNA_APP_ID = "id123";
  process.env.ADZUNA_APP_KEY = "secret-key";
  clearSourceCache();
  const adz = adzunaServer(40);
  // Simplify list served by the same fake fetch.
  const listings = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i}`,
    company_name: `Feed Co ${i}`,
    title: `Software Intern ${i}`,
    url: `https://boards.greenhouse.io/feed${i}/jobs/${i}`,
    locations: ["Vancouver, BC"],
    terms: ["Summer 2027"],
    category: "Software",
    active: true,
    is_visible: true,
    date_posted: Math.floor(Date.UTC(2026, 10, 12, 0, 30) / 1000) - i * 7200,
  }));
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === process.env.SIMPLIFY_LISTINGS_URL) return new Response(JSON.stringify(listings), { status: 200 });
    return adz.f(input, init);
  }) as typeof fetch;
  const supabase = createDemoClient() as never;
  const ctx: SourceContext = { supabase, userId: "u", fetchImpl: f };

  const page1 = await fetchDiscoverPage(ctx, Q, "all", 1, 10);
  assert.equal(page1.items.length, 10);
  const simplifyTotal = page1.sources.find((s) => s.id === "simplify")!.total!;
  const adzunaTotal = page1.sources.find((s) => s.id === "adzuna")!.total!;
  assert.equal(simplifyTotal, 12);
  assert.equal(adzunaTotal, 40);
  assert.ok(page1.total >= 52, "includes the sample jobs added in demo data, if any");
  const times = page1.items.map((j) => Date.parse(j.posted_at!));
  assert.deepEqual(times, [...times].sort((a, b) => b - a), "newest first across sources");
  assert.ok(page1.sources.find((s) => s.id === "boards")!.ready === false);

  const adzBefore = adz.calls.length;
  await fetchDiscoverPage(ctx, Q, "all", 2, 10);
  assert.equal(adz.calls.length - adzBefore, 1, "page 2 fetches one new Adzuna page");

  // One source failing doesn't hide the rest.
  clearSourceCache();
  const broken = (async (input: string | URL | Request) =>
    String(input) === process.env.SIMPLIFY_LISTINGS_URL
      ? new Response(JSON.stringify(listings), { status: 200 })
      : new Response("{}", { status: 429 })) as typeof fetch;
  const partial = await fetchDiscoverPage({ ...ctx, fetchImpl: broken }, Q, "all", 1, 10);
  assert.ok(partial.items.length > 0);
  assert.match(partial.sources.find((s) => s.id === "adzuna")!.error!, /rate limit/);

  // Saving only the current page; a second visit reuses the rows.
  const rows = await materializePage(supabase, page1.items);
  assert.equal(rows.length, 10);
  assert.ok(rows.every((r) => r.id));
  const again = await materializePage(supabase, page1.items);
  assert.deepEqual(again.map((r) => r.id), rows.map((r) => r.id), "no duplicates");
  assert.ok(ALL_SOURCES.length >= 4);
});
