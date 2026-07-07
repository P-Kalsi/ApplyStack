// Zod schemas for every structured AI response. All model output is parsed
// against these before anything touches the database or the UI.

import { z } from "zod";

export const JobAnalysisSchema = z.object({
  role_category: z.string(),
  seniority: z.string(),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  tools: z.array(z.string()),
  frameworks: z.array(z.string()),
  languages: z.array(z.string()),
  cloud_infrastructure_keywords: z.array(z.string()),
  domain_keywords: z.array(z.string()),
  responsibilities: z.array(z.string()),
  important_phrases: z.array(z.string()),
  hard_requirements: z.array(z.string()),
  soft_requirements: z.array(z.string()),
});

export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;

export const KeywordEvidenceSchema = z.object({
  keyword: z.string(),
  /** verified: proven by a vault fact/skill. related: adjacent experience only. missing: not present. */
  status: z.enum(["verified", "related", "missing"]),
  evidence: z.string(),
});

export type KeywordEvidence = z.infer<typeof KeywordEvidenceSchema>;

export const MatchReportSchema = z.object({
  overall_match_score: z.number().int().min(0).max(100),
  skills_match_score: z.number().int().min(0).max(100),
  experience_match_score: z.number().int().min(0).max(100),
  project_match_score: z.number().int().min(0).max(100),
  matched_keywords: z.array(z.string()),
  missing_keywords: z.array(z.string()),
  keyword_evidence: z.array(KeywordEvidenceSchema),
  strongest_experiences: z.array(z.string()),
  strongest_projects: z.array(z.string()),
  potential_concerns: z.array(z.string()),
});

export type MatchReport = z.infer<typeof MatchReportSchema>;

export const TailorChangeSchema = z.object({
  block_id: z.string().min(1),
  action: z.enum(["rewrite", "remove", "skills_reorder", "coursework"]),
  tailored_text: z.string(),
  reason: z.string().min(1),
  fact_ids: z.array(z.string()),
  keywords: z.array(z.string()),
});

export type TailorChange = z.infer<typeof TailorChangeSchema>;

export const TailorResultSchema = z.object({
  changes: z.array(TailorChangeSchema),
  keywords_added: z.array(z.string()),
  skills_emphasized: z.array(z.string()),
  still_missing: z.array(z.string()),
  summary: z.string(),
});

export type TailorResult = z.infer<typeof TailorResultSchema>;
