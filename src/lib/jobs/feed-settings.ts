// Settings for the Simplify internship feed and Discord alerts, stored in the
// "feed" part of applystack.config.json (per computer). The Discord webhook
// URL is a secret and lives in the DISCORD_WEBHOOK_URL env var instead.

import { z } from "zod";
import { readConfig, writeConfig } from "../config";
import { FEED_CATEGORIES, FEED_REGIONS, type FeedFilter } from "./adapters/simplify";

const FeedSchema = z.object({
  simplify: z
    .object({
      enabled: z.boolean().default(true),
      regions: z.array(z.enum(FEED_REGIONS)).default(["Canada"]),
      terms: z.array(z.string().max(40)).max(20).default([]),
      categories: z.array(z.enum(FEED_CATEGORIES)).default(["Software", "AI/ML/Data"]),
    })
    .default({}),
  alerts: z
    .object({
      enabled: z.boolean().default(true),
      interval_minutes: z.number().int().min(10).max(1440).default(30),
    })
    .default({}),
  /** When Discover last pulled the feed on this computer (ISO). */
  last_ingest_at: z.string().nullable().default(null),
});

export type FeedSettings = z.infer<typeof FeedSchema>;

export function defaultFeedSettings(): FeedSettings {
  return FeedSchema.parse({});
}

export function loadFeedSettings(): FeedSettings {
  const parsed = FeedSchema.safeParse(readConfig().feed ?? {});
  return parsed.success ? parsed.data : defaultFeedSettings();
}

/** Merge a partial update into the feed section and save; returns the result. */
export function saveFeedSettings(patch: {
  simplify?: Partial<FeedSettings["simplify"]>;
  alerts?: Partial<FeedSettings["alerts"]>;
  last_ingest_at?: string | null;
}): FeedSettings {
  const current = loadFeedSettings();
  const next = FeedSchema.parse({
    simplify: { ...current.simplify, ...(patch.simplify ?? {}) },
    alerts: { ...current.alerts, ...(patch.alerts ?? {}) },
    last_ingest_at: patch.last_ingest_at !== undefined ? patch.last_ingest_at : current.last_ingest_at,
  });
  writeConfig({ ...readConfig(), feed: next });
  return next;
}

export function feedFilter(s: FeedSettings): FeedFilter {
  return { regions: s.simplify.regions, terms: s.simplify.terms, categories: s.simplify.categories };
}

export function discordWebhookUrl(): string | null {
  const url = (process.env.DISCORD_WEBHOOK_URL || "").trim();
  return url || null;
}

export function isValidDiscordWebhook(url: string): boolean {
  return /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url);
}
