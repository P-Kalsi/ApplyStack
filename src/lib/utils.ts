/** Join class names, skipping falsy values. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 31) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

/** Title-case a canonical skill for display ("node.js" -> "Node.js"). */
export function displaySkill(s: string): string {
  const special: Record<string, string> = {
    "node.js": "Node.js",
    "next.js": "Next.js",
    typescript: "TypeScript",
    javascript: "JavaScript",
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    mongodb: "MongoDB",
    graphql: "GraphQL",
    fastapi: "FastAPI",
    "ci/cd": "CI/CD",
    aws: "AWS",
    gcp: "GCP",
    sql: "SQL",
    html: "HTML",
    css: "CSS",
    php: "PHP",
    wordpress: "WordPress",
    hubspot: "HubSpot",
    figma: "Figma",
    seo: "SEO",
    api: "API",
    ui: "UI",
    ux: "UX",
    dns: "DNS",
    llm: "LLM",
    rag: "RAG",
    rest: "REST",
    grpc: "gRPC",
    sre: "SRE",
    "webgazer.js": "WebGazer.js",
    "github actions": "GitHub Actions",
    "scikit-learn": "Scikit-learn",
    "gemini api": "Gemini API",
    "openai api": "OpenAI API",
    "anthropic api": "Anthropic API",
    pytorch: "PyTorch",
    tensorflow: "TensorFlow",
    numpy: "NumPy",
    websockets: "WebSockets",
    bigquery: "BigQuery",
    dbt: "dbt",
    pytest: "pytest",
    vite: "Vite",
    "c++": "C++",
    "c#": "C#",
  };
  if (special[s]) return special[s];
  return s
    .split(" ")
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(" ");
}
