// Demo mode: an in-memory stand-in for the Supabase client.
//
// Enabled with APPLYSTACK_DEMO=1. Lets you run and try ApplyStack with no
// Supabase project or keys: one local demo user, the seeded internships, and
// data persisted to .demo-data.json in the project folder. It implements only
// the subset of the supabase-js query builder ApplyStack uses.
//
// Never enable this on a deployed site: there is no authentication.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_JOBS } from "./seed-jobs";

export const DEMO_USER = { id: "00000000-0000-4000-8000-000000000001", email: "demo@applystack.local" };

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Where demo data is saved (APPLYSTACK_DEMO_FILE overrides, used by tests). */
const dataFile = () => process.env.APPLYSTACK_DEMO_FILE || join(process.cwd(), ".demo-data.json");

const DEFAULTS: Record<string, Row> = {
  career_education: { sort_order: 0, coursework: [] },
  career_experiences: { sort_order: 0, is_current: false },
  career_projects: { sort_order: 0, technologies: [], links: [] },
  career_skills: { sort_order: 0, items: [] },
  career_facts: { category: "general", keywords: [], source: "manual", status: "approved", experience_id: null, project_id: null },
  master_resumes: { title: "Master resume", format: "latex", is_active: true, template_base64: null, file_name: null },
  jobs: { work_mode: "unknown", employment_type: "other", categories: [], skills: [], ats_keywords: [], is_open: true },
  job_analyses: { engine: "offline" },
  resume_versions: { format: "latex", status: "draft", keywords_added: [], skills_emphasized: [], still_missing: [] },
  resume_changes: { change_type: "rewrite", fact_ids: [], keywords: [], is_safe: true, status: "proposed" },
  applications: { status: "saved", sort_order: 0 },
  job_sources: { enabled: true },
};

// child table -> [fk column, parent table, on delete]
const FOREIGN_KEYS: Record<string, [string, string, "cascade" | "set null"][]> = {
  career_facts: [
    ["experience_id", "career_experiences", "cascade"],
    ["project_id", "career_projects", "cascade"],
  ],
  saved_jobs: [["job_id", "jobs", "cascade"]],
  job_analyses: [["job_id", "jobs", "cascade"]],
  resume_versions: [
    ["master_resume_id", "master_resumes", "set null"],
    ["job_id", "jobs", "set null"],
  ],
  resume_changes: [["resume_version_id", "resume_versions", "cascade"]],
  applications: [
    ["job_id", "jobs", "set null"],
    ["resume_version_id", "resume_versions", "set null"],
  ],
};

function seed(): Tables {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    profiles: [{ id: DEMO_USER.id, email: DEMO_USER.email, created_at: iso(now), updated_at: iso(now) }],
    jobs: DEMO_JOBS.map((j) => {
      const { posted_days_ago, ...rest } = j;
      return {
        ...rest,
        categories: [...rest.categories],
        skills: [...rest.skills],
        ats_keywords: [...rest.ats_keywords],
        id: randomUUID(),
        description_html: null,
        posted_at: iso(now - posted_days_ago * 86_400_000),
        created_at: iso(now),
        updated_at: iso(now),
      };
    }),
  };
}

const store = globalThis as unknown as { __applystackDemo?: Tables };

function db(): Tables {
  if (!store.__applystackDemo) {
    store.__applystackDemo = existsSync(dataFile()) ? (JSON.parse(readFileSync(dataFile(), "utf8")) as Tables) : seed();
    // Rows saved by older versions may lack newer columns: fill their defaults.
    for (const [name, defaults] of Object.entries(DEFAULTS)) {
      for (const row of store.__applystackDemo[name] ?? []) {
        for (const [k, v] of Object.entries(defaults)) if (!(k in row)) row[k] = Array.isArray(v) ? [...v] : v;
      }
    }
  }
  return store.__applystackDemo;
}

function persist() {
  try {
    writeFileSync(dataFile(), JSON.stringify(db()));
  } catch {
    // read-only filesystem: keep data in memory only
  }
}

function table(name: string): Row[] {
  const t = db();
  if (!t[name]) t[name] = [];
  return t[name];
}

function cascadeDelete(name: string, ids: Set<unknown>) {
  for (const [child, fks] of Object.entries(FOREIGN_KEYS)) {
    for (const [col, parent, mode] of fks) {
      if (parent !== name) continue;
      const rows = table(child);
      if (mode === "set null") {
        for (const r of rows) if (ids.has(r[col])) r[col] = null;
      } else {
        const doomed = new Set(rows.filter((r) => ids.has(r[col])).map((r) => r.id));
        if (doomed.size === 0) continue;
        db()[child] = rows.filter((r) => !doomed.has(r.id));
        cascadeDelete(child, doomed);
      }
    }
  }
}

type Filter = (r: Row) => boolean;

function likeToRegex(pattern: string): RegExp {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${esc}$`, "is");
}

function parseOr(expr: string): Filter {
  const parts = expr.split(",").map((p) => {
    const [col, op, ...rest] = p.split(".");
    const value = rest.join(".");
    if (op === "ilike") {
      const re = likeToRegex(value);
      return (r: Row) => re.test(String(r[col] ?? ""));
    }
    if (op === "eq") return (r: Row) => String(r[col]) === value;
    throw new Error(`demo client: unsupported or() operator ${op}`);
  });
  return (r) => parts.some((f) => f(r));
}

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private max: number | null = null;
  private columns: string | null = null;
  private countMode = false;
  private head = false;
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private conflict: string[] = [];
  private ignoreDuplicates = false;
  private returning = false;
  private singleMode: "one" | "maybe" | null = null;

  constructor(private name: string) {}

  select(columns = "*", opts?: { count?: string; head?: boolean }) {
    if (this.mode === "select") {
      this.columns = columns;
      this.countMode = opts?.count === "exact";
      this.head = Boolean(opts?.head);
    } else {
      this.returning = true;
      this.columns = columns;
    }
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; count?: string; ignoreDuplicates?: boolean }) {
    this.mode = "upsert";
    this.ignoreDuplicates = Boolean(opts?.ignoreDuplicates);
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = (opts?.onConflict ?? "id").split(",").map((s) => s.trim());
    this.countMode = opts?.count === "exact";
    return this;
  }
  update(patch: Row, opts?: { count?: string }) {
    this.mode = "update";
    this.patch = patch;
    this.countMode = opts?.count === "exact";
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  is(col: string, value: null | boolean) {
    this.filters.push((r) => (value === null ? r[col] == null : r[col] === value));
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  ilike(col: string, pattern: string) {
    const re = likeToRegex(pattern);
    this.filters.push((r) => re.test(String(r[col] ?? "")));
    return this;
  }
  gte(col: string, value: string | number) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && (r[col] as string | number) >= value);
    return this;
  }
  overlaps(col: string, values: unknown[]) {
    this.filters.push((r) => Array.isArray(r[col]) && (r[col] as unknown[]).some((v) => values.includes(v)));
    return this;
  }
  or(expr: string) {
    this.filters.push(parseOr(expr));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst ?? false });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    let result: Result;
    try {
      result = this.run();
    } catch (err) {
      result = { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }

  private matches(): Row[] {
    return table(this.name).filter((r) => this.filters.every((f) => f(r)));
  }

  private project(rows: Row[]): Row[] {
    const cols = (this.columns ?? "*").trim();
    if (cols === "*") return rows.map((r) => ({ ...r }));
    const parts = cols.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean);
    return rows.map((r) => {
      const out: Row = {};
      for (const part of parts) {
        const embed = part.match(/^(\w+)\((.*)\)$/);
        if (embed) {
          const related = embed[1];
          const fk = `${related.replace(/s$/, "")}_id`;
          out[related] = table(related).find((x) => x.id === r[fk]) ?? null;
        } else if (part === "*") {
          Object.assign(out, r);
        } else {
          out[part] = r[part];
        }
      }
      return out;
    });
  }

  private finish(rows: Row[], count?: number): Result {
    if (this.singleMode) {
      if (rows.length === 0) {
        return this.singleMode === "maybe"
          ? { data: null, error: null }
          : { data: null, error: { message: "No rows found", code: "PGRST116" } };
      }
      return { data: rows[0], error: null, count };
    }
    return { data: rows, error: null, count };
  }

  private stamp(row: Row, isNew: boolean): Row {
    const now = new Date().toISOString();
    return isNew
      ? { id: randomUUID(), created_at: now, updated_at: now, ...(DEFAULTS[this.name] ?? {}), ...row }
      : { ...row, updated_at: now };
  }

  private run(): Result {
    if (this.mode === "select") {
      let rows = this.matches();
      for (const o of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const av = a[o.col] as string | number | null | undefined;
          const bv = b[o.col] as string | number | null | undefined;
          if (av == null && bv == null) return 0;
          if (av == null) return o.nullsFirst ? -1 : 1;
          if (bv == null) return o.nullsFirst ? 1 : -1;
          return (av < bv ? -1 : av > bv ? 1 : 0) * (o.asc ? 1 : -1);
        });
      }
      const count = rows.length;
      if (this.max !== null) rows = rows.slice(0, this.max);
      if (this.head) return { data: null, error: null, count };
      return this.finish(this.project(rows), this.countMode ? count : undefined);
    }

    if (this.mode === "insert") {
      const created = this.payload.map((r) => this.stamp(r, true));
      table(this.name).push(...created);
      persist();
      return this.finish(this.returning ? this.project(created) : []);
    }

    if (this.mode === "upsert") {
      const out: Row[] = [];
      for (const r of this.payload) {
        const existing = table(this.name).find((x) => this.conflict.every((c) => x[c] === r[c]));
        if (existing) {
          if (this.ignoreDuplicates) continue; // ON CONFLICT DO NOTHING
          Object.assign(existing, this.stamp({ ...r }, false));
          out.push(existing);
        } else {
          const created = this.stamp(r, true);
          table(this.name).push(created);
          out.push(created);
        }
      }
      persist();
      return { ...this.finish(this.returning ? this.project(out) : []), count: out.length };
    }

    if (this.mode === "update") {
      const rows = this.matches();
      for (const r of rows) Object.assign(r, this.stamp({ ...this.patch }, false));
      persist();
      return { ...this.finish(this.returning ? this.project(rows) : []), count: rows.length };
    }

    // delete
    const doomed = new Set(this.matches().map((r) => r.id));
    db()[this.name] = table(this.name).filter((r) => !doomed.has(r.id));
    cascadeDelete(this.name, doomed);
    persist();
    return { data: null, error: null, count: doomed.size };
  }
}

export function createDemoClient() {
  return {
    from: (name: string) => new Query(name),
    auth: {
      getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
      signInWithPassword: async () => ({ data: { user: DEMO_USER, session: {} }, error: null }),
      signUp: async () => ({ data: { user: DEMO_USER, session: {} }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };
}

export function demoEnabled(): boolean {
  return process.env.APPLYSTACK_DEMO === "1";
}
