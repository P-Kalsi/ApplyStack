-- Answers you gave to application questions ("answer bank"), reusable for
-- similar questions and linked to the job you answered them for.

create table if not exists public.application_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  answer text not null,
  char_limit int,
  kind text not null default 'text' check (kind in ('text', 'choice')),
  job_id uuid references public.jobs (id) on delete set null,
  fact_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists application_answers_user_idx on public.application_answers (user_id, updated_at desc);
create index if not exists application_answers_job_idx on public.application_answers (user_id, job_id);

drop trigger if exists application_answers_updated_at on public.application_answers;
create trigger application_answers_updated_at before update on public.application_answers
  for each row execute function public.set_updated_at();

alter table public.application_answers enable row level security;

drop policy if exists "application_answers_select_own" on public.application_answers;
drop policy if exists "application_answers_insert_own" on public.application_answers;
drop policy if exists "application_answers_update_own" on public.application_answers;
drop policy if exists "application_answers_delete_own" on public.application_answers;
create policy "application_answers_select_own" on public.application_answers for select using (auth.uid() = user_id);
create policy "application_answers_insert_own" on public.application_answers for insert with check (auth.uid() = user_id);
create policy "application_answers_update_own" on public.application_answers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "application_answers_delete_own" on public.application_answers for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.application_answers to authenticated;
