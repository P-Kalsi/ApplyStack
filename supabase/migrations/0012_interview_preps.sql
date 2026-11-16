-- Interview prep per job: STAR stories from your Career Vault, topics to
-- review and questions to ask. The story bank in the Career Vault is built
-- from these rows.

create table if not exists public.interview_preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  stories jsonb not null default '[]',
  topics jsonb not null default '[]',
  questions text[] not null default '{}',
  engine text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

drop trigger if exists interview_preps_updated_at on public.interview_preps;
create trigger interview_preps_updated_at before update on public.interview_preps
  for each row execute function public.set_updated_at();

alter table public.interview_preps enable row level security;

drop policy if exists "interview_preps_select_own" on public.interview_preps;
drop policy if exists "interview_preps_insert_own" on public.interview_preps;
drop policy if exists "interview_preps_update_own" on public.interview_preps;
drop policy if exists "interview_preps_delete_own" on public.interview_preps;
create policy "interview_preps_select_own" on public.interview_preps for select using (auth.uid() = user_id);
create policy "interview_preps_insert_own" on public.interview_preps for insert with check (auth.uid() = user_id);
create policy "interview_preps_update_own" on public.interview_preps for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "interview_preps_delete_own" on public.interview_preps for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.interview_preps to authenticated;
