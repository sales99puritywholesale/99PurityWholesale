-- =====================================================================================
-- 0001_foundation_identity.sql
-- *** REVIEW DRAFT. NOT APPLIED. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
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

create function private.guard_organizations() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.code <> old.code then
    raise exception 'organizations.code is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Last-owner protection and identity immutability. Caller-independent (also binds service paths).
-- Serialization: the organization row is locked FOR UPDATE before counting, so concurrent
-- demotions/removals queue; in READ COMMITTED the later one re-counts after the earlier commits.
create function private.guard_organization_members() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_org_status text;
  v_remaining  integer;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
      raise exception 'organization_members: organization_id and user_id are immutable' using errcode = '23514';
    end if;
  end if;

  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    select o.status into v_org_status
      from public.organizations o where o.id = old.organization_id for update;
    if v_org_status is distinct from 'closed' then
      select count(*) into v_remaining
        from public.organization_members m
       where m.organization_id = old.organization_id
         and m.role = 'owner' and m.status = 'active' and m.id <> old.id;
      if v_remaining = 0 then
        raise exception 'last active owner of an organization cannot be removed or demoted' using errcode = '23514';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
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
                       private.guard_organization_members()
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
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private' and pr.prosecdef
      and not coalesce((select bool_or(c like 'search_path=%') from unnest(pr.proconfig) c), false)
  ) then
    raise exception 'self-check: SECURITY DEFINER function without pinned search_path in schema private';
  end if;
end;
$$;
