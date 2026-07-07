// Shared fixtures for unit tests.
import type { FactRow, JobRow, VaultSnapshot } from "../src/lib/types";
import {
  STARTER_EDUCATION,
  STARTER_EXPERIENCES,
  STARTER_PROJECTS,
  STARTER_SKILLS,
  STARTER_GENERAL_FACTS,
} from "../src/lib/vault/starter";

const USER = "00000000-0000-0000-0000-000000000001";
let idSeq = 0;
const id = () => `00000000-0000-0000-0000-0000000000${String(++idSeq + 10).padStart(2, "0")}`;

export function makeVault(): VaultSnapshot {
  const facts: FactRow[] = [];
  const experiences = STARTER_EXPERIENCES.map((e, i) => {
    const eid = id();
    for (const f of e.facts) {
      facts.push({
        id: id(),
        user_id: USER,
        experience_id: eid,
        project_id: null,
        fact_text: f.text,
        category: f.category,
        keywords: [],
        source: "seed",
        status: "approved",
      });
    }
    return {
      id: eid,
      user_id: USER,
      company: e.company,
      role: e.role,
      location: e.location,
      start_date: e.start_date,
      end_date: e.end_date,
      is_current: e.is_current,
      summary: e.summary,
      sort_order: i,
    };
  });
  const projects = STARTER_PROJECTS.map((p, i) => {
    const pid = id();
    for (const f of p.facts) {
      facts.push({
        id: id(),
        user_id: USER,
        experience_id: null,
        project_id: pid,
        fact_text: f.text,
        category: f.category,
        keywords: [],
        source: "seed",
        status: "approved",
      });
    }
    return {
      id: pid,
      user_id: USER,
      name: p.name,
      technologies: p.technologies,
      start_date: null,
      end_date: null,
      description: p.description,
      links: [],
      sort_order: i,
    };
  });
  for (const f of STARTER_GENERAL_FACTS) {
    facts.push({
      id: id(),
      user_id: USER,
      experience_id: null,
      project_id: null,
      fact_text: f.text,
      category: f.category,
      keywords: [],
      source: "seed",
      status: "approved",
    });
  }
  return {
    education: [
      {
        id: id(),
        user_id: USER,
        school: STARTER_EDUCATION.school,
        degree: STARTER_EDUCATION.degree,
        major: STARTER_EDUCATION.major,
        location: STARTER_EDUCATION.location,
        start_date: STARTER_EDUCATION.start_date,
        expected_graduation: STARTER_EDUCATION.expected_graduation,
        gpa: null,
        coursework: STARTER_EDUCATION.coursework,
        sort_order: 0,
      },
    ],
    experiences,
    projects,
    skills: STARTER_SKILLS.map((s, i) => ({
      id: id(),
      user_id: USER,
      category: s.category,
      items: s.items,
      sort_order: i,
    })),
    facts,
  };
}

export function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-1",
    source: "seed",
    source_id: "seed-1",
    company: "Cascadia Cloud",
    company_slug: "cascadia-cloud",
    title: "Software Engineer Intern, Backend",
    location: "Vancouver, BC",
    work_mode: "hybrid",
    employment_type: "internship",
    categories: ["software-engineering", "backend"],
    url: "https://example.com/job",
    description_html: null,
    description_text:
      "Build REST services in TypeScript and Python. Ship containerized services with Docker to Kubernetes. PostgreSQL required. Terraform is a bonus.",
    skills: ["typescript", "python", "docker", "kubernetes", "postgresql", "terraform", "rest"],
    ats_keywords: ["backend", "containers"],
    posted_at: "2026-07-01T00:00:00Z",
    dedupe_key: "cascadia-cloud|software-engineer-intern-backend|vancouver-bc|https://example.com/job",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}
