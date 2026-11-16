"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import {
  checkLlmBackend,
  loadLlmSettings,
  saveLlmSettings,
  type LlmSettings,
  type LlmStatus,
} from "@/lib/ai/llm";
import { z } from "zod";
import { FEED_CATEGORIES, FEED_REGIONS } from "@/lib/jobs/adapters/simplify";
import { loadFeedSettings, saveFeedSettings } from "@/lib/jobs/feed-settings";
import { resetAlertBaseline, runAlertCheck, sendTestAlert } from "@/lib/alerts/discord";
import { clearSourceCache } from "@/lib/jobs/sources/cache";
import { findPreset } from "@/lib/jobs/presets";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function fail(err: unknown, fallback: string): ActionResult {
  return { ok: false, message: err instanceof Error ? err.message : fallback };
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function saveProfile(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      full_name: str(fd, "full_name") || null,
      phone: str(fd, "phone") || null,
      location: str(fd, "location") || null,
      website: str(fd, "website") || null,
      github: str(fd, "github") || null,
      linkedin: str(fd, "linkedin") || null,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/settings");
    return { ok: true, message: "Profile saved." };
  } catch (err) {
    return fail(err, "Failed to save profile.");
  }
}

export async function addJobSource(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const kind = str(fd, "kind");
    const token = str(fd, "token").toLowerCase();
    if (kind !== "greenhouse" && kind !== "lever" && kind !== "ashby") return { ok: false, message: "Invalid source type." };
    if (!token || !/^[a-z0-9-]+$/.test(token)) {
      return {
        ok: false,
        message:
          "Enter just the board token / site name (lowercase letters, digits, hyphens) — e.g. from boards.greenhouse.io/<token> or jobs.lever.co/<site> or jobs.ashbyhq.com/<board>.",
      };
    }
    const { error } = await supabase.from("job_sources").insert({
      user_id: user.id,
      kind,
      token,
      label: str(fd, "label") || null,
      enabled: true,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, message: "That source is already registered." };
      if (/job_sources_kind_check/.test(error.message)) {
        return { ok: false, message: "Ashby boards need a database update: run supabase/migrations/0010_ashby_boards.sql in the Supabase SQL Editor." };
      }
      throw new Error(error.message);
    }
    revalidatePath("/settings");
    return { ok: true, message: `Added ${kind} source "${token}". Pick "Company boards" (or All sources) on Discover to see its jobs.` };
  } catch (err) {
    return fail(err, "Failed to add source.");
  }
}

/** Add every board in a preset list; boards you already have are left as they are. */
export async function addBoardPreset(presetId: string): Promise<ActionResult> {
  try {
    const preset = findPreset(presetId);
    if (!preset) return { ok: false, message: "Unknown preset." };
    const user = await requireUser();
    const supabase = await createClient();
    const { data: existing, error: readError } = await supabase
      .from("job_sources")
      .select("kind, token")
      .eq("user_id", user.id);
    if (readError) throw new Error(readError.message);
    const have = new Set((existing || []).map((s) => `${s.kind}:${String(s.token).toLowerCase()}`));
    const rows = preset.boards
      .filter((b) => !have.has(`${b.kind}:${b.token}`))
      .map((b) => ({ user_id: user.id, kind: b.kind, token: b.token, label: b.label, enabled: true }));
    if (rows.length) {
      const { error } = await supabase
        .from("job_sources")
        .upsert(rows, { onConflict: "user_id,kind,token", ignoreDuplicates: true });
      if (error) {
        if (/job_sources_kind_check/.test(error.message)) {
          throw new Error("Ashby boards need a database update: run supabase/migrations/0010_ashby_boards.sql in the Supabase SQL Editor.");
        }
        throw new Error(error.message);
      }
    }
    clearSourceCache("boards:");
    revalidatePath("/settings");
    revalidatePath("/discover");
    const skipped = preset.boards.length - rows.length;
    return {
      ok: true,
      message: rows.length
        ? `Added ${rows.length} ${preset.label} board${rows.length === 1 ? "" : "s"}${skipped ? ` (${skipped} you already had)` : ""}. Pick "Company boards" on Discover to see their jobs.`
        : `You already have every ${preset.label} board.`,
    };
  } catch (err) {
    return fail(err, "Failed to add the preset.");
  }
}

export async function toggleJobSource(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("job_sources")
      .update({ enabled })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings");
    return { ok: true, message: enabled ? "Source enabled." : "Source disabled." };
  } catch (err) {
    return fail(err, "Failed to update source.");
  }
}

export async function deleteJobSource(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("job_sources")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/settings");
    return { ok: true, message: "Source removed." };
  } catch (err) {
    return fail(err, "Failed to remove source.");
  }
}

// ---------------------------------------------------------------------------
// AI backend (LLM provider toggle)
// ---------------------------------------------------------------------------

export interface LlmBackendState {
  ok: boolean;
  message: string;
  settings?: LlmSettings;
  status?: LlmStatus;
}

/**
 * Save the backend choice to applystack.config.json and re-run the readiness
 * check immediately, so a missing CLI login or API key shows up right away.
 * API keys are never accepted here; they come from env vars only.
 */
export async function saveLlmBackend(fd: FormData): Promise<LlmBackendState> {
  try {
    await requireUser();
    const timeout = str(fd, "timeout_seconds");
    const settings = saveLlmSettings({
      provider: str(fd, "provider") || "claude_cli",
      model_fast: str(fd, "model_fast"),
      model_smart: str(fd, "model_smart"),
      ...(timeout ? { timeout_seconds: Number(timeout) } : {}),
    });
    const status = await checkLlmBackend({ fresh: true });
    revalidatePath("/", "layout");
    return {
      ok: status.ok,
      message: status.ok ? `Saved. ${status.message}` : `Saved, but the backend isn't ready: ${status.message}`,
      settings,
      status,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to save AI backend." };
  }
}

export async function recheckLlmBackend(): Promise<LlmBackendState> {
  try {
    await requireUser();
    const status = await checkLlmBackend({ fresh: true });
    revalidatePath("/", "layout");
    return { ok: status.ok, message: status.message, settings: loadLlmSettings(), status };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Check failed." };
  }
}

// ---------------------------------------------------------------------------
// Internship feed (Simplify) + Discord alerts
// ---------------------------------------------------------------------------

const FeedFormSchema = z.object({
  enabled: z.boolean(),
  regions: z.array(z.enum(FEED_REGIONS)),
  terms: z.array(z.string().max(40)).max(20),
  categories: z.array(z.enum(FEED_CATEGORIES)),
  alerts_enabled: z.boolean(),
  interval_minutes: z.number().int().min(10).max(1440),
});

export async function saveFeedAndAlerts(input: z.input<typeof FeedFormSchema>): Promise<ActionResult> {
  try {
    await requireUser();
    const d = FeedFormSchema.parse(input);
    const before = loadFeedSettings();
    const filterChanged =
      JSON.stringify([before.simplify.regions, before.simplify.terms, before.simplify.categories]) !==
      JSON.stringify([d.regions, d.terms, d.categories]);
    saveFeedSettings({
      simplify: { enabled: d.enabled, regions: d.regions, terms: d.terms, categories: d.categories },
      alerts: { enabled: d.alerts_enabled, interval_minutes: d.interval_minutes },
    });
    // New filters: start alerts from a fresh baseline instead of flooding the
    // channel with every listing that newly matches.
    if (filterChanged) resetAlertBaseline();
    clearSourceCache("simplify:");
    revalidatePath("/settings");
    revalidatePath("/discover");
    return {
      ok: true,
      message: filterChanged
        ? "Saved. Discover now uses your new filters."
        : "Saved.",
    };
  } catch (err) {
    return fail(err, "Failed to save feed settings.");
  }
}

export async function sendDiscordTest(): Promise<ActionResult> {
  try {
    await requireUser();
    const res = await sendTestAlert();
    return { ok: res.ok, message: res.message };
  } catch (err) {
    return fail(err, "Test failed.");
  }
}

export async function checkAlertsNow(): Promise<ActionResult> {
  try {
    await requireUser();
    const res = await runAlertCheck();
    revalidatePath("/settings");
    return { ok: res.ok, message: res.message };
  } catch (err) {
    return fail(err, "Check failed.");
  }
}
