"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireUser } from "@/lib/supabase/server";
import { loadVaultSnapshot, seedStarterVault, vaultIsEmpty } from "@/lib/db/vault";
import { extractSkills } from "@/lib/jobs/skills";
import { extractFactsFromLatex } from "@/lib/resume/extract-facts";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function fail(err: unknown, fallback: string): ActionResult {
  return { ok: false, message: err instanceof Error ? err.message : fallback };
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function list(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function revalidateVault() {
  revalidatePath("/vault");
  revalidatePath("/discover");
}

// ---------------------------------------------------------------------------
// Starter profile
// ---------------------------------------------------------------------------

export async function seedVault(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const vault = await loadVaultSnapshot(supabase, user.id);
    if (!vaultIsEmpty(vault)) {
      return { ok: false, message: "Your Career Vault already has content; not seeding over it." };
    }
    await seedStarterVault(supabase, user.id);
    revalidateVault();
    return { ok: true, message: "Starter profile loaded. Every record is editable." };
  } catch (err) {
    return fail(err, "Failed to seed the starter profile.");
  }
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

export async function upsertEducation(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const row = {
      user_id: user.id,
      school: str(fd, "school"),
      degree: str(fd, "degree") || null,
      major: str(fd, "major") || null,
      location: str(fd, "location") || null,
      start_date: str(fd, "start_date") || null,
      expected_graduation: str(fd, "expected_graduation") || null,
      gpa: str(fd, "gpa") || null,
      coursework: list(fd, "coursework"),
    };
    if (!row.school) return { ok: false, message: "School is required." };
    const id = str(fd, "id");
    const q = id
      ? supabase.from("career_education").update(row).eq("id", id).eq("user_id", user.id)
      : supabase.from("career_education").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: id ? "Education updated." : "Education added." };
  } catch (err) {
    return fail(err, "Failed to save education.");
  }
}

export async function deleteEducation(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("career_education")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: "Education deleted." };
  } catch (err) {
    return fail(err, "Failed to delete education.");
  }
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

export async function upsertExperience(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const row = {
      user_id: user.id,
      company: str(fd, "company"),
      role: str(fd, "role"),
      location: str(fd, "location") || null,
      start_date: str(fd, "start_date") || null,
      end_date: str(fd, "end_date") || null,
      is_current: fd.get("is_current") === "on",
      summary: str(fd, "summary") || null,
    };
    if (!row.company || !row.role) return { ok: false, message: "Company and role are required." };
    const id = str(fd, "id");
    const q = id
      ? supabase.from("career_experiences").update(row).eq("id", id).eq("user_id", user.id)
      : supabase.from("career_experiences").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: id ? "Experience updated." : "Experience added." };
  } catch (err) {
    return fail(err, "Failed to save experience.");
  }
}

export async function deleteExperience(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("career_experiences")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: "Experience and its facts deleted." };
  } catch (err) {
    return fail(err, "Failed to delete experience.");
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function upsertProject(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const row = {
      user_id: user.id,
      name: str(fd, "name"),
      technologies: list(fd, "technologies"),
      start_date: str(fd, "start_date") || null,
      end_date: str(fd, "end_date") || null,
      description: str(fd, "description") || null,
      links: list(fd, "links"),
    };
    if (!row.name) return { ok: false, message: "Project name is required." };
    const id = str(fd, "id");
    const q = id
      ? supabase.from("career_projects").update(row).eq("id", id).eq("user_id", user.id)
      : supabase.from("career_projects").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: id ? "Project updated." : "Project added." };
  } catch (err) {
    return fail(err, "Failed to save project.");
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("career_projects")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: "Project and its facts deleted." };
  } catch (err) {
    return fail(err, "Failed to delete project.");
  }
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export async function upsertSkillGroup(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const category = str(fd, "category");
    const items = list(fd, "items");
    if (!category) return { ok: false, message: "Category is required." };
    const { error } = await supabase
      .from("career_skills")
      .upsert({ user_id: user.id, category, items }, { onConflict: "user_id,category" });
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: "Skills saved." };
  } catch (err) {
    return fail(err, "Failed to save skills.");
  }
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export async function upsertFact(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const fact_text = str(fd, "fact_text");
    if (!fact_text) return { ok: false, message: "Fact text is required." };
    const row = {
      user_id: user.id,
      fact_text,
      category: str(fd, "category") || "general",
      experience_id: str(fd, "experience_id") || null,
      project_id: str(fd, "project_id") || null,
      keywords: extractSkills(fact_text),
      source: "manual",
      status: "approved",
    };
    const id = str(fd, "id");
    const update = {
      fact_text: row.fact_text,
      category: row.category,
      experience_id: row.experience_id,
      project_id: row.project_id,
      keywords: row.keywords,
    };
    const q = id
      ? supabase.from("career_facts").update(update).eq("id", id).eq("user_id", user.id)
      : supabase.from("career_facts").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: id ? "Fact updated." : "Fact added." };
  } catch (err) {
    return fail(err, "Failed to save fact.");
  }
}

export async function setFactStatus(
  id: string,
  status: "approved" | "rejected" | "pending"
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("career_facts")
      .update({ status })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: `Fact ${status}.` };
  } catch (err) {
    return fail(err, "Failed to update fact.");
  }
}

export async function deleteFact(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("career_facts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidateVault();
    return { ok: true, message: "Fact deleted." };
  } catch (err) {
    return fail(err, "Failed to delete fact.");
  }
}

// ---------------------------------------------------------------------------
// Master resume
// ---------------------------------------------------------------------------

export async function saveMasterResume(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const content = String(fd.get("content") || "");
    const title = str(fd, "title") || "Master resume";
    if (content.trim().length < 40) {
      return { ok: false, message: "Resume content looks empty — paste your full LaTeX source." };
    }
    const format = content.includes("\\begin{document}") ? "latex" : "plain";
    const id = str(fd, "id");
    if (id) {
      const { error } = await supabase
        .from("master_resumes")
        .update({ content, title, format })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
    } else {
      // Deactivate previous masters; the newest one becomes active.
      await supabase.from("master_resumes").update({ is_active: false }).eq("user_id", user.id);
      const { error } = await supabase
        .from("master_resumes")
        .insert({ user_id: user.id, content, title, format, is_active: true });
      if (error) throw new Error(error.message);
    }
    revalidatePath("/vault");
    revalidatePath("/tailor");
    return { ok: true, message: "Master resume saved." };
  } catch (err) {
    return fail(err, "Failed to save master resume.");
  }
}

/**
 * Deterministically extract candidate facts from the active master resume.
 * New facts arrive as "pending" so the user explicitly approves or rejects
 * each one before the AI is ever allowed to use it.
 */
export async function extractResumeFacts(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data: master, error } = await supabase
      .from("master_resumes")
      .select("id, content")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!master) return { ok: false, message: "No master resume saved yet." };

    const extracted = extractFactsFromLatex(master.content);
    if (extracted.length === 0) {
      return { ok: false, message: "No bullet facts found — is the resume LaTeX with \\resumeItem or \\item bullets?" };
    }

    const { data: existing, error: exErr } = await supabase
      .from("career_facts")
      .select("fact_text")
      .eq("user_id", user.id);
    if (exErr) throw new Error(exErr.message);
    const known = new Set((existing || []).map((f) => (f.fact_text as string).toLowerCase()));

    const fresh = extracted.filter((f) => !known.has(f.fact_text.toLowerCase()));
    if (fresh.length === 0) {
      return { ok: true, message: "Nothing new — every resume bullet is already in the fact bank." };
    }

    const { error: insErr } = await supabase.from("career_facts").insert(
      fresh.map((f) => ({
        user_id: user.id,
        fact_text: f.fact_text,
        category: f.category,
        keywords: f.keywords,
        source: "extracted",
        status: "pending",
      }))
    );
    if (insErr) throw new Error(insErr.message);
    revalidateVault();
    return {
      ok: true,
      message: `Extracted ${fresh.length} fact(s) from the resume. Review them under Facts — pending facts are never used until approved.`,
    };
  } catch (err) {
    return fail(err, "Fact extraction failed.");
  }
}
