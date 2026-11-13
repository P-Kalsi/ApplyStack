-- Word (.docx) master resumes.
--
-- A Word master stores:
--   content          = word/document.xml (the only part tailoring edits)
--   template_base64  = the original .docx (fonts, styles, numbering), used to
--                      rebuild a byte-identical file around tailored XML
-- Resume versions store tailored document.xml in latex_content and the
-- untouched master XML in master_latex; `format` says how to read them.

alter table public.master_resumes
  drop constraint if exists master_resumes_format_check;
alter table public.master_resumes
  add constraint master_resumes_format_check check (format in ('latex', 'plain', 'docx'));
alter table public.master_resumes
  add column if not exists template_base64 text,
  add column if not exists file_name text;

alter table public.resume_versions
  add column if not exists format text not null default 'latex'
    check (format in ('latex', 'docx'));
