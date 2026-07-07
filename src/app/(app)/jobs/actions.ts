"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getJob } from "@/lib/db/jobs";
import { loadVaultSnapshot } from "@/lib/db/vault";
import { runJobAnalysis, runMatchReport } from "@/lib/ai/engine";
import { configuredModel } from "@/lib/ai/run";

export interface AnalyzeResult {
  ok: boolean;
  message: string;
}

/**
 * Analyze a job description into structured JSON and compare it with the
 * Career Vault. Results are stored per user+job and shown on the job page.
 */
export async function analyzeJob(jobId: string): Promise<AnalyzeResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const job = await getJob(supabase, jobId);
    if (!job) return { ok: false, message: "Job not found." };

    const vault = await loadVaultSnapshot(supabase, user.id);
    const { data: analysis, engine } = await runJobAnalysis(job);
    const { data: matchReport } = await runMatchReport(job, analysis, vault);

    const { error } = await supabase.from("job_analyses").upsert(
      {
        user_id: user.id,
        job_id: jobId,
        analysis,
        match_report: matchReport,
        engine,
        model: engine === "anthropic" ? configuredModel() : "deterministic-mock",
      },
      { onConflict: "user_id,job_id" }
    );
    if (error) throw new Error(error.message);

    revalidatePath(`/jobs/${jobId}`);
    return {
      ok: true,
      message:
        engine === "anthropic"
          ? "Analysis complete."
          : "Analysis complete (deterministic engine — set ANTHROPIC_API_KEY for model-based analysis).",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Analysis failed." };
  }
}
