"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { describeJobs } from "@/lib/db/jobs";
import { clearSourceCache } from "@/lib/jobs/sources/cache";

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

/** Forget cached source results so the current page is fetched fresh. */
export async function refreshSources(): Promise<ActionResult> {
  try {
    await requireUser();
    const n = clearSourceCache();
    revalidatePath("/discover");
    return { ok: true, message: n ? "Refreshed. Fetching the latest postings." : "Fetching the latest postings." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Refresh failed." };
  }
}

/** Fetch descriptions for the jobs on the page being viewed (never for other pages). */
export async function describePage(jobIds: string[]): Promise<{ ok: boolean; described: number }> {
  try {
    await requireUser();
    const supabase = await createClient();
    const described = await describeJobs(supabase, jobIds.slice(0, 50));
    return { ok: true, described };
  } catch {
    return { ok: false, described: 0 };
  }
}
