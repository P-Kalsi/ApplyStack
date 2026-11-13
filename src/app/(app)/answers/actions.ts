"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireUser } from "@/lib/supabase/server";
import { loadVaultSnapshot } from "@/lib/db/vault";
import { getJob, explainDbError } from "@/lib/db/jobs";
import { draftAnswers } from "@/lib/ai/answers";
import { findSimilar, type CheckedAnswer } from "@/lib/answers/answers";
import { extractSkills } from "@/lib/jobs/skills";

export interface SavedAnswer {
  id: string;
  question: string;
  answer: string;
  char_limit: number | null;
  kind: "text" | "choice";
  job_id: string | null;
  updated_at: string;
}

const DraftSchema = z.object({
  question: z.string().trim().min(5, "Paste the question first.").max(2000),
  charLimit: z.number().int().min(10).max(10000).nullable(),
  options: z.array(z.string().trim().min(1).max(300)).max(20),
  jobId: z.string().uuid().nullable(),
});

export async function draftAnswer(
  input: z.input<typeof DraftSchema>
): Promise<
  | { ok: true; result: CheckedAnswer & { model: string }; similar: SavedAnswer[] }
  | { ok: false; message: string; similar?: SavedAnswer[] }
> {
  let similar: SavedAnswer[] = [];
  try {
    const user = await requireUser();
    const d = DraftSchema.parse(input);
    const supabase = await createClient();
    const [vault, job, saved] = await Promise.all([
      loadVaultSnapshot(supabase, user.id),
      d.jobId ? getJob(supabase, d.jobId) : Promise.resolve(null),
      supabase
        .from("application_answers")
        .select("id, question, answer, char_limit, kind, job_id, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(300)
        .then((r) => (r.data || []) as SavedAnswer[]),
    ]);
    similar = findSimilar(d.question, saved);
    if (!vault.facts.some((f) => f.status === "approved")) {
      return { ok: false, message: "Your Fact Bank is empty. Load your profile in Career Vault first.", similar };
    }
    const result = await draftAnswers({ question: d.question, charLimit: d.charLimit, options: d.options }, vault, job);
    return { ok: true, result, similar };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Check the form.", similar };
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't draft an answer.", similar };
  }
}

const SaveSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  question: z.string().trim().min(3).max(2000),
  answer: z.string().trim().min(1, "The answer is empty.").max(10000),
  charLimit: z.number().int().min(10).max(10000).nullable(),
  kind: z.enum(["text", "choice"]),
  jobId: z.string().uuid().nullable(),
  factIds: z.array(z.string().uuid()).max(50).default([]),
});

/** Save to your answer bank (linked to the job if one is picked). */
export async function saveAnswer(input: z.input<typeof SaveSchema>): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    const d = SaveSchema.parse(input);
    if (d.charLimit && d.kind === "text" && d.answer.length > d.charLimit) {
      return { ok: false, message: `That's ${d.answer.length - d.charLimit} characters over the ${d.charLimit} limit.` };
    }
    const supabase = await createClient();
    const row = {
      user_id: user.id,
      question: d.question,
      answer: d.answer,
      char_limit: d.charLimit,
      kind: d.kind,
      job_id: d.jobId,
      fact_ids: d.factIds,
    };
    const { error } = d.id
      ? await supabase.from("application_answers").update(row).eq("id", d.id).eq("user_id", user.id)
      : await supabase.from("application_answers").insert(row);
    if (error) {
      if (/application_answers/.test(error.message) && /exist|schema cache/i.test(error.message)) {
        throw new Error("Your database needs an update: run supabase/migrations/0008_application_answers.sql in the Supabase SQL Editor.");
      }
      throw new Error(explainDbError(error.message));
    }
    revalidatePath("/answers");
    if (d.jobId) revalidatePath(`/jobs/${d.jobId}`);
    return { ok: true, message: d.id ? "Answer updated." : "Saved to your answer bank." };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Check the answer." };
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't save the answer." };
  }
}

export async function deleteAnswer(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase.from("application_answers").delete().eq("id", z.string().uuid().parse(id)).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/answers");
    return { ok: true, message: "Answer deleted." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't delete it." };
  }
}

const FactSchema = z.object({
  text: z.string().trim().min(15, "Describe what you did in a sentence.").max(600),
  experienceId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
});

/** Add a fact in your own words when a question needs something your vault lacks. */
export async function addAnswerFact(input: z.input<typeof FactSchema>): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    const d = FactSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.from("career_facts").insert({
      user_id: user.id,
      fact_text: d.text,
      category: "general",
      experience_id: d.experienceId,
      project_id: d.projectId,
      keywords: extractSkills(d.text),
      source: "manual",
      status: "approved",
    });
    if (error) throw new Error(error.message);
    revalidatePath("/vault");
    return { ok: true, message: "Added to your Fact Bank. Draft again to use it." };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Check the fact." };
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't add the fact." };
  }
}
