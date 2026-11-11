# P2.4: rate limiting, owner MFA and the observed second-factor behavior

Status 2026-11-10. Design plus a **draft** migration (`supabase/review/0005_rate_limits_and_owner_mfa.sql`, never executed anywhere, not approved for hosted) and tested TypeScript. Decisions D-P24-3 (PostgreSQL-backed rate limits) and D-P24-4 (owners must use MFA) are approved.

## 1. Second-factor enrolment at AAL1: observed behavior (hosted Supabase Auth, 2026-11-10)
Method: two **dedicated disposable accounts** created for the test (and deleted afterwards), a fresh password-only session for each observation, TOTP codes computed in memory, no service-role key. The two existing validation accounts were never touched (row digests identical before and after). Results are **observed**, not assumed:

| # | Situation | Observed result |
|---|---|---|
| 1 | first TOTP factor, session aal1, no verified factor yet | **200**: allowed |
| 2 | a second factor while the session is **aal2** | **200**: allowed |
| 3 | a second TOTP factor at **aal1** while a verified factor exists | **403** `insufficient_aal`, "AAL2 required to enroll a new factor" |
| 4 | remove the only **verified** factor with a clean password-only **aal1** session | **422** `insufficient_aal`, "AAL2 required to unenroll verified factor"; the factor remained |
| 5 | challenge and verify an **already enrolled but unverified** factor (the caller holds its secret) at **aal1** | **200**, and the resulting token is **aal2** |
An earlier run of the test returned 200 for the removal in row 4: that result was **confounded** (the preceding step had upgraded the same session to aal2 on the server) and was repeated in a clean session; only the clean-session result is reported above.

### Consequences for the design
1. **Lost-device recovery cannot use Supabase Auth alone.** A recovery-code session is aal1 (row 3): it can neither enrol a replacement factor nor remove the lost one (row 4). Row 2 shows enrolling works at aal2 only. Therefore **controlled factor removal needs a database-side definer function** that deletes the user's factor rows after a valid recovery code (and the throttle) have been checked, followed by enrolment of the new factor and re-issuing of recovery codes. That function writes into `auth.mfa_factors` and **needs your explicit approval (D-P24-2)** before it is drafted into a migration. Staff keep the administrator-approved window path and never use recovery codes.
2. **Leftover unverified factors are a risk (row 5).** An unverified factor whose secret is still known (for example a user who enrolled a factor, saw the QR code and abandoned verification) can be verified at aal1 and upgrades the session to aal2. This does not allow an outsider to *create* a factor (row 3), so exploitation needs the secret of an abandoned enrolment. For **staff** the risk is closed by the approval binding (a newly verified factor is unapproved, so `staff_session_ok()` fails). For **organization owners** `private.owner_mfa_ok()` (aal2 + verified TOTP) would accept it. Mitigation (to implement in the P2.4 server flows, not a new database privilege): remove unverified factors older than 15 minutes whenever the owner is at aal2, and never leave an abandoned enrolment (cancel on navigation); consider requiring the TOTP `amr` entry to be recent for owner privileges (the 15-minute step-up already does this for the sensitive owner actions).
3. The 15-minute step-up (JWT `amr`) behaved as in the earlier V1–V3 evidence: a fresh verification produced the TOTP entry.

> **Superseded in part (rev2, 2026-11-10).** Review found that the owner rule below ("aal2 + a verified TOTP factor") is satisfiable by verifying an abandoned unverified factor at aal1 (row 5 above). Owner privileges now require an **approved** factor (window + trigger, same trust model as staff) and any unapproved verified factor denies the session. See `docs/P2-4-0005-SECURITY-REVIEW.md` (design, attack chain, residual risks). The statement in section 3 that an outsider "cannot target a victim's counter" holds only for direct RPC calls, not through the application (review residual 1). Recovery is designed separately in `docs/P2-4-RECOVERY-FACTOR-REMOVAL-DESIGN.md`.

## 2. Owner MFA (D-P24-4): design (rev1 text, kept for history)
**Rule.** An organization owner keeps the `owner` role in the data, but **owner privileges are only effective in a session that is aal2 and in which the user still has a verified TOTP factor.** Without that the owner has member-level access only. Ordinary members are never required to use MFA, except for actions that are themselves step-up actions (for example removing a factor).

**Database enforcement (0005 draft, not applied).**
- `private.owner_mfa_ok()`: the signed token must be `aal2` **and** `auth.mfa_factors` must still contain a verified TOTP factor for the caller (aal2 alone would outlive deletion of the factor until the token expires). Any error (for example drift of `auth.mfa_factors`) returns FALSE.
- `private.my_mfa_owner_org_ids()`: the organizations where the caller is an **active owner** AND `owner_mfa_ok()`. The two owner-only read policies of P2.1 (`organization_billing_select_owner`, `organization_invites_select_owner`) are altered to use it. All future owner RPCs (invitations, membership management, ownership transfer, onboarding submission) must derive authority from this function and call `private.step_up_ok()` where the registry requires step-up.
- `public.rpc_my_owner_context(org)`: `{is_owner, owner_mfa_ok, step_up_ok}` for the application server.

**Application layer (implemented, tested).** `permissions/owner.ts`: `evaluateOwnerAction` denies, in this order, unauthenticated, non-owner, **owner without MFA**, and missing step-up; `evaluateMemberAction` requires MFA only for step-up member actions; `parseOwnerContext` fails closed. 14 tests cover every owner action.
**What changes for existing data:** hosted has no organizations, so nothing is affected today.
**Open:** whether an owner without MFA should be able to *enrol* MFA from the owner screens (yes: enrolment is a member-level action) and a grace period for newly invited owners (not decided; the default is none).

## 3. Rate limiting (D-P24-3): schema and security design
**Buckets (seed in `private.rate_limit_policies`, immutable; changing a limit is a reviewed migration):**
| Bucket | Key | Limit | Block |
|---|---|---|---|
| `recovery_code` | user | 5 per 15 min | 15 min |
| `mfa_recovery` | user | 3 per hour | 1 h |
| `invite_accept` | user | 10 per hour | 1 h |
| `invite_accept_ip` | client address | 30 per hour | 1 h |
| `password_recovery` | email | 3 per hour | 1 h |
| `password_recovery_ip` | client address | 20 per hour | 1 h |
A block must outlast its window (a table constraint), so a blocked key cannot restart counting while still blocked.

**Tables (private schema, RLS enabled, no policy and no grant for any API role):** `rate_limits(bucket, key_hash bytea(32), window_start, attempts, blocked_until, updated_at)` primary key `(bucket, key_hash)`; `used_nonces(purpose, nonce_hash bytea(32), expires_at)` primary key `(purpose, nonce_hash)`.

**Atomicity.** `private.rate_limit_hit(bucket, key_hash)` counts with one `INSERT … ON CONFLICT DO UPDATE` that locks the key's row: concurrent attempts are serialized and none can slip past the limit. The attempt that exceeds the limit is itself denied; while blocked, attempts are denied and do **not** extend the block (no lockout amplification). Counting restarts only after the window passed and the block ended. Expired rows are deleted opportunistically (50 per call, `SKIP LOCKED`) so the table cannot grow without bound.
**Replay prevention.** `private.consume_nonce(purpose, nonce_hash, ttl)` returns TRUE exactly once per nonce until it expires (primary key decides; the conditional update only reuses an already expired row); single-use consumption of recovery codes and invitation tokens is additionally enforced by their own rows (`used_at`, `accepted_at`) under row locks.
**Hashed identifiers.** The database never receives an email, address or user id. The application sends `HMAC-SHA256(RATE_LIMIT_PEPPER, "p2:rl:v1:" + bucket + ":" + normalized identifier)`; an outsider cannot compute a victim's key (so cannot burn their attempts) and a copy of the table reveals no identifier. `RATE_LIMIT_PEPPER` is a **new server-only secret** (≥ 32 characters) that you would have to create; without it the key functions throw and the sensitive operation is **not** performed (fail closed).
**Where it is enforced.** Inside the SECURITY DEFINER RPCs of the flows that need it (recovery, invitation acceptance), so it never depends on the browser. Password recovery runs before sign-in, so it has the **single anon-executable function** of the whole design, `public.rpc_throttle_password_recovery(email_hash, ip_hash)`: it takes two opaque hashes, counts both keys, returns only `{allowed, retry_after_secs}`.
**Residual risks (documented):** an outsider can create counter rows with random keys (bounded by expiry and opportunistic cleanup; platform request limits still apply); a shared NAT address can hit the per-address bucket for its users (the limits are generous for that reason); if the pepper leaks, keys become computable (rotate it; counters then reset).
**Tests.** TypeScript: policy parity with the SQL seed, key derivation (deterministic, bucket separation, secret dependence, normalization, rejection of malformed input), fail-closed parsing of throttle results. Database behavior (atomic counting under concurrency, window and block timing, replay) is **not yet tested** and needs the rolled-back execution and then hosted tests after approval.

## 4. D-P22-3 implementation check (approved option C)
| Requirement | Where it is met (migration 0004 draft, `rpc_my_staff_context`) |
|---|---|
| refresh only from the active staff context workflow | the refresh sits inside `rpc_my_staff_context` and runs only when `staff_members.status = 'active'` for the caller |
| advisory lock and re-check after the lock | `pg_advisory_xact_lock(hashtextextended('p2:structure_check_refresh', 0))`, then the whole condition is evaluated again |
| only when the approved time conditions hold | no `passed` check younger than 12 h **and** no check of any outcome in the last 15 min |
| a failed structure check denies staff immediately | `run_auth_structure_check()` upserts the single row, so a `failed` result overwrites a `passed` one; `mfa_check_ok()` requires `status = 'passed'` |
| revalidate aal2, approved factor, active role and structure status on every request | every authorization path calls `staff_session_ok()` / `has_capability()`, evaluated on each call (not cached) |
| never grant access because a refresh was attempted | the refresh only records the truth; it does not touch staff, role or factor data and returns no capability |
| `pg_cron` optional and deferred | not used |
**No change to the SQL was needed**, so the recorded hashes of 0003 and 0004 stay valid.

## 5. Hosted security tests: completed and outstanding
**Completed (all on hosted dev, read-only unless stated):** source-versus-catalog verification of 0001+0002 (26 checks); Stage 1 and Stage 2 post-verification; rolled-back execution of 0003+0004 (21 checks: structure, privileges, `step_up_ok` on 15 crafted claims, anon/service_role denial, non-staff denial, append-only audit, constraints); second-factor Auth behavior (disposable accounts, both removed); the bootstrap script guards (refused with dummy inputs).
**Outstanding (need migrations applied, an administrator, or test fixtures):** every positive staff path (add member, grant/revoke role, suspend/reinstate, windows, claim factor); last-admin and exclusion behavior through the RPC error handlers; the structure-check refresh under concurrency; real-token HTTP tests through PostgREST for all RPCs; tenant isolation and cross-organization denial with test organizations; owner MFA policies; rate-limit atomicity under real concurrency; invitation and recovery flows (not yet written); all P2.3/P2.4 database objects (not yet written or not executed).
