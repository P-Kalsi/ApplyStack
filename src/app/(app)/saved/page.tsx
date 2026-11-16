import type { Metadata } from "next";
import { Bookmark } from "lucide-react";
import Link from "next/link";
import { createClient, requireUser } from "@/lib/supabase/server";
import { loadVaultSnapshot } from "@/lib/db/vault";
import { computeMatch } from "@/lib/matching/score";
import type { JobRow } from "@/lib/types";
import { JobCard } from "@/components/jobs/job-card";
import { EmptyState } from "@/components/ui/card";

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
      )}
    </div>
  );
}
