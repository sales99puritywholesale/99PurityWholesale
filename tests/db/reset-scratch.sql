-- Reset procedure for the SCRATCH project ONLY (run through tests/db/reset-scratch.mjs, which enforces the scratch guard).
-- Removes everything created by supabase/migrations and by the tests. It never alters the structure of the auth schema, and it
-- only deletes auth users whose email starts with p2test- and ends with @example.test.
-- Not removed: the ALTER DEFAULT PRIVILEGES entries made by migration 0001 (re-applying sets the same values again).
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.p2_probe_isolation();
drop table if exists public.organization_invites, public.organization_members, public.organization_billing, public.organizations,
                     public.staff_roles, public.staff_members, public.role_capabilities, public.capabilities, public.profiles cascade;
drop schema if exists private cascade;
delete from auth.users where email like 'p2test-%@example.test';
delete from p2_scratch_marker.applied;
