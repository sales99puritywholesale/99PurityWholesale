# Appendix: Complete Review Files (rev2.1) and Diffs

Revision label: **rev2.1 (SQL and checker unchanged in review pass 3; documentation pass 3)**, the same revision as `docs/M1-MIGRATIONS-0001-0002-REVIEW.md`. Generated verbatim from the files in `supabase/review/` on 2026-11-07. **Review drafts: not applied, not executed, not parsed by Postgres.** The checker is a text-pattern guardrail only. SHA-256 values identify exact content; if a file changes, regenerate this appendix and the hash table in the review document.

| File | SHA-256 |
|---|---|
| `supabase/review/0001_foundation_identity.sql` | `28e2cebf55e07679b71c7bbb7453517e3cde8c1b420e4eab9088ef98b544011e` |
| `supabase/review/0002_staff_capabilities.sql` | `852f13efef9754b1882ec17ef2e3ab2833c66143233af21c396abc20b28823ee` |
| `supabase/review/static-check.mjs` | `491092fc566046555cde1ced48eefd6ee99d8653041ddffbad205b4a135cf7f3` |
| `supabase/review/history/0002_staff_capabilities.rev2-to-rev2.1.diff` | `e3470b5a1b0f2f7fb8c61ef070039a34bc3814deb37e2b6009709b4f9386ea14` |
| `supabase/review/history/static-check.rev2-to-rev2.1.diff` | `11ec93103249fbfc52f3dbd424bb1c2610ae12384105ab49309271bcc4c7fb11` |
| `supabase/review/history/0001_foundation_identity.rev1-to-rev2.diff` | `bf301d09e4ef9cec0fa79cc259b3307779e132f13fc1ec0345087aad539174f0` |
| `supabase/review/history/0002_staff_capabilities.rev1-to-rev2.diff` | `7206228b70c14200476d93d74ac42e80081c11a7bb0e0f240a5af4e709d51923` |
| `supabase/review/history/static-check.rev1-to-rev2.diff` | `0ec6a637546d90990772c06f963f874f76a21c9c861fe85b9ec4a13d0584d49a` |
| `supabase/review/history/0001_foundation_identity.rev1.sql` | `4fb6a224c21e6c1ac2bfcb44dee441dafae00374fb9c3a286c950b1b272a1da9` |
| `supabase/review/history/0002_staff_capabilities.rev1.sql` | `a1885d8e3c89aa6642bcf27dc90aee53ee79f6955d417860bf95b5ac5ac6967e` |
| `supabase/review/history/static-check.rev1.mjs` | `5632bce968a1facbd2c00815fcff14a0e25afe4f6c5cf4cf9427a8cbf64fd571` |
| `supabase/review/history/0002_staff_capabilities.rev2.sql` | `96c2f1a7fffe53e80723ace9b5b95b8185165d6c351325324ca1d01bce4a1a92` |
| `supabase/review/history/static-check.rev2.mjs` | `b42391125d17f9123a747a0426ddd2c7bd8d72ca8f2060700a4fc0b2c1e92331` |

## A1. `supabase/review/0001_foundation_identity.sql`

````sql
-- =====================================================================================
-- 0001_foundation_identity.sql
-- *** REVIEW DRAFT rev2. NOT APPLIED. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
-- rev2 changes: last-owner protection is now BEFORE (lock + immutability) plus AFTER (final-state check,
--   catches multi-row statements and FK cascades); READ COMMITTED required by guards; TRUNCATE blocked on
--   organization_members; self-check also verifies the guard triggers exist.
-- Source of truth: docs/MILESTONE-1-SCHEMA-AND-RLS.md (rev. 4), project-rules.md.
-- Scope: identity and organization foundation only. No staff objects (0002), no audit (0003),
--        no step-up (0004), no RPCs (0007). Customers get read access to their own data only.
-- Conventions: default deny; no DML grant to any API role except profiles(full_name, phone);
--              every SECURITY DEFINER function pins search_path and has EXECUTE revoked from
--              PUBLIC/anon/authenticated/service_role, then granted explicitly where needed.
-- The Supabase CLI wraps each migration in a transaction; no explicit BEGIN/COMMIT here.
-- =====================================================================================

-- 1. Schemas and default-deny ---------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;  -- needed only so RLS helper functions resolve

-- Supabase grants ALL on new public objects to anon/authenticated/service_role by default.
alter default privileges for role postgres in schema public  revoke all on tables    from anon, authenticated, service_role;
alter default privileges for role postgres in schema public  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public  revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke all on tables    from anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres revoke execute on functions from public;

-- 2. Tables ----------------------------------------------------------------------------
create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text check (full_name is null or char_length(full_name) <= 200),
  phone      text check (phone is null or char_length(phone) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- REVIEW DEVIATION D-1: no created_by column (rev. 4 section 2.2 listed one). A staff user id
-- readable by customers would reveal staff identity; the creator is recorded in the audit log (0003).
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 1 and 200),
  code          text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{2,19}$'),
  status        text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  payment_terms text not null default 'prepay' check (payment_terms ~ '^[a-z0-9_]{1,32}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.organization_billing (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  billing_address jsonb not null default '{}'::jsonb
    check (jsonb_typeof(billing_address) = 'object' and pg_column_size(billing_address) <= 8192),
  updated_at      timestamptz not null default now()
);

create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('owner', 'member')),
  status          text not null default 'active' check (status in ('active', 'removed')),
  created_at      timestamptz not null default now(),
  removed_at      timestamptz,
  constraint organization_members_org_user_key unique (organization_id, user_id),
  constraint organization_members_removed_consistency check ((status = 'removed') = (removed_at is not null))
);
create index organization_members_user_active_idx on public.organization_members (user_id) where status = 'active';
create index organization_members_org_owner_idx on public.organization_members (organization_id)
  where status = 'active' and role = 'owner';

-- invited_by rule (enforced by the 0007 RPCs): set only when the inviter is an organization member;
-- staff-created invites leave it NULL (actor recorded in audit) so customers never see a staff id.
create table public.organization_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  email           text not null check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  role            text not null check (role in ('owner', 'member')),
  invited_by      uuid references auth.users (id) on delete set null,
  delivery_status text not null default 'pending_issue' check (delivery_status in ('pending_issue', 'issued', 'sent', 'failed')),
  authorized_at   timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users (id) on delete set null,
  revoked_at      timestamptz,
  revoke_reason   text check (revoke_reason is null or char_length(revoke_reason) <= 200),
  created_at      timestamptz not null default now(),
  constraint organization_invites_single_outcome check (not (accepted_at is not null and revoked_at is not null)),
  constraint organization_invites_expiry_after_authorization check (expires_at > authorized_at)
);
create unique index organization_invites_one_open_per_email_idx
  on public.organization_invites (organization_id, email) where accepted_at is null and revoked_at is null;
create index organization_invites_org_idx on public.organization_invites (organization_id);

-- Token hash lives apart, in a schema not exposed to the Data API, with no API privilege at all.
create table private.organization_invite_secrets (
  invite_id  uuid primary key references public.organization_invites (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now()
);

-- 3. Row Level Security ----------------------------------------------------------------
alter table public.profiles                    enable row level security;
alter table public.organizations               enable row level security;
alter table public.organization_billing        enable row level security;
alter table public.organization_members        enable row level security;
alter table public.organization_invites        enable row level security;
alter table private.organization_invite_secrets enable row level security;  -- no policy: denies everything to non-owners
-- RLS is intentionally NOT forced: SECURITY DEFINER functions (owned by the migration role) must bypass it.

-- 4. Helper and trigger functions (all in private; all pinned) -------------------------
create function private.my_org_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid()) and m.status = 'active';
$$;

create function private.my_owner_org_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid()) and m.status = 'active' and m.role = 'owner';
$$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- New auth users get an empty profile. Nothing is copied from user-editable metadata.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Invoker rights are enough: compares NEW and OLD only, reads no table.
create function private.guard_organizations() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.code <> old.code then
    raise exception 'organizations.code is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Last-owner protection, part 1 (BEFORE row): identity immutability and serialization.
-- The organization row is locked FOR UPDATE before the owner row changes, so concurrent demotions or
-- removals for the same organization queue. Guards require READ COMMITTED: under a snapshot isolation
-- level a later transaction could keep counting a stale owner set and slip through (write skew).
create function private.guard_organization_members() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'organization_members changes require READ COMMITTED isolation' using errcode = '25000';
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
      raise exception 'organization_members: organization_id and user_id are immutable' using errcode = '23514';
    end if;
  end if;

  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    perform 1 from public.organizations o where o.id = old.organization_id for update;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Last-owner protection, part 2 (AFTER row): final-state check. AFTER row triggers run when the whole
-- statement (or the FK cascade action) has finished, so a statement that removes several owners at once
-- is judged on its result, not row by row. Closing the organization in the same transaction is allowed.
create function private.check_last_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_org_status text;
  v_remaining  integer;
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    select o.status into v_org_status from public.organizations o where o.id = old.organization_id;
    if found and v_org_status is distinct from 'closed' then
      select count(*) into v_remaining
        from public.organization_members m
       where m.organization_id = old.organization_id and m.role = 'owner' and m.status = 'active';
      if v_remaining = 0 then
        raise exception 'last active owner of an organization cannot be removed or demoted' using errcode = '23514';
      end if;
    end if;
  end if;
  return null;
end;
$$;

-- TRUNCATE bypasses row triggers, so it is refused on tables that carry invariants.
create function private.block_truncate() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'TRUNCATE is not permitted on %', tg_table_name using errcode = '42501';
  return null;
end;
$$;

-- 5. Triggers --------------------------------------------------------------------------
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();
create trigger organization_billing_touch before update on public.organization_billing
  for each row execute function private.touch_updated_at();
create trigger organizations_guard before update on public.organizations
  for each row execute function private.guard_organizations();
create trigger organization_members_guard before update or delete on public.organization_members
  for each row execute function private.guard_organization_members();
create trigger organization_members_last_owner_check after update or delete on public.organization_members
  for each row execute function private.check_last_owner();
create trigger organization_members_no_truncate before truncate on public.organization_members
  for each statement execute function private.block_truncate();
-- Assumption to confirm by test (T-0001-9): firing this trigger needs no EXECUTE/USAGE check
-- for supabase_auth_admin at fire time (privileges are checked at creation).
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- 6. Policies (customer side only; staff read policies arrive in 0002) ------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy organizations_select_member on public.organizations
  for select to authenticated using (id in (select private.my_org_ids()));

create policy organization_billing_select_owner on public.organization_billing
  for select to authenticated using (organization_id in (select private.my_owner_org_ids()));

create policy organization_members_select_member on public.organization_members
  for select to authenticated using (organization_id in (select private.my_org_ids()));

create policy organization_invites_select_owner on public.organization_invites
  for select to authenticated using (organization_id in (select private.my_owner_org_ids()));

-- 7. Grants and revocations ------------------------------------------------------------
revoke all on table public.profiles, public.organizations, public.organization_billing,
                    public.organization_members, public.organization_invites
  from public, anon, authenticated, service_role;
revoke all on table private.organization_invite_secrets from public, anon, authenticated, service_role;

grant select on public.profiles, public.organizations, public.organization_billing,
                public.organization_members, public.organization_invites to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

revoke all on function private.my_org_ids(), private.my_owner_org_ids(), private.touch_updated_at(),
                       private.handle_new_user(), private.guard_organizations(),
                       private.guard_organization_members(), private.check_last_owner(), private.block_truncate()
  from public, anon, authenticated, service_role;
grant execute on function private.my_org_ids(), private.my_owner_org_ids() to authenticated;  -- used by policies only

-- 8. Self-checks: the migration fails if the security posture is not what the design says ----
do $$
declare
  t text;
  p text;
begin
  foreach t in array array[
    'public.profiles', 'public.organizations', 'public.organization_billing',
    'public.organization_members', 'public.organization_invites', 'private.organization_invite_secrets'
  ] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then
      raise exception 'self-check: RLS not enabled on %', t;
    end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) then raise exception 'self-check: anon has % on %', p, t; end if;
      if has_table_privilege('service_role', t, p) then raise exception 'self-check: service_role has % on %', p, t; end if;
      if p <> 'select' and has_table_privilege('authenticated', t, p) then
        raise exception 'self-check: authenticated has % on %', p, t;
      end if;
    end loop;
  end loop;
  if has_table_privilege('authenticated', 'private.organization_invite_secrets', 'select') then
    raise exception 'self-check: authenticated can read invite secrets';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'user_id', 'update')
     or has_column_privilege('authenticated', 'public.profiles', 'created_at', 'update')
     or has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'update') then
    raise exception 'self-check: authenticated can update protected profile columns';
  end if;
  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgname in (
        'organization_members_guard', 'organization_members_last_owner_check',
        'organization_members_no_truncate', 'organizations_guard', 'on_auth_user_created')) <> 5 then
    raise exception 'self-check: expected guard triggers are missing';
  end if;
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private'
      and not coalesce((select bool_or(c like 'search_path=%') from unnest(pr.proconfig) c), false)
  ) then
    raise exception 'self-check: function without pinned search_path in schema private';
  end if;
end;
$$;
````

## A2. `supabase/review/0002_staff_capabilities.sql`

````sql
-- =====================================================================================
-- 0002_staff_capabilities.sql
-- *** REVIEW DRAFT rev2. NOT APPLIED. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
-- Depends on 0001. Source of truth: docs/MILESTONE-1-SCHEMA-AND-RLS.md (rev. 4) sections 2.5, 2.6, 3, 5.12.
-- Scope: staff roles and capabilities, staff/member exclusion, last-admin guard, staff read policies,
--        MFA structure validation and the approved-factor binding (fail closed, all factor types),
--        enrolment-window and approved-factor tables WITH database-level approval rules.
-- NOT in this migration (by the approved sequence): step-up objects and owner-grant checks (0004,
--   authored only after V5b passes), audit log (0003), RPCs incl. window authorize/revoke/check/claim
--   (0007), cron schedules.
-- Staff access stays DENIED until private.run_auth_structure_check() has recorded 'passed'.
--
-- rev2 changes (see docs/M1-MIGRATIONS-0001-0002-REVIEW.md):
--  F-1 staff-side exclusion guard now covers INSERT and UPDATE, makes staff_members.user_id immutable,
--      re-checks on reactivation; both directions keep the per-user advisory lock; READ COMMITTED required.
--  F-2 approved factors are bound to a valid window in the database: composite FK (window, user), one factor
--      per window, validation trigger (window open, unexpired, unrevoked, unconsumed, target active, factor
--      verified TOTP of that user created inside the window), approvals immutable, windows immutable.
--  F-3 last-admin guard is BEFORE (lock + READ COMMITTED) plus AFTER (final-state check, multi-row and
--      cascade safe); TRUNCATE blocked on staff tables.
--  F-5 structure check also verifies data types and required enum labels; passed rows must be self-consistent;
--      validation records must not be future-dated.
-- rev2.1 (review pass 2): (a) the composite FK window->factor is ON DELETE CASCADE so staff deletion cannot be
--   blocked by FK action ordering (NO ACTION would be checked after the window cascade while approval rows
--   still exist); (b) the window update trigger lets ON DELETE SET NULL (an UPDATE) clear authorized_by and
--   revoked_by, but never set them to another value. Approval and window deletion semantics: see the review
--   document, section 'Review pass 2'.
-- Lock hierarchy (always acquire in this order): (1) advisory 'm1:last_admin', (2) organization row,
--   (3) per-user advisory lock. No path acquires them in a different order.
-- =====================================================================================

-- 1. Tables ----------------------------------------------------------------------------
create table public.staff_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  status     text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Exactly four M1 roles. There is no super_admin.
create table public.staff_roles (
  user_id    uuid not null references public.staff_members (user_id) on delete cascade,
  role       text not null check (role in ('admin', 'finance', 'operations', 'support')),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.capabilities (
  code        text primary key check (code ~ '^[a-z]+(\.[a-z]+)+$'),
  description text not null
);

create table public.role_capabilities (
  role            text not null check (role in ('admin', 'finance', 'operations', 'support')),
  capability_code text not null references public.capabilities (code) on delete cascade,
  primary key (role, capability_code)
);

-- Authorized enrolment windows (objects only; the RPCs that use them arrive in 0007).
create table private.staff_mfa_enrolment_windows (
  id             uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.staff_members (user_id) on delete cascade,
  authorized_by  uuid references auth.users (id) on delete set null,   -- NULL only for the bootstrap script
  authorized_at  timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '30 minutes',
  revoked_at     timestamptz,
  revoked_by     uuid references auth.users (id) on delete set null,
  revoke_reason  text check (revoke_reason is null or char_length(revoke_reason) <= 200),
  consumed_at    timestamptz,
  reason         text not null check (char_length(btrim(reason)) between 1 and 200),
  constraint staff_mfa_windows_bounded check (expires_at > authorized_at and expires_at <= authorized_at + interval '60 minutes'),
  constraint staff_mfa_windows_not_self check (authorized_by is null or authorized_by <> target_user_id),
  constraint staff_mfa_windows_single_outcome check (not (consumed_at is not null and revoked_at is not null)),
  constraint staff_mfa_windows_id_target_key unique (id, target_user_id)
);
create unique index staff_mfa_windows_one_open_idx
  on private.staff_mfa_enrolment_windows (target_user_id) where consumed_at is null and revoked_at is null;

-- Factors that count. No FK to auth.mfa_factors on purpose (auth schema is not our API); the insert trigger
-- below verifies the factor against it instead. The composite FK forces window target = factor user, and
-- unique (window_id) allows one approved factor per window (single use).
create table private.staff_mfa_factors (
  factor_id   uuid primary key,
  user_id     uuid not null,
  window_id   uuid not null,
  approved_at timestamptz not null default now(),
  constraint staff_mfa_factors_window_user_fk foreign key (window_id, user_id)
    references private.staff_mfa_enrolment_windows (id, target_user_id) on delete cascade,
  constraint staff_mfa_factors_user_fk foreign key (user_id) references public.staff_members (user_id) on delete cascade,
  constraint staff_mfa_factors_one_per_window unique (window_id)
);
create index staff_mfa_factors_user_idx on private.staff_mfa_factors (user_id);

-- Result of the structure check. Diagnostics hold names from a fixed expected set, counts, SQLSTATE and the
-- server version only. A 'passed' row must be self-consistent.
create table private.platform_validations (
  check_name               text primary key,
  status                   text not null check (status in ('passed', 'failed')),
  checked_at               timestamptz not null default now(),
  sqlstate                 text,
  expected_columns         text[] not null,
  present_expected_columns text[] not null,
  other_column_count       integer not null,
  type_checks_passed       integer not null default 0,
  enum_labels_ok           boolean not null default false,
  server_version           text not null,
  constraint platform_validations_passed_consistent check (
    status <> 'passed'
    or (sqlstate is null and present_expected_columns = expected_columns and type_checks_passed = 5 and enum_labels_ok)
  )
);

-- 2. Row Level Security ----------------------------------------------------------------
alter table public.staff_members                  enable row level security;
alter table public.staff_roles                    enable row level security;
alter table public.capabilities                   enable row level security;
alter table public.role_capabilities              enable row level security;
alter table private.staff_mfa_enrolment_windows   enable row level security;
alter table private.staff_mfa_factors             enable row level security;
alter table private.platform_validations          enable row level security;

-- 3. Functions (all in private; all pinned) --------------------------------------------

-- Records whether auth.mfa_factors still has the structure we depend on: expected column names, compatible
-- data types, required enum labels, and a zero-row probe over the approved columns only. No row data is
-- read. Any error is recorded as 'failed'. Not executable by any API role.
create function private.run_auth_structure_check() returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_expected      constant text[] := array['created_at', 'factor_type', 'id', 'status', 'user_id'];
  v_present       text[] := '{}';
  v_other         integer := 0;
  v_types_ok      integer := 0;
  v_status_labels integer := 0;
  v_type_labels   integer := 0;
  v_status        text := 'failed';
  v_sqlstate      text := null;
  v_probe         bigint;
begin
  begin
    select coalesce(array_agg(c.column_name::text order by c.column_name::text)
                      filter (where c.column_name::text = any (v_expected)), '{}'),
           count(*) filter (where not (c.column_name::text = any (v_expected))),
           count(*) filter (where (c.column_name::text in ('id', 'user_id') and c.data_type::text = 'uuid')
                               or (c.column_name::text = 'created_at' and c.data_type::text = 'timestamp with time zone')
                               or (c.column_name::text in ('status', 'factor_type') and c.data_type::text = 'USER-DEFINED'))
      into v_present, v_other, v_types_ok
      from information_schema.columns c
     where c.table_schema = 'auth' and c.table_name = 'mfa_factors';

    select count(distinct e.enumlabel) filter (where a.attname = 'status' and e.enumlabel in ('verified', 'unverified')),
           count(distinct e.enumlabel) filter (where a.attname = 'factor_type' and e.enumlabel = 'totp')
      into v_status_labels, v_type_labels
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class cl on cl.oid = a.attrelid
      join pg_catalog.pg_namespace ns on ns.oid = cl.relnamespace
      join pg_catalog.pg_enum e on e.enumtypid = a.atttypid
     where ns.nspname = 'auth' and cl.relname = 'mfa_factors'
       and a.attname in ('status', 'factor_type') and not a.attisdropped;

    select count(*) into v_probe
      from (select f.id, f.user_id, f.factor_type::text, f.status::text, f.created_at
              from auth.mfa_factors f limit 0) s;

    if v_present = v_expected and v_types_ok = 5 and v_status_labels = 2 and v_type_labels = 1 then
      v_status := 'passed';
    end if;
  exception when others then
    v_status := 'failed';
    v_sqlstate := sqlstate;
  end;

  insert into private.platform_validations
    (check_name, status, checked_at, sqlstate, expected_columns, present_expected_columns, other_column_count,
     type_checks_passed, enum_labels_ok, server_version)
  values
    ('auth_mfa_factors_shape', v_status, now(), v_sqlstate, v_expected, coalesce(v_present, '{}'), coalesce(v_other, 0),
     coalesce(v_types_ok, 0), (coalesce(v_status_labels, 0) = 2 and coalesce(v_type_labels, 0) = 1),
     current_setting('server_version'))
  on conflict (check_name) do update
    set status = excluded.status, checked_at = excluded.checked_at, sqlstate = excluded.sqlstate,
        expected_columns = excluded.expected_columns, present_expected_columns = excluded.present_expected_columns,
        other_column_count = excluded.other_column_count, type_checks_passed = excluded.type_checks_passed,
        enum_labels_ok = excluded.enum_labels_ok, server_version = excluded.server_version;
  return v_status;
end;
$$;

-- TRUE only if: a fresh, not future-dated, passed structure check exists AND the caller has at least one
-- approved TOTP factor AND no verified factor (of ANY type) that is not approved AND no factor row with an
-- unreadable or unrecognized type/status. Any error returns FALSE (fail closed), which also covers structure
-- drift between scheduled checks. Only id, user_id, factor_type, status, created_at are referenced.
create function private.mfa_check_ok() returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_unreadable bigint;
  v_unapproved bigint;
  v_approved   bigint;
begin
  if v_uid is null then
    return false;
  end if;
  if not exists (
    select 1 from private.platform_validations v
     where v.check_name = 'auth_mfa_factors_shape' and v.status = 'passed'
       and v.checked_at > now() - interval '24 hours'
       and v.checked_at <= now()
  ) then
    return false;
  end if;

  select
    count(*) filter (where f.status is null or f.factor_type is null
                       or f.status::text not in ('verified', 'unverified')
                       or f.factor_type::text not in ('totp', 'phone', 'webauthn')),
    count(*) filter (where f.status::text = 'verified'
                       and not exists (select 1 from private.staff_mfa_factors a
                                        where a.user_id = f.user_id and a.factor_id = f.id)),
    count(*) filter (where f.status::text = 'verified' and f.factor_type::text = 'totp'
                       and exists (select 1 from private.staff_mfa_factors a
                                    where a.user_id = f.user_id and a.factor_id = f.id))
    into v_unreadable, v_unapproved, v_approved
    from auth.mfa_factors f
   where f.user_id = v_uid;

  return v_unreadable = 0 and v_unapproved = 0 and v_approved >= 1;
exception when others then
  return false;
end;
$$;

-- Active staff member with at least one role, JWT at aal2, and a clean approved-factor state.
-- (aal2 alone is never sufficient: the factor binding must also hold.)
create function private.staff_session_ok() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
           select 1 from public.staff_members s
            where s.user_id = (select auth.uid()) and s.status = 'active'
              and exists (select 1 from public.staff_roles r where r.user_id = s.user_id)
         )
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     and private.mfa_check_ok();
$$;

create function private.has_capability(p_code text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.staff_session_ok()
     and exists (
           select 1
             from public.staff_roles r
             join public.role_capabilities rc on rc.role = r.role
            where r.user_id = (select auth.uid()) and rc.capability_code = p_code
         );
$$;

-- Staff and organization members are mutually exclusive (any staff row, any status, blocks an active
-- membership). Staff side: runs on INSERT and on every UPDATE; identity is immutable; the per-user advisory
-- lock serializes against the member side. Requires READ COMMITTED so the second transaction sees the first
-- one's committed row after the lock is released at commit.
create function private.guard_staff_not_member() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'staff_members changes require READ COMMITTED isolation' using errcode = '25000';
  end if;
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'staff_members.user_id is immutable' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if exists (select 1 from public.organization_members m where m.user_id = new.user_id and m.status = 'active') then
    raise exception 'a user with an active organization membership cannot be staff' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Member side: INSERT and UPDATE that produce an active membership.
create function private.guard_member_not_staff() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' then
    if current_setting('transaction_isolation') <> 'read committed' then
      raise exception 'organization_members changes require READ COMMITTED isolation' using errcode = '25000';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    if exists (select 1 from public.staff_members s where s.user_id = new.user_id) then
      raise exception 'a staff user cannot be an active organization member' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Last-admin protection, part 1 (BEFORE row): READ COMMITTED required; takes the single admin advisory
-- lock whenever the row change could shrink the set of active admins.
create function private.guard_last_admin_lock() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_shrinks boolean := false;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'staff changes require READ COMMITTED isolation' using errcode = '25000';
  end if;
  if tg_table_name = 'staff_roles' then
    v_shrinks := old.role = 'admin'
                 and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id)
                 and exists (select 1 from public.staff_members s where s.user_id = old.user_id and s.status = 'active');
  else
    v_shrinks := old.status = 'active'
                 and (tg_op = 'DELETE' or new.status <> 'active')
                 and exists (select 1 from public.staff_roles r where r.user_id = old.user_id and r.role = 'admin');
  end if;
  if v_shrinks then
    perform pg_advisory_xact_lock(hashtextextended('m1:last_admin', 0));
    -- Transaction-local marker for the AFTER check. Needed because FK cascade actions (internal RI triggers,
    -- which sort before our AFTER triggers) have already removed the admin's role rows by the time the
    -- AFTER trigger runs; only here, before the row change, can the admin-ness of the row be observed.
    -- Setting the marker can only cause an extra check, never skip one: this trigger overwrites it with '1'.
    perform set_config('m1.admin_shrink', '1', true);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Last-admin protection, part 2 (AFTER row): final-state check at the end of the statement or cascade action.
-- At least one active admin must remain. Multi-row statements and FK cascades are judged on their result.
create function private.check_last_admin() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_remaining integer;
begin
  -- Runs only if an admin-shrinking row change happened earlier in this transaction (marker set by the BEFORE
  -- trigger while the admin's roles were still visible). Judged on the final state of the statement.
  if coalesce(current_setting('m1.admin_shrink', true), '') = '1' then
    select count(distinct r.user_id) into v_remaining
      from public.staff_roles r
      join public.staff_members s on s.user_id = r.user_id
     where r.role = 'admin' and s.status = 'active';
    if v_remaining = 0 then
      raise exception 'the last active admin cannot be removed, demoted or disabled' using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

-- Windows can only be created for an active staff target by an active admin (or by the owner-run bootstrap
-- script with authorized_by NULL). Table has no API privilege; this is defense in depth for 0007 and scripts.
create function private.guard_enrolment_window_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.staff_members s where s.user_id = new.target_user_id and s.status = 'active') then
    raise exception 'enrolment window target must be an active staff member' using errcode = '23514';
  end if;
  if new.authorized_by is not null and not exists (
       select 1 from public.staff_members s join public.staff_roles r on r.user_id = s.user_id
        where s.user_id = new.authorized_by and s.status = 'active' and r.role = 'admin') then
    raise exception 'enrolment window must be authorized by an active admin' using errcode = '23514';
  end if;
  if new.revoked_at is not null or new.consumed_at is not null then
    raise exception 'enrolment window must be created open' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Windows are immutable except that an open window may be revoked or consumed once. Nothing can be
-- un-revoked, un-consumed, extended, retargeted or re-attributed. Invoker rights are enough: NEW/OLD only.
create function private.guard_enrolment_window_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.target_user_id <> old.target_user_id
     or (new.authorized_by is distinct from old.authorized_by and new.authorized_by is not null)
     or new.authorized_at <> old.authorized_at or new.expires_at <> old.expires_at or new.reason <> old.reason then
    raise exception 'enrolment window identity, target, authorizer, timing and reason are immutable' using errcode = '23514';
  end if;
  if old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at
       or (new.revoked_by is distinct from old.revoked_by and new.revoked_by is not null)
       or new.revoke_reason is distinct from old.revoke_reason) then
    raise exception 'a revoked enrolment window cannot be changed' using errcode = '23514';
  end if;
  if old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then
    raise exception 'a consumed enrolment window cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Approval gate for a factor. A row can exist only if, at this instant (clock_timestamp, not transaction
-- start): the window exists, targets this user, is not revoked, not consumed, is open (authorized <= now <
-- expiry); the target is an active staff member; and the factor exists in auth.mfa_factors for this user,
-- is verified, is TOTP, and was created inside the window. The window is locked and consumed here, so the
-- approval and the single use are atomic. Only id, user_id, factor_type, status, created_at are read.
create function private.guard_staff_mfa_factor_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_target   uuid;
  v_auth_at  timestamptz;
  v_expires  timestamptz;
  v_revoked  timestamptz;
  v_consumed timestamptz;
  v_fuser    uuid;
  v_fstatus  text;
  v_ftype    text;
  v_fcreated timestamptz;
begin
  select w.target_user_id, w.authorized_at, w.expires_at, w.revoked_at, w.consumed_at
    into v_target, v_auth_at, v_expires, v_revoked, v_consumed
    from private.staff_mfa_enrolment_windows w
   where w.id = new.window_id
     for update;
  if not found then
    raise exception 'unknown enrolment window' using errcode = '23514';
  end if;
  if v_target <> new.user_id then
    raise exception 'enrolment window targets a different user' using errcode = '23514';
  end if;
  if v_revoked is not null then
    raise exception 'enrolment window is revoked' using errcode = '23514';
  end if;
  if v_consumed is not null then
    raise exception 'enrolment window is already consumed' using errcode = '23514';
  end if;
  if clock_timestamp() < v_auth_at or clock_timestamp() >= v_expires then
    raise exception 'enrolment window is not open' using errcode = '23514';
  end if;
  if not exists (select 1 from public.staff_members s where s.user_id = new.user_id and s.status = 'active') then
    raise exception 'target is not an active staff member' using errcode = '23514';
  end if;

  select f.user_id, f.status::text, f.factor_type::text, f.created_at
    into v_fuser, v_fstatus, v_ftype, v_fcreated
    from auth.mfa_factors f
   where f.id = new.factor_id;
  if not found or v_fuser is distinct from new.user_id then
    raise exception 'factor does not exist for this user' using errcode = '23514';
  end if;
  if v_fstatus is distinct from 'verified' then
    raise exception 'factor is not verified' using errcode = '23514';
  end if;
  if v_ftype is distinct from 'totp' then
    raise exception 'only TOTP factors may be approved in milestone 1' using errcode = '23514';
  end if;
  if v_fcreated is null or v_fcreated < v_auth_at or v_fcreated > clock_timestamp() then
    raise exception 'factor was not created inside the enrolment window' using errcode = '23514';
  end if;

  update private.staff_mfa_enrolment_windows set consumed_at = clock_timestamp() where id = new.window_id;
  new.approved_at := clock_timestamp();
  return new;
end;
$$;

-- Approvals are immutable. (Removal is by DELETE through a later audited RPC; deleting the last approved
-- factor leaves the user denied, because mfa_check_ok requires at least one.)
create function private.guard_staff_mfa_factor_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'approved factor rows are immutable' using errcode = '23514';
  return new;
end;
$$;

-- 4. Triggers --------------------------------------------------------------------------
create trigger staff_members_not_member before insert or update on public.staff_members
  for each row execute function private.guard_staff_not_member();
create trigger organization_members_not_staff before insert or update on public.organization_members
  for each row execute function private.guard_member_not_staff();

create trigger staff_roles_last_admin_lock before update or delete on public.staff_roles
  for each row execute function private.guard_last_admin_lock();
create trigger staff_roles_last_admin_check after update or delete on public.staff_roles
  for each row execute function private.check_last_admin();
create trigger staff_members_last_admin_lock before update or delete on public.staff_members
  for each row execute function private.guard_last_admin_lock();
create trigger staff_members_last_admin_check after update or delete on public.staff_members
  for each row execute function private.check_last_admin();

create trigger staff_members_no_truncate before truncate on public.staff_members
  for each statement execute function private.block_truncate();
create trigger staff_roles_no_truncate before truncate on public.staff_roles
  for each statement execute function private.block_truncate();

create trigger staff_mfa_windows_guard_insert before insert on private.staff_mfa_enrolment_windows
  for each row execute function private.guard_enrolment_window_insert();
create trigger staff_mfa_windows_guard_update before update on private.staff_mfa_enrolment_windows
  for each row execute function private.guard_enrolment_window_update();
create trigger staff_mfa_factors_guard_insert before insert on private.staff_mfa_factors
  for each row execute function private.guard_staff_mfa_factor_insert();
create trigger staff_mfa_factors_guard_update before update on private.staff_mfa_factors
  for each row execute function private.guard_staff_mfa_factor_update();

-- 5. Seed: capability catalog and role mapping (section 3) ------------------------------
insert into public.capabilities (code, description) values
  ('org.read',                'Read organization name, code, status, terms'),
  ('org.billing.read',        'Read organization billing address (audited)'),
  ('org.manage',              'Change organization status and profile'),
  ('members.read',            'Read organization membership rows (no PII)'),
  ('members.manage',          'Add, remove and change members'),
  ('invites.read',            'Read organization invitations'),
  ('profiles.read.full',      'Read full profile including phone and email (audited)'),
  ('profiles.read.basic',     'Read name and email only (audited)'),
  ('applications.read.full',  'Read full account requests (audited)'),
  ('applications.read.basic', 'Read minimal account request fields'),
  ('applications.review',     'Review and approve account requests'),
  ('staff.read',              'Read staff members and roles'),
  ('staff.manage',            'Grant and revoke staff roles; authorize MFA enrolment windows'),
  ('flags.read',              'Read platform feature flags'),
  ('flags.write',             'Change platform feature flags'),
  ('gates.read',              'Read compliance gates'),
  ('gates.write',             'Record and revoke compliance gates'),
  ('audit.read',              'Read the audit log'),
  ('documents.read',          'Read stored documents'),
  ('documents.delete',        'Delete stored documents'),
  ('payments.confirm',        'Confirm payments (used from milestone 4)'),
  ('payments.reconcile',      'Reconcile payments (used from milestone 4)'),
  ('financial.write',         'Write financial records (used from milestone 4)'),
  ('inventory.adjust',        'Adjust inventory (used from milestone 7)'),
  ('fulfillment.process',     'Process fulfillment (used from milestone 7)'),
  ('onboarding.review',       'Review onboarding steps (used from milestone 5)'),
  ('onboarding.golive',       'Authorize go-live (used from milestone 5)');

insert into public.role_capabilities (role, capability_code)
  select 'admin', c.code from public.capabilities c;
insert into public.role_capabilities (role, capability_code) values
  ('finance', 'org.read'), ('finance', 'org.billing.read'), ('finance', 'flags.read'), ('finance', 'gates.read'),
  ('finance', 'documents.read'), ('finance', 'payments.confirm'), ('finance', 'payments.reconcile'), ('finance', 'financial.write'),
  ('operations', 'org.read'), ('operations', 'flags.read'), ('operations', 'gates.read'), ('operations', 'documents.read'),
  ('operations', 'inventory.adjust'), ('operations', 'fulfillment.process'), ('operations', 'onboarding.review'),
  ('support', 'org.read'), ('support', 'members.read'), ('support', 'invites.read'), ('support', 'profiles.read.basic'),
  ('support', 'applications.read.basic'), ('support', 'flags.read'), ('support', 'gates.read'), ('support', 'documents.read');

-- 6. Policies --------------------------------------------------------------------------
create policy staff_members_select_own on public.staff_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy staff_members_select_admin on public.staff_members
  for select to authenticated using ((select private.has_capability('staff.read')));
create policy staff_roles_select_own on public.staff_roles
  for select to authenticated using (user_id = (select auth.uid()));
create policy staff_roles_select_admin on public.staff_roles
  for select to authenticated using ((select private.has_capability('staff.read')));
create policy capabilities_select_staff on public.capabilities
  for select to authenticated using ((select private.staff_session_ok()));
create policy role_capabilities_select_staff on public.role_capabilities
  for select to authenticated using ((select private.staff_session_ok()));

-- Additive staff read access on 0001 tables (capability-gated; no profiles, billing or secrets).
create policy organizations_select_staff on public.organizations
  for select to authenticated using ((select private.has_capability('org.read')));
create policy organization_members_select_staff on public.organization_members
  for select to authenticated using ((select private.has_capability('members.read')));
create policy organization_invites_select_staff on public.organization_invites
  for select to authenticated using ((select private.has_capability('invites.read')));

-- 7. Grants and revocations ------------------------------------------------------------
revoke all on table public.staff_members, public.staff_roles, public.capabilities, public.role_capabilities
  from public, anon, authenticated, service_role;
revoke all on table private.staff_mfa_enrolment_windows, private.staff_mfa_factors, private.platform_validations
  from public, anon, authenticated, service_role;
grant select on public.staff_members, public.staff_roles, public.capabilities, public.role_capabilities to authenticated;

revoke all on function private.run_auth_structure_check(), private.mfa_check_ok(), private.staff_session_ok(),
                       private.has_capability(text), private.guard_staff_not_member(),
                       private.guard_member_not_staff(), private.guard_last_admin_lock(), private.check_last_admin(),
                       private.guard_enrolment_window_insert(), private.guard_enrolment_window_update(),
                       private.guard_staff_mfa_factor_insert(), private.guard_staff_mfa_factor_update()
  from public, anon, authenticated, service_role;
-- Only the two functions referenced directly by RLS policies are callable by authenticated users.
grant execute on function private.staff_session_ok(), private.has_capability(text) to authenticated;

-- 8. Self-checks -------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array[
    'public.staff_members', 'public.staff_roles', 'public.capabilities', 'public.role_capabilities',
    'private.staff_mfa_enrolment_windows', 'private.staff_mfa_factors', 'private.platform_validations'
  ] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then
      raise exception 'self-check: RLS not enabled on %', t;
    end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) then raise exception 'self-check: anon has % on %', p, t; end if;
      if has_table_privilege('service_role', t, p) then raise exception 'self-check: service_role has % on %', p, t; end if;
      if p <> 'select' and has_table_privilege('authenticated', t, p) then
        raise exception 'self-check: authenticated has % on %', p, t;
      end if;
    end loop;
  end loop;
  foreach t in array array['private.staff_mfa_enrolment_windows', 'private.staff_mfa_factors', 'private.platform_validations'] loop
    if has_table_privilege('authenticated', t, 'select') then
      raise exception 'self-check: authenticated can read %', t;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private'
      and not coalesce((select bool_or(c like 'search_path=%') from unnest(pr.proconfig) c), false)
  ) then
    raise exception 'self-check: function without pinned search_path in schema private';
  end if;
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private'
      and (has_function_privilege('anon', pr.oid, 'execute') or has_function_privilege('service_role', pr.oid, 'execute')
           or has_function_privilege('public', pr.oid, 'execute'))
  ) then
    raise exception 'self-check: a private function is executable by anon, service_role or PUBLIC';
  end if;
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', pr.oid, 'execute')
      and pr.proname not in ('my_org_ids', 'my_owner_org_ids', 'staff_session_ok', 'has_capability')
  ) then
    raise exception 'self-check: unexpected EXECUTE grant to authenticated in schema private';
  end if;
  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgname in (
        'staff_members_not_member', 'organization_members_not_staff',
        'staff_roles_last_admin_lock', 'staff_roles_last_admin_check',
        'staff_members_last_admin_lock', 'staff_members_last_admin_check',
        'staff_members_no_truncate', 'staff_roles_no_truncate',
        'staff_mfa_windows_guard_insert', 'staff_mfa_windows_guard_update',
        'staff_mfa_factors_guard_insert', 'staff_mfa_factors_guard_update')) <> 12 then
    raise exception 'self-check: expected guard triggers are missing';
  end if;
  if (select count(*) from public.capabilities) <> 27 then raise exception 'self-check: capability catalog size'; end if;
  if (select count(*) from public.role_capabilities where role = 'admin') <> 27 then raise exception 'self-check: admin capability count'; end if;
  if (select count(*) from public.role_capabilities where role = 'finance') <> 8 then raise exception 'self-check: finance capability count'; end if;
  if (select count(*) from public.role_capabilities where role = 'operations') <> 7 then raise exception 'self-check: operations capability count'; end if;
  if (select count(*) from public.role_capabilities where role = 'support') <> 8 then raise exception 'self-check: support capability count'; end if;
  -- Staff access must start denied: no validation row may exist until the check is run deliberately.
  if exists (select 1 from private.platform_validations) then raise exception 'self-check: validation row present at install'; end if;
end;
$$;
````

## A3. `supabase/review/static-check.mjs`

````js
// TEXT-PATTERN GUARDRAIL for migration drafts (rev2.1). It is NOT a SQL parser, NOT a proof of correctness and NOT a
// database test. Dependency-free; reads files only; never connects to a database.
// It does NOT validate (among other things): that the SQL parses; policy expression logic; trigger firing order,
// cascade behavior, locking or concurrency; isolation levels in practice; FK action semantics; that function
// bodies are logically correct (it only looks for required words/shapes); that approved-column limits hold for
// aliases other than `f` or for constructs such as to_jsonb(row) / row_to_json(row) that read a row without
// naming its columns; default-privilege effects at runtime. Passing means 'no listed pattern found', nothing more.
// Usage: node supabase/review/static-check.mjs [--selftest] [file.sql ...]   (default: all NNNN_*.sql next to this file)
// These are text-pattern checks only.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase();
const EXEC_ALLOW = new Set(['my_org_ids', 'my_owner_org_ids', 'staff_session_ok', 'has_capability']);
const MFA_COLS = new Set(['id', 'user_id', 'factor_type', 'status', 'created_at']);
const MFA_READERS = new Set(['run_auth_structure_check', 'mfa_check_ok', 'guard_staff_mfa_factor_insert']);
const ISOLATION_FNS = new Set(['guard_organization_members', 'guard_staff_not_member', 'guard_member_not_staff', 'guard_last_admin_lock']);
const TRUNCATE_PROTECTED = ['public.organization_members', 'public.staff_members', 'public.staff_roles'];
const AFTER_CHECKED = ['public.organization_members', 'public.staff_members', 'public.staff_roles'];

function parseFunctions(sql) {
  const re = /create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_]+)\s*\(([^)]*)\)([\s\S]*?)\bas\s+\$\$([\s\S]*?)\$\$/gi;
  const out = []; let m;
  while ((m = re.exec(sql))) out.push({ full: m[1], name: m[1].split('.')[1], schema: m[1].split('.')[0], header: `${m[1]}(${m[2]})${m[3]}`, body: m[4], span: [m.index, re.lastIndex] });
  return out;
}

export function check(name, raw) {
  const sql = strip(raw); const f = []; let m;
  const add = (rule, msg) => f.push(`${rule}: ${msg}`);
  const fns = parseFunctions(sql);
  const nsql = norm(sql);

  // R1 secret column / R2 iat / R3 super_admin / R4 metadata / R10 embedded credentials
  if (/\bsecret\b/i.test(sql)) add('R1-no-secret-column', 'reference to "secret" in code');
  if (/\biat\b/i.test(sql)) add('R2-no-iat', 'reference to jwt iat');
  if (/super[_-]?admin/i.test(sql)) add('R3-no-super-admin', 'super_admin introduced');
  if (/user_metadata|raw_user_meta_data|raw_app_meta_data|app_metadata/i.test(sql)) add('R4-no-metadata-authorization', 'metadata reference');
  if (/eyJ[A-Za-z0-9_-]{10,}|sb_secret_|sb_publishable_|service_role_key/i.test(sql)) add('R10-no-embedded-credentials', 'credential-like string');

  // R5 pinned search_path on definers; R16 functions live in private; R17 no dynamic SQL
  let defs = 0;
  for (const fn of fns) {
    if (fn.schema !== 'private') add('R16-functions-in-private', `function outside schema private: ${fn.full}`);
    const definer = /security\s+definer/i.test(fn.header); if (definer) defs++;
    if (!/set\s+search_path\s*=\s*''/i.test(fn.header)) add('R5-pinned-search-path', `${definer ? 'definer' : 'invoker'} function without search_path='': ${fn.full}`);
    if (/\bexecute\b/i.test(fn.body)) add('R17-no-dynamic-sql', `EXECUTE inside function body: ${fn.full}`);
  }

  // R6/R9 grants
  const grantScan = sql.replace(/'(?:[^']|'')*'/g, "''"); // ignore text inside string literals (error messages)
  const grRe = /\bgrant\b([^;]*?)\bto\b([^;]*);/gi;
  while ((m = grRe.exec(grantScan))) {
    const what = norm(m[1]).trim(); const who = m[2].toLowerCase();
    if (/\b(anon|service_role|public)\b/.test(who)) { add('R6-no-grant-to-anon-service-public', `grant ${what} to${who}`); continue; }
    if (!/\bauthenticated\b/.test(who)) continue;
    if (what.startsWith('select on ')) continue;
    if (what === 'usage on schema private') continue;
    if (/^update \(full_name, phone\) on public\.profiles$/.test(what)) continue;
    const ex = /^execute on function (.+)$/.exec(what);
    if (ex) { const names = ex[1].split(',').map((s) => s.trim().replace(/^private\./, '').replace(/\(.*\)$/, '')); if (names.every((n) => EXEC_ALLOW.has(n))) continue; add('R9-execute-allow-list', `unexpected execute grant: ${what}`); continue; }
    add('R9-authenticated-grants', `unexpected grant to authenticated: ${what}`);
  }

  // R7 permissive true policies
  if (/(using|with\s+check)\s*\(\s*true\s*\)/i.test(sql)) add('R7-no-true-policy', 'using/with check (true)');

  // R8 RLS on every created table; R14 revoke all from the four API roles on every created table
  const tbRe = /create\s+table\s+([a-z_]+\.[a-z_]+)/gi; const tables = [];
  while ((m = tbRe.exec(sql))) tables.push(m[1].toLowerCase());
  for (const t of tables) {
    const e = t.replace('.', '\\.');
    if (!new RegExp(`alter\\s+table\\s+${e}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(sql)) add('R8-rls-enabled', `no enable RLS for ${t}`);
    if (!new RegExp(`revoke\\s+all\\s+on\\s+table[^;]*\\b${e}\\b[^;]*from[^;]*\\banon\\b[^;]*\\bservice_role\\b`, 'i').test(sql)) add('R14-revoke-all-on-every-table', `no revoke-all for ${t}`);
  }

  // R11/R12 mfa_factors: no star selects; alias f limited to approved columns
  if (/select\s+\*|\b\w+\.\*/i.test(sql)) add('R11-no-star-select', 'select * or alias.* found');
  const fcols = new Set(); const fr = /\bf\.([a-z_]+)/gi; while ((m = fr.exec(sql))) fcols.add(m[1].toLowerCase());
  for (const c of fcols) if (!MFA_COLS.has(c)) add('R12-mfa-approved-columns', `alias f uses column ${c}`);

  // R25 auth.mfa_factors referenced only inside the three approved functions
  for (const fn of fns) if (/mfa_factors/i.test(fn.body) && /auth\.mfa_factors/i.test(fn.body) && !MFA_READERS.has(fn.name)) add('R25-mfa-readers', `function ${fn.full} reads auth.mfa_factors but is not an approved reader`);
  let outside = sql; for (const fn of [...fns].reverse()) outside = outside.slice(0, fn.span[0]) + outside.slice(fn.span[1]);
  if (/auth\.mfa_factors/i.test(outside)) add('R25-mfa-readers', 'auth.mfa_factors referenced outside an approved function');

  // R13 no TRUNCATE statements
  if (/(^|;)\s*truncate\b/i.test(sql)) add('R13-no-truncate', 'truncate statement');

  // R18 guard functions that count across rows assert READ COMMITTED
  for (const fn of fns) if (ISOLATION_FNS.has(fn.name) && !/transaction_isolation/i.test(fn.body)) add('R18-read-committed-guard', `${fn.full} does not assert READ COMMITTED`);

  // R19 mfa factor approval trigger uses clock_timestamp and locks the window row
  for (const fn of fns) if (/guard_staff_mfa_factor_insert/.test(fn.name)) {
    if (!/clock_timestamp\s*\(\)/i.test(fn.body)) add('R19-clock-timestamp', `${fn.full} must use clock_timestamp() for window expiry`);
    if (!/for\s+update/i.test(fn.body)) add('R19-lock-window', `${fn.full} must lock the window row FOR UPDATE`);
    for (const need of ['revoked', 'consumed', 'verified', "'totp'"]) if (!new RegExp(need, 'i').test(fn.body)) add('R19-approval-conditions', `${fn.full} lacks a check for ${need}`);
  }

  // R20 fail-closed functions
  for (const fn of fns) {
    if (fn.name === 'mfa_check_ok') {
      if (!/exception\s+when\s+others\s+then\s+return\s+false/i.test(fn.body)) add('R20-fail-closed', 'mfa_check_ok lacks "exception when others then return false"');
      if (!/checked_at\s*<=\s*now\(\)/i.test(fn.body) || !/interval\s+'24 hours'/i.test(fn.body)) add('R21-validation-freshness', 'mfa_check_ok must reject stale (24 h) and future-dated validation records');
      if (!/status\s+is\s+null/i.test(fn.body) || !/factor_type\s+is\s+null/i.test(fn.body)) add('R20-fail-closed', 'mfa_check_ok must treat NULL status/factor_type as unreadable');
    }
    if (fn.name === 'run_auth_structure_check') {
      if (!/exception\s+when\s+others/i.test(fn.body) || !/'failed'/.test(fn.body)) add('R20-fail-closed', 'run_auth_structure_check must record failure on any exception');
      for (const need of ['data_type', 'pg_enum', 'enumlabel', 'uuid', 'timestamp with time zone']) if (!new RegExp(need, 'i').test(fn.body)) add('R22-structure-types', `run_auth_structure_check does not verify ${need}`);
    }
  }
  if (/create\s+table\s+private\.platform_validations/i.test(sql) && !/platform_validations_passed_consistent/i.test(sql)) add('R21-validation-freshness', 'platform_validations lacks the passed-consistency constraint');

  // R23 truncate protection and AFTER final-state checks for tables defined in this file
  for (const t of TRUNCATE_PROTECTED) if (tables.includes(t) && !new RegExp(`before\\s+truncate\\s+on\\s+${t.replace('.', '\\.')}`, 'i').test(sql)) add('R23-truncate-blocked', `no BEFORE TRUNCATE trigger on ${t}`);
  for (const t of AFTER_CHECKED) if (tables.includes(t) && t !== 'public.organization_members' ? !new RegExp(`after\\s+update\\s+or\\s+delete\\s+on\\s+${t.replace('.', '\\.')}`, 'i').test(sql) : (tables.includes(t) && !new RegExp(`after\\s+update\\s+or\\s+delete\\s+on\\s+${t.replace('.', '\\.')}`, 'i').test(sql))) add('R24-after-final-state-check', `no AFTER UPDATE OR DELETE trigger on ${t}`);

  // R26 factor approval binding constraints (when the table is defined here)
  if (tables.includes('private.staff_mfa_factors')) {
    if (!/unique\s*\(\s*window_id\s*\)/i.test(sql)) add('R26-factor-binding', 'staff_mfa_factors lacks unique (window_id)');
    if (!/foreign\s+key\s*\(\s*window_id\s*,\s*user_id\s*\)\s*references\s+private\.staff_mfa_enrolment_windows\s*\(\s*id\s*,\s*target_user_id\s*\)/i.test(sql)) add('R26-factor-binding', 'staff_mfa_factors lacks composite FK (window_id, user_id) -> windows (id, target_user_id)');
    if (!/guard_staff_mfa_factor_update/i.test(sql) || !/guard_enrolment_window_update/i.test(sql)) add('R26-factor-binding', 'missing immutability triggers for approvals/windows');
  }

  // R27 staff/member exclusion covers INSERT and UPDATE on both sides; staff identity immutable
  if (tables.includes('public.staff_members')) {
    if (!/before\s+insert\s+or\s+update\s+on\s+public\.staff_members/i.test(sql)) add('R27-exclusion-coverage', 'staff-side exclusion trigger must be BEFORE INSERT OR UPDATE');
    if (!/before\s+insert\s+or\s+update\s+on\s+public\.organization_members/i.test(sql)) add('R27-exclusion-coverage', 'member-side exclusion trigger must be BEFORE INSERT OR UPDATE');
    const g = fns.find((x) => x.name === 'guard_staff_not_member');
    if (g && !/user_id\s*<>\s*old\.user_id/i.test(g.body)) add('R27-exclusion-coverage', 'staff_members.user_id immutability missing');
    for (const x of ['guard_staff_not_member', 'guard_member_not_staff']) { const fx = fns.find((y) => y.name === x); if (fx && !/pg_advisory_xact_lock/i.test(fx.body)) add('R27-exclusion-coverage', `${x} lacks the per-user advisory lock`); }
  }

  // R28 last-admin: lock before change, marker for AFTER check
  const la = fns.find((x) => x.name === 'guard_last_admin_lock');
  if (la && (!/pg_advisory_xact_lock/i.test(la.body) || !/set_config\s*\(\s*'m1\.admin_shrink'/i.test(la.body))) add('R28-last-admin', 'guard_last_admin_lock must take the advisory lock and set the m1.admin_shrink marker');
  const lc = fns.find((x) => x.name === 'check_last_admin');
  if (lc && !/m1\.admin_shrink/i.test(lc.body)) add('R28-last-admin', 'check_last_admin must read the m1.admin_shrink marker');

  return { name, failures: f, stats: { functions: fns.length, definers: defs, tables: tables.length, mfaColumns: [...fcols].sort().join(',') } };
}

function selftest() {
  const okFn = "create function private.a() returns int language sql security definer set search_path = '' as $$ select 1 $$;";
  const bad = [
    ['secret column', "select f.secret from auth.mfa_factors f;", 'R1-no-secret-column'],
    ['iat', "select auth.jwt() ->> 'iat';", 'R2-no-iat'],
    ['super_admin', "insert into t values ('super_admin');", 'R3-no-super-admin'],
    ['metadata', "using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')", 'R4-no-metadata-authorization'],
    ['invoker without path', "create function private.a() returns int language sql as $$ select 1 $$;", 'R5-pinned-search-path'],
    ['definer without path', "create function private.a() returns int language sql security definer as $$ select 1 $$;", 'R5-pinned-search-path'],
    ['grant to anon', "grant select on public.t to anon;", 'R6-no-grant-to-anon-service-public'],
    ['true policy', "create policy p on public.t for select using (true);", 'R7-no-true-policy'],
    ['no rls', "create table public.nope (a int);", 'R8-rls-enabled'],
    ['broad grant', "grant insert on public.t to authenticated;", 'R9-authenticated-grants'],
    ['star select', "select * from auth.mfa_factors;", 'R11-no-star-select'],
    ['bad column', "select f.phone from auth.mfa_factors f;", 'R12-mfa-approved-columns'],
    ['truncate stmt', "truncate public.x;", 'R13-no-truncate'],
    ['no revoke-all', "create table public.t (a int); alter table public.t enable row level security;", 'R14-revoke-all-on-every-table'],
    ['public fn', "create function public.a() returns int language sql set search_path = '' as $$ select 1 $$;", 'R16-functions-in-private'],
    ['dynamic sql', "create function private.a() returns int language plpgsql security definer set search_path = '' as $$ begin execute 'select 1'; return 1; end $$;", 'R17-no-dynamic-sql'],
    ['no isolation assert', "create function private.guard_last_admin_lock() returns trigger language plpgsql security definer set search_path = '' as $$ begin return new; end $$;", 'R18-read-committed-guard'],
    ['approval without clock', "create function private.guard_staff_mfa_factor_insert() returns trigger language plpgsql security definer set search_path = '' as $$ begin perform now(); return new; end $$;", 'R19-clock-timestamp'],
    ['mfa_check_ok not fail closed', "create function private.mfa_check_ok() returns boolean language plpgsql security definer set search_path = '' as $$ begin return true; end $$;", 'R20-fail-closed'],
    ['no freshness', "create function private.mfa_check_ok() returns boolean language plpgsql security definer set search_path = '' as $$ begin return true; exception when others then return false; end $$;", 'R21-validation-freshness'],
    ['structure types missing', "create function private.run_auth_structure_check() returns text language plpgsql security definer set search_path = '' as $$ begin begin null; exception when others then null; end; return 'failed'; end $$;", 'R22-structure-types'],
    ['no truncate block', "create table public.staff_members (a int); alter table public.staff_members enable row level security; revoke all on table public.staff_members from public, anon, authenticated, service_role;", 'R23-truncate-blocked'],
    ['no after check', "create table public.staff_roles (a int); alter table public.staff_roles enable row level security; revoke all on table public.staff_roles from public, anon, authenticated, service_role;", 'R24-after-final-state-check'],
    ['non-reader reads mfa', "create function private.other() returns int language sql security definer set search_path = '' as $$ select count(*) from auth.mfa_factors f $$;", 'R25-mfa-readers'],
    ['factor binding missing', "create table private.staff_mfa_factors (factor_id uuid, user_id uuid, window_id uuid); alter table private.staff_mfa_factors enable row level security; revoke all on table private.staff_mfa_factors from public, anon, authenticated, service_role;", 'R26-factor-binding'],
    ['exclusion insert only', "create table public.staff_members (a int); alter table public.staff_members enable row level security; revoke all on table public.staff_members from public, anon, authenticated, service_role; create trigger t before insert on public.staff_members for each row execute function private.x();", 'R27-exclusion-coverage'],
    ['last admin w/o marker', "create function private.guard_last_admin_lock() returns trigger language plpgsql security definer set search_path = '' as $$ begin if current_setting('transaction_isolation') <> 'read committed' then return null; end if; return new; end $$;", 'R28-last-admin'],
  ];
  let ok = true;
  for (const [label, sql, rule] of bad) { const r = check('selftest', sql); const hit = r.failures.some((x) => x.startsWith(rule)); ok = ok && hit; console.log(`selftest ${label}: ${hit ? 'caught' : 'MISSED'} (${rule})`); }
  const strSample = check('selftest', `${okFn} select 'unexpected EXECUTE grant to authenticated in schema private';`);
  const strOk = !strSample.failures.some((x) => x.startsWith('R9') || x.startsWith('R6')); ok = ok && strOk; console.log(`selftest grant text inside a string literal ignored: ${strOk ? 'ok' : 'FALSE POSITIVE'}`);
  const clean = check('selftest', `-- secret and iat in a comment are fine\n${okFn}`);
  const cleanOk = clean.failures.length === 0; ok = ok && cleanOk; console.log(`selftest comment-stripping/clean sample: ${cleanOk ? 'ok' : 'FALSE POSITIVE ' + clean.failures.join('|')}`);
  console.log(`SELFTEST ${ok ? 'PASS' : 'FAIL'} (${bad.length} violation samples + 1 clean sample)`); process.exitCode = ok ? 0 : 1;
}

if (process.argv[1]?.endsWith('static-check.mjs')) {
  if (process.argv.includes('--selftest')) selftest();
  else {
    const dir = dirname(fileURLToPath(import.meta.url));
    let files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    if (!files.length) files = readdirSync(dir).filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort().map((x) => join(dir, x));
    let bad = 0;
    for (const file of files) {
      const r = check(file.split(/[\\/]/).pop(), readFileSync(file, 'utf8'));
      console.log(`${r.name}: ${r.failures.length ? 'FAIL' : 'PASS'}  (functions=${r.stats.functions}, definers=${r.stats.definers}, tables=${r.stats.tables}, mfa columns referenced=[${r.stats.mfaColumns || 'none'}])`);
      for (const x of r.failures) console.log('  - ' + x);
      bad += r.failures.length;
    }
    console.log(bad ? `STATIC CHECK FAIL (${bad})` : 'STATIC CHECK PASS (text-pattern guardrail only: no SQL was parsed or executed; not a proof of correctness)');
    process.exitCode = bad ? 1 : 0;
  }
}
````

## A4. Diff `supabase/review/history/0002_staff_capabilities.rev2-to-rev2.1.diff`

````diff
--- history/0002_staff_capabilities.rev2.sql	2026-11-07 11:31:31.658080400 +0530
+++ 0002_staff_capabilities.sql	2026-11-07 11:32:00.194377800 +0530
@@ -20,6 +20,11 @@
 --      cascade safe); TRUNCATE blocked on staff tables.
 --  F-5 structure check also verifies data types and required enum labels; passed rows must be self-consistent;
 --      validation records must not be future-dated.
+-- rev2.1 (review pass 2): (a) the composite FK window->factor is ON DELETE CASCADE so staff deletion cannot be
+--   blocked by FK action ordering (NO ACTION would be checked after the window cascade while approval rows
+--   still exist); (b) the window update trigger lets ON DELETE SET NULL (an UPDATE) clear authorized_by and
+--   revoked_by, but never set them to another value. Approval and window deletion semantics: see the review
+--   document, section 'Review pass 2'.
 -- Lock hierarchy (always acquire in this order): (1) advisory 'm1:last_admin', (2) organization row,
 --   (3) per-user advisory lock. No path acquires them in a different order.
 -- =====================================================================================
@@ -81,7 +86,7 @@
   window_id   uuid not null,
   approved_at timestamptz not null default now(),
   constraint staff_mfa_factors_window_user_fk foreign key (window_id, user_id)
-    references private.staff_mfa_enrolment_windows (id, target_user_id),
+    references private.staff_mfa_enrolment_windows (id, target_user_id) on delete cascade,
   constraint staff_mfa_factors_user_fk foreign key (user_id) references public.staff_members (user_id) on delete cascade,
   constraint staff_mfa_factors_one_per_window unique (window_id)
 );
@@ -380,12 +385,13 @@
 as $$
 begin
   if new.id <> old.id or new.target_user_id <> old.target_user_id
-     or new.authorized_by is distinct from old.authorized_by
+     or (new.authorized_by is distinct from old.authorized_by and new.authorized_by is not null)
      or new.authorized_at <> old.authorized_at or new.expires_at <> old.expires_at or new.reason <> old.reason then
     raise exception 'enrolment window identity, target, authorizer, timing and reason are immutable' using errcode = '23514';
   end if;
   if old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at
-       or new.revoked_by is distinct from old.revoked_by or new.revoke_reason is distinct from old.revoke_reason) then
+       or (new.revoked_by is distinct from old.revoked_by and new.revoked_by is not null)
+       or new.revoke_reason is distinct from old.revoke_reason) then
     raise exception 'a revoked enrolment window cannot be changed' using errcode = '23514';
   end if;
   if old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then
````

## A5. Diff `supabase/review/history/static-check.rev2-to-rev2.1.diff`

````diff
--- history/static-check.rev2.mjs	2026-11-07 11:31:31.690857800 +0530
+++ static-check.mjs	2026-11-07 11:32:00.204674900 +0530
@@ -1,6 +1,12 @@
-// Static review checks for migration drafts (rev2). Dependency-free. Reads files only; never connects to a database.
+// TEXT-PATTERN GUARDRAIL for migration drafts (rev2.1). It is NOT a SQL parser, NOT a proof of correctness and NOT a
+// database test. Dependency-free; reads files only; never connects to a database.
+// It does NOT validate (among other things): that the SQL parses; policy expression logic; trigger firing order,
+// cascade behavior, locking or concurrency; isolation levels in practice; FK action semantics; that function
+// bodies are logically correct (it only looks for required words/shapes); that approved-column limits hold for
+// aliases other than `f` or for constructs such as to_jsonb(row) / row_to_json(row) that read a row without
+// naming its columns; default-privilege effects at runtime. Passing means 'no listed pattern found', nothing more.
 // Usage: node supabase/review/static-check.mjs [--selftest] [file.sql ...]   (default: all NNNN_*.sql next to this file)
-// These are TEXT checks. They prove properties of the source text, not runtime behavior.
+// These are text-pattern checks only.
 import { readFileSync, readdirSync } from 'node:fs';
 import { dirname, join } from 'node:path';
 import { fileURLToPath } from 'node:url';
@@ -189,7 +195,7 @@
       for (const x of r.failures) console.log('  - ' + x);
       bad += r.failures.length;
     }
-    console.log(bad ? `STATIC CHECK FAIL (${bad})` : 'STATIC CHECK PASS (text checks only; no SQL was executed)');
+    console.log(bad ? `STATIC CHECK FAIL (${bad})` : 'STATIC CHECK PASS (text-pattern guardrail only: no SQL was parsed or executed; not a proof of correctness)');
     process.exitCode = bad ? 1 : 0;
   }
 }
````

## A6. Diff `supabase/review/history/0001_foundation_identity.rev1-to-rev2.diff`

````diff
--- history/0001_foundation_identity.rev1.sql	2026-11-07 11:18:06.042021500 +0530
+++ 0001_foundation_identity.sql	2026-11-07 11:22:25.947757100 +0530
@@ -1,6 +1,9 @@
 -- =====================================================================================
 -- 0001_foundation_identity.sql
--- *** REVIEW DRAFT. NOT APPLIED. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
+-- *** REVIEW DRAFT rev2. NOT APPLIED. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
+-- rev2 changes: last-owner protection is now BEFORE (lock + immutability) plus AFTER (final-state check,
+--   catches multi-row statements and FK cascades); READ COMMITTED required by guards; TRUNCATE blocked on
+--   organization_members; self-check also verifies the guard triggers exist.
 -- Source of truth: docs/MILESTONE-1-SCHEMA-AND-RLS.md (rev. 4), project-rules.md.
 -- Scope: identity and organization foundation only. No staff objects (0002), no audit (0003),
 --        no step-up (0004), no RPCs (0007). Customers get read access to their own data only.
@@ -142,8 +145,9 @@
 end;
 $$;
 
+-- Invoker rights are enough: compares NEW and OLD only, reads no table.
 create function private.guard_organizations() returns trigger
-language plpgsql security definer set search_path = ''
+language plpgsql set search_path = ''
 as $$
 begin
   if new.code <> old.code then
@@ -153,16 +157,18 @@
 end;
 $$;
 
--- Last-owner protection and identity immutability. Caller-independent (also binds service paths).
--- Serialization: the organization row is locked FOR UPDATE before counting, so concurrent
--- demotions/removals queue; in READ COMMITTED the later one re-counts after the earlier commits.
+-- Last-owner protection, part 1 (BEFORE row): identity immutability and serialization.
+-- The organization row is locked FOR UPDATE before the owner row changes, so concurrent demotions or
+-- removals for the same organization queue. Guards require READ COMMITTED: under a snapshot isolation
+-- level a later transaction could keep counting a stale owner set and slip through (write skew).
 create function private.guard_organization_members() returns trigger
 language plpgsql security definer set search_path = ''
 as $$
-declare
-  v_org_status text;
-  v_remaining  integer;
 begin
+  if current_setting('transaction_isolation') <> 'read committed' then
+    raise exception 'organization_members changes require READ COMMITTED isolation' using errcode = '25000';
+  end if;
+
   if tg_op = 'UPDATE' then
     if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
       raise exception 'organization_members: organization_id and user_id are immutable' using errcode = '23514';
@@ -171,23 +177,49 @@
 
   if old.role = 'owner' and old.status = 'active'
      and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
-    select o.status into v_org_status
-      from public.organizations o where o.id = old.organization_id for update;
-    if v_org_status is distinct from 'closed' then
+    perform 1 from public.organizations o where o.id = old.organization_id for update;
+  end if;
+
+  if tg_op = 'DELETE' then
+    return old;
+  end if;
+  return new;
+end;
+$$;
+
+-- Last-owner protection, part 2 (AFTER row): final-state check. AFTER row triggers run when the whole
+-- statement (or the FK cascade action) has finished, so a statement that removes several owners at once
+-- is judged on its result, not row by row. Closing the organization in the same transaction is allowed.
+create function private.check_last_owner() returns trigger
+language plpgsql security definer set search_path = ''
+as $$
+declare
+  v_org_status text;
+  v_remaining  integer;
+begin
+  if old.role = 'owner' and old.status = 'active'
+     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
+    select o.status into v_org_status from public.organizations o where o.id = old.organization_id;
+    if found and v_org_status is distinct from 'closed' then
       select count(*) into v_remaining
         from public.organization_members m
-       where m.organization_id = old.organization_id
-         and m.role = 'owner' and m.status = 'active' and m.id <> old.id;
+       where m.organization_id = old.organization_id and m.role = 'owner' and m.status = 'active';
       if v_remaining = 0 then
         raise exception 'last active owner of an organization cannot be removed or demoted' using errcode = '23514';
       end if;
     end if;
   end if;
+  return null;
+end;
+$$;
 
-  if tg_op = 'DELETE' then
-    return old;
-  end if;
-  return new;
+-- TRUNCATE bypasses row triggers, so it is refused on tables that carry invariants.
+create function private.block_truncate() returns trigger
+language plpgsql set search_path = ''
+as $$
+begin
+  raise exception 'TRUNCATE is not permitted on %', tg_table_name using errcode = '42501';
+  return null;
 end;
 $$;
 
@@ -202,6 +234,10 @@
   for each row execute function private.guard_organizations();
 create trigger organization_members_guard before update or delete on public.organization_members
   for each row execute function private.guard_organization_members();
+create trigger organization_members_last_owner_check after update or delete on public.organization_members
+  for each row execute function private.check_last_owner();
+create trigger organization_members_no_truncate before truncate on public.organization_members
+  for each statement execute function private.block_truncate();
 -- Assumption to confirm by test (T-0001-9): firing this trigger needs no EXECUTE/USAGE check
 -- for supabase_auth_admin at fire time (privileges are checked at creation).
 create trigger on_auth_user_created after insert on auth.users
@@ -238,7 +274,7 @@
 
 revoke all on function private.my_org_ids(), private.my_owner_org_ids(), private.touch_updated_at(),
                        private.handle_new_user(), private.guard_organizations(),
-                       private.guard_organization_members()
+                       private.guard_organization_members(), private.check_last_owner(), private.block_truncate()
   from public, anon, authenticated, service_role;
 grant execute on function private.my_org_ids(), private.my_owner_org_ids() to authenticated;  -- used by policies only
 
@@ -271,12 +307,17 @@
      or has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'update') then
     raise exception 'self-check: authenticated can update protected profile columns';
   end if;
+  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgname in (
+        'organization_members_guard', 'organization_members_last_owner_check',
+        'organization_members_no_truncate', 'organizations_guard', 'on_auth_user_created')) <> 5 then
+    raise exception 'self-check: expected guard triggers are missing';
+  end if;
   if exists (
     select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
-    where n.nspname = 'private' and pr.prosecdef
+    where n.nspname = 'private'
       and not coalesce((select bool_or(c like 'search_path=%') from unnest(pr.proconfig) c), false)
   ) then
-    raise exception 'self-check: SECURITY DEFINER function without pinned search_path in schema private';
+    raise exception 'self-check: function without pinned search_path in schema private';
   end if;
 end;
 $$;
````

## A7. Diff `supabase/review/history/0002_staff_capabilities.rev1-to-rev2.diff`

````diff
--- history/0002_staff_capabilities.rev1.sql	2026-11-07 11:18:06.084792500 +0530
+++ 0002_staff_capabilities.sql	2026-11-07 11:22:25.947757100 +0530
@@ -1,14 +1,27 @@
 -- =====================================================================================
 -- 0002_staff_capabilities.sql
--- *** REVIEW DRAFT. NOT APPLIED. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
+-- *** REVIEW DRAFT rev2. NOT APPLIED. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
 -- Depends on 0001. Source of truth: docs/MILESTONE-1-SCHEMA-AND-RLS.md (rev. 4) sections 2.5, 2.6, 3, 5.12.
 -- Scope: staff roles and capabilities, staff/member exclusion, last-admin guard, staff read policies,
 --        MFA structure validation and the approved-factor binding (fail closed, all factor types),
---        enrolment-window and approved-factor tables.
+--        enrolment-window and approved-factor tables WITH database-level approval rules.
 -- NOT in this migration (by the approved sequence): step-up objects and owner-grant checks (0004,
 --   authored only after V5b passes), audit log (0003), RPCs incl. window authorize/revoke/check/claim
 --   (0007), cron schedules.
 -- Staff access stays DENIED until private.run_auth_structure_check() has recorded 'passed'.
+--
+-- rev2 changes (see docs/M1-MIGRATIONS-0001-0002-REVIEW.md):
+--  F-1 staff-side exclusion guard now covers INSERT and UPDATE, makes staff_members.user_id immutable,
+--      re-checks on reactivation; both directions keep the per-user advisory lock; READ COMMITTED required.
+--  F-2 approved factors are bound to a valid window in the database: composite FK (window, user), one factor
+--      per window, validation trigger (window open, unexpired, unrevoked, unconsumed, target active, factor
+--      verified TOTP of that user created inside the window), approvals immutable, windows immutable.
+--  F-3 last-admin guard is BEFORE (lock + READ COMMITTED) plus AFTER (final-state check, multi-row and
+--      cascade safe); TRUNCATE blocked on staff tables.
+--  F-5 structure check also verifies data types and required enum labels; passed rows must be self-consistent;
+--      validation records must not be future-dated.
+-- Lock hierarchy (always acquire in this order): (1) advisory 'm1:last_admin', (2) organization row,
+--   (3) per-user advisory lock. No path acquires them in a different order.
 -- =====================================================================================
 
 -- 1. Tables ----------------------------------------------------------------------------
@@ -53,30 +66,44 @@
   reason         text not null check (char_length(btrim(reason)) between 1 and 200),
   constraint staff_mfa_windows_bounded check (expires_at > authorized_at and expires_at <= authorized_at + interval '60 minutes'),
   constraint staff_mfa_windows_not_self check (authorized_by is null or authorized_by <> target_user_id),
-  constraint staff_mfa_windows_single_outcome check (not (consumed_at is not null and revoked_at is not null))
+  constraint staff_mfa_windows_single_outcome check (not (consumed_at is not null and revoked_at is not null)),
+  constraint staff_mfa_windows_id_target_key unique (id, target_user_id)
 );
 create unique index staff_mfa_windows_one_open_idx
   on private.staff_mfa_enrolment_windows (target_user_id) where consumed_at is null and revoked_at is null;
 
--- Factors that count. No FK to auth.mfa_factors on purpose (auth schema is not our API).
+-- Factors that count. No FK to auth.mfa_factors on purpose (auth schema is not our API); the insert trigger
+-- below verifies the factor against it instead. The composite FK forces window target = factor user, and
+-- unique (window_id) allows one approved factor per window (single use).
 create table private.staff_mfa_factors (
   factor_id   uuid primary key,
-  user_id     uuid not null references public.staff_members (user_id) on delete cascade,
-  window_id   uuid not null references private.staff_mfa_enrolment_windows (id),
-  approved_at timestamptz not null default now()
+  user_id     uuid not null,
+  window_id   uuid not null,
+  approved_at timestamptz not null default now(),
+  constraint staff_mfa_factors_window_user_fk foreign key (window_id, user_id)
+    references private.staff_mfa_enrolment_windows (id, target_user_id),
+  constraint staff_mfa_factors_user_fk foreign key (user_id) references public.staff_members (user_id) on delete cascade,
+  constraint staff_mfa_factors_one_per_window unique (window_id)
 );
 create index staff_mfa_factors_user_idx on private.staff_mfa_factors (user_id);
 
--- Result of the structure check. Diagnostics hold column NAMES of the expected set and a count only.
+-- Result of the structure check. Diagnostics hold names from a fixed expected set, counts, SQLSTATE and the
+-- server version only. A 'passed' row must be self-consistent.
 create table private.platform_validations (
-  check_name              text primary key,
-  status                  text not null check (status in ('passed', 'failed')),
-  checked_at              timestamptz not null default now(),
-  sqlstate                text,
-  expected_columns        text[] not null,
+  check_name               text primary key,
+  status                   text not null check (status in ('passed', 'failed')),
+  checked_at               timestamptz not null default now(),
+  sqlstate                 text,
+  expected_columns         text[] not null,
   present_expected_columns text[] not null,
-  other_column_count      integer not null,
-  server_version          text not null
+  other_column_count       integer not null,
+  type_checks_passed       integer not null default 0,
+  enum_labels_ok           boolean not null default false,
+  server_version           text not null,
+  constraint platform_validations_passed_consistent check (
+    status <> 'passed'
+    or (sqlstate is null and present_expected_columns = expected_columns and type_checks_passed = 5 and enum_labels_ok)
+  )
 );
 
 -- 2. Row Level Security ----------------------------------------------------------------
@@ -90,32 +117,49 @@
 
 -- 3. Functions (all in private; all pinned) --------------------------------------------
 
--- Records whether auth.mfa_factors still has the structure we depend on. Reads column names from the
--- catalogue and runs a zero-row probe over the approved columns only. No row data is read.
+-- Records whether auth.mfa_factors still has the structure we depend on: expected column names, compatible
+-- data types, required enum labels, and a zero-row probe over the approved columns only. No row data is
+-- read. Any error is recorded as 'failed'. Not executable by any API role.
 create function private.run_auth_structure_check() returns text
 language plpgsql volatile security definer set search_path = ''
 as $$
 declare
-  v_expected constant text[] := array['created_at', 'factor_type', 'id', 'status', 'user_id'];
-  v_present  text[] := '{}';
-  v_other    integer := 0;
-  v_status   text := 'failed';
-  v_sqlstate text := null;
-  v_probe    bigint;
+  v_expected      constant text[] := array['created_at', 'factor_type', 'id', 'status', 'user_id'];
+  v_present       text[] := '{}';
+  v_other         integer := 0;
+  v_types_ok      integer := 0;
+  v_status_labels integer := 0;
+  v_type_labels   integer := 0;
+  v_status        text := 'failed';
+  v_sqlstate      text := null;
+  v_probe         bigint;
 begin
   begin
     select coalesce(array_agg(c.column_name::text order by c.column_name::text)
                       filter (where c.column_name::text = any (v_expected)), '{}'),
-           count(*) filter (where not (c.column_name::text = any (v_expected)))
-      into v_present, v_other
+           count(*) filter (where not (c.column_name::text = any (v_expected))),
+           count(*) filter (where (c.column_name::text in ('id', 'user_id') and c.data_type::text = 'uuid')
+                               or (c.column_name::text = 'created_at' and c.data_type::text = 'timestamp with time zone')
+                               or (c.column_name::text in ('status', 'factor_type') and c.data_type::text = 'USER-DEFINED'))
+      into v_present, v_other, v_types_ok
       from information_schema.columns c
      where c.table_schema = 'auth' and c.table_name = 'mfa_factors';
 
+    select count(distinct e.enumlabel) filter (where a.attname = 'status' and e.enumlabel in ('verified', 'unverified')),
+           count(distinct e.enumlabel) filter (where a.attname = 'factor_type' and e.enumlabel = 'totp')
+      into v_status_labels, v_type_labels
+      from pg_catalog.pg_attribute a
+      join pg_catalog.pg_class cl on cl.oid = a.attrelid
+      join pg_catalog.pg_namespace ns on ns.oid = cl.relnamespace
+      join pg_catalog.pg_enum e on e.enumtypid = a.atttypid
+     where ns.nspname = 'auth' and cl.relname = 'mfa_factors'
+       and a.attname in ('status', 'factor_type') and not a.attisdropped;
+
     select count(*) into v_probe
       from (select f.id, f.user_id, f.factor_type::text, f.status::text, f.created_at
               from auth.mfa_factors f limit 0) s;
 
-    if v_present = v_expected then
+    if v_present = v_expected and v_types_ok = 5 and v_status_labels = 2 and v_type_labels = 1 then
       v_status := 'passed';
     end if;
   exception when others then
@@ -124,22 +168,25 @@
   end;
 
   insert into private.platform_validations
-    (check_name, status, checked_at, sqlstate, expected_columns, present_expected_columns, other_column_count, server_version)
+    (check_name, status, checked_at, sqlstate, expected_columns, present_expected_columns, other_column_count,
+     type_checks_passed, enum_labels_ok, server_version)
   values
     ('auth_mfa_factors_shape', v_status, now(), v_sqlstate, v_expected, coalesce(v_present, '{}'), coalesce(v_other, 0),
+     coalesce(v_types_ok, 0), (coalesce(v_status_labels, 0) = 2 and coalesce(v_type_labels, 0) = 1),
      current_setting('server_version'))
   on conflict (check_name) do update
     set status = excluded.status, checked_at = excluded.checked_at, sqlstate = excluded.sqlstate,
         expected_columns = excluded.expected_columns, present_expected_columns = excluded.present_expected_columns,
-        other_column_count = excluded.other_column_count, server_version = excluded.server_version;
+        other_column_count = excluded.other_column_count, type_checks_passed = excluded.type_checks_passed,
+        enum_labels_ok = excluded.enum_labels_ok, server_version = excluded.server_version;
   return v_status;
 end;
 $$;
 
--- TRUE only if: a fresh passed structure check exists AND the caller has at least one approved TOTP factor
--- AND the caller has NO verified factor (of ANY type) that is not approved AND no factor row has an
--- unreadable or unrecognized type/status. Any error returns FALSE (fail closed).
--- Only id, user_id, factor_type, status, created_at are referenced.
+-- TRUE only if: a fresh, not future-dated, passed structure check exists AND the caller has at least one
+-- approved TOTP factor AND no verified factor (of ANY type) that is not approved AND no factor row with an
+-- unreadable or unrecognized type/status. Any error returns FALSE (fail closed), which also covers structure
+-- drift between scheduled checks. Only id, user_id, factor_type, status, created_at are referenced.
 create function private.mfa_check_ok() returns boolean
 language plpgsql stable security definer set search_path = ''
 as $$
@@ -156,6 +203,7 @@
     select 1 from private.platform_validations v
      where v.check_name = 'auth_mfa_factors_shape' and v.status = 'passed'
        and v.checked_at > now() - interval '24 hours'
+       and v.checked_at <= now()
   ) then
     return false;
   end if;
@@ -206,24 +254,37 @@
          );
 $$;
 
--- Staff and organization members are mutually exclusive. Per-user advisory lock prevents write skew.
+-- Staff and organization members are mutually exclusive (any staff row, any status, blocks an active
+-- membership). Staff side: runs on INSERT and on every UPDATE; identity is immutable; the per-user advisory
+-- lock serializes against the member side. Requires READ COMMITTED so the second transaction sees the first
+-- one's committed row after the lock is released at commit.
 create function private.guard_staff_not_member() returns trigger
 language plpgsql security definer set search_path = ''
 as $$
 begin
+  if current_setting('transaction_isolation') <> 'read committed' then
+    raise exception 'staff_members changes require READ COMMITTED isolation' using errcode = '25000';
+  end if;
+  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
+    raise exception 'staff_members.user_id is immutable' using errcode = '23514';
+  end if;
   perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
   if exists (select 1 from public.organization_members m where m.user_id = new.user_id and m.status = 'active') then
-    raise exception 'a user with an active organization membership cannot become staff' using errcode = '23514';
+    raise exception 'a user with an active organization membership cannot be staff' using errcode = '23514';
   end if;
   return new;
 end;
 $$;
 
+-- Member side: INSERT and UPDATE that produce an active membership.
 create function private.guard_member_not_staff() returns trigger
 language plpgsql security definer set search_path = ''
 as $$
 begin
   if new.status = 'active' then
+    if current_setting('transaction_isolation') <> 'read committed' then
+      raise exception 'organization_members changes require READ COMMITTED isolation' using errcode = '25000';
+    end if;
     perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
     if exists (select 1 from public.staff_members s where s.user_id = new.user_id) then
       raise exception 'a staff user cannot be an active organization member' using errcode = '23514';
@@ -233,51 +294,212 @@
 end;
 $$;
 
--- At least one active admin must always remain. A single advisory lock serializes concurrent changes.
-create function private.guard_last_admin() returns trigger
+-- Last-admin protection, part 1 (BEFORE row): READ COMMITTED required; takes the single admin advisory
+-- lock whenever the row change could shrink the set of active admins.
+create function private.guard_last_admin_lock() returns trigger
 language plpgsql security definer set search_path = ''
 as $$
 declare
-  v_uid       uuid := old.user_id;
-  v_removes   boolean := false;
-  v_remaining integer;
+  v_shrinks boolean := false;
 begin
+  if current_setting('transaction_isolation') <> 'read committed' then
+    raise exception 'staff changes require READ COMMITTED isolation' using errcode = '25000';
+  end if;
   if tg_table_name = 'staff_roles' then
-    v_removes := old.role = 'admin'
-                 and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id);
+    v_shrinks := old.role = 'admin'
+                 and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id)
+                 and exists (select 1 from public.staff_members s where s.user_id = old.user_id and s.status = 'active');
   else
-    v_removes := old.status = 'active'
+    v_shrinks := old.status = 'active'
                  and (tg_op = 'DELETE' or new.status <> 'active')
-                 and exists (select 1 from public.staff_roles r where r.user_id = v_uid and r.role = 'admin');
+                 and exists (select 1 from public.staff_roles r where r.user_id = old.user_id and r.role = 'admin');
   end if;
-
-  if v_removes then
+  if v_shrinks then
     perform pg_advisory_xact_lock(hashtextextended('m1:last_admin', 0));
+    -- Transaction-local marker for the AFTER check. Needed because FK cascade actions (internal RI triggers,
+    -- which sort before our AFTER triggers) have already removed the admin's role rows by the time the
+    -- AFTER trigger runs; only here, before the row change, can the admin-ness of the row be observed.
+    -- Setting the marker can only cause an extra check, never skip one: this trigger overwrites it with '1'.
+    perform set_config('m1.admin_shrink', '1', true);
+  end if;
+  if tg_op = 'DELETE' then
+    return old;
+  end if;
+  return new;
+end;
+$$;
+
+-- Last-admin protection, part 2 (AFTER row): final-state check at the end of the statement or cascade action.
+-- At least one active admin must remain. Multi-row statements and FK cascades are judged on their result.
+create function private.check_last_admin() returns trigger
+language plpgsql security definer set search_path = ''
+as $$
+declare
+  v_remaining integer;
+begin
+  -- Runs only if an admin-shrinking row change happened earlier in this transaction (marker set by the BEFORE
+  -- trigger while the admin's roles were still visible). Judged on the final state of the statement.
+  if coalesce(current_setting('m1.admin_shrink', true), '') = '1' then
     select count(distinct r.user_id) into v_remaining
       from public.staff_roles r
       join public.staff_members s on s.user_id = r.user_id
-     where r.role = 'admin' and s.status = 'active' and r.user_id <> v_uid;
+     where r.role = 'admin' and s.status = 'active';
     if v_remaining = 0 then
       raise exception 'the last active admin cannot be removed, demoted or disabled' using errcode = '23514';
     end if;
   end if;
+  return null;
+end;
+$$;
 
-  if tg_op = 'DELETE' then
-    return old;
+-- Windows can only be created for an active staff target by an active admin (or by the owner-run bootstrap
+-- script with authorized_by NULL). Table has no API privilege; this is defense in depth for 0007 and scripts.
+create function private.guard_enrolment_window_insert() returns trigger
+language plpgsql security definer set search_path = ''
+as $$
+begin
+  if not exists (select 1 from public.staff_members s where s.user_id = new.target_user_id and s.status = 'active') then
+    raise exception 'enrolment window target must be an active staff member' using errcode = '23514';
+  end if;
+  if new.authorized_by is not null and not exists (
+       select 1 from public.staff_members s join public.staff_roles r on r.user_id = s.user_id
+        where s.user_id = new.authorized_by and s.status = 'active' and r.role = 'admin') then
+    raise exception 'enrolment window must be authorized by an active admin' using errcode = '23514';
+  end if;
+  if new.revoked_at is not null or new.consumed_at is not null then
+    raise exception 'enrolment window must be created open' using errcode = '23514';
+  end if;
+  return new;
+end;
+$$;
+
+-- Windows are immutable except that an open window may be revoked or consumed once. Nothing can be
+-- un-revoked, un-consumed, extended, retargeted or re-attributed. Invoker rights are enough: NEW/OLD only.
+create function private.guard_enrolment_window_update() returns trigger
+language plpgsql set search_path = ''
+as $$
+begin
+  if new.id <> old.id or new.target_user_id <> old.target_user_id
+     or new.authorized_by is distinct from old.authorized_by
+     or new.authorized_at <> old.authorized_at or new.expires_at <> old.expires_at or new.reason <> old.reason then
+    raise exception 'enrolment window identity, target, authorizer, timing and reason are immutable' using errcode = '23514';
+  end if;
+  if old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at
+       or new.revoked_by is distinct from old.revoked_by or new.revoke_reason is distinct from old.revoke_reason) then
+    raise exception 'a revoked enrolment window cannot be changed' using errcode = '23514';
+  end if;
+  if old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at then
+    raise exception 'a consumed enrolment window cannot be changed' using errcode = '23514';
   end if;
   return new;
 end;
 $$;
 
+-- Approval gate for a factor. A row can exist only if, at this instant (clock_timestamp, not transaction
+-- start): the window exists, targets this user, is not revoked, not consumed, is open (authorized <= now <
+-- expiry); the target is an active staff member; and the factor exists in auth.mfa_factors for this user,
+-- is verified, is TOTP, and was created inside the window. The window is locked and consumed here, so the
+-- approval and the single use are atomic. Only id, user_id, factor_type, status, created_at are read.
+create function private.guard_staff_mfa_factor_insert() returns trigger
+language plpgsql security definer set search_path = ''
+as $$
+declare
+  v_target   uuid;
+  v_auth_at  timestamptz;
+  v_expires  timestamptz;
+  v_revoked  timestamptz;
+  v_consumed timestamptz;
+  v_fuser    uuid;
+  v_fstatus  text;
+  v_ftype    text;
+  v_fcreated timestamptz;
+begin
+  select w.target_user_id, w.authorized_at, w.expires_at, w.revoked_at, w.consumed_at
+    into v_target, v_auth_at, v_expires, v_revoked, v_consumed
+    from private.staff_mfa_enrolment_windows w
+   where w.id = new.window_id
+     for update;
+  if not found then
+    raise exception 'unknown enrolment window' using errcode = '23514';
+  end if;
+  if v_target <> new.user_id then
+    raise exception 'enrolment window targets a different user' using errcode = '23514';
+  end if;
+  if v_revoked is not null then
+    raise exception 'enrolment window is revoked' using errcode = '23514';
+  end if;
+  if v_consumed is not null then
+    raise exception 'enrolment window is already consumed' using errcode = '23514';
+  end if;
+  if clock_timestamp() < v_auth_at or clock_timestamp() >= v_expires then
+    raise exception 'enrolment window is not open' using errcode = '23514';
+  end if;
+  if not exists (select 1 from public.staff_members s where s.user_id = new.user_id and s.status = 'active') then
+    raise exception 'target is not an active staff member' using errcode = '23514';
+  end if;
+
+  select f.user_id, f.status::text, f.factor_type::text, f.created_at
+    into v_fuser, v_fstatus, v_ftype, v_fcreated
+    from auth.mfa_factors f
+   where f.id = new.factor_id;
+  if not found or v_fuser is distinct from new.user_id then
+    raise exception 'factor does not exist for this user' using errcode = '23514';
+  end if;
+  if v_fstatus is distinct from 'verified' then
+    raise exception 'factor is not verified' using errcode = '23514';
+  end if;
+  if v_ftype is distinct from 'totp' then
+    raise exception 'only TOTP factors may be approved in milestone 1' using errcode = '23514';
+  end if;
+  if v_fcreated is null or v_fcreated < v_auth_at or v_fcreated > clock_timestamp() then
+    raise exception 'factor was not created inside the enrolment window' using errcode = '23514';
+  end if;
+
+  update private.staff_mfa_enrolment_windows set consumed_at = clock_timestamp() where id = new.window_id;
+  new.approved_at := clock_timestamp();
+  return new;
+end;
+$$;
+
+-- Approvals are immutable. (Removal is by DELETE through a later audited RPC; deleting the last approved
+-- factor leaves the user denied, because mfa_check_ok requires at least one.)
+create function private.guard_staff_mfa_factor_update() returns trigger
+language plpgsql set search_path = ''
+as $$
+begin
+  raise exception 'approved factor rows are immutable' using errcode = '23514';
+  return new;
+end;
+$$;
+
 -- 4. Triggers --------------------------------------------------------------------------
-create trigger staff_members_not_member before insert on public.staff_members
+create trigger staff_members_not_member before insert or update on public.staff_members
   for each row execute function private.guard_staff_not_member();
 create trigger organization_members_not_staff before insert or update on public.organization_members
   for each row execute function private.guard_member_not_staff();
-create trigger staff_roles_last_admin before update or delete on public.staff_roles
-  for each row execute function private.guard_last_admin();
-create trigger staff_members_last_admin before update or delete on public.staff_members
-  for each row execute function private.guard_last_admin();
+
+create trigger staff_roles_last_admin_lock before update or delete on public.staff_roles
+  for each row execute function private.guard_last_admin_lock();
+create trigger staff_roles_last_admin_check after update or delete on public.staff_roles
+  for each row execute function private.check_last_admin();
+create trigger staff_members_last_admin_lock before update or delete on public.staff_members
+  for each row execute function private.guard_last_admin_lock();
+create trigger staff_members_last_admin_check after update or delete on public.staff_members
+  for each row execute function private.check_last_admin();
+
+create trigger staff_members_no_truncate before truncate on public.staff_members
+  for each statement execute function private.block_truncate();
+create trigger staff_roles_no_truncate before truncate on public.staff_roles
+  for each statement execute function private.block_truncate();
+
+create trigger staff_mfa_windows_guard_insert before insert on private.staff_mfa_enrolment_windows
+  for each row execute function private.guard_enrolment_window_insert();
+create trigger staff_mfa_windows_guard_update before update on private.staff_mfa_enrolment_windows
+  for each row execute function private.guard_enrolment_window_update();
+create trigger staff_mfa_factors_guard_insert before insert on private.staff_mfa_factors
+  for each row execute function private.guard_staff_mfa_factor_insert();
+create trigger staff_mfa_factors_guard_update before update on private.staff_mfa_factors
+  for each row execute function private.guard_staff_mfa_factor_update();
 
 -- 5. Seed: capability catalog and role mapping (section 3) ------------------------------
 insert into public.capabilities (code, description) values
@@ -350,7 +572,9 @@
 
 revoke all on function private.run_auth_structure_check(), private.mfa_check_ok(), private.staff_session_ok(),
                        private.has_capability(text), private.guard_staff_not_member(),
-                       private.guard_member_not_staff(), private.guard_last_admin()
+                       private.guard_member_not_staff(), private.guard_last_admin_lock(), private.check_last_admin(),
+                       private.guard_enrolment_window_insert(), private.guard_enrolment_window_update(),
+                       private.guard_staff_mfa_factor_insert(), private.guard_staff_mfa_factor_update()
   from public, anon, authenticated, service_role;
 -- Only the two functions referenced directly by RLS policies are callable by authenticated users.
 grant execute on function private.staff_session_ok(), private.has_capability(text) to authenticated;
@@ -383,10 +607,34 @@
   end loop;
   if exists (
     select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
-    where n.nspname = 'private' and pr.prosecdef
+    where n.nspname = 'private'
       and not coalesce((select bool_or(c like 'search_path=%') from unnest(pr.proconfig) c), false)
   ) then
-    raise exception 'self-check: SECURITY DEFINER function without pinned search_path in schema private';
+    raise exception 'self-check: function without pinned search_path in schema private';
+  end if;
+  if exists (
+    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
+    where n.nspname = 'private'
+      and (has_function_privilege('anon', pr.oid, 'execute') or has_function_privilege('service_role', pr.oid, 'execute')
+           or has_function_privilege('public', pr.oid, 'execute'))
+  ) then
+    raise exception 'self-check: a private function is executable by anon, service_role or PUBLIC';
+  end if;
+  if exists (
+    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
+    where n.nspname = 'private' and has_function_privilege('authenticated', pr.oid, 'execute')
+      and pr.proname not in ('my_org_ids', 'my_owner_org_ids', 'staff_session_ok', 'has_capability')
+  ) then
+    raise exception 'self-check: unexpected EXECUTE grant to authenticated in schema private';
+  end if;
+  if (select count(*) from pg_trigger tg where not tg.tgisinternal and tg.tgname in (
+        'staff_members_not_member', 'organization_members_not_staff',
+        'staff_roles_last_admin_lock', 'staff_roles_last_admin_check',
+        'staff_members_last_admin_lock', 'staff_members_last_admin_check',
+        'staff_members_no_truncate', 'staff_roles_no_truncate',
+        'staff_mfa_windows_guard_insert', 'staff_mfa_windows_guard_update',
+        'staff_mfa_factors_guard_insert', 'staff_mfa_factors_guard_update')) <> 12 then
+    raise exception 'self-check: expected guard triggers are missing';
   end if;
   if (select count(*) from public.capabilities) <> 27 then raise exception 'self-check: capability catalog size'; end if;
   if (select count(*) from public.role_capabilities where role = 'admin') <> 27 then raise exception 'self-check: admin capability count'; end if;
````

## A8. Diff `supabase/review/history/static-check.rev1-to-rev2.diff`

````diff
--- history/static-check.rev1.mjs	2026-11-07 11:18:06.118169200 +0530
+++ static-check.mjs	2026-11-07 11:22:25.947757100 +0530
@@ -1,4 +1,4 @@
-// Static review checks for migration drafts. Dependency-free. Reads files only; never connects to a database.
+// Static review checks for migration drafts (rev2). Dependency-free. Reads files only; never connects to a database.
 // Usage: node supabase/review/static-check.mjs [--selftest] [file.sql ...]   (default: all NNNN_*.sql next to this file)
 // These are TEXT checks. They prove properties of the source text, not runtime behavior.
 import { readFileSync, readdirSync } from 'node:fs';
@@ -6,12 +6,26 @@
 import { fileURLToPath } from 'node:url';
 
 const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
+const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase();
 const EXEC_ALLOW = new Set(['my_org_ids', 'my_owner_org_ids', 'staff_session_ok', 'has_capability']);
 const MFA_COLS = new Set(['id', 'user_id', 'factor_type', 'status', 'created_at']);
+const MFA_READERS = new Set(['run_auth_structure_check', 'mfa_check_ok', 'guard_staff_mfa_factor_insert']);
+const ISOLATION_FNS = new Set(['guard_organization_members', 'guard_staff_not_member', 'guard_member_not_staff', 'guard_last_admin_lock']);
+const TRUNCATE_PROTECTED = ['public.organization_members', 'public.staff_members', 'public.staff_roles'];
+const AFTER_CHECKED = ['public.organization_members', 'public.staff_members', 'public.staff_roles'];
+
+function parseFunctions(sql) {
+  const re = /create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_]+)\s*\(([^)]*)\)([\s\S]*?)\bas\s+\$\$([\s\S]*?)\$\$/gi;
+  const out = []; let m;
+  while ((m = re.exec(sql))) out.push({ full: m[1], name: m[1].split('.')[1], schema: m[1].split('.')[0], header: `${m[1]}(${m[2]})${m[3]}`, body: m[4], span: [m.index, re.lastIndex] });
+  return out;
+}
 
 export function check(name, raw) {
-  const sql = strip(raw); const low = sql.toLowerCase(); const f = [];
+  const sql = strip(raw); const f = []; let m;
   const add = (rule, msg) => f.push(`${rule}: ${msg}`);
+  const fns = parseFunctions(sql);
+  const nsql = norm(sql);
 
   // R1 secret column / R2 iat / R3 super_admin / R4 metadata / R10 embedded credentials
   if (/\bsecret\b/i.test(sql)) add('R1-no-secret-column', 'reference to "secret" in code');
@@ -20,18 +34,20 @@
   if (/user_metadata|raw_user_meta_data|raw_app_meta_data|app_metadata/i.test(sql)) add('R4-no-metadata-authorization', 'metadata reference');
   if (/eyJ[A-Za-z0-9_-]{10,}|sb_secret_|sb_publishable_|service_role_key/i.test(sql)) add('R10-no-embedded-credentials', 'credential-like string');
 
-  // R5 every SECURITY DEFINER function pins search_path to ''
-  const fnRe = /create\s+(?:or\s+replace\s+)?function\b([\s\S]*?)\bas\s+\$\$/gi; let m; let defs = 0, fns = 0;
-  while ((m = fnRe.exec(sql))) {
-    fns++; const h = m[1];
-    if (!/^\s*private\./i.test(h)) add('R16-functions-in-private', `function outside schema private: ${h.trim().split('(')[0]}`);
-    if (/security\s+definer/i.test(h)) { defs++; if (!/set\s+search_path\s*=\s*''/i.test(h)) add('R5-pinned-search-path', `definer function without search_path='': ${h.trim().split('(')[0]}`); }
+  // R5 pinned search_path on definers; R16 functions live in private; R17 no dynamic SQL
+  let defs = 0;
+  for (const fn of fns) {
+    if (fn.schema !== 'private') add('R16-functions-in-private', `function outside schema private: ${fn.full}`);
+    const definer = /security\s+definer/i.test(fn.header); if (definer) defs++;
+    if (!/set\s+search_path\s*=\s*''/i.test(fn.header)) add('R5-pinned-search-path', `${definer ? 'definer' : 'invoker'} function without search_path='': ${fn.full}`);
+    if (/\bexecute\b/i.test(fn.body)) add('R17-no-dynamic-sql', `EXECUTE inside function body: ${fn.full}`);
   }
 
   // R6/R9 grants
+  const grantScan = sql.replace(/'(?:[^']|'')*'/g, "''"); // ignore text inside string literals (error messages)
   const grRe = /\bgrant\b([^;]*?)\bto\b([^;]*);/gi;
-  while ((m = grRe.exec(sql))) {
-    const what = m[1].trim().toLowerCase().replace(/\s+/g, ' '); const who = m[2].toLowerCase();
+  while ((m = grRe.exec(grantScan))) {
+    const what = norm(m[1]).trim(); const who = m[2].toLowerCase();
     if (/\b(anon|service_role|public)\b/.test(who)) { add('R6-no-grant-to-anon-service-public', `grant ${what} to${who}`); continue; }
     if (!/\bauthenticated\b/.test(who)) continue;
     if (what.startsWith('select on ')) continue;
@@ -45,44 +61,122 @@
   // R7 permissive true policies
   if (/(using|with\s+check)\s*\(\s*true\s*\)/i.test(sql)) add('R7-no-true-policy', 'using/with check (true)');
 
-  // R8 RLS enabled on every created table
-  const tbRe = /create\s+table\s+([a-z_]+\.[a-z_]+)/gi; let tables = 0;
-  while ((m = tbRe.exec(sql))) { tables++; const t = m[1].toLowerCase(); if (!new RegExp(`alter\\s+table\\s+${t.replace('.', '\\.')}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(sql)) add('R8-rls-enabled', `no enable RLS for ${t}`); }
+  // R8 RLS on every created table; R14 revoke all from the four API roles on every created table
+  const tbRe = /create\s+table\s+([a-z_]+\.[a-z_]+)/gi; const tables = [];
+  while ((m = tbRe.exec(sql))) tables.push(m[1].toLowerCase());
+  for (const t of tables) {
+    const e = t.replace('.', '\\.');
+    if (!new RegExp(`alter\\s+table\\s+${e}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(sql)) add('R8-rls-enabled', `no enable RLS for ${t}`);
+    if (!new RegExp(`revoke\\s+all\\s+on\\s+table[^;]*\\b${e}\\b[^;]*from[^;]*\\banon\\b[^;]*\\bservice_role\\b`, 'i').test(sql)) add('R14-revoke-all-on-every-table', `no revoke-all for ${t}`);
+  }
 
-  // R11/R12 mfa_factors usage limited to approved columns, no star selects
+  // R11/R12 mfa_factors: no star selects; alias f limited to approved columns
   if (/select\s+\*|\b\w+\.\*/i.test(sql)) add('R11-no-star-select', 'select * or alias.* found');
   const fcols = new Set(); const fr = /\bf\.([a-z_]+)/gi; while ((m = fr.exec(sql))) fcols.add(m[1].toLowerCase());
   for (const c of fcols) if (!MFA_COLS.has(c)) add('R12-mfa-approved-columns', `alias f uses column ${c}`);
 
-  // R13 no direct DML-style grants/truncate/drop of audit-like surfaces in this phase
+  // R25 auth.mfa_factors referenced only inside the three approved functions
+  for (const fn of fns) if (/mfa_factors/i.test(fn.body) && /auth\.mfa_factors/i.test(fn.body) && !MFA_READERS.has(fn.name)) add('R25-mfa-readers', `function ${fn.full} reads auth.mfa_factors but is not an approved reader`);
+  let outside = sql; for (const fn of [...fns].reverse()) outside = outside.slice(0, fn.span[0]) + outside.slice(fn.span[1]);
+  if (/auth\.mfa_factors/i.test(outside)) add('R25-mfa-readers', 'auth.mfa_factors referenced outside an approved function');
+
+  // R13 no TRUNCATE statements
   if (/(^|;)\s*truncate\b/i.test(sql)) add('R13-no-truncate', 'truncate statement');
 
-  return { name, failures: f, stats: { functions: fns, definers: defs, tables, mfaColumns: [...fcols].sort().join(',') } };
+  // R18 guard functions that count across rows assert READ COMMITTED
+  for (const fn of fns) if (ISOLATION_FNS.has(fn.name) && !/transaction_isolation/i.test(fn.body)) add('R18-read-committed-guard', `${fn.full} does not assert READ COMMITTED`);
+
+  // R19 mfa factor approval trigger uses clock_timestamp and locks the window row
+  for (const fn of fns) if (/guard_staff_mfa_factor_insert/.test(fn.name)) {
+    if (!/clock_timestamp\s*\(\)/i.test(fn.body)) add('R19-clock-timestamp', `${fn.full} must use clock_timestamp() for window expiry`);
+    if (!/for\s+update/i.test(fn.body)) add('R19-lock-window', `${fn.full} must lock the window row FOR UPDATE`);
+    for (const need of ['revoked', 'consumed', 'verified', "'totp'"]) if (!new RegExp(need, 'i').test(fn.body)) add('R19-approval-conditions', `${fn.full} lacks a check for ${need}`);
+  }
+
+  // R20 fail-closed functions
+  for (const fn of fns) {
+    if (fn.name === 'mfa_check_ok') {
+      if (!/exception\s+when\s+others\s+then\s+return\s+false/i.test(fn.body)) add('R20-fail-closed', 'mfa_check_ok lacks "exception when others then return false"');
+      if (!/checked_at\s*<=\s*now\(\)/i.test(fn.body) || !/interval\s+'24 hours'/i.test(fn.body)) add('R21-validation-freshness', 'mfa_check_ok must reject stale (24 h) and future-dated validation records');
+      if (!/status\s+is\s+null/i.test(fn.body) || !/factor_type\s+is\s+null/i.test(fn.body)) add('R20-fail-closed', 'mfa_check_ok must treat NULL status/factor_type as unreadable');
+    }
+    if (fn.name === 'run_auth_structure_check') {
+      if (!/exception\s+when\s+others/i.test(fn.body) || !/'failed'/.test(fn.body)) add('R20-fail-closed', 'run_auth_structure_check must record failure on any exception');
+      for (const need of ['data_type', 'pg_enum', 'enumlabel', 'uuid', 'timestamp with time zone']) if (!new RegExp(need, 'i').test(fn.body)) add('R22-structure-types', `run_auth_structure_check does not verify ${need}`);
+    }
+  }
+  if (/create\s+table\s+private\.platform_validations/i.test(sql) && !/platform_validations_passed_consistent/i.test(sql)) add('R21-validation-freshness', 'platform_validations lacks the passed-consistency constraint');
+
+  // R23 truncate protection and AFTER final-state checks for tables defined in this file
+  for (const t of TRUNCATE_PROTECTED) if (tables.includes(t) && !new RegExp(`before\\s+truncate\\s+on\\s+${t.replace('.', '\\.')}`, 'i').test(sql)) add('R23-truncate-blocked', `no BEFORE TRUNCATE trigger on ${t}`);
+  for (const t of AFTER_CHECKED) if (tables.includes(t) && t !== 'public.organization_members' ? !new RegExp(`after\\s+update\\s+or\\s+delete\\s+on\\s+${t.replace('.', '\\.')}`, 'i').test(sql) : (tables.includes(t) && !new RegExp(`after\\s+update\\s+or\\s+delete\\s+on\\s+${t.replace('.', '\\.')}`, 'i').test(sql))) add('R24-after-final-state-check', `no AFTER UPDATE OR DELETE trigger on ${t}`);
+
+  // R26 factor approval binding constraints (when the table is defined here)
+  if (tables.includes('private.staff_mfa_factors')) {
+    if (!/unique\s*\(\s*window_id\s*\)/i.test(sql)) add('R26-factor-binding', 'staff_mfa_factors lacks unique (window_id)');
+    if (!/foreign\s+key\s*\(\s*window_id\s*,\s*user_id\s*\)\s*references\s+private\.staff_mfa_enrolment_windows\s*\(\s*id\s*,\s*target_user_id\s*\)/i.test(sql)) add('R26-factor-binding', 'staff_mfa_factors lacks composite FK (window_id, user_id) -> windows (id, target_user_id)');
+    if (!/guard_staff_mfa_factor_update/i.test(sql) || !/guard_enrolment_window_update/i.test(sql)) add('R26-factor-binding', 'missing immutability triggers for approvals/windows');
+  }
+
+  // R27 staff/member exclusion covers INSERT and UPDATE on both sides; staff identity immutable
+  if (tables.includes('public.staff_members')) {
+    if (!/before\s+insert\s+or\s+update\s+on\s+public\.staff_members/i.test(sql)) add('R27-exclusion-coverage', 'staff-side exclusion trigger must be BEFORE INSERT OR UPDATE');
+    if (!/before\s+insert\s+or\s+update\s+on\s+public\.organization_members/i.test(sql)) add('R27-exclusion-coverage', 'member-side exclusion trigger must be BEFORE INSERT OR UPDATE');
+    const g = fns.find((x) => x.name === 'guard_staff_not_member');
+    if (g && !/user_id\s*<>\s*old\.user_id/i.test(g.body)) add('R27-exclusion-coverage', 'staff_members.user_id immutability missing');
+    for (const x of ['guard_staff_not_member', 'guard_member_not_staff']) { const fx = fns.find((y) => y.name === x); if (fx && !/pg_advisory_xact_lock/i.test(fx.body)) add('R27-exclusion-coverage', `${x} lacks the per-user advisory lock`); }
+  }
+
+  // R28 last-admin: lock before change, marker for AFTER check
+  const la = fns.find((x) => x.name === 'guard_last_admin_lock');
+  if (la && (!/pg_advisory_xact_lock/i.test(la.body) || !/set_config\s*\(\s*'m1\.admin_shrink'/i.test(la.body))) add('R28-last-admin', 'guard_last_admin_lock must take the advisory lock and set the m1.admin_shrink marker');
+  const lc = fns.find((x) => x.name === 'check_last_admin');
+  if (lc && !/m1\.admin_shrink/i.test(lc.body)) add('R28-last-admin', 'check_last_admin must read the m1.admin_shrink marker');
+
+  return { name, failures: f, stats: { functions: fns.length, definers: defs, tables: tables.length, mfaColumns: [...fcols].sort().join(',') } };
 }
 
 function selftest() {
+  const okFn = "create function private.a() returns int language sql security definer set search_path = '' as $$ select 1 $$;";
   const bad = [
-    ['secret column', "create table public.x (a int); alter table public.x enable row level security; select f.secret from auth.mfa_factors f;", 'R1-no-secret-column'],
+    ['secret column', "select f.secret from auth.mfa_factors f;", 'R1-no-secret-column'],
     ['iat', "select auth.jwt() ->> 'iat';", 'R2-no-iat'],
     ['super_admin', "insert into t values ('super_admin');", 'R3-no-super-admin'],
     ['metadata', "using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')", 'R4-no-metadata-authorization'],
+    ['invoker without path', "create function private.a() returns int language sql as $$ select 1 $$;", 'R5-pinned-search-path'],
     ['definer without path', "create function private.a() returns int language sql security definer as $$ select 1 $$;", 'R5-pinned-search-path'],
     ['grant to anon', "grant select on public.t to anon;", 'R6-no-grant-to-anon-service-public'],
     ['true policy', "create policy p on public.t for select using (true);", 'R7-no-true-policy'],
     ['no rls', "create table public.nope (a int);", 'R8-rls-enabled'],
+    ['broad grant', "grant insert on public.t to authenticated;", 'R9-authenticated-grants'],
     ['star select', "select * from auth.mfa_factors;", 'R11-no-star-select'],
     ['bad column', "select f.phone from auth.mfa_factors f;", 'R12-mfa-approved-columns'],
-    ['broad grant', "grant insert on public.t to authenticated;", 'R9-authenticated-grants'],
+    ['truncate stmt', "truncate public.x;", 'R13-no-truncate'],
+    ['no revoke-all', "create table public.t (a int); alter table public.t enable row level security;", 'R14-revoke-all-on-every-table'],
     ['public fn', "create function public.a() returns int language sql set search_path = '' as $$ select 1 $$;", 'R16-functions-in-private'],
+    ['dynamic sql', "create function private.a() returns int language plpgsql security definer set search_path = '' as $$ begin execute 'select 1'; return 1; end $$;", 'R17-no-dynamic-sql'],
+    ['no isolation assert', "create function private.guard_last_admin_lock() returns trigger language plpgsql security definer set search_path = '' as $$ begin return new; end $$;", 'R18-read-committed-guard'],
+    ['approval without clock', "create function private.guard_staff_mfa_factor_insert() returns trigger language plpgsql security definer set search_path = '' as $$ begin perform now(); return new; end $$;", 'R19-clock-timestamp'],
+    ['mfa_check_ok not fail closed', "create function private.mfa_check_ok() returns boolean language plpgsql security definer set search_path = '' as $$ begin return true; end $$;", 'R20-fail-closed'],
+    ['no freshness', "create function private.mfa_check_ok() returns boolean language plpgsql security definer set search_path = '' as $$ begin return true; exception when others then return false; end $$;", 'R21-validation-freshness'],
+    ['structure types missing', "create function private.run_auth_structure_check() returns text language plpgsql security definer set search_path = '' as $$ begin begin null; exception when others then null; end; return 'failed'; end $$;", 'R22-structure-types'],
+    ['no truncate block', "create table public.staff_members (a int); alter table public.staff_members enable row level security; revoke all on table public.staff_members from public, anon, authenticated, service_role;", 'R23-truncate-blocked'],
+    ['no after check', "create table public.staff_roles (a int); alter table public.staff_roles enable row level security; revoke all on table public.staff_roles from public, anon, authenticated, service_role;", 'R24-after-final-state-check'],
+    ['non-reader reads mfa', "create function private.other() returns int language sql security definer set search_path = '' as $$ select count(*) from auth.mfa_factors f $$;", 'R25-mfa-readers'],
+    ['factor binding missing', "create table private.staff_mfa_factors (factor_id uuid, user_id uuid, window_id uuid); alter table private.staff_mfa_factors enable row level security; revoke all on table private.staff_mfa_factors from public, anon, authenticated, service_role;", 'R26-factor-binding'],
+    ['exclusion insert only', "create table public.staff_members (a int); alter table public.staff_members enable row level security; revoke all on table public.staff_members from public, anon, authenticated, service_role; create trigger t before insert on public.staff_members for each row execute function private.x();", 'R27-exclusion-coverage'],
+    ['last admin w/o marker', "create function private.guard_last_admin_lock() returns trigger language plpgsql security definer set search_path = '' as $$ begin if current_setting('transaction_isolation') <> 'read committed' then return null; end if; return new; end $$;", 'R28-last-admin'],
   ];
   let ok = true;
   for (const [label, sql, rule] of bad) { const r = check('selftest', sql); const hit = r.failures.some((x) => x.startsWith(rule)); ok = ok && hit; console.log(`selftest ${label}: ${hit ? 'caught' : 'MISSED'} (${rule})`); }
-  const clean = check('selftest', "-- secret in comment is fine, iat too\ncreate function private.a() returns int language sql security definer set search_path = '' as $$ select 1 $$;");
+  const strSample = check('selftest', `${okFn} select 'unexpected EXECUTE grant to authenticated in schema private';`);
+  const strOk = !strSample.failures.some((x) => x.startsWith('R9') || x.startsWith('R6')); ok = ok && strOk; console.log(`selftest grant text inside a string literal ignored: ${strOk ? 'ok' : 'FALSE POSITIVE'}`);
+  const clean = check('selftest', `-- secret and iat in a comment are fine\n${okFn}`);
   const cleanOk = clean.failures.length === 0; ok = ok && cleanOk; console.log(`selftest comment-stripping/clean sample: ${cleanOk ? 'ok' : 'FALSE POSITIVE ' + clean.failures.join('|')}`);
-  console.log(`SELFTEST ${ok ? 'PASS' : 'FAIL'}`); process.exitCode = ok ? 0 : 1;
+  console.log(`SELFTEST ${ok ? 'PASS' : 'FAIL'} (${bad.length} violation samples + 1 clean sample)`); process.exitCode = ok ? 0 : 1;
 }
 
-if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/').replace(/^([a-z]):/i, (s) => s) || process.argv[1]?.endsWith('static-check.mjs')) {
+if (process.argv[1]?.endsWith('static-check.mjs')) {
   if (process.argv.includes('--selftest')) selftest();
   else {
     const dir = dirname(fileURLToPath(import.meta.url));
````
