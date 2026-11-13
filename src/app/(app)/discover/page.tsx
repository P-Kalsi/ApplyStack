import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { createClient, requireUser } from "@/lib/supabase/server";
import { materializePage, savedJobIds } from "@/lib/db/jobs";
import { loadVaultSnapshot, vaultIsEmpty } from "@/lib/db/vault";
import { computeMatch } from "@/lib/matching/score";
import { fetchDiscoverPage, sourceStatuses } from "@/lib/jobs/sources";
import { pageList, parseDiscoverParams, showingText } from "@/lib/jobs/sources/params";
import { canBulkFetch } from "@/lib/jobs/posting";
import { JobCard } from "@/components/jobs/job-card";
import { EmptyState, Skeleton } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DiscoverFilters } from "./filters";
import { PerPageSelect } from "./per-page";
import { DescribeOnView } from "./describe-on-view";
import { VaultNudge } from "./vault-nudge";

export const metadata: Metadata = { title: "Discover" };

type SearchParams = Record<string, string | string[] | undefined>;

function hrefFor(params: SearchParams, page: number): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined && k !== "page") sp.set(k, val);
  }
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return `/discover${s ? `?${s}` : ""}`;
}

async function Results({ params }: { params: SearchParams }) {
  const user = await requireUser();
  const supabase = await createClient();
  const { query, source, page, perPage } = parseDiscoverParams(params);
  const ctx = { supabase, userId: user.id, fetchImpl: fetch };

  // Only the requested page is fetched from the sources and saved; scoring
  // below is deterministic and runs on this page's jobs only.
  const result = await fetchDiscoverPage(ctx, query, source, page, perPage);
  const [rows, vault, saved] = await Promise.all([
    materializePage(supabase, result.items),
    loadVaultSnapshot(supabase, user.id),
    savedJobIds(supabase, user.id),
  ]);

  const emptyVault = vaultIsEmpty(vault);
  const lastPage = Math.max(1, Math.ceil(result.total / perPage));
  const problems = result.sources.filter((s) => s.error);
  const needDescriptions = rows.filter((r) => !r.description_text && canBulkFetch(r.url)).map((r) => r.id);

  return (
    <>
      {emptyVault ? <VaultNudge /> : null}
      {problems.length ? (
        <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-ink">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <div>
            {problems.map((p) => (
              <p key={p.id}>
                <span className="font-medium">{p.label}:</span> {p.error}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {showingText(page, perPage, rows.length, result.total)}
          {source === "all" && result.sources.some((s) => s.total)
            ? ` · ${result.sources
                .filter((s) => s.total)
                .map((s) => `${s.label} ${s.total!.toLocaleString("en-CA")}`)
                .join(" · ")}`
            : ""}
          {emptyVault ? " · match scores need a Career Vault" : ""}
        </p>
        <PerPageSelect value={perPage} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title="No jobs match these filters"
          description="Try a bigger radius, Both instead of Local only, a different source, or clear the search."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((job) => {
            const m = computeMatch(job, vault);
            return (
              <JobCard
                key={job.id}
                job={job}
                saved={saved.has(job.id)}
                match={{ overall: m.overall, matchedSkills: m.matchedSkills, missingSkills: m.missingSkills }}
              />
            );
          })}
        </div>
      )}

      {lastPage > 1 ? (
        <nav className="flex flex-wrap items-center justify-center gap-1 pt-2" aria-label="Pages">
          <PageLink href={hrefFor(params, page - 1)} disabled={page <= 1} label="Previous page">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Prev
          </PageLink>
          {pageList(page, lastPage).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-ink-faint">
                …
              </span>
            ) : (
              <PageLink key={n} href={hrefFor(params, n)} current={n === page} label={`Page ${n}`}>
                {n}
              </PageLink>
            )
          )}
          <PageLink href={hrefFor(params, page + 1)} disabled={page >= lastPage} label="Next page">
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </PageLink>
        </nav>
      ) : null}

      <DescribeOnView ids={needDescriptions} />
    </>
  );
}

function PageLink({
  href,
  children,
  current,
  disabled,
  label,
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const cls = cn(
    "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium",
    current ? "border-accent bg-accent text-white" : "border-line bg-surface-raised text-ink hover:border-line-strong",
    disabled && "pointer-events-none opacity-40"
  );
  if (disabled) {
    return (
      <span className={cls} aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={cls} aria-label={label} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-56" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-line bg-surface-raised p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-7 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const statuses = await sourceStatuses({ supabase, userId: user.id, fetchImpl: fetch });
  return (
    <div className="space-y-3">
      <Suspense fallback={<Skeleton className="h-20 w-full" />}>
        <DiscoverFilters sources={statuses.map(({ id, label, ready, message }) => ({ id, label, ready, message }))} />
      </Suspense>
      <Suspense key={JSON.stringify(params)} fallback={<ResultsSkeleton />}>
        <Results params={params} />
      </Suspense>
    </div>
  );
}
