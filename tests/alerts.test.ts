import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SimplifyListing } from "../src/lib/jobs/adapters/simplify";

const dir = mkdtempSync(join(tmpdir(), "applystack-alerts-test-"));
process.env.APPLYSTACK_CONFIG = join(dir, "applystack.config.json");
process.env.APPLYSTACK_ALERTS_STATE = join(dir, "alerts.json");
process.env.SIMPLIFY_LISTINGS_URL = "https://example.test/listings.json";
const WEBHOOK = "https://discord.com/api/webhooks/123456/abc-DEF_ghi";

import {
  buildAlertMessages,
  listingEmbed,
  loadAlertState,
  postToDiscord,
  runAlertCheck,
  sendTestAlert,
} from "../src/lib/alerts/discord";
import { isAlertDue } from "../src/lib/alerts/scheduler";
import { isValidDiscordWebhook } from "../src/lib/jobs/feed-settings";

const FILTER = { regions: ["Canada" as const], terms: [], categories: ["Software" as const] };

function listing(i: number, over: Partial<SimplifyListing> = {}): SimplifyListing {
  return {
    id: `id-${i}`,
    company_name: `Company ${i}`,
    title: `Software Engineer Intern ${i}`,
    url: `https://boards.greenhouse.io/c${i}/jobs/${i}?utm_source=Simplify`,
    locations: ["Vancouver, BC"],
    terms: ["Summer 2027"],
    category: "Software",
    active: true,
    is_visible: true,
    date_posted: 1794500000 + i,
    ...over,
  };
}

interface Sent {
  url: string;
  body: { content?: string; embeds?: { title: string; url?: string; description?: string }[] };
}

/** Fake network: serves the listings file (with ETag support) and records webhook posts. */
function network(opts: { listings: () => SimplifyListing[]; etag?: string; webhookStatus?: number[] }) {
  const sent: Sent[] = [];
  const statuses = [...(opts.webhookStatus ?? [])];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === process.env.SIMPLIFY_LISTINGS_URL) {
      const inm = (init?.headers as Record<string, string> | undefined)?.["if-none-match"];
      if (opts.etag && inm === opts.etag) return new Response(null, { status: 304 });
      return new Response(JSON.stringify(opts.listings()), {
        status: 200,
        headers: opts.etag ? { etag: opts.etag } : {},
      });
    }
    if (url === WEBHOOK) {
      const status = statuses.shift() ?? 204;
      if (status === 429) return new Response(JSON.stringify({ retry_after: 0.01 }), { status: 429 });
      if (status >= 400) return new Response("{}", { status });
      sent.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 204 });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return { f, sent };
}

test("webhook link validation", () => {
  assert.ok(isValidDiscordWebhook(WEBHOOK));
  assert.ok(isValidDiscordWebhook("https://discordapp.com/api/webhooks/1/x"));
  assert.ok(!isValidDiscordWebhook("https://example.com/api/webhooks/1/x"));
  assert.ok(!isValidDiscordWebhook("http://discord.com/api/webhooks/1/x"));
});

test("listingEmbed links the posting and back to ApplyStack", () => {
  const e = listingEmbed(listing(1), FILTER, "http://localhost:3000");
  assert.equal(e.title, "Software Engineer Intern 1");
  assert.equal(e.url, "https://boards.greenhouse.io/c1/jobs/1", "tracking params removed");
  assert.match(e.description!, /\*\*Company 1\*\* — Vancouver, BC/);
  assert.match(e.description!, /http:\/\/localhost:3000\/discover\?q=Company%201/);
  assert.deepEqual(e.fields![0], { name: "Term", value: "Summer 2027", inline: true });
});

test("buildAlertMessages batches 10 embeds per message, headline on the first", () => {
  const msgs = buildAlertMessages(Array.from({ length: 23 }, (_, i) => listing(i)), FILTER, { extra: 4 });
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs.map((m) => m.embeds!.length), [10, 10, 3]);
  assert.match(msgs[0].content!, /27 new internships/);
  assert.match(msgs[0].content!, /showing the newest 23/);
  assert.equal(msgs[1].content, undefined);
  assert.deepEqual(msgs[0].allowed_mentions, { parse: [] }, "never pings anyone");
});

test("postToDiscord waits out rate limits and explains a bad webhook", async () => {
  const ok = network({ listings: () => [], webhookStatus: [429, 204] });
  await postToDiscord(WEBHOOK, { username: "ApplyStack", content: "hi", allowed_mentions: { parse: [] } }, ok.f);
  assert.equal(ok.sent.length, 1);
  const gone = network({ listings: () => [], webhookStatus: [404] });
  await assert.rejects(
    postToDiscord(WEBHOOK, { username: "ApplyStack", content: "hi", allowed_mentions: { parse: [] } }, gone.f),
    /deleted, or DISCORD_WEBHOOK_URL is wrong/
  );
});

test("runAlertCheck needs a webhook", async () => {
  delete process.env.DISCORD_WEBHOOK_URL;
  const res = await runAlertCheck({ fetchImpl: network({ listings: () => [] }).f });
  assert.equal(res.ok, false);
  assert.match(res.message, /DISCORD_WEBHOOK_URL isn't set/);
});

test("first run records a baseline; later runs post only new matches", async () => {
  process.env.DISCORD_WEBHOOK_URL = WEBHOOK;
  let current = [listing(1), listing(2), listing(3, { locations: ["Austin, TX"] })];
  const net = network({ listings: () => current });

  const first = await runAlertCheck({ fetchImpl: net.f, postDelayMs: 0 });
  assert.equal(first.ok, true);
  assert.equal(first.sent, 0);
  assert.equal(net.sent.length, 1, "one intro message, no flood");
  assert.match(net.sent[0].body.content!, /Watching \*\*2\*\* open internships/);
  assert.deepEqual(loadAlertState().seen.sort(), ["id-1", "id-2"]);

  const quiet = await runAlertCheck({ fetchImpl: net.f, postDelayMs: 0 });
  assert.equal(quiet.sent, 0);
  assert.equal(net.sent.length, 1, "nothing new, nothing posted");

  current = [...current, listing(4), listing(5, { active: false }), listing(6, { category: "Hardware" })];
  const third = await runAlertCheck({ fetchImpl: net.f, postDelayMs: 0 });
  assert.equal(third.sent, 1);
  assert.equal(net.sent.length, 2);
  assert.deepEqual(net.sent[1].body.embeds!.map((e) => e.title), ["Software Engineer Intern 4"]);
  assert.match(third.message, /Sent 1 new internship alert/);

  const state = JSON.parse(readFileSync(process.env.APPLYSTACK_ALERTS_STATE!, "utf8"));
  assert.ok(state.last_run_at && state.initialized_at);
});

test("an unchanged list (ETag 304) skips the download", async () => {
  process.env.DISCORD_WEBHOOK_URL = WEBHOOK;
  const net = network({ listings: () => [listing(1)], etag: '"v1"' });
  await runAlertCheck({ fetchImpl: net.f, postDelayMs: 0 }); // stores the ETag
  const res = await runAlertCheck({ fetchImpl: net.f, postDelayMs: 0 });
  assert.equal(res.message, "No changes in the internship list.");
});

test("sendTestAlert posts one message", async () => {
  process.env.DISCORD_WEBHOOK_URL = WEBHOOK;
  const net = network({ listings: () => [] });
  const res = await sendTestAlert(net.f);
  assert.equal(res.ok, true);
  assert.match(net.sent[0].body.content!, /Test alert from ApplyStack/);
});

test("isAlertDue respects the interval", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  assert.ok(isAlertDue(null, 30, now));
  assert.ok(!isAlertDue("2026-11-13T11:45:00Z", 30, now));
  assert.ok(isAlertDue("2026-11-13T11:30:00Z", 30, now));
});
