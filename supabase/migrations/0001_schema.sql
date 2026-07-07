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
