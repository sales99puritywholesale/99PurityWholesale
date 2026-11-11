# 0005 rev5: recovery specification (state machine, R1 sequence, failure states)

> **SUPERSEDED IN PART 2026-11-10 by the rev6 draft** (`P2-4-0005-REV6-SECURITY-REVIEW.md`). Kept unchanged below as the historical record of rev5. Corrected by rev6: the request-level removal attestation with a typed count is replaced by database-verified per-window removal (no client-supplied count or evidence); the window allowance is 3 standard plus at most 2 explicit extensions (5 in total) instead of 3 and 6; the structure check is required for every owner-path read; the stranded-owner exception exists; break-glass has no code path.

Status 2026-11-10. **Specification of a REVIEW DRAFT. Nothing was executed and the SQL (`supabase/review/0005_rate_limits_and_owner_mfa.rev5.sql`) was never run against any database; rev4 and rev3.1 are preserved unchanged.** Decisions D-V1, D-V2, D-V7, D-V9 stay in force; this document adds the corrections requested after the rev4 review (F1 to F11).

## 1. The R1 sequence (the old factor stays intact until the window exists)
| Step | Actor | What happens | What the database enforces |
|---|---|---|---|
| 1 | Operator 1 | **initiate**: owner id, method (one of three), case reference, notarized flag, reason | active operator + step-up; owner with approval history; quotas over committed rows; one open request per owner |
| 2 | Operator 2 | **approve** within 72 hours: own method, own reference, notarized flag, reason | different account; initiator still active; evidence references differ; the update guard refuses an expired request |
| 3 | (time) | **24 hour cool-off** from the second approval; owner is notified by the application and can cancel | cool-off constraint; nothing can start earlier |
| 4 | Operator | **authorize a recovery window** (5 to 60 minutes) after the cool-off; the owner's approved factor is **still in place**; the window records how many verified factors exist | request pending, unexpired, cool-off elapsed; initiator and approver both still active operators; authorizer active; at most 3 windows (6 after an attested removal) |
| 5 | Operator | **removes the owner's factors by hand** in the Dashboard (only that owner's) and **attests**: `rpc_staff_attest_owner_factor_removal(owner, count)` | the database shows no verified factor for that owner, and the stated count equals the count recorded when the window opened; recorded once on the request |
| 6 | Owner | enrols a new TOTP factor **inside the window**, verifies the first code, then **claims** it | the factor gate: verified TOTP of this user, created inside the window, the only verified factor, active owner, window open and unrevoked, request pending and unexpired, **removal attested**, window authorizer still an active operator; then the window is consumed and the request completed |
**Order that matters:** attest immediately after the removal and before the owner verifies the new factor (an additional verified factor would make the attestation refuse with `factors_still_present`).
Recovery never bypasses MFA: nothing creates or approves a factor except the trigger acting on a factor the owner created and verified inside the window; recovery requests and codes are never read by `owner_mfa_ok()`, `step_up_ok()` or any staff function (checked by the self-check on the live definitions).

## 2. Request states and transitions (update guard)
`awaiting_approval -> pending` (approval: the approval group, cool-off and expiry are set together, once) | `awaiting_approval | pending -> cancelled | expired` | `pending -> completed` | `pending -> pending` only for one more window or for the removal attestation. Final states never change. One open request per owner (partial unique index). Every transition, including lazy expiry, writes an audit row in the same transaction.
**Automatic window revocation:** cancelling (owner or operator) or expiring a request revokes its open window by a recorded revocation with a fixed code (`request_cancelled`, `request_expired`), an audit row `owner.mfa_window.auto_revoke`, in the same transaction. Manual revocation keeps its free-text reason in the window row only.

## 3. Failure states and what the owner and the operators can do
| Situation | State | Recovery path |
|---|---|---|
| Window creation fails (rejected, race) | request still pending, `windows_issued` unchanged (the sub-transaction rolls back) | operator retries (a refusal is returned and audited) |
| Window created, request cancelled | window auto-revoked, audited; the old factor is untouched (R1) | owner keeps their factor; the lock (below) may apply |
| Second operator does not approve within 72 hours | request `expired` (audited); nothing was removed | start a new request (quota applies) |
| Owner loses access during the cool-off | the old factor is still in place; the owner's password session is enough | none needed |
| Factors removed and attested, **enrolment fails** (owner no-show, device problem, window lapses) | request stays pending; owner state `recovery_required`; up to 6 windows (3 before) within 7 days | operator opens another window; every step audited |
| Windows or validity exhausted after an attested removal | **stranded** (context `recovery_status = stranded`; listed by `rpc_staff_list_owner_factor_loss`; expiry and cancel audits carry `stranded: true`) | owner-code request or new two-person request (24 h cool-off, quotas apply); else the break-glass procedure (`docs/P2-4-RECOVERY-BREAK-GLASS.md`) |
| Operator removes the wrong person's factors | not preventable in the database (the Dashboard is outside it); **detected**: the attestation checks only the named owner and the window's count snapshot; the affected user shows as `unexplained` in the factor-loss review | investigate; the affected owner recovers through the normal process |
| Two recovery attempts race | one open request (unique index + owner lock), one open window (unique index + window lock), loser refused | none |
**Owner cancellation and the 24 hour lock:** the lock applies only while the owner's approved factor is intact. Once it was removed, no lock applies to the owner-code path or to a new operator-initiated request. An **operator** cancellation never locks. The target quota (2 per owner per 7 days) is **unchanged and has no exemption**.

## 4. Verification evidence (two operators, notarization supplementary)
Methods: `video_id_check`, `in_person`, `verified_business_contact` (each operator records their own, with their own reference). A notarized statement is a **flag** (`notarized_supplement`, `second_notarized_supplement`) next to a real method, never a method, so it cannot be anyone's only evidence. References match `^[A-Za-z0-9._:/#-]{1,80}$` and must differ. The database distinguishes accounts; the policy makes them different people (`docs/P2-IDENTITY-VERIFICATION-POLICY-SPEC.md` section 3.2).

## 5. Transaction and isolation (F1)
Quotas apply to committed requests (a rolled-back call leaves no row and no audit row). Every mutating recovery RPC refuses any isolation level other than READ COMMITTED (SQLSTATE 25000) before any lock or write. The claim that a client cannot roll back after observing a result is an API-layer invariant, **unverified** (`docs/P2-POSTGREST-TX-INVARIANT.md`); application-level attempt throttling is defense in depth (`docs/P2-APP-THROTTLE-INTERFACE.md`).

## 6. Retention (F6)
Foreign keys from the four tables to `auth.users` (and factors to windows) are `ON DELETE RESTRICT`: deleting an Auth user with any history fails loudly instead of cascading it away; audit rows (no FK, append-only) are untouched. Erasure after the retention period is a separately reviewed two-person procedure (policy section 7). Rate-limit counters are ephemeral by design and are not security history.

## 7. Locks (concurrency design)
(1) operator `p2:operator_recovery:<id>` (initiate only) -> (2) owner recovery `p2:owner_recovery:<id>` -> (3) owner window `p2:owner_window:<id>` -> row locks. Helpers that take (3) (`close_expired_recovery_requests`, `revoke_request_windows`) are called only after (2); the revoke helper takes only (3). No function takes them in another order. **Concurrency correctness is unproven** (designed and statically checked, never executed).
