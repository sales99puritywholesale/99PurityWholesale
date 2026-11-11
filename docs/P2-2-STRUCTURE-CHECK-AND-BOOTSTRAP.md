# P2.2: structure-check refresh (D-P22-3) and first-administrator bootstrap — design proposals

> **STATUS UPDATE 2026-11-10 (documentation correction, D-V5). The original text below is kept as history.**
> - **D-P22-3 is APPROVED (option C) and IMPLEMENTED:** the opportunistic refresh sits in `rpc_my_staff_context` (0004) and 0004 is **applied** on the hosted development project. Executed so far: the refresh timing rules (12 hours passed, 15 minutes any outcome, active staff only), the advisory-lock presence and the non-staff and disabled-staff exclusions in the rolled-back transactional suite (89 of 89, simulated claims). **Not verified:** refresh behavior under concurrent callers, and a **failing** structure (drift).
> - **Structure drift is no longer "untestable":** in the planned shadow schema `p2s_auth.mfa_factors` is a stand-in that can be altered safely, so the failing-structure case and its race become testable there (`P2-STAFF-CONCURRENCY-TEST-DESIGN.md`, `P2-ISOLATED-VERIFICATION-PLAN.md` CC-20). The real `auth.mfa_factors` still cannot be altered.
> - **Bootstrap (Part B): NOT performed.** The preconditions "0003 and 0004 applied and verified" now hold; every other precondition and the written approval naming the user id and email are still required. No administrator, staff row or window exists. The tooling was tested only in refusal mode and every environment read now needs an explicit authorization flag (`P2-ENV-ACCESS-AUDIT.md`).
> - **Lost-factor recovery for staff** is unchanged (never self-service; another administrator opens a window; the break-glass path is the owner-run window script); for **organization owners** the approved recovery design is operator-assisted with a 24-hour cool-off (see the status block of `P2-2-P2-4-DESIGN.md`).
> - **Part C (plan table):** steps 1 and 2 are **done** (0003 and 0004 moved to `migrations/`, hashes recorded, applied, D-P22-3 decided); step 3 (bootstrap) is waiting for your approval; the numbering of later migrations changed (0005 is rate limits, owner MFA and recovery; invitations and onboarding are a later migration).

Status 2026-11-10. **Proposals only. Nothing here is applied, and the bootstrap writes are not authorized.** Both sections need your decision.

## Part A. D-P22-3: refreshing the MFA structure check without weakening it

### A.1 The mechanism that exists (migration 0002, applied on hosted)
`private.mfa_check_ok()` — part of `private.staff_session_ok()` — returns TRUE only if **all** hold:
1. `private.platform_validations` has a row `auth_mfa_factors_shape` with `status = 'passed'`, `checked_at > now() - 24 hours` and `checked_at <= now()`;
2. the caller has at least one **approved** verified TOTP factor and no verified factor that is not approved (any type) and no factor row with an unreadable or unrecognized type/status;
3. no error occurs while evaluating this (any exception returns FALSE).
`private.run_auth_structure_check()` (SECURITY DEFINER, not executable by any API role) verifies that `auth.mfa_factors` still has the five columns we read (`id`, `user_id`, `factor_type`, `status`, `created_at`) with the right data types and the enum labels `verified`/`unverified`/`totp`, plus a zero-row probe, and **upserts the single row** with `passed` or `failed`. It records the truth; it cannot make a failing structure pass.
Today the table is empty, so all staff access is denied, and there is **no scheduler** (pg_cron is not installed). A passed row expires after 24 h, which would lock every admin out once a day unless something refreshes it.

### A.2 Proposed design (draft already inside `0004`, function `public.rpc_my_staff_context`)
**Who/what triggers a refresh.** Only a signed-in caller who is an **active** staff member, inside `rpc_my_staff_context()` (the single call the application server makes to build the staff context). Never an anonymous user, never a non-staff user, never a disabled staff member, never the browser directly (the caller cannot choose to run it; it happens only when the rule below is true).

**When it runs (both must be true):**
- no `passed` check younger than **12 hours** exists (so a normal day of activity keeps it fresh while the 24 h validity leaves a 12 h margin), and
- no check of **any** outcome ran in the last **15 minutes** (cool-down: a genuinely failing structure is retried at most every 15 minutes, not on every request).

**Concurrency.** `pg_advisory_xact_lock(hashtextextended('p2:structure_check_refresh', 0))` serializes concurrent callers; after acquiring it the rule is **re-evaluated** (double-checked locking), so one of N simultaneous callers runs the check and the others observe its result. The lock key is independent of the 0002 lock hierarchy (`m1:last_admin` → organization row → per-user), and `rpc_my_staff_context` acquires no other lock, so no lock-order inversion is possible. The check itself takes no other advisory lock (catalog reads and a single-row upsert).

**Transaction boundaries.** The refresh runs inside the caller's RPC transaction. If that transaction later fails, the refresh rolls back with it and the next call retries. If it commits, the row is visible to every later transaction (READ COMMITTED). There is no autonomous transaction.

**Failure behavior (all fail closed):**
| Situation | Result |
|---|---|
| Structure drifted (a column renamed, a type changed, an enum label missing) | `run_auth_structure_check` records `failed`; the upsert **overwrites** any earlier `passed` row, so staff sessions are denied from the next evaluation on, not at the next 24 h expiry |
| The check function itself errors inside | recorded as `failed` with the SQLSTATE (the function catches and records it) |
| The upsert cannot complete (statement/lock timeout) | the exception propagates; `rpc_my_staff_context` errors; the application loads the deny-all context; the old row is unchanged and expires normally |
| `mfa_check_ok()` evaluation errors between refreshes | returns FALSE (existing behavior), independent of the refresh |
| No active staff member calls for >24 h | the row expires; staff are denied until the first active staff call re-validates; nobody gains access from the gap |
| An attacker calls the RPC repeatedly | non-staff cannot trigger anything; a staff member can cause at most one run per 15 min and one per 12 h when healthy |

**How it cannot grant access on a failed validation.** The refresh never writes `passed` directly: it calls the same check function, which writes `passed` only when every structural condition holds. Access additionally needs aal2, an approved factor, no unapproved verified factor, an active staff row and a role, all re-evaluated per request by `staff_session_ok()`. Nothing in the refresh reads or changes staff, role or factor data.

**What it does not do.** It does not weaken the check, does not add a second code path that skips validation, and does not run from a client-chosen trigger. It changes one thing relative to the approved 0002 text: the check can now run **automatically** by an active staff caller instead of only "deliberately" by the owner. That is the decision you are asked to make.

### A.3 Alternatives
| Option | Pros | Cons |
|---|---|---|
| **C (proposed): opportunistic refresh in `rpc_my_staff_context`** | no new extension, no secret, no Dashboard change; self-healing; bounded writes | refresh latency lands on one staff request after idle; first-ever refresh happens on the first staff call |
| B: `pg_cron` every 6 h calling `private.run_auth_structure_check()` | independent of traffic | needs the `pg_cron` extension enabled in the Dashboard (platform change, separate approval); adds a scheduler to monitor |
| D: external cron (Vercel) calling an endpoint | familiar | needs a credential that can execute a database function without service_role: a dedicated database role and connection string from a serverless runtime — a new secret and attack surface |
| E: owner runs it by hand daily | exactly the 0002 intent | operationally fragile; daily lockout risk |
Recommendation: **C now**, and B later if you prefer a scheduler. Either way no weaker validation path exists.

### A.4 Tests (once 0004 is approved for hosted)
Rolled-back transactions on hosted using only fixtures created inside the transaction: refresh runs when stale; does not run for non-staff/disabled/unauthenticated callers; honors the 12 h and 15 min rules; a `failed` result overwrites a `passed` row and denies; concurrent callers produce one run (two sessions, real concurrency, then cleanup of tagged rows); structure drift cannot be simulated on hosted (no DDL on `auth.mfa_factors`): that case stays **untestable** here and is covered by review of the 0002 function and the former local result.

> **[UPDATED 2026-11-10]** The rolled-back tests listed here were executed (suite of 89 tests, G10). The concurrency test and the drift test were **not** run: both are planned for the shadow schema, where the stand-in table can be altered (see the status block).

## Part B. First-administrator bootstrap proposal (nothing is performed)

### B.1 Requirements
No use of either existing validation account. No public self-promotion. A separately identified administrator account. Explicit authorization and audit. Waits for your separate approval before any write.

### B.2 Why self-promotion is impossible
- The staff tables have **no INSERT/UPDATE/DELETE grant** for any API role.
- Every staff RPC (0004) requires an **already verified staff session** with `staff.manage`.
- The first staff row can therefore only be written by the **database owner credential** (`postgres`), through the script below. The exclusion rule blocks any user who is an active organization member.

### B.3 Procedure (two owner-run steps and one human step)
**Preconditions (checked by the script, aborting otherwise):** migrations 0003 and 0004 applied and verified; the chosen user exists in Auth, has a confirmed email and a password they set, has **no** organization membership and **no** MFA factor yet; the user id differs from both validation accounts (compared with the recorded ids, never printed); `public.staff_members` is empty (the script refuses if any staff exists, so it cannot be reused to add admins later); exact user id and email match what you typed in the approval string.
**Identity of the account:** a **new** dedicated Auth user created in the Dashboard (Authentication → Users → Add user) with a real mailbox you control, e.g. `admin@<your domain>`; name and email are chosen by you. I do not create it.

**Step 1: owner-run, one transaction, dry-run by default (rolled back); committed only with an explicit flag:**
1. `insert into public.staff_members (user_id, status, created_by) values (:admin, 'active', null)`: `created_by` NULL marks the bootstrap row.
2. `insert into public.staff_roles (user_id, role, granted_by) values (:admin, 'admin', null)`.
3. `insert into private.staff_mfa_enrolment_windows (target_user_id, authorized_by, expires_at, reason) values (:admin, null, now() + interval '30 minutes', 'bootstrap of the first administrator')` — the 0002 design allows `authorized_by` NULL **only** for this script.
4. `private.write_audit(null, 'system', 'staff.bootstrap.admin', 'success', null, 'staff_member', :admin, {approval_ref, window_id})` — `approval_ref` is the reference you give (no secrets).
The last-admin and exclusion guards run as usual; the script prints only the window expiry.

**Step 2: human, within the 30 minutes:** the administrator signs in, enrols a TOTP authenticator (Supabase Auth, QR in the portal), verifies the first code, then calls `rpc_staff_claim_factor(window, factor)`. The call requires a fresh TOTP verification and the 0002 trigger checks the factor was created inside the window; the window is consumed.
**If the window lapses:** the one-open-window index counts lapsed windows (decision D-8), so a second owner-run script revokes it and opens a new one. Same preconditions and audit.

**Step 3: verification (read-only):** `rpc_my_staff_context` for the real session returns `session_ok = true`; the admin directory lists exactly one active admin; the audit log shows the bootstrap and approval events; the two validation accounts are byte-for-byte unchanged (digest comparison).

### B.4 Safeguards, audit and authorization
- Needs your **separate written approval** naming the user id and email, and the environment variable that arms the script (same pattern as `P2_HOSTED_APPLY_APPROVED`).
- Strict TLS pinned CA, one transaction, no retry, no secrets printed.
- Audit: the bootstrap and every later action by that admin are in `audit_events`; the first admin is created with `created_by`/`granted_by` NULL so it is recognizable as a bootstrap in `staff_members`/`staff_roles`.
- **Sole-admin risk:** the last-admin guard makes it impossible to remove or disable the only admin through the API, but a lost authenticator for the only admin is unrecoverable through the API (staff recovery needs another admin). Mitigation: create a **second** admin right after the first through `rpc_staff_add_member` (another person, own mailbox and authenticator); break-glass is the owner-run window script plus the lost-factor decision D-P24-2.
- Separation of duties: the person running the owner script (database credential holder) and the first admin should be different people, or the approval reference must document the same person acting in both capacities.

## Part C. Updated implementation plan
| Step | Content | Gate |
|---|---|---|
| 1 | 0003/0004: **parsed and behavior-checked by a rolled-back execution on hosted (done, see report)**; review SQL once more; move to `migrations/` with timestamps and recorded full SHA-256; extend `hosted-stage.mjs` (stages 3 and 4), separate hosted dry-runs | your approval to move the files, then **separate approvals to apply 0003 and 0004** |
| 2 | Decide D-P22-3 (Part A) and approve the bootstrap (Part B); then apply 0003, 0004 | your decisions |
| 3 | First administrator bootstrap (owner-run, two steps + human step); hosted integration tests for P2.2 with dedicated test accounts | separate bootstrap approval |
| 4 | P2.2 application: wire `getStaffAccessContext` into `authorizeAdmin`/admin layout behind a flag, admin pages (staff, roles, permissions, suspend/reinstate, audit viewer), server actions calling the RPCs | after step 3 |
| 5 | P2.3: draft 0005 (invitations, transactional outbox, onboarding, membership RPCs); local pure TypeScript (mailer adapter, link, schemas) is being built now; rolled-back hosted execution of 0005 needs its own approval | approval to dry-execute 0005 |
| 6 | P2.4: draft 0006 (recovery codes, controlled lost-factor recovery, security notifications); server flows for TOTP, step-up UX, password reset | approvals for 0006 and D-P24-1/2/3 |
| 7 | Integration tests on hosted across all three milestones; security verification report | each migration applied |

> **[SUPERSEDED rows]** Steps 1 and 2 of this table are complete (see the status block). The file numbering in steps 5 and 6 is superseded: 0005 is rate limits, owner MFA and operator-assisted recovery (rev3.1, not applied).
