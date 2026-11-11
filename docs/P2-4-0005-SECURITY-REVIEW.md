> **SUPERSEDED by `P2-4-0005-REV3-SECURITY-REVIEW.md` (0005 rev3, 2026-11-10).** This document describes rev2 and is kept for history; the rev3 review replaces its decision list, trigger matrix and per-email proposal.

# Migration 0005 rev2: function-by-function security review

File: `supabase/review/0005_rate_limits_and_owner_mfa.sql` (sha256 `f07b8f09eaf28a12755de97d8c5821f6d2677a8ad95e8493d10efb744f5af136`). Status 2026-11-10: **review draft, never executed anywhere** (not on hosted, not in a rolled-back transaction, not locally). Everything below is a reading of the SQL text plus the static checker and TypeScript parity tests; none of it has been observed on a database. Depends on 0001-0004 (0003 and 0004 are drafts as well).

## 1. What changed from rev1 (the review finding)
Rev1 granted owner privileges to "aal2 + any verified TOTP factor". Observed on hosted Auth: a factor enrolled earlier and never verified can be verified at aal1 by anyone who knows its secret, and the token becomes aal2. Rev2 binds owner privileges to **approved** factors (same trust model as staff in 0002) and closes the chain that follows (see section 4). The old MFA-less `private.my_owner_org_ids()` loses its EXECUTE grant so no future policy can bypass the rule.

## 2. Object inventory (14 functions, 5 tables, 5 triggers)
| Object | Kind | Owner/definer | search_path | EXECUTE granted to | Notes |
|---|---|---|---|---|---|
| `private.rate_limit_policies`, `rate_limits`, `used_nonces`, `owner_mfa_windows`, `owner_mfa_factors` | tables | owner | n/a | **nobody** (all privileges revoked from PUBLIC, anon, authenticated, service_role) | RLS enabled, **no policy** = default deny; only SECURITY DEFINER code (owner) touches them |
| `private.rate_limit_hit(text, bytea)` | function | SECURITY DEFINER | `''` | nobody | called only by definer RPCs |
| `private.rate_limit_clear(text, bytea)` | function | SECURITY DEFINER | `''` | nobody | not called by any 0005 function; for future recovery RPCs |
| `private.consume_nonce(text, bytea, integer)` | function | SECURITY DEFINER | `''` | nobody | not called by any 0005 function; for future invitation/recovery RPCs |
| `private.owner_mfa_ok()` | function | SECURITY DEFINER | `''` | nobody | reads `auth.mfa_factors` (id, user_id, factor_type, status) |
| `private.my_mfa_owner_org_ids()` | function | SECURITY DEFINER | `''` | **authenticated** (needed: RLS policies run as the querying role, same as `my_org_ids`) | returns only the caller's own organization ids |
| `private.owner_factor_state(uuid)` | function | SECURITY DEFINER | `''` | nobody | takes a user id but is unreachable for API roles |
| `private.last_password_at()` | function | invoker | `''` | nobody | reads only the caller's JWT (`amr`) |
| `private.guard_owner_mfa_window_update()`, `guard_owner_mfa_factor_update()` | trigger functions | invoker | `''` | nobody | `NEW`/`OLD` only |
| `private.guard_owner_mfa_factor_insert()` | trigger function | SECURITY DEFINER | `''` | nobody | the approval gate |
| `public.rpc_throttle_password_recovery(bytea, bytea)` | RPC | SECURITY DEFINER | `''` | **anon + authenticated** (the single reviewed exception) | opaque hashes in, `{allowed, retry_after_secs}` out |
| `public.rpc_my_owner_context(uuid)` | RPC | SECURITY DEFINER | `''` | authenticated | returns the caller's own state only |
| `public.rpc_owner_open_factor_window()` | RPC | SECURITY DEFINER | `''` | authenticated | |
| `public.rpc_owner_claim_factor(uuid)` | RPC | SECURITY DEFINER | `''` | authenticated | |
Self-check (inside the migration, would abort the whole file): RLS on all five tables; no API-role privilege of any kind on them; counters/windows/approvals empty at install; every `private` function has a pinned search_path; only `my_org_ids`, `staff_session_ok`, `has_capability`, `my_mfa_owner_org_ids` are executable by authenticated in `private`; no private function executable by anon, service_role or PUBLIC; **exactly one** anon-executable function in `public` and it is the throttle; the three owner RPCs are definer, pinned, authenticated-only; 5 triggers on the owner tables; the two policies use the MFA-aware function and **no policy** still mentions `my_owner_org_ids`.

## 3. Function by function
**`rate_limit_hit`.** Validates the key length (32 bytes) and the bucket; raises 22023 otherwise (callers pass server-computed HMACs, so a malformed key is a bug, not an attack). One `INSERT ... ON CONFLICT (bucket, key_hash) DO UPDATE` counts the attempt. *Concurrency:* the conflict path locks the row, so concurrent attempts on one key serialize and each sees the previous count; the first-insert race resolves the same way (the loser waits on the unique index, then takes the update path). The attempt that exceeds the limit is itself denied (`blocked_until` is set in the same statement). While blocked, attempts never extend the block (no lockout amplification) and never reset the window; counting restarts only after the window passed and the block ended (`block_secs >= window_secs`, enforced by a table constraint). Cleanup: each call deletes at most 50 rows idle for more than 2 days and not blocked (`FOR UPDATE SKIP LOCKED`, so cleanup never blocks a hit). Not tested on a database yet; the atomicity claim is from the SQL semantics of `ON CONFLICT DO UPDATE` and must be confirmed by a 50-session test (planned, needs approval).
**`rate_limit_clear`.** Deletes one counter. Used after a success that proves control of a secret. Unreachable by API roles.
**`consume_nonce`.** TRUE exactly once per `(purpose, nonce_hash)` until expiry: the primary key decides; the `DO UPDATE ... WHERE expires_at <= now` branch can only reuse an already **expired** row, so a live nonce is never re-issued. Concurrent first uses: the loser blocks on the unique index and then finds a live row, so it gets FALSE. The consumption happens inside the caller's transaction, so a rolled-back operation does not burn the nonce. **Requirement for callers:** `p_ttl_secs` must be at least the lifetime of the credential the nonce protects, otherwise a replay after expiry of the nonce row but before expiry of the credential would succeed. Cleanup: up to 50 expired rows per call.
**`owner_mfa_ok`.** Fail closed: no subject, token not aal2, any unreadable/unknown factor type or status, any **verified factor that is not approved**, or no approved verified TOTP factor all return FALSE; any exception returns FALSE (this covers drift of `auth.mfa_factors`). Reads only id, user_id, factor_type, status. It does **not** write to `auth.*`. Not covered: it cannot tell which factor produced the aal2 claim (the JWT does not say), which is why unapproved verified factors deny instead of being ignored. *Known trade-off:* an attacker with the password can verify a leftover factor and thereby **deny** the legitimate owner's owner privileges until the owner removes that factor (availability, not confidentiality). The owner can remove it at aal2 with their approved factor because factor removal is not gated by this function.
**`my_mfa_owner_org_ids`.** Active owner membership AND `owner_mfa_ok()`. Returns only the caller's rows. The two P2.1 owner-only policies (`organization_billing_select_owner`, `organization_invites_select_owner`) use it after `ALTER POLICY`. Members keep member-level access without MFA.
**`owner_factor_state`.** Pure classification (`approved`, `unapproved_factor_present`, `recovery_required`, `none`, `unknown`); `unapproved_factor_present` wins over everything; any error is `unknown` and the callers deny.
**`last_password_at`.** Same defensive `amr` parsing as `last_totp_at` (array type check, digit-only timestamp). Used only to require a password sign-in within 10 minutes for first enrolment.
**`guard_owner_mfa_factor_insert` (approval gate).** Locks the window row, then requires at that instant (`clock_timestamp`): window exists, targets this user, not revoked, not consumed, open; the user is an **active organization owner**; a `first` window is valid only for a user with **no approval history**; fewer than 3 approved factors; the factor exists for this user, is **verified**, is **TOTP**, and was **created at or after the window opened**; then consumes the window in the same step (single use). A factor enrolled before the window (any abandoned enrolment) can never be approved. The composite FK `(window_id, user_id)` and `unique(window_id)` give one approved factor per window.
**`guard_owner_mfa_factor_update` / `guard_owner_mfa_window_update`.** Approvals are immutable; a window can only move from open to consumed or revoked, and only once. No function deletes approval rows, so a row doubles as the permanent record that the user once had an approved factor (approval history).
**`rpc_throttle_password_recovery`.** The only anon-executable function. Counts **both** keys (email and address) so that neither can bypass the other; returns nothing but `{allowed, retry_after_secs}` (no existence, no counts). Inputs are opaque 32-byte hashes; the database never sees an email or an address.
**`rpc_my_owner_context`.** Own state only; `factor_state` is computed only for an owner of the organization asked about, otherwise `none` (no information about other users or organizations).
**`rpc_owner_open_factor_window`.** Not an owner: `not_an_owner`, not audited (an outsider cannot flood the audit log). Advisory lock per user serializes concurrent calls. `approved` state needs `owner_mfa_ok()` **and** a fresh step-up (15 min) and opens an `additional` window. `none` state needs a password sign-in within the last 10 minutes (future skew 60 s) and opens a `first` window. Any other state (`unapproved_factor_present`, `recovery_required`, `unknown`) is **denied and audited**, never self-service. Lapsed open windows are revoked before a new one is inserted (the partial unique index would otherwise refuse it). Every outcome is audited in the same transaction.
**`rpc_owner_claim_factor`.** Needs an active owner, aal2 with a fresh TOTP (the verification of the new factor), and an open window of the caller; everything else is the trigger. Trigger messages are **not** returned (they would tell an attacker which rule failed); the audit row carries only a generic reason. Replays return `factor_not_eligible` (the window is already consumed) or `already_approved`.

## 4. Attack chain analysis (the review's scenario and what follows from it)
| Step | Result under rev2 |
|---|---|
| Attacker with the owner's password verifies an abandoned (unverified) factor B at aal1 and gets aal2 | works (Auth behavior, observed); B becomes a verified **unapproved** factor |
| Attacker calls an owner operation | `owner_mfa_ok()` = FALSE (unapproved verified factor present) |
| Attacker tries to approve B | needs an open window created **before** B existed: B predates any window, so the trigger rejects it; opening a window is refused while an unapproved verified factor is present (`unapproved_factor_present`) |
| Attacker (aal2 through B) removes the approved factor A (Auth allows removal at aal2) | then no approved factor remains and the user **has approval history**: `recovery_required`; no self-service window |
| Attacker removes B too, enrols a new factor, tries a first-enrolment window | refused: approval history exists. Only the recovery flow (separate design, needs approval) can re-establish a factor |
| Owner who never approved any factor (brand-new owner) and an attacker with the password | the attacker can win first enrolment if they act first: inherent in password-only first enrolment; mitigated by the 10-minute password-recency rule, the audit event, and the recommendation that owner onboarding is initiated by staff (decision below) |
The residual effect of this chain is **denial of owner privileges** (availability), not takeover. Takeover of a first enrolment by a password thief remains possible by design of first enrolment.

## 5. Residual risks and open points
1. **Per-email recovery throttle can be used for denial of service.** The application computes the key for whatever email is submitted, so anyone can submit a victim's email three times an hour and block that victim's recovery requests for an hour. (The statement in the P2-4 doc that an outsider "cannot target a victim's counter" is true only for **direct** calls to the RPC with arbitrary hashes; it is false for requests through the application.) Options: accept, or change the policy so that an over-limit email request is silently not sent but does not block, or answer identically in all cases. Needs a decision.
2. Counter rows can be created by anon with random keys (bounded by the 2-day idle cleanup, 50 rows per call; platform request limits apply).
3. Rate-limit atomicity and nonce replay behavior are **not tested on a database**.
4. Owner structure check: unlike staff, owner MFA does not require the 24-hour structure check (that check is refreshed by the staff context RPC; owners cannot depend on staff activity). Drift of `auth.mfa_factors` is covered by the exception handler (fail closed) but a silent semantic change (for example a renamed status value) would make `owner_mfa_ok` deny everyone, not allow anyone.
5. Opening an owner window is not rate limited (owner-only, audited, one open window per user).
6. `RATE_LIMIT_PEPPER` (new server secret, at least 32 characters) is required by the application before any bucket can be used; without it the application fails closed.
7. A `first` window is only as strong as the password: owner onboarding by invitation should be started by staff or require email verification plus the 10-minute recency (decision below).

## 6. Decisions requested (none executed)
D-P24-5 per-email throttle behavior (accept / non-blocking variant); D-P24-6 first-enrolment policy for owners (self-service with 10-minute password recency as drafted / staff-authorized window / both); D-P24-7 approval to run 0005 inside a rolled-back transaction (needs 0003+0004 in the same transaction), and later the 50-session atomicity test; D-P24-8 creation of `RATE_LIMIT_PEPPER`.

---

# Addendum 2026-11-10 (review-only; 0005 is still NOT executed anywhere)

## 7. Per-email denial of service: mitigation proposal (non-blocking variant, approved in principle)
**Problem (section 5, residual 1).** The application computes the per-email key for any submitted address, so a third party can exhaust the victim's per-email quota (3 per hour, then blocked for an hour) and stop the victim's own legitimate recovery requests.
**Proposal (rev3, not drafted until you approve the wording; no SQL changed here):**
1. The per-email bucket becomes a **cool-down**: seed `password_recovery` as `max_attempts = 1`, `window_secs = 600`, `block_secs = 600` (a request is allowed at most once per 10 minutes per email). The per-address bucket `password_recovery_ip` stays a blocking quota (it only ever blocks the attacker's own address).
2. **Every allowed request sends a genuine reset email to the account's own address** (never to a submitted address), with a link valid for at least 60 minutes. Whoever occupies the slot, including an attacker, causes the legitimate owner to receive a usable link; the worst case for the owner is a wait of at most 10 minutes while a link from the attacker's request is already in the inbox.
3. A denied request returns the **same generic response and timing class** as an allowed one (no enumeration, no signal that a throttle fired); nothing is sent for it.
4. Denied attempts **do not extend** the cool-down (already true of `rate_limit_hit`) and do not count toward any other bucket of the same email.
5. Residual: an attacker can still make the owner's inbox receive one reset email per 10 minutes (annoyance, capped); a mailbox the attacker controls is out of scope.
6. Tests to add with rev3: cool-down boundary at 599/600/601 s under 50 concurrent calls (exactly one allowed per window); identical responses for allowed and denied; link validity greater than the cool-down.

## 8. Exact ownership and grants expected after 0005 (derived from the SQL text; NOT verified on a database)
Owner of every object: the role that runs the migration (`postgres` on Supabase). ACL notation `role=privileges/grantor`.
| Object | Expected ACL after the migration | Source in the file |
|---|---|---|
| tables `private.rate_limit_policies`, `rate_limits`, `used_nonces`, `owner_mfa_windows`, `owner_mfa_factors` | `{postgres=arwdDxt/postgres}` only (no anon, authenticated, service_role, PUBLIC) | `revoke all on table ... from public, anon, authenticated, service_role` |
| `private.rate_limit_hit(text,bytea)`, `rate_limit_clear(text,bytea)`, `consume_nonce(text,bytea,integer)`, `owner_mfa_ok()`, `last_password_at()`, `owner_factor_state(uuid)`, the three `guard_owner_mfa_*` trigger functions | `{postgres=X/postgres}` | `revoke all on function ... from public, anon, authenticated, service_role` |
| `private.my_mfa_owner_org_ids()` | `{postgres=X/postgres,authenticated=X/postgres}` | revoke all, then `grant execute ... to authenticated` |
| `private.my_owner_org_ids()` (from 0001) | `{postgres=X/postgres}` (grant to authenticated **removed**) | `revoke execute ... from authenticated` |
| `public.rpc_throttle_password_recovery(bytea,bytea)` | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}` | revoke all, then `grant execute ... to anon, authenticated` |
| `public.rpc_my_owner_context(uuid)`, `rpc_owner_open_factor_window()`, `rpc_owner_claim_factor(uuid)` | `{postgres=X/postgres,authenticated=X/postgres}` | revoke all, then `grant execute ... to authenticated` |
The migration's final DO block asserts the properties that matter (no API-role privilege on the tables; only four private functions executable by authenticated; none by anon, service_role or PUBLIC; exactly one anon-executable public function; the three owner RPCs definer/pinned/authenticated-only; five triggers; both policies use the MFA-aware function; no policy mentions `my_owner_org_ids`) and would abort the whole file otherwise. **Verification status:** SECURITY DEFINER and `search_path` are verified **statically** only: the checker reports 14 functions and 11 definers (every non-definer is invoker by design: `guard_owner_mfa_window_update`, `guard_owner_mfa_factor_update`, `last_password_at`), and the file text pins `search_path = ''` on every function. A catalog verification (`pg_proc.prosecdef`, `proconfig`, `proacl`) requires executing the file and is **not done**.

## 9. RLS and policy enforcement
All five new tables: `ENABLE ROW LEVEL SECURITY`, **no policy**, **no grant**: unreachable by API roles even if a future grant were added by mistake (default deny). Existing tables changed: two `ALTER POLICY` statements (`organization_billing_select_owner`, `organization_invites_select_owner`) now use `private.my_mfa_owner_org_ids()`; no other policy changes. Enforcement path: PostgREST role `authenticated` evaluates the policy, which calls the SECURITY DEFINER function with the caller's `auth.uid()` and JWT; the function returns only the caller's organization ids and only when `owner_mfa_ok()` holds. Not yet enforced anywhere: owner-only **write** paths (they do not exist until P2.3). The rule is recorded: every future owner RPC and policy must derive authority from `my_mfa_owner_org_ids()`, and the removal of the `my_owner_org_ids()` grant makes a mistake fail loudly (permission denied) instead of silently skipping MFA.

## 10. Owner-factor approval trigger: behavior matrix (`guard_owner_mfa_factor_insert`, BEFORE INSERT on `private.owner_mfa_factors`)
| Check (in order) | Failure raises (SQLSTATE 23514) | Evidence |
|---|---|---|
| window row exists (locked `FOR UPDATE`) | unknown enrolment window | static reading |
| window targets the same user | targets a different user | static (composite FK repeats it) |
| window not revoked, not consumed | revoked / already consumed | static |
| `clock_timestamp()` within `[opened_at, expires_at)` | not open | static |
| user is an **active owner** of some organization | not an active owner | static |
| `kind = 'first'` only while the user has **no approval history** | not valid with history | static |
| fewer than 3 approved factors | too many approved factors | static |
| factor exists for this user in `auth.mfa_factors` | does not exist for this user | static |
| factor `status = verified` | not verified | predicate re-expressed and **evaluated on real Auth rows** (owner sequence test S3 steps 3, 4) |
| factor type = TOTP | only TOTP | static |
| factor `created_at` within `[opened_at, now]` | created outside the window | predicate **evaluated on real Auth rows**: a verified factor created before the window rejected; created during accepted; created after expiry rejected (S3 steps 5, 6, 9) |
| then: window consumed in the same step, `approved_at` set | n/a | static; single use also needs the composite FK and `unique(window_id)` |
"Evaluated on real Auth rows" means the **eligibility predicate was re-expressed in the test and evaluated against real factor rows**; the trigger itself has **never been run**. `claim_factor` maps SQLSTATE 23514 to the generic code `factor_not_eligible` (no rule text returned) and 23505 to `already_approved`.

## 11. Rate-limit atomicity, replay prevention, cleanup and bounded storage
**Atomicity.** One `INSERT ... ON CONFLICT (bucket, key_hash) DO UPDATE` per attempt; PostgreSQL locks the conflicting row, so concurrent attempts on one key serialize and each sees the committed count of the previous one; two sessions inserting the same new key resolve through the unique index (the loser takes the update path). Window restart, block start and block expiry are decided inside that one statement from `clock_timestamp()`, so there is no read-then-write gap. **Not yet observed under concurrency** (plan: scenarios R1 to R5 in `docs/P2-CONCURRENCY-TEST-PLAN.md`).
**Replay prevention.** `consume_nonce` returns TRUE only when the insert wins or the conflicting row is already expired; a live row yields zero rows affected and FALSE. Callers must set the TTL to at least the credential lifetime. The consumption commits or rolls back with the caller's transaction. Planned scenarios N1 to N5.
**Cleanup and bounded storage.** Each `rate_limit_hit` deletes at most 50 rows whose `updated_at` is older than 2 days and that are not currently blocked (`FOR UPDATE SKIP LOCKED`, so cleanup never waits on a live row); each `consume_nonce` deletes at most 50 expired nonces. Steady state: every call inserts or updates at most one row and removes up to 50, so as long as the functions keep being called the tables cannot grow faster than the 2-day idle window allows (rows are roughly the distinct keys seen in 2 days); if calls stop, nothing grows. The anon-callable throttle lets an outsider create up to (request rate x 2 days) rows with random keys, bounded by platform request limits; a row is about 100 bytes, so one million rows is roughly 100 MB: acceptable, but table size should be **monitored** (operational item). Policies are an immutable 6-row seed. Not tested on a database.

## 12. Status of the earlier decision list
Answered by your approval: D-P24-5 (non-blocking variant: section 7) and D-P24-6 (first owner MFA by operator-authorized window, which **replaces** the self-service `first` window of rev2; rev3 not drafted; see `docs/P2-4-RECOVERY-FACTOR-REMOVAL-DESIGN.md` section 9). Still open: dry execution of 0005 (not approved), `RATE_LIMIT_PEPPER` (not created), the 50-session atomicity test.
