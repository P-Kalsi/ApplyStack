import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getJob } from "@/lib/db/jobs";
import { loadVaultSnapshot } from "@/lib/db/vault";
import { computeMatch } from "@/lib/matching/score";
import { rankExperiences, rankProjects } from "@/lib/matching/relevance";
import type { JobAnalysis, MatchReport } from "@/lib/ai/schemas";
import { Badge, ScoreBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { displaySkill, timeAgo } from "@/lib/utils";
import { AnalyzeButton } from "./analyze-button";
import { TailorButton } from "./tailor-button";
import { DescriptionPanel } from "./description-panel";
import { canFetchDescription } from "@/lib/jobs/posting";
import { sourceBadge } from "@/lib/jobs/sources/badges";

export const metadata: Metadata = { title: "Job details" };

const workModeLabel: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Work mode n/a",
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [job, vault, analysisRow] = await Promise.all([
    getJob(supabase, id),
    loadVaultSnapshot(supabase, user.id),
    supabase
      .from("job_analyses")
      .select("analysis, match_report, engine, model, updated_at")
      .eq("user_id", user.id)
      .eq("job_id", id)
      .maybeSingle()
      .then((r) => r.data),
  ]);
  if (!job) notFound();

  const match = computeMatch(job, vault);
  const analysis = (analysisRow?.analysis ?? null) as JobAnalysis | null;
  const report = (analysisRow?.match_report ?? null) as MatchReport | null;
  const topProjects = rankProjects(job, vault).filter((r) => r.score > 0).slice(0, 3);
  const topExperiences = rankExperiences(job, vault).filter((r) => r.score > 0).slice(0, 3);

  const paragraphs = (job.description_text || "").split(/\n{2,}/).filter(Boolean);
  const hasDescription = paragraphs.length > 0;

  return (
    <div className="space-y-3">
      <Link
        href="/discover"
        className="no-print inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Discover
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted">{job.company}</p>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{job.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden /> {job.location || "Location n/a"}
            </span>
            <span aria-hidden>·</span>
            <span>{workModeLabel[job.work_mode]}</span>
            <span aria-hidden>·</span>
            <span className="capitalize">{job.employment_type}</span>
            {job.posted_at ? (
              <>
                <span aria-hidden>·</span>
                <span>posted {timeAgo(job.posted_at)}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <Badge tone="accent">{sourceBadge(job.source)}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasDescription ? (
            <>
              <ScoreBadge score={match.overall} label="Your deterministic match score" />
              <TailorButton jobId={job.id} />
            </>
          ) : null}
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface-raised px-3.5 text-sm font-medium text-ink hover:border-line-strong"
            >
              Apply <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Left: description */}
        <Card className="lg:col-span-2">
          <CardHeader title="Full description" />
          {hasDescription ? (
            <div className="space-y-3 px-4 py-3 text-sm leading-6 text-ink">
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <>
              {job.snippet ? (
                <div className="border-b border-line px-4 py-3 text-sm text-ink">
                  <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-faint">
                    Preview from {sourceBadge(job.source)}
                  </p>
                  <p className="whitespace-pre-line text-ink-muted">{job.snippet}</p>
                </div>
              ) : null}
              <DescriptionPanel jobId={job.id} canFetch={canFetchDescription(job.url)} url={job.url} />
            </>
          )}
        </Card>

        {/* Right: signals (need a description to mean anything) */}
        {!hasDescription ? (
          <Card className="self-start">
            <CardHeader
              title="Your match"
              description="Your match score, matched and missing skills, and ATS keywords appear once the description is added."
            />
          </Card>
        ) : (
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="Your match"
              description={`Skills ${match.skillsScore} · Projects ${match.projectScore} · Experience ${match.experienceScore}`}
            />
            <div className="space-y-3 px-4 py-3">
              <div>
                <h3 className="mb-1 text-xs font-medium text-ink-muted">Matched qualifications</h3>
                <div className="flex flex-wrap gap-1">
                  {match.matchedSkills.length ? (
                    match.matchedSkills.map((s) => (
                      <Badge key={s} tone="good">
                        {displaySkill(s)}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-ink-faint">None yet — fill your Career Vault.</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-medium text-ink-muted">Missing qualifications</h3>
                <div className="flex flex-wrap gap-1">
                  {match.missingSkills.length ? (
                    match.missingSkills.map((s) => (
                      <Badge key={s} tone="bad">
                        {displaySkill(s)}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-ink-faint">Nothing missing against parsed skills.</p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Parsed skills" description="Extracted from the posting" />
            <div className="flex flex-wrap gap-1 px-4 py-3">
              {job.skills.map((s) => (
                <Badge key={s}>{displaySkill(s)}</Badge>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="ATS keywords" description="Worth mirroring — only where truthful" />
            <div className="flex flex-wrap gap-1 px-4 py-3">
              {(analysis?.important_phrases?.length ? analysis.important_phrases : job.ats_keywords).map(
                (s) => (
                  <Badge key={s} tone="accent">
                    {s}
                  </Badge>
                )
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Your relevant work"
              description="Deterministically ranked from your vault"
            />
            <div className="space-y-2 px-4 py-3 text-xs">
              {topProjects.length === 0 && topExperiences.length === 0 ? (
                <p className="text-ink-faint">No overlapping projects or experiences found.</p>
              ) : (
                <>
                  {topProjects.map((r) => (
                    <div key={r.item.id}>
                      <p className="font-medium text-ink">{r.item.name}</p>
                      <p className="text-ink-faint">
                        {r.matchedKeywords.map(displaySkill).join(", ")}
                      </p>
                    </div>
                  ))}
                  {topExperiences.map((r) => (
                    <div key={r.item.id}>
                      <p className="font-medium text-ink">
                        {r.item.role} — {r.item.company}
                      </p>
                      <p className="text-ink-faint">
                        {r.matchedKeywords.map(displaySkill).join(", ")}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Card>
        </div>
        )}
      </div>

      {/* AI analysis */}
      <Card>
        <CardHeader
          title="AI job analysis"
          description={
            analysisRow
              ? `Engine: ${analysisRow.engine === "offline" || analysisRow.engine === "mock" ? "offline (deterministic)" : `${analysisRow.engine} · ${analysisRow.model}`} · updated ${timeAgo(analysisRow.updated_at as string)}`
              : "Structured breakdown of requirements, compared against your vault"
          }
          actions={
            hasDescription ? <AnalyzeButton jobId={job.id} hasAnalysis={Boolean(analysisRow)} /> : undefined
          }
        />
        {analysis && report ? (
          <div className="grid grid-cols-1 gap-4 px-4 py-3 md:grid-cols-2">
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="accent">{analysis.role_category}</Badge>
                <Badge>{analysis.seniority}</Badge>
                <ScoreBadge score={report.overall_match_score} label="AI match (guarded)" />
              </div>
              <AnalysisList label="Hard requirements" items={analysis.hard_requirements} />
              <AnalysisList label="Soft requirements" items={analysis.soft_requirements} />
              <AnalysisList label="Responsibilities" items={analysis.responsibilities} />
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <h3 className="mb-1 font-medium text-ink-muted">Keyword evidence</h3>
                <ul className="space-y-1">
                  {report.keyword_evidence.slice(0, 14).map((e) => (
                    <li key={e.keyword} className="flex items-start gap-1.5">
                      <Badge
                        tone={e.status === "verified" ? "good" : e.status === "related" ? "warn" : "bad"}
                        className="mt-px shrink-0"
                      >
                        {e.status}
                      </Badge>
                      <span className="text-ink">
                        <span className="font-medium">{displaySkill(e.keyword)}</span>
                        <span className="text-ink-faint"> — {e.evidence}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <AnalysisList label="Strongest projects" items={report.strongest_projects} />
              <AnalysisList label="Strongest experiences" items={report.strongest_experiences} />
              <AnalysisList label="Potential concerns" items={report.potential_concerns} />
            </div>
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-xs text-ink-muted">
            {hasDescription
              ? "Not analyzed yet. Run the analysis to get structured requirements, a guarded match score, and keyword-level evidence."
              : "Add the job description first (left), then analyze and tailor."}
          </div>
        )}
      </Card>
    </div>
  );
}

function AnalysisList({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="mb-1 font-medium text-ink-muted">{label}</h3>
      <ul className="list-disc space-y-0.5 pl-4 text-ink">
        {items.slice(0, 8).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
