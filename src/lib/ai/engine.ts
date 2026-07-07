// Engine orchestration: pick the real model or the deterministic mock, then
// force every response through validation and the truthfulness guard.
// Pure inputs -> validated outputs; DB glue lives in server actions.

import type { JobRow, VaultSnapshot } from "../types";
import { canonicalizeSkillList, extractSkills } from "../jobs/skills";
import { computeMatch, vaultSkillSet } from "../matching/score";
import { rankExperiences, rankProjects, selectRelevantFacts } from "../matching/relevance";
import { getBullets, parseResume, type BulletBlock } from "../resume/latex";
import { applyChangesToLatex } from "../resume/apply-changes";
import { guardTailorChanges, sanitizeMatchReport, type GuardResult } from "./guard";
import { mockAnalyzeJob, mockMatchReport, mockTailor } from "./mock";
import {
  JobAnalysisSchema,
  MatchReportSchema,
  TailorResultSchema,
  type JobAnalysis,
  type MatchReport,
  type TailorResult,
} from "./schemas";

export type EngineKind = "anthropic" | "mock";

async function withAi<T>(real: () => Promise<T>, mock: () => T): Promise<{ data: T; engine: EngineKind }> {
  const { aiEnabled } = await import("./run.js");
  if (!aiEnabled()) return { data: mock(), engine: "mock" };
  try {
    return { data: await real(), engine: "anthropic" };
  } catch (err) {
    console.error("AI call failed; falling back to deterministic engine:", err);
    return { data: mock(), engine: "mock" };
  }
}

export async function runJobAnalysis(job: JobRow): Promise<{ data: JobAnalysis; engine: EngineKind }> {
  return withAi(
    async () => {
      const [{ callStructured }, { jobAnalysisPrompt }] = await Promise.all([
        import("./run.js"),
        import("./prompts.js"),
      ]);
      return callStructured(JobAnalysisSchema, jobAnalysisPrompt(job));
    },
    () => mockAnalyzeJob(job)
  );
}

export async function runMatchReport(
  job: JobRow,
  analysis: JobAnalysis,
  vault: VaultSnapshot
): Promise<{ data: MatchReport; engine: EngineKind }> {
  const facts = selectRelevantFacts(job, vault, 24);
  const projects = rankProjects(job, vault).slice(0, 5);
  const experiences = rankExperiences(job, vault).slice(0, 5);
  const skills = Array.from(vaultSkillSet(vault)).sort();

  const { data, engine } = await withAi(
    async () => {
      const [{ callStructured }, { matchPrompt }] = await Promise.all([
        import("./run.js"),
        import("./prompts.js"),
      ]);
      return callStructured(
        MatchReportSchema,
        matchPrompt(job, analysis, facts, projects, experiences, skills)
      );
    },
    () => mockMatchReport(job, vault)
  );

  const approvedFacts = vault.facts.filter((f) => f.status === "approved");
  return { data: sanitizeMatchReport(data, vaultSkillSet(vault), approvedFacts), engine };
}

export interface TailorPipelineOutput {
  result: TailorResult;
  guarded: GuardResult;
  bullets: BulletBlock[];
  scoreBefore: number;
  scoreAfter: number;
  engine: EngineKind;
}

/** Keyword coverage of a resume document against a job's requested skills. */
export function resumeCoverage(latex: string, job: Pick<JobRow, "skills" | "title" | "description_text">): number {
  const wanted = job.skills.length
    ? canonicalizeSkillList(job.skills)
    : extractSkills(`${job.title}\n${job.description_text || ""}`);
  if (wanted.length === 0) return 50;
  const have = new Set(extractSkills(latex));
  const hit = wanted.filter((w) => have.has(w)).length;
  return Math.round((hit / wanted.length) * 100);
}

export async function runTailorPipeline(
  job: JobRow,
  analysis: JobAnalysis,
  vault: VaultSnapshot,
  masterLatex: string
): Promise<TailorPipelineOutput> {
  // STEP 2-3 (deterministic): relevant facts + ranked content.
  const facts = selectRelevantFacts(job, vault, 24);
  const skills = Array.from(vaultSkillSet(vault)).sort();
  const parsed = parseResume(masterLatex);
  const bullets = getBullets(parsed);

  // STEP 4-6: propose content changes (model or mock).
  const { data, engine } = await withAi(
    async () => {
      const [{ callStructured }, { tailorPrompt }] = await Promise.all([
        import("./run.js"),
        import("./prompts.js"),
      ]);
      return callStructured(TailorResultSchema, tailorPrompt(job, analysis, facts, bullets, skills));
    },
    () => mockTailor(job, vault, bullets)
  );

  // Truthfulness guard: drop invented tech/metrics, resolve fact ids.
  const approvedFacts = vault.facts.filter((f) => f.status === "approved");
  const guarded = guardTailorChanges(data.changes, bullets, approvedFacts, vaultSkillSet(vault));

  // Guard the summary lists too: keywords_added must be vault-supported.
  const vaultSet = vaultSkillSet(vault);
  const result: TailorResult = {
    ...data,
    changes: guarded.accepted.map(({ is_safe: _is_safe, original_text: _o, section: _s, ...c }) => c),
    keywords_added: data.keywords_added.filter((k) => vaultSet.has(k.toLowerCase())),
    still_missing: Array.from(
      new Set([...data.still_missing, ...computeMatch(job, vault).missingSkills])
    ),
  };

  // STEP 7 preview: what the resume looks like with every guarded change applied.
  const previewLatex = applyChangesToLatex(
    masterLatex,
    guarded.accepted.map((c) => ({
      block_id: c.block_id,
      change_type: c.action === "remove" ? ("remove" as const) : ("rewrite" as const),
      status: "accepted" as const,
      current_text: c.tailored_text,
    }))
  );

  return {
    result,
    guarded,
    bullets,
    scoreBefore: resumeCoverage(masterLatex, job),
    scoreAfter: resumeCoverage(previewLatex, job),
    engine,
  };
}
