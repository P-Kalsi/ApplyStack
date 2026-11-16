// Company source registry: which Greenhouse boards and Lever sites to ingest.
// Sources come from two places, merged: environment variables (bootstrap)
// and the user-managed job_sources table (Settings -> Job sources).

import type { JobSourceRow } from "../types";

export interface CompanySource {
  kind: "greenhouse" | "lever" | "ashby";
  token: string;
  label?: string;
}

function parseList(env: string | undefined): string[] {
  return (env || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function sourcesFromEnv(env: {
  GREENHOUSE_BOARDS?: string;
  LEVER_SITES?: string;
  ASHBY_BOARDS?: string;
}): CompanySource[] {
  return [
    ...parseList(env.GREENHOUSE_BOARDS).map(
      (token): CompanySource => ({ kind: "greenhouse", token })
    ),
    ...parseList(env.LEVER_SITES).map((token): CompanySource => ({ kind: "lever", token })),
    ...parseList(env.ASHBY_BOARDS).map((token): CompanySource => ({ kind: "ashby", token })),
  ];
}

export function mergeSources(
  envSources: CompanySource[],
  dbSources: Pick<JobSourceRow, "kind" | "token" | "label" | "enabled">[]
): CompanySource[] {
  const out = new Map<string, CompanySource>();
  for (const s of envSources) {
    out.set(`${s.kind}:${s.token.toLowerCase()}`, s);
  }
  for (const s of dbSources) {
    const key = `${s.kind}:${s.token.toLowerCase()}`;
    if (!s.enabled) {
      out.delete(key);
      continue;
    }
    out.set(key, { kind: s.kind, token: s.token, label: s.label ?? undefined });
  }
  return Array.from(out.values());
}
