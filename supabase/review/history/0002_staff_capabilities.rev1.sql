-- =====================================================================================
-- 0002_staff_capabilities.sql
-- *** REVIEW DRAFT. NOT APPLIED. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
-- Depends on 0001. Source of truth: docs/MILESTONE-1-SCHEMA-AND-RLS.md (rev. 4) sections 2.5, 2.6, 3, 5.12.
-- Scope: staff roles and capabilities, staff/member exclusion, last-admin guard, staff read policies,
--        MFA structure validation and the approved-factor binding (fail closed, all factor types),
--        enrolment-window and approved-factor tables.
-- NOT in this migration (by the approved sequence): step-up objects and owner-grant checks (0004,
--   authored only after V5b passes), audit log (0003), RPCs incl. window authorize/revoke/check/claim
--   (0007), cron schedules.
-- Staff access stays DENIED until private.run_auth_structure_check() has recorded 'passed'.
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
  constraint staff_mfa_windows_single_outcome check (not (consumed_at is not null and revoked_at is not null))
);
create unique index staff_mfa_windows_one_open_idx
  on private.staff_mfa_enrolment_windows (target_user_id) where consumed_at is null and revoked_at is null;

-- Factors that count. No FK to auth.mfa_factors on purpose (auth schema is not our API).
create table private.staff_mfa_factors (
  factor_id   uuid primary key,
  user_id     uuid not null references public.staff_members (user_id) on delete cascade,
  window_id   uuid not null references private.staff_mfa_enrolment_windows (id),
  approved_at timestamptz not null default now()
);
create index staff_mfa_factors_user_idx on private.staff_mfa_factors (user_id);

-- Result of the structure check. Diagnostics hold column NAMES of the expected set and a count only.
create table private.platform_validations (
  check_name              text primary key,
  status                  text not null check (status in ('passed', 'failed')),
  checked_at              timestamptz not null default now(),
  sqlstate                text,
  expected_columns        text[] not null,
  present_expected_columns text[] not null,
  other_column_count      integer not null,
  server_version          text not null
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

-- Records whether auth.mfa_factors still has the structure we depend on. Reads column names from the
-- catalogue and runs a zero-row probe over the approved columns only. No row data is read.
create function private.run_auth_structure_check() returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_expected constant text[] := array['created_at', 'factor_type', 'id', 'status', 'user_id'];
  v_present  text[] := '{}';
  v_other    integer := 0;
  v_status   text := 'failed';
  v_sqlstate text := null;
  v_probe    bigint;
begin
  begin
    select coalesce(array_agg(c.column_name::text order by c.column_name::text)
                      filter (where c.column_name::text = any (v_expected)), '{}'),
           count(*) filter (where not (c.column_name::text = any (v_expected)))
      into v_present, v_other
      from information_schema.columns c
     where c.table_schema = 'auth' and c.table_name = 'mfa_factors';

    select count(*) into v_probe
      from (select f.id, f.user_id, f.factor_type::text, f.status::text, f.created_at
              from auth.mfa_factors f limit 0) s;

    if v_present = v_expected then
      v_status := 'passed';
    end if;
  exception when others then
    v_status := 'failed';
    v_sqlstate := sqlstate;
  end;

  insert into private.platform_validations
    (check_name, status, checked_at, sqlstate, expected_columns, present_expected_columns, other_column_count, server_version)
  values
    ('auth_mfa_factors_shape', v_status, now(), v_sqlstate, v_expected, coalesce(v_present, '{}'), coalesce(v_other, 0),
     current_setting('server_version'))
  on conflict (check_name) do update
    set status = excluded.status, checked_at = excluded.checked_at, sqlstate = excluded.sqlstate,
        expected_columns = excluded.expected_columns, present_expected_columns = excluded.present_expected_columns,
        other_column_count = excluded.other_column_count, server_version = excluded.server_version;
  return v_status;
end;
$$;

-- TRUE only if: a fresh passed structure check exists AND the caller has at least one approved TOTP factor
-- AND the caller has NO verified factor (of ANY type) that is not approved AND no factor row has an
-- unreadable or unrecognized type/status. Any error returns FALSE (fail closed).
-- Only id, user_id, factor_type, status, created_at are referenced.
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

-- Staff and organization members are mutually exclusive. Per-user advisory lock prevents write skew.
create function private.guard_staff_not_member() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if exists (select 1 from public.organization_members m where m.user_id = new.user_id and m.status = 'active') then
    raise exception 'a user with an active organization membership cannot become staff' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.guard_member_not_staff() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    if exists (select 1 from public.staff_members s where s.user_id = new.user_id) then
      raise exception 'a staff user cannot be an active organization member' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- At least one active admin must always remain. A single advisory lock serializes concurrent changes.
create function private.guard_last_admin() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid       uuid := old.user_id;
  v_removes   boolean := false;
  v_remaining integer;
begin
  if tg_table_name = 'staff_roles' then
    v_removes := old.role = 'admin'
                 and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id);
  else
    v_removes := old.status = 'active'
                 and (tg_op = 'DELETE' or new.status <> 'active')
                 and exists (select 1 from public.staff_roles r where r.user_id = v_uid and r.role = 'admin');
  end if;

  if v_removes then
    perform pg_advisory_xact_lock(hashtextextended('m1:last_admin', 0));
    select count(distinct r.user_id) into v_remaining
      from public.staff_roles r
      join public.staff_members s on s.user_id = r.user_id
     where r.role = 'admin' and s.status = 'active' and r.user_id <> v_uid;
    if v_remaining = 0 then
      raise exception 'the last active admin cannot be removed, demoted or disabled' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 4. Triggers --------------------------------------------------------------------------
create trigger staff_members_not_member before insert on public.staff_members
  for each row execute function private.guard_staff_not_member();
create trigger organization_members_not_staff before insert or update on public.organization_members
  for each row execute function private.guard_member_not_staff();
create trigger staff_roles_last_admin before update or delete on public.staff_roles
  for each row execute function private.guard_last_admin();
create trigger staff_members_last_admin before update or delete on public.staff_members
  for each row execute function private.guard_last_admin();

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
                       private.guard_member_not_staff(), private.guard_last_admin()
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
    where n.nspname = 'private' and pr.prosecdef
      and not coalesce((select bool_or(c like 'search_path=%') from unnest(pr.proconfig) c), false)
  ) then
    raise exception 'self-check: SECURITY DEFINER function without pinned search_path in schema private';
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
