# P2.1 review of the M1 migration drafts (before any change)

Date 2026-11-08. **No security requirement was changed.** `supabase/migrations/` contains byte-identical copies of the reviewed drafts (rev2 and rev2.1); change control is enforced by `supabase/migration-hashes.txt` and `tests/db/guard.test.mjs`. Nothing has been applied to any database.

| File | sha256 (first 16) | Static checker |
|---|---|---|
| `20261108000001_foundation_identity.sql` (= draft 0001 rev2) | `28e2cebf55e07679` | PASS (text-pattern guardrail only) |
| `20261108000002_staff_capabilities.sql` (= draft 0002 rev2.1) | `852f13efef9754b1` | PASS (text-pattern guardrail only) |
| `supabase/review/static-check.mjs` (R1-R28, 27 violation samples + 1 clean) | `491092fc56604655` | self-test PASS |

The checker is not a parser. **The SQL has still never been parsed or executed by PostgreSQL.**

## 1. Specification against drafts

| Specification (M1 rev. 4) | Drafts | Result |
|---|---|---|
| Default deny: revoke all, default privileges, minimum grants | `alter default privileges` for `postgres`; revoke on every table and function; `grant select` only (profiles also `update(full_name, phone)`) | match |
| RLS on every table | enabled on all 13 tables (not FORCED, so definer functions bypass it as designed) | match |
| No DML for any API role; writes only through RPCs | no insert/update/delete grants except own profile columns; RPCs are not part of P2.1 | match (RPCs deferred) |
| `service_role` has no table privileges | none; self-check asserts it; no grant to `anon` or `service_role` anywhere | match, and consistent with the decision to defer the service-role key |
| Tenant isolation through active memberships only | `private.my_org_ids()` and `my_owner_org_ids()` filter `status = 'active'` | match |
| Last active owner cannot be removed or demoted (BEFORE lock + AFTER final-state check, cascade-safe) | present, closure exception present | match, **unproven** until run |
| Staff and members mutually exclusive, both directions, per-user advisory lock, READ COMMITTED | present (INSERT and UPDATE on both sides, staff `user_id` immutable) | match, unproven |
| Last active admin protected (advisory lock + marker + AFTER check) | present | match, unproven |
| TRUNCATE blocked on protected tables | `organization_members`, `staff_members`, `staff_roles` | match (D-14 accepted) |
| Staff read only through capability-gated policies; no profile or billing access | policies use `has_capability()`/`staff_session_ok()`; none on `profiles`, `organization_billing`, secrets | match |
| `private.is_aal2()` for staff: no unapproved verified factor of ANY type, at least one approved factor, structure validation fresh and not future-dated, fail closed | implemented as `mfa_check_ok()` + `staff_session_ok()`; any error returns false | match in substance; **naming differs** (see F2) |
| Approved factor must be verified TOTP created inside an open, unrevoked, unconsumed window of that user | `guard_staff_mfa_factor_insert` (uses `clock_timestamp()`, locks and consumes the window) | match, unproven |
| Seed: 4 staff roles, 27 capabilities, M1 mapping (admin 27, finance 8, operations 7, support 8) | seeded; the 0002 self-check asserts the counts | match |
| No `super_admin` | none; checker rule R3 | match |
| `auth.mfa_factors.secret` never referenced | checker rule R1 and R12 | match (static) |

## 2. Findings that need your decision (nothing was silently changed)

| ID | Finding | Drafts do | Options | Recommendation |
|---|---|---|---|---|
| F1 (D-1) | `organizations.created_by` is in spec section 2.2, but a staff user id readable by customers would reveal staff identity | column omitted; creator would live in the audit log (0003, not in P2.1) | keep omission or add the column | **keep the omission**; until 0003 the creator is simply not recorded |
| F2 (D-2) | The spec names a helper `is_aal2()`; the drafts have `staff_session_ok()` so that aal2 alone is never enough | no plain aal2 helper exists | rename or add an alias | **keep**; a plain aal2 helper would invite the mistake the guard prevents |
| F3 (D-4) | "Explicit, centralized OWNER/MEMBER checks": `is_org_member`/`is_org_owner` are not created | policies use `my_org_ids()` and `my_owner_org_ids()` (central); triggers hold their own counts | add the two wrappers now or with the RPCs | **defer to the RPC migration** (nothing calls them in P2.1) |
| F4 | Your brief writes OWNER and MEMBER; the stored values are lowercase `owner`, `member`, `admin`, `finance`, `operations`, `support` (CHECK constraints, policies, triggers) | lowercase | change case | **keep lowercase** (matches spec, checker and tests) |
| F5 | Your brief says staff cannot be members while ACTIVE staff; the drafts block any `staff_members` row, including `disabled` | stricter than the brief; spec says "in staff_members" | relax to active-only | **keep stricter**: a disabled employee cannot silently become a customer member. Confirm. |
| F6 (D-16b) | Specified: a fresh TOTP step-up is required when a factor is claimed. That needs 0004 (step-up) and the 0007 claim RPC | in P2.1 an approval row can only be inserted by the database owner (bootstrap), with the window and factor checks enforced by trigger | none inside P2.1 | **leave D-16(b) open for 0004/0007**; document that P2.1 has no application path to approve a factor |
| F7 | "Sensitive staff operations require the specified authentication assurance": the 15-minute step-up is 0004; P2.1 has no staff write RPC | staff READ access requires aal2 + approved factors + fresh structure check; staff WRITES have no API path | none | **by design**: nothing is weakened, the write path does not exist yet |
| F8 | Open register items D-5 to D-11, D-17, D-18 | encoded as drafted (D-8: window index counts lapsed windows; D-11: allow-list totp, phone, webauthn) | confirm or amend | confirm before 0003/0007; none blocks the first scratch run |
| F9 | `organization_invites` and `private.organization_invite_secrets` exist but no workflow | no privileges for any API role on the secrets table; invites readable by owners and `invites.read` staff | none | matches "schema only" |

**No security change is proposed before the first scratch run.** If the first run finds defects, each fix will be shown for review with its test evidence.

## 3. SQL that depends on Supabase Auth internals or platform permissions
Each of these is a hosted-platform assumption the scratch run will confirm or refute.
- `auth.users`: foreign keys with ON DELETE CASCADE/SET NULL, and a trigger on `auth.users` (needs TRIGGER privilege there, normally available to `postgres` on hosted projects).
- `auth.mfa_factors`: read by definer functions; only `id`, `user_id`, `factor_type`, `status`, `created_at` (never `secret`); enum types `auth.factor_type` and `auth.factor_status`; `information_schema.columns` and `pg_enum` introspection for the structure check. Validation V5a already read this table as `postgres` in the dashboard.
- `auth.uid()` and `auth.jwt()` (claims `sub`, `aal`) as exposed by PostgREST.
- Roles `anon`, `authenticated`, `service_role` and `postgres` as the migration and definer owner (D-3, provisional for 0001 and 0002).
- `private` schema not exposed by the Data API (project setting: exposed schemas must remain `public` and `graphql_public`).

## 4. PostgreSQL-version-sensitive constructs
`gen_random_uuid()` (core since 13), `hashtextextended` (11), `pg_advisory_xact_lock(bigint)`, `current_setting(name, true)` with a custom parameter `m1.admin_shrink`, `create trigger ... execute function` (11), `count(*) filter`, `has_function_privilege('public', ...)`, `pg_column_size`, `SET search_path = ''` on functions, ON DELETE actions inside cascades (ordering of internal RI triggers versus AFTER triggers: unproven), READ COMMITTED assumptions (D-13: verified at HTTP level by the PostgREST isolation probe). The CLI accepts majors 13, 14, 15 and 17; the scratch project's major is recorded and asserted by the harness.

## 5. Gaps the scratch run must close (unexecuted claims)
Parse success; trigger order and visibility; cascades (T-CS-A/B); concurrency (T-LA, T-EX, T-WT-8); hosted privileges of `postgres` on `auth` tables; `private` schema not reachable via PostgREST; fixture users able to sign in; isolation level seen by PostgREST. Tests that cannot run on a hosted project, and tests excluded from P2.1, are registered as SKIPPED in `tests/db/90-not-performed.test.mjs` and are never reported as passed.

## 6. Decisions recorded (owner, 2026-11-09)
| ID | Decision | Consequence |
|---|---|---|
| F1 | Accept the omission of `organizations.created_by` | creator is not recorded until the audit log (0003) |
| F2 | Accept `staff_session_ok()`; no plain AAL2 helper | unchanged |
| F3 | Defer `is_org_member` and `is_org_owner` wrappers to the RPC migration | policies keep using `my_org_ids()` and `my_owner_org_ids()` |
| F4 | Accept lowercase database role values | **application code must map explicitly** (for example `owner` to "Owner") and never rely on case |
| F5 | Accept strict staff/member exclusion, including disabled staff records, for P2.1 | **a future staff deprovisioning or conversion workflow must address this** (an ex-staff user cannot become a customer member until their `staff_members` row is handled by an audited process) |
| F6 | Defer fresh-TOTP claim validation (D-16(b)) to the later migration and claim RPC | existing checks are not weakened; P2.1 has no application path to approve a factor |
| F7 | Defer the 15-minute step-up to migration 0004 | unchanged |
| F8 | Keep unresolved register items open | no decision is invented |
| F9 | Accept the invitation tables as schema only | no invitation workflow in P2.1 |
