-- Cover letters in your own voice.
--   writing_samples  your past cover letters: their text sets the voice of new
--                    letters; one .docx can be the Word template new letters
--                    are built in (template_base64 = the original file)
--   cover_letters    the letter for a job (one per job), editable

create table if not exists public.writing_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  content text not null,
  file_name text,
  template_base64 text,
  is_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists writing_samples_user_idx on public.writing_samples (user_id, created_at desc);

drop trigger if exists writing_samples_updated_at on public.writing_samples;
create trigger writing_samples_updated_at before update on public.writing_samples
  for each row execute function public.set_updated_at();

create table if not exists public.cover_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  focus text not null default 'fit',
  tone text not null default 'mine',
  recipient text[] not null default '{}',
  greeting text not null default 'Dear Hiring Manager,',
  paragraphs text[] not null default '{}',
  fact_ids uuid[] not null default '{}',
  issues jsonb not null default '[]',
  gaps text[] not null default '{}',
  engine text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

drop trigger if exists cover_letters_updated_at on public.cover_letters;
create trigger cover_letters_updated_at before update on public.cover_letters
  for each row execute function public.set_updated_at();

alter table public.writing_samples enable row level security;
alter table public.cover_letters enable row level security;

drop policy if exists "writing_samples_select_own" on public.writing_samples;
drop policy if exists "writing_samples_insert_own" on public.writing_samples;
drop policy if exists "writing_samples_update_own" on public.writing_samples;
drop policy if exists "writing_samples_delete_own" on public.writing_samples;
create policy "writing_samples_select_own" on public.writing_samples for select using (auth.uid() = user_id);
create policy "writing_samples_insert_own" on public.writing_samples for insert with check (auth.uid() = user_id);
create policy "writing_samples_update_own" on public.writing_samples for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "writing_samples_delete_own" on public.writing_samples for delete using (auth.uid() = user_id);

drop policy if exists "cover_letters_select_own" on public.cover_letters;
drop policy if exists "cover_letters_insert_own" on public.cover_letters;
drop policy if exists "cover_letters_update_own" on public.cover_letters;
drop policy if exists "cover_letters_delete_own" on public.cover_letters;
create policy "cover_letters_select_own" on public.cover_letters for select using (auth.uid() = user_id);
create policy "cover_letters_insert_own" on public.cover_letters for insert with check (auth.uid() = user_id);
create policy "cover_letters_update_own" on public.cover_letters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cover_letters_delete_own" on public.cover_letters for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.writing_samples to authenticated;
grant select, insert, update, delete on public.cover_letters to authenticated;
