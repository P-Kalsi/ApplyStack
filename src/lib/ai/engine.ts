// Engine orchestration: run each step on the configured LLM backend (via
// askLlm) or, when the backend is "offline", on the deterministic engine.
// Every response goes through Zod validation and the truthfulness guard.
// A misconfigured or failing backend raises a clear error; it never silently
// switches engines. Pure inputs -> validated outputs; DB glue lives in actions.

import type { JobRow, VaultSnapshot } from "../types";
import { canonicalizeSkillList, extractSkills } from "../jobs/skills";
import { computeMatch, vaultSkillSet } from "../matching/score";
import { rankExperiences, rankProjects, selectRelevantFacts } from "../matching/relevance";
import type { BulletBlock } from "../resume/latex";
import { applyChangesToDocument } from "../resume/apply-changes";
import { documentBullets, documentPlainText, type ResumeFormat } from "../resume/document";
import { guardTailorChanges, sanitizeMatchReport, type GuardResult } from "./guard";
import { mockAnalyzeJob, mockMatchReport, mockTailor } from "./mock";
import { callStructured } from "./structured";
import { assertLlmReady, loadLlmSettings, type Provider, type Tier } from "./llm";
import { jobAnalysisPrompt, matchPrompt, tailorPrompt } from "./prompts";
import {
  JobAnalysisSchema,
  MatchReportSchema,
  TailorResultSchema,
  type JobAnalysis,
  type MatchReport,
  type TailorResult,
} from "./schemas";

/** Which engine produced a result: an LLM provider, or "offline". */
export type EngineKind = Provider;

export interface EngineRun<T> {
  data: T;
  engine: EngineKind;
  /** Model that served the step, or null for offline. */
  model: string | null;
}

async function withEngine<T>(tier: Tier, real: () => Promise<T>, offline: () => T): Promise<EngineRun<T>> {
  const settings = loadLlmSettings();
  if (settings.provider === "offline") return { data: offline(), engine: "offline", model: null };
  await assertLlmReady(); // clear setup message before any work starts
  const data = await real();
  return { data, engine: settings.provider, model: tier === "smart" ? settings.model_smart : settings.model_fast };
}

export async function runJobAnalysis(job: JobRow): Promise<EngineRun<JobAnalysis>> {
  return withEngine(
    "fast",
    async () => {
      return callStructured(JobAnalysisSchema, jobAnalysisPrompt(job), "fast");
    },
    () => mockAnalyzeJob(job)
  );
}

export async function runMatchReport(
  job: JobRow,
  analysis: JobAnalysis,
  vault: VaultSnapshot
): Promise<EngineRun<MatchReport>> {
  const facts = selectRelevantFacts(job, vault, 24);
  const projects = rankProjects(job, vault).slice(0, 5);
  const experiences = rankExperiences(job, vault).slice(0, 5);
  const skills = Array.from(vaultSkillSet(vault)).sort();

  const run = await withEngine(
    "fast",
    async () => {
      return callStructured(
        MatchReportSchema,
        matchPrompt(job, analysis, facts, projects, experiences, skills, vault.education),
        "fast"
      );
    },
    () => mockMatchReport(job, vault)
  );

  const approvedFacts = vault.facts.filter((f) => f.status === "approved");
  return { ...run, data: sanitizeMatchReport(run.data, vaultSkillSet(vault), approvedFacts, vault.education) };
}

export interface TailorPipelineOutput {
  result: TailorResult;
  guarded: GuardResult;
  bullets: BulletBlock[];
  scoreBefore: number;
  scoreAfter: number;
  engine: EngineKind;
  model: string | null;
}

/** Keyword coverage of a resume document against a job's requested skills. */
export function resumeCoverage(
  content: string,
  job: Pick<JobRow, "skills" | "title" | "description_text">,
  format: ResumeFormat = "latex"
): number {
  const wanted = job.skills.length
    ? canonicalizeSkillList(job.skills)
    : extractSkills(`${job.title}\n${job.description_text || ""}`);
  if (wanted.length === 0) return 50;
  const have = new Set(extractSkills(documentPlainText(content, format)));
  const hit = wanted.filter((w) => have.has(w)).length;
  return Math.round((hit / wanted.length) * 100);
}

export async function runTailorPipeline(
  job: JobRow,
  analysis: JobAnalysis,
  vault: VaultSnapshot,
  masterContent: string,
  format: ResumeFormat = "latex"
): Promise<TailorPipelineOutput> {
  // STEP 2-3 (deterministic): relevant facts + ranked content.
  const facts = selectRelevantFacts(job, vault, 24);
  const skills = Array.from(vaultSkillSet(vault)).sort();
  const bullets = documentBullets(masterContent, format);

  // STEP 4-6: propose content changes (the "smart" model writes, or offline).
  const { data, engine, model } = await withEngine(
    "smart",
    async () => {
      return callStructured(
        TailorResultSchema,
        tailorPrompt(job, analysis, facts, bullets, skills, format),
        "smart"
      );
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
  const preview = applyChangesToDocument(
    masterContent,
    guarded.accepted.map((c) => ({
      block_id: c.block_id,
      change_type: c.action === "remove" ? ("remove" as const) : ("rewrite" as const),
      status: "accepted" as const,
      current_text: c.tailored_text,
    })),
    format
  );

  return {
    result,
    guarded,
    bullets,
    scoreBefore: resumeCoverage(masterContent, job, format),
    scoreAfter: resumeCoverage(preview, job, format),
    engine,
    model,
  };
}
