-- Pluggable job sources (Adzuna now; Job Bank Canada, JSearch later) and
-- description previews.
--   jobs.source   any short lowercase id instead of a fixed list
--   jobs.snippet  preview text from sources that don't give the full
--                 description (Adzuna); the full one is fetched or pasted later

alter table public.jobs
  drop constraint if exists jobs_source_check;
alter table public.jobs
  add constraint jobs_source_check check (source ~ '^[a-z][a-z0-9_]{1,30}$');

alter table public.jobs
  add column if not exists snippet text;

-- Fast lookups when Discover saves the jobs on the page you're viewing.
create index if not exists jobs_source_id_idx on public.jobs (source, source_id);
