# P2.2 – P2.4 design: staff authorization, organization membership, account security

> **STATUS UPDATE 2026-11-10 (documentation correction, D-V5). The original text below is kept as history; where it is superseded an inline marker says so.**
> **Actual state of the platform work:**
> - **Migrations 0001 to 0004 are APPLIED** on the hosted development project `99purity-portal-dev` (history `20261108000001` to `20261108000004`; 0003 and 0004 applied 2026-11-10 after a hash-checked preflight; post-apply verification 50 of 50). The four files are byte-identical copies in `supabase/migrations/` with manifest entries (`e1aa9d15…` for 0003, `8a6a5003…` for 0004). No bootstrap was performed: **no administrator, staff record, organization, enrolment window or recovery code exists**.
> - **0005 is NOT applied.** Its content is no longer "invitations": it is **rate limits, owner MFA with operator-authorized enrolment, and operator-assisted recovery** (current reviewed candidate **rev3.1**, sha256 `8548e27e7c800d9d38f8bb6dca1dcb11f7755785b1e6fa0f0616120f05443e8d`, canonical file `supabase/review/0005_rate_limits_and_owner_mfa.sql`; rev3 `c6400e50…` kept in `supabase/review/history/`). Rev3 failed its rolled-back dry execution at its own final self-check; rev3.1 executed to completion in one rolled-back transaction (67 of 68 assertions, the one failure being a mis-specified assertion of the harness) and left no trace. A **rev4** (explicit window revocation, two-person operator-initiated recovery) is specified in `P2-4-0005-REV4-SPEC.md` and not written. **Invitations, membership RPCs and onboarding (the former "0005") will be a later migration; the number is not assigned.**
> - **Decisions now approved:** D-P22-1, D-P22-2, D-P22-3 (option C, implemented in 0004 and applied), D-P23-2 (M1 field set), D-P24-3 (PostgreSQL-backed atomic rate limits), D-P24-4 (owners must use MFA, with **approved** factors), D-P24-2 (lost-factor recovery is **operator-assisted**; no code deletes Auth factors), recovery rules (10 single-use codes, owners only, 24-hour cool-off, no code grants privileges or satisfies step-up), first owner enrolment by **operator-authorized window**, D-V1 to D-V5 (`P2-ISOLATED-VERIFICATION-PLAN.md`).
> - **Verification actually executed (hosted development, disposable accounts or rolled-back transactions):** 89 transactional tests of 0003/0004 (rolled back), 48 PostgREST checks with real disposable sessions, the 50-check post-apply verification, the owner-factor sequence test (abandoned-factor attack against the approval predicate on real Auth rows), the isolated rate-limit and nonce concurrency suite (38 of 38, 20 sessions), the rolled-back dry executions of 0005. Portal gate: 293 tests, intermittent P1 middleware-matcher test unchanged.
> - **Still unverified:** owner, operator and recovery **success paths** of 0005 (never executed with real rows), **staff concurrency** (last-admin, exclusion, double claims and windows, structure-check refresh races), real Auth and PostgREST integration of the new RPCs, the application email-abuse controls (design only, nothing built), the P2.3 and P2.4 application flows, the admin and portal pages. The plan to verify them in isolation is `P2-ISOLATED-VERIFICATION-PLAN.md`; the isolation proof dossier is `P2-SHADOW-ISOLATION-PROOF.md`.

Status 2026-11-10. **P2.2 is partly implemented (TypeScript core, tested) and its database part is drafted (not applied anywhere).** P2.3 and P2.4 are designed here and not implemented. Nothing in this document has been applied to the hosted project beyond migrations 0001 and 0002.

## 1. Environment and test policy
- Hosted Supabase development project `semtmllmwhxznxechfsk` is the only database. No Docker, no local Supabase stack.
- Migrations are applied only through the reviewed staged procedure (`HOSTED-APPLY-RUNBOOK.md`: strict TLS, hash check, dry-run, per-file transaction, post-verification) and **only after explicit approval of each migration**.
- Unit tests, TypeScript, lint and build run locally. Database tests run on hosted with isolated test records (see section 9).
- No service-role key, in any milestone, as an authorization workaround.

## 2. What exists after P2.1 (hosted, verified against the migration source)
13 tables (9 public, 4 private), RLS on all, 20 functions in `private`, staff roles `admin`/`finance`/`operations`/`support` (no super-admin), 27 capabilities, last-admin and last-owner guards, staff/member exclusion (disabled staff rows included), enrolment-window and approved-factor tables with database-level rules. **No write path exists for the API roles yet** (no RPCs, no audit log, no step-up, no invitation workflow). Staff access is denied until a structure check has passed, an admin exists and holds an approved factor.

> **[HISTORICAL as of P2.1]** Since then 0003 and 0004 were applied: `public.audit_events` (append-only), 15 functions (5 in `private`, 10 `public.rpc_*`), one policy, two triggers.

## 3. Authorization architecture (defence in depth)
```
Browser ── never supplies roles, aal, MFA state
   │
Edge middleware ── signed-in? (+ flag for /admin; P1 default: /admin is 403 for everyone)
   │
Server layout / page / server action / route handler
   ├─ getPortalUser()           verified with the auth server (P1)
   ├─ getStaffAccessContext()   one call: public.rpc_my_staff_context()  → deny-all on any error or malformed answer
   ├─ evaluateStaffAction(ctx, actionId)   pure, default-deny, central registry (UX gating and early denial only)
   │
   └─ supabase.rpc('rpc_staff_…')  with the user's OWN session  ──►  PostgreSQL
                                                              private.staff_gate(capability, step-up)   ← authoritative
                                                              private.has_capability / staff_session_ok (aal2 + approved factor
                                                                 + fresh structure check)
                                                              private.step_up_ok()  (JWT amr: TOTP within 15 min)
                                                              triggers: last admin, exclusion, window/factor approval rules
                                                              private.write_audit()  same transaction
```
- **The database is authoritative.** The TypeScript layer is a mirror for navigation, early denial and typing. A unit test parses migration 0002 and fails if the TypeScript role/capability mapping ever differs from the seed.
- **Mutations are RPC-first.** The staff tables have no INSERT/UPDATE/DELETE grant for any API role. Each RPC is `SECURITY DEFINER`, `search_path = ''`, in schema `public` (the exposed schema), executable by `authenticated` only, never by `anon`, `service_role` or PUBLIC.
- **No super-admin and no bypass.** Admin holds all 27 capabilities, nothing more. An admin cannot change their own staff record (see D-P22-1).
- **Hiding a link is cosmetic.** Navigation visibility (`admin-nav.ts`) maps each module to capabilities; unmapped modules are hidden from everyone.

## 4. Step-up policy (central registry: `src/lib/portal/permissions/actions.ts`)
Fresh TOTP verification within **15 minutes** (`private.step_up_ok()` reads the signed JWT `amr` claim: verified in hosted validation V1–V3, "mode reverify"). Required for:

| Class | Actions (registry ids) |
|---|---|
| Staff role changes | `staff.member.add`, `staff.role.grant`, `staff.role.revoke` |
| Staff suspension / reinstatement | `staff.member.suspend`, `staff.member.reinstate` |
| MFA changes | `staff.mfa.window.authorize`, `staff.mfa.window.revoke`, `staff.mfa.factor.remove`, `mfa.factor.remove`, `mfa.recovery.generate`, claim of an enrolled staff factor (checked in `rpc_staff_claim_factor`, decision D-16(b)) |
| Ownership and sensitive membership | `org.ownership.transfer`, `org.owner.remove`, `org.member.remove`, `org.invite.create.owner` |
| Financially sensitive administration | `payments.confirm`, `payments.reconcile`, `financial.write` |
| Other sensitive administration | `org.status.change`, `org.members.manage`, `flags.change`, `gates.change`, `documents.delete`, `account.password.change` |
Every step-up action is audited (a unit test enforces this). Plain reads are not step-up.

## 5. Migration plan (each stops for approval before hosted)
| # | File (draft) | Content | State |
|---|---|---|---|
| 0003 | `supabase/review/0003_audit_and_step_up.sql` (sha256 `e1aa9d15696913e25f5916ccc036b9c5f44d668dba95922dea87c5ac36e5fa60`) | append-only `audit_events` (RLS, `audit.read` only), `private.write_audit`, `private.last_totp_at`, `private.step_up_ok`, `private.staff_gate` | **parsed and behavior-checked by a rolled-back execution on hosted (2026-11-10)**; static check passes; stays in `review/`; **not applied** |
| 0004 | `supabase/review/0004_staff_management_rpcs.sql` (sha256 `8a6a5003d46ecd0daa1f5149566ac452076f637a9ed38a9da5125273551fc12b`) | 10 `public.rpc_*` functions: directory, my context, lookup, add member, grant/revoke role, suspend/reinstate, authorize/revoke window, claim factor | same; contains the D-P22-3 refresh in `rpc_my_staff_context` (pending decision); **not applied** |
| 0005 | (P2.3) invitations, membership RPCs, onboarding | designed, section 7 | not written |
| 0006 | (P2.4) recovery codes, factor removal, security notifications | designed, section 8 | not written |
Validation available without a local database: source review, `static-check-p22.mjs` (text patterns, with a self-test that detects 22 deliberate violations), and **a rolled-back transactional dry-execution on hosted (needs your approval: it executes the DDL on hosted inside `BEGIN … ROLLBACK`)**. Until one of those runs, the SQL has not been parsed by PostgreSQL.

> **[SUPERSEDED 2026-11-10]** 0003 and 0004 are applied and verified (see the status block). The statements "not applied" and "stays in review/" above are historical. The rows 0005 and 0006 are also superseded: 0005 is now rate limits, owner MFA and operator-assisted recovery (rev3.1, not applied); invitations, membership and onboarding move to a later, unnumbered migration.

## 6. P2.2 detail
**Implemented and unit-tested (219 portal tests pass):** capability catalog and role mapping (equal to the seed), action registry, default-deny evaluator, step-up evaluation with the same clock allowance as the database, admin navigation visibility, strict context parser (deny-all on any malformed answer), server loader `getStaffAccessContext` (not wired in).
**Drafted, not executed:** the database half (0003, 0004).

> **[SUPERSEDED]** The database half (0003, 0004) is applied. The admin pages, server actions, the flag for `/admin` and the replacement of the hard-deny `authorizeAdmin()` are still not built, and no administrator exists (bootstrap not performed).
**Not built yet:** admin pages (staff list, role assignment, permission review, suspend/reinstate, audit viewer), server actions, the flag that lets the middleware pass authenticated users to `/admin`, replacing the hard-deny `authorizeAdmin()`. These need 0003/0004 applied first because they call the RPCs.
**Invariants reused from 0002 (not re-implemented):** last-admin protection (BEFORE lock + AFTER final-state check), staff/member exclusion, window and factor approval rules, TRUNCATE blocks.

### First-admin bootstrap (owner-run, not an RPC)
There is no admin yet. Outside the API: insert the staff row and the `admin` role for the chosen user, open a window with `authorized_by` NULL, let that user enrol TOTP, and then call `rpc_staff_claim_factor` (or the owner-run claim). This is a hosted write and **needs your explicit approval and the choice of which user becomes the first admin** (the two existing validation accounts must not be modified).

## 7. P2.3 design (not implemented)
- **Tokens:** 32 random bytes (`extensions.gen_random_bytes`), shown to the inviter once, stored only as SHA-256 in `private.organization_invite_secrets.token_hash` (bytea 32, already in the schema). Lookup by hash with constant-time semantics. Default expiry 7 days (schema default).
- **RPCs (all `rpc_*`, definer, pinned):** create (owner; `owner` role needs step-up), resend (reissue token, invalidates the old hash), revoke, accept, list, member remove / restore / set role, transfer ownership (step-up), activity list. Accept runs in one transaction: lock invite `FOR UPDATE`, verify hash, not expired/revoked/accepted, organization `active`, JWT email equals invited email AND email confirmed in `auth.users`, user is not staff (trigger), no active membership; then insert or reactivate the member row and mark the invite accepted. Concurrency relies on the invite row lock plus the existing unique and exclusion guards.
- **No enumeration:** invitation status messages are the same for unknown, expired and revoked tokens.
- **Delivery and the outbox (approved defaults):** the invite RPC inserts an **outbox row in the same transaction** as the invite (`invite_id`, template, status `pending`/`sent`/`failed`, attempt count, last error *code*): delivery intent is therefore atomic with the invitation. The outbox **never contains the raw token** (a hard rule): the token is returned once, to the inviter's server action, which hands it to a **provider-independent mailer adapter** immediately after the commit and then records `sent` or `failed`. A failure never loses the invitation: the owner uses *resend*, which issues a **new** token (old hash invalidated) and queues a new attempt. Consequence: a background dispatcher cannot send an invitation by itself (it would need the token); retries are owner-initiated. **No provider is configured**, so the default adapter is a null mailer that returns "not configured" (the invitation stays `pending`, nothing is sent, and in development the inviter sees the one-time link).
- **Onboarding:** one row per organization with status (`draft`, `submitted`, `changes_requested`, `approved`), a validated profile, save/resume and staff review through `onboarding.review`. Required fields are a business decision (D-P23-2); nothing legal or compliance-related will be invented.
- **Customer UI** (members list, invites, onboarding) and **staff review UI** follow the existing portal shell and are built after 0005 is approved and applied.

## 8. P2.4 design (not implemented)
- **TOTP:** Supabase Auth's own enrol/challenge/verify (returns the QR as an SVG data URI, so no QR dependency is needed). Staff factors additionally require an authorized window and `rpc_staff_claim_factor`.
- **Sessions:** server-verified identity (`getUser`), no client-supplied claims, step-up from the signed token, sign-out revokes the session, global sign-out after password reset or factor removal. Open-redirect protection already exists (P1).
- **Recovery codes:** Supabase has no native TOTP recovery-code flow. Design: 10 single-use codes, ≥80 bits, stored as SHA-256 in a private table, shown once, regenerating invalidates the old set (step-up). What a code may *do* is decision D-P24-1.
- **Lost authenticator, staff:** never self-service. Another admin authorizes a new enrolment window; removing the old factor needs a definer function that deletes the row in `auth.mfa_factors` (a write into the auth schema, which the rule set forbids by default): decision D-P24-2.
- **Password reset:** Supabase Auth `resetPasswordForEmail` with a generic response (no account enumeration), expiring links, session invalidation after reset, no bypass of staff MFA. Throttling comes from Auth rate limits plus an application-side limiter (decision D-P24-3).
- **Security notifications** need the same mail path as invitations.

### 8.1 Recovery state transitions and factor-removal safeguards (approved defaults)

> **[SUPERSEDED 2026-11-10 by the approved recovery design]** The 30-minute `recovery_pending` flow below is replaced by: ten single-use owner-only codes create only a **recovery request** with a **24-hour cool-off**; completion is **operator-assisted** (the operator removes the factors by hand, then opens an operator-authorized recovery window; the owner enrols a new factor inside the window and claims it with a fresh TOTP). Staff never use codes. No recovery code grants privileges or satisfies a step-up. A fallback for owners who lost both factor and codes (two-person, externally verified, same cool-off) is specified for rev4. See `P2-4-RECOVERY-FACTOR-REMOVAL-DESIGN.md` sections 9 to 12, `P2-4-0005-REV3-SECURITY-REVIEW.md` and `P2-4-0005-REV4-SPEC.md`. The observations about Auth behavior that the original text asks to verify were made on 2026-11-10 and are recorded in `P2-4-RATE-LIMIT-OWNER-MFA-AND-FACTORS.md`.
There is **no permanent MFA bypass** and a recovery code never creates an aal2 session or satisfies a step-up.

**Organization user (member or owner)**
```
no_mfa ──enrol+verify──► mfa_active ──lost device──► recovery_requested
mfa_active ──generate (step-up)──► recovery_codes_issued (10 codes, SHA-256, shown once; regenerating invalidates the old set)
recovery_requested ──valid unused code consumed (audited, single use)──► recovery_pending  (30 min, restricted)
recovery_pending ──new TOTP enrolled and verified──► factor_replaced ──old factor removed──► mfa_active (new codes issued)
recovery_pending ──30 min elapse / any step-up attempt / new code attempt after 5 failures──► recovery_expired ──► recovery_requested
```
While `recovery_pending`: only the security page (enrol a replacement factor) works; every RPC that needs step-up stays denied because no TOTP verification happened (the signed token proves it, not the application); throttling and generic error messages apply; all transitions are audited; sessions are invalidated after completion. Removal of the old factor: by the user at aal2 after the replacement is verified (Supabase Auth API). **To be verified on a hosted test account:** whether Auth allows enrolling a second factor at aal1 while a verified factor exists. If it does not, controlled removal needs a definer function writing to `auth.mfa_factors` (decision D-P24-2).

**Staff member (never self-service)**
```
staff_active (approved factor) ──lost device reported──► another admin acts (step-up, not self)
   ──rpc_staff_authorize_enrolment_window (≤60 min)──► window_open
   ──(controlled removal of the lost factor: approval row + auth factor, audited, needs D-P24-2)──► staff_denied (no approved factor: session_ok = false)
   ──member enrols new TOTP inside the window, verifies, rpc_staff_claim_factor (fresh TOTP)──► window_consumed ──► staff_active
window_open ──expires or revoked──► (new window needs a revoke of the lapsed one)
```
Safeguards for removing a staff factor: capability `staff.manage`, step-up, target is not the caller, audited with reason, impossible for the last active admin to remove their own only factor (self refusal), and the effect is immediate because `staff_session_ok()` requires an approved factor on every request (existing sessions are denied at once, no need to touch `auth.sessions`). Recovery codes are **not** offered to staff. A sole admin who loses their device needs the owner-run break-glass window script (see the bootstrap document).

## 9. Testing under hosted-only development
Will run locally: unit tests, `tsc`, ESLint, build, the static SQL checker. Will run on hosted (after the relevant migration is approved and applied), using **dedicated test accounts and test organizations created by the tests, never the two existing validation accounts**:
- RLS and tenant isolation, role/capability enforcement, last-admin/last-owner, invitations, MFA and step-up with real tokens (requires TOTP test accounts), concurrency, failure paths.
- Every test creates its own records, tags them, and removes only what it created. A test that fails mid-way leaves tagged rows that a guarded cleanup script removes by tag, never by pattern over other data.
- Write-path DB tests inside `BEGIN … ROLLBACK` where possible (no persistent data); committed data only for concurrency tests.
**Limitations compared with the former local Docker stack:** no `supabase_admin` (no destructive DDL drift tests, no state-building that bypasses guards), no throw-away database for destructive tests, tests share one project (rate limits, shared Auth config, shared event triggers), real e-mail confirmation and Auth rate limits apply to test accounts, tests that need TOTP codes must hold the secret in memory only. A test is reported as passed only if it actually ran.

## 10. Decision register (defaults chosen so work can proceed; each can be changed before hosted)
| ID | Decision | Default taken | Needs you |
|---|---|---|---|
| D-P22-1 | Can a staff member change their own roles, status or windows? | **No** (audited refusal `self_change_not_allowed`, enforced in the RPCs; the server layer also never offers the action for the own record) | **APPROVED 2026-11-10** |
| D-P22-2 | Are denials audited? | Verified staff members: yes (returned, not raised, so the audit row commits). Callers without a verified staff session: no row (raises 42501), so outsiders cannot flood the log. No credential, token, secret or recovery code is ever written to `detail` | **APPROVED 2026-11-10** |
| D-P22-3 | Structure-check refresh | design in `P2-2-STRUCTURE-CHECK-AND-BOOTSTRAP.md` part A; the draft in 0004 stays in `review/` and is not moved until decided | **NOT YET APPROVED** (design delivered) |
| D-P22-4 | Who reads the audit log | `audit.read` = ADMIN only (approved mapping). Customers see membership activity only through a sanitized RPC (no staff identity) in 0005 | confirm |
| D-P23-1 | Invitation e-mail delivery | **approved default:** provider-independent adapter + transactional outbox; **no live delivery** until a provider is selected | provider choice pending |
| D-P23-2 | Onboarding fields | **approved default:** the approved M1 fields only: organization `name`, `billing_address`, and the account-request business fields `contact_name`, `phone`, `country`, `website`, `business_type`. No tax ID, licence or other legal requirement is invented. **Admin approval is required before wholesale purchasing access** | confirm that no separate onboarding field list exists |
| D-P23-3 | Owner-role invitations and ownership transfer | step-up required | confirm |
| D-P24-1 | What a recovery code may do | **approved default:** single-use hashed codes, no permanent MFA bypass, controlled lost-factor recovery | exact transitions in section 8 below |
| D-P24-2 | Removing a lost staff factor | **approved default:** administrator-approved staff re-enrolment | the removal mechanism (definer write into `auth.mfa_factors`) still needs approval |
| D-P24-3 | Application-side throttling store | not decided (DB table vs. edge rate limit) | decide |
| D-P24-4 | MFA mandatory for organization owners? | optional; required for step-up actions | decide |
| F-RLS | FORCE RLS | not used (approved design: definer functions rely on owner rights) | none |

> **[SUPERSEDED decision statuses 2026-11-10]** D-P22-3: **approved, option C, implemented in 0004 and applied.** D-P24-1: approved (single-use hashed codes, no permanent bypass; exact transitions replaced as noted at 8.1). D-P24-2: **approved: operator-assisted initially; no Auth factor removal in SQL.** D-P24-3: **approved: PostgreSQL-backed atomic rate limits (0005).** D-P24-4: **approved: owners must use MFA, with approved factors.** D-P23-1: unchanged (adapter plus outbox, no provider configured). Open and new items are tracked in `P2-ISOLATED-VERIFICATION-PLAN.md` (decision register).

## 11. Remaining risks
- The two new migrations were never executed; PostgreSQL has not parsed them.
- `private.last_totp_at()` assumes the JWT `amr` entries carry `method` and an integer `timestamp`; this matches the V1–V3 evidence but must be confirmed with a real token before relying on it (first hosted integration test).
- Auth rate limits and the shared hosted project constrain test volume.
- The staff-structure check currently has no scheduler (D-P22-3).
- The intermittent P1 test failure (middleware matcher test) is unexplained; it reproduced twice in `check:portal`, not in 7 later runs, and the failing run's error text was not captured.

> **[UPDATED 2026-11-10]** Items 1 and 2 above are partly resolved: 0003 and 0004 were executed (rolled back, then applied) and the JWT `amr` shape was confirmed with real tokens. **Remaining risks:** 0005 has never run against real owner, operator or recovery rows; staff concurrency is unverified; the structure check still has no scheduler besides the opportunistic refresh; the intermittent P1 middleware test is still unexplained (it fails occasionally in the full run and passes when re-run alone).
