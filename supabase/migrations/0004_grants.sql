-- Newer Supabase projects no longer auto-expose new public-schema tables to
-- the anon/authenticated/service_role Postgres roles (see api.auto_expose_new_tables
-- in supabase/config.toml) — RLS policies alone are not enough, the base
-- GRANT must exist too, or every query fails with 42501 "permission denied"
-- before RLS is even evaluated. This grants the table-level privileges that
-- 0002_rls.sql's policies then narrow down per-row.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant all on tables to service_role;
