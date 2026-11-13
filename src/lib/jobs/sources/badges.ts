// Display names for a job's `source` (safe to import from client components).

export const SOURCE_BADGES: Record<string, string> = {
  simplify: "Simplify",
  adzuna: "Adzuna",
  greenhouse: "Greenhouse",
  lever: "Lever",
  manual: "Added by you",
  seed: "Sample",
};

export function sourceBadge(source: string): string {
  return SOURCE_BADGES[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}
