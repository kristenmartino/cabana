-- 0009_grants.sql — explicit Data API privileges
-- Current Supabase (local CLI and cloud) no longer auto-exposes tables to the
-- Data API roles: without explicit GRANTs, anon/authenticated/service_role
-- hold no CRUD verbs at all, and every PostgREST call — including the app's
-- own service-role writes — fails with 'permission denied'. Caught by the RLS
-- suite's control fixture on its first real run (Day 2).
--
-- This encodes the privilege model 0005 already assumed:
--   grants restrict VERBS, RLS restricts ROWS.
--   anon/authenticated: SELECT everywhere (policy-less tables read as empty —
--     "0 rows, not an error"), writes stay revoked (0005) except the
--     access_notes column carve-out (0005).
--   service_role: everything (server actions / edge functions).
-- Later migrations that CREATE TABLE must grant explicitly — there is no
-- auto-expose to fall back on; the RLS suite's control test fails if forgotten.

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Write helpers stay service-role-only. The 0006/0008 revokes from
-- anon/authenticated alone were NO-OPS: Postgres grants EXECUTE on new
-- functions to PUBLIC by default, and roles inherit through PUBLIC (verified
-- with has_function_privilege on Day 2 — both roles could execute). Revoke
-- PUBLIC too, then grant the service role explicitly. Every future function
-- migration must repeat this pattern; the RLS suite asserts the denial.
revoke execute on function set_actor(text) from public, anon, authenticated;
revoke execute on function transition_booking(uuid, text, text) from public, anon, authenticated;
grant execute on function set_actor(text) to service_role;
grant execute on function transition_booking(uuid, text, text) to service_role;
