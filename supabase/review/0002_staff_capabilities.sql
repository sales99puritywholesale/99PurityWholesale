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
