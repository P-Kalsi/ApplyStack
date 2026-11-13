"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getJob } from "@/lib/db/jobs";
import { loadVaultSnapshot, vaultIsEmpty } from "@/lib/db/vault";
import { runJobAnalysis, runMatchReport, runTailorPipeline, resumeCoverage } from "@/lib/ai/engine";
import { configuredModel } from "@/lib/ai/run";
import { applyChangesToDocument } from "@/lib/resume/apply-changes";
import { normalizeFormat } from "@/lib/resume/document";
import type { JobAnalysis } from "@/lib/ai/schemas";
import type { ResumeChangeRow, ResumeChangeStatus } from "@/lib/types";

export interface TailorStartResult {
  ok: boolean;
  message: string;
  versionId?: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

function fail(err: unknown, fallback: string): ActionResult {
  return { ok: false, message: err instanceof Error ? err.message : fallback };
}

/**
 * ONE-CLICK TAILORING.
 * 1. Analyze the job description (stored per user+job, reused when fresh).
 * 2-3. Deterministically select relevant vault facts and rank content.
 * 4-6. Ask the engine (model or mock) for bullet-level changes.
 *      Every change passes the truthfulness guard.
 * 7. Store a resume version + full change provenance for review.
 */
export async function startTailoring(jobId: string): Promise<TailorStartResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const [job, vault] = await Promise.all([
      getJob(supabase, jobId),
      loadVaultSnapshot(supabase, user.id),
    ]);
    if (!job) return { ok: false, message: "Job not found." };
    if (vaultIsEmpty(vault)) {
      return {
        ok: false,
        message: "Your Career Vault is empty. Load your profile from the Career Vault first.",
      };
    }

    const { data: master, error: masterErr } = await supabase
      .from("master_resumes")
      .select("id, content, format")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (masterErr) throw new Error(masterErr.message);
    if (!master) {
      return { ok: false, message: "No master resume yet. Paste your LaTeX resume in Career Vault → Master Resume." };
    }

    // STEP 1: job analysis (reuse stored analysis when available).
    const { data: existingAnalysis } = await supabase
      .from("job_analyses")
      .select("analysis")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle();

    let analysis = existingAnalysis?.analysis as JobAnalysis | undefined;
    let engineUsed = "stored";
    if (!analysis) {
      const res = await runJobAnalysis(job);
      analysis = res.data;
      engineUsed = res.engine;
      const { data: matchReport } = await runMatchReport(job, analysis, vault);
      await supabase.from("job_analyses").upsert(
        {
          user_id: user.id,
          job_id: jobId,
          analysis,
          match_report: matchReport,
          engine: res.engine,
          model: res.engine === "anthropic" ? configuredModel() : "deterministic-mock",
        },
        { onConflict: "user_id,job_id" }
      );
    }

    // STEPS 2-7: tailor with guardrails.
    const format = normalizeFormat(master.format);
    const out = await runTailorPipeline(job, analysis, vault, master.content, format);

    const { data: version, error: vErr } = await supabase
      .from("resume_versions")
      .insert({
        user_id: user.id,
        master_resume_id: master.id,
        job_id: job.id,
        name: `${job.company} — ${job.title}`,
        company: job.company,
        role: job.title,
        format,
        master_latex: master.content,
        latex_content: master.content, // nothing accepted yet
        match_score_before: out.scoreBefore,
        match_score_after: out.scoreAfter,
        keywords_added: out.result.keywords_added,
        skills_emphasized: out.result.skills_emphasized,
        still_missing: out.result.still_missing,
        status: "draft",
      })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);

    if (out.guarded.accepted.length > 0) {
      const { error: cErr } = await supabase.from("resume_changes").insert(
        out.guarded.accepted.map((c) => ({
          user_id: user.id,
          resume_version_id: version.id,
          block_id: c.block_id,
          section: c.section,
          change_type: c.action === "remove" ? "remove" : c.action === "skills_reorder" ? "skills_reorder" : c.action === "coursework" ? "coursework" : "rewrite",
          original_text: c.original_text,
          tailored_text: c.tailored_text,
          current_text: c.tailored_text,
          reason: c.reason,
          fact_ids: c.fact_ids,
          keywords: c.keywords,
          is_safe: c.is_safe,
          status: "proposed",
        }))
      );
      if (cErr) throw new Error(cErr.message);
    }

    // Keep the tracker in sync: tailoring an untracked job adds it to the
    // pipeline; an early-stage tracked job moves to "tailoring".
    const { data: app } = await supabase
      .from("applications")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle();
    if (!app) {
      await supabase.from("applications").insert({
        user_id: user.id,
        job_id: jobId,
        company: job.company,
        role: job.title,
        status: "tailoring",
        resume_version_id: version.id,
        job_url: job.url,
      });
    } else if (app.status === "saved" || app.status === "tailoring") {
      await supabase
        .from("applications")
        .update({ status: "tailoring", resume_version_id: version.id })
        .eq("id", app.id);
    }

    revalidatePath("/tailor");
    revalidatePath("/applications");
    void engineUsed;
    return { ok: true, message: "Tailored draft created.", versionId: version.id };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Tailoring failed." };
  }
}

/** Rebuild the materialized LaTeX + after-score from current change statuses. */
async function rematerialize(versionId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const [{ data: version, error: vErr }, { data: changes, error: cErr }] = await Promise.all([
    supabase
      .from("resume_versions")
      .select("id, master_latex, job_id, format")
      .eq("id", versionId)
      .eq("user_id", userId)
      .single(),
    supabase
      .from("resume_changes")
      .select("*")
      .eq("resume_version_id", versionId)
      .eq("user_id", userId),
  ]);
  if (vErr) throw new Error(vErr.message);
  if (cErr) throw new Error(cErr.message);

  const rows = (changes || []) as ResumeChangeRow[];
  const format = normalizeFormat(version.format);
  const latex = applyChangesToDocument(
    version.master_latex,
    rows.map((c) => ({
      block_id: c.block_id,
      change_type: c.change_type,
      status: c.status,
      current_text: c.current_text,
    })),
    format
  );

  let after: number | null = null;
  if (version.job_id) {
    const job = await getJob(supabase, version.job_id);
    if (job) after = resumeCoverage(latex, job, format);
  }

  const { error } = await supabase
    .from("resume_versions")
    .update({ latex_content: latex, ...(after !== null ? { match_score_after: after } : {}) })
    .eq("id", versionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setChangeStatus(
  changeId: string,
  status: ResumeChangeStatus,
  editedText?: string
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data: change, error: getErr } = await supabase
      .from("resume_changes")
      .select("id, resume_version_id, tailored_text")
      .eq("id", changeId)
      .eq("user_id", user.id)
      .single();
    if (getErr) throw new Error(getErr.message);

    const update: Record<string, unknown> = { status };
    if (status === "edited" && typeof editedText === "string") {
      if (!editedText.trim()) return { ok: false, message: "Edited text cannot be empty." };
      update.current_text = editedText;
    }
    if (status === "proposed") {
      update.current_text = change.tailored_text; // reset to the engine's suggestion
    }

    const { error } = await supabase
      .from("resume_changes")
      .update(update)
      .eq("id", changeId)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);

    await rematerialize(change.resume_version_id, user.id);
    revalidatePath(`/tailor/review/${change.resume_version_id}`);
    const label =
      status === "accepted"
        ? "Change accepted."
        : status === "rejected"
          ? "Original kept."
          : status === "edited"
            ? "Change updated with your wording."
            : "Change reset to suggestion.";
    return { ok: true, message: label };
  } catch (err) {
    return fail(err, "Failed to update change.");
  }
}

export async function acceptAllSafe(versionId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error, count } = await supabase
      .from("resume_changes")
      .update({ status: "accepted" }, { count: "exact" })
      .eq("resume_version_id", versionId)
      .eq("user_id", user.id)
      .eq("is_safe", true)
      .eq("status", "proposed");
    if (error) throw new Error(error.message);
    await rematerialize(versionId, user.id);
    revalidatePath(`/tailor/review/${versionId}`);
    return { ok: true, message: `Accepted ${count ?? 0} safe change(s).` };
  } catch (err) {
    return fail(err, "Failed to accept safe changes.");
  }
}

export async function resetReview(versionId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data: changes, error: getErr } = await supabase
      .from("resume_changes")
      .select("id, tailored_text")
      .eq("resume_version_id", versionId)
      .eq("user_id", user.id);
    if (getErr) throw new Error(getErr.message);
    for (const c of changes || []) {
      const { error } = await supabase
        .from("resume_changes")
        .update({ status: "proposed", current_text: c.tailored_text })
        .eq("id", c.id)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
    }
    await rematerialize(versionId, user.id);
    revalidatePath(`/tailor/review/${versionId}`);
    return { ok: true, message: "Review restored — all changes back to proposed." };
  } catch (err) {
    return fail(err, "Failed to restore the review.");
  }
}

export async function setVersionStatus(
  versionId: string,
  status: "draft" | "final"
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("resume_versions")
      .update({ status })
      .eq("id", versionId)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);

    if (status === "final") {
      // A finalized resume moves its application to "ready".
      const { data: version } = await supabase
        .from("resume_versions")
        .select("job_id")
        .eq("id", versionId)
        .single();
      if (version?.job_id) {
        await supabase
          .from("applications")
          .update({ status: "ready", resume_version_id: versionId })
          .eq("user_id", user.id)
          .eq("job_id", version.job_id)
          .in("status", ["saved", "tailoring"]);
      }
    }

    revalidatePath(`/tailor/review/${versionId}`);
    revalidatePath("/tailor");
    revalidatePath("/applications");
    return { ok: true, message: status === "final" ? "Marked final — application is Ready to Apply." : "Back to draft." };
  } catch (err) {
    return fail(err, "Failed to update version.");
  }
}

export async function renameVersion(versionId: string, name: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    if (!name.trim()) return { ok: false, message: "Name cannot be empty." };
    const { error } = await supabase
      .from("resume_versions")
      .update({ name: name.trim() })
      .eq("id", versionId)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/tailor");
    revalidatePath(`/tailor/review/${versionId}`);
    return { ok: true, message: "Version renamed." };
  } catch (err) {
    return fail(err, "Failed to rename version.");
  }
}

export async function duplicateVersion(versionId: string): Promise<ActionResult & { versionId?: string }> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const [{ data: version, error: vErr }, { data: changes, error: cErr }] = await Promise.all([
      supabase.from("resume_versions").select("*").eq("id", versionId).eq("user_id", user.id).single(),
      supabase.from("resume_changes").select("*").eq("resume_version_id", versionId).eq("user_id", user.id),
    ]);
    if (vErr) throw new Error(vErr.message);
    if (cErr) throw new Error(cErr.message);

    const { id: _id, created_at: _c, updated_at: _u, ...rest } = version;
    const { data: copy, error: insErr } = await supabase
      .from("resume_versions")
      .insert({ ...rest, name: `${version.name} (copy)`, status: "draft" })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    if (changes?.length) {
      const { error } = await supabase.from("resume_changes").insert(
        changes.map((ch) => {
          const { id: _i, created_at: _cc, updated_at: _uu, ...chRest } = ch;
          return { ...chRest, resume_version_id: copy.id };
        })
      );
      if (error) throw new Error(error.message);
    }

    revalidatePath("/tailor");
    return { ok: true, message: "Version duplicated.", versionId: copy.id };
  } catch (err) {
    return fail(err, "Failed to duplicate version.");
  }
}

export async function deleteVersion(versionId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("resume_versions")
      .delete()
      .eq("id", versionId)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/tailor");
    return { ok: true, message: "Version deleted." };
  } catch (err) {
    return fail(err, "Failed to delete version.");
  }
}
