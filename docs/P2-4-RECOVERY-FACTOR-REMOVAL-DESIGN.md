# P2.4 recovery: design of the lost-factor (factor removal) flow

Status 2026-11-10: **design only.** No SQL, no function and no script exists for this flow, and nothing in this document writes to `auth.mfa_factors`. Approval is requested for the design and for the removal mechanism (decision D-P24-2) **before** any code is drafted.

## 1. The problem, from observed behavior
Hosted Supabase Auth (observed, see `docs/P2-4-RATE-LIMIT-OWNER-MFA-AND-FACTORS.md`): a session obtained with the password and a recovery code is **aal1**. At aal1 an existing verified factor **cannot be removed** (422 `insufficient_aal`) and a **second factor cannot be enrolled** (403). So a user who lost the authenticator cannot repair the situation through Auth alone. Some trusted component must remove the lost factor after the user proved something else. That component is the only part of this design that is security-critical and unusual.

## 2. Scope
Organization **owners** and ordinary members who enrolled MFA. **Staff are excluded:** a staff member never uses recovery codes; the administrator-approved enrolment window (0002/0004) is their path, and the lost-device case for the only administrator is the owner-run break-glass procedure (bootstrap document section 3). Rev2 of 0005 deliberately makes a user with approval history and no live approved factor `recovery_required` (no self-service), so this flow is the **only** way back for an owner who lost the factor.

## 3. Principles
1. The flow must be **slower and noisier than normal sign-in** and must never be quicker than the attack it defends against. A password thief who also stole one recovery code must not be able to complete it silently.
2. Every step is **throttled** (buckets already defined in 0005 draft: `mfa_recovery` 3/h, `recovery_code` 5 per 15 min with a 15 min block), **audited** in the same transaction, and **notified** to the account email.
3. Codes are single use, stored only as hashes bound to the user id (TypeScript: `src/lib/portal/recovery/codes.ts`; 80-bit Crockford base32, SHA-256), shown once, replaced as a set.
4. The removal itself is performed by **one narrow, server-only mechanism** (section 5), never by browser-reachable code, and only for a recovery request that the database marks as ready.
5. After removal, the only way to obtain owner privileges again is a **new factor approved through a window** (the 0005 approval trigger), so recovery cannot be used to approve an attacker-chosen factor created earlier.

## 4. Flow (states already exist in `recovery/state.ts`: `no_mfa`, `mfa_active`, `recovery_requested`, `recovery_pending`, `factor_replaced`, `locked`)
| # | Actor | Step | Controls |
|---|---|---|---|
| 0 | owner | When the first factor is approved, the application shows 8 recovery codes once; the user must confirm they stored them. Codes are hashed and stored; a new set replaces the old set atomically | codes never logged or returned again; the set is voided on every factor change |
| 1 | owner (password only, aal1) | requests recovery and submits **one** code | session must be aal1 from a fresh password sign-in; throttle `mfa_recovery` + `recovery_code`; the code is consumed under a row lock and recorded as used even if the next steps fail; wrong codes count toward the lock (5 failures: 15 min lock) |
| 2 | system | creates a **recovery request** in `recovery_pending`, starts a **cool-off hold** (proposed 24 h, decision D-P24-9), emails the account address (and any secondary address on file) with a one-time **cancel link** | the cancel link carries a nonce (`consume_nonce`); cancelling voids the request, **locks further recovery for 24 h**, and flags the account for review; a pending request blocks new requests |
| 3 | owner | after the hold, signs in again (password) and confirms completion within a 30 minute window | second throttle check; the request must still be `pending`, not cancelled, not expired, and bound to the same user; completion is one-time |
| 4 | server-only mechanism | removes **all** of the user's factors (verified and unverified) and revokes other sessions | see section 5; the database records the result (`factor_replaced` pending enrolment) in the same transaction as the audit event |
| 5 | owner | opens a recovery enrolment window (kind `recovery`, only valid while a completed request exists), enrols a new factor **after** the window opened, verifies it, claims it | the 0005 approval trigger applies unchanged (created inside the window, verified TOTP, window consumed); a new recovery code set is issued; old requests and codes are voided |
| 6 | system | emails completion; writes audit events for each step (`owner.mfa_recovery.request`, `.cancel`, `.complete`, `.enrol`) | audit rows are append-only |
Failure modes: lock after 5 wrong codes (15 min); request expires after 30 min without completion (state returns to `mfa_active`, factors untouched); a cancel link used by an attacker would only cancel (harmless, audited); mailbox compromise defeats the email controls (documented residual).

## 5. The removal mechanism: three options (decision D-P24-2)
| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Auth Admin API from one server-only module** | the server calls the supported admin endpoint to delete each factor, using the service-role key, only after the database says the request is ready | uses a **supported** interface; GoTrue keeps its own invariants (sessions, challenges); no write into `auth` tables | introduces the **service-role key** into the application (today none exists): a much larger blast radius if that module or the environment leaks; needs strict isolation (server-only import, separate secret, never in tests) |
| **B. Definer function deleting rows from `auth.mfa_factors`** | `SECURITY DEFINER` function owned by the table owner, callable by `authenticated` only when a ready recovery request exists for `auth.uid()`; deletes that user's factor rows and records the result | no service-role key; atomic with the audit event; small SQL surface | writes into an **internal, unsupported** schema: a platform update could change columns, constraints or session semantics; other sessions are not revoked by the delete itself (needs a second, equally internal step or a separate Admin call); needs the structure check to cover the write |
| **C. Operator-assisted** | a platform administrator runs the removal after verifying identity through another channel | no new code path in the product | does not scale; human error; slow; violates "no manual database changes outside approved procedures" |
**Recommendation: A for production, with B rejected unless you prefer no service-role key at all.** The deciding question is which risk you prefer: a powerful secret in the application (A) or a write into Auth's internal tables (B). I recommend A because it is the supported interface and because the service-role key can be confined to one tiny module with a database-side precondition (the request must be `ready` and bound to the user) that makes the key useless for any other purpose even if that module is called by mistake. If you choose B, the function must (1) refuse unless the request is `ready`, (2) delete only rows of `auth.uid()`, (3) never touch any other column or table, (4) be covered by a structure check that fails closed, and (5) be reviewed again after every Supabase platform update. **Nothing is written until you choose.**

## 6. Abuse analysis
| Attacker | Capability | Outcome |
|---|---|---|
| Password thief, no codes | can request, cannot pass step 1 | 3 requests/hour limit; nothing changes; audit trail |
| Password thief + one stolen code | passes step 1 | owner is emailed with a cancel link; 24 h hold; cancel locks recovery and flags the account; attacker gets nothing unless the owner ignores the mail |
| Mailbox thief (email + password) | can click cancel (harmless) or wait out the hold and complete | **not defended** by this flow (same trust as password reset by email); mitigated by the recovery codes being a separate secret the mailbox does not contain |
| Insider with database owner credentials | can edit tables directly | outside the product's threat model; protected by credential custody and audit review |
| Denial of service by repeated requests | blocks the victim's recovery for the lock period | bounded by throttles; known DoS vector, same as password reset throttling (see 0005 review, residual 1) |

## 7. Tests required before any approval to apply
State machine (TypeScript, exists); code generation and hashing (exists); database: single-use under 50 concurrent submissions, throttle atomicity, cancel link replay, expiry, completion with a cancelled/expired request, removal affecting only the target user, no effect on other users (two accounts), new-factor approval requires a recovery window, audit completeness. For option A additionally: the module is unreachable from client bundles (static check), the service-role key is not read in tests. All on disposable accounts, all rolled back or cleaned up, each with explicit approval.

## 8. Decisions requested
D-P24-2 removal mechanism (A / B / C); D-P24-9 cool-off hold length (proposed 24 h; 0 = none); D-P24-10 number of codes (proposed 8) and whether members (not only owners) get recovery; D-P24-11 secondary notification address (proposed: none in milestone 1).

---

## 9. APPROVED DECISIONS (2026-11-10): these supersede the open options in sections 5 and 8
| Decision | Approved value | Effect on this design |
|---|---|---|
| D-P24-2 removal mechanism | **Operator-assisted initially** (option C) | **No code removes an Auth factor.** No service-role key, no definer function writing `auth.mfa_factors`. The operator removes the factors by hand (procedure below). Options A and B stay documented for a later, separately approved milestone |
| D-P24-9 cool-off | **24 hours** | between an accepted recovery request and the operator's action |
| D-P24-10 codes | **10 single-use codes, owners only** initially | members and staff get no recovery codes |
| D-P24-6 first owner MFA | **operator-authorized enrolment window** | rev2 of 0005 lets an owner open a `first` window themselves after a recent password sign-in; that self-service path is **replaced** (rev3, not drafted): the first window for an owner can only be opened by an operator with a new staff capability (proposed `org.owner.mfa.authorize`, held by admin only, never seeded until approved), mirroring `rpc_staff_authorize_enrolment_window`. An owner may still open an `additional` window for themselves (approved, clean session plus step-up) |
| D-P24-5 per-email throttle | **non-blocking variant** | see section 11 and the 0005 review |
| Code power | **No recovery code independently grants owner privileges or satisfies staff step-up** | section 10 |

## 10. Invariants for recovery codes (to be enforced and tested)
1. A recovery code only **creates a recovery request** (state `recovery_pending`). It never sets `aal`, never creates an approved factor, never satisfies `owner_mfa_ok()` and never satisfies `step_up_ok()`; those functions do not read any recovery table.
2. Owner privileges after recovery still require an **approved factor in a window** (0005 trigger), opened by an operator for a `recovery` purpose.
3. **Staff never use recovery codes.** `rpc_*recovery*` functions refuse any caller who has a `staff_members` row, active or disabled (the staff/member exclusion makes the two populations disjoint, but the check is explicit).
4. A recovery code is not a session: a password-only (aal1) session with a valid code reaches nothing beyond the request screen.
5. Codes cannot be used to authorize any step-up action: the registry (`actions.ts`) has no action whose step-up can be satisfied by anything other than a fresh TOTP `amr` entry; a test asserts that no protected action lists "recovery code" as an alternative.
6. Ten codes per set, 80 bits each, hashed bound to the user id, single use, a new set voids the old set; the throttles of the 0005 draft apply (`recovery_code` 5 per 15 minutes then 15 minutes blocked; `mfa_recovery` 3 per hour).

## 11. Operator-assisted procedure (initial, manual, no product code removes factors)
| # | Who | Step | Record |
|---|---|---|---|
| 1 | owner | submits one valid recovery code with a fresh password sign-in | recovery request created; audit `owner.mfa_recovery.request`; email to the account address with a cancel link |
| 2 | system | 24-hour cool-off starts; a pending request blocks new requests; cancelling locks recovery for 24 h and flags the account | audit `.cancel` |
| 3 | operator (admin) | after the cool-off, re-verifies identity through a channel other than the account mailbox (documented per case), confirms the request is still pending and not cancelled | written ticket reference |
| 4 | operator | removes **all** of the user's factors in the Supabase dashboard (Authentication > Users > the user > factors) and signs out the user's sessions; no script, no SQL | written ticket: user id, time, operator |
| 5 | operator | opens a `recovery` enrolment window for the owner through the operator capability | audit `staff.owner_mfa_window.authorize` |
| 6 | owner | enrols a new factor after the window opened, verifies it, claims it; receives a new set of 10 codes | 0005 approval trigger; audit `owner.mfa_factor.approve` |
| 7 | operator | closes the ticket; the request is marked complete | audit `.complete` |
Controls and residual risks: the operator is the trust anchor (insider risk, mitigated by the audit trail, the two-step separation between removal and window, and the rule that an operator cannot be the target); there is no automated detection that step 4 happened, so step 5 refuses a window unless the user has **no verified factor** at that moment (checked in SQL from `auth.mfa_factors`, read-only); manual work does not scale (acceptable for milestone 1 volumes).

## 12. Non-blocking per-email throttle (approved variant)
See `docs/P2-4-0005-SECURITY-REVIEW.md` section 7. Summary: the per-email bucket becomes a **cool-down**, not a quota with a long block; every request that passes sends a genuine reset email to the account's own address, so whoever occupies the slot causes the legitimate owner to receive a usable link.
