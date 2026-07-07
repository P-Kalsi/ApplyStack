"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { ingestJobs, loadSources, type IngestSummary } from "@/lib/db/jobs";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export async function toggleSaveJob(jobId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data: existing, error: selErr } = await supabase
      .from("saved_jobs")
      .select("id")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    if (existing) {
      const { error } = await supabase.from("saved_jobs").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      revalidatePath("/discover");
      revalidatePath("/saved");
      return { ok: true, message: "Removed from saved jobs." };
    }

    const { error } = await supabase
      .from("saved_jobs")
      .insert({ user_id: user.id, job_id: jobId });
    if (error) throw new Error(error.message);

    // Keep the tracker in sync: a saved job enters the pipeline as "saved".
    const { data: job } = await supabase
      .from("jobs")
      .select("company, title, url")
      .eq("id", jobId)
      .single();
    if (job) {
      const { data: existingApp } = await supabase
        .from("applications")
        .select("id")
        .eq("user_id", user.id)
        .eq("job_id", jobId)
        .maybeSingle();
      if (!existingApp) {
        await supabase.from("applications").insert({
          user_id: user.id,
          job_id: jobId,
          company: job.company,
          role: job.title,
          status: "saved",
          job_url: job.url,
        });
      }
    }

    revalidatePath("/discover");
    revalidatePath("/saved");
    revalidatePath("/applications");
    return { ok: true, message: "Saved. Added to your pipeline." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to save job." };
  }
}

export async function refreshJobs(): Promise<ActionResult & { summary?: IngestSummary }> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const sources = await loadSources(supabase, user.id);
    if (sources.length === 0) {
      return {
        ok: true,
        message:
          "No live sources configured. Add Greenhouse boards or Lever sites in Settings; the seeded internships keep the board usable meanwhile.",
      };
    }
    const summary = await ingestJobs(supabase, sources);
    revalidatePath("/discover");
    const errNote = summary.errors.length ? ` (${summary.errors.length} source error(s))` : "";
    return {
      ok: true,
      message: `Fetched ${summary.fetched} postings from ${summary.sources} source(s); upserted ${summary.upserted}.${errNote}`,
      summary,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Refresh failed." };
  }
}
