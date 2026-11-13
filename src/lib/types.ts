// Shared domain types. Keep this module dependency-free: it is imported by
// pure logic modules that must run under `node --test` without a bundler.

export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";
export type EmploymentType = "internship" | "newgrad" | "fulltime" | "other";
// Built-in sources; plug-in sources (see src/lib/jobs/sources) may add more ids.
export type JobSource = "greenhouse" | "lever" | "seed" | "manual" | "simplify" | "adzuna" | (string & {});

export type JobCategory =
  | "software-engineering"
  | "frontend"
  | "backend"
  | "full-stack"
  | "cloud"
  | "devops"
  | "sre"
  | "data"
  | "ai-ml";

export const JOB_CATEGORIES: { value: JobCategory; label: string }[] = [
  { value: "software-engineering", label: "Software engineering" },
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "full-stack", label: "Full stack" },
  { value: "cloud", label: "Cloud" },
  { value: "devops", label: "DevOps" },
  { value: "sre", label: "SRE" },
  { value: "data", label: "Data" },
  { value: "ai-ml", label: "AI/ML" },
];

export interface JobRow {
  id: string;
  source: JobSource;
  source_id: string | null;
  company: string;
  company_slug: string;
  title: string;
  location: string | null;
  work_mode: WorkMode;
  employment_type: EmploymentType;
  categories: string[];
  url: string | null;
  description_html: string | null;
  description_text: string | null;
  skills: string[];
  ats_keywords: string[];
  posted_at: string | null;
  dedupe_key: string;
  /** false once the posting disappears from its feed (Simplify). */
  is_open?: boolean;
  /** Short preview from sources that don't give the full description (Adzuna). */
  snippet?: string | null;
  created_at: string;
  updated_at: string;
}

export type SkillCategory =
  | "languages"
  | "frameworks"
  | "libraries"
  | "databases"
  | "cloud"
  | "infrastructure"
  | "developer_tools"
  | "operating_systems"
  | "other";

export const SKILL_CATEGORIES: { value: SkillCategory; label: string }[] = [
  { value: "languages", label: "Languages" },
  { value: "frameworks", label: "Frameworks" },
  { value: "libraries", label: "Libraries" },
  { value: "databases", label: "Databases" },
  { value: "cloud", label: "Cloud" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "developer_tools", label: "Developer tools" },
  { value: "operating_systems", label: "Operating systems" },
  { value: "other", label: "Other" },
];

export interface EducationRow {
  id: string;
  user_id: string;
  school: string;
  degree: string | null;
  major: string | null;
  location: string | null;
  start_date: string | null;
  expected_graduation: string | null;
  gpa: string | null;
  coursework: string[];
  sort_order: number;
}

export interface ExperienceRow {
  id: string;
  user_id: string;
  company: string;
  role: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  summary: string | null;
  sort_order: number;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  technologies: string[];
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  links: string[];
  sort_order: number;
}

export interface SkillGroupRow {
  id: string;
  user_id: string;
  category: SkillCategory;
  items: string[];
  sort_order: number;
}

export type FactCategory =
  | "general"
  | "skill"
  | "achievement"
  | "metric"
  | "education"
  | "additional";

export type FactSource = "manual" | "extracted" | "seed";
export type FactStatus = "approved" | "pending" | "rejected";

export interface FactRow {
  id: string;
  user_id: string;
  experience_id: string | null;
  project_id: string | null;
  fact_text: string;
  category: FactCategory;
  keywords: string[];
  source: FactSource;
  status: FactStatus;
}

export interface VaultSnapshot {
  education: EducationRow[];
  experiences: ExperienceRow[];
  projects: ProjectRow[];
  skills: SkillGroupRow[];
  facts: FactRow[];
}

export interface MasterResumeRow {
  id: string;
  user_id: string;
  title: string;
  format: "latex" | "plain" | "docx";
  content: string;
  /** Original .docx (base64) for Word masters; null for LaTeX. */
  template_base64?: string | null;
  file_name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ResumeChangeType =
  | "rewrite"
  | "remove"
  | "reorder"
  | "skills_reorder"
  | "coursework";

export type ResumeChangeStatus = "proposed" | "accepted" | "rejected" | "edited";

export interface ResumeChangeRow {
  id: string;
  user_id: string;
  resume_version_id: string;
  block_id: string;
  section: string | null;
  change_type: ResumeChangeType;
  original_text: string;
  tailored_text: string;
  current_text: string;
  reason: string;
  fact_ids: string[];
  keywords: string[];
  is_safe: boolean;
  status: ResumeChangeStatus;
}

export interface ResumeVersionRow {
  id: string;
  user_id: string;
  master_resume_id: string | null;
  job_id: string | null;
  name: string;
  company: string | null;
  role: string | null;
  /** Untouched master content (LaTeX source or Word document.xml). */
  master_latex: string;
  /** Tailored content with accepted changes applied (same format). */
  latex_content: string;
  format: "latex" | "docx";
  match_score_before: number | null;
  match_score_after: number | null;
  keywords_added: string[];
  skills_emphasized: string[];
  still_missing: string[];
  status: "draft" | "final";
  created_at: string;
  updated_at: string;
}

export type ApplicationStatus =
  | "saved"
  | "tailoring"
  | "ready"
  | "applied"
  | "oa"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "tailoring", label: "Tailoring" },
  { value: "ready", label: "Ready to Apply" },
  { value: "applied", label: "Applied" },
  { value: "oa", label: "Online Assessment" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export interface ApplicationRow {
  id: string;
  user_id: string;
  job_id: string | null;
  company: string;
  role: string;
  status: ApplicationStatus;
  date_applied: string | null;
  resume_version_id: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  job_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface JobSourceRow {
  id: string;
  user_id: string;
  kind: "greenhouse" | "lever";
  token: string;
  label: string | null;
  enabled: boolean;
}
