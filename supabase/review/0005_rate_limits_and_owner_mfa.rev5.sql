-- =====================================================================================
-- 0005_rate_limits_and_owner_mfa.rev5.sql
-- *** REVIEW DRAFT rev5. NOT APPLIED ANYWHERE. NOT EXECUTED ANYWHERE. Written 2026-11-10 after the project owner's review of the rev4 security report. ***
-- Separate revision: rev4 (sha256 26709232441f68cd510bd33349fa615d4082e4c108cc986e03cbd8a7736c3368), rev3.1 (8548e27e…3e8d, still the canonical 0005 file) and rev3 are
-- preserved UNCHANGED as historical review artifacts. Rev5 = rev4 + the corrections below (complete diff: history/0005_rate_limits_and_owner_mfa.rev4-to-rev5.diff).
-- CHANGES FROM REV4 (resolution of the rev4 security review findings F1 to F11; details in docs/P2-4-0005-REV5-SECURITY-REVIEW.md):
--   * F1  TRANSACTION HONESTY. Quotas apply to COMMITTED requests: a request row (and the audit row that accompanies it) exists only if its transaction commits, and a
--         PostgreSQL advisory transaction lock is released at COMMIT or ROLLBACK. NOTHING in this file survives a ROLLBACK, and no claim here says otherwise. That a caller
--         cannot choose to roll back and still observe the result is an invariant of the API layer (PostgREST commits when the call returns; see docs/P2-POSTGREST-TX-INVARIANT.md),
--         NOT something SQL can enforce; it is UNVERIFIED until tested in a disposable Supabase project. Application-level throttling is defense in depth (docs/P2-APP-THROTTLE-INTERFACE.md).
--         Every mutating recovery RPC refuses any isolation level other than READ COMMITTED BEFORE any lock or mutation (private.require_read_committed(), the pattern of 0001/0002).
--   * F4  FACTOR REMOVAL SEQUENCE (R1). The owner's approved factor stays untouched until two operators approved, the 24 h cool-off elapsed AND a short-lived recovery window was
--         opened. Only then does an operator remove the owner's factors (Dashboard, by hand) INSIDE the window and ATTEST it (rpc_staff_attest_owner_factor_removal, verified against
--         the database state and the factor count recorded when the window opened); a factor can be approved only after the attestation. Cancelling or expiring a request revokes
--         its open window automatically, with an audit row. After an attested removal the request may issue up to 6 windows (3 before). The owner cancellation lock applies only while
--         the owner still has a live approved factor, so an owner whose factor was removed is never locked out of recovery by it. A failed enrolment after removal is the defined,
--         audited state STRANDED (see rpc_my_owner_context and rpc_staff_list_owner_factor_loss); the break-glass procedure is documented in docs/P2-4-RECOVERY-BREAK-GLASS.md.
--   * F3  EXPIRY AND AUTHORIZATION AT THE TRANSITION. The update guard itself refuses to approve an expired request and rechecks that the initiator AND the approver are still
--         active staff holding owner.mfa.authorize; the window gate rechecks both again, the factor gate rechecks the window's authorizer (private.owner_mfa_operator_ok()).
--   * F5  NOTARIZATION IS SUPPLEMENTARY EVIDENCE, never a method: the method list has three entries; notarized_supplement flags exist for each operator.
--   * F6  RETENTION. Foreign keys from the four owner MFA and recovery tables to auth.users are ON DELETE RESTRICT (were CASCADE): deleting an Auth user can no longer silently erase
--         recovery requests, approval, revocation or quota history; it fails loudly until a separately reviewed retention procedure is run. Audit rows have no FK and are append-only (0003).
--   * History preserved: all earlier changes below (rev3.1 to rev4) are carried over.
-- Changes from rev3.1 to rev4 (decisions D-V1, D-V2, D-V7, D-V9), still in force:
--   * D-V2  NO SILENT REPLACEMENT of an active owner enrolment window; explicit audited revocation (staff and owner RPCs); revocation history (who, when, why).
--   * D-V1  OPERATOR-INITIATED RECOVERY for owners who lost factor and codes: two different operators, independent evidence references, the same 24 hour
--           cool-off (anchored at the SECOND approval), 72 hour approval deadline, complete audit, no direct MFA bypass (the recovery window and the claim are unchanged).
--   * D-V9  quotas 5 per operator per 24 hours and 2 per target owner per 7 days, counted over COMMITTED request rows under locks (rev4 wrongly said "not bypassable by
--           rollback": a rolled-back call leaves no row and consumes nothing; see F1 above); expired requests are unusable; replays cannot create authorizations; a new
--           request cannot reset or shorten an existing cool-off (one open request per owner, immutable timing); at most 3 recovery windows per request (6 after an attested removal).
--   * D-V7  the verification method is recorded per operator (list fixed; a notarized statement is supplementary and can never be the only method, rev5: it is not a method at all).
--   * DEFECT FIXED: in rev3.1 the owner-code request computed cooloff_until BEFORE the insert while created_at defaulted to a LATER clock_timestamp(), so the table's
--     own check (cooloff_until >= created_at + 24 hours) would fail by microseconds and every recovery request would error. Rev4 passes explicit timestamps
--     taken from ONE captured instant. (Found by reading while preparing rev4; the rev3.1 dry execution did not reach that path.)
--   * IMMUTABLE HISTORY: no function deletes owner MFA or recovery rows (asserted by the self-check on the live definitions); all state changes are guarded one-way
--     transitions; every transition, including lazy expiry, writes an audit row in the same transaction.
-- Depends on 0001-0004 (APPLIED on the hosted development project). Scope otherwise as in rev3.1 (rate limits, replay prevention, owner MFA with operator-authorized
-- enrolment, ten single-use owner-only recovery codes). Rules: default deny; no DML grant to any API role; SECURITY DEFINER functions pin search_path = ''.
-- Identifiers (email, IP) are NEVER stored: callers pass a 32-byte keyed hash; user-scoped keys are derived inside the database from the caller's own id.
-- The Supabase CLI wraps each migration file in one implicit transaction; no explicit BEGIN/COMMIT here.
-- =====================================================================================

-- 1. Rate-limit policies (immutable seed; changing a limit is a reviewed migration) -----------------------------------------
create table private.rate_limit_policies (
  bucket       text primary key check (bucket ~ '^[a-z_]{3,40}$'),
  max_attempts integer not null check (max_attempts between 1 and 1000),
  window_secs  integer not null check (window_secs between 10 and 604800),
  block_secs   integer not null check (block_secs between 10 and 604800),
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
  ('password_recovery_ip',20, 3600, 3600, 'Password recovery requests per client address: 20 per hour'),
  ('operator_recovery_initiate', 5, 86400, 86400, 'Operator-initiated recovery: 5 initiations per operator per 24 hours (counted over COMMITTED request rows under locks; a rolled-back call leaves no row; this row is the single source of the numbers)'),
  ('operator_recovery_target', 2, 604800, 604800, 'Operator-initiated recovery: 2 initiations per target owner across all operators per 7 days (counted over COMMITTED request rows under locks)');

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

-- 4. Owner MFA (D-P24-4), rev4: TRUSTED FACTOR APPROVAL, OPERATOR-AUTHORIZED ENROLMENT, EXPLICIT WINDOW REVOCATION, TWO-PERSON RECOVERY ------------------
-- Trust model (the same as staff in 0002): a factor counts only if a row in private.owner_mfa_factors approves it; a row can only be inserted by a trigger that checks,
-- at that instant, that a window for this user is open, that the factor is verified TOTP of this user AND was created INSIDE the window, that no OTHER verified
-- factor exists (first and recovery windows) and that the user is an active owner; the window is locked and consumed in the same step. owner_mfa_ok() denies a
-- session with ANY verified factor that is not approved. FIRST and RECOVERY windows are opened only by an OPERATOR (staff_gate: aal2, approved factor, fresh
-- step-up, capability owner.mfa.authorize). An ADDITIONAL factor needs an approved owner session plus a fresh step-up. Recovery codes and recovery requests
-- NEVER create a session, never satisfy owner_mfa_ok() or step_up_ok(), and staff cannot use them. Nothing here writes to or deletes from auth.*; rev5 (R1): the operator
-- removes the owner's factors by hand (Dashboard) INSIDE an already opened recovery window (after two approvals and the cool-off) and attests it; the old factor stays intact until then.
-- Nothing here writes to auth.* (reads only: id, user_id, factor_type, status, created_at).

-- 4a. New capability for the operator (admin only). Additive rows; no existing row changes.
insert into public.capabilities (code, description) values
  ('owner.mfa.authorize', 'Authorize an owner MFA enrolment window (first enrolment, or recovery after the cool-off) and read an owner''s MFA state');
insert into public.role_capabilities (role, capability_code) values ('admin', 'owner.mfa.authorize');

-- 4b. Recovery requests, enrolment windows, approved factors, recovery codes ---------------------------------------------------------------
-- HISTORY IS PRESERVED BY CONSTRUCTION: no function of this file deletes a row of these four tables; every state change is a guarded one-way transition
-- (update triggers); finished rows are immutable; TRUNCATE is blocked; every transition is audited in the same transaction in the append-only audit table
-- (0003). RETENTION (rev5, F6): the foreign keys to auth.users are ON DELETE RESTRICT. Deleting an Auth user who has any recovery request, window, approved factor or
-- recovery code therefore FAILS (loudly) instead of silently cascading the history away; the audit rows (no FK, append-only, 0003) are unaffected either way. Erasure after
-- the retention period is a separately reviewed, two-person procedure (docs/P2-IDENTITY-VERIFICATION-POLICY-SPEC.md section 7), never an implicit cascade. Rate-limit counters
-- (private.rate_limits) are deliberately ephemeral, keyed by hashes and deleted opportunistically after 2 days: they are not security history; quota history is the request rows.
create table private.owner_recovery_requests (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users (id) on delete restrict,
  origin                     text not null default 'owner_code' check (origin in ('owner_code', 'operator')),
  status                     text not null default 'pending' check (status in ('awaiting_approval', 'pending', 'cancelled', 'completed', 'expired')),
  created_at                 timestamptz not null default clock_timestamp(),
  -- operator-initiated requests (two-person authorization; case references only, never identity documents or personal data)
  initiated_by               uuid,
  initiation_reason          text check (initiation_reason is null or char_length(btrim(initiation_reason)) between 1 and 200),
  verification_method        text check (verification_method is null or verification_method in ('video_id_check', 'in_person', 'verified_business_contact')),
  verification_ref           text check (verification_ref is null or verification_ref ~ '^[A-Za-z0-9._:/#-]{1,80}$'),
  -- rev5 (F5): a notarized statement is SUPPLEMENTARY evidence only. It is a flag next to a real method, never a method itself, so it cannot be the only evidence of either operator.
  notarized_supplement       boolean not null default false,
  approved_by                uuid,
  approved_at                timestamptz,
  approval_reason            text check (approval_reason is null or char_length(btrim(approval_reason)) between 1 and 200),
  second_verification_method text check (second_verification_method is null or second_verification_method in ('video_id_check', 'in_person', 'verified_business_contact')),
  second_verification_ref    text check (second_verification_ref is null or second_verification_ref ~ '^[A-Za-z0-9._:/#-]{1,80}$'),
  second_notarized_supplement boolean,   -- part of the approval group: NULL before the approval, true or false after it
  -- rev5 (F4, R1): the operator's attestation that the owner's factors were removed INSIDE a recovery window (checked against the database state when it is recorded)
  factors_removed_at         timestamptz,
  factors_removed_by         uuid,
  factors_removed_count      smallint check (factors_removed_count is null or factors_removed_count between 0 and 10),
  cooloff_until              timestamptz,
  expires_at                 timestamptz not null,
  cancelled_at               timestamptz,
  cancelled_by               uuid,
  cancel_reason              text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 1 and 200),   -- free text lives HERE (operator cancellations), never in an audit detail
  completed_at               timestamptz,
  window_id                  uuid,
  windows_issued             smallint not null default 0,
  -- at most 3 windows per request; 6 once the operator attested the factor removal (a failed enrolment after removal must stay recoverable inside the same request)
  constraint owner_recovery_requests_windows_bounded check (windows_issued between 0 and 6 and (windows_issued <= 3 or factors_removed_at is not null)),
  -- the removal attestation is all-or-nothing and only exists on a request that was usable (pending, or ended after it was)
  constraint owner_recovery_requests_removal_group check (num_nonnulls(factors_removed_at, factors_removed_by, factors_removed_count) in (0, 3)),
  constraint owner_recovery_requests_removal_state check (factors_removed_at is null or (status in ('pending', 'completed', 'cancelled', 'expired') and cooloff_until is not null and factors_removed_at >= cooloff_until)),
  -- who may have which fields
  constraint owner_recovery_requests_origin_fields check (
       (origin = 'owner_code' and status <> 'awaiting_approval' and cooloff_until is not null
          and initiated_by is null and initiation_reason is null and verification_method is null and verification_ref is null and notarized_supplement = false
          and num_nonnulls(approved_by, approved_at, approval_reason, second_verification_method, second_verification_ref, second_notarized_supplement) = 0)
    or (origin = 'operator' and initiated_by is not null and initiation_reason is not null and verification_method is not null and verification_ref is not null)),
  -- TWO PEOPLE: the approver is a different account from the initiator; the approval group is all-or-nothing and independent evidence is required
  constraint owner_recovery_requests_two_person check (approved_by is null or initiated_by is null or approved_by <> initiated_by),
  constraint owner_recovery_requests_approval_group check (num_nonnulls(approved_by, approved_at, approval_reason, second_verification_method, second_verification_ref, second_notarized_supplement) in (0, 6)),
  constraint owner_recovery_requests_independent_evidence check (second_verification_ref is null or second_verification_ref <> verification_ref),
  -- lifecycle
  constraint owner_recovery_requests_awaiting_shape check (status <> 'awaiting_approval'
       or (origin = 'operator' and cooloff_until is null and num_nonnulls(approved_by, approved_at) = 0 and expires_at <= created_at + interval '72 hours')),
  constraint owner_recovery_requests_pending_shape check (status not in ('pending', 'completed')
       or (cooloff_until is not null and (origin = 'owner_code' or num_nonnulls(approved_by, approved_at, approval_reason, second_verification_method, second_verification_ref, second_notarized_supplement) = 6))),
  -- THE 24 HOUR COOL-OFF is anchored at the SECOND approval (operator origin) or at creation (owner-code origin); a constraint, not only code
  constraint owner_recovery_requests_cooloff check (cooloff_until is null or cooloff_until >= coalesce(approved_at, created_at) + interval '24 hours'),
  constraint owner_recovery_requests_expiry check (expires_at > coalesce(cooloff_until, created_at) and expires_at <= coalesce(cooloff_until, created_at) + interval '7 days'),
  constraint owner_recovery_requests_cancel_shape check ((status = 'cancelled') = (cancelled_at is not null and cancelled_by is not null)),
  constraint owner_recovery_requests_complete_shape check ((status = 'completed') = (completed_at is not null and window_id is not null))
);
-- at most ONE open request per owner (awaiting or pending): a new request can neither reset nor shorten an existing cool-off
create unique index owner_recovery_requests_one_open_idx on private.owner_recovery_requests (user_id) where status in ('awaiting_approval', 'pending');
create index owner_recovery_requests_initiator_idx on private.owner_recovery_requests (initiated_by, created_at) where origin = 'operator';
create index owner_recovery_requests_target_idx on private.owner_recovery_requests (user_id, created_at) where origin = 'operator';

create table private.owner_mfa_windows (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete restrict,
  kind          text not null check (kind in ('first', 'additional', 'recovery')),
  authorized_by uuid,   -- the operator (first, recovery) or the owner themself (additional); no FK on purpose: an audit reference that must survive account deletion
  reason        text not null check (char_length(btrim(reason)) between 1 and 200),
  request_id    uuid references private.owner_recovery_requests (id),   -- recovery windows only: the approved request that justifies them
  opened_at     timestamptz not null default clock_timestamp(),
  expires_at    timestamptz not null default clock_timestamp() + interval '10 minutes',
  consumed_at   timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid,
  revoke_reason text,   -- free text lives in this row only (a manual revocation); automatic revocations use the fixed codes 'request_cancelled' and 'request_expired'; never copied to an audit detail
  -- rev5 (R1): recovery windows only. The number of verified factors the owner had when the window opened; the operator's removal attestation must equal it.
  factors_at_open smallint check (factors_at_open is null or factors_at_open between 0 and 10),
  constraint owner_mfa_windows_factors_at_open check ((kind = 'recovery') = (factors_at_open is not null)),
  constraint owner_mfa_windows_bounded check (expires_at > opened_at and expires_at <= opened_at + interval '60 minutes'),
  constraint owner_mfa_windows_single_outcome check (not (consumed_at is not null and revoked_at is not null)),
  constraint owner_mfa_windows_authorizer check (
       (kind = 'additional' and authorized_by = user_id)
    or (kind in ('first', 'recovery') and authorized_by is not null and authorized_by <> user_id)),
  constraint owner_mfa_windows_request_link check ((kind = 'recovery') = (request_id is not null)),
  -- REVOCATION HISTORY: who, when and why are recorded together or not at all
  constraint owner_mfa_windows_revocation_group check (num_nonnulls(revoked_at, revoked_by, revoke_reason) in (0, 3)),
  constraint owner_mfa_windows_revoke_reason_len check (revoke_reason is null or char_length(btrim(revoke_reason)) between 1 and 200),
  constraint owner_mfa_windows_id_user_key unique (id, user_id)
);
-- one open (not consumed, not revoked) window per user; a lapsed window still counts until it is closed by a RECORDED revocation
create unique index owner_mfa_windows_one_open_idx on private.owner_mfa_windows (user_id) where consumed_at is null and revoked_at is null;

-- Approved factors. No FK to auth.mfa_factors on purpose (the insert trigger checks it). Rows are never deleted by any function, so an existing
-- row is also the permanent record that this user once had an approved factor (approval history).
create table private.owner_mfa_factors (
  factor_id   uuid primary key,
  user_id     uuid not null references auth.users (id) on delete restrict,
  window_id   uuid not null,
  approved_at timestamptz not null default clock_timestamp(),
  constraint owner_mfa_factors_window_user_fk foreign key (window_id, user_id)
    references private.owner_mfa_windows (id, user_id) on delete restrict,
  constraint owner_mfa_factors_one_per_window unique (window_id)
);
create index owner_mfa_factors_user_idx on private.owner_mfa_factors (user_id);

-- 4c. Recovery codes (hashes only) and recovery requests
create table private.owner_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete restrict,
  set_id     uuid not null,
  code_hash  bytea not null check (octet_length(code_hash) = 32),   -- SHA-256 of the normalized code bound to the user id, computed by the application; the code itself is never stored
  created_at timestamptz not null default clock_timestamp(),
  used_at    timestamptz,
  voided_at  timestamptz,
  constraint owner_recovery_codes_user_hash_key unique (user_id, code_hash),
  constraint owner_recovery_codes_single_end check (not (used_at is not null and voided_at is not null))
);
create index owner_recovery_codes_open_idx on private.owner_recovery_codes (user_id) where used_at is null and voided_at is null;

alter table private.owner_mfa_windows       enable row level security;
alter table private.owner_mfa_factors       enable row level security;
alter table private.owner_recovery_codes    enable row level security;
alter table private.owner_recovery_requests enable row level security;

-- 4d. Helpers: the factor state of one user, and the per-user rate-limit key derived inside the database ------------------------------------------
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

-- rev5 (F1): every mutating recovery RPC calls this FIRST, before any lock, counter or write (the pattern of 0001 and 0002, SQLSTATE 25000). The per-owner and per-operator
-- advisory locks and the quota counts are only sound when every statement takes a NEW snapshot after the lock is granted, which is READ COMMITTED behavior; under REPEATABLE READ or
-- SERIALIZABLE the snapshot predates the lock wait and two concurrent initiations could both count the same rows. Refusing the other levels outright is fail closed. The function is
-- plain, takes no argument and touches no table. (It does not and cannot prevent a caller from ending the transaction with ROLLBACK: see the header, F1.)
create function private.require_read_committed() returns void
language plpgsql stable set search_path = ''
as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'owner MFA and recovery operations require READ COMMITTED isolation' using errcode = '25000';
  end if;
end;
$$;

-- rev5 (F3): TRUE only for an ACTIVE staff member whose role holds owner.mfa.authorize (the same predicate the insert triggers of rev4 spelled out inline). Used by the transition
-- guards to RECHECK initiator, approver and authorizer at the moment of each transition; fails closed (NULL or any error is FALSE).
create function private.owner_mfa_operator_ok(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_user is null then return false; end if;
  return exists (select 1 from public.staff_members s
                   join public.staff_roles r on r.user_id = s.user_id
                   join public.role_capabilities rc on rc.role = r.role
                  where s.user_id = p_user and s.status = 'active' and rc.capability_code = 'owner.mfa.authorize');
exception when others then
  return false;
end;
$$;

-- rev5: TRUE if the owner ever had an approved factor (approval history). Recovery needs history; 'none' state and 'first enrolment' are a different path.
create function private.owner_has_history(p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.owner_mfa_factors a where a.user_id = p_user);
$$;

-- 4e. Guards carried over from rev3.1 (factor approval gate, factor immutability, recovery code immutability), then the guards that changed in rev4 and rev5 ----
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

  -- rev4: a recovery window is usable only while ITS request is still pending and unexpired (an expired or cancelled request cannot approve anything)
  -- rev5 (R1): and only after an operator ATTESTED the factor removal for that request (recorded and checked against the database state by the attestation RPC); the window's own
  -- authorizer must still be an active operator at this moment (an operator off-boarded since opening the window invalidates it).
  if v_kind = 'recovery' then
    if not exists (
         select 1 from private.owner_recovery_requests rq join private.owner_mfa_windows w on w.request_id = rq.id
          where w.id = new.window_id and rq.status = 'pending' and rq.expires_at > clock_timestamp()) then
      raise exception 'the recovery request of this window is not usable' using errcode = '23514';
    end if;
    if not exists (
         select 1 from private.owner_recovery_requests rq join private.owner_mfa_windows w on w.request_id = rq.id
          where w.id = new.window_id and rq.factors_removed_at is not null) then
      raise exception 'the factor removal of this recovery has not been attested' using errcode = '23514';
    end if;
    if not private.owner_mfa_operator_ok((select w.authorized_by from private.owner_mfa_windows w where w.id = new.window_id)) then
      raise exception 'the authorizer of this recovery window is no longer an active operator' using errcode = '23514';
    end if;
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

-- 4e. Guards (new and changed in rev4; the factor and code guards are carried over from rev3.1) --------------------------------------------------
-- Closes expired open requests of one owner by a RECORDED transition and an audit row each, so that no state change is ever silent. Called by the RPCs
-- under the per-owner recovery lock. An expired request is unusable: approval, window authorization and claiming all require status and expiry.
create function private.close_expired_recovery_requests(p_user uuid, p_actor uuid, p_actor_kind text) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r   record;
  v_n integer := 0;
begin
  for r in with upd as (
             update private.owner_recovery_requests set status = 'expired'
              where user_id = p_user and status in ('awaiting_approval', 'pending') and expires_at <= clock_timestamp()
              returning id, origin, factors_removed_at)
           select upd.id, upd.origin, upd.factors_removed_at from upd
  loop
    v_n := v_n + 1;
    -- rev5: an expired request can never keep a usable window alive (automatic, audited revocation; the lock order stays (2) then (3))
    perform private.revoke_request_windows(r.id, p_user, p_actor, p_actor_kind, 'request_expired');
    -- stranded = the owner's factors were removed (attested) and the request ended without an approved new factor
    perform private.write_audit(p_actor, p_actor_kind, 'owner.mfa_recovery.expire', 'success', null, 'user', p_user::text,
                                jsonb_build_object('request_id', r.id, 'origin', r.origin, 'stranded', r.factors_removed_at is not null));
  end loop;
  return v_n;
end;
$$;

-- rev5 (F4): revokes the OPEN (not consumed, not revoked) window of one request by a RECORDED revocation with a fixed code and writes the audit row. Called when a request is cancelled
-- or expires, under lock (2) taken by the caller; this function takes lock (3) itself (order (2) then (3), re-taking a held advisory lock is harmless). Returns the number revoked.
create function private.revoke_request_windows(p_request uuid, p_user uuid, p_actor uuid, p_actor_kind text, p_code text) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  w   record;
  v_n integer := 0;
begin
  if p_code is null or p_code not in ('request_cancelled', 'request_expired') then
    raise exception 'invalid revocation code' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_user::text, 0));   -- (3)
  for w in select x.id, x.kind, x.authorized_by, x.opened_at from private.owner_mfa_windows x
            where x.request_id = p_request and x.consumed_at is null and x.revoked_at is null for update
  loop
    update private.owner_mfa_windows set revoked_at = clock_timestamp(), revoked_by = p_actor, revoke_reason = p_code where id = w.id;
    v_n := v_n + 1;
    perform private.write_audit(p_actor, p_actor_kind, 'owner.mfa_window.auto_revoke', 'success', null, 'user', p_user::text,
                                jsonb_build_object('window_id', w.id, 'kind', w.kind, 'authorized_by', w.authorized_by, 'opened_at', w.opened_at,
                                                   'request_id', p_request, 'code', p_code));
  end loop;
  return v_n;
end;
$$;

-- A window may only change from open to consumed OR to revoked, once; the revocation group (who, when, why) is set together; nothing else changes.
create function private.guard_owner_mfa_window_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.kind <> old.kind or new.authorized_by is distinct from old.authorized_by
     or new.reason <> old.reason or new.opened_at <> old.opened_at or new.expires_at <> old.expires_at or new.request_id is distinct from old.request_id
     or new.factors_at_open is distinct from old.factors_at_open then
    raise exception 'owner enrolment window identity, authorizer, reason, request, factor snapshot and timing are immutable' using errcode = '23514';
  end if;
  if (old.consumed_at is not null or old.revoked_at is not null)
     and (new.consumed_at is distinct from old.consumed_at or new.revoked_at is distinct from old.revoked_at
          or new.revoked_by is distinct from old.revoked_by or new.revoke_reason is distinct from old.revoke_reason) then
    raise exception 'owner enrolment window outcome is final' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Window creation gate (defense in depth: the RPCs check the same things, a direct insert by any other path meets this trigger).
--   first      : state 'none'; authorized by an ACTIVE staff member holding owner.mfa.authorize
--   additional : state 'approved'; authorized by the owner themself
--   recovery   : rev5 (R1): approval history exists and the state is NOT 'none' and NOT 'unknown' (the owner's approved factor may still be live: it is removed INSIDE the window
--                by an operator and attested afterwards); AND a PENDING request of this owner whose cool-off has elapsed and has not expired; for an operator-origin request
--                the approval must be recorded, made by a different account than the initiator, and BOTH accounts are rechecked as active operators NOW; at most 3 windows per
--                request (6 after an attested removal); authorized by an operator; the window records how many verified factors the owner has at this instant
-- The target must be an ACTIVE organization owner in every case.
create function private.guard_owner_mfa_window_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_state text;
  v_req   record;
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
    if v_state in ('none', 'unknown') or not private.owner_has_history(new.user_id) then
      raise exception 'a recovery window requires an owner with approval history and a readable factor state' using errcode = '23514';
    end if;
    select r.user_id, r.status, r.origin, r.cooloff_until, r.expires_at, r.initiated_by, r.approved_by, r.windows_issued, r.factors_removed_at
      into v_req from private.owner_recovery_requests r where r.id = new.request_id;
    if not found or v_req.user_id <> new.user_id or v_req.status <> 'pending' or v_req.cooloff_until is null
       or v_req.cooloff_until > clock_timestamp() or v_req.expires_at <= clock_timestamp() then
      raise exception 'a recovery window requires a pending request whose cool-off has elapsed and that has not expired' using errcode = '23514';
    end if;
    if v_req.origin = 'operator' and (v_req.approved_by is null or v_req.approved_by = v_req.initiated_by) then
      raise exception 'an operator-initiated request needs the approval of a different account' using errcode = '23514';
    end if;
    -- rev5 (F3): both accounts of the two-person authorization must STILL be active operators holding the capability when the window opens
    if v_req.origin = 'operator' and not (private.owner_mfa_operator_ok(v_req.initiated_by) and private.owner_mfa_operator_ok(v_req.approved_by)) then
      raise exception 'the initiator and the approver must both still be active operators' using errcode = '23514';
    end if;
    if v_req.windows_issued not between 1 and (case when v_req.factors_removed_at is null then 3 else 6 end) then
      raise exception 'the number of windows issued for this request is not valid' using errcode = '23514';
    end if;
    if new.factors_at_open is null or new.factors_at_open <> (select count(*) from auth.mfa_factors f where f.user_id = new.user_id and f.status::text = 'verified') then
      raise exception 'the factor snapshot of a recovery window must equal the current number of verified factors' using errcode = '23514';
    end if;
  end if;
  if new.kind in ('first', 'recovery') and not private.owner_mfa_operator_ok(new.authorized_by) then
    raise exception 'the authorizer must be an active staff member holding owner.mfa.authorize' using errcode = '23514';
  end if;
  if new.revoked_at is not null or new.consumed_at is not null then
    raise exception 'enrolment window must be created open' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Request creation gate. owner_code: created pending by the owner path. operator: created awaiting_approval by an ACTIVE operator holding the capability,
-- for an owner who HAS an approval history (state none means first enrolment applies instead). Staff are never recovery targets.
create function private.guard_owner_recovery_request_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.organization_members m where m.user_id = new.user_id and m.status = 'active' and m.role = 'owner') then
    raise exception 'target is not an active organization owner' using errcode = '23514';
  end if;
  if exists (select 1 from public.staff_members s where s.user_id = new.user_id) then
    raise exception 'a staff member cannot be a recovery target' using errcode = '23514';
  end if;
  if new.origin = 'owner_code' then
    if new.status <> 'pending' then
      raise exception 'an owner-code request is created pending' using errcode = '23514';
    end if;
  else
    if new.status <> 'awaiting_approval' then
      raise exception 'an operator-initiated request is created awaiting approval' using errcode = '23514';
    end if;
    if not private.owner_mfa_operator_ok(new.initiated_by) then
      raise exception 'the initiator must be an active staff member holding owner.mfa.authorize' using errcode = '23514';
    end if;
    if private.owner_factor_state(new.user_id) = 'unknown' or not private.owner_has_history(new.user_id) then
      raise exception 'first enrolment applies to an owner without approval history' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Request lifecycle: ONLY these transitions exist, each exactly once, and nothing else about a request ever changes.
--   awaiting_approval -> pending   (the second approval: approval group, cool-off and expiry are set together)
--   awaiting_approval | pending -> cancelled | expired      pending -> completed (the claim)      pending: windows_issued + 1
create function private.guard_owner_recovery_request_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_appr_same boolean;
  v_time_same boolean;
  v_end_same  boolean;
  v_win_same  boolean;
  v_rem_same  boolean;
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.origin <> old.origin or new.created_at <> old.created_at
     or new.initiated_by is distinct from old.initiated_by or new.initiation_reason is distinct from old.initiation_reason
     or new.verification_method is distinct from old.verification_method or new.verification_ref is distinct from old.verification_ref
     or new.notarized_supplement <> old.notarized_supplement then
    raise exception 'recovery request identity and initiation record are immutable' using errcode = '23514';
  end if;
  if old.status not in ('awaiting_approval', 'pending') then
    raise exception 'a finished recovery request cannot change again' using errcode = '23514';
  end if;
  v_appr_same := new.approved_by is not distinct from old.approved_by and new.approved_at is not distinct from old.approved_at
             and new.approval_reason is not distinct from old.approval_reason
             and new.second_verification_method is not distinct from old.second_verification_method
             and new.second_verification_ref is not distinct from old.second_verification_ref
             and new.second_notarized_supplement is not distinct from old.second_notarized_supplement;
  v_time_same := new.cooloff_until is not distinct from old.cooloff_until and new.expires_at = old.expires_at;
  v_end_same  := new.cancelled_at is not distinct from old.cancelled_at and new.cancelled_by is not distinct from old.cancelled_by and new.cancel_reason is not distinct from old.cancel_reason
             and new.completed_at is not distinct from old.completed_at and new.window_id is not distinct from old.window_id;
  v_win_same  := new.windows_issued = old.windows_issued;
  v_rem_same  := new.factors_removed_at is not distinct from old.factors_removed_at and new.factors_removed_by is not distinct from old.factors_removed_by
             and new.factors_removed_count is not distinct from old.factors_removed_count;
  if new.status = old.status then
    if old.status = 'pending' and v_appr_same and v_time_same and v_end_same then
      -- one more recovery window (the cap itself is the table constraint owner_recovery_requests_windows_bounded)
      if new.windows_issued = old.windows_issued + 1 and v_rem_same then
        return new;
      end if;
      -- the factor-removal ATTESTATION: once, by an active operator, after the cool-off, on a request that has not expired; nothing else changes
      if v_win_same and old.factors_removed_at is null and new.factors_removed_at is not null then
        if old.expires_at <= clock_timestamp() or old.cooloff_until is null or new.factors_removed_at < old.cooloff_until
           or not private.owner_mfa_operator_ok(new.factors_removed_by) then
          raise exception 'a factor removal can be attested only by an active operator, after the cool-off, on a request that has not expired' using errcode = '23514';
        end if;
        return new;
      end if;
    end if;
    raise exception 'no change is allowed on an unchanged recovery request status' using errcode = '23514';
  end if;
  if old.status = 'awaiting_approval' and new.status = 'pending' then
    if v_appr_same or v_time_same or not v_end_same or not v_win_same or not v_rem_same then
      raise exception 'the approval sets the approval group, the cool-off and the expiry together and nothing else' using errcode = '23514';
    end if;
    -- rev5 (F3): the TRANSITION itself refuses an expired request (not only the RPC), a self-approval, and an initiator or approver who is no longer an active operator
    if old.expires_at <= clock_timestamp() then
      raise exception 'an expired recovery request cannot be approved' using errcode = '23514';
    end if;
    if new.approved_by is null or old.initiated_by is null or new.approved_by = old.initiated_by then
      raise exception 'the approver must be a different account than the initiator' using errcode = '23514';
    end if;
    if not (private.owner_mfa_operator_ok(new.approved_by) and private.owner_mfa_operator_ok(old.initiated_by)) then
      raise exception 'the initiator and the approver must both be active operators holding owner.mfa.authorize' using errcode = '23514';
    end if;
  elsif new.status = 'cancelled' then
    if not (v_appr_same and v_time_same and v_win_same and v_rem_same) then raise exception 'a cancellation changes only the cancellation record' using errcode = '23514'; end if;
  elsif new.status = 'expired' then
    if not (v_appr_same and v_time_same and v_end_same and v_win_same and v_rem_same) then raise exception 'an expiry changes only the status' using errcode = '23514'; end if;
  elsif old.status = 'pending' and new.status = 'completed' then
    if not (v_appr_same and v_time_same and v_win_same and v_rem_same and new.cancelled_at is not distinct from old.cancelled_at) then raise exception 'a completion changes only the completion record' using errcode = '23514'; end if;
    -- rev5: completion needs an unexpired request and an attested factor removal (the factor gate checks the same; this is the second, independent check)
    if old.expires_at <= clock_timestamp() or old.factors_removed_at is null then
      raise exception 'a recovery request completes only unexpired and after an attested factor removal' using errcode = '23514';
    end if;
  else
    raise exception 'illegal recovery request transition' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger owner_recovery_requests_guard_insert before insert on private.owner_recovery_requests
  for each row execute function private.guard_owner_recovery_request_insert();
create trigger owner_recovery_requests_guard_update before update on private.owner_recovery_requests
  for each row execute function private.guard_owner_recovery_request_update();
create trigger owner_recovery_requests_no_truncate before truncate on private.owner_recovery_requests
  for each statement execute function private.block_truncate();
create trigger owner_mfa_windows_guard_insert before insert on private.owner_mfa_windows
  for each row execute function private.guard_owner_mfa_window_insert();
create trigger owner_mfa_windows_guard_update before update on private.owner_mfa_windows
  for each row execute function private.guard_owner_mfa_window_update();
create trigger owner_mfa_windows_no_truncate before truncate on private.owner_mfa_windows
  for each statement execute function private.block_truncate();
create trigger owner_mfa_factors_guard_insert before insert on private.owner_mfa_factors
  for each row execute function private.guard_owner_mfa_factor_insert();
create trigger owner_mfa_factors_guard_update before update on private.owner_mfa_factors
  for each row execute function private.guard_owner_mfa_factor_update();
create trigger owner_mfa_factors_no_truncate before truncate on private.owner_mfa_factors
  for each statement execute function private.block_truncate();
create trigger owner_recovery_codes_guard_update before update on private.owner_recovery_codes
  for each row execute function private.guard_owner_recovery_code_update();
create trigger owner_recovery_codes_no_truncate before truncate on private.owner_recovery_codes
  for each statement execute function private.block_truncate();

-- 4f. Owner MFA predicate and the policies that use it (carried over from rev3.1) ------------------------------------------------------------------
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

-- 5a. LOCK HIERARCHY (every function that takes more than one lock takes them in this order; no function takes them in another order, so no cycle is possible):
--   (1) per-operator advisory lock      p2:operator_recovery:<operator id>   (initiate only)
--   (2) per-owner recovery advisory lock p2:owner_recovery:<owner id>        (every recovery operation, authorize, claim, set codes)
--   (3) per-owner window advisory lock   p2:owner_window:<owner id>          (every window operation)
--   (4) row locks (windows, then requests, then codes) taken by the statements themselves
-- Unrelated to the staff hierarchy of 0002 (m1:last_admin, organization row, per-user): none of these functions touches staff or membership rows.
-- TRANSACTION RULE (D-V9, corrected in rev5; F1): quotas apply to COMMITTED requests. A request row, an audit row, a rate-limit counter and an advisory lock all belong to the
-- transaction that wrote or took them: if that transaction ends in ROLLBACK, the row is invisible to everyone and the lock is released, so a rolled-back call consumes NO quota
-- and leaves NO audit trace. Locks and persistent tables do not change that, and nothing in this file can (no dblink, no autonomous transaction). Under READ COMMITTED (enforced by
-- private.require_read_committed(), first statement of every mutating RPC) the locks above make concurrent CALLS count each other's committed rows, so they cannot both pass at the
-- limit. That a caller cannot roll back AFTER observing a result is an API-layer invariant (PostgREST commits when the call returns; docs/P2-POSTGREST-TX-INVARIANT.md), UNVERIFIED
-- until tested in a disposable project; application-level throttling is defense in depth (docs/P2-APP-THROTTLE-INTERFACE.md). Argument validation raises BEFORE any lock or counter is
-- touched; after the first counter or lock no statement raises (every refusal is a returned, audited code), so a refusal commits its own audit row together with the call.

-- 5b. Owner enrolment windows -------------------------------------------------------------------------------------------------------------
-- OPERATOR RPC. Opens the FIRST-enrolment window (state none) or the RECOVERY window (a pending request whose cool-off elapsed) for ONE owner. rev5 (R1): the owner's
-- approved factor is still intact at this point; it is removed by hand (Dashboard) only INSIDE the window and then attested with rpc_staff_attest_owner_factor_removal, and the
-- window records how many verified factors existed when it opened. Independently authenticated (staff_gate: verified staff session at aal2 with an approved factor, fresh
-- step-up, structure check), dedicated capability, audited in the same transaction, single use (consumed by the approval trigger), at most 60 minutes.
-- NO SILENT REPLACEMENT (D-V2): an ACTIVE window is never replaced; the call is refused with window_already_open until the window is explicitly revoked
-- (rpc_staff_revoke_owner_mfa_window). A LAPSED window is closed by a recorded, audited revocation before the new one is inserted.
create function public.rpc_staff_authorize_owner_mfa_window(p_owner_user_id uuid, p_reason text, p_minutes integer default 30) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_state  text;
  v_kind   text;
  v_org    uuid;
  v_id     uuid;
  v_end    timestamptz;
  v_w      record;
  v_req    record;
  v_reqid  uuid;
  v_code   text;
  v_cnt    integer;
begin
  perform private.require_read_committed();   -- rev5 (F1): before any lock, gate audit or write
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

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));     -- (3)
  perform private.close_expired_recovery_requests(p_owner_user_id, v_actor, 'staff');

  select w.id, w.kind, w.authorized_by, w.opened_at, w.expires_at into v_w
    from private.owner_mfa_windows w where w.user_id = p_owner_user_id and w.consumed_at is null and w.revoked_at is null for update;
  if found then
    if v_w.expires_at > clock_timestamp() then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text,
                                  jsonb_build_object('reason', 'window_already_open', 'window_id', v_w.id, 'kind', v_w.kind, 'authorized_by', v_w.authorized_by));
      return jsonb_build_object('ok', false, 'code', 'window_already_open');
    end if;
    update private.owner_mfa_windows set revoked_at = clock_timestamp(), revoked_by = v_actor, revoke_reason = 'lapsed' where id = v_w.id;
    perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.lapse', 'success', v_org, 'user', p_owner_user_id::text,
                                jsonb_build_object('window_id', v_w.id, 'kind', v_w.kind, 'authorized_by', v_w.authorized_by, 'opened_at', v_w.opened_at));
  end if;

  v_state := private.owner_factor_state(p_owner_user_id);
  if v_state = 'none' then
    v_kind := 'first';
  elsif v_state = 'unknown' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'unknown_state'));
    return jsonb_build_object('ok', false, 'code', 'unknown_state');
  else
    select r.id, r.cooloff_until, r.windows_issued, r.factors_removed_at into v_req
      from private.owner_recovery_requests r where r.user_id = p_owner_user_id and r.status = 'pending' for update;
    if not found then
      if exists (select 1 from private.owner_recovery_requests r where r.user_id = p_owner_user_id and r.status = 'awaiting_approval') then
        v_code := 'recovery_awaiting_approval';
      else
        v_code := case v_state when 'recovery_required' then 'recovery_not_ready' when 'approved' then 'already_enrolled' else 'unapproved_factor_present' end;
      end if;
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', v_code));
      return jsonb_build_object('ok', false, 'code', v_code);
    end if;
    if clock_timestamp() < v_req.cooloff_until then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text,
                                  jsonb_build_object('reason', 'cooling_off', 'request_id', v_req.id));
      return jsonb_build_object('ok', false, 'code', 'recovery_cooling_off', 'cooloff_until', v_req.cooloff_until);
    end if;
    -- rev5 (R1): NO factor-removal precondition any more. The old approved factor stays intact until this window exists; the operator removes it INSIDE the window and attests it.
    if v_req.windows_issued >= case when v_req.factors_removed_at is null then 3 else 6 end then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text,
                                  jsonb_build_object('reason', 'recovery_window_limit', 'request_id', v_req.id));
      return jsonb_build_object('ok', false, 'code', 'recovery_window_limit');
    end if;
    v_kind := 'recovery';
    v_reqid := v_req.id;
  end if;

  begin
    if v_reqid is not null then
      update private.owner_recovery_requests set windows_issued = windows_issued + 1 where id = v_reqid;
      select count(*)::integer into v_cnt from auth.mfa_factors f where f.user_id = p_owner_user_id and f.status::text = 'verified';
    end if;
    insert into private.owner_mfa_windows (user_id, kind, authorized_by, reason, request_id, expires_at, factors_at_open)
    values (p_owner_user_id, v_kind, v_actor, v_reason, v_reqid, clock_timestamp() + make_interval(mins => p_minutes), case when v_reqid is not null then v_cnt end)
    returning id, expires_at into v_id, v_end;
  exception
    when unique_violation then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'window_already_open'));
      return jsonb_build_object('ok', false, 'code', 'window_already_open');
    when sqlstate '23514' then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'window_rejected'));
      return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'success', v_org, 'user', p_owner_user_id::text,
                              jsonb_build_object('kind', v_kind, 'window_id', v_id, 'minutes', p_minutes, 'request_id', v_reqid, 'factors_at_open', v_cnt));
  return jsonb_build_object('ok', true, 'code', 'authorized', 'kind', v_kind, 'window_id', v_id, 'expires_at', v_end,
                            'factors_at_open', v_cnt);
end;
$$;

-- OPERATOR RPC. Explicit, audited revocation of the owner's active (or lapsed) window. Anyone holding the capability may revoke (a second operator can stop
-- a window opened by the first); the audit row names the window, its kind, its ORIGINAL authorizer and the time it was opened, so that authorization and
-- revocation are both reconstructible. A consumed window cannot be revoked. The window row is kept.
create function public.rpc_staff_revoke_owner_mfa_window(p_owner_user_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_w      record;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_mfa_window.revoke', true, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null or char_length(v_reason) not between 1 and 200 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));     -- (3)
  select w.id, w.kind, w.authorized_by, w.opened_at, w.expires_at into v_w
    from private.owner_mfa_windows w where w.user_id = p_owner_user_id and w.consumed_at is null and w.revoked_at is null for update;
  if not found then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.revoke', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'no_open_window'));
    return jsonb_build_object('ok', false, 'code', 'no_open_window');
  end if;
  update private.owner_mfa_windows set revoked_at = clock_timestamp(), revoked_by = v_actor, revoke_reason = v_reason where id = v_w.id;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.revoke', 'success', null, 'user', p_owner_user_id::text,
                              jsonb_build_object('window_id', v_w.id, 'kind', v_w.kind, 'authorized_by', v_w.authorized_by, 'opened_at', v_w.opened_at, 'lapsed', v_w.expires_at <= clock_timestamp()));
  return jsonb_build_object('ok', true, 'code', 'revoked');
end;
$$;

-- OWNER RPC. An ADDITIONAL factor: needs an approved, clean owner session plus a fresh step-up. There is no self-service first enrolment and no self-service
-- recovery. An active window is never replaced (window_already_open); a lapsed own window is closed by a recorded revocation.
create function public.rpc_owner_open_factor_window() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_state text;
  v_id    uuid;
  v_exp   timestamptz;
  v_w     record;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = v_actor and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    return jsonb_build_object('ok', false, 'code', 'not_an_owner');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || v_actor::text, 0));             -- (3)
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
  select w.id, w.kind, w.authorized_by, w.opened_at, w.expires_at into v_w
    from private.owner_mfa_windows w where w.user_id = v_actor and w.consumed_at is null and w.revoked_at is null for update;
  if found then
    if v_w.expires_at > clock_timestamp() then
      perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.open', 'denied', v_org, 'user', v_actor::text,
                                  jsonb_build_object('reason', 'window_already_open', 'window_id', v_w.id, 'kind', v_w.kind));
      return jsonb_build_object('ok', false, 'code', 'window_already_open');
    end if;
    update private.owner_mfa_windows set revoked_at = clock_timestamp(), revoked_by = v_actor, revoke_reason = 'lapsed' where id = v_w.id;
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.lapse', 'success', v_org, 'user', v_actor::text,
                                jsonb_build_object('window_id', v_w.id, 'kind', v_w.kind, 'authorized_by', v_w.authorized_by, 'opened_at', v_w.opened_at));
  end if;
  begin
    insert into private.owner_mfa_windows (user_id, kind, authorized_by, reason) values (v_actor, 'additional', v_actor, 'owner adds an additional factor')
    returning id, expires_at into v_id, v_exp;
  exception
    when unique_violation then
      perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.open', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'window_already_open'));
      return jsonb_build_object('ok', false, 'code', 'window_already_open');
    when sqlstate '23514' then
      perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.open', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'window_rejected'));
      return jsonb_build_object('ok', false, 'code', 'unknown_state');
  end;
  perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.open', 'success', v_org, 'user', v_actor::text, jsonb_build_object('kind', 'additional', 'window_id', v_id));
  return jsonb_build_object('ok', true, 'code', 'window_open', 'kind', 'additional', 'expires_at', v_exp);
end;
$$;

-- OWNER RPC. Revokes the owner's OWN active additional-factor window (a first or recovery window is operator-controlled and cannot be revoked by the owner:
-- an owner who suspects abuse cancels the recovery request instead). Approved session and fresh step-up required; audited; the row is kept.
create function public.rpc_owner_revoke_factor_window() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_w     record;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = v_actor and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    return jsonb_build_object('ok', false, 'code', 'not_an_owner');
  end if;
  if not (private.owner_mfa_ok() and private.step_up_ok()) then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.revoke', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'step_up_required'));
    return jsonb_build_object('ok', false, 'code', 'step_up_required');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || v_actor::text, 0));             -- (3)
  select w.id, w.authorized_by, w.opened_at into v_w
    from private.owner_mfa_windows w
   where w.user_id = v_actor and w.kind = 'additional' and w.consumed_at is null and w.revoked_at is null for update;
  if not found then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.revoke', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'no_open_window'));
    return jsonb_build_object('ok', false, 'code', 'no_open_window');
  end if;
  update private.owner_mfa_windows set revoked_at = clock_timestamp(), revoked_by = v_actor, revoke_reason = 'revoked by the owner' where id = v_w.id;
  perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_window.revoke', 'success', v_org, 'user', v_actor::text,
                              jsonb_build_object('window_id', v_w.id, 'kind', 'additional', 'authorized_by', v_w.authorized_by, 'opened_at', v_w.opened_at));
  return jsonb_build_object('ok', true, 'code', 'revoked');
end;
$$;

-- OWNER RPC. Approves the factor created inside the caller's open window (any kind). Needs aal2 and a fresh TOTP (the verification of the new factor itself).
-- A recovery window also completes ITS request (by id) and voids the remaining recovery codes.
create function public.rpc_owner_claim_factor(p_factor_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_win   uuid;
  v_kind  text;
  v_reqid uuid;
begin
  perform private.require_read_committed();   -- rev5 (F1)
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
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_actor::text, 0));           -- (2)
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || v_actor::text, 0));             -- (3)
  select w.id, w.kind, w.request_id into v_win, v_kind, v_reqid
    from private.owner_mfa_windows w
   where w.user_id = v_actor and w.consumed_at is null and w.revoked_at is null and clock_timestamp() < w.expires_at;
  if v_win is null then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_factor.approve', 'denied', v_org, 'mfa_factor', p_factor_id::text, jsonb_build_object('reason', 'no_open_window'));
    return jsonb_build_object('ok', false, 'code', 'no_open_window');
  end if;
  -- rev5 (R1): a RECOVERY factor is approved only after an operator attested the removal of the old factors (the factor gate trigger enforces the same, authoritatively)
  if v_kind = 'recovery' and not exists (select 1 from private.owner_recovery_requests rq where rq.id = v_reqid and rq.factors_removed_at is not null) then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_factor.approve', 'denied', v_org, 'mfa_factor', p_factor_id::text, jsonb_build_object('reason', 'removal_attestation_required'));
    return jsonb_build_object('ok', false, 'code', 'removal_attestation_required');
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
    update private.owner_recovery_requests set status = 'completed', completed_at = clock_timestamp(), window_id = v_win where id = v_reqid and status = 'pending';
    update private.owner_recovery_codes set voided_at = clock_timestamp() where user_id = v_actor and used_at is null and voided_at is null;
  end if;
  perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_factor.approve', 'success', v_org, 'mfa_factor', p_factor_id::text,
                              jsonb_build_object('window_id', v_win, 'kind', v_kind, 'request_id', v_reqid));
  return jsonb_build_object('ok', true, 'code', 'factor_approved');
end;
$$;

-- 5c. Recovery: owner side ----------------------------------------------------------------------------------------------------------------
-- OWNER RPC. Submits ONE recovery code (hash). A valid code creates a recovery REQUEST with a 24 hour cool-off: no session, no assurance change, no factor
-- approval, not read by owner_mfa_ok() or step_up_ok(). Callable with a password-only (aal1) session. Generic responses. Per-user throttles keyed inside the
-- database from the caller's own id: recovery_code (5 per 15 minutes, then 15 minutes blocked) and mfa_recovery (3 per hour). The request row carries its own
-- explicit timestamps (created_at and cooloff_until from ONE captured instant), so the table's cool-off constraint holds by construction.
create function public.rpc_owner_recovery_request(p_code_hash bytea) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_key   bytea;
  v_rl    jsonb;
  v_code  uuid;
  v_now   timestamptz;
begin
  perform private.require_read_committed();   -- rev5 (F1): before the rate-limit hit, any lock or any write
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

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_actor::text, 0));           -- (2)
  perform private.close_expired_recovery_requests(v_actor, v_actor, 'organization_user');
  -- rev5 (F4): the 24 hour cancellation lock protects an owner whose factor is still INTACT against a repeated hostile attempt; it never applies once the factor was removed
  -- (state other than 'approved'), so a cancellation can not leave an owner without a usable recovery path.
  if exists (select 1 from private.owner_recovery_requests r where r.user_id = v_actor and r.status = 'cancelled'
                and r.cancelled_by = v_actor and r.cancelled_at > clock_timestamp() - interval '24 hours')
     and private.owner_factor_state(v_actor) = 'approved' then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_recovery.request', 'denied', v_org, 'user', v_actor::text, jsonb_build_object('reason', 'recovery_locked'));
    return jsonb_build_object('ok', false, 'code', 'recovery_locked');
  end if;
  if exists (select 1 from private.owner_recovery_requests r where r.user_id = v_actor and r.status in ('awaiting_approval', 'pending')) then
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

  v_now := clock_timestamp();
  update private.owner_recovery_codes set used_at = v_now where id = v_code;
  insert into private.owner_recovery_requests (user_id, origin, status, created_at, cooloff_until, expires_at)
  values (v_actor, 'owner_code', 'pending', v_now, v_now + interval '24 hours', v_now + interval '24 hours' + interval '7 days');
  perform private.rate_limit_clear('recovery_code', v_key);
  perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_recovery.request', 'success', v_org, 'user', v_actor::text,
                              jsonb_build_object('origin', 'owner_code', 'cooloff_until', v_now + interval '24 hours'));
  return jsonb_build_object('ok', true, 'code', 'request_created', 'cooloff_until', v_now + interval '24 hours');
end;
$$;

-- OWNER RPC. Cancels the caller's own open request (awaiting approval or pending) of EITHER origin: this is the owner's protection against an impersonation
-- attempt on the operators. rev5: a cancellation locks new requests of either origin for 24 hours ONLY while the owner's approved factor is still intact (see the lock checks);
-- once the factor was removed there is no lock. The request's open recovery window (if any) is revoked automatically in the same transaction, with an audit row. The row is kept.
create function public.rpc_owner_recovery_cancel() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org   uuid;
  v_req   record;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = v_actor and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null or exists (select 1 from public.staff_members s where s.user_id = v_actor) then
    return jsonb_build_object('ok', false, 'code', 'not_available');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_actor::text, 0));           -- (2)
  perform private.close_expired_recovery_requests(v_actor, v_actor, 'organization_user');
  update private.owner_recovery_requests set status = 'cancelled', cancelled_at = clock_timestamp(), cancelled_by = v_actor
   where user_id = v_actor and status in ('awaiting_approval', 'pending')
   returning id, origin, factors_removed_at into v_req;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_pending_request');
  end if;
  perform private.revoke_request_windows(v_req.id, v_actor, v_actor, 'organization_user', 'request_cancelled');
  perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_recovery.cancel', 'success', v_org, 'user', v_actor::text,
                              jsonb_build_object('request_id', v_req.id, 'origin', v_req.origin, 'factors_removed', v_req.factors_removed_at is not null));
  return jsonb_build_object('ok', true, 'code', 'request_cancelled');
end;
$$;

-- 5d. Recovery: operator side (two-person authorization) --------------------------------------------------------------------------------------
-- OPERATOR 1. Initiates a recovery request for an owner who lost BOTH factor and codes (or simply has no codes). Records an identity-verification METHOD and a
-- case REFERENCE (never documents or personal data). Creates the request AWAITING a second operator; no cool-off runs yet. The target must be an active owner
-- WITH an approval history (state none means first enrolment applies). Factors are removed by hand only later, before a recovery WINDOW is authorized.
-- Quotas (D-V9) apply to COMMITTED requests: they are counted over the committed request rows under the locks, operator_recovery_initiate (per operator) and
-- operator_recovery_target (per owner, all operators). A transaction that rolls back leaves no row, so it consumes no quota and (equally) leaves no audit row; this is
-- inherent to PostgreSQL and is NOT claimed to be prevented here (header, F1). rev5 (F5): p_method is one of three real methods; a notarized statement is only the
-- supplementary flag p_notarized, never a method.
create function public.rpc_staff_initiate_owner_recovery(p_owner_user_id uuid, p_reason text, p_method text, p_ref text, p_notarized boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_gate     text;
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_org      uuid;
  v_state    text;
  v_pol      record;
  v_n        integer;
  v_oldest   timestamptz;
  v_now      timestamptz;
  v_id       uuid;
  v_retry    integer;
begin
  perform private.require_read_committed();   -- rev5 (F1): before the gate, any lock, quota count or write
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_recovery.initiate', true, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null or char_length(v_reason) not between 1 and 200
     or p_method is null or p_method not in ('video_id_check', 'in_person', 'verified_business_contact')
     or p_notarized is null
     or p_ref is null or p_ref !~ '^[A-Za-z0-9._:/#-]{1,80}$' then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:operator_recovery:' || v_actor::text, 0));        -- (1)
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)

  select m.organization_id into v_org from public.organization_members m
   where m.user_id = p_owner_user_id and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'target_not_eligible'));
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;
  perform private.close_expired_recovery_requests(p_owner_user_id, v_actor, 'staff');
  v_state := private.owner_factor_state(p_owner_user_id);
  if v_state = 'unknown' or not private.owner_has_history(p_owner_user_id) then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', v_state));
    return jsonb_build_object('ok', false, 'code', case v_state when 'unknown' then 'unknown_state' else 'first_enrolment_applies' end);
  end if;
  -- rev5 (F4): the owner's cancellation lock applies only while the owner's approved factor is intact (never after a factor removal)
  if v_state = 'approved' and exists (select 1 from private.owner_recovery_requests r where r.user_id = p_owner_user_id and r.status = 'cancelled'
                and r.cancelled_by = p_owner_user_id and r.cancelled_at > clock_timestamp() - interval '24 hours') then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'recovery_locked'));
    return jsonb_build_object('ok', false, 'code', 'recovery_locked');
  end if;
  if exists (select 1 from private.owner_recovery_requests r where r.user_id = p_owner_user_id and r.status in ('awaiting_approval', 'pending')) then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'request_pending'));
    return jsonb_build_object('ok', false, 'code', 'request_pending');
  end if;

  v_now := clock_timestamp();
  select p.max_attempts, p.window_secs into v_pol from private.rate_limit_policies p where p.bucket = 'operator_recovery_initiate';
  select count(*)::integer, min(r.created_at) into v_n, v_oldest from private.owner_recovery_requests r
   where r.origin = 'operator' and r.initiated_by = v_actor and r.created_at > v_now - make_interval(secs => v_pol.window_secs);
  if v_n >= v_pol.max_attempts then
    v_retry := greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => v_pol.window_secs) - v_now)))::integer);
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'quota_operator'));
    return jsonb_build_object('ok', false, 'code', 'throttled', 'retry_after_secs', v_retry);
  end if;
  select p.max_attempts, p.window_secs into v_pol from private.rate_limit_policies p where p.bucket = 'operator_recovery_target';
  select count(*)::integer, min(r.created_at) into v_n, v_oldest from private.owner_recovery_requests r
   where r.origin = 'operator' and r.user_id = p_owner_user_id and r.created_at > v_now - make_interval(secs => v_pol.window_secs);
  if v_n >= v_pol.max_attempts then
    v_retry := greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => v_pol.window_secs) - v_now)))::integer);
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'quota_target'));
    return jsonb_build_object('ok', false, 'code', 'throttled', 'retry_after_secs', v_retry);
  end if;

  begin
    insert into private.owner_recovery_requests (user_id, origin, status, created_at, initiated_by, initiation_reason, verification_method, verification_ref, notarized_supplement, expires_at)
    values (p_owner_user_id, 'operator', 'awaiting_approval', v_now, v_actor, v_reason, p_method, p_ref, p_notarized, v_now + interval '72 hours')
    returning id into v_id;
  exception
    when unique_violation then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'request_pending'));
      return jsonb_build_object('ok', false, 'code', 'request_pending');
    when sqlstate '23514' then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'request_rejected'));
      return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'success', v_org, 'user', p_owner_user_id::text,
                              jsonb_build_object('request_id', v_id, 'method', p_method, 'ref', p_ref, 'notarized_supplement', p_notarized));
  return jsonb_build_object('ok', true, 'code', 'awaiting_approval', 'request_id', v_id, 'approval_deadline', v_now + interval '72 hours');
end;
$$;

-- OPERATOR 2. Approves an awaiting request. MUST be a different account than the initiator (also enforced by a constraint and by the update guard), with independent
-- evidence (a different reference and the approver's OWN real method; a notarized statement is only the supplementary flag p_second_notarized). The initiator and the approver
-- must both still be active operators. Starts the 24 hour cool-off NOW (cool-off, approval time and expiry are set from one captured instant, together, once). After the
-- 72 hour deadline the request is expired and unusable (the update guard refuses the approval of an expired request even if this function were bypassed); an approval can never be replayed.
create function public.rpc_staff_approve_owner_recovery(p_request_id uuid, p_reason text, p_second_method text, p_second_ref text, p_second_notarized boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_user   uuid;
  v_org    uuid;
  v_req    record;
  v_now    timestamptz;
  v_code   text;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_recovery.approve', true, 'owner_recovery_request', p_request_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_request_id is null or char_length(v_reason) not between 1 and 200
     or p_second_method is null or p_second_method not in ('video_id_check', 'in_person', 'verified_business_contact')
     or p_second_notarized is null
     or p_second_ref is null or p_second_ref !~ '^[A-Za-z0-9._:/#-]{1,80}$' then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select r.user_id into v_user from private.owner_recovery_requests r where r.id = p_request_id;
  if v_user is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'denied', null, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'request_not_found'));
    return jsonb_build_object('ok', false, 'code', 'request_not_found');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_user::text, 0));            -- (2)
  perform private.close_expired_recovery_requests(v_user, v_actor, 'staff');
  select r.status, r.origin, r.initiated_by, r.verification_method, r.verification_ref, r.notarized_supplement, r.expires_at into v_req
    from private.owner_recovery_requests r where r.id = p_request_id for update;
  if v_req.status = 'expired' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'denied', null, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'request_expired'));
    return jsonb_build_object('ok', false, 'code', 'request_expired');
  end if;
  if v_req.status <> 'awaiting_approval' or v_req.origin <> 'operator' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'denied', null, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'request_not_awaiting', 'status', v_req.status));
    return jsonb_build_object('ok', false, 'code', 'request_not_awaiting');
  end if;
  if v_req.initiated_by = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'denied', null, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'self_approval_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_approval_not_allowed');
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = v_user and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null or exists (select 1 from public.staff_members s where s.user_id = v_user) then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'denied', null, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'target_not_eligible'));
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;
  if private.owner_factor_state(v_user) = 'unknown' or not private.owner_has_history(v_user) then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'denied', v_org, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'state_changed'));
    return jsonb_build_object('ok', false, 'code', 'state_changed');
  end if;
  -- rev5 (F3): the INITIATOR must still be an active operator at the moment of the approval (an off-boarded initiator's evidence no longer counts)
  if not private.owner_mfa_operator_ok(v_req.initiated_by) then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'denied', v_org, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'initiator_not_active'));
    return jsonb_build_object('ok', false, 'code', 'initiator_not_active');
  end if;
  if p_second_ref = v_req.verification_ref then
    v_code := 'verification_ref_reused';
  end if;
  if v_code is not null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'denied', v_org, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', v_code));
    return jsonb_build_object('ok', false, 'code', v_code);
  end if;

  v_now := clock_timestamp();
  begin
    update private.owner_recovery_requests
       set status = 'pending', approved_by = v_actor, approved_at = v_now, approval_reason = v_reason,
           second_verification_method = p_second_method, second_verification_ref = p_second_ref, second_notarized_supplement = p_second_notarized,
           cooloff_until = v_now + interval '24 hours', expires_at = v_now + interval '24 hours' + interval '7 days'
     where id = p_request_id and status = 'awaiting_approval';
  exception when sqlstate '23514' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'denied', v_org, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'approval_rejected'));
    return jsonb_build_object('ok', false, 'code', 'approval_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.approve', 'success', v_org, 'owner_recovery_request', p_request_id::text,
                              jsonb_build_object('initiated_by', v_req.initiated_by, 'method', v_req.verification_method, 'ref', v_req.verification_ref,
                                                 'second_method', p_second_method, 'second_ref', p_second_ref, 'notarized_supplement', v_req.notarized_supplement,
                                                 'second_notarized_supplement', p_second_notarized, 'cooloff_until', v_now + interval '24 hours'));
  return jsonb_build_object('ok', true, 'code', 'approved', 'cooloff_until', v_now + interval '24 hours');
end;
$$;

-- OPERATOR. Cancels an open (awaiting or pending) request, with a reason (stored in the row only, never in the audit detail). An operator cancellation starts NO owner lock.
-- rev5: the request's open recovery window is revoked automatically in the same transaction (audited). Audited; the row is kept.
create function public.rpc_staff_cancel_owner_recovery(p_request_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_user   uuid;
  v_req    record;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_recovery.cancel', true, 'owner_recovery_request', p_request_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_request_id is null or char_length(v_reason) not between 1 and 200 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select r.user_id into v_user from private.owner_recovery_requests r where r.id = p_request_id;
  if v_user is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.cancel', 'denied', null, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'request_not_found'));
    return jsonb_build_object('ok', false, 'code', 'request_not_found');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_user::text, 0));            -- (2)
  perform private.close_expired_recovery_requests(v_user, v_actor, 'staff');
  update private.owner_recovery_requests set status = 'cancelled', cancelled_at = clock_timestamp(), cancelled_by = v_actor, cancel_reason = v_reason
   where id = p_request_id and status in ('awaiting_approval', 'pending')
   returning id, origin, factors_removed_at into v_req;
  if not found then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.cancel', 'denied', null, 'owner_recovery_request', p_request_id::text, jsonb_build_object('reason', 'request_not_open'));
    return jsonb_build_object('ok', false, 'code', 'request_not_open');
  end if;
  perform private.revoke_request_windows(p_request_id, v_user, v_actor, 'staff', 'request_cancelled');
  perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.cancel', 'success', null, 'owner_recovery_request', p_request_id::text,
                              jsonb_build_object('request_id', p_request_id, 'origin', v_req.origin, 'factors_removed', v_req.factors_removed_at is not null));
  return jsonb_build_object('ok', true, 'code', 'request_cancelled');
end;
$$;

-- OPERATOR. rev5 (R1): ATTESTS that the owner's authenticator factors were removed INSIDE the open recovery window (removal itself is a Dashboard action: no SQL writes or deletes
-- auth.*). The attestation is not taken on trust: it is recorded only if (a) the target has an open recovery window and a pending, unexpired, cool-off-elapsed request,
-- (b) the database shows NO verified factor for that owner any more, and (c) the count the operator states equals the number of verified factors recorded when the window opened
-- (a mismatch is refused and audited: it is evidence of a procedure deviation, for example factors removed before the window or the wrong person's factors). It is recorded once on
-- the request (the update guard re-checks operator, cool-off and expiry); the factor gate then allows the approval of a new factor. Only the target's factors are in scope: the
-- operator names the owner, the checks read only that owner's rows, and the detective review below lists owners whose factors vanished WITHOUT a sanctioned request.
create function public.rpc_staff_attest_owner_factor_removal(p_owner_user_id uuid, p_removed_count integer) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_org   uuid;
  v_w     record;
  v_req   record;
  v_live  integer;
  v_now   timestamptz;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_factor_removal.attest', true, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null or p_removed_count is null or p_removed_count not between 0 and 10 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_owner_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.attest', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = p_owner_user_id and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.attest', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'target_not_eligible'));
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));     -- (3)
  perform private.close_expired_recovery_requests(p_owner_user_id, v_actor, 'staff');

  select w.id, w.request_id, w.factors_at_open into v_w
    from private.owner_mfa_windows w
   where w.user_id = p_owner_user_id and w.kind = 'recovery' and w.consumed_at is null and w.revoked_at is null and w.expires_at > clock_timestamp()
     for update;
  if not found then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.attest', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'no_open_recovery_window'));
    return jsonb_build_object('ok', false, 'code', 'no_open_recovery_window');
  end if;
  select r.id, r.factors_removed_at into v_req
    from private.owner_recovery_requests r
   where r.id = v_w.request_id and r.status = 'pending' and r.expires_at > clock_timestamp() and r.cooloff_until <= clock_timestamp()
     for update;
  if not found then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.attest', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'request_not_usable'));
    return jsonb_build_object('ok', false, 'code', 'request_not_usable');
  end if;
  if v_req.factors_removed_at is not null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.attest', 'success', v_org, 'user', p_owner_user_id::text,
                                jsonb_build_object('request_id', v_req.id, 'window_id', v_w.id, 'repeat', true));
    return jsonb_build_object('ok', true, 'code', 'already_attested');
  end if;
  select count(*)::integer into v_live from auth.mfa_factors f where f.user_id = p_owner_user_id and f.status::text = 'verified';
  if v_live > 0 then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.attest', 'denied', v_org, 'user', p_owner_user_id::text,
                                jsonb_build_object('reason', 'factors_still_present', 'remaining', v_live, 'request_id', v_req.id));
    return jsonb_build_object('ok', false, 'code', 'factors_still_present');
  end if;
  if p_removed_count <> v_w.factors_at_open then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.attest', 'denied', v_org, 'user', p_owner_user_id::text,
                                jsonb_build_object('reason', 'count_mismatch', 'expected', v_w.factors_at_open, 'stated', p_removed_count, 'request_id', v_req.id));
    return jsonb_build_object('ok', false, 'code', 'count_mismatch');
  end if;
  v_now := clock_timestamp();
  begin
    update private.owner_recovery_requests
       set factors_removed_at = v_now, factors_removed_by = v_actor, factors_removed_count = p_removed_count
     where id = v_req.id;
  exception when sqlstate '23514' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.attest', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'attestation_rejected'));
    return jsonb_build_object('ok', false, 'code', 'attestation_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.attest', 'success', v_org, 'user', p_owner_user_id::text,
                              jsonb_build_object('request_id', v_req.id, 'window_id', v_w.id, 'removed', p_removed_count));
  return jsonb_build_object('ok', true, 'code', 'attested');
end;
$$;

-- OPERATOR (read). rev5 (F4): the DETECTIVE control for factor removal that did not follow the sanctioned procedure. Lists (at most 50) active owners WITH approval history whose factor
-- state is recovery_required (no live approved factor, no verified factor) and who have NO open request: category 'stranded' (the latest request ended after an attested removal
-- without an approved new factor: needs a new request or break-glass) or 'unexplained' (factors vanished without an attested removal: investigate; possible unrelated or unsanctioned
-- removal). Capability, fresh step-up, audited with the count only. Returns user ids, categories and timestamps; never documents or personal data (none is stored).
create function public.rpc_staff_list_owner_factor_loss() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_rows  jsonb;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_factor_loss.review', true, 'owner_factor_loss', null);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'category', c.category, 'since', c.since) order by c.since desc nulls last), '[]'::jsonb)
    into v_rows
    from (select s.user_id,
                 case when lr.factors_removed_at is not null and lr.status in ('cancelled', 'expired') then 'stranded' else 'unexplained' end as category,
                 coalesce(lr.factors_removed_at, lr.created_at) as since
            from (select h.user_id, private.owner_factor_state(h.user_id) as st
                    from (select distinct a.user_id from private.owner_mfa_factors a) h) s
            left join lateral (select r.status, r.created_at, r.factors_removed_at from private.owner_recovery_requests r
                                where r.user_id = s.user_id order by r.created_at desc limit 1) lr on true
           where s.st = 'recovery_required'
             and exists (select 1 from public.organization_members m where m.user_id = s.user_id and m.status = 'active' and m.role = 'owner')
             and not exists (select 1 from private.owner_recovery_requests o where o.user_id = s.user_id and o.status in ('awaiting_approval', 'pending'))
           order by since desc nulls last
           limit 50) c;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_loss.review', 'success', null, 'owner_factor_loss', null, jsonb_build_object('count', jsonb_array_length(v_rows)));
  return jsonb_build_object('ok', true, 'code', 'reviewed', 'limit', 50, 'owners', v_rows);
end;
$$;

-- OPERATOR (read). What the operator needs to decide: the owner's factor state, verified factor count and the latest open or recent request with both
-- operators' ids, methods and references. Same gate and capability, audited (it discloses security state). Never returns documents or personal data (none is stored).
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
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_mfa.overview', false, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null then raise exception 'invalid arguments' using errcode = '22023'; end if;
  if not exists (select 1 from public.organization_members m where m.user_id = p_owner_user_id and m.status = 'active' and m.role = 'owner') then
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;
  v_state := private.owner_factor_state(p_owner_user_id);
  select count(*)::integer into v_ver from auth.mfa_factors f where f.user_id = p_owner_user_id and f.status::text = 'verified';
  select r.id, r.origin, r.status, r.created_at, r.initiated_by, r.verification_method, r.verification_ref, r.notarized_supplement, r.approved_by, r.approved_at,
         r.second_verification_method, r.second_verification_ref, r.second_notarized_supplement, r.cooloff_until, r.expires_at, r.windows_issued,
         r.factors_removed_at, r.factors_removed_count into v_req
    from private.owner_recovery_requests r where r.user_id = p_owner_user_id order by r.created_at desc limit 1;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa.overview', 'success', null, 'user', p_owner_user_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'factor_state', v_state, 'verified_factor_count', v_ver,
    'recovery_request', case when v_req.id is null then null
      else jsonb_build_object('id', v_req.id, 'origin', v_req.origin, 'status', v_req.status, 'created_at', v_req.created_at,
             'initiated_by', v_req.initiated_by, 'method', v_req.verification_method, 'ref', v_req.verification_ref, 'notarized_supplement', v_req.notarized_supplement,
             'approved_by', v_req.approved_by, 'approved_at', v_req.approved_at, 'second_method', v_req.second_verification_method, 'second_ref', v_req.second_verification_ref,
             'second_notarized_supplement', v_req.second_notarized_supplement,
             'cooloff_until', v_req.cooloff_until, 'expires_at', v_req.expires_at, 'windows_issued', v_req.windows_issued,
             'factors_removed_at', v_req.factors_removed_at, 'factors_removed_count', v_req.factors_removed_count,
             'cooloff_elapsed', v_req.cooloff_until is not null and clock_timestamp() >= v_req.cooloff_until) end);
end;
$$;

-- Owner context for the application server (never trusted from the client). Own state only. recovery_status: none, awaiting_approval (an operator-initiated
-- request waits for the second operator: the owner can cancel it), cooling_off, ready, stranded (rev5: the owner's factors were removed under an attested recovery and the
-- request ended without an approved new factor; a new request or the break-glass procedure applies), locked (24 hours after the owner's own cancellation, ONLY while the
-- owner's approved factor is still intact).
create function public.rpc_my_owner_context(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_owner boolean;
  v_rec   text := 'none';
  v_state text := 'none';
  v_req   record;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select exists (select 1 from public.organization_members m
                  where m.organization_id = p_organization_id and m.user_id = v_actor and m.status = 'active' and m.role = 'owner')
    into v_owner;
  if v_owner then
    select r.status, r.cooloff_until, r.expires_at, r.cancelled_at, r.cancelled_by, r.factors_removed_at into v_req
      from private.owner_recovery_requests r where r.user_id = v_actor order by r.created_at desc limit 1;
    v_state := private.owner_factor_state(v_actor);
    if v_req.status = 'awaiting_approval' and v_req.expires_at > clock_timestamp() then
      v_rec := 'awaiting_approval';
    elsif v_req.status = 'pending' and v_req.expires_at > clock_timestamp() then
      v_rec := case when clock_timestamp() < v_req.cooloff_until then 'cooling_off' else 'ready' end;
    elsif v_req.factors_removed_at is not null and v_state = 'recovery_required'
          and (v_req.status in ('cancelled', 'expired') or (v_req.status = 'pending' and v_req.expires_at <= clock_timestamp())) then
      v_rec := 'stranded';
    elsif v_req.status = 'cancelled' and v_req.cancelled_by = v_actor and v_req.cancelled_at > clock_timestamp() - interval '24 hours' and v_state = 'approved' then
      v_rec := 'locked';
    end if;
  end if;
  return jsonb_build_object('is_owner', v_owner, 'owner_mfa_ok', v_owner and private.owner_mfa_ok(), 'step_up_ok', private.step_up_ok(),
                            'factor_state', case when v_owner then v_state else 'none' end,
                            'recovery_status', v_rec,
                            'recovery_codes_remaining', case when v_owner then (select count(*)::integer from private.owner_recovery_codes c where c.user_id = v_actor and c.used_at is null and c.voided_at is null) else 0 end);
end;
$$;

-- 5e. Recovery codes (owners only): carried over from rev3.1 ----------------------------------------------------------------------------------------
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
  perform private.require_read_committed();   -- rev5 (F1)
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

-- 6. Grants and revocations ------------------------------------------------------------------------------------------------
revoke all on table private.rate_limit_policies, private.rate_limits, private.used_nonces,
                    private.owner_mfa_windows, private.owner_mfa_factors,
                    private.owner_recovery_codes, private.owner_recovery_requests
  from public, anon, authenticated, service_role;

revoke all on function private.rate_limit_hit(text, bytea), private.rate_limit_clear(text, bytea), private.consume_nonce(text, bytea, integer),
                       private.owner_mfa_ok(), private.my_mfa_owner_org_ids(), private.owner_factor_state(uuid), private.rl_user_key(text),
                       private.close_expired_recovery_requests(uuid, uuid, text), private.revoke_request_windows(uuid, uuid, uuid, text, text),
                       private.require_read_committed(), private.owner_mfa_operator_ok(uuid), private.owner_has_history(uuid),
                       private.guard_owner_mfa_window_insert(), private.guard_owner_mfa_window_update(),
                       private.guard_owner_mfa_factor_insert(), private.guard_owner_mfa_factor_update(),
                       private.guard_owner_recovery_code_update(), private.guard_owner_recovery_request_insert(), private.guard_owner_recovery_request_update()
  from public, anon, authenticated, service_role;
-- The policies above call private.my_mfa_owner_org_ids() as the querying role, exactly like my_org_ids() in 0001: it must be executable.
grant execute on function private.my_mfa_owner_org_ids() to authenticated;
-- The MFA-less owner function of 0001 is no longer used by any policy (the only two users were altered above). Removing its grant makes sure no future
-- policy can pick it up by mistake and bypass owner MFA: new owner-scoped policies must use my_mfa_owner_org_ids().
revoke execute on function private.my_owner_org_ids() from authenticated;

revoke all on function public.rpc_throttle_password_recovery(bytea, bytea), public.rpc_my_owner_context(uuid),
                       public.rpc_owner_open_factor_window(), public.rpc_owner_claim_factor(uuid), public.rpc_owner_revoke_factor_window(),
                       public.rpc_owner_set_recovery_codes(bytea[]), public.rpc_owner_recovery_request(bytea), public.rpc_owner_recovery_cancel(),
                       public.rpc_staff_authorize_owner_mfa_window(uuid, text, integer), public.rpc_staff_revoke_owner_mfa_window(uuid, text),
                       public.rpc_staff_owner_mfa_overview(uuid), public.rpc_staff_initiate_owner_recovery(uuid, text, text, text, boolean),
                       public.rpc_staff_approve_owner_recovery(uuid, text, text, text, boolean), public.rpc_staff_cancel_owner_recovery(uuid, text),
                       public.rpc_staff_attest_owner_factor_removal(uuid, integer), public.rpc_staff_list_owner_factor_loss()
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_throttle_password_recovery(bytea, bytea) to anon, authenticated;
grant execute on function public.rpc_my_owner_context(uuid), public.rpc_owner_open_factor_window(), public.rpc_owner_claim_factor(uuid), public.rpc_owner_revoke_factor_window(),
                          public.rpc_owner_set_recovery_codes(bytea[]), public.rpc_owner_recovery_request(bytea), public.rpc_owner_recovery_cancel(),
                          public.rpc_staff_authorize_owner_mfa_window(uuid, text, integer), public.rpc_staff_revoke_owner_mfa_window(uuid, text),
                          public.rpc_staff_owner_mfa_overview(uuid), public.rpc_staff_initiate_owner_recovery(uuid, text, text, text, boolean),
                          public.rpc_staff_approve_owner_recovery(uuid, text, text, text, boolean), public.rpc_staff_cancel_owner_recovery(uuid, text),
                          public.rpc_staff_attest_owner_factor_removal(uuid, integer), public.rpc_staff_list_owner_factor_loss()
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
  if (select count(*) from private.rate_limit_policies) <> 8 then raise exception 'self-check: expected 8 rate limit policies'; end if;
  if not exists (select 1 from private.rate_limit_policies where bucket = 'password_recovery' and max_attempts = 1 and window_secs = 600 and block_secs = 600) then
    raise exception 'self-check: the per-email bucket must be the 10 minute cool-down (non-blocking design)';
  end if;
  if not exists (select 1 from private.rate_limit_policies where bucket = 'operator_recovery_initiate' and max_attempts = 5 and window_secs = 86400)
     or not exists (select 1 from private.rate_limit_policies where bucket = 'operator_recovery_target' and max_attempts = 2 and window_secs = 604800) then
    raise exception 'self-check: operator recovery quotas must be 5 per operator per 24 hours and 2 per owner per 7 days';
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
  -- the sixteen RPCs of this file: SECURITY DEFINER, pinned search_path, no anon (except the throttle), no service_role, no PUBLIC
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public'
         and pr.proname in ('rpc_throttle_password_recovery', 'rpc_my_owner_context', 'rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_revoke_factor_window',
                            'rpc_owner_set_recovery_codes', 'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel', 'rpc_staff_authorize_owner_mfa_window',
                            'rpc_staff_revoke_owner_mfa_window', 'rpc_staff_owner_mfa_overview', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery',
                            'rpc_staff_cancel_owner_recovery', 'rpc_staff_attest_owner_factor_removal', 'rpc_staff_list_owner_factor_loss')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute')
         and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and (pr.proname = 'rpc_throttle_password_recovery' or not has_function_privilege('anon', pr.oid, 'execute'))
         and exists (select 1 from unnest(pr.proconfig) c where c = 'search_path=""')) <> 16 then
    raise exception 'self-check: RPC definer/search_path/grant state is wrong';
  end if;
  -- rev5 (F1): every mutating recovery RPC (all except the anon throttle and the read-only owner context) calls the READ COMMITTED guard
  if (select count(*) from (select pr.oid from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                             where n.nspname = 'public' and pr.prokind = 'f'
                               and pr.proname in ('rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_revoke_factor_window', 'rpc_owner_set_recovery_codes',
                                                  'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel', 'rpc_staff_authorize_owner_mfa_window', 'rpc_staff_revoke_owner_mfa_window',
                                                  'rpc_staff_owner_mfa_overview', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery',
                                                  'rpc_staff_cancel_owner_recovery', 'rpc_staff_attest_owner_factor_removal', 'rpc_staff_list_owner_factor_loss')
                             offset 0) cand
       where pg_get_functiondef(cand.oid) ~ 'private\.require_read_committed\(\)') <> 14 then
    raise exception 'self-check: a mutating recovery RPC does not call private.require_read_committed()';
  end if;
  -- rev5 (F6): retention. No foreign key of the four owner tables to auth.users (or of the factors to the windows) may cascade; all four references to auth.users exist
  if (select count(*) from pg_constraint c where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
        and c.conrelid in ('private.owner_mfa_factors'::regclass, 'private.owner_mfa_windows'::regclass, 'private.owner_recovery_codes'::regclass, 'private.owner_recovery_requests'::regclass)) <> 4
     or exists (select 1 from pg_constraint c where c.contype = 'f' and c.confdeltype <> 'r'
                  and c.conrelid in ('private.owner_mfa_factors'::regclass, 'private.owner_mfa_windows'::regclass, 'private.owner_recovery_codes'::regclass, 'private.owner_recovery_requests'::regclass)
                  and c.confrelid in ('auth.users'::regclass, 'private.owner_mfa_windows'::regclass)) then
    raise exception 'self-check: owner MFA and recovery history must be protected by ON DELETE RESTRICT foreign keys (4 to auth.users; none may cascade)';
  end if;
  -- triggers: windows 3 (insert guard, update guard, truncate), factors 3, codes 2, requests 3 (insert guard, update guard, truncate)
  if (select count(*) from pg_trigger tg where tg.tgrelid in ('private.owner_mfa_factors'::regclass, 'private.owner_mfa_windows'::regclass,
        'private.owner_recovery_codes'::regclass, 'private.owner_recovery_requests'::regclass) and not tg.tgisinternal) <> 11 then
    raise exception 'self-check: expected 11 triggers on the owner MFA and recovery tables';
  end if;
  -- the constraints that carry the approved rules must exist (two people, cool-off, history shape, evidence)
  if (select count(*) from pg_constraint where conname in (
        'owner_recovery_requests_two_person', 'owner_recovery_requests_cooloff', 'owner_recovery_requests_approval_group', 'owner_recovery_requests_independent_evidence',
        'owner_recovery_requests_awaiting_shape', 'owner_recovery_requests_pending_shape', 'owner_recovery_requests_expiry', 'owner_recovery_requests_windows_bounded',
        'owner_recovery_requests_removal_group', 'owner_recovery_requests_removal_state',
        'owner_mfa_windows_authorizer', 'owner_mfa_windows_request_link', 'owner_mfa_windows_revocation_group', 'owner_mfa_windows_single_outcome',
        'owner_mfa_windows_factors_at_open')) <> 15 then
    raise exception 'self-check: an approved constraint is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'owner_recovery_requests_one_open_idx' and schemaname = 'private')
     or not exists (select 1 from pg_indexes where indexname = 'owner_mfa_windows_one_open_idx' and schemaname = 'private') then
    raise exception 'self-check: an open-request or open-window unique index is missing';
  end if;
  -- the two owner policies use the MFA-aware function
  if (select count(*) from pg_policies where policyname in ('organization_billing_select_owner', 'organization_invites_select_owner')
        and qual like '%my_mfa_owner_org_ids%') <> 2 then
    raise exception 'self-check: owner policies were not updated';
  end if;
  -- RECOVERY CODES AND RECOVERY REQUESTS CAN NEVER GRANT PRIVILEGES: none of the functions that decide owner MFA, step-up or a staff session may mention recovery
  foreach f in array array['private.owner_mfa_ok()', 'private.my_mfa_owner_org_ids()', 'private.step_up_ok()', 'private.last_totp_at()',
                           'private.staff_session_ok()', 'private.mfa_check_ok()', 'private.has_capability(text)', 'private.staff_gate(text, text, boolean, text, text)'] loop
    if pg_get_functiondef(f::regprocedure) ~* 'recover' then raise exception 'self-check: % must not reference recovery objects', f; end if;
  end loop;
  -- pg_get_functiondef() RAISES on aggregate functions (42809) and PostgreSQL does not guarantee the order in which the conditions of a WHERE clause are
  -- evaluated, so the candidate rows are first reduced to ordinary functions of OUR schemas in a subquery the planner cannot flatten (OFFSET 0).
  -- (a) nothing in this file writes to or deletes from auth.*; (b) HISTORY IS PRESERVED: no function deletes from the owner MFA or recovery tables
  if exists (select 1 from (select pr.oid from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                             where n.nspname in ('public', 'private') and pr.prokind = 'f'
                               and pr.proname like any (array['rpc_owner_%', 'rpc_staff_authorize_owner%', 'rpc_staff_revoke_owner%', 'rpc_staff_owner%', 'rpc_staff_initiate_owner%',
                                                              'rpc_staff_approve_owner%', 'rpc_staff_cancel_owner%', 'rpc_staff_attest_owner%', 'rpc_staff_list_owner%', 'owner_%',
                                                              'guard_owner_%', 'close_expired_%', 'revoke_request_%', 'rl_user_key', 'rpc_throttle_password_recovery', 'rpc_my_owner_context'])
                             offset 0) cand
              where pg_get_functiondef(cand.oid) ~* '(insert\s+into|update|delete\s+from)\s+auth\.') then
    raise exception 'self-check: a function writes to the auth schema';
  end if;
  if exists (select 1 from (select pr.oid from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                             where n.nspname in ('public', 'private') and pr.prokind = 'f'
                               and pr.proname like any (array['rpc_owner_%', 'rpc_staff_authorize_owner%', 'rpc_staff_revoke_owner%', 'rpc_staff_owner%', 'rpc_staff_initiate_owner%',
                                                              'rpc_staff_approve_owner%', 'rpc_staff_cancel_owner%', 'rpc_staff_attest_owner%', 'rpc_staff_list_owner%', 'owner_%',
                                                              'guard_owner_%', 'close_expired_%', 'revoke_request_%'])
                             offset 0) cand
              where pg_get_functiondef(cand.oid) ~* 'delete\s+from\s+private\.owner_') then
    raise exception 'self-check: a function deletes owner MFA or recovery history';
  end if;
end;
$$;
