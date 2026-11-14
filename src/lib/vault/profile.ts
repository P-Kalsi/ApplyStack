// Which starter profile "Load my profile" uses: your own applystack.profile.json
// (git-ignored, in the project folder) if it exists, otherwise the sample in
// starter.ts. Server-only (reads a file).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STARTER_EDUCATION,
  STARTER_EXPERIENCES,
  STARTER_GENERAL_FACTS,
  STARTER_PROJECTS,
  STARTER_SKILLS,
  type StarterExperience,
  type StarterFact,
  type StarterProject,
} from "./starter";
import type { SkillCategory } from "../types";

export interface StarterProfile {
  education: typeof STARTER_EDUCATION;
  experiences: StarterExperience[];
  projects: StarterProject[];
  skills: { category: SkillCategory; items: string[] }[];
  facts: StarterFact[];
  /** "file" = your applystack.profile.json, "sample" = the built-in example. */
  source: "file" | "sample";
}

export function profilePath(): string {
  return process.env.APPLYSTACK_PROFILE || join(process.cwd(), "applystack.profile.json");
}

export function loadStarterProfile(): StarterProfile {
  const sample: StarterProfile = {
    education: STARTER_EDUCATION,
    experiences: STARTER_EXPERIENCES,
    projects: STARTER_PROJECTS,
    skills: STARTER_SKILLS,
    facts: STARTER_GENERAL_FACTS,
    source: "sample",
  };
  const path = profilePath();
  if (!existsSync(path)) return sample;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<StarterProfile>;
    if (!raw.education || !Array.isArray(raw.experiences) || !Array.isArray(raw.projects)) {
      throw new Error("missing education, experiences or projects");
    }
    return {
      education: raw.education,
      experiences: raw.experiences,
      projects: raw.projects,
      skills: Array.isArray(raw.skills) ? raw.skills : [],
      facts: Array.isArray(raw.facts) ? raw.facts : [],
      source: "file",
    };
  } catch (err) {
    throw new Error(`${path} couldn't be read (${err instanceof Error ? err.message : String(err)}). Fix the file or remove it to use the sample profile.`);
  }
}
