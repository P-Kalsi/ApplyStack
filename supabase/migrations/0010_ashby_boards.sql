-- Company boards can be Ashby job boards too (jobs.ashbyhq.com/{org}).

alter table public.job_sources
  drop constraint if exists job_sources_kind_check;
alter table public.job_sources
  add constraint job_sources_kind_check check (kind in ('greenhouse', 'lever', 'ashby'));
