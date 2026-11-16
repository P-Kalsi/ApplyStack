"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";
import { dedupeKey, importApplicationsCsv } from "@/lib/applications/csv-import";
import { addDays, followUpNote, SNOOZED } from "@/lib/applications/followups";
import { readReply, replyNote } from "@/lib/applications/replies";

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

/**
 * Import applications from a CSV export of a spreadsheet tracker.
 * Rows that already exist (same company + role) are skipped, so importing
 * the same file twice is safe.
 */
export async function importApplications(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const file = fd.get("file");
    if (!(file instanceof File)) return { ok: false, message: "Choose a .csv file." };
    if (file.size > 2 * 1024 * 1024) return { ok: false, message: "CSV is over 2 MB." };

    const { rows, skipped } = importApplicationsCsv(await file.text());
    if (rows.length === 0) {
      return { ok: false, message: skipped[0]?.reason ?? "No rows to import." };
    }

    const { data: existing, error: exErr } = await supabase
      .from("applications")
      .select("company, role")
      .eq("user_id", user.id);
    if (exErr) throw new Error(exErr.message);
    const known = new Set((existing || []).map((a) => dedupeKey(a.company as string, a.role as string)));

    const fresh = rows.filter((r) => !known.has(dedupeKey(r.company, r.role)));
    if (fresh.length > 0) {
      const { error } = await supabase
        .from("applications")
        .insert(fresh.map((r) => ({ user_id: user.id, ...r })));
      if (error) throw new Error(error.message);
    }
    revalidatePath("/applications");

    const already = rows.length - fresh.length;
    const parts = [`Imported ${fresh.length} application(s)`];
    if (already) parts.push(`${already} already tracked`);
    if (skipped.length) parts.push(`${skipped.length} row(s) skipped`);
    return { ok: true, message: parts.join(" · ") + "." };
  } catch (err) {
    return fail(err, "Import failed.");
  }
}

/** Today's date on this computer (YYYY-MM-DD), not UTC. */
function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Record that you sent a follow-up: adds a "Followed up YYYY-MM-DD" line to
 * the notes (the cadence counts these) and clears a reminder date you'd set.
 */
export async function markFollowedUp(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error: readError } = await supabase
      .from("applications")
      .select("notes, next_action_date")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (readError) throw new Error(readError.message);
    const today = localToday();
    const notes = [String(data?.notes ?? "").trimEnd(), followUpNote(today)].filter(Boolean).join("\n");
    const update: Record<string, unknown> = { notes };
    if (data?.next_action_date && data.next_action_date <= today) {
      update.next_action_date = null;
      update.next_action = null;
    }
    const { error } = await supabase.from("applications").update(update).eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/applications");
    return { ok: true, message: "Marked as followed up." };
  } catch (err) {
    return fail(err, "Couldn't update the application.");
  }
}

/** Push this application's follow-up back by some days (sets your next-action date). */
export async function snoozeFollowUp(id: string, days: number): Promise<ActionResult> {
  try {
    if (!Number.isInteger(days) || days < 1 || days > 60) return { ok: false, message: "Pick 1 to 60 days." };
    const user = await requireUser();
    const supabase = await createClient();
    const date = addDays(localToday(), days);
    const { error } = await supabase
      .from("applications")
      .update({ next_action_date: date, next_action: SNOOZED })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/applications");
    return { ok: true, message: `Snoozed until ${date}.` };
  } catch (err) {
    return fail(err, "Couldn't snooze it.");
  }
}

/** Apply a pasted employer reply: move the application and note what it said. */
export async function applyReply(id: string, text: string): Promise<ActionResult> {
  try {
    const reading = readReply(text.slice(0, 20_000));
    if (!reading.kind) return { ok: false, message: "Couldn't tell what this reply means; update the status yourself." };
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error: readError } = await supabase
      .from("applications")
      .select("notes, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (readError) throw new Error(readError.message);
    const notes = [String(data?.notes ?? "").trimEnd(), replyNote(localToday(), reading)].filter(Boolean).join("\n");
    const update: Record<string, unknown> = { notes };
    if (reading.status && reading.status !== data?.status) update.status = reading.status;
    const { error } = await supabase.from("applications").update(update).eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/applications");
    const label = APPLICATION_STATUSES.find((s) => s.value === reading.status)?.label;
    return { ok: true, message: label && update.status ? `${reading.label}: moved to ${label}.` : `${reading.label}: noted.` };
  } catch (err) {
    return fail(err, "Couldn't apply the reply.");
  }
}
