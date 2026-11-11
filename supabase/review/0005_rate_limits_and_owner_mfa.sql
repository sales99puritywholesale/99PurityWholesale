-- =====================================================================================
-- 0005_rate_limits_and_owner_mfa.sql
-- *** REVIEW DRAFT rev3. NOT APPLIED ANYWHERE. NOT EXECUTED ANYWHERE. Lives in supabase/review/ on purpose. ***
-- rev3 (2026-11-10): first owner MFA enrolment only through an OPERATOR-authorized window (no self-service); operator-assisted recovery with a 24 hour
--   cool-off and ten single-use owner-only recovery codes (SQL never deletes Auth factors); per-email password-recovery throttle becomes a non-blocking
--   10 minute cool-down; new capability owner.mfa.authorize (admin only).
-- Depends on 0001-0004 (0003 and 0004 are APPLIED on the hosted development project; 0001 and 0002 too).
-- Scope (approved decisions D-P24-3, D-P24-4, D-P24-5, D-P24-6, D-P24-9, D-P24-10):
--   (1) PostgreSQL-backed, ATOMIC rate limiting with separate buckets for recovery-code attempts, MFA recovery, invitation
--       acceptance (per user and per IP) and password recovery (per email and per IP), plus replay prevention (single-use nonces);
--   (2) owner MFA: owner privileges require an aal2 session and an APPROVED verified TOTP factor (approval = a factor created inside an
--       enrolment window; first and recovery windows are opened by an operator only; see section 4); ordinary members are unaffected;
--   (3) owner recovery: ten single-use codes (hashes only), a recovery request with a 24 hour cool-off, operator-assisted completion. A recovery code
--       never creates a session, never satisfies owner_mfa_ok() or step_up_ok(), and staff cannot use codes.
-- Rules: default deny; no DML grant to any API role; SECURITY DEFINER functions pin search_path = ''. Identifiers (email, IP,
--   user id) are NEVER stored: callers pass a 32-byte keyed hash (HMAC-SHA256 with a server-side secret computed by the
--   application), so a database dump or a reader of the table cannot recover them, and an outsider cannot forge a victim's key.
-- The Supabase CLI wraps each migration file in one implicit transaction; no explicit BEGIN/COMMIT here.
-- =====================================================================================

-- 1. Rate-limit policies (immutable seed; changing a limit is a reviewed migration) -----------------------------------------
create table private.rate_limit_policies (
  bucket       text primary key check (bucket ~ '^[a-z_]{3,40}$'),
  max_attempts integer not null check (max_attempts between 1 and 1000),
  window_secs  integer not null check (window_secs between 10 and 86400),
  block_secs   integer not null check (block_secs between 10 and 86400),
  description  text not null,
  -- a block must outlast the window, so a blocked key cannot restart its counting while still blocked
  constraint rate_limit_policies_block_covers_window check (block_secs >= window_secs)
);

insert into private.rate_limit_policies (bucket, max_attempts, window_secs, block_secs, description) values
  ('recovery_code',        5,  900,  900, 'Recovery-code attempts per user: 5 per 15 minutes, then blocked 15 minutes'),
  ('mfa_recovery',         3, 3600, 3600, 'MFA recovery requests per user: 3 per hour, then blocked 1 hour'),
  ('invite_accept',       10, 3600, 3600, 'Invitation acceptance attempts per user: 10 per hour'),
  ('invite_accept_ip',    30, 3600, 3600, 'Invitation acceptance attempts per client address: 30 per hour'),
  ('password_recovery',    1,  600,  600, 'Password recovery per email: one request per 10 minutes (cool-down, non-blocking design: every allowed request sends a link to the account address)'),
  ('password_recovery_ip',20, 3600, 3600, 'Password recovery requests per client address: 20 per hour');

-- 2. Counters and single-use nonces ----------------------------------------------------------------------------------------
create table private.rate_limits (
  bucket        text  not null references private.rate_limit_policies (bucket),
  key_hash      bytea not null check (octet_length(key_hash) = 32),
  window_start  timestamptz not null,
  attempts      integer not null check (attempts >= 0),
  blocked_until timestamptz,
  updated_at    timestamptz not null,
  primary key (bucket, key_hash)
);
create index rate_limits_updated_idx on private.rate_limits (updated_at);

create table private.used_nonces (
  purpose    text  not null check (purpose ~ '^[a-z_]{3,40}$'),
  nonce_hash bytea not null check (octet_length(nonce_hash) = 32),
  expires_at timestamptz not null,
  primary key (purpose, nonce_hash)
);
create index used_nonces_expires_idx on private.used_nonces (expires_at);

alter table private.rate_limit_policies enable row level security;
alter table private.rate_limits         enable row level security;
alter table private.used_nonces         enable row level security;

-- 3. Rate limiting ---------------------------------------------------------------------------------------------------------
-- One atomic statement counts the attempt: INSERT ... ON CONFLICT DO UPDATE locks the key's row, so concurrent attempts are
-- serialized and none can slip past the limit. Counting restarts only after the window has passed AND the block (if any) has
-- ended. While blocked, attempts do not extend the block (no lockout amplification) but are always denied. The attempt that
-- exceeds the limit is itself denied. Expired rows are removed opportunistically (bounded, skip-locked) so the table cannot grow
-- without bound. Returns {allowed boolean, retry_after_secs integer}.
create function private.rate_limit_hit(p_bucket text, p_key_hash bytea) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  pol   record;
  v_now timestamptz := clock_timestamp();
  r     record;
begin
  if p_key_hash is null or octet_length(p_key_hash) <> 32 then
    raise exception 'invalid rate limit key' using errcode = '22023';
  end if;
  select p.max_attempts, p.window_secs, p.block_secs into pol from private.rate_limit_policies p where p.bucket = p_bucket;
  if not found then
    raise exception 'unknown rate limit bucket' using errcode = '22023';
  end if;

  delete from private.rate_limits d
   where d.ctid in (select l.ctid from private.rate_limits l
                     where l.updated_at < v_now - interval '2 days' and (l.blocked_until is null or l.blocked_until < v_now)
                     limit 50 for update skip locked);

  insert into private.rate_limits as l (bucket, key_hash, window_start, attempts, blocked_until, updated_at)
  values (p_bucket, p_key_hash, v_now, 1, null, v_now)
  on conflict (bucket, key_hash) do update set
    window_start  = case when l.blocked_until is not null and l.blocked_until > v_now then l.window_start
                         when v_now >= l.window_start + make_interval(secs => pol.window_secs) then v_now
                         else l.window_start end,
    attempts      = case when l.blocked_until is not null and l.blocked_until > v_now then l.attempts
                         when v_now >= l.window_start + make_interval(secs => pol.window_secs) then 1
                         else l.attempts + 1 end,
    blocked_until = case when l.blocked_until is not null and l.blocked_until > v_now then l.blocked_until
                         when (case when v_now >= l.window_start + make_interval(secs => pol.window_secs) then 1 else l.attempts + 1 end) > pol.max_attempts
                              then v_now + make_interval(secs => pol.block_secs)
                         else null end,
    updated_at    = v_now
  returning l.attempts, l.blocked_until into r;

  if r.blocked_until is not null and r.blocked_until > v_now then
    return jsonb_build_object('allowed', false, 'retry_after_secs', greatest(1, ceil(extract(epoch from (r.blocked_until - v_now)))::integer));
  end if;
  return jsonb_build_object('allowed', true, 'retry_after_secs', 0);
end;
$$;

-- Clears a counter after a SUCCESS that proves control of the secret (for example a correct recovery code). Never callable by API roles.
create function private.rate_limit_clear(p_bucket text, p_key_hash bytea) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  delete from private.rate_limits l where l.bucket = p_bucket and l.key_hash = p_key_hash;
end;
$$;

-- Replay prevention: TRUE exactly once per (purpose, nonce) until the nonce expires; FALSE for every replay. Atomic (the primary key
-- decides, the conditional update only reuses an already EXPIRED row).
create function private.consume_nonce(p_purpose text, p_nonce_hash bytea, p_ttl_secs integer) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_now  timestamptz := clock_timestamp();
  v_rows integer;
begin
  if p_nonce_hash is null or octet_length(p_nonce_hash) <> 32 or p_ttl_secs is null or p_ttl_secs not between 10 and 604800 then
    raise exception 'invalid nonce' using errcode = '22023';
  end if;
  delete from private.used_nonces d
   where d.ctid in (select n.ctid from private.used_nonces n where n.expires_at < v_now limit 50 for update skip locked);
  insert into private.used_nonces as n (purpose, nonce_hash, expires_at)
  values (p_purpose, p_nonce_hash, v_now + make_interval(secs => p_ttl_secs))
  on conflict (purpose, nonce_hash) do update set expires_at = excluded.expires_at where n.expires_at <= v_now;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- 4. Owner MFA (D-P24-4), rev3: TRUSTED FACTOR APPROVAL, OPERATOR-AUTHORIZED ENROLMENT, OPERATOR-ASSISTED RECOVERY ---------------------
-- Finding (observed on hosted Supabase Auth): a TOTP factor enrolled earlier and never verified can be verified at aal1 by anyone who knows its
-- secret, and the resulting session is aal2. "aal2 + a verified TOTP factor" therefore proves nothing about WHICH factor was used.
-- Trust model (the same as staff in 0002):
--   * a factor counts only if a row in private.owner_mfa_factors approves it; a row can only be inserted by a trigger that checks, at that instant,
--     that an enrolment window for this user is open, that the factor is verified TOTP of this user AND was created INSIDE the window, that no OTHER
--     verified factor exists (first and recovery windows), and that the user is an active organization owner; the window is locked and consumed
--     in the same step (single use);
--   * owner_mfa_ok() fails if the caller has ANY verified factor that is not approved;
--   * FIRST enrolment and RECOVERY windows are opened only by an OPERATOR (rev3, decision D-P24-6): an active staff member whose session passes
--     staff_gate (aal2, approved factor, fresh step-up, structure check) and who holds the dedicated capability owner.mfa.authorize. There is no
--     self-service first enrolment: a CHECK constraint on the windows table makes a first or recovery window without a different authorizing user
--     impossible, and the window insert trigger re-verifies the operator's capability at the instant of insertion;
--   * an ADDITIONAL factor needs an approved, clean owner session plus a fresh step-up (self-authorized window);
--   * recovery codes (ten, single use, owners only) only ever create a recovery REQUEST with a 24 hour cool-off; they never create a session, never
--     satisfy owner_mfa_ok() or step_up_ok(), and staff cannot use them. Lost-factor recovery stays OPERATOR-ASSISTED: no function in this file writes to
--     or deletes from auth.*; the operator removes the factors by hand, then opens a recovery window (which needs a ready request and no verified factor).
-- Nothing here writes to auth.* (reads only: id, user_id, factor_type, status, created_at).

-- 4a. New capability for the operator (admin only). Additive rows; no existing row changes.
insert into public.capabilities (code, description) values
  ('owner.mfa.authorize', 'Authorize an owner MFA enrolment window (first enrolment, or recovery after the cool-off) and read an owner''s MFA state');
insert into public.role_capabilities (role, capability_code) values ('admin', 'owner.mfa.authorize');

-- 4b. Windows and approved factors
create table private.owner_mfa_windows (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('first', 'additional', 'recovery')),
  authorized_by uuid,   -- the operator (first, recovery) or the owner themself (additional); no FK on purpose: an audit reference that must survive account deletion
  reason        text not null check (char_length(btrim(reason)) between 1 and 200),
  opened_at     timestamptz not null default clock_timestamp(),
  expires_at    timestamptz not null default clock_timestamp() + interval '10 minutes',
  consumed_at   timestamptz,
  revoked_at    timestamptz,
  constraint owner_mfa_windows_bounded check (expires_at > opened_at and expires_at <= opened_at + interval '60 minutes'),
  constraint owner_mfa_windows_single_outcome check (not (consumed_at is not null and revoked_at is not null)),
  constraint owner_mfa_windows_authorizer check (
       (kind = 'additional' and authorized_by = user_id)
    or (kind in ('first', 'recovery') and authorized_by is not null and authorized_by <> user_id)),
  constraint owner_mfa_windows_id_user_key unique (id, user_id)
);
create unique index owner_mfa_windows_one_open_idx on private.owner_mfa_windows (user_id) where consumed_at is null and revoked_at is null;

-- Approved factors. No FK to auth.mfa_factors on purpose (the insert trigger checks it). Rows are never deleted by any function, so an existing
-- row is also the permanent record that this user once had an approved factor (approval history).
create table private.owner_mfa_factors (
  factor_id   uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  window_id   uuid not null,
  approved_at timestamptz not null default clock_timestamp(),
  constraint owner_mfa_factors_window_user_fk foreign key (window_id, user_id)
    references private.owner_mfa_windows (id, user_id) on delete cascade,
  constraint owner_mfa_factors_one_per_window unique (window_id)
);
create index owner_mfa_factors_user_idx on private.owner_mfa_factors (user_id);

-- 4c. Recovery codes (hashes only) and recovery requests
create table private.owner_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  set_id     uuid not null,
  code_hash  bytea not null check (octet_length(code_hash) = 32),   -- SHA-256 of the normalized code bound to the user id, computed by the application; the code itself is never stored
  created_at timestamptz not null default clock_timestamp(),
  used_at    timestamptz,
  voided_at  timestamptz,
  constraint owner_recovery_codes_user_hash_key unique (user_id, code_hash),
  constraint owner_recovery_codes_single_end check (not (used_at is not null and voided_at is not null))
);
create index owner_recovery_codes_open_idx on private.owner_recovery_codes (user_id) where used_at is null and voided_at is null;

create table private.owner_recovery_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'cancelled', 'completed', 'expired')),
  created_at   timestamptz not null default clock_timestamp(),
  cooloff_until timestamptz not null,
  expires_at   timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  window_id    uuid,
  constraint owner_recovery_requests_cooloff check (cooloff_until >= created_at + interval '24 hours'),
  constraint owner_recovery_requests_expiry check (expires_at > cooloff_until and expires_at <= cooloff_until + interval '7 days'),
  constraint owner_recovery_requests_status_dates check (
       (status = 'cancelled') = (cancelled_at is not null)
   and (status = 'completed') = (completed_at is not null))
);
create unique index owner_recovery_requests_one_pending_idx on private.owner_recovery_requests (user_id) where status = 'pending';

alter table private.owner_mfa_windows       enable row level security;
alter table private.owner_mfa_factors       enable row level security;
alter table private.owner_recovery_codes    enable row level security;
alter table private.owner_recovery_requests enable row level security;

-- 4d. Helper: the factor state of one user (used by the guards and the RPCs). 'unapproved_factor_present' wins over everything.
create function private.owner_factor_state(p_user uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_live       boolean;
  v_unapproved boolean;
  v_hist       boolean;
begin
  select exists (select 1 from private.owner_mfa_factors a
                   join auth.mfa_factors f on f.id = a.factor_id and f.user_id = a.user_id
                  where a.user_id = p_user and f.status::text = 'verified' and f.factor_type::text = 'totp')
    into v_live;
  select exists (select 1 from auth.mfa_factors f
                  where f.user_id = p_user and f.status::text = 'verified'
                    and not exists (select 1 from private.owner_mfa_factors a where a.user_id = f.user_id and a.factor_id = f.id))
    into v_unapproved;
  select exists (select 1 from private.owner_mfa_factors a where a.user_id = p_user) into v_hist;
  if v_unapproved then return 'unapproved_factor_present'; end if;
  if v_live then return 'approved'; end if;
  if v_hist then return 'recovery_required'; end if;
  return 'none';
exception when others then
  return 'unknown';
end;
$$;

-- Per-user rate-limit key derived INSIDE the database from the caller's own id: a caller can neither choose nor influence another user's counter
-- (no secret pepper is needed for user-scoped buckets; the counter table is unreachable by API roles).
create function private.rl_user_key(p_purpose text) returns bytea
language sql stable set search_path = ''
as $$
  select sha256(convert_to('p2:rl:v1:' || p_purpose || ':' || ((select auth.uid())::text), 'UTF8'));
$$;

-- 4e. Guards -------------------------------------------------------------------------------------------------------------------------
-- A window may only change from open to consumed or revoked, once.
create function private.guard_owner_mfa_window_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.kind <> old.kind or new.authorized_by is distinct from old.authorized_by
     or new.reason <> old.reason or new.opened_at <> old.opened_at or new.expires_at <> old.expires_at then
    raise exception 'owner enrolment window identity, authorizer, reason and timing are immutable' using errcode = '23514';
  end if;
  if (old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'owner enrolment window outcome is final' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Window creation gate (defense in depth: the RPCs check the same things, but a direct insert by any other code path meets this trigger).
--   first      : state 'none' (never approved, no verified factor), authorized by an ACTIVE staff member holding owner.mfa.authorize
--   recovery   : state 'recovery_required' (approval history, no live approved factor, no verified factor at all) AND a pending recovery request whose
--                24 hour cool-off has elapsed and has not expired, authorized by such an operator
--   additional : state 'approved', authorized by the owner themself
-- The target must be an ACTIVE organization owner in every case.
create function private.guard_owner_mfa_window_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_state text;
begin
  if not exists (select 1 from public.organization_members m where m.user_id = new.user_id and m.status = 'active' and m.role = 'owner') then
    raise exception 'target is not an active organization owner' using errcode = '23514';
  end if;
  v_state := private.owner_factor_state(new.user_id);
  if new.kind = 'first' and v_state <> 'none' then
    raise exception 'a first-enrolment window requires a user with no approval history and no verified factor' using errcode = '23514';
  end if;
  if new.kind = 'additional' and v_state <> 'approved' then
    raise exception 'an additional-factor window requires an approved, clean factor state' using errcode = '23514';
  end if;
  if new.kind = 'recovery' then
    if v_state <> 'recovery_required' then
      raise exception 'a recovery window requires approval history, no live approved factor and no verified factor' using errcode = '23514';
    end if;
    if not exists (select 1 from private.owner_recovery_requests r
                    where r.user_id = new.user_id and r.status = 'pending'
                      and r.cooloff_until <= clock_timestamp() and r.expires_at > clock_timestamp()) then
      raise exception 'a recovery window requires a pending request whose cool-off has elapsed' using errcode = '23514';
    end if;
  end if;
  if new.kind in ('first', 'recovery') and not exists (
       select 1 from public.staff_members s
         join public.staff_roles r on r.user_id = s.user_id
         join public.role_capabilities rc on rc.role = r.role
        where s.user_id = new.authorized_by and s.status = 'active' and rc.capability_code = 'owner.mfa.authorize') then
    raise exception 'the authorizer must be an active staff member holding owner.mfa.authorize' using errcode = '23514';
  end if;
  if new.revoked_at is not null or new.consumed_at is not null then
    raise exception 'enrolment window must be created open' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Approval gate for a factor (see the header). Window locked and consumed in the same step.
create function private.guard_owner_mfa_factor_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_target   uuid;
  v_kind     text;
  v_opened   timestamptz;
  v_expires  timestamptz;
  v_revoked  timestamptz;
  v_consumed timestamptz;
  v_fuser    uuid;
  v_fstatus  text;
  v_ftype    text;
  v_fcreated timestamptz;
begin
  select w.user_id, w.kind, w.opened_at, w.expires_at, w.revoked_at, w.consumed_at
    into v_target, v_kind, v_opened, v_expires, v_revoked, v_consumed
    from private.owner_mfa_windows w
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
  if clock_timestamp() < v_opened or clock_timestamp() >= v_expires then
    raise exception 'enrolment window is not open' using errcode = '23514';
  end if;
  if not exists (select 1 from public.organization_members m
                  where m.user_id = new.user_id and m.status = 'active' and m.role = 'owner') then
    raise exception 'target is not an active organization owner' using errcode = '23514';
  end if;
  if v_kind = 'first' and exists (select 1 from private.owner_mfa_factors a where a.user_id = new.user_id) then
    raise exception 'a first-enrolment window is not valid for a user with approval history' using errcode = '23514';
  end if;
  if (select count(*) from private.owner_mfa_factors a where a.user_id = new.user_id) >= 3 then
    raise exception 'too many approved factors' using errcode = '23514';
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
  if v_fcreated is null or v_fcreated < v_opened or v_fcreated > clock_timestamp() then
    raise exception 'factor was not created inside the enrolment window' using errcode = '23514';
  end if;
  -- first and recovery windows: the new factor must be the ONLY verified factor (no leftover can ride along)
  if v_kind in ('first', 'recovery') and exists (
       select 1 from auth.mfa_factors f where f.user_id = new.user_id and f.status::text = 'verified' and f.id <> new.factor_id) then
    raise exception 'another verified factor exists' using errcode = '23514';
  end if;

  update private.owner_mfa_windows set consumed_at = clock_timestamp() where id = new.window_id;
  new.approved_at := clock_timestamp();
  return new;
end;
$$;

create function private.guard_owner_mfa_factor_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'approved owner factor rows are immutable' using errcode = '23514';
  return new;
end;
$$;

-- Recovery codes: only used_at or voided_at may be set, once; nothing else changes.
create function private.guard_owner_recovery_code_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.set_id <> old.set_id or new.code_hash <> old.code_hash or new.created_at <> old.created_at then
    raise exception 'recovery code identity is immutable' using errcode = '23514';
  end if;
  if (old.used_at is not null and new.used_at is distinct from old.used_at) or (old.voided_at is not null and new.voided_at is distinct from old.voided_at) then
    raise exception 'a used or voided recovery code cannot change again' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Recovery requests: only pending requests may change status; identity and timing are immutable.
create function private.guard_owner_recovery_request_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.created_at <> old.created_at or new.cooloff_until <> old.cooloff_until or new.expires_at <> old.expires_at then
    raise exception 'recovery request identity and timing are immutable' using errcode = '23514';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'a finished recovery request cannot change again' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger owner_mfa_windows_guard_insert before insert on private.owner_mfa_windows
  for each row execute function private.guard_owner_mfa_window_insert();
create trigger owner_mfa_windows_guard_update before update on private.owner_mfa_windows
  for each row execute function private.guard_owner_mfa_window_update();
create trigger owner_mfa_factors_guard_insert before insert on private.owner_mfa_factors
  for each row execute function private.guard_owner_mfa_factor_insert();
create trigger owner_mfa_factors_guard_update before update on private.owner_mfa_factors
  for each row execute function private.guard_owner_mfa_factor_update();
create trigger owner_recovery_codes_guard_update before update on private.owner_recovery_codes
  for each row execute function private.guard_owner_recovery_code_update();
create trigger owner_recovery_requests_guard_update before update on private.owner_recovery_requests
  for each row execute function private.guard_owner_recovery_request_update();
create trigger owner_mfa_windows_no_truncate before truncate on private.owner_mfa_windows
  for each statement execute function private.block_truncate();
create trigger owner_mfa_factors_no_truncate before truncate on private.owner_mfa_factors
  for each statement execute function private.block_truncate();
create trigger owner_recovery_codes_no_truncate before truncate on private.owner_recovery_codes
  for each statement execute function private.block_truncate();
create trigger owner_recovery_requests_no_truncate before truncate on private.owner_recovery_requests
  for each statement execute function private.block_truncate();

-- 4f. Owner MFA predicate and the policies that use it ----------------------------------------------------------------------------------
-- TRUE only if the token is aal2 AND the caller has at least one APPROVED verified TOTP factor AND no verified factor (any type) that is not approved
-- AND no factor row with an unreadable or unrecognized type or status. Any error returns FALSE (fail closed). It does NOT read any recovery table: a
-- recovery code can never make this TRUE (asserted by the self-check below).
create function private.owner_mfa_ok() returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_unreadable bigint;
  v_unapproved bigint;
  v_approved   bigint;
begin
  if v_uid is null or coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then
    return false;
  end if;
  select
    count(*) filter (where f.status is null or f.factor_type is null
                       or f.status::text not in ('verified', 'unverified')
                       or f.factor_type::text not in ('totp', 'phone', 'webauthn')),
    count(*) filter (where f.status::text = 'verified'
                       and not exists (select 1 from private.owner_mfa_factors a where a.user_id = f.user_id and a.factor_id = f.id)),
    count(*) filter (where f.status::text = 'verified' and f.factor_type::text = 'totp'
                       and exists (select 1 from private.owner_mfa_factors a where a.user_id = f.user_id and a.factor_id = f.id))
    into v_unreadable, v_unapproved, v_approved
    from auth.mfa_factors f
   where f.user_id = v_uid;
  return v_unreadable = 0 and v_unapproved = 0 and v_approved >= 1;
exception when others then
  return false;
end;
$$;

create function private.my_mfa_owner_org_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.organization_id
    from public.organization_members m
   where m.user_id = (select auth.uid()) and m.status = 'active' and m.role = 'owner'
     and (select private.owner_mfa_ok());
$$;

alter policy organization_billing_select_owner on public.organization_billing
  using (organization_id in (select private.my_mfa_owner_org_ids()));
alter policy organization_invites_select_owner on public.organization_invites
  using (organization_id in (select private.my_mfa_owner_org_ids()));

-- 5. RPCs -----------------------------------------------------------------------------------------------------------------
-- Password recovery happens BEFORE sign-in, so its throttle has to be callable without a session. This is the ONLY function in the whole design
-- executable by anon. It accepts two opaque keyed hashes (never an email or an address), returns only {allowed, retry_after_secs}, reads and returns nothing
-- else, and counts BOTH keys. NON-BLOCKING DESIGN (approved): the per-email bucket is a 10 minute COOL-DOWN, not a quota with a long block. The application
-- contract that makes this safe against a third party who merely knows an email address: (1) every ALLOWED request sends a genuine reset email to the
-- address ON FILE for the account (never to a submitted address), valid for at least 60 minutes, so whoever occupies the slot causes the legitimate owner to
-- receive a usable link; (2) a DENIED request gets the same generic response and timing class as an allowed one and sends nothing; (3) the response never
-- depends on whether the email exists (existing and unknown emails are counted identically). The per-address bucket still blocks, but only the sender's own
-- address. Residual risks: an outsider can create counter rows with random keys (they expire and are deleted opportunistically; platform request limits
-- apply); an attacker can cause at most one reset email per cool-down period to reach the owner's inbox.
create function public.rpc_throttle_password_recovery(p_email_hash bytea, p_ip_hash bytea) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email jsonb;
  v_ip    jsonb;
begin
  v_email := private.rate_limit_hit('password_recovery', p_email_hash);
  v_ip    := private.rate_limit_hit('password_recovery_ip', p_ip_hash);
  if (v_email ->> 'allowed')::boolean and (v_ip ->> 'allowed')::boolean then
    return jsonb_build_object('allowed', true, 'retry_after_secs', 0);
  end if;
  return jsonb_build_object('allowed', false, 'retry_after_secs',
                            greatest((v_email ->> 'retry_after_secs')::integer, (v_ip ->> 'retry_after_secs')::integer));
end;
$$;

-- 5a. Owner enrolment windows -------------------------------------------------------------------------------------------------------------
-- OPERATOR RPC. Opens the FIRST-enrolment window (state none) or the RECOVERY window (state recovery_required, after the 24 hour cool-off and with
-- no verified factor left, i.e. after the operator removed the lost factors by hand) for ONE owner. Independently authenticated (staff_gate: verified
-- staff session at aal2 with an approved factor, fresh TOTP step-up, structure check), dedicated capability, audited in the same transaction, single use
-- (the window is consumed by the approval trigger), at most 60 minutes, one open window per user. The operator cannot be the owner (the staff/member
-- exclusion keeps the populations disjoint, and the CHECK constraint forbids authorized_by = user_id for these kinds).
-- Returns {ok, code, kind?, window_id?, expires_at?}.
create function public.rpc_staff_authorize_owner_mfa_window(p_owner_user_id uuid, p_reason text, p_minutes integer default 30) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_state  text;
  v_kind   text;
  v_cool   timestamptz;
  v_exp    timestamptz;
  v_org    uuid;
  v_id     uuid;
  v_end    timestamptz;
begin
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_mfa_window.authorize', true, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null or char_length(v_reason) not between 1 and 200 or p_minutes is null or p_minutes not between 5 and 60 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_owner_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = p_owner_user_id and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'target_not_eligible'));
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));
  v_state := private.owner_factor_state(p_owner_user_id);
  if v_state = 'none' then
    v_kind := 'first';
  elsif v_state = 'recovery_required' then
    select r.cooloff_until, r.expires_at into v_cool, v_exp
      from private.owner_recovery_requests r where r.user_id = p_owner_user_id and r.status = 'pending' order by r.created_at desc limit 1;
    if not found then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'no_recovery_request'));
      return jsonb_build_object('ok', false, 'code', 'recovery_not_ready');
    end if;
    if clock_timestamp() < v_cool then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'cooling_off'));
      return jsonb_build_object('ok', false, 'code', 'recovery_cooling_off', 'cooloff_until', v_cool);
    end if;
    if clock_timestamp() >= v_exp then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'request_expired'));
      return jsonb_build_object('ok', false, 'code', 'recovery_request_expired');
    end if;
    v_kind := 'recovery';
  else
    -- approved: nothing to authorize (an owner adds factors themself); unapproved_factor_present: the operator must remove the leftover by hand first
    perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', v_state));
    return jsonb_build_object('ok', false, 'code', case v_state when 'approved' then 'already_enrolled' when 'unapproved_factor_present' then 'unapproved_factor_present' else 'unknown_state' end);
  end if;

  begin
    update private.owner_mfa_windows set revoked_at = clock_timestamp()
     where user_id = p_owner_user_id and consumed_at is null and revoked_at is null;
    insert into private.owner_mfa_windows (user_id, kind, authorized_by, reason, expires_at)
    values (p_owner_user_id, v_kind, v_actor, v_reason, clock_timestamp() + make_interval(mins => p_minutes))
    returning id, expires_at into v_id, v_end;
  exception when sqlstate '23514' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'window_rejected'));
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'success', v_org, 'user', p_owner_user_id::text,
                              jsonb_build_object('kind', v_kind, 'window_id', v_id, 'minutes', p_minutes));
  return jsonb_build_object('ok', true, 'code', 'authorized', 'kind', v_kind, 'window_id', v_id, 'expires_at', v_end);
end;
$$;

-- OPERATOR RPC (read). What the operator needs to decide: the owner's factor state and any pending recovery request. Same gate and capability;
-- audited because it discloses security state.
create function public.rpc_staff_owner_mfa_overview(p_owner_user_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_state text;
  v_req   record;
  v_ver   integer;
begin
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_mfa.overview', false, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  if not exists (select 1 from public.organization_members m where m.user_id = p_owner_user_id and m.status = 'active' and m.role = 'owner') then
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;
  v_state := private.owner_factor_state(p_owner_user_id);
  select count(*)::integer into v_ver from auth.mfa_factors f where f.user_id = p_owner_user_id and f.status::text = 'verified';
  select r.status, r.created_at, r.cooloff_until, r.expires_at into v_req
    from private.owner_recovery_requests r where r.user_id = p_owner_user_id and r.status = 'pending' order by r.created_at desc limit 1;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa.overview', 'success', null, 'user', p_owner_user_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'factor_state', v_state, 'verified_factor_count', v_ver,
    'recovery_request', case when v_req.status is null then null
      else jsonb_build_object('created_at', v_req.created_at, 'cooloff_until', v_req.cooloff_until, 'expires_at', v_req.expires_at,
                              'cooloff_elapsed', clock_timestamp() >= v_req.cooloff_until) end);
end;
$$;

-- OWNER RPC. An ADDITIONAL factor: needs an approved, clean owner session plus a fresh step-up. There is NO self-service first enrolment and no
-- self-service recovery: every other state is denied and audited, and the code tells the application which operator step is needed.
create function public.rpc_owner_open_factor_window() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_state text;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = v_actor and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    return jsonb_build_object('ok', false, 'code', 'not_an_owner');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || v_actor::text, 0));
  v_state := private.owner_factor_state(v_actor);
  if v_state <> 'approved' then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.open', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', v_state));
    return jsonb_build_object('ok', false, 'code', case v_state
                                                     when 'none' then 'operator_authorization_required'
                                                     when 'recovery_required' then 'recovery_required'
                                                     when 'unapproved_factor_present' then 'unapproved_factor_present'
                                                     else 'unknown_state' end);
  end if;
  if not (private.owner_mfa_ok() and private.step_up_ok()) then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.open', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'step_up_required'));
    return jsonb_build_object('ok', false, 'code', 'step_up_required');
  end if;
  begin
    update private.owner_mfa_windows set revoked_at = clock_timestamp() where user_id = v_actor and consumed_at is null and revoked_at is null;
    insert into private.owner_mfa_windows (user_id, kind, authorized_by, reason) values (v_actor, 'additional', v_actor, 'owner adds an additional factor')
    returning id, expires_at into v_id, v_exp;
  exception when sqlstate '23514' then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.open', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'window_rejected'));
    return jsonb_build_object('ok', false, 'code', 'unknown_state');
  end;
  perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.open', 'success', v_org, 'user', v_actor::text, jsonb_build_object('kind', 'additional', 'window_id', v_id));
  return jsonb_build_object('ok', true, 'code', 'window_open', 'kind', 'additional', 'expires_at', v_exp);
end;
$$;

-- OWNER RPC. Approves the factor created inside the caller's open window (any kind). Needs aal2 and a fresh TOTP (the verification of the new factor
-- itself). A recovery window also completes the recovery request and voids the remaining recovery codes (a new set is issued afterwards from the
-- approved session).
create function public.rpc_owner_claim_factor(p_factor_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_win   uuid;
  v_kind  text;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = v_actor and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    return jsonb_build_object('ok', false, 'code', 'not_an_owner');
  end if;
  if p_factor_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;
  if not private.step_up_ok() then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_factor.approve', 'denied', v_org, 'mfa_factor', p_factor_id::text, jsonb_build_object('reason', 'step_up_required'));
    return jsonb_build_object('ok', false, 'code', 'step_up_required');
  end if;
  select w.id, w.kind into v_win, v_kind
    from private.owner_mfa_windows w
   where w.user_id = v_actor and w.consumed_at is null and w.revoked_at is null and clock_timestamp() < w.expires_at;
  if v_win is null then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_factor.approve', 'denied', v_org, 'mfa_factor', p_factor_id::text, jsonb_build_object('reason', 'no_open_window'));
    return jsonb_build_object('ok', false, 'code', 'no_open_window');
  end if;
  begin
    insert into private.owner_mfa_factors (factor_id, user_id, window_id) values (p_factor_id, v_actor, v_win);
  exception
    when unique_violation then
      perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_factor.approve', 'denied', v_org, 'mfa_factor', p_factor_id::text, jsonb_build_object('reason', 'already_approved'));
      return jsonb_build_object('ok', false, 'code', 'already_approved');
    when sqlstate '23514' then
      -- the trigger's message is deliberately not returned (it would describe which rule failed to an attacker)
      perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_factor.approve', 'denied', v_org, 'mfa_factor', p_factor_id::text, jsonb_build_object('reason', 'factor_not_eligible'));
      return jsonb_build_object('ok', false, 'code', 'factor_not_eligible');
  end;
  if v_kind = 'recovery' then
    update private.owner_recovery_requests set status = 'completed', completed_at = clock_timestamp(), window_id = v_win
     where user_id = v_actor and status = 'pending';
    update private.owner_recovery_codes set voided_at = clock_timestamp() where user_id = v_actor and used_at is null and voided_at is null;
  end if;
  perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_factor.approve', 'success', v_org, 'mfa_factor', p_factor_id::text,
                              jsonb_build_object('window_id', v_win, 'kind', v_kind));
  return jsonb_build_object('ok', true, 'code', 'factor_approved');
end;
$$;

-- 5b. Recovery codes (owners only) ---------------------------------------------------------------------------------------------------------
-- OWNER RPC. Issues the set of TEN single-use recovery codes (the application generates them and sends only SHA-256 hashes bound to the user id; the
-- database never sees a code). Only from an approved, clean, fresh-step-up owner session; the previous set is voided in the same transaction. Staff and
-- non-owners are refused (the same generic code).
create function public.rpc_owner_set_recovery_codes(p_hashes bytea[]) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_set   uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = v_actor and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null or exists (select 1 from public.staff_members s where s.user_id = v_actor) then
    return jsonb_build_object('ok', false, 'code', 'not_available');
  end if;
  if p_hashes is null or cardinality(p_hashes) <> 10
     or exists (select 1 from unnest(p_hashes) h where h is null or octet_length(h) <> 32)
     or (select count(distinct h) from unnest(p_hashes) h) <> 10 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if not (private.owner_mfa_ok() and private.step_up_ok()) then
    perform private.write_audit(v_actor, 'organization_user', 'owner.recovery_codes.issue', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'step_up_required'));
    return jsonb_build_object('ok', false, 'code', 'step_up_required');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_actor::text, 0));
  update private.owner_recovery_codes set voided_at = clock_timestamp() where user_id = v_actor and used_at is null and voided_at is null;
  begin
    insert into private.owner_recovery_codes (user_id, set_id, code_hash) select v_actor, v_set, h from unnest(p_hashes) h;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'code_reused');
  end;
  perform private.write_audit(v_actor, 'organization_user', 'owner.recovery_codes.issue', 'success', v_org, 'user', v_actor::text, jsonb_build_object('count', 10, 'set_id', v_set));
  return jsonb_build_object('ok', true, 'code', 'codes_issued', 'count', 10);
end;
$$;

-- OWNER RPC. Submits ONE recovery code (hash). A valid code creates a recovery REQUEST with a 24 hour cool-off: it creates no session, changes no assurance
-- level, approves no factor, and is not read by owner_mfa_ok() or step_up_ok(). Callable with a password-only (aal1) session: that is the point of recovery.
-- Generic responses: a wrong code, a non-owner and a staff caller all receive the same code and nothing about which part failed. Per-user throttles are
-- keyed inside the database from the caller's own id: recovery_code (5 per 15 minutes, then 15 minutes blocked) and mfa_recovery (3 requests per hour).
create function public.rpc_owner_recovery_request(p_code_hash bytea) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_key   bytea;
  v_rl    jsonb;
  v_code  uuid;
  v_cool  timestamptz;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_code_hash is null or octet_length(p_code_hash) <> 32 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  v_key := private.rl_user_key('recovery_code');
  v_rl := private.rate_limit_hit('recovery_code', v_key);
  if not (v_rl ->> 'allowed')::boolean then
    return jsonb_build_object('ok', false, 'code', 'throttled', 'retry_after_secs', (v_rl ->> 'retry_after_secs')::integer);
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = v_actor and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null or exists (select 1 from public.staff_members s where s.user_id = v_actor) then
    return jsonb_build_object('ok', false, 'code', 'request_not_accepted');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_actor::text, 0));
  update private.owner_recovery_requests set status = 'expired' where user_id = v_actor and status = 'pending' and expires_at <= clock_timestamp();
  if exists (select 1 from private.owner_recovery_requests r where r.user_id = v_actor and r.status = 'cancelled' and r.cancelled_at > clock_timestamp() - interval '24 hours') then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_recovery.request', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'recovery_locked'));
    return jsonb_build_object('ok', false, 'code', 'recovery_locked');
  end if;
  if exists (select 1 from private.owner_recovery_requests r where r.user_id = v_actor and r.status = 'pending') then
    return jsonb_build_object('ok', false, 'code', 'request_pending');
  end if;

  select c.id into v_code from private.owner_recovery_codes c
   where c.user_id = v_actor and c.code_hash = p_code_hash and c.used_at is null and c.voided_at is null
     for update;
  if v_code is null then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_recovery.request', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'invalid_code'));
    return jsonb_build_object('ok', false, 'code', 'request_not_accepted');
  end if;
  v_rl := private.rate_limit_hit('mfa_recovery', private.rl_user_key('mfa_recovery'));
  if not (v_rl ->> 'allowed')::boolean then
    return jsonb_build_object('ok', false, 'code', 'throttled', 'retry_after_secs', (v_rl ->> 'retry_after_secs')::integer);
  end if;

  update private.owner_recovery_codes set used_at = clock_timestamp() where id = v_code;
  v_cool := clock_timestamp() + interval '24 hours';
  insert into private.owner_recovery_requests (user_id, cooloff_until, expires_at) values (v_actor, v_cool, v_cool + interval '7 days');
  perform private.rate_limit_clear('recovery_code', v_key);
  perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_recovery.request', 'success', v_org, 'user', v_actor::text, jsonb_build_object('cooloff_until', v_cool));
  return jsonb_build_object('ok', true, 'code', 'request_created', 'cooloff_until', v_cool);
end;
$$;

-- OWNER RPC. Cancels the caller's own pending request; a cancelled request locks new recovery requests for 24 hours.
create function public.rpc_owner_recovery_cancel() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_n     integer;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = v_actor and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null or exists (select 1 from public.staff_members s where s.user_id = v_actor) then
    return jsonb_build_object('ok', false, 'code', 'not_available');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_actor::text, 0));
  update private.owner_recovery_requests set status = 'cancelled', cancelled_at = clock_timestamp() where user_id = v_actor and status = 'pending';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'code', 'no_pending_request');
  end if;
  perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_recovery.cancel', 'success', v_org, 'user', v_actor::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'code', 'request_cancelled');
end;
$$;

-- 5c. Owner context for the application server (never trusted from the client). Own state only.
create function public.rpc_my_owner_context(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_owner boolean;
  v_rec   text := 'none';
  v_req   record;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select exists (select 1 from public.organization_members m
                  where m.organization_id = p_organization_id and m.user_id = v_actor and m.status = 'active' and m.role = 'owner')
    into v_owner;
  if v_owner then
    select r.status, r.cooloff_until, r.expires_at, r.cancelled_at into v_req
      from private.owner_recovery_requests r where r.user_id = v_actor order by r.created_at desc limit 1;
    if v_req.status = 'pending' and v_req.expires_at > clock_timestamp() then
      v_rec := case when clock_timestamp() < v_req.cooloff_until then 'cooling_off' else 'ready' end;
    elsif v_req.status = 'cancelled' and v_req.cancelled_at > clock_timestamp() - interval '24 hours' then
      v_rec := 'locked';
    end if;
  end if;
  return jsonb_build_object('is_owner', v_owner, 'owner_mfa_ok', v_owner and private.owner_mfa_ok(), 'step_up_ok', private.step_up_ok(),
                            'factor_state', case when v_owner then private.owner_factor_state(v_actor) else 'none' end,
                            'recovery_status', v_rec,
                            'recovery_codes_remaining', case when v_owner then (select count(*)::integer from private.owner_recovery_codes c where c.user_id = v_actor and c.used_at is null and c.voided_at is null) else 0 end);
end;
$$;

-- 6. Grants and revocations ------------------------------------------------------------------------------------------------
revoke all on table private.rate_limit_policies, private.rate_limits, private.used_nonces,
                    private.owner_mfa_windows, private.owner_mfa_factors,
                    private.owner_recovery_codes, private.owner_recovery_requests
  from public, anon, authenticated, service_role;

revoke all on function private.rate_limit_hit(text, bytea), private.rate_limit_clear(text, bytea), private.consume_nonce(text, bytea, integer),
                       private.owner_mfa_ok(), private.my_mfa_owner_org_ids(), private.owner_factor_state(uuid), private.rl_user_key(text),
                       private.guard_owner_mfa_window_insert(), private.guard_owner_mfa_window_update(),
                       private.guard_owner_mfa_factor_insert(), private.guard_owner_mfa_factor_update(),
                       private.guard_owner_recovery_code_update(), private.guard_owner_recovery_request_update()
  from public, anon, authenticated, service_role;
-- The policies above call private.my_mfa_owner_org_ids() as the querying role, exactly like my_org_ids() in 0001: it must be executable.
grant execute on function private.my_mfa_owner_org_ids() to authenticated;
-- The MFA-less owner function of 0001 is no longer used by any policy (the only two users were altered above). Removing its grant makes sure no future
-- policy can pick it up by mistake and bypass owner MFA: new owner-scoped policies must use my_mfa_owner_org_ids().
revoke execute on function private.my_owner_org_ids() from authenticated;

revoke all on function public.rpc_throttle_password_recovery(bytea, bytea), public.rpc_my_owner_context(uuid),
                       public.rpc_owner_open_factor_window(), public.rpc_owner_claim_factor(uuid),
                       public.rpc_owner_set_recovery_codes(bytea[]), public.rpc_owner_recovery_request(bytea), public.rpc_owner_recovery_cancel(),
                       public.rpc_staff_authorize_owner_mfa_window(uuid, text, integer), public.rpc_staff_owner_mfa_overview(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_throttle_password_recovery(bytea, bytea) to anon, authenticated;
grant execute on function public.rpc_my_owner_context(uuid), public.rpc_owner_open_factor_window(), public.rpc_owner_claim_factor(uuid),
                          public.rpc_owner_set_recovery_codes(bytea[]), public.rpc_owner_recovery_request(bytea), public.rpc_owner_recovery_cancel(),
                          public.rpc_staff_authorize_owner_mfa_window(uuid, text, integer), public.rpc_staff_owner_mfa_overview(uuid)
  to authenticated;

-- 7. Self-checks -------------------------------------------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
  f text;
begin
  foreach t in array array['private.rate_limit_policies', 'private.rate_limits', 'private.used_nonces', 'private.owner_mfa_windows', 'private.owner_mfa_factors',
                           'private.owner_recovery_codes', 'private.owner_recovery_requests'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then raise exception 'self-check: RLS not enabled on %', t; end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) or has_table_privilege('service_role', t, p) then
        raise exception 'self-check: an API role has % on %', p, t;
      end if;
    end loop;
  end loop;
  if (select count(*) from private.rate_limit_policies) <> 6 then raise exception 'self-check: expected 6 rate limit policies'; end if;
  if not exists (select 1 from private.rate_limit_policies where bucket = 'password_recovery' and max_attempts = 1 and window_secs = 600 and block_secs = 600) then
    raise exception 'self-check: the per-email bucket must be the 10 minute cool-down (non-blocking design)';
  end if;
  if exists (select 1 from private.rate_limits) or exists (select 1 from private.used_nonces) or exists (select 1 from private.owner_mfa_windows)
     or exists (select 1 from private.owner_mfa_factors) or exists (select 1 from private.owner_recovery_codes) or exists (select 1 from private.owner_recovery_requests) then
    raise exception 'self-check: counters, windows, approvals, recovery codes and requests must be empty at install';
  end if;
  -- the operator capability: exactly one new capability, held by admin only
  if (select count(*) from public.capabilities) <> 28 then raise exception 'self-check: capability catalog size'; end if;
  if (select count(*) from public.role_capabilities where capability_code = 'owner.mfa.authorize') <> 1
     or not exists (select 1 from public.role_capabilities where capability_code = 'owner.mfa.authorize' and role = 'admin') then
    raise exception 'self-check: owner.mfa.authorize must be held by admin only';
  end if;
  if (select count(*) from public.role_capabilities where role = 'admin') <> 28 or (select count(*) from public.role_capabilities where role = 'finance') <> 8
     or (select count(*) from public.role_capabilities where role = 'operations') <> 7 or (select count(*) from public.role_capabilities where role = 'support') <> 8 then
    raise exception 'self-check: role capability counts';
  end if;
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private' and not coalesce((select bool_or(c like 'search_path=%') from unnest(pr.proconfig) c), false)
  ) then raise exception 'self-check: function without pinned search_path in schema private'; end if;
  -- only the approved private functions are executable by authenticated (my_owner_org_ids was revoked above)
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', pr.oid, 'execute')
      and pr.proname not in ('my_org_ids', 'staff_session_ok', 'has_capability', 'my_mfa_owner_org_ids')
  ) then raise exception 'self-check: unexpected EXECUTE grant to authenticated in schema private (my_owner_org_ids must be revoked)'; end if;
  if exists (select 1 from pg_policies where qual like '%my_owner_org_ids%' or with_check like '%my_owner_org_ids%') then
    raise exception 'self-check: a policy still uses private.my_owner_org_ids()';
  end if;
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private' and (has_function_privilege('anon', pr.oid, 'execute') or has_function_privilege('service_role', pr.oid, 'execute') or has_function_privilege('public', pr.oid, 'execute'))
  ) then raise exception 'self-check: a private function is executable by anon, service_role or PUBLIC'; end if;
  -- exactly one function in public is executable by anon: the password recovery throttle
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', pr.oid, 'execute')) <> 1
     or not has_function_privilege('anon', 'public.rpc_throttle_password_recovery(bytea, bytea)', 'execute') then
    raise exception 'self-check: the only anon-executable function must be rpc_throttle_password_recovery';
  end if;
  if has_function_privilege('service_role', 'public.rpc_throttle_password_recovery(bytea, bytea)', 'execute')
     or has_function_privilege('public', 'public.rpc_throttle_password_recovery(bytea, bytea)', 'execute') then
    raise exception 'self-check: the throttle is executable by service_role or PUBLIC';
  end if;
  -- the nine RPCs of this file: SECURITY DEFINER, pinned search_path, no anon (except the throttle), no service_role, no PUBLIC
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public'
         and pr.proname in ('rpc_throttle_password_recovery', 'rpc_my_owner_context', 'rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_set_recovery_codes',
                            'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel', 'rpc_staff_authorize_owner_mfa_window', 'rpc_staff_owner_mfa_overview')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute')
         and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and (pr.proname = 'rpc_throttle_password_recovery' or not has_function_privilege('anon', pr.oid, 'execute'))
         and exists (select 1 from unnest(pr.proconfig) c where c = 'search_path=""')) <> 9 then
    raise exception 'self-check: RPC definer/search_path/grant state is wrong';
  end if;
  -- triggers: windows 3 (insert guard, update guard, truncate), factors 3, codes 2, requests 2
  if (select count(*) from pg_trigger tg where tg.tgrelid in ('private.owner_mfa_factors'::regclass, 'private.owner_mfa_windows'::regclass,
        'private.owner_recovery_codes'::regclass, 'private.owner_recovery_requests'::regclass) and not tg.tgisinternal) <> 10 then
    raise exception 'self-check: expected 10 triggers on the owner MFA and recovery tables';
  end if;
  -- the two owner policies use the MFA-aware function
  if (select count(*) from pg_policies where policyname in ('organization_billing_select_owner', 'organization_invites_select_owner')
        and qual like '%my_mfa_owner_org_ids%') <> 2 then
    raise exception 'self-check: owner policies were not updated';
  end if;
  -- RECOVERY CODES CAN NEVER GRANT PRIVILEGES: none of the functions that decide owner MFA, step-up or a staff session may mention recovery at all
  foreach f in array array['private.owner_mfa_ok()', 'private.my_mfa_owner_org_ids()', 'private.step_up_ok()', 'private.last_totp_at()',
                           'private.staff_session_ok()', 'private.mfa_check_ok()', 'private.has_capability(text)', 'private.staff_gate(text, text, boolean, text, text)'] loop
    if pg_get_functiondef(f::regprocedure) ~* 'recover' then raise exception 'self-check: % must not reference recovery objects', f; end if;
  end loop;
  -- nothing in this file writes to or deletes from auth.*
  -- pg_get_functiondef() RAISES on aggregate functions (42809) and PostgreSQL does not guarantee the order in which the conditions of a WHERE clause are
  -- evaluated, so the candidate rows are first reduced to ordinary functions of OUR schemas in a subquery the planner cannot flatten (OFFSET 0).
  if exists (select 1 from (select pr.oid from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                             where n.nspname in ('public', 'private') and pr.prokind = 'f'
                               and pr.proname like any (array['rpc_owner_%', 'rpc_staff_authorize_owner%', 'rpc_staff_owner%', 'owner_%', 'guard_owner_%', 'rl_user_key', 'rpc_throttle_password_recovery', 'rpc_my_owner_context'])
                             offset 0) cand
              where pg_get_functiondef(cand.oid) ~* '(insert\s+into|update|delete\s+from)\s+auth\.') then
    raise exception 'self-check: a function writes to the auth schema';
  end if;
end;
$$;
