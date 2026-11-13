// Canonical skill lexicon + deterministic skill extraction from free text.
// Dependency-free on purpose (unit-tested with node --test).

interface SkillDef {
  /** Canonical display name, lowercase. */
  name: string;
  /** Extra aliases (lowercase). The name itself always matches. */
  aliases?: string[];
}

export const SKILL_LEXICON: SkillDef[] = [
  // Languages
  { name: "typescript", aliases: ["ts"] },
  { name: "javascript", aliases: ["js", "es6"] },
  { name: "python" },
  { name: "java" },
  { name: "go", aliases: ["golang"] },
  { name: "c++", aliases: ["cpp"] },
  { name: "c#", aliases: ["csharp", ".net"] },
  { name: "c" },
  { name: "rust" },
  { name: "ruby" },
  { name: "kotlin" },
  { name: "swift" },
  { name: "php" },
  { name: "scala" },
  { name: "r" },
  { name: "sql" },
  { name: "bash", aliases: ["shell scripting", "shell"] },
  { name: "html" },
  { name: "css" },
  { name: "latex" },
  // Frontend frameworks / libraries
  { name: "react", aliases: ["react.js", "reactjs"] },
  { name: "next.js", aliases: ["nextjs", "next js"] },
  { name: "vue", aliases: ["vue.js", "vuejs"] },
  { name: "angular" },
  { name: "svelte" },
  { name: "tailwind", aliases: ["tailwindcss", "tailwind css"] },
  { name: "vite" },
  { name: "redux" },
  { name: "webgazer.js", aliases: ["webgazer"] },
  { name: "webgl" },
  { name: "websockets", aliases: ["websocket"] },
  // Backend frameworks
  { name: "node.js", aliases: ["nodejs", "node js", "node"] },
  { name: "express", aliases: ["express.js", "expressjs"] },
  { name: "fastapi" },
  { name: "flask" },
  { name: "django" },
  { name: "spring", aliases: ["spring boot"] },
  { name: "rails", aliases: ["ruby on rails"] },
  { name: "graphql" },
  { name: "grpc" },
  { name: "rest", aliases: ["rest api", "rest apis", "restful"] },
  // Data / ML
  { name: "pandas" },
  { name: "numpy" },
  { name: "scikit-learn", aliases: ["sklearn", "scikit learn"] },
  { name: "pytorch" },
  { name: "tensorflow" },
  { name: "machine learning", aliases: ["ml"] },
  { name: "llm", aliases: ["llms", "large language model", "large language models"] },
  { name: "rag", aliases: ["retrieval-augmented generation", "retrieval augmented generation"] },
  { name: "embeddings", aliases: ["vector search", "vector database", "vector databases"] },
  { name: "gemini api", aliases: ["gemini"] },
  { name: "openai api", aliases: ["openai"] },
  { name: "anthropic api", aliases: ["claude api"] },
  { name: "airflow" },
  { name: "dbt" },
  { name: "spark", aliases: ["apache spark", "pyspark"] },
  { name: "kafka", aliases: ["apache kafka"] },
  { name: "bigquery" },
  // Databases
  { name: "postgresql", aliases: ["postgres"] },
  { name: "mysql" },
  { name: "sqlite" },
  { name: "mongodb", aliases: ["mongo"] },
  { name: "redis" },
  { name: "elasticsearch" },
  { name: "supabase" },
  { name: "firebase" },
  // Cloud / infra
  { name: "aws", aliases: ["amazon web services"] },
  { name: "gcp", aliases: ["google cloud", "google cloud platform"] },
  { name: "azure" },
  { name: "docker", aliases: ["containerized", "containers", "containerization"] },
  { name: "kubernetes", aliases: ["k8s"] },
  { name: "terraform" },
  { name: "ansible" },
  { name: "prometheus" },
  { name: "grafana" },
  { name: "nginx" },
  { name: "linux" },
  { name: "dns" },
  { name: "networking" },
  { name: "ci/cd", aliases: ["cicd", "ci cd", "continuous integration", "continuous deployment"] },
  { name: "github actions" },
  { name: "git" },
  { name: "wordpress", aliases: ["word press"] },
  { name: "hubspot", aliases: ["hub spot"] },
  { name: "figma" },
  { name: "google analytics", aliases: ["ga4", "google analytics 4"] },
  { name: "playwright" },
  { name: "jest" },
  { name: "pytest" },
  { name: "vitest" },
  { name: "mocha" },
];

const CANONICAL_BY_ALIAS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const def of SKILL_LEXICON) {
    m.set(def.name, def.name);
    for (const a of def.aliases ?? []) m.set(a, def.name);
  }
  return m;
})();

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-ish boundary match that tolerates symbols like "c++", "node.js", "ci/cd". */
function makeMatcher(alias: string): RegExp {
  const body = escapeRegex(alias);
  // Boundaries: not preceded/followed by a letter, digit, +, or #, so "c"
  // does not match inside "css" and "go" does not match inside "google".
  return new RegExp(`(?<![a-z0-9+#])${body}(?![a-z0-9+#])`, "i");
}

const MATCHERS: { alias: string; canonical: string; re: RegExp; caseSensitive: boolean }[] = Array.from(
  CANONICAL_BY_ALIAS.entries()
).map(([alias, canonical]) => {
  // Single-letter languages (C, R) only count when written as a capital
  // letter, so "Pearson r" or "a c b" never become programming languages.
  if (alias.length === 1) {
    const up = escapeRegex(alias.toUpperCase());
    return { alias, canonical, re: new RegExp(`(?<![A-Za-z0-9+#])${up}(?![A-Za-z0-9+#])`), caseSensitive: true };
  }
  return { alias, canonical, re: makeMatcher(alias), caseSensitive: false };
});

/** Canonicalize one skill token, e.g. "Postgres" -> "postgresql". */
export function canonicalSkill(raw: string): string {
  const t = raw.trim().toLowerCase();
  return CANONICAL_BY_ALIAS.get(t) ?? t;
}

/** Extract canonical skills mentioned anywhere in a blob of text. */
export function extractSkills(text: string): string[] {
  const raw = text || "";
  const lower = raw.toLowerCase();
  const found = new Set<string>();
  for (const { re, canonical, caseSensitive } of MATCHERS) {
    if (re.test(caseSensitive ? raw : lower)) found.add(canonical);
  }
  return Array.from(found).sort();
}

/** Canonicalize + dedupe a list of skill strings. */
export function canonicalizeSkillList(items: string[]): string[] {
  const out = new Set<string>();
  for (const s of items) {
    const c = canonicalSkill(s);
    if (c) out.add(c);
  }
  return Array.from(out);
}

const SKILL_GROUP_HINTS: Record<string, string[]> = {
  languages: ["typescript", "javascript", "python", "java", "go", "c++", "c#", "c", "rust", "ruby", "kotlin", "swift", "php", "scala", "r", "sql", "bash", "html", "css", "latex"],
  frameworks: ["react", "next.js", "vue", "angular", "svelte", "tailwind", "django", "flask", "fastapi", "spring", "express", "rails", "node.js", "wordpress", ".net"],
  databases: ["postgresql", "mysql", "mongodb", "redis", "sqlite", "supabase", "dynamodb", "firebase"],
  cloud: ["aws", "gcp", "azure", "vercel", "netlify", "cloudflare"],
  infrastructure: ["docker", "kubernetes", "terraform", "ansible", "ci/cd", "github actions", "linux"],
  developer_tools: ["git", "github", "jira", "figma", "postman", "vs code", "hubspot", "google analytics"],
};

/** Which Career Vault skill group a skill most likely belongs to. */
export function guessSkillGroup(skill: string): string {
  const s = canonicalSkill(skill);
  for (const [group, names] of Object.entries(SKILL_GROUP_HINTS)) if (names.includes(s)) return group;
  return "other";
}
