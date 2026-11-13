-- Explicit table privileges for signed-in users, so ApplyStack works even when
-- the Supabase project has "Automatically expose new tables" turned off.
-- Row-level security (0002) still decides which rows each user can touch.
-- The anon role (signed-out visitors) gets nothing.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
