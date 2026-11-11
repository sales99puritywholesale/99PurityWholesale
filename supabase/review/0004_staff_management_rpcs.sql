-- =====================================================================================
-- 0004_staff_management_rpcs.sql
-- *** REVIEW DRAFT rev1. NOT APPLIED ANYWHERE. NOT EXECUTED. Lives in supabase/review/ on purpose. ***
-- Depends on 0001, 0002 (applied on hosted development) and 0003 (audit log, step-up, staff gate; draft).
-- Scope: the ONLY write path for staff administration (P2.2). The staff tables have no INSERT/UPDATE/DELETE grant for any API
--   role; these RPCs are SECURITY DEFINER functions in schema public (the exposed schema) and every one of them:
--     1. requires a verified staff session and the staff.manage / staff.read capability (private.staff_gate),
--     2. requires a fresh TOTP step-up (15 minutes) for every mutation,
--     3. refuses a caller changing THEIR OWN staff record (separation of duties; another admin must act),
--     4. writes the audit event in the same transaction as the change,
--     5. relies on the 0002 triggers for the last-admin protection and the staff/member exclusion (disabled rows included).
-- Result convention: every RPC returns jsonb {ok boolean, code text, ...}. A caller without a verified staff session gets
--   SQLSTATE 42501. A verified staff member who is not allowed gets ok=false with code 'forbidden' or 'step_up_required'
--   (audited). Invariant refusals return ok=false with a specific code (audited as 'denied').
-- No service_role and no PUBLIC grant. No dynamic SQL. Inputs are validated. search_path is pinned to ''.
-- =====================================================================================

-- Directory of staff (email from auth.users, readable only by holders of staff.read, i.e. ADMIN) ----------------------------
create function public.rpc_staff_directory() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_rows  jsonb;
begin
  if v_actor is null or not private.staff_session_ok() then
    raise exception 'a verified staff session is required' using errcode = '42501';
  end if;
  if not private.has_capability('staff.read') then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id, 'email', u.email, 'status', s.status, 'created_at', s.created_at,
           'roles', (select coalesce(jsonb_agg(r.role order by r.role), '[]'::jsonb) from public.staff_roles r where r.user_id = s.user_id))
         order by u.email), '[]'::jsonb)
    into v_rows
    from public.staff_members s
    left join auth.users u on u.id = s.user_id;
  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;

-- The caller's own staff context, for the application server (never trusted from the client) -----------------------------
-- OPERATIONS: mfa_check_ok() requires a 'passed' structure check no older than 24 hours and there is no scheduler (pg_cron is
-- not installed). To avoid locking every admin out after a day, an ACTIVE staff caller refreshes a check that is older than
-- 12 hours (at most one run per 12 hours: serialized by an advisory lock, re-checked under the lock). The refresh only records
-- the truth about auth.mfa_factors; it cannot make a failing structure pass. Non-staff callers never trigger it.
create function public.rpc_my_staff_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_status text;
  v_roles  jsonb;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select s.status into v_status from public.staff_members s where s.user_id = v_actor;
  -- Refresh when no 'passed' check is younger than 12 hours AND no check of any outcome ran in the last 15 minutes (a failing
  -- structure is retried at most every 15 minutes, not on every call).
  if v_status = 'active' and not exists (
       select 1 from private.platform_validations v
        where v.check_name = 'auth_mfa_factors_shape'
          and ((v.status = 'passed' and v.checked_at > now() - interval '12 hours') or v.checked_at > now() - interval '15 minutes')) then
    perform pg_advisory_xact_lock(hashtextextended('p2:structure_check_refresh', 0));
    if not exists (
         select 1 from private.platform_validations v
          where v.check_name = 'auth_mfa_factors_shape'
            and ((v.status = 'passed' and v.checked_at > now() - interval '12 hours') or v.checked_at > now() - interval '15 minutes')) then
      perform private.run_auth_structure_check();
    end if;
  end if;
  select coalesce(jsonb_agg(r.role order by r.role), '[]'::jsonb) into v_roles from public.staff_roles r where r.user_id = v_actor;
  return jsonb_build_object(
    'staff_status', coalesce(v_status, 'none'),
    'roles', v_roles,
    'session_ok', private.staff_session_ok(),
    'step_up_ok', private.step_up_ok(),
    'last_totp_epoch', (select extract(epoch from private.last_totp_at())::bigint));
end;
$$;

-- Find a user by email so an admin can make them staff ----------------------------------------------------------------------
create function public.rpc_staff_lookup_user(p_email text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user  uuid;
  v_conf  boolean;
begin
  v_gate := private.staff_gate('staff.manage', 'staff.user.lookup', false, 'user', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  select u.id, (u.email_confirmed_at is not null) into v_user, v_conf from auth.users u where lower(u.email) = v_email limit 1;
  perform private.write_audit(v_actor, 'staff', 'staff.user.lookup', 'success', null, 'user', v_user::text,
                              jsonb_build_object('found', v_user is not null));
  if v_user is null then return jsonb_build_object('ok', true, 'found', false); end if;
  return jsonb_build_object('ok', true, 'found', true, 'user_id', v_user, 'email_confirmed', v_conf,
    'is_staff', exists (select 1 from public.staff_members s where s.user_id = v_user),
    'is_organization_member', exists (select 1 from public.organization_members m where m.user_id = v_user and m.status = 'active'));
end;
$$;

-- Make an existing user a staff member with a first approved role ----------------------------------------------------------
create function public.rpc_staff_add_member(p_user_id uuid, p_role text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
begin
  v_gate := private.staff_gate('staff.manage', 'staff.member.add', true, 'staff_member', p_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_user_id is null or p_role is null or p_role not in ('admin', 'finance', 'operations', 'support') then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.member.add', 'denied', null, 'staff_member', p_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'user_not_found');
  end if;
  if exists (select 1 from public.staff_members s where s.user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'already_staff');
  end if;
  begin
    insert into public.staff_members (user_id, status, created_by) values (p_user_id, 'active', v_actor);
  exception
    when sqlstate '23514' then  -- the 0002 exclusion guard: an organization member cannot be staff
      perform private.write_audit(v_actor, 'staff', 'staff.member.add', 'denied', null, 'staff_member', p_user_id::text, jsonb_build_object('reason', 'organization_member_conflict'));
      return jsonb_build_object('ok', false, 'code', 'organization_member_conflict');
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'already_staff');
  end;
  insert into public.staff_roles (user_id, role, granted_by) values (p_user_id, p_role, v_actor);
  perform private.write_audit(v_actor, 'staff', 'staff.member.add', 'success', null, 'staff_member', p_user_id::text, jsonb_build_object('role', p_role));
  return jsonb_build_object('ok', true, 'code', 'added');
end;
$$;

-- Grant a role ---------------------------------------------------------------------------------------------------------------
create function public.rpc_staff_grant_role(p_user_id uuid, p_role text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_gate    text;
  v_changed integer;
begin
  v_gate := private.staff_gate('staff.manage', 'staff.role.grant', true, 'staff_member', p_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_user_id is null or p_role is null or p_role not in ('admin', 'finance', 'operations', 'support') then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.role.grant', 'denied', null, 'staff_member', p_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed', 'role', p_role));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  if not exists (select 1 from public.staff_members s where s.user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'not_staff');
  end if;
  insert into public.staff_roles (user_id, role, granted_by) values (p_user_id, p_role, v_actor) on conflict (user_id, role) do nothing;
  get diagnostics v_changed = row_count;
  if v_changed = 0 then return jsonb_build_object('ok', true, 'code', 'already_granted'); end if;
  perform private.write_audit(v_actor, 'staff', 'staff.role.grant', 'success', null, 'staff_member', p_user_id::text, jsonb_build_object('role', p_role));
  return jsonb_build_object('ok', true, 'code', 'granted');
end;
$$;

-- Revoke a role (the last active admin is protected by the 0002 triggers) -------------------------------------------------------
create function public.rpc_staff_revoke_role(p_user_id uuid, p_role text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_gate    text;
  v_changed integer;
begin
  v_gate := private.staff_gate('staff.manage', 'staff.role.revoke', true, 'staff_member', p_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_user_id is null or p_role is null or p_role not in ('admin', 'finance', 'operations', 'support') then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.role.revoke', 'denied', null, 'staff_member', p_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed', 'role', p_role));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  begin
    delete from public.staff_roles r where r.user_id = p_user_id and r.role = p_role;
    get diagnostics v_changed = row_count;
  exception when sqlstate '23514' then  -- the 0002 last-admin guard
    perform private.write_audit(v_actor, 'staff', 'staff.role.revoke', 'denied', null, 'staff_member', p_user_id::text, jsonb_build_object('reason', 'last_admin_protected', 'role', p_role));
    return jsonb_build_object('ok', false, 'code', 'last_admin_protected');
  end;
  if v_changed = 0 then return jsonb_build_object('ok', false, 'code', 'role_not_found'); end if;
  perform private.write_audit(v_actor, 'staff', 'staff.role.revoke', 'success', null, 'staff_member', p_user_id::text, jsonb_build_object('role', p_role));
  return jsonb_build_object('ok', true, 'code', 'revoked');
end;
$$;

-- Suspend (status disabled) or reinstate (status active) ------------------------------------------------------------------------
-- A disabled staff row still blocks organization membership for that user (approved exclusion rule, decision F5).
create function public.rpc_staff_set_status(p_user_id uuid, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_gate    text;
  v_action  text := case when p_status = 'disabled' then 'staff.member.suspend' else 'staff.member.reinstate' end;
  v_changed integer;
begin
  v_gate := private.staff_gate('staff.manage', v_action, true, 'staff_member', p_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_user_id is null or p_status is null or p_status not in ('active', 'disabled') then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', v_action, 'denied', null, 'staff_member', p_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  begin
    update public.staff_members s set status = p_status where s.user_id = p_user_id and s.status <> p_status;
    get diagnostics v_changed = row_count;
  exception when sqlstate '23514' then  -- last-admin guard, or the exclusion guard on reinstatement
    perform private.write_audit(v_actor, 'staff', v_action, 'denied', null, 'staff_member', p_user_id::text, jsonb_build_object('reason', 'invariant_protected'));
    return jsonb_build_object('ok', false, 'code', 'invariant_protected');
  end;
  if v_changed = 0 then
    return jsonb_build_object('ok', true, 'code', case when exists (select 1 from public.staff_members s where s.user_id = p_user_id) then 'no_change' else 'not_staff' end);
  end if;
  perform private.write_audit(v_actor, 'staff', v_action, 'success', null, 'staff_member', p_user_id::text, jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

-- Open an MFA enrolment window for a staff member (another admin must act; the 0002 constraint forbids self-authorization) -----
create function public.rpc_staff_authorize_enrolment_window(p_target_user_id uuid, p_reason text, p_minutes integer default 30) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_gate    text;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_id      uuid;
  v_expires timestamptz;
begin
  v_gate := private.staff_gate('staff.manage', 'staff.mfa.window.authorize', true, 'staff_member', p_target_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_target_user_id is null or char_length(v_reason) not between 1 and 200 or p_minutes is null or p_minutes not between 5 and 60 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_target_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.mfa.window.authorize', 'denied', null, 'staff_member', p_target_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  begin
    insert into private.staff_mfa_enrolment_windows (target_user_id, authorized_by, expires_at, reason)
    values (p_target_user_id, v_actor, now() + make_interval(mins => p_minutes), v_reason)
    returning id, expires_at into v_id, v_expires;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'window_already_open');
    when sqlstate '23514' then  -- target not an active staff member
      perform private.write_audit(v_actor, 'staff', 'staff.mfa.window.authorize', 'denied', null, 'staff_member', p_target_user_id::text, jsonb_build_object('reason', 'target_not_eligible'));
      return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.mfa.window.authorize', 'success', null, 'staff_member', p_target_user_id::text,
                              jsonb_build_object('window_id', v_id, 'minutes', p_minutes));
  return jsonb_build_object('ok', true, 'code', 'authorized', 'window_id', v_id, 'expires_at', v_expires);
end;
$$;

-- Revoke an open enrolment window --------------------------------------------------------------------------------------------
create function public.rpc_staff_revoke_enrolment_window(p_window_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_gate    text;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_changed integer;
begin
  v_gate := private.staff_gate('staff.manage', 'staff.mfa.window.revoke', true, 'enrolment_window', p_window_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_window_id is null or char_length(v_reason) not between 1 and 200 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  update private.staff_mfa_enrolment_windows w
     set revoked_at = now(), revoked_by = v_actor, revoke_reason = v_reason
   where w.id = p_window_id and w.revoked_at is null and w.consumed_at is null;
  get diagnostics v_changed = row_count;
  if v_changed = 0 then return jsonb_build_object('ok', false, 'code', 'window_not_open'); end if;
  perform private.write_audit(v_actor, 'staff', 'staff.mfa.window.revoke', 'success', null, 'enrolment_window', p_window_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'revoked');
end;
$$;

-- The staff member claims THEIR OWN freshly verified TOTP factor inside an open window ---------------------------------------
-- Not capability-gated (the caller has no approved factor yet, so staff_session_ok() is false by design). Allowed only for an
-- ACTIVE staff member, only for a window that targets the caller, and only right after a fresh TOTP verification (D-16(b)).
-- Every other rule (window open, unrevoked, unconsumed; factor verified, TOTP, created inside the window, belongs to the
-- caller; window consumed in the same step) is enforced by the 0002 trigger on private.staff_mfa_factors.
create function public.rpc_staff_claim_factor(p_window_id uuid, p_factor_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not exists (select 1 from public.staff_members s where s.user_id = v_actor and s.status = 'active') then
    raise exception 'an active staff member is required' using errcode = '42501';
  end if;
  if p_window_id is null or p_factor_id is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not private.step_up_ok() then
    perform private.write_audit(v_actor, 'staff', 'staff.mfa.factor.approve', 'denied', null, 'mfa_factor', p_factor_id::text, jsonb_build_object('reason', 'step_up_required'));
    return jsonb_build_object('ok', false, 'code', 'step_up_required');
  end if;
  begin
    insert into private.staff_mfa_factors (factor_id, user_id, window_id) values (p_factor_id, v_actor, p_window_id);
  exception
    when sqlstate '23514' then
      perform private.write_audit(v_actor, 'staff', 'staff.mfa.factor.approve', 'denied', null, 'mfa_factor', p_factor_id::text, jsonb_build_object('reason', 'approval_rejected', 'message', sqlerrm));
      return jsonb_build_object('ok', false, 'code', 'approval_rejected');
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'already_approved');
    when foreign_key_violation then
      return jsonb_build_object('ok', false, 'code', 'approval_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.mfa.factor.approve', 'success', null, 'mfa_factor', p_factor_id::text, jsonb_build_object('window_id', p_window_id));
  return jsonb_build_object('ok', true, 'code', 'approved');
end;
$$;

-- Grants and revocations ----------------------------------------------------------------------------------------------------------
revoke all on function public.rpc_staff_directory(), public.rpc_my_staff_context(), public.rpc_staff_lookup_user(text),
                       public.rpc_staff_add_member(uuid, text), public.rpc_staff_grant_role(uuid, text), public.rpc_staff_revoke_role(uuid, text),
                       public.rpc_staff_set_status(uuid, text), public.rpc_staff_authorize_enrolment_window(uuid, text, integer),
                       public.rpc_staff_revoke_enrolment_window(uuid, text), public.rpc_staff_claim_factor(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_staff_directory(), public.rpc_my_staff_context(), public.rpc_staff_lookup_user(text),
                          public.rpc_staff_add_member(uuid, text), public.rpc_staff_grant_role(uuid, text), public.rpc_staff_revoke_role(uuid, text),
                          public.rpc_staff_set_status(uuid, text), public.rpc_staff_authorize_enrolment_window(uuid, text, integer),
                          public.rpc_staff_revoke_enrolment_window(uuid, text), public.rpc_staff_claim_factor(uuid, uuid)
  to authenticated;

-- Self-checks ----------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_expected text[] := array['rpc_staff_directory', 'rpc_my_staff_context', 'rpc_staff_lookup_user', 'rpc_staff_add_member', 'rpc_staff_grant_role',
                             'rpc_staff_revoke_role', 'rpc_staff_set_status', 'rpc_staff_authorize_enrolment_window',
                             'rpc_staff_revoke_enrolment_window', 'rpc_staff_claim_factor'];
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') <> 10 then
    raise exception 'self-check: unexpected number of functions in schema public';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname <> all (v_expected) or not p.prosecdef
           or not coalesce((select bool_or(c = 'search_path=""') from unnest(p.proconfig) c), false)
           or has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute')
           or has_function_privilege('public', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute'))
  ) then
    raise exception 'self-check: a public RPC is not definer, not pinned, or has the wrong execute grants';
  end if;
  if exists (select 1 from public.audit_events) then
    raise exception 'self-check: audit_events must still be empty at install';
  end if;
end;
$$;
