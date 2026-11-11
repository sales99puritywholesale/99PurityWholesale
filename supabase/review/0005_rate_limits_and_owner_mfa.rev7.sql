-- =====================================================================================
-- 0005_rate_limits_and_owner_mfa.rev7.sql
-- *** REVIEW DRAFT rev7. NOT APPLIED ANYWHERE. NOT EXECUTED ANYWHERE. NEVER PARSED BY POSTGRESQL. Written 2026-11-10 after the independent adversarial review of rev6 (decision: require rev7). ***
-- Separate revision: rev6 (sha256 571e1a966ee36087d3c938e0a84be9f1ad69870fdaf98c5b2e427a36490f16de), rev5, rev4, rev3.1 (canonical) and rev3 are preserved UNCHANGED. Complete diff: history/0005_rate_limits_and_owner_mfa.rev6-to-rev7.diff.
-- CHANGES FROM REV6 (mandatory findings F1, F2, F3, F4, F5, F7 of the rev6 review; analysis in docs/P2-4-0005-REV7-SECURITY-REVIEW.md):
--   * F1 FACTOR LIMIT OVER LIVE FACTORS. guard_owner_mfa_factor_insert counts approved rows whose factor the database reads as VERIFIED NOW (a.factor_id = any(v_ids)), not every approval ever recorded;
--     rev6's lifetime count made the fourth recovery of any owner impossible forever. History rows are untouched; three LIVE approved factors remain the maximum.
--   * F2 DEPARSE-DEPENDENT SELF-CHECKS. Every assertion on pg_get_constraintdef, pg_get_functiondef and pg_policies output is case-insensitive (~*, ilike) or whitespace-normalized (rev6 compared the
--     constraint text with a lower-case LIKE '%greatest%' while PostgreSQL prints GREATEST: the install would have aborted). Search_path settings are compared after removing quotes and blanks.
--   * F3 STRANDED ANCHOR. private.owner_stranded_request returns the request with the LATEST database-observed removal evidence (factors_removed_at, or a removal order of the request while the owner reads
--     recovery_required), not the owner's latest request; later requests that end without a removal never erase the state. An exception-carrying request that ends before any removal leaves the exception
--     'consumed', the owner stranded on the same anchor, and a new exception can be requested (limit: 2 per owner per 30 days). The one-live-exception-per-anchor index is removed.
--   * F4 NO-SHOW EXTENSION. After three standard windows without any verified removal exactly ONE extension (the fourth window) is allowed; the fifth always needs a verified removal. Total maximum stays five.
--   * F5 UNRECOGNIZED FACTOR ROWS. private.owner_unrecognized_factor_orders, rpc_staff_begin_unrecognized_factor_removal(owner, factor, reason) and rpc_staff_complete_unrecognized_factor_removal(order):
--     capability + fresh step-up + explicit owner AND factor + database confirmation that the row is unrecognized; the operator removes the row by hand; the database confirms it is gone. A recognized
--     verified factor can never be ordered here; unknown is never treated as verified or empty.
--   * F7 EXPLICIT STRUCTURE-CHECK REFRESH. rpc_refresh_auth_structure_check(): no argument, result computed by private.run_auth_structure_check() from the catalogs, callable by any active staff member or
--     active organization owner, limited 6 per hour per user and globally (no check younger than 15 minutes; never replaces a passing check younger than 12 hours), audited when it runs, fail closed.
--   * F13 PL/pgSQL LOOPS. The six FOR loops that used a data-modifying CTE (FOR r IN WITH upd AS (UPDATE ... RETURNING ...) SELECT ... FROM upd LOOP; rev4 to rev6, never executed) are replaced by ordinary
--     FOR r IN SELECT ... FOR UPDATE loops with a per-row UPDATE by primary key: no assumption about the construct remains (the first parse and run is still the disposable-project test, R7-13).
--   * Accepted and DOCUMENTED, not changed (F6, F8 to F12): see docs/P2-4-0005-REV7-SECURITY-REVIEW.md section 5.
-- ---- rev6 header (history) ----
-- 0005_rate_limits_and_owner_mfa.rev6.sql
-- *** REVIEW DRAFT rev6. NOT APPLIED ANYWHERE. NOT EXECUTED ANYWHERE. NEVER PARSED BY POSTGRESQL. Written 2026-11-10 on the project owner's approval of the rev6 design decisions. ***
-- Separate revision: rev5 (sha256 a5a4242dd64867e83e9bbab028889bfddb0d90b31ada0812fe0510f630e2f64d), rev4, rev3.1 (canonical) and rev3 are preserved UNCHANGED. Complete diff: history/0005_rate_limits_and_owner_mfa.rev5-to-rev6.diff.
-- CHANGES FROM REV5 (approved decisions 1 to 8; analysis in docs/P2-4-0005-REV6-SECURITY-REVIEW.md):
--   * FACTOR STATE FAILS CLOSED. Every owner-path read of auth.mfa_factors requires a FRESH PASSING structure check (private.auth_structure_ok(), the same predicate as private.mfa_check_ok() of
--     0002: a 'passed' auth_mfa_factors_shape row, at most 24 hours old, not future-dated) and treats ANY factor row with an unrecognized status or type as an UNKNOWN state, never as an empty or safe
--     one: private.owner_verified_factor_ids() returns NULL (unknown), never an empty array, in those cases; private.owner_factor_state() returns 'unknown'; private.owner_mfa_ok() returns false.
--     Reading auth.mfa_factors is NOT an officially specified interface (Supabase documents the table only in an MFA-via-RLS example); the structure check is the mitigation, not a guarantee.
--     AVAILABILITY CONSEQUENCE: there is no scheduler; when the structure check is older than 24 hours, owner MFA (and therefore owner-only policies) is denied until a staff call refreshes it.
--   * STRANDED-OWNER EXCEPTION (two operators): private.owner_recovery_exceptions with the complete state machine requested -> granted -> consumed | expired | cancelled, composite ownership keys,
--     a request that carries the exception id (exception_id), a partial unique index (one open or consumed exception per stranded request), at most 2 exceptions per owner per 30 days, a 30 day stranded
--     lookback, rechecks of the stranded state at request, grant and consume, and automatic closing when the owner stops being stranded. It bypasses ONLY the per-owner quota
--     (operator_recovery_target); the operator quota, two-person approval, the 24 hour cool-off, windows, step-up and MFA enrolment are untouched.
--   * WINDOWS: three standard windows plus at most TWO explicitly authorized extensions (rpc_staff_authorize_extra_recovery_window); FIVE is a hard maximum enforced by constraints and triggers:
--     extra_windows_granted = greatest(windows_issued - 3, 0), windows_issued equals the number of window rows, a window cannot end after its request expires, counters never decrease.
--   * PER-WINDOW VERIFIED REMOVAL (manual first; NO broker, NO service-role dependency, NO client-supplied count or evidence): rpc_staff_begin_factor_removal records the exact verified factor ids
--     the DATABASE reads; the operator removes them by hand in the Dashboard; rpc_staff_complete_factor_removal takes only the order id and reads the state itself. A factor can be approved only
--     in a window whose removal is verified (or that opened with no verified factor). The database verifies the OUTCOME (no snapshot factor remains, no new verified factor appeared); it does NOT
--     and cannot verify who removed what, through which interface, or that no other user's factor was deleted. rev5's request-level attestation with a typed count is removed.
--   * Hard deletion of Auth users stays blocked (ON DELETE RESTRICT on all six tables); break-glass has no path to MFA approval, cool-off or approval.
-- CHANGES FROM REV4 TO REV5 (kept for history):
-- (rev5 header follows)
-- *** REVIEW DRAFT rev5 (history). NOT APPLIED ANYWHERE. NOT EXECUTED ANYWHERE. Written 2026-11-10 after the project owner's review of the rev4 security report. ***
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
  ('operator_recovery_target', 2, 604800, 604800, 'Operator-initiated recovery: 2 initiations per target owner across all operators per 7 days (counted over COMMITTED request rows under locks)'),
  ('structure_refresh', 6, 3600, 3600, 'rev7 (F7): structure-check refresh calls per user: 6 per hour, then blocked 1 hour (the refresh itself is additionally limited globally by the database: see rpc_refresh_auth_structure_check)');

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
  -- rev6: set ONCE, by the completion of a factor-removal order of this request (private.owner_factor_removal_orders): the first time the database itself verified, per window, that the
  -- owner's factors were gone. It carries no count and no client-supplied evidence. It is the marker of the 'stranded' state and the precondition of every window extension.
  factors_removed_at         timestamptz,
  factors_removed_by         uuid,
  -- rev6: the stranded-owner exception that justified skipping the per-owner quota for THIS request (never anything else). Composite FK added below (circular with the exceptions table).
  exception_id               uuid,
  cooloff_until              timestamptz,
  expires_at                 timestamptz not null,
  cancelled_at               timestamptz,
  cancelled_by               uuid,
  cancel_reason              text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 1 and 200),   -- free text lives HERE (operator cancellations), never in an audit detail
  completed_at               timestamptz,
  window_id                  uuid,
  windows_issued             smallint not null default 0,
  -- rev6: extensions beyond the three standard windows; ONLY rpc_staff_authorize_extra_recovery_window raises it, together with windows_issued and the window row
  extra_windows_granted      smallint not null default 0 check (extra_windows_granted between 0 and 2),
  -- FIVE IS A HARD MAXIMUM (3 standard + at most 2 explicit extensions) and extensions cannot be banked: the extension counter is always exactly the number of windows beyond the third
  constraint owner_recovery_requests_windows_bounded check (windows_issued between 0 and 5 and extra_windows_granted = greatest(windows_issued - 3, 0)),
  -- the verified-removal marker is all-or-nothing and only exists on a request that was usable (pending, or ended after it was)
  constraint owner_recovery_requests_removal_group check (num_nonnulls(factors_removed_at, factors_removed_by) in (0, 2)),
  -- the stranded-owner exception exists only on operator-origin requests
  constraint owner_recovery_requests_exception_origin check (exception_id is null or origin = 'operator'),
  constraint owner_recovery_requests_id_user_key unique (id, user_id),
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

-- rev6: STRANDED-OWNER EXCEPTION (two operators). It lifts ONLY the per-owner quota (operator_recovery_target) for ONE new operator-initiated request of an owner the database confirms to be
-- stranded; every other rule (operator quota, two-person approval, 24 hour cool-off, windows, step-up, MFA enrolment) is untouched. States and transitions (enforced by the guards):
--   requested -> granted | expired | cancelled        granted -> consumed | expired | cancelled        (final states never change)
-- Ownership is composite: the stranded request must belong to the same owner; the request that consumes the exception carries exception_id and the same owner.
create table private.owner_recovery_exceptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete restrict,
  stranded_request_id uuid not null,
  status              text not null default 'requested' check (status in ('requested', 'granted', 'consumed', 'expired', 'cancelled')),
  requested_by        uuid not null,   -- no FK on purpose: an audit reference that must survive account deletion
  requested_at        timestamptz not null default clock_timestamp(),
  request_reason      text not null check (char_length(btrim(request_reason)) between 1 and 200),   -- free text lives here, never in an audit detail
  granted_by          uuid,
  granted_at          timestamptz,
  grant_reason        text check (grant_reason is null or char_length(btrim(grant_reason)) between 1 and 200),
  expires_at          timestamptz not null,
  consumed_at         timestamptz,
  closed_code         text check (closed_code is null or closed_code in ('not_stranded', 'operator_cancelled')),   -- a completed recovery closes an exception through 'not_stranded' (the owner is approved again)
  constraint owner_recovery_exceptions_id_user_key unique (id, user_id),
  constraint owner_recovery_exceptions_stranded_fk foreign key (stranded_request_id, user_id)
    references private.owner_recovery_requests (id, user_id) on delete restrict,
  -- TWO PEOPLE: the granter is a different account from the requester; the grant group is all-or-nothing
  constraint owner_recovery_exceptions_two_person check (granted_by is null or granted_by <> requested_by),
  constraint owner_recovery_exceptions_grant_group check (num_nonnulls(granted_by, granted_at, grant_reason) in (0, 3)),
  -- a requested exception has no grant and no consumption; granted or consumed ones have the grant group; only consumed ones have consumed_at
  constraint owner_recovery_exceptions_status_shape check (
       (status = 'requested' and granted_by is null and consumed_at is null and closed_code is null)
    or (status = 'granted'   and granted_by is not null and consumed_at is null and closed_code is null)
    or (status = 'consumed'  and granted_by is not null and consumed_at is not null and closed_code is null)
    or (status in ('expired', 'cancelled') and consumed_at is null and (status = 'cancelled' or closed_code is null))),
  -- time rules: 24 hours for the second operator to grant, then 72 hours to use the grant
  constraint owner_recovery_exceptions_expiry check (
       expires_at > requested_at
   and ((granted_at is null and expires_at <= requested_at + interval '24 hours')
     or (granted_at is not null and granted_at >= requested_at and expires_at <= granted_at + interval '72 hours'))),
  constraint owner_recovery_exceptions_consumed_time check (consumed_at is null or (granted_at is not null and consumed_at >= granted_at))
);
-- at most ONE open exception per owner; an expired, cancelled or consumed-but-fruitless one can be requested again (bounded per owner: 2 per 30 days, any status).
-- rev7 (F3): the rev6 index owner_recovery_exceptions_one_live_idx (one open OR CONSUMED exception per stranded request) is REMOVED: a consumed exception whose request ended before any removal would
-- have blocked every further exception for the same stranded owner forever. Double consumption stays impossible: unique (exception_id) on requests, the one-way transition guard and the owner lock.
create unique index owner_recovery_exceptions_one_open_idx on private.owner_recovery_exceptions (user_id) where status in ('requested', 'granted');
create index owner_recovery_exceptions_owner_idx on private.owner_recovery_exceptions (user_id, requested_at);
-- the request that consumed an exception carries its id: one request per exception, same owner
alter table private.owner_recovery_requests
  add constraint owner_recovery_requests_exception_fk foreign key (exception_id, user_id)
    references private.owner_recovery_exceptions (id, user_id) on delete restrict;
create unique index owner_recovery_requests_exception_idx on private.owner_recovery_requests (exception_id) where exception_id is not null;

create table private.owner_mfa_windows (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete restrict,
  kind          text not null check (kind in ('first', 'additional', 'recovery')),
  authorized_by uuid,   -- the operator (first, recovery) or the owner themself (additional); no FK on purpose: an audit reference that must survive account deletion
  reason        text not null check (char_length(btrim(reason)) between 1 and 200),
  request_id    uuid references private.owner_recovery_requests (id) on delete restrict,   -- recovery windows only: the approved request that justifies them
  opened_at     timestamptz not null default clock_timestamp(),
  expires_at    timestamptz not null default clock_timestamp() + interval '10 minutes',
  consumed_at   timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid,
  revoke_reason text,   -- free text lives in this row only (a manual revocation); automatic revocations use the fixed codes 'request_cancelled' and 'request_expired'; never copied to an audit detail
  -- recovery windows only: the number of verified factors the DATABASE read when the window opened (never a client-supplied number).
  factors_at_open smallint check (factors_at_open is null or factors_at_open between 0 and 10),
  -- rev6: PER-WINDOW VERIFIED REMOVAL. A recovery window that opened with no verified factor is verified at once ('none_needed'); one that opened with factors is verified only by the completion
  -- of a removal order of THIS window ('manual'). A factor can be approved only in a verified window. Nothing here is a statement from the client: the completion RPC reads the state itself.
  removal_verified_at timestamptz,
  removal_verified_by uuid,
  removal_method      text check (removal_method is null or removal_method in ('manual', 'none_needed')),
  constraint owner_mfa_windows_factors_at_open check ((kind = 'recovery') = (factors_at_open is not null)),
  constraint owner_mfa_windows_removal_group check (num_nonnulls(removal_verified_at, removal_verified_by, removal_method) in (0, 3)),
  constraint owner_mfa_windows_removal_shape check (
       (kind <> 'recovery' and removal_method is null)
    or (kind = 'recovery' and factors_at_open = 0 and removal_method = 'none_needed')
    or (kind = 'recovery' and factors_at_open > 0 and (removal_method is null or removal_method = 'manual'))),
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

-- rev6: FACTOR-REMOVAL ORDERS (manual first; no broker, no service-role dependency). An order is created by an operator for ONE open recovery window and records the exact VERIFIED factor ids the
-- DATABASE read at that moment. The operator removes those factors by hand (Dashboard; that action is outside the database) and completes the order; the completion reads the factor state itself
-- (no count, no evidence from the client) and refuses if any snapshot factor remains or a new verified factor appeared. What the database verifies is the OUTCOME; it does not verify who removed what,
-- through which interface, or that no other user's factor was deleted (the detective review rpc_staff_list_owner_factor_loss covers collateral loss). States: ordered -> completed | expired | cancelled | failed.
create table private.owner_factor_removal_orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete restrict,
  request_id          uuid not null,
  window_id           uuid not null,
  status              text not null default 'ordered' check (status in ('ordered', 'completed', 'expired', 'cancelled', 'failed')),
  snapshot_factor_ids uuid[] not null check (cardinality(snapshot_factor_ids) between 1 and 10),
  ordered_by          uuid not null,   -- no FK on purpose: an audit reference that must survive account deletion
  ordered_at          timestamptz not null default clock_timestamp(),
  expires_at          timestamptz not null,
  attempts            smallint not null default 0 check (attempts between 0 and 5),
  completed_by        uuid,
  completed_at        timestamptz,
  constraint owner_factor_removal_orders_request_fk foreign key (request_id, user_id)
    references private.owner_recovery_requests (id, user_id) on delete restrict,
  constraint owner_factor_removal_orders_window_fk foreign key (window_id, user_id)
    references private.owner_mfa_windows (id, user_id) on delete restrict,
  constraint owner_factor_removal_orders_bounded check (expires_at > ordered_at and expires_at <= ordered_at + interval '60 minutes'),
  constraint owner_factor_removal_orders_completed_shape check ((status = 'completed') = (completed_by is not null and completed_at is not null))
);
-- one live (ordered or completed) order per window
create unique index owner_factor_removal_orders_one_live_idx on private.owner_factor_removal_orders (window_id) where status in ('ordered', 'completed');
create index owner_factor_removal_orders_request_idx on private.owner_factor_removal_orders (request_id);

-- rev7 (F5): UNRECOGNIZED-FACTOR ORDERS. A factor row whose status or type the database does not recognize makes the owner's factor state UNKNOWN (never verified, never empty), which blocks every
-- recovery window and every removal order: the operator could not even order the removal of the row that blocks recovery. This table is the sanctioned, audited way out and nothing else: an
-- operator (capability, fresh step-up) names the owner AND the factor id explicitly; the DATABASE confirms that exactly this row belongs to exactly this owner and is classified 'unrecognized' (a
-- recognized verified factor can NEVER be ordered here: it goes through the window and removal-order workflow); the operator removes the row by hand (Dashboard; outside the database); the completion
-- re-reads the row itself and completes only if it is gone. It never makes an unknown row verified, never treats unknown as empty, grants nothing and deletes nothing.
create table private.owner_unrecognized_factor_orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete restrict,
  factor_id    uuid not null,   -- no FK on purpose: the row lives in auth.mfa_factors and is deleted there
  status       text not null default 'ordered' check (status in ('ordered', 'completed', 'expired')),
  reason       text not null check (char_length(btrim(reason)) between 1 and 200),   -- free text lives HERE, never in an audit detail
  ordered_by   uuid not null,   -- no FK on purpose: an audit reference that must survive account deletion
  ordered_at   timestamptz not null default clock_timestamp(),
  expires_at   timestamptz not null,
  completed_by uuid,
  completed_at timestamptz,
  constraint owner_unrecognized_factor_orders_bounded check (expires_at > ordered_at and expires_at <= ordered_at + interval '60 minutes'),
  constraint owner_unrecognized_factor_orders_completed_shape check ((status = 'completed') = (completed_by is not null and completed_at is not null))
);
-- at most ONE open order per owner
create unique index owner_unrecognized_factor_orders_one_open_idx on private.owner_unrecognized_factor_orders (user_id) where status = 'ordered';

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
alter table private.owner_recovery_exceptions enable row level security;
alter table private.owner_factor_removal_orders enable row level security;
alter table private.owner_unrecognized_factor_orders enable row level security;

-- 4d. Helpers: the factor state of one user, and the per-user rate-limit key derived inside the database ------------------------------------------
-- rev6: TRUE only if a FRESH PASSING structure check exists: the same predicate as private.mfa_check_ok() of 0002 without its caller-specific part (a 'passed' auth_mfa_factors_shape row,
-- at most 24 hours old, not future-dated). The check verifies the five columns, their types and the enum labels this file reads. Any error is FALSE (fail closed).
-- Reading auth.mfa_factors is NOT an officially specified interface; this check is the mitigation against silent schema drift, not a guarantee of stability.
create function private.auth_structure_ok() returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  return exists (select 1 from private.platform_validations v
                  where v.check_name = 'auth_mfa_factors_shape' and v.status = 'passed'
                    and v.checked_at > now() - interval '24 hours' and v.checked_at <= now());
exception when others then
  return false;
end;
$$;

-- rev6: the sorted ids of the VERIFIED factors of one user, read from auth.mfa_factors. NULL MEANS UNKNOWN, NEVER EMPTY: the result is NULL when the structure check is absent, stale or failed,
-- when the argument is NULL, when ANY factor row of the user has a null id, a null or unrecognized status or a null or unrecognized type, or on any error. An empty array means "the database read
-- this user's factors and none is verified". Every caller treats NULL as unknown and refuses; no caller may turn NULL into zero.
create function private.owner_verified_factor_ids(p_user uuid) returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_unreadable bigint;
  v_ids        uuid[];
begin
  if p_user is null or not private.auth_structure_ok() then
    return null;
  end if;
  select count(*) filter (where f.id is null or f.status is null or f.factor_type is null
                            or f.status::text not in ('verified', 'unverified')
                            or f.factor_type::text not in ('totp', 'phone', 'webauthn')),
         coalesce(array_agg(f.id order by f.id) filter (where f.status::text = 'verified'), '{}'::uuid[])
    into v_unreadable, v_ids
    from auth.mfa_factors f
   where f.user_id = p_user;
  if v_unreadable is null or v_unreadable <> 0 then
    return null;
  end if;
  return v_ids;
exception when others then
  return null;
end;
$$;

-- rev7 (F5): the classification of ONE factor row for the unrecognized-factor orders. The only other direct reader of auth.mfa_factors besides the helper above, the state function, the MFA predicate and
-- the factor gate. NULL = unknown (structure check absent, stale or failed, null argument or any error); otherwise 'recognized' (status verified|unverified AND type totp|phone|webauthn),
-- 'unrecognized' (the row exists for this user with any other or null status or type), 'other_owner' (a row with this id exists but belongs to someone else) or 'absent' (no such row).
create function private.owner_factor_row_class(p_user uuid, p_factor uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_status text;
  v_type   text;
begin
  if p_user is null or p_factor is null or not private.auth_structure_ok() then
    return null;
  end if;
  select f.status::text, f.factor_type::text into v_status, v_type
    from auth.mfa_factors f where f.id = p_factor and f.user_id = p_user;
  if found then
    if coalesce(v_status in ('verified', 'unverified'), false) and coalesce(v_type in ('totp', 'phone', 'webauthn'), false) then
      return 'recognized';
    end if;
    return 'unrecognized';
  end if;
  if exists (select 1 from auth.mfa_factors f where f.id = p_factor) then
    return 'other_owner';
  end if;
  return 'absent';
exception when others then
  return null;
end;
$$;

-- 4d. Helper: the factor state of one user (used by the guards and the RPCs). 'unapproved_factor_present' wins over everything. rev6: 'unknown' unless the structure check is fresh and passing and
-- every factor row of the user is readable (see private.owner_verified_factor_ids).
create function private.owner_factor_state(p_user uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_live       boolean;
  v_unapproved boolean;
  v_hist       boolean;
begin
  if p_user is null or private.owner_verified_factor_ids(p_user) is null then
    return 'unknown';
  end if;
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
  v_ids      uuid[];
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
  -- rev6: FAIL CLOSED on an unknown factor state. NULL means: structure check absent, stale or failed, or a factor row with an unrecognized status or type. Never treated as "no other factor".
  v_ids := private.owner_verified_factor_ids(new.user_id);
  if v_ids is null then
    raise exception 'the factor state of this user is unknown' using errcode = '23514';
  end if;
  -- rev7 (F1): the limit of three counts the owner's CURRENTLY LIVE approved factors (approved rows whose factor the database reads as verified right now), NOT every approval ever recorded.
  -- rev6 counted all rows of private.owner_mfa_factors, which are never deleted: after the third recovery of an owner no further factor could ever be approved and recovery was permanently
  -- impossible. History is preserved untouched (no row is removed or changed); only the limit is evaluated over live factors. Each recovery removes the old factors first, so repeated
  -- legitimate recovery stays possible, and an owner can still never hold more than three live approved factors.
  if (select count(*) from private.owner_mfa_factors a where a.user_id = new.user_id and a.factor_id = any (v_ids)) >= 3 then
    raise exception 'too many live approved factors' using errcode = '23514';
  end if;

  -- rev4: a recovery window is usable only while ITS request is still pending and unexpired (an expired or cancelled request cannot approve anything)
  -- rev6: and only in a window whose factor removal the DATABASE verified (per-window: opened with no verified factor, or the completion of a removal order of this very window); the window's
  -- own authorizer must still be an active operator at this moment (an operator off-boarded since opening the window invalidates it).
  if v_kind = 'recovery' then
    if not exists (
         select 1 from private.owner_recovery_requests rq join private.owner_mfa_windows w on w.request_id = rq.id
          where w.id = new.window_id and rq.status = 'pending' and rq.expires_at > clock_timestamp()) then
      raise exception 'the recovery request of this window is not usable' using errcode = '23514';
    end if;
    if not exists (select 1 from private.owner_mfa_windows w where w.id = new.window_id and w.removal_verified_at is not null) then
      raise exception 'the factor removal of this recovery window is not verified' using errcode = '23514';
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
  if v_kind in ('first', 'recovery') and exists (select 1 from unnest(v_ids) as i(fid) where i.fid <> new.factor_id) then
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
  -- rev7 (F13): every loop below is a plain SELECT ... FOR UPDATE loop with a per-row UPDATE. rev4 to rev6 used FOR r IN WITH upd AS (UPDATE ... RETURNING ...) SELECT ... FROM upd, a construct that was
  -- never executed; the form used now is ordinary PL/pgSQL (a locking SELECT in a FOR loop, then an UPDATE by primary key) and needs no assumption. The caller holds lock (2); the row locks are taken here.
  for r in select q.id, q.origin, q.factors_removed_at, q.exception_id from private.owner_recovery_requests q
            where q.user_id = p_user and q.status in ('awaiting_approval', 'pending') and q.expires_at <= clock_timestamp()
            order by q.id for update
  loop
    update private.owner_recovery_requests set status = 'expired' where id = r.id;
    v_n := v_n + 1;
    -- rev5: an expired request can never keep a usable window alive (automatic, audited revocation; the lock order stays (2) then (3))
    perform private.revoke_request_windows(r.id, p_user, p_actor, p_actor_kind, 'request_expired');
    -- stranded = the owner's factors were removed (attested) and the request ended without an approved new factor
    perform private.write_audit(p_actor, p_actor_kind, 'owner.mfa_recovery.expire', 'success', null, 'user', p_user::text,
                                jsonb_build_object('request_id', r.id, 'origin', r.origin, 'stranded', r.factors_removed_at is not null,
                                                   'exception_carrying', r.exception_id is not null));
  end loop;
  -- rev6: removal orders and stranded-owner exceptions of this owner (all under lock (2) taken by the caller; every transition is audited, nothing is deleted)
  for r in select q.id from private.owner_factor_removal_orders q
            where q.user_id = p_user and q.status = 'ordered' and q.expires_at <= clock_timestamp() order by q.id for update
  loop
    update private.owner_factor_removal_orders set status = 'expired' where id = r.id;
    perform private.write_audit(p_actor, p_actor_kind, 'owner.mfa_factor_removal.expire', 'success', null, 'user', p_user::text, jsonb_build_object('order_id', r.id));
  end loop;
  for r in select q.id from private.owner_unrecognized_factor_orders q
            where q.user_id = p_user and q.status = 'ordered' and q.expires_at <= clock_timestamp() order by q.id for update
  loop
    update private.owner_unrecognized_factor_orders set status = 'expired' where id = r.id;
    perform private.write_audit(p_actor, p_actor_kind, 'owner.mfa_unrecognized_factor.expire', 'success', null, 'user', p_user::text, jsonb_build_object('order_id', r.id));
  end loop;
  for r in select q.id from private.owner_recovery_exceptions q
            where q.user_id = p_user and q.status in ('requested', 'granted') and q.expires_at <= clock_timestamp() order by q.id for update
  loop
    update private.owner_recovery_exceptions set status = 'expired' where id = r.id;
    perform private.write_audit(p_actor, p_actor_kind, 'owner.mfa_recovery_exception.expire', 'success', null, 'user', p_user::text, jsonb_build_object('exception_id', r.id));
  end loop;
  -- an open exception whose owner is no longer stranded (a recovery completed, another request is open, or the factor state changed) can never be used: it is cancelled with a fixed code.
  -- An UNKNOWN factor state (structure check absent or stale, unreadable factor rows) is NOT "no longer stranded": it refuses every use (grant and consume re-read the state and fail closed) but does
  -- not destroy the exception, so a transient stale check cannot burn the per-owner allowance of two exceptions per 30 days.
  for r in select e.id from private.owner_recovery_exceptions e
            where e.user_id = p_user and e.status in ('requested', 'granted') and e.expires_at > clock_timestamp()
              and private.owner_factor_state(p_user) is distinct from 'unknown'
              and private.owner_stranded_request(p_user) is distinct from e.stranded_request_id
            order by e.id for update
  loop
    update private.owner_recovery_exceptions set status = 'cancelled', closed_code = 'not_stranded' where id = r.id;
    perform private.write_audit(p_actor, p_actor_kind, 'owner.mfa_recovery_exception.cancel', 'success', null, 'user', p_user::text,
                                jsonb_build_object('exception_id', r.id, 'code', 'not_stranded'));
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
  o   record;
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
    -- rev6: the open removal order of a revoked window is cancelled with it (never left dangling)
    for o in select q.id from private.owner_factor_removal_orders q where q.window_id = w.id and q.status = 'ordered' order by q.id for update
    loop
      update private.owner_factor_removal_orders set status = 'cancelled' where id = o.id;
      perform private.write_audit(p_actor, p_actor_kind, 'owner.mfa_factor_removal.cancel', 'success', null, 'user', p_user::text,
                                  jsonb_build_object('order_id', o.id, 'window_id', w.id, 'code', p_code));
    end loop;
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
  -- rev6: the VERIFIED REMOVAL of a recovery window is set exactly once, only on a still-open window, by an active operator, and only if a removal order of THIS window was completed by the
  -- database (the completion RPC read the factor state itself). It can never be set together with a consume or revoke, and never changes again.
  if new.removal_verified_at is distinct from old.removal_verified_at or new.removal_verified_by is distinct from old.removal_verified_by
     or new.removal_method is distinct from old.removal_method then
    if old.removal_verified_at is not null then
      raise exception 'a verified window removal is final' using errcode = '23514';
    end if;
    if new.kind <> 'recovery' or new.removal_method is distinct from 'manual' or new.removal_verified_at is null or new.removal_verified_by is null then
      raise exception 'only a recovery window can be verified, by the manual removal method, with its group set together' using errcode = '23514';
    end if;
    if old.consumed_at is not null or old.revoked_at is not null or new.consumed_at is not null or new.revoked_at is not null or old.expires_at <= clock_timestamp() then
      raise exception 'the window is not open: its removal cannot be verified' using errcode = '23514';
    end if;
    if not private.owner_mfa_operator_ok(new.removal_verified_by) then
      raise exception 'the removal verifier must be an active operator' using errcode = '23514';
    end if;
    if not exists (select 1 from private.owner_factor_removal_orders o where o.window_id = old.id and o.status = 'completed') then
      raise exception 'no completed removal order exists for this window' using errcode = '23514';
    end if;
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
--                the approval must be recorded, made by a different account than the initiator, and BOTH accounts are rechecked as active operators NOW; rev6: the number of windows is
--                at most 5 (hard), the request's window counter must equal the number of its window rows plus this one, the window cannot end after its request expires; authorized by
--                an operator; the window records how many verified factors the DATABASE reads at this instant (NULL = unknown = refused); with no verified factor it is verified at once
-- The target must be an ACTIVE organization owner in every case.
create function private.guard_owner_mfa_window_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_state text;
  v_req   record;
  v_ids   uuid[];
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
    select r.user_id, r.status, r.origin, r.cooloff_until, r.expires_at, r.initiated_by, r.approved_by, r.windows_issued
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
    -- rev6: FIVE IS A HARD MAXIMUM, and the counter must equal the number of window rows of this request including this one (no banking, no gap, no skipped count)
    if v_req.windows_issued not between 1 and 5
       or v_req.windows_issued <> (select count(*) from private.owner_mfa_windows w where w.request_id = new.request_id) + 1 then
      raise exception 'the number of windows issued for this request is not valid' using errcode = '23514';
    end if;
    -- a window cannot outlive its request
    if new.expires_at > v_req.expires_at then
      raise exception 'a recovery window cannot end after its request expires' using errcode = '23514';
    end if;
    -- the snapshot is what the DATABASE reads now; NULL means unknown (structure check absent or stale, unreadable factor rows) and is never read as zero
    v_ids := private.owner_verified_factor_ids(new.user_id);
    if v_ids is null or new.factors_at_open is null or new.factors_at_open <> cardinality(v_ids) then
      raise exception 'the factor snapshot of a recovery window must equal the verified factor count the database reads now' using errcode = '23514';
    end if;
    if new.removal_method = 'none_needed' and new.removal_verified_by is distinct from new.authorized_by then
      raise exception 'a window that needs no removal is verified by its authorizer' using errcode = '23514';
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
declare
  v_exc record;
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
  -- rev6: a request that carries a stranded-owner exception. The exception is validated HERE, BEFORE the new row exists (so "the owner has no open request" still holds), and consumed
  -- by the same transaction right after (guard on the exceptions table). Same owner, granted, unexpired, both operators still active, the owner still stranded on exactly that request.
  if new.exception_id is not null then
    if new.origin <> 'operator' then
      raise exception 'only an operator-initiated request can carry an exception' using errcode = '23514';
    end if;
    select e.user_id, e.status, e.expires_at, e.stranded_request_id, e.requested_by, e.granted_by into v_exc
      from private.owner_recovery_exceptions e where e.id = new.exception_id;
    if not found or v_exc.user_id <> new.user_id or v_exc.status <> 'granted' or v_exc.expires_at <= clock_timestamp() then
      raise exception 'the exception is not granted, not unexpired or belongs to another owner' using errcode = '23514';
    end if;
    if not (private.owner_mfa_operator_ok(v_exc.requested_by) and private.owner_mfa_operator_ok(v_exc.granted_by)) then
      raise exception 'the requester and the granter of the exception must both still be active operators' using errcode = '23514';
    end if;
    if private.owner_stranded_request(new.user_id) is distinct from v_exc.stranded_request_id then
      raise exception 'the owner is no longer stranded on the request of this exception' using errcode = '23514';
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
  v_ext_same  boolean;
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.origin <> old.origin or new.created_at <> old.created_at
     or new.initiated_by is distinct from old.initiated_by or new.initiation_reason is distinct from old.initiation_reason
     or new.verification_method is distinct from old.verification_method or new.verification_ref is distinct from old.verification_ref
     or new.notarized_supplement <> old.notarized_supplement or new.exception_id is distinct from old.exception_id then
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
  v_rem_same  := new.factors_removed_at is not distinct from old.factors_removed_at and new.factors_removed_by is not distinct from old.factors_removed_by;
  v_ext_same  := new.extra_windows_granted = old.extra_windows_granted;
  if new.status = old.status then
    if old.status = 'pending' and v_appr_same and v_time_same and v_end_same then
      -- (1) one more STANDARD window: the third at most (the cap and the equation are also table constraints)
      if new.windows_issued = old.windows_issued + 1 and new.windows_issued <= 3 and v_ext_same and v_rem_same then
        return new;
      end if;
      -- (2) one EXTENSION window (the fourth or fifth): counter and extension counter rise together by exactly one, the request is unexpired and the cool-off elapsed, and a window
      -- of THIS request has a verified removal. Expiry and cool-off cannot change here (v_time_same); nothing is ever refunded.
      if new.windows_issued = old.windows_issued + 1 and new.windows_issued between 4 and 5 and new.extra_windows_granted = old.extra_windows_granted + 1 and v_rem_same then
        if old.expires_at <= clock_timestamp() or old.cooloff_until is null or old.cooloff_until > clock_timestamp()
           or not exists (select 1 from private.owner_mfa_windows w where w.request_id = old.id and w.removal_verified_at is not null) then
          raise exception 'an extension needs an unexpired request past its cool-off and a window with a verified removal' using errcode = '23514';
        end if;
        return new;
      end if;
      -- (3) the VERIFIED-REMOVAL marker, once: by an active operator, after the cool-off, on an unexpired request, and only if a removal order of this request was completed by the database
      if v_win_same and v_ext_same and old.factors_removed_at is null and new.factors_removed_at is not null and new.factors_removed_by is not null then
        if old.expires_at <= clock_timestamp() or old.cooloff_until is null or new.factors_removed_at < old.cooloff_until
           or not private.owner_mfa_operator_ok(new.factors_removed_by)
           or not exists (select 1 from private.owner_factor_removal_orders o where o.request_id = old.id and o.status = 'completed') then
          raise exception 'a removal can be marked only after a completed order, by an active operator, after the cool-off, on an unexpired request' using errcode = '23514';
        end if;
        return new;
      end if;
    end if;
    raise exception 'no change is allowed on an unchanged recovery request status' using errcode = '23514';
  end if;
  if old.status = 'awaiting_approval' and new.status = 'pending' then
    if v_appr_same or v_time_same or not v_end_same or not v_win_same or not v_rem_same or not v_ext_same then
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
    if not (v_appr_same and v_time_same and v_win_same and v_rem_same and v_ext_same) then raise exception 'a cancellation changes only the cancellation record' using errcode = '23514'; end if;
  elsif new.status = 'expired' then
    if not (v_appr_same and v_time_same and v_end_same and v_win_same and v_rem_same and v_ext_same) then raise exception 'an expiry changes only the status' using errcode = '23514'; end if;
  elsif old.status = 'pending' and new.status = 'completed' then
    if not (v_appr_same and v_time_same and v_win_same and v_rem_same and v_ext_same and new.cancelled_at is not distinct from old.cancelled_at) then raise exception 'a completion changes only the completion record' using errcode = '23514'; end if;
    -- rev6: completion needs an unexpired request and the VERIFIED removal of the very window that completes it (the factor gate checks the same; this is the second, independent check)
    if old.expires_at <= clock_timestamp() or new.window_id is null
       or not exists (select 1 from private.owner_mfa_windows w where w.id = new.window_id and w.request_id = old.id and w.removal_verified_at is not null) then
      raise exception 'a recovery request completes only unexpired and through a window with a verified removal' using errcode = '23514';
    end if;
  else
    raise exception 'illegal recovery request transition' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- rev6/rev7: the DATABASE-CONFIRMED stranded state. Returns the id of the ANCHOR request when ALL hold, else NULL: the owner's factor state is 'recovery_required' (so the structure check is fresh and
-- passing and every factor row is readable: unknown is never stranded), no request of the owner is open, and an ended (cancelled or expired) request carries database-observed removal evidence
-- younger than 30 days with no later completed request (rev7: see the body; the anchor is the latest evidence, not the latest request). Used at request, grant and consume of an exception and by
-- the lazy closing of exceptions. WHAT HAPPENS WHEN AN EXCEPTION-CARRYING REQUEST ENDS BEFORE ANY REMOVAL (rev7, defined): the request creates no evidence, so the anchor stays the earlier request;
-- the exception stays 'consumed' (it was used, audited, and counts toward the limit of two per owner per 30 days); the owner is stranded again on the same anchor and a NEW exception may be requested
-- for it (the former one-live-exception-per-anchor index is removed in rev7), always under the two-operator rule and the limit of two per 30 days. A removal verified by that request moves the
-- anchor to that request.
create function private.owner_stranded_request(p_user uuid) returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user is null or private.owner_factor_state(p_user) is distinct from 'recovery_required' then
    return null;
  end if;
  if exists (select 1 from private.owner_recovery_requests o where o.user_id = p_user and o.status in ('awaiting_approval', 'pending')) then
    return null;
  end if;
  -- rev7 (F3): the anchor is the request that carries the LATEST database-observed removal evidence, NOT the owner's latest request. rev6 looked only at the very latest request, so any later
  -- request that ended without a removal (a cancelled owner-code request, or the exception-carrying request itself expiring) erased a valid stranded state and let the lazy closing cancel
  -- the exception. Evidence of a request R (ended: cancelled or expired) is either (a) R.factors_removed_at, set by the DATABASE when a removal order completed, or (b) the ordered_at of a
  -- removal order of R when the owner is in state 'recovery_required' NOW: that state means the database reads NO verified factor and every snapshot factor of the order is gone, so an
  -- operator-ordered removal happened even though the window lapsed before the completion. (The state also means no unapproved verified factor exists.) The evidence must be younger than
  -- 30 days and no request of the owner may have COMPLETED after it (a later completed recovery ends the stranded state). Requests ending without evidence never change the anchor.
  select x.id into v_id
    from (select r.id, r.created_at,
                 coalesce(r.factors_removed_at,
                          (select max(o.ordered_at) from private.owner_factor_removal_orders o where o.request_id = r.id and o.user_id = p_user)) as evidence_at
            from private.owner_recovery_requests r
           where r.user_id = p_user and r.status in ('cancelled', 'expired')) x
   where x.evidence_at is not null
     and x.evidence_at > clock_timestamp() - interval '30 days'
     and not exists (select 1 from private.owner_recovery_requests c
                      where c.user_id = p_user and c.status = 'completed' and c.completed_at > x.evidence_at)
   order by x.evidence_at desc, x.created_at desc, x.id desc
   limit 1;
  return v_id;
exception when others then
  return null;
end;
$$;

-- Exception creation gate: the requester is an active operator, the target is an active non-staff owner, the owner is stranded on exactly the referenced request RIGHT NOW, and the owner has had
-- fewer than 2 exceptions (any status) in the last 30 days. The per-owner count is taken under the owner lock by the RPC; a direct insert by any other path meets this trigger.
create function private.guard_owner_recovery_exception_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.organization_members m where m.user_id = new.user_id and m.status = 'active' and m.role = 'owner') then
    raise exception 'target is not an active organization owner' using errcode = '23514';
  end if;
  if exists (select 1 from public.staff_members s where s.user_id = new.user_id) then
    raise exception 'a staff member cannot be a recovery target' using errcode = '23514';
  end if;
  if new.status <> 'requested' then
    raise exception 'an exception is created requested' using errcode = '23514';
  end if;
  if not private.owner_mfa_operator_ok(new.requested_by) then
    raise exception 'the requester must be an active staff member holding owner.mfa.authorize' using errcode = '23514';
  end if;
  if private.owner_stranded_request(new.user_id) is distinct from new.stranded_request_id then
    raise exception 'the owner is not stranded on this request' using errcode = '23514';
  end if;
  if (select count(*) from private.owner_recovery_exceptions e
       where e.user_id = new.user_id and e.requested_at > clock_timestamp() - interval '30 days') >= 2 then
    raise exception 'at most two stranded-owner exceptions per owner per 30 days' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Exception lifecycle: ONLY these transitions exist, each at most once, nothing else ever changes.
--   requested -> granted   (a DIFFERENT active operator, before the 24 hour deadline, the owner still stranded on the same request; the grant group and the new expiry are set together)
--   granted -> consumed    (a request carrying this exception id exists for the same owner; requester and granter still active; unexpired)
--   requested | granted -> expired (only after expires_at)   requested | granted -> cancelled (a fixed closing code)
create function private.guard_owner_recovery_exception_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.stranded_request_id <> old.stranded_request_id or new.requested_by <> old.requested_by
     or new.requested_at <> old.requested_at or new.request_reason <> old.request_reason then
    raise exception 'exception identity, owner, stranded request and request record are immutable' using errcode = '23514';
  end if;
  if old.status not in ('requested', 'granted') then
    raise exception 'a finished exception cannot change again' using errcode = '23514';
  end if;
  if new.status = old.status then
    raise exception 'no change is allowed on an unchanged exception status' using errcode = '23514';
  end if;
  if old.status = 'requested' and new.status = 'granted' then
    if old.expires_at <= clock_timestamp() then
      raise exception 'an expired exception cannot be granted' using errcode = '23514';
    end if;
    if new.granted_by is null or new.granted_at is null or new.grant_reason is null or new.consumed_at is not null or new.closed_code is not null then
      raise exception 'a grant sets the grant group together and nothing else' using errcode = '23514';
    end if;
    if new.granted_by = old.requested_by then
      raise exception 'the granter must be a different account than the requester' using errcode = '23514';
    end if;
    if not (private.owner_mfa_operator_ok(new.granted_by) and private.owner_mfa_operator_ok(old.requested_by)) then
      raise exception 'the requester and the granter must both be active operators holding owner.mfa.authorize' using errcode = '23514';
    end if;
    if private.owner_stranded_request(old.user_id) is distinct from old.stranded_request_id then
      raise exception 'the owner is no longer stranded on this request' using errcode = '23514';
    end if;
  elsif old.status = 'granted' and new.status = 'consumed' then
    if new.granted_by is distinct from old.granted_by or new.granted_at is distinct from old.granted_at or new.grant_reason is distinct from old.grant_reason
       or new.expires_at <> old.expires_at or new.consumed_at is null or new.closed_code is not null then
      raise exception 'a consumption sets consumed_at and nothing else' using errcode = '23514';
    end if;
    if old.expires_at <= clock_timestamp() then
      raise exception 'an expired exception cannot be consumed' using errcode = '23514';
    end if;
    if not (private.owner_mfa_operator_ok(old.requested_by) and private.owner_mfa_operator_ok(old.granted_by)) then
      raise exception 'the requester and the granter must both still be active operators' using errcode = '23514';
    end if;
    if not exists (select 1 from private.owner_recovery_requests r
                    where r.exception_id = old.id and r.user_id = old.user_id and r.origin = 'operator' and r.created_at >= old.granted_at) then
      raise exception 'an exception is consumed only by a request that carries it' using errcode = '23514';
    end if;
  elsif new.status = 'expired' then
    if new.granted_by is distinct from old.granted_by or new.granted_at is distinct from old.granted_at or new.grant_reason is distinct from old.grant_reason
       or new.expires_at <> old.expires_at or new.consumed_at is not null or new.closed_code is not null then
      raise exception 'an expiry changes only the status' using errcode = '23514';
    end if;
    if old.expires_at > clock_timestamp() then
      raise exception 'an exception expires only after its deadline' using errcode = '23514';
    end if;
  elsif new.status = 'cancelled' then
    if new.granted_by is distinct from old.granted_by or new.granted_at is distinct from old.granted_at or new.grant_reason is distinct from old.grant_reason
       or new.expires_at <> old.expires_at or new.consumed_at is not null or new.closed_code is null then
      raise exception 'a cancellation changes only the status and the closing code' using errcode = '23514';
    end if;
  else
    raise exception 'illegal exception transition' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Removal-order creation gate: an active operator orders the removal for ONE open, unverified recovery window of this owner, of a pending unexpired request past its cool-off; the snapshot is
-- EXACTLY the sorted verified factor ids the database reads now (NULL = unknown = refused); the order cannot outlive its window.
create function private.guard_owner_factor_removal_order_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_w   record;
  v_r   record;
  v_ids uuid[];
begin
  if not private.owner_mfa_operator_ok(new.ordered_by) then
    raise exception 'the orderer must be an active staff member holding owner.mfa.authorize' using errcode = '23514';
  end if;
  if new.status <> 'ordered' or new.attempts <> 0 or new.completed_by is not null or new.completed_at is not null then
    raise exception 'an order is created ordered, with no attempt and no completion' using errcode = '23514';
  end if;
  select w.user_id, w.kind, w.request_id, w.expires_at, w.consumed_at, w.revoked_at, w.removal_verified_at into v_w
    from private.owner_mfa_windows w where w.id = new.window_id;
  if not found or v_w.user_id <> new.user_id or v_w.kind <> 'recovery' or v_w.request_id is distinct from new.request_id then
    raise exception 'the window is not a recovery window of this owner and request' using errcode = '23514';
  end if;
  if v_w.consumed_at is not null or v_w.revoked_at is not null or v_w.expires_at <= clock_timestamp() then
    raise exception 'the window is not open' using errcode = '23514';
  end if;
  if v_w.removal_verified_at is not null then
    raise exception 'the removal of this window is already verified' using errcode = '23514';
  end if;
  if new.expires_at > v_w.expires_at then
    raise exception 'an order cannot outlive its window' using errcode = '23514';
  end if;
  select r.status, r.expires_at, r.cooloff_until into v_r from private.owner_recovery_requests r where r.id = new.request_id;
  if not found or v_r.status <> 'pending' or v_r.expires_at <= clock_timestamp() or v_r.cooloff_until is null or v_r.cooloff_until > clock_timestamp() then
    raise exception 'the request is not pending, unexpired and past its cool-off' using errcode = '23514';
  end if;
  v_ids := private.owner_verified_factor_ids(new.user_id);
  if v_ids is null or v_ids is distinct from new.snapshot_factor_ids then
    raise exception 'the snapshot must equal the verified factor ids the database reads now' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Removal-order lifecycle: ordered -> completed | expired | cancelled | failed, or ordered -> ordered with exactly one more failed attempt. THE COMPLETION RE-READS THE FACTOR STATE IN THE GUARD ITSELF:
-- it is allowed only if the database reads NO verified factor for the owner (NULL = unknown = refused). Because the snapshot ids are verified factors, "no verified factor" is exactly "no snapshot
-- factor remains and no new verified factor appeared". Nothing the caller states is evidence.
create function private.guard_owner_factor_removal_order_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.request_id <> old.request_id or new.window_id <> old.window_id
     or new.snapshot_factor_ids <> old.snapshot_factor_ids or new.ordered_by <> old.ordered_by or new.ordered_at <> old.ordered_at or new.expires_at <> old.expires_at then
    raise exception 'order identity, snapshot, orderer and timing are immutable' using errcode = '23514';
  end if;
  if old.status <> 'ordered' then
    raise exception 'a finished order cannot change again' using errcode = '23514';
  end if;
  if new.status = 'ordered' then
    if new.attempts <> old.attempts + 1 or new.completed_by is not null or new.completed_at is not null then
      raise exception 'an unchanged order status allows exactly one more recorded attempt' using errcode = '23514';
    end if;
  elsif new.status = 'completed' then
    if new.attempts <> old.attempts or new.completed_by is null or new.completed_at is null then
      raise exception 'a completion sets the completion record and nothing else' using errcode = '23514';
    end if;
    if old.expires_at <= clock_timestamp() then
      raise exception 'an expired order cannot be completed' using errcode = '23514';
    end if;
    if not private.owner_mfa_operator_ok(new.completed_by) then
      raise exception 'the completer must be an active staff member holding owner.mfa.authorize' using errcode = '23514';
    end if;
    if not exists (select 1 from private.owner_mfa_windows w
                    where w.id = old.window_id and w.user_id = old.user_id and w.consumed_at is null and w.revoked_at is null and w.expires_at > clock_timestamp()) then
      raise exception 'the window of this order is not open' using errcode = '23514';
    end if;
    v_ids := private.owner_verified_factor_ids(old.user_id);
    if v_ids is null or cardinality(v_ids) <> 0 then
      raise exception 'the database reads a verified factor, or an unknown factor state: the removal is not complete' using errcode = '23514';
    end if;
  elsif new.status = 'expired' then
    if new.attempts <> old.attempts or new.completed_by is not null or new.completed_at is not null or old.expires_at > clock_timestamp() then
      raise exception 'an order expires only after its deadline and changes only the status' using errcode = '23514';
    end if;
  elsif new.status in ('cancelled', 'failed') then
    if new.completed_by is not null or new.completed_at is not null then
      raise exception 'a cancelled or failed order has no completion' using errcode = '23514';
    end if;
  else
    raise exception 'illegal order transition' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- rev7 (F5): unrecognized-factor order creation gate. An active operator orders it for ONE factor row of ONE active non-staff organization owner, and only if the DATABASE reads that very row, for that
-- very owner, as 'unrecognized' under a fresh passing structure check. A recognized (verified or unverified) row, a row of another user, an absent row and an unknown state are all refused.
create function private.guard_owner_unrecognized_order_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.owner_mfa_operator_ok(new.ordered_by) then
    raise exception 'the orderer must be an active staff member holding owner.mfa.authorize' using errcode = '23514';
  end if;
  if new.status <> 'ordered' or new.completed_by is not null or new.completed_at is not null then
    raise exception 'an order is created ordered, with no completion' using errcode = '23514';
  end if;
  if new.ordered_by = new.user_id then
    raise exception 'an operator cannot order the removal of a factor row of their own account' using errcode = '23514';
  end if;
  if not exists (select 1 from public.organization_members m where m.user_id = new.user_id and m.status = 'active' and m.role = 'owner') then
    raise exception 'target is not an active organization owner' using errcode = '23514';
  end if;
  if exists (select 1 from public.staff_members s where s.user_id = new.user_id) then
    raise exception 'a staff member cannot be the target of an unrecognized-factor order' using errcode = '23514';
  end if;
  if private.owner_factor_row_class(new.user_id, new.factor_id) is distinct from 'unrecognized' then
    raise exception 'the database does not read this factor row as unrecognized for this owner' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- rev7 (F5): lifecycle ordered -> completed | expired, once. THE COMPLETION RE-READS THE ROW IN THE GUARD: it is allowed only if the database reads the factor row as 'absent' (NULL = unknown and
-- 'other_owner', 'recognized', 'unrecognized' all refuse). Nothing the caller states is evidence.
create function private.guard_owner_unrecognized_order_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.factor_id <> old.factor_id or new.reason <> old.reason
     or new.ordered_by <> old.ordered_by or new.ordered_at <> old.ordered_at or new.expires_at <> old.expires_at then
    raise exception 'order identity, owner, factor, reason, orderer and timing are immutable' using errcode = '23514';
  end if;
  if old.status <> 'ordered' then
    raise exception 'a finished order cannot change again' using errcode = '23514';
  end if;
  if new.status = 'completed' then
    if new.completed_by is null or new.completed_at is null then
      raise exception 'a completion sets the completion record' using errcode = '23514';
    end if;
    if old.expires_at <= clock_timestamp() then
      raise exception 'an expired order cannot be completed' using errcode = '23514';
    end if;
    if not private.owner_mfa_operator_ok(new.completed_by) then
      raise exception 'the completer must be an active staff member holding owner.mfa.authorize' using errcode = '23514';
    end if;
    if private.owner_factor_row_class(old.user_id, old.factor_id) is distinct from 'absent' then
      raise exception 'the database does not read this factor row as absent: the removal is not complete' using errcode = '23514';
    end if;
  elsif new.status = 'expired' then
    if new.completed_by is not null or new.completed_at is not null or old.expires_at > clock_timestamp() then
      raise exception 'an order expires only after its deadline and changes only the status' using errcode = '23514';
    end if;
  else
    raise exception 'illegal order transition' using errcode = '23514';
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
create trigger owner_recovery_exceptions_guard_insert before insert on private.owner_recovery_exceptions
  for each row execute function private.guard_owner_recovery_exception_insert();
create trigger owner_recovery_exceptions_guard_update before update on private.owner_recovery_exceptions
  for each row execute function private.guard_owner_recovery_exception_update();
create trigger owner_recovery_exceptions_no_truncate before truncate on private.owner_recovery_exceptions
  for each statement execute function private.block_truncate();
create trigger owner_factor_removal_orders_guard_insert before insert on private.owner_factor_removal_orders
  for each row execute function private.guard_owner_factor_removal_order_insert();
create trigger owner_factor_removal_orders_guard_update before update on private.owner_factor_removal_orders
  for each row execute function private.guard_owner_factor_removal_order_update();
create trigger owner_factor_removal_orders_no_truncate before truncate on private.owner_factor_removal_orders
  for each statement execute function private.block_truncate();
create trigger owner_unrecognized_factor_orders_guard_insert before insert on private.owner_unrecognized_factor_orders
  for each row execute function private.guard_owner_unrecognized_order_insert();
create trigger owner_unrecognized_factor_orders_guard_update before update on private.owner_unrecognized_factor_orders
  for each row execute function private.guard_owner_unrecognized_order_update();
create trigger owner_unrecognized_factor_orders_no_truncate before truncate on private.owner_unrecognized_factor_orders
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
  -- rev6: FAIL CLOSED without a fresh passing structure check (see private.auth_structure_ok): owner MFA is denied rather than guessed
  if not private.auth_structure_ok() then
    return false;
  end if;
  select
    count(*) filter (where f.id is null or f.status is null or f.factor_type is null
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
-- approved factor is still intact at this point; rev6: it is removed by hand (Dashboard) only INSIDE the window, after rpc_staff_begin_factor_removal recorded the exact factor ids the DATABASE
-- reads and before rpc_staff_complete_factor_removal verified the outcome; the window records how many verified factors the database read when it opened (NULL = unknown = refused; zero =
-- verified at once). THREE standard windows only: a fourth or fifth needs rpc_staff_authorize_extra_recovery_window. Independently authenticated (staff_gate: verified staff session at aal2 with an approved factor, fresh
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
  v_ids    uuid[];
  v_endts  timestamptz;
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
    select r.id, r.cooloff_until, r.windows_issued, r.expires_at into v_req
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
    -- rev5 (R1): NO factor-removal precondition: the old approved factor stays intact until this window exists; the operator removes it by hand after ordering the removal in this window.
    -- rev6: THREE standard windows only; the fourth and fifth exist only through rpc_staff_authorize_extra_recovery_window (the table constraints and guards enforce the same).
    if v_req.windows_issued >= 3 then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text,
                                  jsonb_build_object('reason', 'recovery_window_limit', 'request_id', v_req.id));
      return jsonb_build_object('ok', false, 'code', 'recovery_window_limit');
    end if;
    v_kind := 'recovery';
    v_reqid := v_req.id;
  end if;

  v_endts := clock_timestamp() + make_interval(mins => p_minutes);
  if v_reqid is not null then
    -- rev6: the database reads the verified factors; NULL is unknown and refuses (never zero). A window can never outlive its request.
    v_ids := private.owner_verified_factor_ids(p_owner_user_id);
    if v_ids is null then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'unknown_state'));
      return jsonb_build_object('ok', false, 'code', 'unknown_state');
    end if;
    v_cnt := cardinality(v_ids);
    v_endts := least(v_endts, v_req.expires_at);
    if v_endts < clock_timestamp() + interval '5 minutes' then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.authorize', 'denied', v_org, 'user', p_owner_user_id::text,
                                  jsonb_build_object('reason', 'request_ending', 'request_id', v_reqid));
      return jsonb_build_object('ok', false, 'code', 'request_ending');
    end if;
  end if;

  begin
    if v_reqid is not null then
      update private.owner_recovery_requests set windows_issued = windows_issued + 1 where id = v_reqid;
    end if;
    insert into private.owner_mfa_windows (user_id, kind, authorized_by, reason, request_id, expires_at, factors_at_open, removal_verified_at, removal_verified_by, removal_method)
    values (p_owner_user_id, v_kind, v_actor, v_reason, v_reqid, v_endts, case when v_reqid is not null then v_cnt end,
            case when v_reqid is not null and v_cnt = 0 then clock_timestamp() end,
            case when v_reqid is not null and v_cnt = 0 then v_actor end,
            case when v_reqid is not null and v_cnt = 0 then 'none_needed' end)
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
  -- rev6: a RECOVERY factor is approved only in a window whose removal the DATABASE verified (the factor gate trigger enforces the same, authoritatively)
  if v_kind = 'recovery' and not exists (select 1 from private.owner_mfa_windows w where w.id = v_win and w.removal_verified_at is not null) then
    perform private.write_audit(v_actor, 'organization_user', 'owner.mfa_factor.approve', 'denied', v_org, 'mfa_factor', p_factor_id::text, jsonb_build_object('reason', 'removal_not_verified'));
    return jsonb_build_object('ok', false, 'code', 'removal_not_verified');
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
    -- rev6: a completed recovery makes the owner approved, so no outstanding stranded-owner exception can be used any more: close them now (audited), under the owner lock taken above
    perform private.close_expired_recovery_requests(v_actor, v_actor, 'organization_user');
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
     and private.owner_factor_state(v_actor) in ('approved', 'unknown') then   -- rev6: an UNKNOWN state keeps the lock (fail closed); only a state that is KNOWN not to be intact lifts it
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
create function public.rpc_staff_initiate_owner_recovery(p_owner_user_id uuid, p_reason text, p_method text, p_ref text, p_notarized boolean default false, p_exception_id uuid default null) returns jsonb
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
  v_exc      record;
  v_exc_id   uuid;
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

  -- rev6: an EXPLICIT stranded-owner exception (never implicit): it must be granted to this owner, unexpired, and the database must confirm the owner stranded on its request RIGHT NOW (before the new
  -- request exists). It lifts ONLY the per-owner quota below; the operator quota, the rest of this function and every later rule are unchanged.
  v_exc_id := null;
  if p_exception_id is not null then
    select e.id, e.stranded_request_id into v_exc
      from private.owner_recovery_exceptions e
     where e.id = p_exception_id and e.user_id = p_owner_user_id and e.status = 'granted' and e.expires_at > clock_timestamp() for update;
    if not found or private.owner_stranded_request(p_owner_user_id) is distinct from v_exc.stranded_request_id then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'exception_not_usable'));
      return jsonb_build_object('ok', false, 'code', 'exception_not_usable');
    end if;
    v_exc_id := v_exc.id;
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
  if v_exc_id is null then   -- the per-owner quota: skipped ONLY with a usable stranded-owner exception
    select p.max_attempts, p.window_secs into v_pol from private.rate_limit_policies p where p.bucket = 'operator_recovery_target';
    select count(*)::integer, min(r.created_at) into v_n, v_oldest from private.owner_recovery_requests r
     where r.origin = 'operator' and r.user_id = p_owner_user_id and r.created_at > v_now - make_interval(secs => v_pol.window_secs);
    if v_n >= v_pol.max_attempts then
      v_retry := greatest(1, ceil(extract(epoch from (v_oldest + make_interval(secs => v_pol.window_secs) - v_now)))::integer);
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'quota_target'));
      return jsonb_build_object('ok', false, 'code', 'throttled', 'retry_after_secs', v_retry);
    end if;
  end if;

  begin
    insert into private.owner_recovery_requests (user_id, origin, status, created_at, initiated_by, initiation_reason, verification_method, verification_ref, notarized_supplement, expires_at, exception_id)
    values (p_owner_user_id, 'operator', 'awaiting_approval', v_now, v_actor, v_reason, p_method, p_ref, p_notarized, v_now + interval '72 hours', v_exc_id)
    returning id into v_id;
    if v_exc_id is not null then   -- consumed by the SAME sub-transaction: either both happen or neither
      update private.owner_recovery_exceptions set status = 'consumed', consumed_at = v_now where id = v_exc_id;
    end if;
  exception
    when unique_violation then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'request_pending'));
      return jsonb_build_object('ok', false, 'code', 'request_pending');
    when sqlstate '23514' then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'request_rejected'));
      return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end;
  if v_exc_id is not null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.consume', 'success', v_org, 'user', p_owner_user_id::text,
                                jsonb_build_object('exception_id', v_exc_id, 'request_id', v_id));
  end if;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery.initiate', 'success', v_org, 'user', p_owner_user_id::text,
                              jsonb_build_object('request_id', v_id, 'method', p_method, 'ref', p_ref, 'notarized_supplement', p_notarized, 'exception_id', v_exc_id));
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

-- OPERATOR. rev6: EXPLICIT AUTHORIZATION of one extension window (the fourth or fifth; FIVE is the hard maximum). Dedicated RPC: fresh step-up, capability, an audited reason (the text lives in the window
-- row only). It extends the allowance AND opens the window in ONE sub-transaction (no banking). Preconditions: a pending request past its cool-off and not about to expire, all three standard windows used,
-- at most one extension already granted, and (rev7) EITHER a window of THIS request with a verified removal OR the no-show path (see the body: exactly the fourth window). It changes neither the request's expiry nor its cool-off (the update guard forbids it) and never refunds anything.
create function public.rpc_staff_authorize_extra_recovery_window(p_owner_user_id uuid, p_reason text, p_minutes integer default 30) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_state  text;
  v_org    uuid;
  v_id     uuid;
  v_end    timestamptz;
  v_endts  timestamptz;
  v_w      record;
  v_req    record;
  v_ids    uuid[];
  v_cnt    integer;
  v_path   text;
begin
  perform private.require_read_committed();   -- rev5 (F1): before any lock, gate audit or write
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_recovery_window.extend', true, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null or char_length(v_reason) not between 1 and 200 or p_minutes is null or p_minutes not between 5 and 60 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_owner_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = p_owner_user_id and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'target_not_eligible'));
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));     -- (3)
  perform private.close_expired_recovery_requests(p_owner_user_id, v_actor, 'staff');

  select w.id, w.kind, w.authorized_by, w.opened_at, w.expires_at into v_w
    from private.owner_mfa_windows w where w.user_id = p_owner_user_id and w.consumed_at is null and w.revoked_at is null for update;
  if found then
    if v_w.expires_at > clock_timestamp() then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text,
                                  jsonb_build_object('reason', 'window_already_open', 'window_id', v_w.id, 'kind', v_w.kind));
      return jsonb_build_object('ok', false, 'code', 'window_already_open');
    end if;
    update private.owner_mfa_windows set revoked_at = clock_timestamp(), revoked_by = v_actor, revoke_reason = 'lapsed' where id = v_w.id;
    perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa_window.lapse', 'success', v_org, 'user', p_owner_user_id::text,
                                jsonb_build_object('window_id', v_w.id, 'kind', v_w.kind, 'authorized_by', v_w.authorized_by, 'opened_at', v_w.opened_at));
  end if;

  v_state := private.owner_factor_state(p_owner_user_id);
  if v_state = 'unknown' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'unknown_state'));
    return jsonb_build_object('ok', false, 'code', 'unknown_state');
  end if;
  select r.id, r.cooloff_until, r.windows_issued, r.extra_windows_granted, r.expires_at into v_req
    from private.owner_recovery_requests r where r.user_id = p_owner_user_id and r.status = 'pending' for update;
  if not found or v_state = 'none' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'recovery_not_ready'));
    return jsonb_build_object('ok', false, 'code', 'recovery_not_ready');
  end if;
  if clock_timestamp() < v_req.cooloff_until then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'cooling_off', 'request_id', v_req.id));
    return jsonb_build_object('ok', false, 'code', 'recovery_cooling_off', 'cooloff_until', v_req.cooloff_until);
  end if;
  if v_req.windows_issued < 3 then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'extension_not_needed', 'request_id', v_req.id));
    return jsonb_build_object('ok', false, 'code', 'extension_not_needed');
  end if;
  if v_req.windows_issued >= 5 or v_req.extra_windows_granted >= 2 then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'recovery_window_limit', 'request_id', v_req.id));
    return jsonb_build_object('ok', false, 'code', 'recovery_window_limit');
  end if;
  -- rev7 (F4): TWO BOUNDED PATHS. Path 'verified_removal' (rev6): a window of this request has a database-verified removal (the fourth or the fifth window). Path 'no_show' (new): ALL THREE standard
  -- windows ended without a verified removal (the owner missed them: no-show, device problem) and no extension was used yet: exactly ONE extension (the fourth window) is allowed, so the request is
  -- not stranded in a dead end that only a cancellation and a new request under the quotas could resolve. The fifth window ALWAYS requires a verified removal, so the total never exceeds five and a request
  -- that wastes four windows without any verified removal ends (a new request under the quotas, or the stranded-owner exception once a removal was verified). The window opened on the no-show path
  -- still verifies nothing by itself: a factor can be approved only after the removal is verified (no factor) or ordered and completed (live factor); this path weakens no control.
  v_path := case when exists (select 1 from private.owner_mfa_windows w where w.request_id = v_req.id and w.removal_verified_at is not null) then 'verified_removal'
                 when v_req.windows_issued = 3 and v_req.extra_windows_granted = 0 then 'no_show'
                 else null end;
  if v_path is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'removal_not_verified', 'request_id', v_req.id));
    return jsonb_build_object('ok', false, 'code', 'removal_not_verified');
  end if;
  v_ids := private.owner_verified_factor_ids(p_owner_user_id);
  if v_ids is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'unknown_state'));
    return jsonb_build_object('ok', false, 'code', 'unknown_state');
  end if;
  v_cnt := cardinality(v_ids);
  v_endts := least(clock_timestamp() + make_interval(mins => p_minutes), v_req.expires_at);
  if v_endts < clock_timestamp() + interval '5 minutes' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'request_ending', 'request_id', v_req.id));
    return jsonb_build_object('ok', false, 'code', 'request_ending');
  end if;

  begin
    update private.owner_recovery_requests set windows_issued = windows_issued + 1, extra_windows_granted = extra_windows_granted + 1 where id = v_req.id;
    insert into private.owner_mfa_windows (user_id, kind, authorized_by, reason, request_id, expires_at, factors_at_open, removal_verified_at, removal_verified_by, removal_method)
    values (p_owner_user_id, 'recovery', v_actor, v_reason, v_req.id, v_endts, v_cnt,
            case when v_cnt = 0 then clock_timestamp() end, case when v_cnt = 0 then v_actor end, case when v_cnt = 0 then 'none_needed' end)
    returning id, expires_at into v_id, v_end;
  exception
    when unique_violation then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'window_already_open'));
      return jsonb_build_object('ok', false, 'code', 'window_already_open');
    when sqlstate '23514' then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'extension_rejected'));
      return jsonb_build_object('ok', false, 'code', 'extension_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_window.extend', 'success', v_org, 'user', p_owner_user_id::text,
                              jsonb_build_object('window_id', v_id, 'request_id', v_req.id, 'windows_issued', v_req.windows_issued + 1,
                                                 'extra_windows_granted', v_req.extra_windows_granted + 1, 'minutes', p_minutes, 'factors_at_open', v_cnt, 'path', v_path));
  return jsonb_build_object('ok', true, 'code', 'authorized', 'kind', 'recovery', 'window_id', v_id, 'expires_at', v_end, 'factors_at_open', v_cnt);
end;
$$;

-- OPERATOR. rev6: STRANDED-OWNER EXCEPTION, step 1 of 2 (two different operators). Requests an exception for an owner the DATABASE confirms to be stranded (see private.owner_stranded_request).
-- Needs the capability and fresh step-up. The reason text lives in the row only. At most one open exception per owner and 2 per owner per 30 days (counted over committed rows under the owner lock).
-- The exception lifts ONLY the per-owner quota of one later operator-initiated request; it grants nothing else.
create function public.rpc_staff_request_stranded_exception(p_owner_user_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_org    uuid;
  v_strand uuid;
  v_id     uuid;
  v_exp    timestamptz := clock_timestamp() + interval '24 hours';
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_recovery_exception.request', true, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null or char_length(v_reason) not between 1 and 200 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_owner_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.request', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = p_owner_user_id and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.request', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'target_not_eligible'));
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)
  perform private.close_expired_recovery_requests(p_owner_user_id, v_actor, 'staff');
  v_strand := private.owner_stranded_request(p_owner_user_id);
  if v_strand is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.request', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'stranded_not_confirmed'));
    return jsonb_build_object('ok', false, 'code', 'stranded_not_confirmed');
  end if;
  if exists (select 1 from private.owner_recovery_exceptions e where e.user_id = p_owner_user_id and e.status in ('requested', 'granted')) then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.request', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'exception_already_open'));
    return jsonb_build_object('ok', false, 'code', 'exception_already_open');
  end if;
  if (select count(*) from private.owner_recovery_exceptions e where e.user_id = p_owner_user_id and e.requested_at > clock_timestamp() - interval '30 days') >= 2 then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.request', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'exception_limit'));
    return jsonb_build_object('ok', false, 'code', 'exception_limit');
  end if;
  begin
    insert into private.owner_recovery_exceptions (user_id, stranded_request_id, requested_by, request_reason, expires_at)
    values (p_owner_user_id, v_strand, v_actor, v_reason, v_exp)
    returning id into v_id;
  exception
    when unique_violation then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.request', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'exception_already_open'));
      return jsonb_build_object('ok', false, 'code', 'exception_already_open');
    when sqlstate '23514' then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.request', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'exception_rejected'));
      return jsonb_build_object('ok', false, 'code', 'exception_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.request', 'success', v_org, 'user', p_owner_user_id::text,
                              jsonb_build_object('exception_id', v_id, 'stranded_request_id', v_strand));
  return jsonb_build_object('ok', true, 'code', 'exception_requested', 'exception_id', v_id, 'expires_at', v_exp);
end;
$$;

-- OPERATOR. rev6: STRANDED-OWNER EXCEPTION, step 2 of 2. A DIFFERENT active operator (fresh step-up, capability) grants it, before the 24 hour deadline, while the owner is still stranded on the same request
-- and the requester is still an active operator. The grant lasts 72 hours and is consumed by ONE operator-initiated request (rpc_staff_initiate_owner_recovery with the exception id).
create function public.rpc_staff_grant_stranded_exception(p_exception_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_user   uuid;
  v_exc    record;
  v_now    timestamptz;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_recovery_exception.grant', true, 'owner_recovery_exception', p_exception_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_exception_id is null or char_length(v_reason) not between 1 and 200 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select e.user_id into v_user from private.owner_recovery_exceptions e where e.id = p_exception_id;
  if v_user is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.grant', 'denied', null, 'owner_recovery_exception', p_exception_id::text, jsonb_build_object('reason', 'exception_not_found'));
    return jsonb_build_object('ok', false, 'code', 'exception_not_found');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_user::text, 0));   -- (2)
  perform private.close_expired_recovery_requests(v_user, v_actor, 'staff');
  select e.status, e.requested_by, e.stranded_request_id into v_exc
    from private.owner_recovery_exceptions e where e.id = p_exception_id for update;
  if v_exc.status <> 'requested' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.grant', 'denied', null, 'owner_recovery_exception', p_exception_id::text, jsonb_build_object('reason', 'exception_not_open', 'status', v_exc.status));
    return jsonb_build_object('ok', false, 'code', 'exception_not_open');
  end if;
  if v_exc.requested_by = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.grant', 'denied', null, 'owner_recovery_exception', p_exception_id::text, jsonb_build_object('reason', 'self_grant_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_grant_not_allowed');
  end if;
  if not private.owner_mfa_operator_ok(v_exc.requested_by) then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.grant', 'denied', null, 'owner_recovery_exception', p_exception_id::text, jsonb_build_object('reason', 'requester_not_active'));
    return jsonb_build_object('ok', false, 'code', 'requester_not_active');
  end if;
  if private.owner_stranded_request(v_user) is distinct from v_exc.stranded_request_id then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.grant', 'denied', null, 'owner_recovery_exception', p_exception_id::text, jsonb_build_object('reason', 'stranded_not_confirmed'));
    return jsonb_build_object('ok', false, 'code', 'stranded_not_confirmed');
  end if;
  v_now := clock_timestamp();
  begin
    update private.owner_recovery_exceptions
       set status = 'granted', granted_by = v_actor, granted_at = v_now, grant_reason = v_reason, expires_at = v_now + interval '72 hours'
     where id = p_exception_id and status = 'requested';
  exception when sqlstate '23514' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.grant', 'denied', null, 'owner_recovery_exception', p_exception_id::text, jsonb_build_object('reason', 'grant_rejected'));
    return jsonb_build_object('ok', false, 'code', 'grant_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.grant', 'success', null, 'owner_recovery_exception', p_exception_id::text,
                              jsonb_build_object('exception_id', p_exception_id, 'requested_by', v_exc.requested_by));
  return jsonb_build_object('ok', true, 'code', 'exception_granted', 'expires_at', v_now + interval '72 hours');
end;
$$;

-- OPERATOR. rev6: cancels an open (requested or granted) exception. Any active operator holding the capability (fresh step-up). The row is kept with the closing code 'operator_cancelled'.
create function public.rpc_staff_cancel_stranded_exception(p_exception_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_user  uuid;
  v_exc   record;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_recovery_exception.cancel', true, 'owner_recovery_exception', p_exception_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_exception_id is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select e.user_id into v_user from private.owner_recovery_exceptions e where e.id = p_exception_id;
  if v_user is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.cancel', 'denied', null, 'owner_recovery_exception', p_exception_id::text, jsonb_build_object('reason', 'exception_not_found'));
    return jsonb_build_object('ok', false, 'code', 'exception_not_found');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_user::text, 0));   -- (2)
  perform private.close_expired_recovery_requests(v_user, v_actor, 'staff');
  update private.owner_recovery_exceptions set status = 'cancelled', closed_code = 'operator_cancelled'
   where id = p_exception_id and status in ('requested', 'granted')
   returning id, status into v_exc;
  if not found then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.cancel', 'denied', null, 'owner_recovery_exception', p_exception_id::text, jsonb_build_object('reason', 'exception_not_open'));
    return jsonb_build_object('ok', false, 'code', 'exception_not_open');
  end if;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_recovery_exception.cancel', 'success', null, 'owner_recovery_exception', p_exception_id::text, jsonb_build_object('exception_id', p_exception_id, 'code', 'operator_cancelled'));
  return jsonb_build_object('ok', true, 'code', 'exception_cancelled');
end;
$$;

-- OPERATOR. rev6: FACTOR-REMOVAL ORDER, step 1 of 2 (MANUAL removal; no broker). For the owner's OPEN recovery window of a pending, unexpired request past its cool-off, the DATABASE reads the exact VERIFIED
-- factor ids and records them in an order the operator then executes by hand in the Dashboard (only those ids, only this owner). Idempotent: an unexpired open order is returned again. The ids returned
-- are read by the database, never supplied by the caller. NULL (unknown) factor state refuses.
create function public.rpc_staff_begin_factor_removal(p_owner_user_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_org   uuid;
  v_w     record;
  v_r     record;
  v_o     record;
  v_ids   uuid[];
  v_oid   uuid;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_factor_removal.begin', true, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_owner_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = p_owner_user_id and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'target_not_eligible'));
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));     -- (3)
  perform private.close_expired_recovery_requests(p_owner_user_id, v_actor, 'staff');

  select w.id, w.request_id, w.expires_at, w.removal_verified_at into v_w
    from private.owner_mfa_windows w
   where w.user_id = p_owner_user_id and w.kind = 'recovery' and w.consumed_at is null and w.revoked_at is null and w.expires_at > clock_timestamp()
     for update;
  if not found then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'no_open_recovery_window'));
    return jsonb_build_object('ok', false, 'code', 'no_open_recovery_window');
  end if;
  if v_w.removal_verified_at is not null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'removal_already_verified', 'window_id', v_w.id));
    return jsonb_build_object('ok', false, 'code', 'removal_already_verified');
  end if;
  select r.id into v_r from private.owner_recovery_requests r
   where r.id = v_w.request_id and r.status = 'pending' and r.expires_at > clock_timestamp() and r.cooloff_until <= clock_timestamp() for update;
  if not found then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'request_not_usable'));
    return jsonb_build_object('ok', false, 'code', 'request_not_usable');
  end if;
  select o.id, o.snapshot_factor_ids, o.expires_at into v_o
    from private.owner_factor_removal_orders o where o.window_id = v_w.id and o.status = 'ordered' and o.expires_at > clock_timestamp();
  if found then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'success', v_org, 'user', p_owner_user_id::text,
                                jsonb_build_object('order_id', v_o.id, 'window_id', v_w.id, 'repeat', true));
    return jsonb_build_object('ok', true, 'code', 'order_open', 'order_id', v_o.id, 'factor_ids', to_jsonb(v_o.snapshot_factor_ids), 'expires_at', v_o.expires_at);
  end if;
  v_ids := private.owner_verified_factor_ids(p_owner_user_id);
  if v_ids is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'unknown_state'));
    return jsonb_build_object('ok', false, 'code', 'unknown_state');
  end if;
  if cardinality(v_ids) = 0 then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'no_factors_to_remove'));
    return jsonb_build_object('ok', false, 'code', 'no_factors_to_remove');
  end if;
  begin
    insert into private.owner_factor_removal_orders (user_id, request_id, window_id, snapshot_factor_ids, ordered_by, expires_at)
    values (p_owner_user_id, v_w.request_id, v_w.id, v_ids, v_actor, v_w.expires_at)
    returning id into v_oid;
  exception
    when unique_violation then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'order_open'));
      return jsonb_build_object('ok', false, 'code', 'order_open');
    when sqlstate '23514' then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'order_rejected'));
      return jsonb_build_object('ok', false, 'code', 'order_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.begin', 'success', v_org, 'user', p_owner_user_id::text,
                              jsonb_build_object('order_id', v_oid, 'window_id', v_w.id, 'request_id', v_w.request_id, 'factors', cardinality(v_ids)));
  return jsonb_build_object('ok', true, 'code', 'order_created', 'order_id', v_oid, 'factor_ids', to_jsonb(v_ids), 'expires_at', v_w.expires_at);
end;
$$;

-- OPERATOR. rev6: FACTOR-REMOVAL ORDER, step 2 of 2. Takes ONLY the order id: NO count, NO evidence, NOTHING the caller states is used. The database reads the factor state itself and completes the order only if
-- it reads NO verified factor for the owner (the order guard re-reads it as well). A verified factor that is not in the snapshot makes the order FAILED (stale: a new order is needed); a snapshot factor still
-- present is a refused attempt (at most 5, then FAILED); an unknown factor state refuses without consuming an attempt. On success the order, the WINDOW (removal verified) and, once, the REQUEST (marker) are
-- recorded together. Idempotent: completing a completed order returns the stored result. This verifies the OUTCOME only: not who removed what, through which interface, or that no other user was affected.
create function public.rpc_staff_complete_factor_removal(p_order_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_user  uuid;
  v_o     record;
  v_ids   uuid[];
  v_now   timestamptz;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_factor_removal.complete', true, 'owner_factor_removal_order', p_order_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_order_id is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select o.user_id into v_user from private.owner_factor_removal_orders o where o.id = p_order_id;
  if v_user is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.complete', 'denied', null, 'owner_factor_removal_order', p_order_id::text, jsonb_build_object('reason', 'order_not_found'));
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_user::text, 0));   -- (2)
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || v_user::text, 0));     -- (3)
  perform private.close_expired_recovery_requests(v_user, v_actor, 'staff');

  select o.id, o.status, o.window_id, o.request_id, o.snapshot_factor_ids, o.attempts into v_o
    from private.owner_factor_removal_orders o where o.id = p_order_id for update;
  if v_o.status = 'completed' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.complete', 'success', null, 'owner_factor_removal_order', p_order_id::text, jsonb_build_object('order_id', p_order_id, 'repeat', true));
    return jsonb_build_object('ok', true, 'code', 'already_completed');
  end if;
  if v_o.status <> 'ordered' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.complete', 'denied', null, 'owner_factor_removal_order', p_order_id::text, jsonb_build_object('reason', 'order_not_open', 'status', v_o.status));
    return jsonb_build_object('ok', false, 'code', 'order_not_open');
  end if;
  if not exists (select 1 from private.owner_mfa_windows w
                  where w.id = v_o.window_id and w.consumed_at is null and w.revoked_at is null and w.expires_at > clock_timestamp()) then
    update private.owner_factor_removal_orders set status = 'cancelled' where id = p_order_id;
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.complete', 'denied', null, 'owner_factor_removal_order', p_order_id::text, jsonb_build_object('reason', 'window_not_open'));
    return jsonb_build_object('ok', false, 'code', 'window_not_open');
  end if;

  v_ids := private.owner_verified_factor_ids(v_user);
  if v_ids is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.complete', 'denied', null, 'owner_factor_removal_order', p_order_id::text, jsonb_build_object('reason', 'unknown_state'));
    return jsonb_build_object('ok', false, 'code', 'unknown_state');
  end if;
  if cardinality(v_ids) > 0 then
    if exists (select 1 from unnest(v_ids) as i(fid) where i.fid <> all (v_o.snapshot_factor_ids)) then
      update private.owner_factor_removal_orders set status = 'failed' where id = p_order_id;
      perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.complete', 'denied', null, 'owner_factor_removal_order', p_order_id::text, jsonb_build_object('reason', 'factor_set_changed'));
      return jsonb_build_object('ok', false, 'code', 'factor_set_changed');
    end if;
    if v_o.attempts + 1 >= 5 then
      update private.owner_factor_removal_orders set status = 'failed' where id = p_order_id;
    else
      update private.owner_factor_removal_orders set attempts = attempts + 1 where id = p_order_id;
    end if;
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.complete', 'denied', null, 'owner_factor_removal_order', p_order_id::text,
                                jsonb_build_object('reason', 'factors_still_present', 'remaining', cardinality(v_ids), 'attempts', v_o.attempts + 1));
    return jsonb_build_object('ok', false, 'code', 'factors_still_present');
  end if;

  v_now := clock_timestamp();
  begin
    update private.owner_factor_removal_orders set status = 'completed', completed_by = v_actor, completed_at = v_now where id = p_order_id;
    update private.owner_mfa_windows set removal_verified_at = v_now, removal_verified_by = v_actor, removal_method = 'manual' where id = v_o.window_id;
    update private.owner_recovery_requests set factors_removed_at = v_now, factors_removed_by = v_actor where id = v_o.request_id and factors_removed_at is null;
  exception when sqlstate '23514' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.complete', 'denied', null, 'owner_factor_removal_order', p_order_id::text, jsonb_build_object('reason', 'completion_rejected'));
    return jsonb_build_object('ok', false, 'code', 'completion_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_removal.complete', 'success', null, 'owner_factor_removal_order', p_order_id::text,
                              jsonb_build_object('order_id', p_order_id, 'window_id', v_o.window_id, 'request_id', v_o.request_id, 'snapshot', cardinality(v_o.snapshot_factor_ids)));
  return jsonb_build_object('ok', true, 'code', 'completed');
end;
$$;

-- OPERATOR. rev7 (F5): UNRECOGNIZED-FACTOR ORDER, step 1 of 2. The sanctioned way out when a factor row that the database cannot classify (status or type outside the recognized sets, or null) makes the
-- owner's factor state UNKNOWN and blocks every window and every removal order. The operator (capability, FRESH step-up) names the owner AND the factor id (explicit confirmation of both); the
-- DATABASE confirms that this row belongs to this owner and is 'unrecognized' under a fresh passing structure check (a recognized row is refused: it follows the normal workflow; the unknown row is never
-- treated as verified or as empty). Reason text lives in the order row only. Idempotent: an open order for the same factor is returned again. Takes only lock (2).
create function public.rpc_staff_begin_unrecognized_factor_removal(p_owner_user_id uuid, p_factor_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_gate   text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_org    uuid;
  v_class  text;
  v_o      record;
  v_oid    uuid;
  v_exp    timestamptz := clock_timestamp() + interval '60 minutes';
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_unrecognized_factor.begin', true, 'user', p_owner_user_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_owner_user_id is null or p_factor_id is null or char_length(v_reason) not between 1 and 200 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_owner_user_id = v_actor then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'self_change_not_allowed'));
    return jsonb_build_object('ok', false, 'code', 'self_change_not_allowed');
  end if;
  select m.organization_id into v_org from public.organization_members m
   where m.user_id = p_owner_user_id and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
  if v_org is null or exists (select 1 from public.staff_members s where s.user_id = p_owner_user_id) then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'denied', null, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'target_not_eligible'));
    return jsonb_build_object('ok', false, 'code', 'target_not_eligible');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)
  perform private.close_expired_recovery_requests(p_owner_user_id, v_actor, 'staff');

  if not private.auth_structure_ok() then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'structure_check_required'));
    return jsonb_build_object('ok', false, 'code', 'structure_check_required');
  end if;
  v_class := private.owner_factor_row_class(p_owner_user_id, p_factor_id);
  if v_class is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'unknown_state'));
    return jsonb_build_object('ok', false, 'code', 'unknown_state');
  end if;
  if v_class <> 'unrecognized' then
    -- 'recognized' follows the normal workflow; 'absent' and 'other_owner' return the same code (no disclosure of other owners' rows); the audit row keeps the exact reason
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'denied', v_org, 'user', p_owner_user_id::text,
                                jsonb_build_object('reason', case when v_class = 'recognized' then 'factor_recognized' else 'factor_not_found' end, 'factor_id', p_factor_id, 'class', v_class));
    return jsonb_build_object('ok', false, 'code', case when v_class = 'recognized' then 'factor_recognized' else 'factor_not_found' end);
  end if;
  select o.id, o.factor_id, o.expires_at into v_o
    from private.owner_unrecognized_factor_orders o where o.user_id = p_owner_user_id and o.status = 'ordered' and o.expires_at > clock_timestamp() for update;
  if found then
    if v_o.factor_id = p_factor_id then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'success', v_org, 'user', p_owner_user_id::text,
                                  jsonb_build_object('order_id', v_o.id, 'factor_id', p_factor_id, 'repeat', true));
      return jsonb_build_object('ok', true, 'code', 'order_open', 'order_id', v_o.id, 'factor_id', p_factor_id, 'expires_at', v_o.expires_at);
    end if;
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'order_open', 'order_id', v_o.id));
    return jsonb_build_object('ok', false, 'code', 'order_open');
  end if;
  begin
    insert into private.owner_unrecognized_factor_orders (user_id, factor_id, reason, ordered_by, expires_at)
    values (p_owner_user_id, p_factor_id, v_reason, v_actor, v_exp)
    returning id into v_oid;
  exception
    when unique_violation then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'order_open'));
      return jsonb_build_object('ok', false, 'code', 'order_open');
    when sqlstate '23514' then
      perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'denied', v_org, 'user', p_owner_user_id::text, jsonb_build_object('reason', 'order_rejected'));
      return jsonb_build_object('ok', false, 'code', 'order_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.begin', 'success', v_org, 'user', p_owner_user_id::text,
                              jsonb_build_object('order_id', v_oid, 'factor_id', p_factor_id));
  return jsonb_build_object('ok', true, 'code', 'order_created', 'order_id', v_oid, 'factor_id', p_factor_id, 'expires_at', v_exp);
end;
$$;

-- OPERATOR. rev7 (F5): UNRECOGNIZED-FACTOR ORDER, step 2 of 2. Takes ONLY the order id. The database re-reads the factor row itself and completes the order only if the row is ABSENT now (the guard
-- re-reads it again). A row that is still present (or belongs to someone else, or cannot be read) is a refused, audited attempt. Idempotent. This verifies the OUTCOME only (the row is gone); it does
-- not verify who removed it, and it does not by itself make the owner's state readable: another unrecognized row needs its own order, and the window workflow starts afterwards.
create function public.rpc_staff_complete_unrecognized_factor_removal(p_order_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_gate  text;
  v_user  uuid;
  v_o     record;
  v_class text;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  v_gate := private.staff_gate('owner.mfa.authorize', 'staff.owner_unrecognized_factor.complete', true, 'owner_unrecognized_factor_order', p_order_id::text);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'code', v_gate); end if;
  if p_order_id is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  select o.user_id into v_user from private.owner_unrecognized_factor_orders o where o.id = p_order_id;
  if v_user is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.complete', 'denied', null, 'owner_unrecognized_factor_order', p_order_id::text, jsonb_build_object('reason', 'order_not_found'));
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || v_user::text, 0));   -- (2)
  perform private.close_expired_recovery_requests(v_user, v_actor, 'staff');
  select o.id, o.status, o.factor_id into v_o from private.owner_unrecognized_factor_orders o where o.id = p_order_id for update;
  if v_o.status = 'completed' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.complete', 'success', null, 'owner_unrecognized_factor_order', p_order_id::text, jsonb_build_object('order_id', p_order_id, 'repeat', true));
    return jsonb_build_object('ok', true, 'code', 'already_completed');
  end if;
  if v_o.status <> 'ordered' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.complete', 'denied', null, 'owner_unrecognized_factor_order', p_order_id::text, jsonb_build_object('reason', 'order_not_open', 'status', v_o.status));
    return jsonb_build_object('ok', false, 'code', 'order_not_open');
  end if;
  v_class := private.owner_factor_row_class(v_user, v_o.factor_id);
  if v_class is null then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.complete', 'denied', null, 'owner_unrecognized_factor_order', p_order_id::text, jsonb_build_object('reason', 'unknown_state'));
    return jsonb_build_object('ok', false, 'code', 'unknown_state');
  end if;
  if v_class <> 'absent' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.complete', 'denied', null, 'owner_unrecognized_factor_order', p_order_id::text, jsonb_build_object('reason', 'factor_still_present', 'class', v_class));
    return jsonb_build_object('ok', false, 'code', 'factor_still_present');
  end if;
  begin
    update private.owner_unrecognized_factor_orders set status = 'completed', completed_by = v_actor, completed_at = clock_timestamp() where id = p_order_id;
  exception when sqlstate '23514' then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.complete', 'denied', null, 'owner_unrecognized_factor_order', p_order_id::text, jsonb_build_object('reason', 'completion_rejected'));
    return jsonb_build_object('ok', false, 'code', 'completion_rejected');
  end;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_unrecognized_factor.complete', 'success', null, 'owner_unrecognized_factor_order', p_order_id::text,
                              jsonb_build_object('order_id', p_order_id, 'factor_id', v_o.factor_id));
  return jsonb_build_object('ok', true, 'code', 'completed');
end;
$$;

-- ANY ACTIVE STAFF MEMBER OR ACTIVE ORGANIZATION OWNER. rev7 (F7): EXPLICIT STRUCTURE-CHECK REFRESH, independent of staff dashboard activity (rev6 relied on rpc_my_staff_context of 0004, which acts only for an
-- active staff caller). The refresh takes NO ARGUMENT and the result is computed by the existing private.run_auth_structure_check() of 0002 from the catalogs: a caller can neither supply nor influence the
-- result, and the function only records what is true. FAIL CLOSED: it never turns a failure into a pass. RATE LIMITED three ways: (1) only an active staff member or an active organization owner may call
-- it, everyone else gets 'not_available' and no counter row is written; (2) per user 6 calls per hour (bucket structure_refresh); (3) GLOBALLY by the database: the check runs only when no passed check
-- younger than 12 hours and no check of any outcome younger than 15 minutes exists (the same rule as rpc_my_staff_context, serialized by the SAME advisory lock, re-checked under the lock), so a caller
-- can never replace a fresh passing check by a later failing one, and the check runs at most once per 15 minutes however many callers exist. No staff session, aal2 or step-up is required (the
-- callers are exactly the people who are locked out when the check is stale). A run is audited (staff or organization_user actor, the result only); a no-op call is not audited (high volume, bounded by
-- the per-user limit; the counter row records it). Lock: this RPC takes only the leaf lock p2:structure_check_refresh and never any of (1) to (3).
create function public.rpc_refresh_auth_structure_check() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_kind  text;
  v_org   uuid;
  v_hit   jsonb;
  v_res   text;
begin
  perform private.require_read_committed();   -- rev5 (F1)
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_members s where s.user_id = v_actor and s.status = 'active') then
    v_kind := 'staff';
  else
    select m.organization_id into v_org from public.organization_members m
     where m.user_id = v_actor and m.status = 'active' and m.role = 'owner' order by m.organization_id limit 1;
    if v_org is not null then v_kind := 'organization_user'; end if;
  end if;
  if v_kind is null then
    return jsonb_build_object('ok', false, 'code', 'not_available');
  end if;
  v_hit := private.rate_limit_hit('structure_refresh', private.rl_user_key('structure_refresh'));
  if not coalesce((v_hit ->> 'allowed')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited', 'retry_after_secs', (v_hit ->> 'retry_after_secs')::integer);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('p2:structure_check_refresh', 0));   -- leaf lock, the same key as rpc_my_staff_context of 0004
  if exists (select 1 from private.platform_validations v
              where v.check_name = 'auth_mfa_factors_shape' and v.checked_at <= now()
                and ((v.status = 'passed' and v.checked_at > now() - interval '12 hours') or v.checked_at > now() - interval '15 minutes')) then
    return jsonb_build_object('ok', true, 'code', 'not_needed');
  end if;
  v_res := private.run_auth_structure_check();
  perform private.write_audit(v_actor, v_kind, 'platform.structure_check.refresh', case when v_res = 'passed' then 'success' else 'failed' end, v_org,
                              'platform_check', 'auth_mfa_factors_shape', jsonb_build_object('result', v_res, 'caller', v_kind));
  return jsonb_build_object('ok', true, 'code', 'refreshed', 'result', v_res);
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
  -- rev6: without a fresh passing structure check every owner reads as 'unknown' and would silently drop out of this review; the review REFUSES instead of reporting an empty or partial list
  if not private.auth_structure_ok() then
    perform private.write_audit(v_actor, 'staff', 'staff.owner_factor_loss.review', 'denied', null, 'owner_factor_loss', null, jsonb_build_object('reason', 'structure_check_required'));
    return jsonb_build_object('ok', false, 'code', 'structure_check_required');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'category', c.category, 'since', c.since) order by c.since desc nulls last), '[]'::jsonb)
    into v_rows
    from (select s.user_id,
                 case when s.anchor is not null then 'stranded' else 'unexplained' end as category,
                 coalesce(ar.factors_removed_at, ar.created_at, lr.created_at) as since
            from (select h.user_id, private.owner_factor_state(h.user_id) as st, private.owner_stranded_request(h.user_id) as anchor
                    from (select distinct a.user_id from private.owner_mfa_factors a) h) s
            left join lateral (select r.status, r.created_at, r.factors_removed_at from private.owner_recovery_requests r
                                where r.user_id = s.user_id order by r.created_at desc limit 1) lr on true
            left join private.owner_recovery_requests ar on ar.id = s.anchor
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
  v_ver := cardinality(private.owner_verified_factor_ids(p_owner_user_id));   -- rev6: NULL (JSON null) means UNKNOWN, never zero
  select r.id, r.origin, r.status, r.created_at, r.initiated_by, r.verification_method, r.verification_ref, r.notarized_supplement, r.approved_by, r.approved_at,
         r.second_verification_method, r.second_verification_ref, r.second_notarized_supplement, r.cooloff_until, r.expires_at, r.windows_issued,
         r.factors_removed_at, r.extra_windows_granted, r.exception_id into v_req
    from private.owner_recovery_requests r where r.user_id = p_owner_user_id order by r.created_at desc limit 1;
  perform private.write_audit(v_actor, 'staff', 'staff.owner_mfa.overview', 'success', null, 'user', p_owner_user_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'factor_state', v_state, 'verified_factor_count', v_ver,
    'recovery_request', case when v_req.id is null then null
      else jsonb_build_object('id', v_req.id, 'origin', v_req.origin, 'status', v_req.status, 'created_at', v_req.created_at,
             'initiated_by', v_req.initiated_by, 'method', v_req.verification_method, 'ref', v_req.verification_ref, 'notarized_supplement', v_req.notarized_supplement,
             'approved_by', v_req.approved_by, 'approved_at', v_req.approved_at, 'second_method', v_req.second_verification_method, 'second_ref', v_req.second_verification_ref,
             'second_notarized_supplement', v_req.second_notarized_supplement,
             'cooloff_until', v_req.cooloff_until, 'expires_at', v_req.expires_at, 'windows_issued', v_req.windows_issued,
             'factors_removed_at', v_req.factors_removed_at, 'extra_windows_granted', v_req.extra_windows_granted, 'exception_id', v_req.exception_id,
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
    -- rev7 (F3): stranded is the database-confirmed anchor (latest removal evidence), not the owner's latest request; a pending request that has expired but is not yet closed (this function is
    -- read-only and closes nothing) still counts when it carries a verified removal
    elsif v_state = 'recovery_required'
          and (private.owner_stranded_request(v_actor) is not null
               or (v_req.status = 'pending' and v_req.expires_at <= clock_timestamp() and v_req.factors_removed_at is not null)) then
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
                    private.owner_recovery_codes, private.owner_recovery_requests,
                    private.owner_recovery_exceptions, private.owner_factor_removal_orders, private.owner_unrecognized_factor_orders
  from public, anon, authenticated, service_role;

revoke all on function private.rate_limit_hit(text, bytea), private.rate_limit_clear(text, bytea), private.consume_nonce(text, bytea, integer),
                       private.owner_mfa_ok(), private.my_mfa_owner_org_ids(), private.owner_factor_state(uuid), private.rl_user_key(text),
                       private.close_expired_recovery_requests(uuid, uuid, text), private.revoke_request_windows(uuid, uuid, uuid, text, text),
                       private.require_read_committed(), private.owner_mfa_operator_ok(uuid), private.owner_has_history(uuid),
                       private.auth_structure_ok(), private.owner_verified_factor_ids(uuid), private.owner_stranded_request(uuid),
                       private.guard_owner_mfa_window_insert(), private.guard_owner_mfa_window_update(),
                       private.guard_owner_mfa_factor_insert(), private.guard_owner_mfa_factor_update(),
                       private.guard_owner_recovery_code_update(), private.guard_owner_recovery_request_insert(), private.guard_owner_recovery_request_update(),
                       private.guard_owner_recovery_exception_insert(), private.guard_owner_recovery_exception_update(),
                       private.guard_owner_factor_removal_order_insert(), private.guard_owner_factor_removal_order_update(),
                       private.owner_factor_row_class(uuid, uuid), private.guard_owner_unrecognized_order_insert(), private.guard_owner_unrecognized_order_update()
  from public, anon, authenticated, service_role;
-- The policies above call private.my_mfa_owner_org_ids() as the querying role, exactly like my_org_ids() in 0001: it must be executable.
grant execute on function private.my_mfa_owner_org_ids() to authenticated;
-- The MFA-less owner function of 0001 is no longer used by any policy (the only two users were altered above). Removing its grant makes sure no future
-- policy can pick it up by mistake and bypass owner MFA: new owner-scoped policies must use my_mfa_owner_org_ids().
revoke execute on function private.my_owner_org_ids() from authenticated;

-- No grant to service_role anywhere: no RPC of this file depends on, or can be called with, the service-role key (no factor-removal broker exists in this revision).
revoke all on function public.rpc_throttle_password_recovery(bytea, bytea), public.rpc_my_owner_context(uuid),
                       public.rpc_owner_open_factor_window(), public.rpc_owner_claim_factor(uuid), public.rpc_owner_revoke_factor_window(),
                       public.rpc_owner_set_recovery_codes(bytea[]), public.rpc_owner_recovery_request(bytea), public.rpc_owner_recovery_cancel(),
                       public.rpc_staff_authorize_owner_mfa_window(uuid, text, integer), public.rpc_staff_revoke_owner_mfa_window(uuid, text),
                       public.rpc_staff_owner_mfa_overview(uuid), public.rpc_staff_initiate_owner_recovery(uuid, text, text, text, boolean, uuid),
                       public.rpc_staff_approve_owner_recovery(uuid, text, text, text, boolean), public.rpc_staff_cancel_owner_recovery(uuid, text),
                       public.rpc_staff_list_owner_factor_loss(),
                       public.rpc_staff_authorize_extra_recovery_window(uuid, text, integer),
                       public.rpc_staff_request_stranded_exception(uuid, text), public.rpc_staff_grant_stranded_exception(uuid, text), public.rpc_staff_cancel_stranded_exception(uuid),
                       public.rpc_staff_begin_factor_removal(uuid), public.rpc_staff_complete_factor_removal(uuid),
                       public.rpc_staff_begin_unrecognized_factor_removal(uuid, uuid, text), public.rpc_staff_complete_unrecognized_factor_removal(uuid),
                       public.rpc_refresh_auth_structure_check()
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_throttle_password_recovery(bytea, bytea) to anon, authenticated;
grant execute on function public.rpc_my_owner_context(uuid), public.rpc_owner_open_factor_window(), public.rpc_owner_claim_factor(uuid), public.rpc_owner_revoke_factor_window(),
                          public.rpc_owner_set_recovery_codes(bytea[]), public.rpc_owner_recovery_request(bytea), public.rpc_owner_recovery_cancel(),
                          public.rpc_staff_authorize_owner_mfa_window(uuid, text, integer), public.rpc_staff_revoke_owner_mfa_window(uuid, text),
                          public.rpc_staff_owner_mfa_overview(uuid), public.rpc_staff_initiate_owner_recovery(uuid, text, text, text, boolean, uuid),
                          public.rpc_staff_approve_owner_recovery(uuid, text, text, text, boolean), public.rpc_staff_cancel_owner_recovery(uuid, text),
                          public.rpc_staff_list_owner_factor_loss(),
                          public.rpc_staff_authorize_extra_recovery_window(uuid, text, integer),
                          public.rpc_staff_request_stranded_exception(uuid, text), public.rpc_staff_grant_stranded_exception(uuid, text), public.rpc_staff_cancel_stranded_exception(uuid),
                          public.rpc_staff_begin_factor_removal(uuid), public.rpc_staff_complete_factor_removal(uuid),
                          public.rpc_staff_begin_unrecognized_factor_removal(uuid, uuid, text), public.rpc_staff_complete_unrecognized_factor_removal(uuid),
                          public.rpc_refresh_auth_structure_check()
  to authenticated;

-- 7. Self-checks -------------------------------------------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
  f text;
begin
  foreach t in array array['private.rate_limit_policies', 'private.rate_limits', 'private.used_nonces', 'private.owner_mfa_windows', 'private.owner_mfa_factors',
                           'private.owner_recovery_codes', 'private.owner_recovery_requests', 'private.owner_recovery_exceptions', 'private.owner_factor_removal_orders',
                           'private.owner_unrecognized_factor_orders'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then raise exception 'self-check: RLS not enabled on %', t; end if;
    foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) or has_table_privilege('service_role', t, p) then
        raise exception 'self-check: an API role has % on %', p, t;
      end if;
    end loop;
  end loop;
  if (select count(*) from private.rate_limit_policies) <> 9 then raise exception 'self-check: expected 9 rate limit policies'; end if;
  if not exists (select 1 from private.rate_limit_policies where bucket = 'structure_refresh' and max_attempts = 6 and window_secs = 3600 and block_secs = 3600) then
    raise exception 'self-check: the structure_refresh bucket must be 6 per hour';
  end if;
  if not exists (select 1 from private.rate_limit_policies where bucket = 'password_recovery' and max_attempts = 1 and window_secs = 600 and block_secs = 600) then
    raise exception 'self-check: the per-email bucket must be the 10 minute cool-down (non-blocking design)';
  end if;
  if not exists (select 1 from private.rate_limit_policies where bucket = 'operator_recovery_initiate' and max_attempts = 5 and window_secs = 86400)
     or not exists (select 1 from private.rate_limit_policies where bucket = 'operator_recovery_target' and max_attempts = 2 and window_secs = 604800) then
    raise exception 'self-check: operator recovery quotas must be 5 per operator per 24 hours and 2 per owner per 7 days';
  end if;
  if exists (select 1 from private.rate_limits) or exists (select 1 from private.used_nonces) or exists (select 1 from private.owner_mfa_windows)
     or exists (select 1 from private.owner_mfa_factors) or exists (select 1 from private.owner_recovery_codes) or exists (select 1 from private.owner_recovery_requests)
     or exists (select 1 from private.owner_recovery_exceptions) or exists (select 1 from private.owner_factor_removal_orders)
     or exists (select 1 from private.owner_unrecognized_factor_orders) then
    raise exception 'self-check: counters, windows, approvals, recovery codes, requests, exceptions and removal orders must be empty at install';
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
    where n.nspname = 'private' and not coalesce((select bool_or(c ilike 'search_path=%') from unnest(pr.proconfig) c), false)
  ) then raise exception 'self-check: function without pinned search_path in schema private'; end if;
  -- only the approved private functions are executable by authenticated (my_owner_org_ids was revoked above)
  if exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', pr.oid, 'execute')
      and pr.proname not in ('my_org_ids', 'staff_session_ok', 'has_capability', 'my_mfa_owner_org_ids')
  ) then raise exception 'self-check: unexpected EXECUTE grant to authenticated in schema private (my_owner_org_ids must be revoked)'; end if;
  if exists (select 1 from pg_policies where qual ilike '%my\_owner\_org\_ids%' or with_check ilike '%my\_owner\_org\_ids%') then
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
  -- the twenty-four RPCs of this file: SECURITY DEFINER, pinned search_path, no anon (except the throttle), no service_role (no service-role dependency exists), no PUBLIC
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public'
         and pr.proname in ('rpc_throttle_password_recovery', 'rpc_my_owner_context', 'rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_revoke_factor_window',
                            'rpc_owner_set_recovery_codes', 'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel', 'rpc_staff_authorize_owner_mfa_window',
                            'rpc_staff_revoke_owner_mfa_window', 'rpc_staff_owner_mfa_overview', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery',
                            'rpc_staff_cancel_owner_recovery', 'rpc_staff_list_owner_factor_loss', 'rpc_staff_authorize_extra_recovery_window',
                            'rpc_staff_request_stranded_exception', 'rpc_staff_grant_stranded_exception', 'rpc_staff_cancel_stranded_exception',
                            'rpc_staff_begin_factor_removal', 'rpc_staff_complete_factor_removal',
                            'rpc_staff_begin_unrecognized_factor_removal', 'rpc_staff_complete_unrecognized_factor_removal', 'rpc_refresh_auth_structure_check')
         and pr.prosecdef and has_function_privilege('authenticated', pr.oid, 'execute')
         and not has_function_privilege('service_role', pr.oid, 'execute') and not has_function_privilege('public', pr.oid, 'execute')
         and (pr.proname = 'rpc_throttle_password_recovery' or not has_function_privilege('anon', pr.oid, 'execute'))
         and exists (select 1 from unnest(pr.proconfig) c where regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$')) <> 24 then
    raise exception 'self-check: RPC definer/search_path/grant state is wrong';
  end if;
  -- rev5 (F1): every mutating recovery RPC (all except the anon throttle and the read-only owner context) calls the READ COMMITTED guard
  if (select count(*) from (select pr.oid from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                             where n.nspname = 'public' and pr.prokind = 'f'
                               and pr.proname in ('rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_revoke_factor_window', 'rpc_owner_set_recovery_codes',
                                                  'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel', 'rpc_staff_authorize_owner_mfa_window', 'rpc_staff_revoke_owner_mfa_window',
                                                  'rpc_staff_owner_mfa_overview', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery',
                                                  'rpc_staff_cancel_owner_recovery', 'rpc_staff_list_owner_factor_loss', 'rpc_staff_authorize_extra_recovery_window',
                                                  'rpc_staff_request_stranded_exception', 'rpc_staff_grant_stranded_exception', 'rpc_staff_cancel_stranded_exception',
                                                  'rpc_staff_begin_factor_removal', 'rpc_staff_complete_factor_removal',
                                                  'rpc_staff_begin_unrecognized_factor_removal', 'rpc_staff_complete_unrecognized_factor_removal', 'rpc_refresh_auth_structure_check')
                             offset 0) cand
       where pg_get_functiondef(cand.oid) ~* 'private\.require_read_committed\(\)') <> 22 then
    raise exception 'self-check: a mutating recovery RPC does not call private.require_read_committed()';
  end if;
  -- rev6: FAIL-CLOSED FACTOR READS. The state, the MFA predicate, the factor gate and the window gate must go through the structure-checked helpers; and NO other owner-path function may read
  -- auth.mfa_factors directly (comments are removed before the test). The only direct readers are the helper, the state function, the MFA predicate and the factor gate (the row of the factor itself).
  -- rev7 (F2): every text assertion on deparsed catalog output is case-insensitive (~*, ilike) or normalized; none depends on the case or the spacing PostgreSQL happens to print
  if pg_get_functiondef('private.owner_mfa_ok()'::regprocedure) !~* 'private\.auth_structure_ok\(\)'
     or pg_get_functiondef('private.owner_factor_state(uuid)'::regprocedure) !~* 'private\.owner_verified_factor_ids'
     or pg_get_functiondef('private.owner_verified_factor_ids(uuid)'::regprocedure) !~* 'private\.auth_structure_ok\(\)'
     or pg_get_functiondef('private.owner_factor_row_class(uuid, uuid)'::regprocedure) !~* 'private\.auth_structure_ok\(\)'
     or pg_get_functiondef('private.guard_owner_mfa_factor_insert()'::regprocedure) !~* 'private\.owner_verified_factor_ids'
     or pg_get_functiondef('private.guard_owner_mfa_window_insert()'::regprocedure) !~* 'private\.owner_verified_factor_ids'
     or pg_get_functiondef('private.guard_owner_factor_removal_order_update()'::regprocedure) !~* 'private\.owner_verified_factor_ids'
     or pg_get_functiondef('private.guard_owner_unrecognized_order_insert()'::regprocedure) !~* 'private\.owner_factor_row_class'
     or pg_get_functiondef('private.guard_owner_unrecognized_order_update()'::regprocedure) !~* 'private\.owner_factor_row_class' then
    raise exception 'self-check: an owner factor read does not go through the structure-checked fail-closed helpers';
  end if;
  -- rev7 (F1): the factor limit counts LIVE approved factors (rows whose factor is in the verified id list); the lifetime count of rev6 must be gone
  if pg_get_functiondef('private.guard_owner_mfa_factor_insert()'::regprocedure) !~* 'a\.factor_id\s*=\s*any\s*\(\s*v_ids\s*\)'
     or pg_get_functiondef('private.guard_owner_mfa_factor_insert()'::regprocedure) ~* 'too many approved factors' then
    raise exception 'self-check: the approved factor limit must be evaluated over live verified factors only';
  end if;
  if exists (select 1 from (select pr.oid, pr.proname from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                             where n.nspname in ('public', 'private') and pr.prokind = 'f'
                               and pr.proname like any (array['rpc_owner_%', 'rpc_staff_%owner%', 'rpc_staff_%stranded%', 'rpc_staff_%factor_removal%', 'rpc_staff_%unrecognized%', 'rpc_refresh_%', 'owner_%', 'guard_owner_%', 'close_expired_%', 'revoke_request_%'])
                               and pr.proname not in ('owner_verified_factor_ids', 'owner_factor_state', 'owner_mfa_ok', 'guard_owner_mfa_factor_insert', 'owner_factor_row_class')
                             offset 0) cand
              where regexp_replace(pg_get_functiondef(cand.oid), '-{2}[^\n]*', '', 'g') ~* 'auth\.mfa_factors') then
    raise exception 'self-check: an owner-path function reads auth.mfa_factors outside the fail-closed helpers';
  end if;
  -- rev5 (F6) and rev6: retention. Thirteen foreign keys among the seven owner tables, every one ON DELETE RESTRICT (seven reference auth.users); none may cascade or default to no action
  if (select count(*) from pg_constraint c where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
        and c.conrelid in ('private.owner_mfa_factors'::regclass, 'private.owner_mfa_windows'::regclass, 'private.owner_recovery_codes'::regclass, 'private.owner_recovery_requests'::regclass,
                           'private.owner_recovery_exceptions'::regclass, 'private.owner_factor_removal_orders'::regclass, 'private.owner_unrecognized_factor_orders'::regclass)) <> 7
     or (select count(*) from pg_constraint c where c.contype = 'f'
           and c.conrelid in ('private.owner_mfa_factors'::regclass, 'private.owner_mfa_windows'::regclass, 'private.owner_recovery_codes'::regclass, 'private.owner_recovery_requests'::regclass,
                              'private.owner_recovery_exceptions'::regclass, 'private.owner_factor_removal_orders'::regclass, 'private.owner_unrecognized_factor_orders'::regclass)) <> 13
     or exists (select 1 from pg_constraint c where c.contype = 'f' and c.confdeltype <> 'r'
                  and c.conrelid in ('private.owner_mfa_factors'::regclass, 'private.owner_mfa_windows'::regclass, 'private.owner_recovery_codes'::regclass, 'private.owner_recovery_requests'::regclass,
                                     'private.owner_recovery_exceptions'::regclass, 'private.owner_factor_removal_orders'::regclass, 'private.owner_unrecognized_factor_orders'::regclass)) then
    raise exception 'self-check: owner MFA and recovery history must be protected by ON DELETE RESTRICT foreign keys (13 among the seven tables, 7 to auth.users; none may cascade)';
  end if;
  -- triggers: windows 3, factors 3, codes 2, requests 3, exceptions 3, removal orders 3 (insert guard, update guard, truncate where applicable)
  if (select count(*) from pg_trigger tg where tg.tgrelid in ('private.owner_mfa_factors'::regclass, 'private.owner_mfa_windows'::regclass,
        'private.owner_recovery_codes'::regclass, 'private.owner_recovery_requests'::regclass, 'private.owner_recovery_exceptions'::regclass,
        'private.owner_factor_removal_orders'::regclass, 'private.owner_unrecognized_factor_orders'::regclass) and not tg.tgisinternal) <> 20 then
    raise exception 'self-check: expected 20 triggers on the owner MFA and recovery tables';
  end if;
  -- the constraints that carry the approved rules must exist (two people, cool-off, history shape, evidence, five-window maximum, exception and order shape)
  if (select count(*) from pg_constraint where conname in (
        'owner_recovery_requests_two_person', 'owner_recovery_requests_cooloff', 'owner_recovery_requests_approval_group', 'owner_recovery_requests_independent_evidence',
        'owner_recovery_requests_awaiting_shape', 'owner_recovery_requests_pending_shape', 'owner_recovery_requests_expiry', 'owner_recovery_requests_windows_bounded',
        'owner_recovery_requests_removal_group', 'owner_recovery_requests_removal_state', 'owner_recovery_requests_exception_origin', 'owner_recovery_requests_id_user_key',
        'owner_recovery_requests_exception_fk',
        'owner_mfa_windows_authorizer', 'owner_mfa_windows_request_link', 'owner_mfa_windows_revocation_group', 'owner_mfa_windows_single_outcome',
        'owner_mfa_windows_factors_at_open', 'owner_mfa_windows_removal_group', 'owner_mfa_windows_removal_shape',
        'owner_recovery_exceptions_id_user_key', 'owner_recovery_exceptions_stranded_fk', 'owner_recovery_exceptions_two_person', 'owner_recovery_exceptions_grant_group',
        'owner_recovery_exceptions_status_shape', 'owner_recovery_exceptions_expiry', 'owner_recovery_exceptions_consumed_time',
        'owner_factor_removal_orders_request_fk', 'owner_factor_removal_orders_window_fk', 'owner_factor_removal_orders_bounded', 'owner_factor_removal_orders_completed_shape',
        'owner_unrecognized_factor_orders_bounded', 'owner_unrecognized_factor_orders_completed_shape')) <> 33 then
    raise exception 'self-check: an approved constraint is missing';
  end if;
  -- the five-window hard maximum is a CONSTRAINT, not only code
  if not exists (select 1 from pg_constraint c where c.conname = 'owner_recovery_requests_windows_bounded'
                    and regexp_replace(pg_get_constraintdef(c.oid), '\s+', ' ', 'g') ~* 'windows_issued\)?(::[a-z0-9 ]+)? <= 5'
                    and pg_get_constraintdef(c.oid) ~* 'greatest\s*\(' and pg_get_constraintdef(c.oid) ~* 'extra_windows_granted') then
    raise exception 'self-check: the five-window maximum constraint is wrong';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'owner_recovery_requests_one_open_idx' and schemaname = 'private')
     or not exists (select 1 from pg_indexes where indexname = 'owner_mfa_windows_one_open_idx' and schemaname = 'private')
     or not exists (select 1 from pg_indexes where indexname = 'owner_recovery_exceptions_one_open_idx' and schemaname = 'private')
     or exists (select 1 from pg_indexes where indexname = 'owner_recovery_exceptions_one_live_idx' and schemaname = 'private')
     or not exists (select 1 from pg_indexes where indexname = 'owner_unrecognized_factor_orders_one_open_idx' and schemaname = 'private')
     or not exists (select 1 from pg_indexes where indexname = 'owner_recovery_requests_exception_idx' and schemaname = 'private')
     or not exists (select 1 from pg_indexes where indexname = 'owner_factor_removal_orders_one_live_idx' and schemaname = 'private') then
    raise exception 'self-check: an open-request, open-window, exception or order unique index is missing';
  end if;
  -- the two owner policies use the MFA-aware function
  if (select count(*) from pg_policies where policyname in ('organization_billing_select_owner', 'organization_invites_select_owner')
        and qual ilike '%my\_mfa\_owner\_org\_ids%') <> 2 then
    raise exception 'self-check: owner policies were not updated';
  end if;
  -- RECOVERY CODES, REQUESTS, EXCEPTIONS AND ORDERS CAN NEVER GRANT PRIVILEGES: none of the functions that decide owner MFA, step-up or a staff session may mention recovery
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
                                                              'rpc_staff_approve_owner%', 'rpc_staff_cancel_owner%', 'rpc_staff_list_owner%', 'rpc_staff_authorize_extra%', 'rpc_staff_%stranded%',
                                                              'rpc_staff_%factor_removal%', 'rpc_staff_%unrecognized%', 'rpc_refresh_%', 'owner_%', 'guard_owner_%', 'close_expired_%', 'revoke_request_%', 'auth_structure_ok', 'rl_user_key',
                                                              'rpc_throttle_password_recovery', 'rpc_my_owner_context'])
                             offset 0) cand
              where pg_get_functiondef(cand.oid) ~* '(insert\s+into|update|delete\s+from)\s+auth\.') then
    raise exception 'self-check: a function writes to the auth schema';
  end if;
  if exists (select 1 from (select pr.oid from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                             where n.nspname in ('public', 'private') and pr.prokind = 'f'
                               and pr.proname like any (array['rpc_owner_%', 'rpc_staff_authorize_owner%', 'rpc_staff_revoke_owner%', 'rpc_staff_owner%', 'rpc_staff_initiate_owner%',
                                                              'rpc_staff_approve_owner%', 'rpc_staff_cancel_owner%', 'rpc_staff_list_owner%', 'rpc_staff_authorize_extra%', 'rpc_staff_%stranded%',
                                                              'rpc_staff_%factor_removal%', 'rpc_staff_%unrecognized%', 'rpc_refresh_%', 'owner_%', 'guard_owner_%', 'close_expired_%', 'revoke_request_%'])
                             offset 0) cand
              where pg_get_functiondef(cand.oid) ~* 'delete\s+from\s+private\.owner_') then
    raise exception 'self-check: a function deletes owner MFA or recovery history';
  end if;
end;
$$;
