// Discord alerts for new internships from the Simplify feed.
//
// Runs on this computer while ApplyStack is running (see scheduler.ts). It
// reads the same feed filters as Discover, remembers which listings it has
// already announced in .applystack-alerts.json, and posts new ones to the
// webhook in DISCORD_WEBHOOK_URL. The first run only records what's already
// open, so you aren't flooded with hundreds of old listings.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanApplyUrl,
  matchesFeed,
  pickLocation,
  simplifyUrl,
  TERM_NOT_LISTED,
  type FeedFilter,
  type SimplifyListing,
} from "../jobs/adapters/simplify";
import { discordWebhookUrl, feedFilter, isValidDiscordWebhook, loadFeedSettings } from "../jobs/feed-settings";

export interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}

export interface DiscordPayload {
  username: string;
  content?: string;
  embeds?: DiscordEmbed[];
  allowed_mentions: { parse: string[] };
}

export interface AlertState {
  initialized_at: string | null;
  last_run_at: string | null;
  last_result: string | null;
  etag: string | null;
  seen: string[];
}

const MAX_ALERTS_PER_RUN = 25;
const EMBEDS_PER_MESSAGE = 10;
const COLOR = 0x2f6fde;

export function appUrl(): string {
  return (process.env.APPLYSTACK_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function statePath(): string {
  return process.env.APPLYSTACK_ALERTS_STATE || join(process.cwd(), ".applystack-alerts.json");
}

export function loadAlertState(): AlertState {
  const empty: AlertState = { initialized_at: null, last_run_at: null, last_result: null, etag: null, seen: [] };
  const path = statePath();
  if (!existsSync(path)) return empty;
  try {
    return { ...empty, ...(JSON.parse(readFileSync(path, "utf8")) as Partial<AlertState>) };
  } catch {
    return empty;
  }
}

export function saveAlertState(state: AlertState): void {
  writeFileSync(statePath(), JSON.stringify(state));
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function listingEmbed(l: SimplifyListing, filter: FeedFilter, base = appUrl()): DiscordEmbed {
  const terms = (l.terms || []).filter((t) => t && t !== TERM_NOT_LISTED);
  const location = pickLocation(l, filter.regions) || "Location not listed";
  const fields: DiscordEmbed["fields"] = [
    { name: "Term", value: terms.length ? terms.join(", ") : "Not listed", inline: true },
    { name: "Category", value: l.category || "n/a", inline: true },
  ];
  if (l.date_posted) fields.push({ name: "Posted", value: `<t:${l.date_posted}:R>`, inline: true });
  const tailor = `${base}/discover?q=${encodeURIComponent(l.company_name)}`;
  return {
    title: clip(l.title, 250),
    url: cleanApplyUrl(l.url),
    description: clip(`**${l.company_name}** — ${location}\n[Open in ApplyStack](${tailor}) to check your match and tailor`, 1000),
    color: COLOR,
    fields,
  };
}

/** Split new listings into webhook messages of at most 10 embeds. */
export function buildAlertMessages(
  listings: SimplifyListing[],
  filter: FeedFilter,
  opts: { extra?: number; base?: string } = {}
): DiscordPayload[] {
  const out: DiscordPayload[] = [];
  for (let i = 0; i < listings.length; i += EMBEDS_PER_MESSAGE) {
    const batch = listings.slice(i, i + EMBEDS_PER_MESSAGE);
    const first = i === 0;
    const total = listings.length + (opts.extra ?? 0);
    out.push({
      username: "ApplyStack",
      ...(first
        ? {
            content:
              `**${total} new internship${total === 1 ? "" : "s"}** matching your filters` +
              (opts.extra ? ` (showing the newest ${listings.length}; the rest are in Discover)` : ""),
          }
        : {}),
      embeds: batch.map((l) => listingEmbed(l, filter, opts.base)),
      allowed_mentions: { parse: [] },
    });
  }
  return out;
}

function describeFilter(f: FeedFilter): string {
  const parts = [
    f.regions.length ? f.regions.join(" / ") : "any location",
    f.terms.length ? f.terms.map((t) => (t === TERM_NOT_LISTED ? "term not listed" : t)).join(", ") : "any term",
    f.categories.length ? f.categories.join(", ") : "any category",
  ];
  return parts.join(" · ");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST one message; waits and retries when Discord rate-limits (429). */
export async function postToDiscord(
  webhook: string,
  payload: DiscordPayload,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetchImpl(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return;
    if (res.status === 429) {
      let wait = 2;
      try {
        wait = Number(((await res.json()) as { retry_after?: number }).retry_after) || 2;
      } catch {
        // keep default
      }
      await sleep(Math.min(wait, 30) * 1000 + 250);
      continue;
    }
    if (res.status === 401 || res.status === 404) {
      throw new Error("Discord rejected the webhook (it was deleted, or DISCORD_WEBHOOK_URL is wrong).");
    }
    throw new Error(`Discord returned HTTP ${res.status}.`);
  }
  throw new Error("Discord kept rate-limiting the webhook; try again in a minute.");
}

export interface AlertRunResult {
  ok: boolean;
  message: string;
  sent: number;
}

function webhookOrError(): { webhook: string } | { error: string } {
  const webhook = discordWebhookUrl();
  if (!webhook) return { error: "DISCORD_WEBHOOK_URL isn't set. Add it to .env.local and restart ApplyStack." };
  if (!isValidDiscordWebhook(webhook)) {
    return { error: "DISCORD_WEBHOOK_URL doesn't look like a Discord webhook link (https://discord.com/api/webhooks/…)." };
  }
  return { webhook };
}

/**
 * One alert pass: fetch the feed (skipped cheaply when unchanged, via ETag),
 * find matching listings not yet announced, and post them.
 */
export async function runAlertCheck(
  opts: { fetchImpl?: typeof fetch; postDelayMs?: number; base?: string } = {}
): Promise<AlertRunResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const hook = webhookOrError();
  if ("error" in hook) return { ok: false, message: hook.error, sent: 0 };

  const filter = feedFilter(loadFeedSettings());
  const state = loadAlertState();
  const finish = (r: AlertRunResult): AlertRunResult => {
    saveAlertState({ ...state, last_run_at: new Date().toISOString(), last_result: r.message });
    return r;
  };

  try {
    const res = await fetchImpl(simplifyUrl(), {
      headers: { accept: "application/json", ...(state.etag && state.initialized_at ? { "if-none-match": state.etag } : {}) },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 304) return finish({ ok: true, message: "No changes in the internship list.", sent: 0 });
    if (!res.ok) throw new Error(`Simplify list returned HTTP ${res.status}`);
    const listings = (await res.json()) as SimplifyListing[];
    state.etag = res.headers.get("etag");

    const matching = listings.filter((l) => matchesFeed(l, filter));
    const seen = new Set(state.seen);

    if (!state.initialized_at) {
      await postToDiscord(
        hook.webhook,
        {
          username: "ApplyStack",
          content:
            `ApplyStack alerts are on. Watching **${matching.length}** open internships (${describeFilter(filter)}). ` +
            "You'll get a message here when new ones are posted.",
          allowed_mentions: { parse: [] },
        },
        fetchImpl
      );
      state.initialized_at = new Date().toISOString();
      state.seen = matching.map((l) => l.id);
      return finish({ ok: true, message: `Alerts set up: watching ${matching.length} listings.`, sent: 0 });
    }

    const fresh = matching
      .filter((l) => !seen.has(l.id))
      .sort((a, b) => (b.date_posted ?? 0) - (a.date_posted ?? 0));
    const shown = fresh.slice(0, MAX_ALERTS_PER_RUN);
    const messages = buildAlertMessages(shown, filter, { extra: fresh.length - shown.length, base: opts.base });
    for (const [i, m] of messages.entries()) {
      if (i > 0) await sleep(opts.postDelayMs ?? 1200);
      await postToDiscord(hook.webhook, m, fetchImpl);
    }

    // Remember everything announced; forget ids that left the list entirely.
    const listed = new Set(listings.map((l) => l.id));
    state.seen = Array.from(new Set([...state.seen.filter((id) => listed.has(id)), ...matching.map((l) => l.id)]));
    return finish({
      ok: true,
      message: fresh.length ? `Sent ${fresh.length} new internship alert${fresh.length === 1 ? "" : "s"}.` : "No new matching internships.",
      sent: fresh.length,
    });
  } catch (err) {
    return finish({ ok: false, message: err instanceof Error ? err.message : String(err), sent: 0 });
  }
}

export async function sendTestAlert(fetchImpl: typeof fetch = fetch): Promise<AlertRunResult> {
  const hook = webhookOrError();
  if ("error" in hook) return { ok: false, message: hook.error, sent: 0 };
  const filter = feedFilter(loadFeedSettings());
  try {
    await postToDiscord(
      hook.webhook,
      {
        username: "ApplyStack",
        content: `Test alert from ApplyStack. Your filters: ${describeFilter(filter)}. New matching internships will be posted here.`,
        allowed_mentions: { parse: [] },
      },
      fetchImpl
    );
    return { ok: true, message: "Test alert sent. Check your Discord channel.", sent: 1 };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), sent: 0 };
  }
}

/** Forget what's been announced (used when filters change a lot). */
export function resetAlertBaseline(): void {
  const s = loadAlertState();
  saveAlertState({ ...s, initialized_at: null, etag: null, seen: [] });
}
