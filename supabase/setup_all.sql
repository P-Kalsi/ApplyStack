-- ApplyStack: full database setup. Paste this whole file into Supabase → SQL Editor → Run.
-- Generated from migrations 0001-0006 (same content, in order). Run it ONCE, on a new, empty project.
-- Sample jobs are NOT included; they live in seed.sql and are fictional, so skip them for real use.


-- ===== migrations/0001_schema.sql =====

-- ApplyStack schema
-- Run in the Supabase SQL editor (or `supabase db push`) before first use.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  location text,
  website text,
  github text,
  linkedin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Career Vault
-- ---------------------------------------------------------------------------
create table public.career_education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  school text not null,
  degree text,
  major text,
  location text,
  start_date text,
  expected_graduation text,
  gpa text,
  coursework text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.career_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company text not null,
  role text not null,
  location text,
  start_date text,
  end_date text,
  is_current boolean not null default false,
  summary text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.career_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  technologies text[] not null default '{}',
  start_date text,
  end_date text,
  description text,
  links text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.career_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in (
    'languages','frameworks','libraries','databases','cloud',
    'infrastructure','developer_tools','operating_systems','other'
  )),
  items text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

-- Atomic, truthful claims. The AI may only draw on approved facts.
create table public.career_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  experience_id uuid references public.career_experiences (id) on delete cascade,
  project_id uuid references public.career_projects (id) on delete cascade,
  fact_text text not null,
  category text not null default 'general' check (category in (
    'general','skill','achievement','metric','education','additional'
  )),
  keywords text[] not null default '{}',
  source text not null default 'manual' check (source in ('manual','extracted','seed')),
  status text not null default 'approved' check (status in ('approved','pending','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index career_education_user_idx on public.career_education (user_id);
create index career_experiences_user_idx on public.career_experiences (user_id);
create index career_projects_user_idx on public.career_projects (user_id);
create index career_skills_user_idx on public.career_skills (user_id);
create index career_facts_user_idx on public.career_facts (user_id, status);
create index career_facts_experience_idx on public.career_facts (experience_id);
create index career_facts_project_idx on public.career_facts (project_id);

create trigger career_education_updated_at before update on public.career_education for each row execute function public.set_updated_at();
create trigger career_experiences_updated_at before update on public.career_experiences for each row execute function public.set_updated_at();
create trigger career_projects_updated_at before update on public.career_projects for each row execute function public.set_updated_at();
create trigger career_skills_updated_at before update on public.career_skills for each row execute function public.set_updated_at();
create trigger career_facts_updated_at before update on public.career_facts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Resumes
-- ---------------------------------------------------------------------------
create table public.master_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Master resume',
  format text not null default 'latex' check (format in ('latex','plain')),
  content text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index master_resumes_user_idx on public.master_resumes (user_id, is_active);
create trigger master_resumes_updated_at before update on public.master_resumes for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Jobs (shared board; ingested from adapters or seeded)
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('greenhouse','lever','seed','manual')),
  source_id text,
  company text not null,
  company_slug text not null,
  title text not null,
  location text,
  work_mode text not null default 'unknown' check (work_mode in ('remote','hybrid','onsite','unknown')),
  employment_type text not null default 'other' check (employment_type in ('internship','newgrad','fulltime','other')),
  categories text[] not null default '{}',
  url text,
  description_html text,
  description_text text,
  skills text[] not null default '{}',
  ats_keywords text[] not null default '{}',
  posted_at timestamptz,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_posted_idx on public.jobs (posted_at desc nulls last);
create index jobs_type_idx on public.jobs (employment_type);
create index jobs_company_idx on public.jobs (company_slug);
create index jobs_skills_idx on public.jobs using gin (skills);
create index jobs_categories_idx on public.jobs using gin (categories);
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();

create table public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index saved_jobs_user_idx on public.saved_jobs (user_id);

create table public.job_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  analysis jsonb not null,
  match_report jsonb,
  engine text not null default 'mock' check (engine in ('anthropic','mock')),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index job_analyses_user_idx on public.job_analyses (user_id, job_id);
create trigger job_analyses_updated_at before update on public.job_analyses for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Resume versions + change provenance
-- ---------------------------------------------------------------------------
create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  master_resume_id uuid references public.master_resumes (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  name text not null,
  company text,
  role text,
  -- Frozen copy of the master at generation time (change application base).
  master_latex text not null,
  -- Materialized document with the currently-accepted changes applied.
  latex_content text not null,
  match_score_before int,
  match_score_after int,
  keywords_added text[] not null default '{}',
  skills_emphasized text[] not null default '{}',
  still_missing text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index resume_versions_user_idx on public.resume_versions (user_id, created_at desc);
create trigger resume_versions_updated_at before update on public.resume_versions for each row execute function public.set_updated_at();

create table public.resume_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_version_id uuid not null references public.resume_versions (id) on delete cascade,
  block_id text not null,
  section text,
  change_type text not null default 'rewrite' check (change_type in ('rewrite','remove','reorder','skills_reorder','coursework')),
  original_text text not null,
  tailored_text text not null,
  current_text text not null,
  reason text not null,
  fact_ids uuid[] not null default '{}',
  keywords text[] not null default '{}',
  is_safe boolean not null default true,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','edited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index resume_changes_version_idx on public.resume_changes (resume_version_id);
create index resume_changes_user_idx on public.resume_changes (user_id);
create trigger resume_changes_updated_at before update on public.resume_changes for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Configurable job source registry (Greenhouse board tokens / Lever sites)
-- ---------------------------------------------------------------------------
create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('greenhouse','lever')),
  token text not null,
  label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, token)
);

create index job_sources_user_idx on public.job_sources (user_id);
create trigger job_sources_updated_at before update on public.job_sources for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Application tracker
-- ---------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  company text not null,
  role text not null,
  status text not null default 'saved' check (status in (
    'saved','tailoring','ready','applied','oa','interview','offer','rejected','withdrawn'
  )),
  date_applied date,
  resume_version_id uuid references public.resume_versions (id) on delete set null,
  notes text,
  next_action text,
  next_action_date date,
  job_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_user_status_idx on public.applications (user_id, status);
create index applications_next_action_idx on public.applications (user_id, next_action_date);
create trigger applications_updated_at before update on public.applications for each row execute function public.set_updated_at();


-- ===== migrations/0002_rls.sql =====

-- Row-level security. No user may read or write another user's records.

alter table public.profiles enable row level security;
alter table public.career_education enable row level security;
alter table public.career_experiences enable row level security;
alter table public.career_projects enable row level security;
alter table public.career_skills enable row level security;
alter table public.career_facts enable row level security;
alter table public.master_resumes enable row level security;
alter table public.jobs enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.job_analyses enable row level security;
alter table public.resume_versions enable row level security;
alter table public.resume_changes enable row level security;
alter table public.applications enable row level security;
alter table public.job_sources enable row level security;

-- profiles: a user manages only their own row.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Generic owner policies for user-scoped tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'career_education','career_experiences','career_projects','career_skills',
    'career_facts','master_resumes','saved_jobs','job_analyses',
    'resume_versions','resume_changes','applications','job_sources'
  ]
  loop
    execute format(
      'create policy "%1$s_select_own" on public.%1$s for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$s for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "%1$s_update_own" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$s for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- jobs: a shared board. Any signed-in user can read. Ingestion runs server-side
-- with the signed-in user's session (this is a personal, single-user product);
-- rows carry no user data.
create policy "jobs_select_authenticated" on public.jobs
  for select using (auth.role() = 'authenticated');
create policy "jobs_insert_authenticated" on public.jobs
  for insert with check (auth.role() = 'authenticated');
create policy "jobs_update_authenticated" on public.jobs
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');


-- ===== migrations/0003_docx_resumes.sql =====

-- Word (.docx) master resumes.
--
-- A Word master stores:
--   content          = word/document.xml (the only part tailoring edits)
--   template_base64  = the original .docx (fonts, styles, numbering), used to
--                      rebuild a byte-identical file around tailored XML
-- Resume versions store tailored document.xml in latex_content and the
-- untouched master XML in master_latex; `format` says how to read them.

alter table public.master_resumes
  drop constraint if exists master_resumes_format_check;
alter table public.master_resumes
  add constraint master_resumes_format_check check (format in ('latex', 'plain', 'docx'));
alter table public.master_resumes
  add column if not exists template_base64 text,
  add column if not exists file_name text;

alter table public.resume_versions
  add column if not exists format text not null default 'latex'
    check (format in ('latex', 'docx'));


-- ===== migrations/0004_llm_backends.sql =====

-- Multiple LLM backends: job_analyses.engine now records which backend ran
-- the analysis ('offline' for the deterministic engine; 'mock' kept for rows
-- written by earlier versions), and model records the exact model.

alter table public.job_analyses
  drop constraint if exists job_analyses_engine_check;
alter table public.job_analyses
  add constraint job_analyses_engine_check
  check (engine in ('offline', 'mock', 'claude_cli', 'anthropic', 'openai', 'gemini'));
alter table public.job_analyses
  alter column engine set default 'offline';


-- ===== migrations/0005_grants.sql =====

-- Explicit table privileges for signed-in users, so ApplyStack works even when
-- the Supabase project has "Automatically expose new tables" turned off.
-- Row-level security (0002) still decides which rows each user can touch.
-- The anon role (signed-out visitors) gets nothing.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;


-- ===== migrations/0006_simplify_feed.sql =====

-- Internship feed from Simplify's public list, plus jobs added by hand.
--   jobs.source  may now be 'simplify'
--   jobs.is_open turns false when a posting leaves its feed (closed listings
--                stay linked to your applications but leave Discover)

alter table public.jobs
  drop constraint if exists jobs_source_check;
alter table public.jobs
  add constraint jobs_source_check
  check (source in ('greenhouse', 'lever', 'seed', 'manual', 'simplify'));

alter table public.jobs
  add column if not exists is_open boolean not null default true;

create index if not exists jobs_open_posted_idx on public.jobs (is_open, posted_at desc nulls last);

