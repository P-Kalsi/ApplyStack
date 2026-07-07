import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { createClient, requireUser } from "@/lib/supabase/server";
import { listJobs, savedJobIds } from "@/lib/db/jobs";
import { loadVaultSnapshot, vaultIsEmpty } from "@/lib/db/vault";
import { computeMatch } from "@/lib/matching/score";
import { JobCard } from "@/components/jobs/job-card";
import { EmptyState, Skeleton } from "@/components/ui/card";
import { DiscoverFilters } from "./filters";
import { VaultNudge } from "./vault-nudge";

export const metadata: Metadata = { title: "Discover" };

interface SearchParams {
  q?: string;
  location?: string;
  remote?: string;
  internship?: string;
  cats?: string;
  days?: string;
}

async function JobList({ params }: { params: SearchParams }) {
  const user = await requireUser();
  const supabase = await createClient();

  const [jobs, vault, saved] = await Promise.all([
    listJobs(supabase, {
      q: params.q,
      location: params.location,
      remote: params.remote === "1",
      internship: params.internship === "1",
      categories: (params.cats || "").split(",").filter(Boolean),
      postedWithinDays: params.days ? Number(params.days) : undefined,
    }),
    loadVaultSnapshot(supabase, user.id),
    savedJobIds(supabase, user.id),
  ]);

  const emptyVault = vaultIsEmpty(vault);

  return (
    <>
      {emptyVault ? <VaultNudge /> : null}
      <p className="text-xs text-ink-faint">
        {jobs.length} job{jobs.length === 1 ? "" : "s"}
        {emptyVault ? " · match scores need a Career Vault" : ""}
      </p>
      {jobs.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title="No jobs match these filters"
          description="Loosen the filters, or run the database seed (supabase/seed.sql) / add live sources in Settings to fill the board."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => {
            const m = computeMatch(job, vault);
            return (
              <JobCard
                key={job.id}
                job={job}
                saved={saved.has(job.id)}
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
    </>
  );
}

function JobListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-line bg-surface-raised p-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-1">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="h-7 w-full" />
        </div>
      ))}
    </div>
  );
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return (
    <div className="space-y-3">
      <Suspense fallback={<Skeleton className="h-20 w-full" />}>
        <DiscoverFilters />
      </Suspense>
      <Suspense key={JSON.stringify(params)} fallback={<JobListSkeleton />}>
        <JobList params={params} />
      </Suspense>
    </div>
  );
}
