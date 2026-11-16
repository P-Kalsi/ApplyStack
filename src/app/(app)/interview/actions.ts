"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getJob } from "@/lib/db/jobs";
import { loadVaultSnapshot } from "@/lib/db/vault";
import { draftInterviewPrep } from "@/lib/ai/interview";
import type { JobAnalysis } from "@/lib/ai/schemas";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Build (or rebuild) interview prep for a job from your Career Vault. */
export async function generateInterviewPrep(jobId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const job = await getJob(supabase, jobId);
    if (!job) return { ok: false, message: "Job not found." };
    if (!job.description_text?.trim()) return { ok: false, message: "Add the job description first." };

    const [vault, { data: analysisRow }] = await Promise.all([
      loadVaultSnapshot(supabase, user.id),
      supabase.from("job_analyses").select("analysis").eq("user_id", user.id).eq("job_id", job.id).maybeSingle(),
    ]);
    const analysis = (analysisRow?.analysis ?? null) as JobAnalysis | null;
    const requirements = analysis ? [...analysis.hard_requirements, ...analysis.required_skills].slice(0, 20) : [];

    const prep = await draftInterviewPrep(job, vault, requirements);
    const { error } = await supabase.from("interview_preps").upsert(
      {
        user_id: user.id,
        job_id: job.id,
        stories: prep.stories,
        topics: prep.topics,
        questions: prep.questions,
        engine: prep.provider,
        model: prep.model,
      },
      { onConflict: "user_id,job_id" }
    );
    if (error) {
      if (/interview_preps/.test(error.message) && /does not exist|schema cache|relation/i.test(error.message)) {
        throw new Error("Interview prep needs a database update: run supabase/migrations/0012_interview_preps.sql in the Supabase SQL Editor.");
      }
      throw new Error(error.message);
    }
    revalidatePath(`/jobs/${job.id}`);
    revalidatePath("/vault");
    const flagged = prep.stories.filter((s) => s.issues.length).length;
    return {
      ok: true,
      message: `${prep.stories.length} stories ready${flagged ? `, ${flagged} to check` : ""}. They're in your story bank too.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't prepare the interview." };
  }
}
