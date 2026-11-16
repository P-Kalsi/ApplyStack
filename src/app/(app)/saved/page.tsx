import type { Metadata } from "next";
import { Bookmark } from "lucide-react";
import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import { loadVaultSnapshot } from "@/lib/db/vault";
import { computeMatch } from "@/lib/matching/score";
import type { JobRow } from "@/lib/types";
import { JobCard } from "@/components/jobs/job-card";
import { EmptyState } from "@/components/ui/card";
import type { JobAnalysis, MatchReport } from "@/lib/ai/schemas";
import { rankAnalyzed, triageJobs, TRIAGE_THRESHOLD } from "@/lib/pipeline/triage";
import { PipelineCard } from "./pipeline";

export const metadata: Metadata = { title: "Saved Jobs" };

export default async function SavedJobsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data, error }, vault] = await Promise.all([
    supabase
      .from("saved_jobs")
      .select("created_at, jobs(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    loadVaultSnapshot(supabase, user.id),
  ]);
  if (error) throw new Error(error.message);

  const jobs = (data || [])
    .map((row) => row.jobs as unknown as JobRow | null)
    .filter((j): j is JobRow => Boolean(j));

  // Analyses you already have for these jobs: they're skipped by the pipeline and ranked by verdict.
  const { data: analysisRows } = jobs.length
    ? await supabase
        .from("job_analyses")
        .select("job_id, analysis, match_report")
        .eq("user_id", user.id)
        .in(
          "job_id",
          jobs.map((j) => j.id)
        )
    : { data: [] };
  const analyses = new Map(
    (analysisRows || [])
      .filter((r) => r.match_report)
      .map((r) => [r.job_id as string, { analysis: r.analysis as JobAnalysis, report: r.match_report as MatchReport }])
  );
  const triage = triageJobs(jobs, vault, new Set(analyses.keys()));
  const ranked = rankAnalyzed(jobs, analyses);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-title text-ink">Saved Jobs</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {jobs.length} saved · saving a job also adds it to your Applications pipeline
        </p>
      </div>
      {jobs.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="h-6 w-6" />}
          title="Nothing saved yet"
          description="Save jobs from the Discover board to keep them here and in your pipeline."
          action={
            <Link href="/discover" className="text-xs font-medium text-accent hover:underline">
              Browse internships →
            </Link>
          }
        />
      ) : (
        <>
        <PipelineCard rows={triage} ranked={ranked} threshold={TRIAGE_THRESHOLD} />
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => {
            const m = computeMatch(job, vault);
            return (
              <JobCard
                key={job.id}
                job={job}
                saved
                match={{
                  overall: m.overall,
                  matchedSkills: m.matchedSkills,
                  missingSkills: m.missingSkills,
                }}
              />
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
