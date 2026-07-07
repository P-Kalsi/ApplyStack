// Sample Career Vault profile, used when you haven't provided your own.
//
// Your real profile lives in applystack.profile.json in the project folder
// (git-ignored, so it never leaves your computer); see src/lib/vault/profile.ts.
// "Career Vault -> Load my profile" loads that file if it exists, otherwise this
// fictional sample so you can try ApplyStack. Every record is editable in the
// UI after loading, and facts marked "pending" are never used by the AI until
// you approve them.

import type { FactCategory, FactStatus, SkillCategory } from "../types";

export interface StarterFact {
  text: string;
  category: FactCategory;
  status?: FactStatus; // default "approved"
}

export interface StarterProject {
  name: string;
  technologies: string[];
  start_date: string;
  end_date: string;
  description: string;
  links: string[];
  facts: StarterFact[];
}

export interface StarterExperience {
  company: string;
  role: string;
  location: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  summary: string;
  facts: StarterFact[];
}

export const STARTER_EDUCATION = {
  school: "Example University",
  degree: "Bachelor of Science",
  major: "Computer Science",
  location: "Vancouver, BC",
  start_date: "Sep 2024",
  expected_graduation: "May 2028",
  coursework: ["Data Structures", "Software Construction", "Databases"],
};

export const STARTER_EXPERIENCES: StarterExperience[] = [
  {
    company: "Campus Tech Help Desk",
    role: "Student Developer (part-time)",
    location: "Vancouver, BC",
    start_date: "Sep 2025",
    end_date: "",
    is_current: true,
    summary: "Builds small internal tools for the help desk team.",
    facts: [
      {
        text: "Built a ticket triage dashboard in React and TypeScript used by a 6-person help desk team.",
        category: "achievement",
      },
      {
        text: "Wrote Python scripts that export weekly ticket counts from a PostgreSQL database to CSV.",
        category: "general",
      },
    ],
  },
];

export const STARTER_PROJECTS: StarterProject[] = [
  {
    name: "StudyBuddy",
    technologies: ["React", "TypeScript", "FastAPI", "Python", "PostgreSQL", "Docker"],
    start_date: "Jan 2026",
    end_date: "Apr 2026",
    description: "A course study-group matcher (sample project).",
    links: [],
    facts: [
      {
        text: "Built StudyBuddy, a full-stack study-group matcher with a React/TypeScript front end and a FastAPI backend.",
        category: "general",
      },
      { text: "Wrote 40+ pytest tests for the StudyBuddy API.", category: "metric" },
      {
        text: "Containerized StudyBuddy with Docker and deployed it for a class of about 120 students.",
        category: "achievement",
        status: "pending",
      },
    ],
  },
];

export const STARTER_SKILLS: { category: SkillCategory; items: string[] }[] = [
  { category: "languages", items: ["Python", "TypeScript", "JavaScript", "SQL", "Java"] },
  { category: "frameworks", items: ["React", "FastAPI", "Node.js"] },
  { category: "databases", items: ["PostgreSQL"] },
  { category: "infrastructure", items: ["Docker"] },
  { category: "developer_tools", items: ["Git", "GitHub", "pytest"] },
];

export const STARTER_GENERAL_FACTS: StarterFact[] = [
  {
    text: "Example University Bachelor of Science in Computer Science, expected graduation May 2028.",
    category: "education",
  },
];
