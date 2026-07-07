// Career Vault data access. All queries run under the user's RLS context.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EducationRow,
  ExperienceRow,
  FactRow,
  ProjectRow,
  SkillGroupRow,
  VaultSnapshot,
} from "../types";
import {
  STARTER_EDUCATION,
  STARTER_EXPERIENCES,
  STARTER_GENERAL_FACTS,
  STARTER_PROJECTS,
  STARTER_SKILLS,
  SAMPLE_MASTER_RESUME,
} from "../vault/starter";
import { extractSkills } from "../jobs/skills";

export async function loadVaultSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<VaultSnapshot> {
  const [education, experiences, projects, skills, facts] = await Promise.all([
    supabase.from("career_education").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("career_experiences").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("career_projects").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("career_skills").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("career_facts").select("*").eq("user_id", userId).order("created_at"),
  ]);
  const firstError =
    education.error || experiences.error || projects.error || skills.error || facts.error;
  if (firstError) throw new Error(`Failed to load Career Vault: ${firstError.message}`);
  return {
    education: (education.data || []) as EducationRow[],
    experiences: (experiences.data || []) as ExperienceRow[],
    projects: (projects.data || []) as ProjectRow[],
    skills: (skills.data || []) as SkillGroupRow[],
    facts: (facts.data || []) as FactRow[],
  };
}

export function vaultIsEmpty(vault: VaultSnapshot): boolean {
  return (
    vault.education.length === 0 &&
    vault.experiences.length === 0 &&
    vault.projects.length === 0 &&
    vault.skills.length === 0 &&
    vault.facts.length === 0
  );
}

/**
 * Seed the starter profile (editable example content) for a new user:
 * education, one experience, five projects, skills, the seed fact bank,
 * and a sample LaTeX master resume when none exists yet.
 */
export async function seedStarterVault(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: edu, error: eduErr } = await supabase
    .from("career_education")
    .insert({ user_id: userId, ...STARTER_EDUCATION })
    .select("id")
    .single();
  if (eduErr) throw new Error(eduErr.message);
  void edu;

  for (const [i, exp] of STARTER_EXPERIENCES.entries()) {
    const { facts, ...row } = exp;
    const { data: inserted, error } = await supabase
      .from("career_experiences")
      .insert({ user_id: userId, sort_order: i, ...row })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const factRows = facts.map((f) => ({
      user_id: userId,
      experience_id: inserted.id,
      fact_text: f.text,
      category: f.category,
      keywords: extractSkills(f.text),
      source: "seed",
      status: "approved",
    }));
    const { error: factErr } = await supabase.from("career_facts").insert(factRows);
    if (factErr) throw new Error(factErr.message);
  }

  for (const [i, project] of STARTER_PROJECTS.entries()) {
    const { facts, ...row } = project;
    const { data: inserted, error } = await supabase
      .from("career_projects")
      .insert({ user_id: userId, sort_order: i, ...row })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const factRows = facts.map((f) => ({
      user_id: userId,
      project_id: inserted.id,
      fact_text: f.text,
      category: f.category,
      keywords: extractSkills(f.text),
      source: "seed",
      status: "approved",
    }));
    const { error: factErr } = await supabase.from("career_facts").insert(factRows);
    if (factErr) throw new Error(factErr.message);
  }

  const { error: skillsErr } = await supabase.from("career_skills").insert(
    STARTER_SKILLS.map((s, i) => ({
      user_id: userId,
      category: s.category,
      items: s.items,
      sort_order: i,
    }))
  );
  if (skillsErr) throw new Error(skillsErr.message);

  const { error: generalErr } = await supabase.from("career_facts").insert(
    STARTER_GENERAL_FACTS.map((f) => ({
      user_id: userId,
      fact_text: f.text,
      category: f.category,
      keywords: extractSkills(f.text),
      source: "seed",
      status: "approved",
    }))
  );
  if (generalErr) throw new Error(generalErr.message);

  const { count } = await supabase
    .from("master_resumes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (!count) {
    const { error: resumeErr } = await supabase.from("master_resumes").insert({
      user_id: userId,
      title: "Master resume (sample)",
      format: "latex",
      content: SAMPLE_MASTER_RESUME,
      is_active: true,
    });
    if (resumeErr) throw new Error(resumeErr.message);
  }
}
