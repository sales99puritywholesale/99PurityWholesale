# 0005 rev7: verification plan (isolated environment only; NOT approved, NOT started)

Status 2026-11-10. **This is a plan. Nothing in it has been run and no approval is requested or assumed.** Every step that touches a database needs its own explicit approval that names the exact file hash. The artifact under test is `supabase/review/0005_rate_limits_and_owner_mfa.rev7.sql`, sha256 `7d5db7c0b61e51ba6fcfcf01c9e3e6281fbe6ca339969e23cfd8d6a19918eb90`; a change to that file changes the hash and invalidates this plan until it is re-pinned (`tests/dry-execute-0005-rev7.mjs`, `tests/rev7-harness-guards.mjs`, `history/0005-hashes.txt`, `history/shadow-emit-rev7-SHA256SUMS.txt`, `history/rev7-DELIVERABLES-SHA256SUMS.txt`).

This document supplements, and does not replace, `P2-ISOLATED-VERIFICATION-PLAN.md` (rev 5 of that plan, items R6-01 to R6-15 and CC-39 to CC-44), which stays valid for everything rev7 did not change. Items here are numbered R7-nn and are the ones that are new or changed in rev7.

## 0. Rules that apply to every step

1. **The shared hosted development project (`99purity-portal-dev`) is never used for exploratory tests.** Every functional or concurrency step below runs in a disposable Supabase project (created for the purpose, then deleted) or a shadow schema in a disposable database. The project owner decides which, and approves each step separately.
2. The first step is always a **rolled-back dry parse and run** (`dry-execute-0005-rev7.mjs --authorized-rolled-back-execution`): one transaction, guaranteed rollback on success and failure, no migration history row, a before/after snapshot comparison. It requires its own approval naming the hash and the target.
3. No credential or environment file is read by any offline script. Credentials for an approved run are supplied by the project owner for that run only.
4. Results are reported as observed, including failures. A passing step proves only what the step observed.
5. **P1 is unresolved** (the PostgREST transaction end). Until R7-15 passes in a disposable project, no result may claim that quotas, counters, caps or audit rows of refusals survive; nothing may claim throttling is effective.

## 1. Preconditions (checked offline, repeatable)

| # | Check | Command |
|---|---|---|
| P-1 | the nine preserved hashes (rev3, rev3.1, rev4, rev5, rev6, 0001 to 0004) and the rev7 hash equal the ledger | `sha256sum -c history/rev7-DELIVERABLES-SHA256SUMS.txt` |
| P-2 | rev7 tests and negative controls pass | `npx vitest run tests/portal/owner-rev7.test.ts` (PowerShell, uppercase drive); `node supabase/review/tests/rev7-negative-controls.mjs` |
| P-3 | static checker and its self-test pass | `node supabase/review/static-check-p22.mjs --selftest` then on the rev7 file |
| P-4 | harness guards pass and the offline self-test passes | `node supabase/review/tests/rev7-harness-guards.mjs`; `node supabase/review/tests/dry-execute-0005-rev7.mjs --offline-selftest` |
| P-5 | shadow construction proof passes with the rev7 file | `node supabase/review/tests/shadow-construct.mjs --selftest --0005 <rev7 path> --0005-sha <hash>` |

## 2. Steps new or changed in rev7

Each step lists the finding it covers, what is done, the expected observation and what a failure means. "Real Auth" means a real Supabase Auth user and a real `auth.mfa_factors` row in the disposable project, never a hand-made row, except where stated.

| ID | Finding | Step | Expected observation | Failure means |
|---|---|---|---|---|
| R7-01 | all | rolled-back dry parse and run of rev7 | the file parses; the self-check DO block passes; 53 functions, 10 tables, 20 triggers, 9 policy rows exist inside the transaction; after rollback nothing remains | any parse or self-check error: the draft is wrong; fix as a new revision, never patch in place |
| R7-02 | F2 | read `pg_get_constraintdef` of `owner_recovery_requests_windows_bounded` and every other asserted catalog text; compare with the patterns of the self-check | the text matches the patterns; record the exact printed text in the report | the self-check would abort (R7-01 fails): adjust the pattern in a new revision |
| R7-03 | F2/F4 | behavioral proof of the five-window maximum: in a transaction, try to set `windows_issued = 6`, `extra_windows_granted <> greatest(windows_issued - 3, 0)`, `windows_issued = 5` with `extra_windows_granted = 2` (allowed) and a decrease | the first two fail with 23514, the third succeeds, the decrease fails | the constraint or guard is wrong |
| R7-04 | F1 | with real Auth: enrol an owner (first window), then perform three consecutive complete recoveries (cool-off bypass only by setting test timestamps in the disposable database); after each, the old factor is removed | a fourth and a fifth recovery each approve a new factor; `owner_mfa_factors` keeps one row per approval (history preserved); a fourth LIVE approved factor via additional windows is refused (23514) | the limit is wrong; rev6 behavior reproduced if the fourth recovery fails |
| R7-05 | F3 | stranded anchor scenarios with real rows: (a) removal verified, request expires, exception requested and granted, exception-carrying request created, then it expires with no removal; (b) the same but the carrying request is cancelled; (c) an owner-code request created and cancelled after a stranded state; (d) a window lapses between the manual removal and `complete` | in (a) to (d) `owner_stranded_request` still returns the original anchor (d: through the order evidence); the granted exception is NOT cancelled by (c); a new exception can be requested in (a) and (b) | the anchor definition is wrong |
| R7-06 | F3 | limits: a third exception within 30 days; evidence older than 30 days; a request completed after the evidence | `exception_limit`; not stranded; not stranded | the limits are wrong |
| R7-07 | F3 | double consumption: two initiations with the same exception id, concurrently and sequentially | exactly one succeeds (unique index on `exception_id`, owner lock) | the uniqueness is wrong |
| R7-08 | F4 | request with a live factor; three windows opened and allowed to lapse unverified; call the extension RPC | the fourth window opens (`path: no_show`); a fifth call without a verified removal returns `removal_not_verified`; after a verified removal in the fourth window the fifth opens (`verified_removal`); a sixth call returns `recovery_window_limit`; the counters equal the window rows throughout | the extension logic or counters are wrong |
| R7-09 | F5 | an unrecognized factor row: in the disposable project ONLY, add an enum label to `auth.factor_status` (or a type label) and insert a row with it for the owner, or set `status` to such a label | `owner_verified_factor_ids` is NULL, the state is `unknown`, no recovery window opens, `rpc_staff_begin_factor_removal` returns `unknown_state` (rev6 behavior preserved) | the fail-closed behavior regressed |
| R7-10 | F5 | the order path: begin with (a) a recognized verified factor, (b) a factor of another user, (c) a missing id, (d) the unrecognized row, without step-up, as a non-operator, as an operator targeting themselves; remove the row by hand; complete; complete again | (a) `factor_recognized`; (b) and (c) `factor_not_found`; (d) `order_created`; refusals audited with the exact reason; step-up and capability enforced; completion refused while the row exists, succeeds when absent, idempotent; the state becomes readable | the path is wrong |
| R7-11 | F7 | refresh RPC as a customer (non-staff non-owner), as an owner at aal1, as active staff, as disabled staff; repeat quickly; make the check stale and fresh | `not_available` (no row, no audit) for the customer and the disabled staff; owner and staff refresh only when no pass younger than 12 hours and no check younger than 15 minutes; at most one run per 15 minutes; a seventh call in an hour is `rate_limited`; a fresh pass is never replaced; each run writes one audit row | the refresh rules are wrong |
| R7-12 | F7 | contention: 20 concurrent refresh calls with a stale check, together with `rpc_my_staff_context` calls | exactly one check run (one `platform_validations` update); no deadlock | the shared lock or the global rule is wrong |
| R7-13 | F13 | exercise every loop of `close_expired_recovery_requests` and `revoke_request_windows` with rows in every state (expired request with open window and open order, expired order, expired exception, exception whose owner is no longer stranded, unknown state) | each row moves once, one audit row each, no deadlock, the unknown state does not cancel an exception | the loop rewrite is wrong |
| R7-14 | locks | concurrency: two staff on one owner (authorize, extension, begin, complete, cancel, approve), owner claim versus staff revoke, two initiations, an unrecognized-order begin versus a request close; run for at least 1000 iterations with random interleavings | no deadlock; every outcome is one of the documented codes; invariants hold (one open window, one open request, counters equal window rows, at most one consumption per exception) | the lock hierarchy is wrong |
| R7-15 | P1 | the transaction-end test of `P2-POSTGREST-TX-INVARIANT.md`: through the real PostgREST of the disposable project, call a refusing RPC with `Prefer: tx=rollback` and the default, then read back the audit and counter rows | recorded as observed: whether the audit row of a refusal, the counter row and a granted quota persist | decides whether any commit-dependent guarantee may be claimed |
| R7-16 | all | full RPC matrix through PostgREST with real roles (anon, authenticated customer, owner aal1, owner aal2, staff aal1, staff aal2 without and with fresh step-up, admin) for all 24 RPCs | every response is one of the documented codes; no 5xx; no information beyond the documented | an authorization hole or an unsafe error |

## 3. Regression coverage for the rev6 review findings (offline, already in place)

F1 to F7 and F13 each have regression tests in `tests/portal/owner-rev7.test.ts` and a negative control in `supabase/review/tests/rev7-negative-controls.mjs` that reintroduces the failure and requires the suite to fail; the static checker carries rules P32 to P38 with self-test samples; the rev6 file renamed to a rev7 name trips P32, P33, P34, P35 and P38. These are offline text checks and models; **they do not replace R7-01 to R7-16**.

## 4. What this plan cannot settle

Anything about the hosted project's real Auth behavior beyond the disposable project's version; whether the hosted PostgREST version behaves like the disposable one (R7-15 must be repeated against the exact hosted version if the project owner wants the claim for production); behavior under load; the break-glass procedure (no code path exists); the erasure procedure (not implemented, blocked by `ON DELETE RESTRICT` by design).

## 5. Order and stop rules

R7-01 first (alone). If it fails, stop and report; do not continue. R7-02, R7-03, R7-09 and R7-13 next (single-session). Functional R7-04 to R7-08, R7-10, R7-11 only after those pass. Concurrency R7-12 and R7-14 last. R7-15 may be done any time in a disposable project and is the gate for any claim about throttling. After every step the disposable project is returned to a known state or deleted. The decision to apply anything to the hosted development project is a separate gate with a separate approval and is **not** part of this plan.
