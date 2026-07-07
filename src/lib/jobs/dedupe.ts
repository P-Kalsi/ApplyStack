import type { NormalizedJob } from "./normalize";

/**
 * Deduplicate a batch of normalized jobs by dedupe_key.
 * When two postings collide, keep the one with the newer posted_at
 * (unknown dates lose to known dates).
 */
export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const byKey = new Map<string, NormalizedJob>();
  for (const job of jobs) {
    const existing = byKey.get(job.dedupe_key);
    if (!existing) {
      byKey.set(job.dedupe_key, job);
      continue;
    }
    const a = existing.posted_at ? Date.parse(existing.posted_at) : Number.NEGATIVE_INFINITY;
    const b = job.posted_at ? Date.parse(job.posted_at) : Number.NEGATIVE_INFINITY;
    if (b > a) byKey.set(job.dedupe_key, job);
  }
  return Array.from(byKey.values());
}

/** Split a batch into jobs new to the board vs. already-known keys. */
export function splitAgainstExisting(
  jobs: NormalizedJob[],
  existingKeys: Iterable<string>
): { fresh: NormalizedJob[]; known: NormalizedJob[] } {
  const seen = new Set(existingKeys);
  const fresh: NormalizedJob[] = [];
  const known: NormalizedJob[] = [];
  for (const job of jobs) {
    (seen.has(job.dedupe_key) ? known : fresh).push(job);
  }
  return { fresh, known };
}
