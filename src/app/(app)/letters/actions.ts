"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getJob } from "@/lib/db/jobs";
import { loadVaultSnapshot } from "@/lib/db/vault";
import { readDocumentXml } from "@/lib/docx/zip";
import { docxPlainText } from "@/lib/resume/docx";
import { isLetterTemplate } from "@/lib/letters/docx";
import { checkEdited, defaultRecipient, LETTER_FOCUS, LETTER_TONE, splitLetter, type WritingSample } from "@/lib/letters/letters";
import { draftCoverLetter } from "@/lib/ai/letters";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const MAX_DOCX_BYTES = 8 * 1024 * 1024;
const MAX_SAMPLES = 30;

/** A missing table means migration 0011 hasn't been run yet. */
function explain(message: string): string {
  if (/writing_samples|cover_letters/.test(message) && /does not exist|schema cache|relation/i.test(message)) {
    return "Cover letters need a database update: run supabase/migrations/0011_cover_letters.sql in the Supabase SQL Editor.";
  }
  return message;
}

function fail(err: unknown, fallback: string): ActionResult {
  return { ok: false, message: err instanceof Error ? explain(err.message) : fallback };
}

/** Upload past cover letters (.docx, several at once) or paste one as text. */
export async function addWritingSamples(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { count } = await supabase.from("writing_samples").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    const { data: hasTemplate } = await supabase
      .from("writing_samples")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_template", true)
      .limit(1)
      .maybeSingle();
    let templateTaken = Boolean(hasTemplate);
    const room = MAX_SAMPLES - (count ?? 0);

    const rows: Record<string, unknown>[] = [];
    const skipped: string[] = [];
    for (const file of fd.getAll("files")) {
      if (!(file instanceof File) || file.size === 0) continue;
      if (!/\.docx$/i.test(file.name)) {
        skipped.push(`${file.name} (only .docx; paste other formats as text)`);
        continue;
      }
      if (file.size > MAX_DOCX_BYTES) {
        skipped.push(`${file.name} (over 8 MB)`);
        continue;
      }
      const buf = Buffer.from(await file.arrayBuffer());
      let xml: string;
      try {
        xml = readDocumentXml(buf);
      } catch {
        skipped.push(`${file.name} (not a Word document)`);
        continue;
      }
      const content = docxPlainText(xml);
      if (splitLetter(content).body.length === 0) {
        skipped.push(`${file.name} (no letter paragraphs found)`);
        continue;
      }
      const usable = isLetterTemplate(xml);
      rows.push({
        user_id: user.id,
        title: file.name.replace(/\.docx$/i, ""),
        content,
        file_name: file.name,
        template_base64: usable ? buf.toString("base64") : null,
        is_template: usable && !templateTaken,
      });
      if (usable) templateTaken = true;
    }

    const pasted = String(fd.get("text") ?? "").trim();
    if (pasted) {
      if (splitLetter(pasted).body.length === 0) {
        skipped.push("the pasted text (paste the whole letter, one paragraph per line)");
      } else {
        rows.push({ user_id: user.id, title: String(fd.get("title") ?? "").trim() || "Pasted letter", content: pasted });
      }
    }

    if (rows.length > room) {
      skipped.push(`${rows.length - room} more (you can keep ${MAX_SAMPLES} samples)`);
      rows.length = Math.max(room, 0);
    }
    if (!rows.length) {
      return { ok: false, message: skipped.length ? `Nothing added: ${skipped.join("; ")}.` : "Choose .docx files or paste a letter." };
    }
    const { error } = await supabase.from("writing_samples").insert(rows);
    if (error) throw new Error(error.message);
    revalidatePath("/vault");
    return {
      ok: true,
      message: `Added ${rows.length} letter${rows.length === 1 ? "" : "s"}.${skipped.length ? ` Skipped ${skipped.join("; ")}.` : ""}`,
    };
  } catch (err) {
    return fail(err, "Couldn't add the letters.");
  }
}

export async function deleteWritingSample(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase.from("writing_samples").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/vault");
    return { ok: true, message: "Removed." };
  } catch (err) {
    return fail(err, "Couldn't remove it.");
  }
}

/** Make this letter's .docx the Word template new letters are built in. */
export async function setLetterTemplate(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data: row } = await supabase
      .from("writing_samples")
      .select("id, template_base64")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row?.template_base64) return { ok: false, message: "Only an uploaded .docx letter can be the template." };
    await supabase.from("writing_samples").update({ is_template: false }).eq("user_id", user.id);
    const { error } = await supabase.from("writing_samples").update({ is_template: true }).eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/vault");
    return { ok: true, message: "New letters will use this letter's layout." };
  } catch (err) {
    return fail(err, "Couldn't set the template.");
  }
}

const GenerateSchema = z.object({
  jobId: z.string().uuid().or(z.string().min(1)),
  focus: z.enum(LETTER_FOCUS.map((f) => f.value) as [string, ...string[]]),
  tone: z.enum(LETTER_TONE.map((t) => t.value) as [string, ...string[]]),
});

/** Draft (or redraft) the cover letter for a job from your vault and past letters. */
export async function generateCoverLetter(input: z.input<typeof GenerateSchema>): Promise<ActionResult> {
  try {
    const d = GenerateSchema.parse(input);
    const user = await requireUser();
    const supabase = await createClient();
    const job = await getJob(supabase, d.jobId);
    if (!job) return { ok: false, message: "Job not found." };
    if (!job.description_text?.trim()) return { ok: false, message: "Add the job description first." };

    const [vault, samplesRes, existingRes] = await Promise.all([
      loadVaultSnapshot(supabase, user.id),
      supabase
        .from("writing_samples")
        .select("id, title, content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(MAX_SAMPLES),
      supabase.from("cover_letters").select("recipient, greeting").eq("user_id", user.id).eq("job_id", job.id).maybeSingle(),
    ]);
    if (samplesRes.error) throw new Error(samplesRes.error.message);
    const samples = (samplesRes.data || []) as WritingSample[];

    const letter = await draftCoverLetter(job, vault, samples, d.focus as never, d.tone as never);
    const existing = existingRes.data as { recipient: string[]; greeting: string } | null;
    const issues = [...letter.issues, ...letter.paragraphs.flatMap((p, i) => p.issues.map((x) => `Paragraph ${i + 1}: ${x}`))];
    const { error } = await supabase.from("cover_letters").upsert(
      {
        user_id: user.id,
        job_id: job.id,
        focus: d.focus,
        tone: d.tone,
        recipient: existing?.recipient?.length ? existing.recipient : defaultRecipient(job),
        greeting: existing?.greeting || "Dear Hiring Manager,",
        paragraphs: letter.paragraphs.map((p) => p.text),
        fact_ids: [...new Set(letter.paragraphs.flatMap((p) => p.factIds))],
        issues,
        gaps: letter.gaps,
        engine: letter.provider,
        model: letter.model,
      },
      { onConflict: "user_id,job_id" }
    );
    if (error) throw new Error(error.message);
    revalidatePath(`/jobs/${job.id}`);
    const voice = samples.length ? `in the voice of your ${Math.min(samples.length, 3)} closest past letter${samples.length === 1 ? "" : "s"}` : "without writing samples (add past letters in Career Vault → Cover Letters)";
    return {
      ok: true,
      message: issues.length
        ? `Drafted ${voice}. ${issues.length} thing${issues.length === 1 ? "" : "s"} to check before sending.`
        : `Drafted ${voice}. Every claim cites your vault.`,
    };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: "Pick a focus and tone." };
    return fail(err, "Couldn't write the letter.");
  }
}

const SaveSchema = z.object({
  jobId: z.string().min(1),
  recipient: z.array(z.string().max(200)).max(8),
  greeting: z.string().min(1).max(200),
  paragraphs: z.array(z.string().max(4000)).min(1).max(10),
});

export async function saveCoverLetter(input: z.input<typeof SaveSchema>): Promise<ActionResult> {
  try {
    const d = SaveSchema.parse(input);
    const user = await requireUser();
    const supabase = await createClient();
    const paragraphs = d.paragraphs.map((p) => p.trim()).filter(Boolean);
    // Your edits are checked the same way: a skill or number the vault can't back is flagged.
    const issues = checkEdited(paragraphs, await loadVaultSnapshot(supabase, user.id));
    const { error } = await supabase
      .from("cover_letters")
      .update({
        recipient: d.recipient.map((l) => l.trim()).filter(Boolean),
        greeting: d.greeting.trim(),
        paragraphs,
        issues,
      })
      .eq("user_id", user.id)
      .eq("job_id", d.jobId);
    if (error) throw new Error(error.message);
    revalidatePath(`/jobs/${d.jobId}`);
    return {
      ok: true,
      message: issues.length ? `Saved. ${issues.length} thing${issues.length === 1 ? "" : "s"} to check.` : "Letter saved.",
    };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Check the letter." };
    return fail(err, "Couldn't save the letter.");
  }
}
