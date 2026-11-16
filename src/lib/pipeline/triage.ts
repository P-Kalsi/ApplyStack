// Batch pipeline over your saved jobs: decide, for free and before any AI
// call, which jobs are worth analyzing. The deterministic match score skips
// obvious mismatches; closed postings and jobs without a description wait.
// Then rank analyzed jobs by their verdict. Idea adapted from career-ops'
// pipeline mode (https://github.com/career-ops-hq/career-ops, MIT).
// Pure and unit-tested; the runner lives in the Saved Jobs page.

import type { JobAnalysis, MatchReport } from "../ai/schemas";
import { canBulkFetch } from "../jobs/posting";
import { postingSignals } from "../jobs/posting-signals";
import { computeMatch } from "../matching/score";
import { computeVerdict, type Decision, type Verdict } from "../matching/verdict";
import type { JobRow, VaultSnapshot } from "../types";

/** Default cut-off on the 0-100 deterministic score; below it a job is an obvious mismatch. */
export const TRIAGE_THRESHOLD = 30;

export type TriageStep =
  | "analyze" // worth an AI analysis
  | "fetch_then_analyze" // description can be fetched from the job board first
  | "low_match" // deterministic score below the threshold
  | "needs_description" // no description and none can be fetched: paste it
  | "closed" // posting no longer listed
  | "done"; // already analyzed

export interface TriageRow {
  jobId: string;
  title: string;
  company: string;
  score: number;
  step: TriageStep;
}

export function triageJobs(
  jobs: JobRow[],
  vault: VaultSnapshot,
  analyzed: Set<string>,
  threshold = TRIAGE_THRESHOLD
): TriageRow[] {
  return jobs.map((job) => {
    const hasText = Boolean(job.description_text?.trim());
    const score = hasText ? computeMatch(job, vault).overall : 0;
    const base = { jobId: job.id, title: job.title, company: job.company, score };
    if (analyzed.has(job.id)) return { ...base, step: "done" };
    if (job.is_open === false) return { ...base, step: "closed" };
    if (!hasText) return { ...base, step: canBulkFetch(job.url) ? "fetch_then_analyze" : "needs_description" };
    if (score < threshold) return { ...base, step: "low_match" };
    return { ...base, step: "analyze" };
  });
}

export interface RankedJob {
  jobId: string;
  title: string;
  company: string;
  verdict: Verdict;
}

const ORDER: Record<Decision, number> = { apply: 0, consider: 1, check: 2, skip: 3 };

/** Analyzed jobs, best first: by decision, then by score. */
export function rankAnalyzed(
  jobs: JobRow[],
  analyses: Map<string, { analysis: JobAnalysis; report: MatchReport }>
): RankedJob[] {
  const out: RankedJob[] = [];
  for (const job of jobs) {
    const a = analyses.get(job.id);
    if (!a) continue;
    const verdict = computeVerdict(a.report, a.analysis, postingSignals(job), (job.description_text || "").trim().length);
    out.push({ jobId: job.id, title: job.title, company: job.company, verdict });
  }
  return out.sort((x, y) => ORDER[x.verdict.decision] - ORDER[y.verdict.decision] || y.verdict.score - x.verdict.score);
}
