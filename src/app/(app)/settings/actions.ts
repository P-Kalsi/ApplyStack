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
    if (kind !== "greenhouse" && kind !== "lever") return { ok: false, message: "Invalid source type." };
    if (!token || !/^[a-z0-9-]+$/.test(token)) {
      return {
        ok: false,
        message:
          "Enter just the board token / site name (lowercase letters, digits, hyphens) — e.g. from boards.greenhouse.io/<token> or jobs.lever.co/<site>.",
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
      throw new Error(error.message);
    }
    revalidatePath("/settings");
    return { ok: true, message: `Added ${kind} source "${token}". Use "Refresh sources" on Discover to ingest.` };
  } catch (err) {
    return fail(err, "Failed to add source.");
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
