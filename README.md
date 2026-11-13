# ApplyStack

Personal internship discovery + truthful AI resume tailoring, built for a CS student's real
application workflow.

- **Discover** — a dense internship board fed by the public Greenhouse Job Board and Lever
  Postings APIs (plus realistic seed data so it works with zero configuration), with per-job
  match scores computed against your own profile.
- **Career Vault** — one structured source of truth: education, experiences, projects, skills,
  and an atomic **fact bank**. The AI can only ever use what lives here.
- **Master resume** — upload your Word (`.docx`) resume or paste LaTeX. Template, content, and
  facts are kept separate; tailoring edits bullet text and skills lines only and gives you back
  the same file format with every font, tab stop, heading and date untouched.
- **One-click tailoring** — analyze a job, rank your verified facts, rewrite/reorder/remove
  bullets, and review every change side-by-side with provenance (reason, cited facts,
  targeted keywords) before accepting.
- **Applications** — kanban + table pipeline from Saved through Offer, with CSV import from a
  spreadsheet tracker (App Date, Org, Job Title, Posting, Site, Interview, Decision…).

### The truthfulness contract

ApplyStack never invents experience, technologies, metrics, dates, employers, degrees, or
certifications. This is enforced in three layers:

1. **Context control** — the model only receives approved Career Vault facts selected by a
   deterministic relevance filter.
2. **Schema validation** — every AI response is parsed with Zod (one retry on malformed output).
3. **The guard** (`src/lib/ai/guard.ts`) — deterministic post-validation: rewrites that introduce
   technologies or numbers unsupported by the original bullet or a cited approved fact are
   rejected outright; match reports can never mark a vault-missing keyword as "verified";
   changes without fact support are flagged unsafe and excluded from "Accept All Safe Changes".

Missing qualifications are always shown as missing — never papered over.

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Auth + RLS) ·
Anthropic API (model configurable via `ANTHROPIC_MODEL`) · Zod · node:test.

## Try it without any setup (demo mode)

```bash
npm install
echo APPLYSTACK_DEMO=1 > .env.local
npm run dev        # http://localhost:3000
```

Demo mode swaps Supabase for a local in-memory database (saved to `.demo-data.json`) with one
user and no login, so you can click through every feature: load your profile, upload your Word
resume, tailor, review, download, and import applications. Delete `.demo-data.json` to start
fresh. Never enable demo mode on a deployed site; it has no authentication.

## Setup

### 1. Install

```bash
npm install
```

Requires Node 20+ (Node 22 recommended).

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In the SQL editor, run in order:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_docx_resumes.sql`
   - `supabase/seed.sql` (optional but recommended — seeds 14 realistic internships)
3. (Optional, for local dev convenience) Authentication → Providers → Email → disable
   "Confirm email" so signup works without an SMTP setup.

Or with the Supabase CLI: `supabase db push` then `psql < supabase/seed.sql`.

### 3. Environment

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `ANTHROPIC_API_KEY` | no | Enables model-based analysis/tailoring. Without it the app runs fully on the deterministic mock engine. |
| `ANTHROPIC_MODEL` | no | Model name (default `claude-sonnet-4-5`). Never hardcoded. |
| `GREENHOUSE_BOARDS` | no | Comma-separated Greenhouse board tokens to ingest |
| `LEVER_SITES` | no | Comma-separated Lever site names to ingest |

Job sources can also be managed per-user in **Settings → Job sources**.

### 4. Run

```bash
npm run dev        # http://localhost:3000
```

Sign up, then:

1. **Career Vault → Overview → Load my profile.** Loads the vault defined in
   `src/lib/vault/starter.ts` (built from the owner's master profile and resumes). Facts with
   conflicting or unconfirmed details arrive as *pending*; approve or reject them in Fact Bank.
2. **Career Vault → Master Resume → Word (.docx) → Set as master.** Pick the resume you'd send by
   default. Tailoring can rewrite, reorder and trim its bullets and skills lines, but cannot add
   projects that aren't in it, so choose one with your strongest projects.
3. **Applications → Import CSV** to bring in an existing spreadsheet tracker.

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run start        # serve the production build
npm run lint         # eslint (next/core-web-vitals + next/typescript)
npm run typecheck    # tsc --noEmit over the whole app
npm test             # compiles tests with tsc, runs them with node --test (no test framework dep)
```

## How tailoring works (pipeline)

1. **Analyze** the job description → structured JSON (`JobAnalysisSchema`).
2. **Select** relevant approved facts deterministically (`matching/relevance.ts`) — the model
   never sees irrelevant vault content.
3. **Rank** projects/experiences against the job.
4. **Propose** bullet-level changes (model, or deterministic mock without an API key).
5. **Guard** every change (`ai/guard.ts`): unknown blocks, invented tech, invented numbers → rejected.
6. **Store** a `resume_version` + one `resume_change` row per proposal with full provenance:
   original text, tailored text, reason, supporting fact ids, targeted keywords, safety flag.
7. **Review** side-by-side; accept / reject / edit / restore each change. The final LaTeX is the
   master with only your accepted changes applied — structure byte-identical everywhere else
   (round-trip is unit-tested).

Versions support rename, duplicate, delete, restore (reset review), download in the master's
format (`.docx` rebuilt from your original file, or `.tex`), and a print/PDF content view. For a
Word master, open the downloaded `.docx` and use Save as PDF for the exact layout. Server-side LaTeX compilation is intentionally out of scope for the
MVP; the parsing/serialization layer (`resume/latex.ts`) is isolated so a compile step can be
added behind it later.

## Architecture notes

```
src/lib/
  jobs/        adapters (greenhouse, lever) → NormalizedJob; normalize, dedupe, registry, skills lexicon
  matching/    deterministic match scores + relevance ranking (the honest baseline)
  resume/      LaTeX block parser/serializer, change application, fact extraction, list reordering
  ai/          prompts, zod schemas, structured-call runner (1 retry), mock engine, truthfulness guard
  db/          supabase data access (vault snapshot/seeding, job listing/ingestion)
  supabase/    browser/server clients + auth middleware
```

- Job sources are isolated behind adapters that map external postings into one internal
  `NormalizedJob`; add a source by writing one adapter + registering tokens.
- Jobs are deduplicated on normalized company + title + location + canonical URL.
- Row-level security: every user-scoped table enforces `auth.uid() = user_id` for all
  operations; the shared `jobs` table is readable by any signed-in user and carries no user data.
- The core logic modules are dependency-free on purpose: the test suite runs with plain
  `tsc` + `node --test`, no test framework required.

## Tests

`npm test` covers: job normalization (incl. both adapters), deduplication, career fact
filtering/relevance ranking, match score calculation, AI schema validation, JSON extraction,
the truthfulness guard (invented tech/metrics rejection, match-report sanitization), LaTeX
round-tripping, resume change application (accept/reject/edit/remove), fact extraction, and
the full mock tailoring pipeline.

## Word resumes: how it works

A `.docx` is a ZIP of XML parts. ApplyStack stores the original file once (`template_base64`) and
parses only `word/document.xml` (`src/lib/resume/docx.ts`):

- Paragraphs formatted as Word bullets inside a section become editable bullets.
- "Label: a, b, c" lines in a Skills/Additional section become editable skills lines (the label
  stays exactly as is; only the values can be reordered).
- Everything else (name, contact line, section headings, job/project lines with right-aligned
  dates, page setup) is copied byte-for-byte.

A rewritten bullet keeps its paragraph properties (bullet, indent, tabs) and the run formatting of
its first text run. Downloads rebuild the archive with a dependency-free ZIP writer
(`src/lib/docx/zip.ts`) that passes fonts, styles and numbering through unchanged. The guard also
flags rewrites much longer than the original as unsafe, to protect one-page resumes.

## Known limitations

- Tailoring cannot add a project or job that isn't already in the master resume (it only
  rewrites, reorders or removes). Keep the master as your most complete one-pager.
- Mixed formatting inside a single bullet (e.g. one bold word) is flattened to the bullet's first
  run style when that bullet is rewritten. Untouched bullets keep everything.
- The `.docx` template is stored as base64 in Postgres (a few MB per master). Fine for one user;
  move it to Supabase Storage if this ever serves many users.
- PDF resume upload is not supported (upload the `.docx` or `.tex`).
- Print view renders resume *content*; exact layout comes from the downloaded file.
- Entry-level reordering of whole projects inside the LaTeX is conservative: tailoring
  rewrites/removes/reorders bullets and skill lists but does not physically move
  `\resumeSubheading` blocks (kept safe by design; the diff review explains selection instead).
