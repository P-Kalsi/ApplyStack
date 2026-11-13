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
