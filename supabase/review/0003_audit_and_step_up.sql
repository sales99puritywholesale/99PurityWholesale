-- =====================================================================================
-- 0003_audit_and_step_up.sql
-- *** REVIEW DRAFT rev1. NOT APPLIED ANYWHERE. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
-- Depends on 0001 and 0002 (applied and verified on hosted development). Written for P2.2 (staff authorization).
-- Scope: (1) the append-only audit log, (2) the step-up helper (fresh TOTP verification within 15 minutes, read from the
--        signed JWT), (3) the staff gate used by the staff-management RPCs of 0004.
-- Not in this migration: any RPC callable by API roles (0004), invitations (P2.3), recovery (P2.4).
-- Conventions (unchanged from 0001/0002): default deny; no DML grant to any API role; SECURITY DEFINER functions pin
--   search_path = ''; EXECUTE is revoked from PUBLIC/anon/authenticated/service_role and granted explicitly.
-- The Supabase CLI wraps each migration file in one implicit transaction; no explicit BEGIN/COMMIT here.
-- =====================================================================================

-- 1. Audit log ---------------------------------------------------------------------------------------------------------
-- Append-only. No foreign keys on purpose: audit rows must outlive the users and organizations they describe. No sequence:
-- ordering is by occurred_at (clock_timestamp, so several events in one transaction keep their order) then id.
create table public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default clock_timestamp(),
  actor_user_id   uuid,
  actor_kind      text not null check (actor_kind in ('staff', 'organization_user', 'system')),
  actor_roles     text[] not null default '{}',
  action          text not null check (action ~ '^[a-z]+(\.[a-z_]+)+$' and char_length(action) <= 80),
  outcome         text not null check (outcome in ('success', 'denied', 'failed')),
  organization_id uuid,
  subject_type    text check (subject_type is null or subject_type ~ '^[a-z_]{1,40}$'),
  subject_id      text check (subject_id is null or char_length(subject_id) <= 80),
  detail          jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096)
);
create index audit_events_occurred_idx on public.audit_events (occurred_at desc, id);
create index audit_events_org_idx on public.audit_events (organization_id, occurred_at desc) where organization_id is not null;
create index audit_events_actor_idx on public.audit_events (actor_user_id, occurred_at desc) where actor_user_id is not null;
create index audit_events_action_idx on public.audit_events (action, occurred_at desc);

alter table public.audit_events enable row level security;
-- Staff with audit.read (ADMIN only in the approved mapping) read the log. Nobody can write through the API.
create policy audit_events_select_staff on public.audit_events
  for select to authenticated using ((select private.has_capability('audit.read')));

-- 2. Immutability ------------------------------------------------------------------------------------------------------
create function private.guard_audit_events() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
  return null;
end;
$$;

create trigger audit_events_no_update_delete before update or delete on public.audit_events
  for each row execute function private.guard_audit_events();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function private.block_truncate();

-- 3. Writing audit events (only from other SECURITY DEFINER functions; not executable by any API role) ---------------------
-- Snapshots the actor's staff roles at the time of the event. Does not copy request data: callers pass a small, explicit
-- jsonb detail (never tokens, secrets or free-form user text).
create function private.write_audit(
  p_actor_user_id   uuid,
  p_actor_kind      text,
  p_action          text,
  p_outcome         text,
  p_organization_id uuid,
  p_subject_type    text,
  p_subject_id      text,
  p_detail          jsonb
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id    uuid;
  v_roles text[] := '{}';
begin
  if p_actor_kind = 'staff' and p_actor_user_id is not null then
    select coalesce(array_agg(r.role order by r.role), '{}') into v_roles
      from public.staff_roles r where r.user_id = p_actor_user_id;
  end if;
  insert into public.audit_events
    (actor_user_id, actor_kind, actor_roles, action, outcome, organization_id, subject_type, subject_id, detail)
  values
    (p_actor_user_id, p_actor_kind, v_roles, p_action, p_outcome, p_organization_id, p_subject_type, p_subject_id,
     coalesce(p_detail, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- 4. Step-up: fresh TOTP verification (15 minutes) read from the signed access token ----------------------------------------
-- The JWT "amr" claim lists authentication methods with the time each was completed (verified in hosted validation V1-V3:
-- re-verifying a TOTP factor advances the timestamp; refreshing the token does not). Only the most recent 'totp' entry
-- counts. A missing or malformed claim yields NULL, which means "not fresh" (fail closed).
create function private.last_totp_at() returns timestamptz
language sql stable set search_path = ''
as $$
  select to_timestamp(max((e.value ->> 'timestamp')::bigint))
    from jsonb_array_elements(
           case when jsonb_typeof((select auth.jwt()) -> 'amr') = 'array' then (select auth.jwt()) -> 'amr' else '[]'::jsonb end
         ) as e(value)
   where e.value ->> 'method' = 'totp'
     and (e.value ->> 'timestamp') ~ '^[0-9]{1,12}$';
$$;

-- TRUE only if the JWT is aal2 and a TOTP verification happened within the last 15 minutes (a future timestamp beyond a
-- 60 second clock allowance is not fresh). The approved factor binding for STAFF is checked separately by
-- private.staff_session_ok(); this function says nothing about who the caller is.
create function private.step_up_ok() returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     and coalesce(
           private.last_totp_at() > now() - interval '15 minutes'
           and private.last_totp_at() <= now() + interval '1 minute',
           false);
$$;

-- 5. Staff gate for the staff-management RPCs ------------------------------------------------------------------------------
-- Returns 'ok', 'forbidden' or 'step_up_required'.
--   * No verified staff session (not staff, disabled, aal1, unapproved factor, stale structure check): raises 42501 and writes
--     nothing, so outsiders cannot flood the audit log.
--   * A verified staff member without the capability, or without a fresh step-up where required: the denial is audited
--     ('denied') and the status is RETURNED (not raised) so that the audit row commits with the transaction.
create function private.staff_gate(
  p_capability   text,
  p_action       text,
  p_step_up      boolean,
  p_subject_type text,
  p_subject_id   text
) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.staff_session_ok() then
    raise exception 'a verified staff session is required' using errcode = '42501';
  end if;
  if not private.has_capability(p_capability) then
    perform private.write_audit(v_actor, 'staff', p_action, 'denied', null, p_subject_type, p_subject_id,
                                jsonb_build_object('reason', 'capability_missing', 'capability', p_capability));
    return 'forbidden';
  end if;
  if p_step_up and not private.step_up_ok() then
    perform private.write_audit(v_actor, 'staff', p_action, 'denied', null, p_subject_type, p_subject_id,
                                jsonb_build_object('reason', 'step_up_required'));
    return 'step_up_required';
  end if;
  return 'ok';
end;
$$;

-- 6. Grants and revocations ------------------------------------------------------------------------------------------------
revoke all on table public.audit_events from public, anon, authenticated, service_role;
grant select on public.audit_events to authenticated;

revoke all on function private.guard_audit_events(), private.write_audit(uuid, text, text, text, uuid, text, text, jsonb),
                       private.last_totp_at(), private.step_up_ok(),
                       private.staff_gate(text, text, boolean, text, text)
  from public, anon, authenticated, service_role;
-- No EXECUTE grant to authenticated here: these helpers are called only by SECURITY DEFINER functions (owner rights).

-- 7. Self-checks: the migration fails if the security posture is not what the design says ------------------------------------
do $$
declare
  p text;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.audit_events'::regclass) then
    raise exception 'self-check: RLS not enabled on audit_events';
  end if;
  foreach p in array array['insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    if has_table_privilege('authenticated', 'public.audit_events', p) then raise exception 'self-check: authenticated has % on audit_events', p; end if;
  end loop;
  foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    if has_table_privilege('anon', 'public.audit_events', p) or has_table_privilege('service_role', 'public.audit_events', p) then
      raise exception 'self-check: anon or service_role has % on audit_events', p;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.audit_events', 'select') then
    raise exception 'self-check: authenticated lost select on audit_events';
  end if;
  if (select count(*) from pg_trigger tg where not tg.tgisinternal
        and tg.tgname in ('audit_events_no_update_delete', 'audit_events_no_truncate')) <> 2 then
    raise exception 'self-check: audit_events guard triggers are missing';
  end if;
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private'
      and not coalesce((select bool_or(c like 'search_path=%') from unnest(pr.proconfig) c), false)
  ) then
    raise exception 'self-check: function without pinned search_path in schema private';
  end if;
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private' and pr.proname in ('guard_audit_events', 'write_audit', 'last_totp_at', 'step_up_ok', 'staff_gate')
      and (has_function_privilege('anon', pr.oid, 'execute') or has_function_privilege('authenticated', pr.oid, 'execute')
           or has_function_privilege('service_role', pr.oid, 'execute') or has_function_privilege('public', pr.oid, 'execute'))
  ) then
    raise exception 'self-check: an audit or step-up helper is executable by an API role or PUBLIC';
  end if;
  if exists (select 1 from public.audit_events) then raise exception 'self-check: audit_events is not empty at install'; end if;
end;
$$;
