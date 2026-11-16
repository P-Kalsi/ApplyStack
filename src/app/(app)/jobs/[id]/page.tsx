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
import { OpenCheckButton } from "./open-check-button";
import { CoverLetterCard, type CoverLetterRow } from "./cover-letter";
import { DescriptionPanel } from "./description-panel";
import { canFetchDescription } from "@/lib/jobs/posting";
import { sourceBadge } from "@/lib/jobs/sources/badges";
import { canonicalSkill, extractSkills, guessSkillGroup } from "@/lib/jobs/skills";
import { tidyKeywordEvidence } from "@/lib/ai/keywords";
import { KeywordEvidence } from "./keyword-evidence";
import { postingSignals, type PostingSignal } from "@/lib/jobs/posting-signals";
import { computeVerdict, type Verdict } from "@/lib/matching/verdict";

export const metadata: Metadata = { title: "Job details" };

/** Sources whose postings can be checked through the board API. */
const BOARD_KINDS = new Set(["greenhouse", "lever", "ashby"]);

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

  const answersPromise = supabase
    .from("application_answers")
    .select("id, question, answer")
    .eq("user_id", user.id)
    .eq("job_id", id)
    .order("updated_at", { ascending: false })
    .limit(20)
    .then((r) => (r.error ? [] : ((r.data || []) as { id: string; question: string; answer: string }[])));
  // Cover letter + how many past letters you've saved (both empty before migration 0011).
  const letterPromise = Promise.all([
    supabase
      .from("cover_letters")
      .select("focus, tone, recipient, greeting, paragraphs, issues, gaps, fact_ids, model, updated_at")
      .eq("user_id", user.id)
      .eq("job_id", id)
      .maybeSingle()
      .then((r) => (r.error ? null : r.data)),
    supabase
      .from("writing_samples")
      .select("is_template")
      .eq("user_id", user.id)
      .then((r) => (r.error ? [] : ((r.data || []) as { is_template: boolean }[]))),
  ]);
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

  const answers = await answersPromise;
  const [letterRow, samples] = await letterPromise;
  const letter: CoverLetterRow | null = letterRow
    ? {
        focus: letterRow.focus as string,
        tone: letterRow.tone as string,
        recipient: (letterRow.recipient as string[]) ?? [],
        greeting: letterRow.greeting as string,
        paragraphs: (letterRow.paragraphs as string[]) ?? [],
        issues: (letterRow.issues as string[]) ?? [],
        gaps: (letterRow.gaps as string[]) ?? [],
        fact_count: ((letterRow.fact_ids as string[]) ?? []).length,
        model: (letterRow.model as string | null) ?? null,
        updated_at: letterRow.updated_at as string,
      }
    : null;
  const match = computeMatch(job, vault);
  const analysis = (analysisRow?.analysis ?? null) as JobAnalysis | null;
  const report = (analysisRow?.match_report ?? null) as MatchReport | null;
  const topProjects = rankProjects(job, vault).filter((r) => r.score > 0).slice(0, 3);
  const topExperiences = rankExperiences(job, vault).filter((r) => r.score > 0).slice(0, 3);

  const paragraphs = (job.description_text || "").split(/\n{2,}/).filter(Boolean);
  const hasDescription = paragraphs.length > 0;
  const signals = postingSignals(job);
  const verdict =
    analysis && report
      ? computeVerdict(report, analysis, signals, (job.description_text || "").trim().length)
      : null;

  return (
    <div className="space-y-5">
      <Link
        href="/discover"
        className="no-print -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Discover
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted">{job.company}</p>
          <h1 className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight text-ink">{job.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> {job.location || "Location n/a"}
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
            <Badge tone="neutral" className="ml-0.5">{sourceBadge(job.source)}</Badge>
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {hasDescription ? (
            <>
              <ScoreBadge score={match.overall} label="Your deterministic match score" />
              <TailorButton jobId={job.id} />
            </>
          ) : null}
          {canFetchDescription(job.url) || (BOARD_KINDS.has(job.source) && job.source_id) ? (
            <OpenCheckButton jobId={job.id} />
          ) : null}
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface-raised px-4 text-sm font-medium text-ink transition-colors hover:border-ink-faint/60 hover:bg-surface-sunken [@media(pointer:coarse)]:min-h-[44px]"
            >
              Apply <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>

      {signals.length ? <PostingChecks signals={signals} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: description */}
        <Card className="lg:col-span-2">
          <CardHeader title="Full description" />
          {hasDescription ? (
            <div className="max-w-prose space-y-3 px-4 py-4 text-sm leading-6 text-ink">
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
                  <p className="mb-1 text-xs font-medium text-ink-faint">
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
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Your match"
              description={`Skills ${match.skillsScore} · Projects ${match.projectScore} · Experience ${match.experienceScore}`}
            />
            <div className="space-y-3 px-4 py-3">
              <div>
                <h3 className="mb-1.5 text-xs font-medium text-ink-muted">Matched qualifications</h3>
                <div className="flex flex-wrap gap-1">
                  {match.matchedSkills.length ? (
                    match.matchedSkills.map((s) => (
                      <Badge key={s} tone="have">
                        {displaySkill(s)}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-ink-faint">None yet — fill your Career Vault.</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-1.5 text-xs font-medium text-ink-muted">Missing qualifications</h3>
                <div className="flex flex-wrap gap-1">
                  {match.missingSkills.length ? (
                    match.missingSkills.map((s) => (
                      <Badge key={s} tone="outline" className="border-dashed">
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
                <Badge
                  key={s}
                  tone={match.matchedSkills.includes(s) ? "have" : "neutral"}
                  title={match.matchedSkills.includes(s) ? "In your Career Vault" : undefined}
                >
                  {displaySkill(s)}
                </Badge>
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
        {verdict ? <VerdictPanel verdict={verdict} /> : null}
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
                <KeywordEvidence
                  jobId={job.id}
                  rows={tidyKeywordEvidence(report.keyword_evidence).map((e) => {
                    const skills = extractSkills(e.keyword);
                    const isSkill = skills.length === 1 && canonicalSkill(e.keyword) === skills[0];
                    return { ...e, evidence: withoutIds(e.evidence), isSkill, skillGroup: guessSkillGroup(e.keyword) };
                  })}
                  experiences={vault.experiences.map((x) => ({ id: x.id, label: `${x.role} — ${x.company}` }))}
                  projects={vault.projects.map((x) => ({ id: x.id, label: x.name }))}
                />
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
      <CoverLetterCard
        jobId={job.id}
        letter={letter}
        samples={samples.length}
        hasTemplate={samples.some((s) => s.is_template)}
        hasDescription={hasDescription}
      />
      <Card>
        <CardHeader
          title="Application answers"
          description="Screening questions you've answered for this job, from your Career Vault."
          actions={
            <Link
              href={`/answers?job=${job.id}`}
              className="inline-flex h-8 items-center rounded-md border border-line bg-surface-raised px-3 text-xs font-medium text-ink hover:border-line-strong"
            >
              Answer a question
            </Link>
          }
        />
        {answers.length ? (
          <ul className="divide-y divide-line px-4">
            {answers.map((a) => (
              <li key={a.id} className="space-y-0.5 py-2.5">
                <p className="text-xs text-ink-muted">{a.question}</p>
                <p className="whitespace-pre-line text-sm text-ink">{a.answer}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-ink-muted">None yet. Answers you save for this job show up here.</p>
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

const signalTone = { blocker: "bad", caution: "warn", info: "neutral" } as const;

/** Facts about the posting itself (age, still listed, sponsorship...), separate from your match. */
function PostingChecks({ signals }: { signals: PostingSignal[] }) {
  return (
    <Card>
      <CardHeader title="Posting checks" description="About the posting itself, not your fit. Signals to check, not verdicts." />
      <ul className="divide-y divide-line px-4">
        {signals.map((s) => (
          <li key={s.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-3">
            <Badge tone={signalTone[s.level]} className="self-start">
              {s.label}
            </Badge>
            <div className="min-w-0 space-y-0.5 text-xs">
              <p className="text-ink-muted">{s.detail}</p>
              {s.quote ? <p className="italic text-ink-faint">“{s.quote}”</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const verdictTone = { apply: "good", consider: "warn", skip: "bad", check: "bad" } as const;
const confidenceLabel = { high: "High", medium: "Medium", low: "Low" } as const;

/** Apply / consider / skip, read from the guarded score with evidence caps. Advice only. */
function VerdictPanel({ verdict }: { verdict: Verdict }) {
  return (
    <div className="space-y-2 border-b border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={verdictTone[verdict.decision]} className="text-xs">
          {verdict.headline}
        </Badge>
        <span className="text-2xs text-ink-faint" title={verdict.confidenceNote}>
          Evidence confidence: {confidenceLabel[verdict.confidence]} · {verdict.confidenceNote}
        </span>
      </div>
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-muted">
        {verdict.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

/** Fact ids mean nothing to a reader; the fact text next to them is enough. */
function withoutIds(text: string): string {
  return text.replace(/\s*\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "");
}
