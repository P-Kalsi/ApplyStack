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
