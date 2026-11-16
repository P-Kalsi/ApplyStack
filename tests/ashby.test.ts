import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAshbyJobs, mapAshbyJob } from "../src/lib/jobs/adapters/ashby";
import { BOARD_PRESETS, findPreset } from "../src/lib/jobs/presets";
import { mergeSources, sourcesFromEnv } from "../src/lib/jobs/registry";

const board = {
  jobs: [
    {
      id: "2f6c1b7e-0000-4000-8000-000000000001",
      title: "Software Engineering Intern (Summer 2027)",
      location: "Toronto",
      secondaryLocations: [{ location: "Vancouver" }],
      isRemote: false,
      isListed: true,
      descriptionPlain: "Build internal tools in TypeScript and React. Work with PostgreSQL.",
      jobUrl: "https://jobs.ashbyhq.com/acme/2f6c1b7e-0000-4000-8000-000000000001",
      publishedAt: "2026-11-01T00:00:00.000Z",
    },
    { id: "hidden", title: "Unlisted role", isListed: false },
  ],
};

test("mapAshbyJob keeps the id, url, locations and description", () => {
  const job = mapAshbyJob(board.jobs[0], "acme", "Acme");
  assert.equal(job.source, "ashby");
  assert.equal(job.source_id, board.jobs[0].id);
  assert.equal(job.company, "Acme");
  assert.equal(job.url, board.jobs[0].jobUrl);
  assert.match(job.location || "", /Toronto/);
  assert.match(job.location || "", /Vancouver/);
  assert.match(job.description_text || "", /TypeScript/);
  assert.equal(job.posted_at, "2026-11-01T00:00:00.000Z");
});

test("fetchAshbyJobs calls the public board API and drops unlisted jobs", async () => {
  let calledUrl = "";
  const fakeFetch = (async (url: string) => {
    calledUrl = String(url);
    return new Response(JSON.stringify(board), { status: 200 });
  }) as unknown as typeof fetch;
  const jobs = await fetchAshbyJobs("acme", "Acme", fakeFetch);
  assert.match(calledUrl, /^https:\/\/api\.ashbyhq\.com\/posting-api\/job-board\/acme/);
  assert.equal(jobs.length, 1);
});

test("fetchAshbyJobs reports a missing board clearly", async () => {
  const fakeFetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(fetchAshbyJobs("nope", undefined, fakeFetch), /Ashby board "nope" returned 404/);
});

test("ASHBY_BOARDS env var adds ashby sources", () => {
  const env = sourcesFromEnv({ ASHBY_BOARDS: "openai, cohere" });
  assert.deepEqual(env, [
    { kind: "ashby", token: "openai" },
    { kind: "ashby", token: "cohere" },
  ]);
  // The same token on a different ATS is a different source.
  const merged = mergeSources([...env, { kind: "greenhouse", token: "openai" }], []);
  assert.equal(merged.length, 3);
});

test("presets: unique ids, valid tokens, no duplicate boards within a preset", () => {
  const ids = new Set<string>();
  for (const p of BOARD_PRESETS) {
    assert.ok(!ids.has(p.id), `duplicate preset id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.boards.length > 0);
    const keys = new Set<string>();
    for (const b of p.boards) {
      assert.match(b.token, /^[a-z0-9-]+$/, `${p.id}: bad token ${b.token}`);
      assert.ok(["greenhouse", "lever", "ashby"].includes(b.kind));
      assert.ok(b.label.trim().length > 0);
      const key = `${b.kind}:${b.token}`;
      assert.ok(!keys.has(key), `${p.id}: duplicate ${key}`);
      keys.add(key);
    }
  }
  assert.equal(findPreset("canada")?.label, "Canadian tech");
  assert.equal(findPreset("nope"), undefined);
});
