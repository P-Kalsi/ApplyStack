-- Let job analyses record any AI backend id (e.g. 'codex_cli'), not a fixed list.

alter table public.job_analyses
  drop constraint if exists job_analyses_engine_check;
alter table public.job_analyses
  add constraint job_analyses_engine_check check (engine ~ '^[a-z][a-z0-9_]{1,30}$');
