"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const VALID_STATUSES = new Set(APPLICATION_STATUSES.map((s) => s.value));

function fail(err: unknown, fallback: string): ActionResult {
  return { ok: false, message: err instanceof Error ? err.message : fallback };
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function moveApplication(id: string, status: ApplicationStatus): Promise<ActionResult> {
  try {
    if (!VALID_STATUSES.has(status)) return { ok: false, message: "Invalid status." };
    const user = await requireUser();
    const supabase = await createClient();
    const update: Record<string, unknown> = { status };
    if (status === "applied") {
      // Stamp the applied date the first time it moves to Applied.
      const { data } = await supabase
        .from("applications")
        .select("date_applied")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      if (data && !data.date_applied) update.date_applied = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase
      .from("applications")
      .update(update)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/applications");
    const label = APPLICATION_STATUSES.find((s) => s.value === status)?.label ?? status;
    return { ok: true, message: `Moved to ${label}.` };
  } catch (err) {
    return fail(err, "Failed to move application.");
  }
}

export async function upsertApplication(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const status = str(fd, "status") || "saved";
    if (!VALID_STATUSES.has(status as ApplicationStatus)) {
      return { ok: false, message: "Invalid status." };
    }
    const row = {
      user_id: user.id,
      company: str(fd, "company"),
      role: str(fd, "role"),
      status,
      date_applied: str(fd, "date_applied") || null,
      resume_version_id: str(fd, "resume_version_id") || null,
      notes: str(fd, "notes") || null,
      next_action: str(fd, "next_action") || null,
      next_action_date: str(fd, "next_action_date") || null,
      job_url: str(fd, "job_url") || null,
    };
    if (!row.company || !row.role) return { ok: false, message: "Company and role are required." };
    const id = str(fd, "id");
    const q = id
      ? supabase.from("applications").update(row).eq("id", id).eq("user_id", user.id)
      : supabase.from("applications").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    revalidatePath("/applications");
    return { ok: true, message: id ? "Application updated." : "Application added." };
  } catch (err) {
    return fail(err, "Failed to save application.");
  }
}

export async function deleteApplication(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/applications");
    return { ok: true, message: "Application deleted." };
  } catch (err) {
    return fail(err, "Failed to delete application.");
  }
}
