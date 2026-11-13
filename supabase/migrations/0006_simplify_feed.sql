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
