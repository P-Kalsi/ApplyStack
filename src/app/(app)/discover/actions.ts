"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { ingestJobs, ingestSimplify, loadSources, type IngestSummary } from "@/lib/db/jobs";
import { feedFilter, loadFeedSettings, saveFeedSettings } from "@/lib/jobs/feed-settings";

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

export async function refreshJobs(): Promise<ActionResult & { added?: number }> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const feed = loadFeedSettings();
    const sources = await loadSources(supabase, user.id);
    if (sources.length === 0 && !feed.simplify.enabled) {
      return {
        ok: true,
        message: "No sources are on. Turn on the internship feed or add company boards in Settings.",
      };
    }

    const parts: string[] = [];
    const problems: string[] = [];
    let added = 0;

    if (feed.simplify.enabled) {
      try {
        const s = await ingestSimplify(supabase, feedFilter(feed));
        added += s.added;
        saveFeedSettings({ last_ingest_at: new Date().toISOString() });
        parts.push(
          `Internship feed: ${s.matching} matching, ${s.added} new` +
            (s.closed ? `, ${s.closed} closed` : "") +
            (s.described ? `, ${s.described} descriptions fetched` : "")
        );
        problems.push(...s.errors);
      } catch (err) {
        problems.push(`Internship feed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (sources.length > 0) {
      const summary: IngestSummary = await ingestJobs(supabase, sources);
      parts.push(`Company boards: ${summary.fetched} postings from ${summary.sources} source(s)`);
      problems.push(...summary.errors);
    }

    revalidatePath("/discover");
    const note = problems.length ? ` Problems: ${problems.slice(0, 3).join(" · ")}` : "";
    return { ok: problems.length === 0 || parts.length > 0, message: `${parts.join(". ")}.${note}`, added };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Refresh failed." };
  }
}

/** Called when Discover opens: refresh the internship feed if it's older than 30 minutes. */
export async function refreshJobsIfStale(): Promise<ActionResult & { refreshed: boolean; added?: number }> {
  const feed = loadFeedSettings();
  const last = feed.last_ingest_at ? Date.parse(feed.last_ingest_at) : 0;
  if (!feed.simplify.enabled || Date.now() - last < 30 * 60_000) {
    return { ok: true, message: "", refreshed: false };
  }
  const res = await refreshJobs();
  return { ...res, refreshed: true };
}
