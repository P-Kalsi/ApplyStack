"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireUser } from "@/lib/supabase/server";
import { explainDbError, getJob, loadSources } from "@/lib/db/jobs";
import { buildNormalizedJob, descriptionPatch } from "@/lib/jobs/normalize";
import { fetchPosting, type FetchedPosting } from "@/lib/jobs/posting";
import { boardPostingUrl, checkLiveness, type Liveness } from "@/lib/jobs/liveness";
import { canonicalJobUrl, MAX_CAPTURE_CHARS, siteOf, type ExtractedJob } from "@/lib/jobs/page-import";
import { extractJobFromPage } from "@/lib/ai/page-extract";
import { canonicalSkill, extractSkills } from "@/lib/jobs/skills";
import { displaySkill } from "@/lib/utils";
import type { MatchReport } from "@/lib/ai/schemas";
import { loadVaultSnapshot } from "@/lib/db/vault";
import { runJobAnalysis, runMatchReport } from "@/lib/ai/engine";
import { assertLlmReady } from "@/lib/ai/llm";

const NO_DESCRIPTION =
  "This job has no description yet. Use Get description or paste it on the job page first.";

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
    await assertLlmReady(); // clear setup message before any work starts
    const supabase = await createClient();
    const job = await getJob(supabase, jobId);
    if (!job) return { ok: false, message: "Job not found." };
    if (!job.description_text?.trim()) return { ok: false, message: NO_DESCRIPTION };

    const vault = await loadVaultSnapshot(supabase, user.id);
    const { data: analysis, engine, model } = await runJobAnalysis(job);
    const { data: matchReport } = await runMatchReport(job, analysis, vault);

    const { error } = await supabase.from("job_analyses").upsert(
      {
        user_id: user.id,
        job_id: jobId,
        analysis,
        match_report: matchReport,
        engine,
        model: model ?? "deterministic",
      },
      { onConflict: "user_id,job_id" }
    );
    if (error) throw new Error(explainDbError(error.message));

    revalidatePath(`/jobs/${jobId}`);
    return {
      ok: true,
      message:
        engine === "offline"
          ? "Analysis complete (offline engine; pick an AI backend in Settings for model-based analysis)."
          : `Analysis complete (${engine} · ${model}).`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Analysis failed." };
  }
}

const PasteSchema = z.object({
  jobId: z.string().uuid(),
  description: z.string().trim().min(80, "Paste the full description (at least a few sentences).").max(60_000),
});

/** Save a pasted description on a job. */
export async function saveJobDescription(jobId: string, description: string): Promise<AnalyzeResult> {
  try {
    await requireUser();
    const input = PasteSchema.parse({ jobId, description });
    const supabase = await createClient();
    const job = await getJob(supabase, input.jobId);
    if (!job) return { ok: false, message: "Job not found." };
    const { error } = await supabase
      .from("jobs")
      .update(descriptionPatch(job, null, input.description))
      .eq("id", job.id);
    if (error) throw new Error(error.message);
    revalidatePath(`/jobs/${job.id}`);
    revalidatePath("/discover");
    return { ok: true, message: "Description saved." };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Invalid description." };
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't save the description." };
  }
}

/** Fetch a job's description from its posting link (Greenhouse, Lever, Ashby, Workday). */
export async function fetchJobDescription(jobId: string): Promise<AnalyzeResult> {
  try {
    await requireUser();
    const supabase = await createClient();
    const job = await getJob(supabase, jobId);
    if (!job) return { ok: false, message: "Job not found." };
    if (!job.url) return { ok: false, message: "This job has no link. Paste the description instead." };
    const posting = await fetchPosting(job.url);
    if (!posting.description_text.trim()) {
      return { ok: false, message: "The posting page had no description. Paste it instead." };
    }
    const { error } = await supabase
      .from("jobs")
      .update(descriptionPatch(job, posting.description_html, posting.description_text))
      .eq("id", job.id);
    if (error) throw new Error(error.message);
    revalidatePath(`/jobs/${job.id}`);
    revalidatePath("/discover");
    return { ok: true, message: "Description fetched." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't fetch the description." };
  }
}

/**
 * Ask the company's job board whether this posting is still open, and record
 * the answer (is_open) so the posting checks and verdict reflect it.
 */
export async function checkJobOpen(jobId: string): Promise<AnalyzeResult & { status?: Liveness }> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const job = await getJob(supabase, jobId);
    if (!job) return { ok: false, message: "Job not found." };
    const url = boardPostingUrl(job, await loadSources(supabase, user.id).catch(() => []));
    const result = await checkLiveness(url ?? job.url);
    if (result.status !== "unknown") {
      const isOpen = result.status === "open";
      if (job.is_open !== isOpen) {
        const { error } = await supabase.from("jobs").update({ is_open: isOpen }).eq("id", job.id);
        if (error) throw new Error(explainDbError(error.message));
      }
      revalidatePath(`/jobs/${job.id}`);
      revalidatePath("/discover");
    }
    return { ok: result.status !== "unknown", status: result.status, message: result.message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't check the posting." };
  }
}

/** Prefill the Add job form from a posting link. */
export async function previewPosting(
  url: string
): Promise<{ ok: true; posting: FetchedPosting } | { ok: false; message: string }> {
  try {
    await requireUser();
    const posting = await fetchPosting(z.string().trim().url("Enter the full link, starting with https://").parse(url));
    return { ok: true, posting };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Invalid link." };
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't read that posting." };
  }
}

const ManualJobSchema = z.object({
  company: z.string().trim().min(1, "Company is required.").max(200),
  title: z.string().trim().min(1, "Job title is required.").max(300),
  location: z.string().trim().max(300).optional().default(""),
  url: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .default("")
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "The link must start with https://"),
  description: z.string().trim().min(80, "Paste the full job description (at least a few sentences).").max(60_000),
  description_html: z.string().max(200_000).optional().default(""),
});

/** Add a job from any site by hand; returns the new (or existing) job id. */
export async function createManualJob(
  input: z.input<typeof ManualJobSchema>
): Promise<{ ok: true; jobId: string; message: string } | { ok: false; message: string }> {
  try {
    await requireUser();
    const data = ManualJobSchema.parse(input);
    const supabase = await createClient();
    const url = data.url ? canonicalJobUrl(data.url) : null;
    const job = buildNormalizedJob({
      // LinkedIn / Indeed / Glassdoor links get their own badge; anything else is "Added by you".
      source: (url && siteOf(url)) || "manual",
      company: data.company,
      title: data.title,
      location: data.location || null,
      url,
      description_html: data.description_html || null,
      description_text: data.description,
      posted_at: new Date().toISOString(),
    });
    // Same job sent twice (same link, or same company/title/location): update it.
    const { data: byKey } = await supabase.from("jobs").select("id").eq("dedupe_key", job.dedupe_key).maybeSingle();
    const { data: byUrl } = url && !byKey
      ? await supabase.from("jobs").select("id").eq("url", url).limit(1).maybeSingle()
      : { data: null };
    const existing = byKey ?? byUrl;
    if (existing) {
      // Same company/title/location/link already on the board: refresh its description.
      await supabase
        .from("jobs")
        .update({ ...descriptionPatch(job, job.description_html, data.description), is_open: true })
        .eq("id", existing.id);
      revalidatePath("/discover");
      return { ok: true, jobId: existing.id as string, message: "That job was already on your board; description updated." };
    }
    const { data: created, error } = await supabase.from("jobs").insert(job).select("id").single();
    if (error) throw new Error(explainDbError(error.message));
    revalidatePath("/discover");
    return { ok: true, jobId: created!.id as string, message: "Job added." };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Check the form." };
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't add the job." };
  }
}

const CaptureSchema = z.object({
  url: z.string().trim().max(4000).optional().default(""),
  title: z.string().max(1000).optional().default(""),
  text: z
    .string()
    .min(80, "That's too short to be a job posting. Copy the whole page (Ctrl+A, Ctrl+C) and paste it.")
    .max(MAX_CAPTURE_CHARS * 2),
});

/**
 * Paste import and the Send to ApplyStack bookmark: find the job in copied
 * page text so you can review it before adding. Nothing is saved here.
 */
export async function importJobFromPage(
  input: z.input<typeof CaptureSchema>
): Promise<{ ok: true; job: ExtractedJob } | { ok: false; message: string }> {
  try {
    await requireUser();
    const c = CaptureSchema.parse(input);
    const url = /^https?:\/\//i.test(c.url) ? c.url : "";
    const job = await extractJobFromPage({ url, title: c.title, text: c.text.slice(0, MAX_CAPTURE_CHARS) });
    return { ok: true, job };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Couldn't read that." };
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't read that page." };
  }
}

const SKILL_GROUPS = [
  "languages", "frameworks", "libraries", "databases", "cloud",
  "infrastructure", "developer_tools", "operating_systems", "other",
] as const;

const ConfirmSchema = z.object({
  jobId: z.string().uuid(),
  keyword: z.string().trim().min(1).max(120),
  factText: z
    .string()
    .trim()
    .min(15, "Describe what you did in a sentence (where, what you built or did).")
    .max(600, "Keep it to one or two sentences."),
  experienceId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  /** Also add the keyword to this skills group. */
  skillGroup: z.enum(SKILL_GROUPS).nullable().optional(),
});

/**
 * "I've done this": save your own description of a requirement you meet as an
 * approved Career Vault fact (optionally as a skill too), and mark that keyword
 * as verified in this job's analysis. Your words are saved as-is; nothing is
 * generated. Tailoring may now use it.
 */
export async function confirmKeyword(input: z.input<typeof ConfirmSchema>): Promise<AnalyzeResult> {
  try {
    const user = await requireUser();
    const d = ConfirmSchema.parse(input);
    const supabase = await createClient();

    const keywordSkill = canonicalSkill(d.keyword);
    const keywords = Array.from(
      new Set([...extractSkills(`${d.keyword}\n${d.factText}`), d.keyword.toLowerCase()])
    ).slice(0, 20);
    const { data: fact, error: factErr } = await supabase
      .from("career_facts")
      .insert({
        user_id: user.id,
        fact_text: d.factText,
        category: "general",
        experience_id: d.experienceId || null,
        project_id: d.projectId || null,
        keywords,
        source: "manual",
        status: "approved",
      })
      .select("id")
      .single();
    if (factErr) throw new Error(factErr.message);

    let skillNote = "";
    if (d.skillGroup) {
      const { data: group } = await supabase
        .from("career_skills")
        .select("items")
        .eq("user_id", user.id)
        .eq("category", d.skillGroup)
        .maybeSingle();
      const items = ((group?.items as string[] | undefined) ?? []).slice();
      const label = displaySkill(d.keyword.trim());
      if (!items.some((i) => canonicalSkill(i) === keywordSkill || i.toLowerCase() === label.toLowerCase())) {
        items.push(label);
        const { error } = await supabase
          .from("career_skills")
          .upsert({ user_id: user.id, category: d.skillGroup, items }, { onConflict: "user_id,category" });
        if (error) throw new Error(error.message);
        skillNote = ` and added "${label}" to your skills`;
      }
    }

    // Show it as verified right away (no AI call); Re-analyze refreshes the scores.
    const { data: row } = await supabase
      .from("job_analyses")
      .select("id, match_report")
      .eq("user_id", user.id)
      .eq("job_id", d.jobId)
      .maybeSingle();
    if (row?.match_report) {
      const report = row.match_report as MatchReport;
      const same = (k: string) => k.trim().toLowerCase() === d.keyword.trim().toLowerCase();
      report.keyword_evidence = report.keyword_evidence.map((e) =>
        same(e.keyword) ? { ...e, status: "verified", evidence: `Your fact: "${d.factText}"` } : e
      );
      report.missing_keywords = report.missing_keywords.filter((k) => !same(k));
      if (!report.matched_keywords.some(same)) report.matched_keywords.push(d.keyword);
      // Drop concerns that only said this keyword was missing.
      const kw = d.keyword.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mentions = new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, "i");
      report.potential_concerns = report.potential_concerns.filter(
        (c) => !(mentions.test(c) && /\b(no|not|missing|lack|without)\b/i.test(c) && c.length < 140)
      );
      await supabase.from("job_analyses").update({ match_report: report }).eq("id", row.id);
    }

    revalidatePath(`/jobs/${d.jobId}`);
    revalidatePath("/vault");
    revalidatePath("/discover");
    void fact;
    return { ok: true, message: `Added to your Fact Bank${skillNote}. Tailoring can use it now.` };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Check the form." };
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't save that." };
  }
}
