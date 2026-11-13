// AI step of the job page import: ask the fast model to *locate* the posting's
// parts in copied page text. It never writes the description; see
// src/lib/jobs/page-import.ts for how its answer is checked and used.

import { z } from "zod";
import { callStructured } from "./structured";
import { loadLlmSettings, checkLlmBackend } from "./llm";
import {
  applyLocated,
  basicExtract,
  squash,
  type ExtractedJob,
  type PageCapture,
} from "../jobs/page-import";

const LocatedSchema = z.object({
  company: z.string().max(200).default(""),
  title: z.string().max(300).default(""),
  location: z.string().max(300).default(""),
  description_start: z.string().max(400).default(""),
  description_end: z.string().max(400).default(""),
});

const SYSTEM = [
  "You locate the parts of ONE job posting inside raw text copied from a web page (LinkedIn, Indeed, a company site, etc.).",
  "The text also contains navigation, other job listings, ads and footers. Ignore them.",
  "Rules:",
  "- Copy values exactly as they appear in the text. Never paraphrase, translate, guess or fill gaps.",
  "- If something isn't in the text, return an empty string for it.",
  "- company: the hiring company's name. title: the job title. location: the job's location line (city/province, remote, hybrid).",
  "- description_start: the first 8 to 15 words of the job description body, copied exactly.",
  "- description_end: the last 8 to 15 words of the job description body, copied exactly (before any 'Show less', 'Report job', seniority/employment-type boxes, similar jobs or footer).",
  'Respond with a single JSON object only: {"company":"","title":"","location":"","description_start":"","description_end":""}',
].join("\n");

const MODEL_CHARS = 40_000;

export async function extractJobFromPage(capture: PageCapture): Promise<ExtractedJob> {
  const settings = loadLlmSettings();
  if (settings.provider === "offline") {
    return basicExtract(capture, "AI backend is Offline, so only the basics were filled in. Check every field.");
  }
  const status = await checkLlmBackend();
  if (!status.ok) {
    return basicExtract(capture, `AI backend isn't ready (${status.message}). Only the basics were filled in.`);
  }
  const user = [
    `Page URL: ${capture.url || "(none)"}`,
    `Tab title: ${squash(capture.title) || "(none)"}`,
    "Page text:",
    "<<<",
    capture.text.slice(0, MODEL_CHARS),
    ">>>",
  ].join("\n");
  try {
    const located = await callStructured(LocatedSchema, { system: SYSTEM, user }, "fast");
    return applyLocated(capture, located);
  } catch (err) {
    return basicExtract(capture, `The AI step failed (${err instanceof Error ? err.message : String(err)}). Only the basics were filled in.`);
  }
}
