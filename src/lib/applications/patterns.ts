// What your applications say about your search: the funnel, response and
// advance rates by channel and by kind of role, requirements you keep
// missing, and applications that have gone quiet. Ideas adapted from
// career-ops' pattern analysis and funnel stats
// (https://github.com/career-ops-hq/career-ops, MIT). Statuses only record
// where an application is now, so "reached" means its current stage or later.
// Pure and unit-tested.

import type { KeywordEvidence } from "../ai/schemas";
import type { ApplicationRow, ApplicationStatus } from "../types";

type App = Pick<ApplicationRow, "id" | "company" | "role" | "status" | "date_applied" | "job_id" | "job_url" | "created_at" | "notes">;
type JobInfo = { source: string; url: string | null };

/** Below this many applications a rate is shown but flagged as too small to read much into. */
export const MIN_SAMPLE = 5;

const APPLIED: ApplicationStatus[] = ["applied", "oa", "interview", "offer", "rejected", "withdrawn"];
const RESPONDED: ApplicationStatus[] = ["oa", "interview", "offer", "rejected"];
const ADVANCED: ApplicationStatus[] = ["oa", "interview", "offer"];

export interface Rate {
  label: string;
  applied: number;
  responded: number;
  advanced: number;
  /** advanced / applied, 0-100 */
  advanceRate: number;
  /** responded / applied, 0-100 */
  responseRate: number;
  small: boolean;
}

export interface Patterns {
  funnel: { label: string; count: number }[];
  total: Rate;
  byChannel: Rate[];
  byRole: Rate[];
  quiet: { id: string; company: string; role: string; days: number }[];
  missing: { keyword: string; count: number }[];
}

const isApplied = (a: App) => APPLIED.includes(a.status) && (a.status !== "withdrawn" || Boolean(a.date_applied));

export function channelOf(app: Pick<App, "job_url">, job?: JobInfo): string {
  if (job?.source === "simplify") return "Simplify list";
  if (job && ["greenhouse", "lever", "ashby"].includes(job.source)) return "Company boards";
  if (job?.source === "adzuna") return "Adzuna";
  const url = job?.url || app.job_url || "";
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "Unknown";
  }
  if (host.includes("linkedin.")) return "LinkedIn";
  if (host.includes("indeed.")) return "Indeed";
  if (host.includes("handshake") || host.includes("joinhandshake")) return "Handshake";
  if (/greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters|workable|icims|oraclecloud/.test(host)) return "Company boards";
  return "Company website";
}

const ROLE_GROUPS: [string, RegExp][] = [
  ["AI / ML", /\b(machine learning|ml|ai|artificial intelligence|deep learning|nlp|llm|computer vision)\b/i],
  ["Data", /\b(data|analytics|analyst|bi|business intelligence)\b/i],
  ["Frontend", /\b(front[- ]?end|ui|web developer|react)\b/i],
  ["Full stack", /\bfull[- ]?stack\b/i],
  ["Backend / platform", /\b(back[- ]?end|platform|infrastructure|systems|distributed)\b/i],
  ["DevOps / cloud", /\b(devops|sre|site reliability|cloud)\b/i],
  ["Mobile", /\b(mobile|ios|android)\b/i],
  ["QA / test", /\b(qa|quality|test|automation)\b/i],
  ["Security", /\b(security|cyber)\b/i],
  ["Research", /\bresearch\b/i],
  ["IT / support", /\b(it|help ?desk|support|technician)\b/i],
  ["Software (general)", /\b(software|developer|engineer|programmer|swe)\b/i],
];

export function roleGroup(title: string): string {
  // Full stack before frontend/backend, so "Full Stack Developer" isn't counted as frontend.
  if (ROLE_GROUPS[3][1].test(title)) return "Full stack";
  return ROLE_GROUPS.find(([, re]) => re.test(title))?.[0] ?? "Other";
}

function rate(label: string, apps: App[]): Rate {
  const applied = apps.filter(isApplied);
  const responded = applied.filter((a) => RESPONDED.includes(a.status)).length;
  const advanced = applied.filter((a) => ADVANCED.includes(a.status)).length;
  const pct = (n: number) => (applied.length ? Math.round((n / applied.length) * 100) : 0);
  return {
    label,
    applied: applied.length,
    responded,
    advanced,
    advanceRate: pct(advanced),
    responseRate: pct(responded),
    small: applied.length < MIN_SAMPLE,
  };
}

function groupRates(apps: App[], key: (a: App) => string): Rate[] {
  const groups = new Map<string, App[]>();
  for (const a of apps.filter(isApplied)) {
    const k = key(a);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  return [...groups.entries()].map(([k, list]) => rate(k, list)).sort((a, b) => b.applied - a.applied || b.advanceRate - a.advanceRate);
}

const DAY = 86_400_000;

export function computePatterns(
  apps: App[],
  jobs: Map<string, JobInfo>,
  evidenceByJob: Map<string, KeywordEvidence[]>,
  today: Date = new Date()
): Patterns {
  const applied = apps.filter(isApplied);
  const reached = (statuses: ApplicationStatus[]) => applied.filter((a) => statuses.includes(a.status)).length;
  const funnel = [
    { label: "Saved or preparing", count: apps.filter((a) => ["saved", "tailoring", "ready"].includes(a.status)).length },
    { label: "Applied", count: applied.length },
    { label: "Assessment or later", count: reached(["oa", "interview", "offer"]) },
    { label: "Interview or later", count: reached(["interview", "offer"]) },
    { label: "Offer", count: reached(["offer"]) },
  ];

  const quiet = apps
    .filter((a) => a.status === "applied")
    .map((a) => {
      const since = Date.parse(`${a.date_applied || a.created_at.slice(0, 10)}T00:00:00Z`);
      return { id: a.id, company: a.company, role: a.role, days: Math.floor((today.getTime() - since) / DAY) };
    })
    .filter((q) => q.days >= 30)
    .sort((a, b) => b.days - a.days);

  // Requirements you were missing, counted once per job you applied to.
  const counts = new Map<string, { keyword: string; count: number }>();
  for (const a of applied) {
    if (!a.job_id) continue;
    const seen = new Set<string>();
    for (const e of evidenceByJob.get(a.job_id) ?? []) {
      if (e.status !== "missing") continue;
      const k = e.keyword.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const cur = counts.get(k) ?? { keyword: e.keyword.trim(), count: 0 };
      cur.count++;
      counts.set(k, cur);
    }
  }
  const missing = [...counts.values()].filter((m) => m.count >= 2).sort((a, b) => b.count - a.count).slice(0, 12);

  return {
    funnel,
    total: rate("All applications", apps),
    byChannel: groupRates(apps, (a) => channelOf(a, a.job_id ? jobs.get(a.job_id) : undefined)),
    byRole: groupRates(apps, (a) => roleGroup(a.role)),
    quiet,
    missing,
  };
}

/** Same company, same title (ignoring term/season and punctuation) — the key repost detection groups on. */
export function repostKey(company: string, title: string): string {
  const t = title
    .toLowerCase()
    .replace(/\((?:[^)]*\b(?:summer|fall|winter|spring|20\d\d)\b[^)]*)\)/g, " ")
    .replace(/\b(summer|fall|winter|spring|autumn)\b|\b20\d\d\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${company.toLowerCase().replace(/[^a-z0-9]+/g, "")}|${t}`;
}
