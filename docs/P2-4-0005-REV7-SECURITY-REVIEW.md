# 0005 rev7: security review of the corrections to rev6

Status 2026-11-10. **A REVIEW DRAFT. `supabase/review/0005_rate_limits_and_owner_mfa.rev7.sql` (sha256 `7d5db7c0b61e51ba6fcfcf01c9e3e6281fbe6ca339969e23cfd8d6a19918eb90`, 3298 lines) has never been parsed or executed by PostgreSQL, is not applied anywhere and is not in `supabase/migrations/` or the migration manifest.** Written under the project owner's decision "require rev7" after the independent adversarial review of rev6. rev3, rev3.1 (canonical), rev4, rev5 and rev6 and the four applied migrations (0001 to 0004) are preserved byte for byte (hashes verified, section 9). Everything below is a statement about the TEXT of the draft and about offline models; **nothing here proves that PostgreSQL accepts the file or that any trigger, constraint, lock or transaction behaves as described.** Section 8 lists what cannot be tested offline.

Written for: the project owner, who decides whether rev7 may proceed to any database step. No approval for a database action is requested or assumed.

## 1. What changed from rev6 (and what did not)

rev7 = rev6 plus six mandatory corrections (F1, F2, F3, F4, F5, F7) and the F13 loop clean-up. 40 of the 53 functions are byte-identical to rev6 (comments excluded), 7 changed, 6 are new, none was removed (`history/0005_rate_limits_and_owner_mfa.rev6-to-rev7.diff`: 467 lines added, 80 removed).

| Finding | Severity (review) | Correction | Objects |
|---|---|---|---|
| F1 lifetime approved-factor cap | High | the limit of three counts **live** approved factors (approved rows whose factor the database reads as verified now) | `private.guard_owner_mfa_factor_insert` |
| F2 case-sensitive install self-check | High (install blocker) | every assertion on deparsed catalog text is case-insensitive or normalized; search_path settings are compared after removing quotes and blanks | the DO block of section 7 |
| F3 fragile stranded definition | Medium | the stranded anchor is the request with the **latest removal evidence**, not the latest request; behavior of an exception-carrying request that ends early is defined; the one-live-exception index is removed | `private.owner_stranded_request`, one index, the factor-loss review, the owner context, the expiry audit |
| F4 three-window dead end | Medium | after three standard windows with no verified removal exactly **one** extension (the fourth window) is allowed; the fifth always needs a verified removal | `public.rpc_staff_authorize_extra_recovery_window` |
| F5 unrecognized factor rows block recovery | Medium | audited operator path outside the window workflow: order, manual removal, database-confirmed absence | table `private.owner_unrecognized_factor_orders`, `private.owner_factor_row_class`, two guards, two RPCs |
| F7 refresh depends on staff activity | Medium | explicit, input-free, rate-limited, audited refresh RPC for any active staff member or active owner | `public.rpc_refresh_auth_structure_check`, policy row `structure_refresh` |
| F13 data-modifying CTE in PL/pgSQL `FOR` loops | Low (unverified construct) | six loops rewritten as plain `SELECT ... FOR UPDATE` loops with a per-row `UPDATE` | `close_expired_recovery_requests`, `revoke_request_windows` |

**Preserved without change** (verified by the suite, section 9): the two-operator stranded-owner exception, the 30 day lookback and the limit of two exceptions per owner per 30 days, three standard windows plus two extensions (five is a hard maximum, still a constraint), the factor-removal order workflow, database-observed completion, no service-role broker or dependency, all `ON DELETE RESTRICT` foreign keys, the capability and step-up gates, the READ COMMITTED guard, the lock hierarchy and the quotas (5 per operator per 24 hours, 2 per owner per 7 days).

Object counts: 53 functions (29 private, 24 public RPCs, 44 SECURITY DEFINER), 10 tables, 20 triggers, 9 rate-limit policy rows, 13 foreign keys among the seven owner tables (7 to `auth.users`), 33 named constraints asserted by the self-check.

## 2. F1: the limit counts live approved factors

**Defect (proven from the rev6 SQL).** `guard_owner_mfa_factor_insert` raised `too many approved factors` when `count(*)` over `private.owner_mfa_factors` reached 3. Those rows are never deleted (history is preserved by design), so after the third approval of an owner (first enrolment plus two recoveries) a fourth factor could never be approved: every later recovery ended in `factor_not_eligible`, with no in-system way out.

**Correction.** The unknown-state refusal now comes first (it produces the verified id list `v_ids`, NULL = unknown); the limit is `count(*) ... a.factor_id = any (v_ids)) >= 3`, that is: approved factors that are verified right now. History rows are untouched; no row is deleted or updated (the immutability trigger and the self-check on live function text are unchanged). First and recovery windows still require that the new factor is the only verified factor, so in practice the limit only binds the additional-factor path (an owner can still never hold more than three live approved factors).

**Evidence.** Model `factorLimitOk` versus `lifetimeFactorLimitOkRev6`; the suite replays eight consecutive recoveries (each removing the previous factor) and asserts each is allowed; unknown (NULL) refuses. Negative controls restore the lifetime count, change the limit to four, remove the unknown check, and add a history delete: all caught. Static rule P32 flags any `count(*)` over the approvals table that is not live-restricted (and flags the rev6 file when fed under a rev7 name). The self-check on live definitions asserts the `= any (v_ids)` form and the absence of the old message.

**Residual.** None for the limit itself. Unproven: that the trigger runs as written.

## 3. F2: deparse-dependent self-checks

**Defect (assumption, high confidence, reported in the review).** The rev6 self-check required `pg_get_constraintdef(...) like '%greatest%'`. PostgreSQL prints `GREATEST(`; a case-sensitive `LIKE` fails and the DO block would abort the whole migration at its last step (fails closed, but blocks every deployment, and would have failed the rolled-back dry run).

**Correction.** Inspected every assertion over catalog text in the self-check; each now uses `~*`, `ilike`, or whitespace-normalized text:

| Assertion | rev6 | rev7 |
|---|---|---|
| five-window constraint | `like '%windows_issued <= 5%'` and `like '%greatest%'` | `regexp_replace(def, '\s+', ' ', 'g') ~* 'windows_issued\)?(::[a-z0-9 ]+)? <= 5'` and `~* 'greatest\s*\('` and `~* 'extra_windows_granted'` |
| isolation guard in 22 RPC definitions | `~` | `~*` |
| helper chain (9 assertions) | `position('...' in pg_get_functiondef(...)) = 0` | `pg_get_functiondef(...) !~* '...'` (regexes with escaped dots) |
| policy text (3 assertions) | `like '%name%'` | `ilike '%name%'` with escaped underscores |
| search_path of the 24 RPCs | `c = 'search_path=""'` | `regexp_replace(c, '[\s"'']', '', 'g') ~* '^search_path=$'` |
| proconfig presence for private functions | `like 'search_path=%'` | `ilike` |

Assertions on function **bodies** are not affected by the printer (PostgreSQL stores and returns the body text verbatim), but are case-insensitive anyway. Static rule P33 (new) rejects `LIKE`, case-sensitive `~`, `position()` or an exact `proconfig` comparison applied to catalog text, with 5 selftest samples; the rev6 file renamed to a rev7 name triggers it.

**Residual (honest limit).** A text pattern checks the shape of a constraint, not its behavior: `windows_issued <= 50` also matches the regular expression. The behavioral proof of the five-window maximum is the disposable-project test R7-03 (inserts that must fail). Unproven: how PostgreSQL 17 actually prints the constraint; the regular expression was written to accept every rendering I could construct (upper or lower case, casts, line breaks) and is tested against them in `owner-rev7.test.ts`, but that is a model of the printer, not the printer.

## 4. F3: the stranded anchor and the exception-carrying request

**Defect (proven).** rev6 defined stranded through the owner's single latest request. Three ways to lose the state: (1) the exempt request that carries the exception expires before any removal, becomes the latest request without a marker and erases the state, so the lazy closing cancels the exception path; (2) a window lapses between the operator's Dashboard removal and `complete`, so the request has no marker although the factors are gone; (3) any later owner-code request that is created and cancelled drops the state.

**Definition in rev7.** `private.owner_stranded_request(owner)` returns the request id when ALL hold: the factor state is `recovery_required` (structure check fresh and passing, every row readable, no verified factor, no unapproved verified factor), no request of the owner is open, and an **ended (cancelled or expired) request carries removal evidence** younger than 30 days with **no request completed after that evidence**. Evidence of a request is `factors_removed_at` (set by the database when an order completed) or, failing that, the `ordered_at` of any removal order of that request (the state `recovery_required` means the database reads no verified factor now, so every snapshot factor is gone). The anchor is the request with the latest evidence. A request that ends without evidence never changes it.

**What happens when an exception-carrying request expires (or is cancelled) before any removal: defined.**
1. The request creates no evidence, so the anchor stays the earlier request R1: the owner is stranded again on R1.
2. The exception stays `consumed` (it was used; it is audited; it counts toward the limit of two per owner per 30 days). Nothing is refunded and no state moves backwards.
3. The expiry audit row of the request records `exception_carrying: true`.
4. Operators may request a **new** exception for R1 (two-operator rule unchanged, step-up, capability), as long as fewer than two exist for the owner in 30 days. This is why the rev6 index `owner_recovery_exceptions_one_live_idx` (one open or consumed exception per stranded request) is **removed**: it would have blocked this path forever. Double consumption stays impossible: unique `(exception_id)` on requests, the one-way exception transition guard, the one-open index per owner, the owner lock.
5. If that request instead verified a removal, the anchor moves to it (latest evidence) and no exception exists for the new anchor until requested.
6. After a second fruitless exception the owner is out of exceptions for 30 days; the remaining paths are the owner-code request (if codes exist), a new operator request within the quotas, and the break-glass procedure (no code path; `P2-4-RECOVERY-BREAK-GLASS.md`).

The factor-loss review (`rpc_staff_list_owner_factor_loss`) and `rpc_my_owner_context` use the same function, so the category `stranded`, the owner-facing status and the exception checks cannot disagree.

**Residual (documented).** Evidence by order proves that an operator ordered a removal of verified factors and that none is verified now. It does not prove who removed them or when (the same limit as the manual workflow). The consequence is bounded: the only privilege the anchor grants is eligibility to **request** an exception (still two operators, still the 2 per 30 days limit); it grants no MFA, no window and no bypass of the operator quota, cool-off or windows.

## 5. Accepted findings (documented, not changed)

These were accepted in the project owner's decision. They remain open risks. None is removed from the documentation.

**F6 — the enrolment race inside an open recovery window (accepted; Medium).** While a window is open and its removal is verified (or it opened with no verified factor), the first person who enrols a TOTP factor with the owner's session and claims it wins: the database binds the factor to the window and the owner account, not to a device or a person. Someone holding the owner's password (aal1 session) can race the real owner. Controls: the window is operator-authorized and short (at most 60 minutes), the operator should keep the owner in a live session while it is open, the 24 hour cool-off with the owner notification gives the owner time to cancel, the owner is informed of every window by the application, all steps are audited, and the window is consumed by the first approval. Not mitigated by rev7. A possible later hardening (separate "open for enrolment" step after verification) is not part of this revision.

**F8 — operator deprovisioning blocks a recovery in progress (accepted; Low to Medium).** The window gate re-checks that initiator and approver are still active operators holding the capability; the factor gate re-checks the window's authorizer. If either is off-boarded mid-recovery no further window opens for that request and an open window cannot be used. Recovery then needs a cancellation and a new request under the quotas (or the exception path if a removal was verified). This is deliberate (an off-boarded operator's authority must not outlive them); it is an availability cost, not a security gap. Operational rule: before off-boarding an operator, list their open recoveries.

**F9 — the order can be pushed to FAILED repeatedly (accepted; Low).** After the manual removal and before completion, a person holding the owner's password can enrol and verify a new factor at aal1; the completion then reports `factor_set_changed` and the order becomes failed. No takeover is possible (a window with any verified factor stays unverified; the gate refuses), but recovery can be delayed within the window. Controls: orders are re-creatable, every attempt is audited; the operator should complete the order immediately after removal.

**F10 — an owner can occupy the open-window slot (accepted; Low).** During the cool-off or the R1 phase the owner's old factor still works, so its holder (already the owner) can open an additional-factor window; the operator's window call then returns `window_already_open` until it lapses or is revoked. A delay only; the operator can revoke it (audited).

**F11 — some refusals leave no audit row (accepted; Low).** Argument-validation errors (SQLSTATE 22023) after the gate, a failed isolation guard (25000) and a non-staff 42501 raise and roll back, so no row exists (non-staff 42501 is deliberately silent so outsiders cannot flood the audit log). In rpc_owner_claim_factor a trigger rejection outside a sub-block would also raise, but identical checks run earlier under the lock, so it is not reachable by reading. Every business refusal is returned and audited. rev7's new RPCs follow the same pattern and add one deliberate case: the no-op calls of `rpc_refresh_auth_structure_check` write no audit row (a run does).

**F12 — the overview needs no step-up (accepted; Low).** `rpc_staff_owner_mfa_overview` uses the staff gate without step-up and discloses an owner's factor state and recovery request details (user ids, methods, references; no documents, no personal data) to any admin session with `owner.mfa.authorize`. It is audited. Requiring step-up would be a one-word change and is recommended if the project owner prefers; it was not changed because the decision accepted the risk.

### 5.1 Risks introduced or made explicit by rev7 (new; all bounded)

- **N1 (F3, evidence by order).** See section 4: eligibility to request an exception can now rest on an ordered removal with no completion. Bounded as described.
- **N2 (F4, no-show extension).** One more window without any verified removal. It opens no new capability (a factor still needs a verified removal or none needed, and the owner path is the same). A request that wastes four windows without a verified removal ends and restarts under the quotas. Cost: one more operator-authorized window per request.
- **N3 (F5, scope).** The path can only ever target a row the database classifies as `unrecognized` under a fresh passing structure check, for an active non-staff owner, by an operator with step-up. It never deletes anything, approves nothing, marks nothing verified and never touches windows or requests. Left open: a row that blocks recovery **and** coincides with a failed structure check (everything stays unknown; the refresh RPC and the structure check itself are the first step), and unknown rows that the operator cannot identify in the Dashboard (an operational question).
- **N4 (F7, refresh at aal1).** The refresh RPC deliberately needs no aal2 session, no staff session and no step-up (its callers are exactly the people locked out when the check is stale). It takes no argument and returns only a code and `passed`/`failed`. A password-only attacker can trigger a run only when it would have been due (no pass younger than 12 hours, no check younger than 15 minutes), so the result is true catalog state. Consequence: a failing structure shows up sooner for everyone (this is the intended fail-closed behavior). Cost: 6 calls per hour per user are counted in `private.rate_limits`.

## 6. F5: the unrecognized-factor path

States: `ordered -> completed | expired` (60 minute order, lazily expired and audited like the others). One open order per owner (partial unique index).

1. **Begin** `rpc_staff_begin_unrecognized_factor_removal(owner, factor, reason)`: capability `owner.mfa.authorize`, **fresh step-up**, READ COMMITTED guard first, explicit owner id **and** factor id and a reason (stored in the row only, never in an audit detail), self-change refused, the owner must be an active non-staff organization owner, the structure check must be fresh and passing, and the database must read **that factor row for that owner** as `unrecognized` (status or type outside `verified|unverified` and `totp|phone|webauthn`, or null). A recognized row (verified or not) is refused with `factor_recognized` (it follows the window and removal-order workflow, so a verified factor can never be removed through this path); a row of another user and a missing row both return `factor_not_found` (no disclosure; the audit row keeps the exact reason). Lock (2) only. An open order for the same factor is returned again; a different factor returns `order_open`.
2. The operator removes **only that row** in the Dashboard (outside the database; the database never writes to `auth.*`).
3. **Complete** `rpc_staff_complete_unrecognized_factor_removal(order)`: takes only the order id; the RPC and, independently, the update guard re-read the row and complete only if it is **absent**; a present, recognized, other-owner or unreadable row is a refused audited attempt.

`private.owner_verified_factor_ids` is unchanged: an unrecognized row still makes the state `unknown` (never verified, never empty), so no window opens and no order pretends the owner is clean until the row is gone. After completion the state may become readable; another unrecognized row needs its own order. Audit actions: `staff.owner_unrecognized_factor.begin|complete`, `owner.mfa_unrecognized_factor.expire`.

What the database does **not** verify: who removed the row, through which interface, that it was the right row of the right person in the Dashboard (it verifies that the **named** row of the **named** owner was unrecognized and later absent), or that no other row was affected.

## 7. F7: the structure-check refresh

`rpc_refresh_auth_structure_check()`: no argument; refuses everyone except an active staff member or an active organization owner (`not_available`, no counter row, no audit row); per-user limit 6 per hour (`structure_refresh`); under the SAME advisory lock key as `rpc_my_staff_context` of 0004 (`p2:structure_check_refresh`) it runs `private.run_auth_structure_check()` (0002) only if no passed check younger than 12 hours and no check of any outcome younger than 15 minutes exists (re-checked under the lock; future-dated rows do not count). So a caller can neither supply nor steer the result (the check reads the catalogs), can never replace a passing check younger than 12 hours by a later failing one, and the check runs at most once per 15 minutes however many callers there are. A run writes one audit row (`platform.structure_check.refresh`, outcome `success` for a pass and `failed` otherwise, detail: result and caller kind only). The 0004 refresher and the 0002 function are untouched (hashes pinned). Lock hierarchy: this RPC takes only the leaf lock and never any of (1) to (3); it is never called while an owner lock is held.

Availability consequence now handled: owners no longer depend on a staff member loading their context. What is still needed: someone (a staff member, an owner, or the application on their behalf) must call it at least once per 24 hours of activity; the application should call it on owner sign-in when `owner_mfa_ok` is false with `factor_state = 'unknown'`. A scheduler is not introduced (pg_cron is not part of the platform).

## 8. What cannot be tested offline (explicit)

Unchanged from rev6 and still true: that PostgreSQL parses the file at all (never done for any revision of 0005); how PostgreSQL 17 prints `pg_get_constraintdef` (F2 mitigated by normalization, not eliminated); whether each trigger and constraint behaves as written at run time; snapshot behavior of STABLE helpers called from BEFORE triggers; the real shape of `auth.mfa_factors` on the hosted platform and its enum labels; the structure check on a real project; Supabase Auth behavior when a factor row is deleted by hand or via the Admin API; concurrency (lock order and uniqueness were argued from the text and modeled, never run); **P1**: whether PostgREST on this project ends each RPC transaction with a commit (`db-tx-end`), so every guarantee that counts committed rows (quotas, the exception limit, the order attempt cap, audit rows of refusals) depends on an unverified assumption, and **no claim is made that any throttle or quota is effective** until the disposable-project test. New in rev7: the `FOR ... SELECT ... FOR UPDATE` loops (plain PL/pgSQL, but never run); that a locking SELECT whose WHERE clause calls STABLE helper functions behaves as intended in `close_expired_recovery_requests`; that an `UPDATE` from inside the loop does not conflict with the row locks taken by the loop (same transaction; expected fine); the refresh RPC under real roles (the same `private.run_auth_structure_check` of 0002, which has run on the hosted project in the staff path); that nobody can reach `private.owner_factor_row_class` directly (revoked from every API role; asserted by the self-check, not run).

## 9. Offline verification performed for this draft

All of the following are offline: no database was contacted, no SQL executed, no environment or credential file read, nothing installed, nothing applied, copied, committed or pushed.

| Check | Result |
|---|---|
| rev3, rev3.1, rev4, rev5, rev6 and migrations 0001 to 0004 byte-identical to their ledger hashes (`history/0005-hashes.txt`) | verified (the suite pins all nine hashes; `sha256sum -c`) |
| rev7 not in `supabase/migrations/` | verified |
| `owner-rev7.test.ts` against the rev7 draft | 64 of 64 pass; the whole project suite is 459 of 459 (395 before + 64). One run of the full suite showed a single timeout of an unrelated middleware test under load (5.2 s against the 5 s limit); it passes alone and in the repeated full run |
| `rev7-negative-controls.mjs` (previous F1 to F7 and F13 failures reintroduced, plus preserved properties tampered with) | 54 of 54 caught: 49 broken copies of the rev7 draft each make the suite fail, and 5 rev6 defects are reported by the static checker when the rev6 file is fed under a rev7 name. The first run caught 51 of 54: three controls were MISSED because the tests were too weak (the unknown-state check of the factor gate, the eligibility check of the refresh, a grant of the refresh to anon); the tests were strengthened and the controls rerun |
| `static-check-p22.mjs --selftest` (new rules P32 to P38) and the checker on rev7 | selftest passes (59 samples: 9 clean accepted, 50 violations detected); the checker passes the rev7 file (53 functions, 44 definers, 24 public RPCs) and still passes the rev6 file under its own rules |
| the rev6 suite run against rev7 | 34 of 46 pass; the 12 failures are each an intended rev7 change (listed in 9.2) |
| shadow construction proof for rev7 (`shadow-construct.mjs --selftest`, P1 to P8 and 13 negative controls) | passes (all offline checks); emitted-SQL hashes in `history/shadow-emit-rev7-SHA256SUMS.txt` |
| dry-execution harness `dry-execute-0005-rev7.mjs`: offline self-test and guard tests | the offline self-test passes (hash, banner, counts: 5 of 5); `rev7-harness-guards.mjs` passes (22 checks: 7 broken copies each stop before any credential step, the real harness refuses to start without its flag); the harness was **never run against a database**. Its own catalog assertions were made case-insensitive too (it contained the same F2 pattern for the five-window constraint) |

### 9.1 The rev6 suite against the rev7 draft (12 intended differences)
1. rate-limit seed has 9 buckets, not 8 (`structure_refresh`); 2. the lookback expression is now `x.evidence_at > ...` (F3); 3. the code extractor reads the new path label `verified_removal` as a result code (it is an audit label); 4. five reviewed direct readers of `auth.mfa_factors`, not four (`owner_factor_row_class`); 5. the one-live exception index is gone (F3); 6. the stranded function no longer tests `r.factors_removed_at is not null` alone (F3); 7. the closing code of exceptions is a loop with a per-row update (F13); 8. the "no statement assigns windows_issued" regular expression also sees the comparison `windows_issued = 3` in the no-show path (a comparison, not an assignment); 9. the order cancellation in `revoke_request_windows` is a loop with a per-row update (F13); 10. 22 guarded RPCs, not 19; 11. the table revoke list has seven tables; 12. thirteen foreign keys among seven tables, not twelve among six.

## 10. Recommendation

rev7 addresses all six mandatory findings in the text of the draft and removes one unverified construct, with regression tests for each and negative controls for the previous failures. It is **ready for an independent review of rev7** and, if that review accepts it, for the first step of the verification plan (`P2-REV7-VERIFICATION-PLAN.md`): a rolled-back dry parse and run in a disposable project that the project owner approves by naming the exact hash. Nothing in this document requests or assumes that approval.
