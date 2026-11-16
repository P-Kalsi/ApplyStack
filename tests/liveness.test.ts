import { test } from "node:test";
import assert from "node:assert/strict";
import { boardPostingUrl, checkLiveness } from "../src/lib/jobs/liveness";

function fakeFetch(handler: (url: string) => Response) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    return handler(String(url));
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("greenhouse: 200 is open, 404 is closed, other errors are unknown", async () => {
  const url = "https://job-boards.greenhouse.io/stripe/jobs/123456";
  const ok = fakeFetch(() => json({ id: 123456 }));
  assert.equal((await checkLiveness(url, ok.impl)).status, "open");
  assert.match(ok.calls[0], /boards-api\.greenhouse\.io\/v1\/boards\/stripe\/jobs\/123456$/);
  assert.equal((await checkLiveness(url, fakeFetch(() => json({}, 404)).impl)).status, "closed");
  assert.equal((await checkLiveness(url, fakeFetch(() => json({}, 503)).impl)).status, "unknown");
});

test("lever uses the postings API for that one posting", async () => {
  const id = "2f6c1b7e-0000-4000-8000-000000000001";
  const f = fakeFetch(() => json({}, 404));
  assert.equal((await checkLiveness(`https://jobs.lever.co/palantir/${id}`, f.impl)).status, "closed");
  assert.match(f.calls[0], new RegExp(`api\.lever\.co/v0/postings/palantir/${id}$`));
});

test("ashby: open only while the board still lists the id", async () => {
  const id = "2f6c1b7e-0000-4000-8000-000000000001";
  const url = `https://jobs.ashbyhq.com/cohere/${id}`;
  assert.equal((await checkLiveness(url, fakeFetch(() => json({ jobs: [{ id }] })).impl)).status, "open");
  assert.equal((await checkLiveness(url, fakeFetch(() => json({ jobs: [] })).impl)).status, "closed");
  assert.equal(
    (await checkLiveness(url, fakeFetch(() => json({ jobs: [{ id, isListed: false }] })).impl)).status,
    "closed"
  );
});

test("workday: canApply false or a missing posting is closed", async () => {
  const url = "https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Toronto/Intern_R123";
  assert.equal((await checkLiveness(url, fakeFetch(() => json({ jobPostingInfo: { canApply: true } })).impl)).status, "open");
  assert.equal((await checkLiveness(url, fakeFetch(() => json({ jobPostingInfo: { canApply: false } })).impl)).status, "closed");
  assert.equal((await checkLiveness(url, fakeFetch(() => json({}, 410)).impl)).status, "closed");
});

test("other sites are never fetched", async () => {
  const f = fakeFetch(() => json({}));
  for (const url of ["https://www.linkedin.com/jobs/view/123", "https://ca.indeed.com/viewjob?jk=abc", "https://careers.example.com/x", null]) {
    assert.equal((await checkLiveness(url, f.impl)).status, "unknown");
  }
  assert.equal(f.calls.length, 0);
});

test("network failures are unknown, not closed", async () => {
  const boom = (async () => {
    throw new Error("ECONNRESET");
  }) as unknown as typeof fetch;
  const r = await checkLiveness("https://job-boards.greenhouse.io/stripe/jobs/1", boom);
  assert.equal(r.status, "unknown");
  assert.match(r.message, /ECONNRESET/);
});

test("boardPostingUrl rebuilds a board link for jobs that link to the company site", () => {
  const sources = [{ kind: "greenhouse" as const, token: "stripe", label: "Stripe" }];
  const job = { source: "greenhouse", source_id: "8172510", company: "Stripe", url: "https://stripe.com/jobs/search?gh_jid=8172510" };
  assert.equal(boardPostingUrl(job, sources), "https://boards.greenhouse.io/stripe/jobs/8172510");
  // Already a board link: kept as is.
  const direct = { ...job, url: "https://job-boards.greenhouse.io/stripe/jobs/8172510" };
  assert.equal(boardPostingUrl(direct, sources), direct.url);
  // Unknown board or another source: nothing to rebuild.
  assert.equal(boardPostingUrl({ ...job, company: "Other" }, sources), null);
  assert.equal(boardPostingUrl({ ...job, source: "simplify" }, sources), null);
});
