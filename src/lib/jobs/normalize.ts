// Normalization of external postings into the internal Job model.
// Dependency-free and unit-tested.

import type { EmploymentType, JobCategory, JobSource, WorkMode } from "../types";
import { extractSkills } from "./skills";

export interface NormalizedJob {
  source: JobSource;
  source_id: string | null;
  company: string;
  company_slug: string;
  title: string;
  location: string | null;
  work_mode: WorkMode;
  employment_type: EmploymentType;
  categories: JobCategory[];
  url: string | null;
  description_html: string | null;
  description_text: string | null;
  skills: string[];
  ats_keywords: string[];
  posted_at: string | null;
  dedupe_key: string;
}

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip query strings, fragments, trailing slashes; lowercase host. */
export function canonicalUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host.toLowerCase()}${path}`;
  } catch {
    return raw.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

/** Decode the handful of HTML entities that job boards actually emit. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Convert posting HTML to readable plaintext (lists become "- " lines). */
export function htmlToText(html: string): string {
  let s = html || "";
  s = s.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*li[^>]*>/gi, "\n- ");
  s = s.replace(/<\s*\/\s*(p|div|ul|ol|li|h[1-6]|tr|table|section)\s*>/gi, "\n");
  s = s.replace(/<\s*(p|div|ul|ol|h[1-6]|tr|table|section)[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export function inferWorkMode(location: string | null, text: string | null): WorkMode {
  const loc = (location || "").toLowerCase();
  const body = (text || "").toLowerCase();
  if (/remote/.test(loc)) return "remote";
  if (/hybrid/.test(loc)) return "hybrid";
  if (/on[- ]?site|in[- ]?office|in[- ]?person/.test(loc)) return "onsite";
  if (/fully remote|100% remote|remote[- ]first/.test(body)) return "remote";
  if (/hybrid/.test(body)) return "hybrid";
  if (/on[- ]?site|in[- ]?office|in[- ]?person/.test(body)) return "onsite";
  if (loc.trim().length > 0) return "onsite";
  return "unknown";
}

export function inferEmploymentType(title: string, text?: string | null): EmploymentType {
  const t = (title || "").toLowerCase();
  if (/\bintern(ship)?\b|\bco[- ]?op\b|\bstage\b/.test(t)) return "internship";
  if (/\bnew ?grad\b|\bgraduate\b|\bearly career\b|\bcampus\b/.test(t)) return "newgrad";
  const body = (text || "").toLowerCase();
  if (/\binternship\b|\bco[- ]?op\b/.test(body.slice(0, 600))) return "internship";
  if (/\bfull[- ]?time\b/.test(t)) return "fulltime";
  return "other";
}

const CATEGORY_RULES: { category: JobCategory; re: RegExp }[] = [
  { category: "frontend", re: /front[- ]?end|\breact\b|\bvue\b|\bangular\b|\bui engineer\b|web platform/i },
  { category: "backend", re: /back[- ]?end|\bapi\b|server[- ]side|distributed systems|microservice/i },
  { category: "full-stack", re: /full[- ]?stack/i },
  { category: "cloud", re: /\bcloud\b|\baws\b|\bgcp\b|\bazure\b|infrastructure/i },
  { category: "devops", re: /dev[- ]?ops|platform engineer|build|release|ci\/cd|pipelines/i },
  { category: "sre", re: /\bsre\b|site reliability|reliability engineer|production engineer/i },
  { category: "data", re: /\bdata\b|analytics|\betl\b|\belt\b|warehouse/i },
  { category: "ai-ml", re: /machine learning|\bml\b|\bai\b|deep learning|\bllm\b|artificial intelligence|data scien/i },
  { category: "software-engineering", re: /software|swe|developer|engineer/i },
];

export function classifyCategories(title: string, text?: string | null): JobCategory[] {
  const hay = `${title}\n${(text || "").slice(0, 1500)}`;
  const out: JobCategory[] = [];
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(hay)) out.push(rule.category);
  }
  if (out.length === 0) out.push("software-engineering");
  return out;
}

export function normalizeLocation(loc: string | null | undefined): string | null {
  if (!loc) return null;
  const s = loc.replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

/**
 * Dedupe key from normalized company, title, location, and canonical URL.
 * Two postings with the same key are considered the same job.
 */
export function makeDedupeKey(input: {
  company: string;
  title: string;
  location: string | null;
  url: string | null;
}): string {
  return [
    slugify(input.company),
    slugify(input.title),
    slugify(input.location || ""),
    canonicalUrl(input.url),
  ].join("|");
}

export function buildNormalizedJob(input: {
  source: JobSource;
  source_id?: string | null;
  company: string;
  title: string;
  location?: string | null;
  url?: string | null;
  description_html?: string | null;
  description_text?: string | null;
  posted_at?: string | null;
}): NormalizedJob {
  const title = (input.title || "").replace(/\s+/g, " ").trim();
  const company = (input.company || "").replace(/\s+/g, " ").trim();
  const location = normalizeLocation(input.location);
  const text =
    input.description_text ??
    (input.description_html ? htmlToText(input.description_html) : null);
  const blob = `${title}\n${text || ""}`;
  return {
    source: input.source,
    source_id: input.source_id ?? null,
    company,
    company_slug: slugify(company),
    title,
    location,
    work_mode: inferWorkMode(location, text),
    employment_type: inferEmploymentType(title, text),
    categories: classifyCategories(title, text),
    url: input.url ?? null,
    description_html: input.description_html ?? null,
    description_text: text,
    skills: extractSkills(blob),
    ats_keywords: extractSkills(blob).slice(0, 20),
    posted_at: input.posted_at ?? null,
    dedupe_key: makeDedupeKey({ company, title, location, url: input.url ?? null }),
  };
}

/**
 * Fields to update when a job gets its description later (fetched from the
 * posting link or pasted). Keeps existing categories and only upgrades an
 * unknown employment type.
 */
export function descriptionPatch(
  job: { title: string; location: string | null; categories: string[]; employment_type: EmploymentType },
  html: string | null,
  text: string
) {
  const n = buildNormalizedJob({
    source: "manual",
    company: "-",
    title: job.title,
    location: job.location,
    description_html: html,
    description_text: text.trim(),
  });
  return {
    description_html: html,
    description_text: n.description_text,
    skills: n.skills,
    ats_keywords: n.ats_keywords,
    categories: Array.from(new Set([...job.categories, ...n.categories])),
    work_mode: n.work_mode,
    ...(job.employment_type === "other" ? { employment_type: n.employment_type } : {}),
  };
}
