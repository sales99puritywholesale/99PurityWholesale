# P3 Tier R execution manifest

Status 2026-11-10 (revision 1 text); **revision 2 pins and the run history are in section 0**. **A MANIFEST. Nothing was executed: no database connection, no environment file read, no fixture written.** Tier L (local Docker stack) is **cancelled**; real GoTrue/TOTP and committed concurrency testing are **deferred** until an isolated test environment is explicitly approved. No second hosted project, no persistent write to `99purity-portal-dev`, no migration command, no Docker.

This manifest accompanies `docs/P3-REAL-WORKFLOW-VALIDATION-PLAN.md` (sections 3, 4 and 8 apply; section 0 tier L and section 5 are superseded by this document).

## 0. REVISION 2 (current pins and history). Sections 1 and 2 below are REVISION 1 text and are kept as historical records
**Nothing in revision 2 has been executed.** No dry run, no P0 and no Phase T has been run with any revision 2 artifact; no earlier run used them. Approvals for earlier runs do not extend to revision 2: each execution needs its own explicit approval naming the hashes below.

### 0.1 Current pins (revision 2)
| Artifact | Path | SHA-256 |
|---|---|---|
| Revised migration candidate | `supabase/review/p3/20261110000100_p3_catalog_pricing_orders.rev2.sql` | `d5efe7e9753b13c6ccaedf1fb70d31ab3431d967d46764ceb3cb290ce5195beb` |
| Seed (unchanged) | `supabase/review/p3/seed-products.sql` | `1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164` |
| Revised Phase T harness | `supabase/review/tests/p3-workflow-rollback.rev2.mjs` | `924aac9c7aad34f4cd58ac3362d9305998bc68f38f4f594cb4c83aa5ce83909b` |
| Revised dry-execution harness | `supabase/review/tests/dry-execute-p3.rev2.mjs` | `cb825bdf996049ba3f2af77fe2542d48cd7786a20c2bf51bbed08dd041d28e93` |
| Allow-list file (revision 2 header; **file hash changed because the header changed**) | `docs/P3-TIER-R-ALLOWLIST.txt` | `b70389a710fed399d9be8c1872a1520151e104fdd1739b1cc2dbc89668619617` |
| Allow-list, the 116 statement lines only (LF-joined, trailing LF; **unchanged**) | the statement lines of the file above | `0cec85111dd71156f81ec807e659dd410c81f99bc50b391a61afb0e63f507ceb` |
The 116 statements are byte-identical to revision 1 (verified). The revision 1 allow-list file is preserved unchanged as `docs/P3-TIER-R-ALLOWLIST.rev1-historical.txt` (file sha256 `21c041bd4d9d78e91f9927be05ca7fffc9dfa06ebbdfdd6f908cc49bc613ae45`, header naming harness `ea42dfbf…`). Other review aids: `docs/P3-REV2-ARTIFACT-ADDENDUM.md` (shipping coverage table and reconciliation) and the offline tests `p3-ship-validation-offline.mjs`, `p3-rev2-artifacts-offline.mjs`, `p3-rev2-clock-offline.mjs`, `p3-rev2-trigger-offline.mjs` (their hashes are in the final report, not pinned here).

### 0.2 What changed in revision 2 (relative to revision 1)
* **Migration candidate:** `private.shop_ship_to_ok` returns `coalesce(<same expression>, false)` and `rpc_checkout` rejects with `shop_ship_to_ok(...) is not true`. Nothing else differs from the original migration (`bfd391c1…`, unchanged). Reason: a Phase T run found that a missing required shipping key made the validator return NULL and checkout accepted the address (confirmed in the run; the fix is verified only by an offline model).
* **Phase T harness:** simulated TOTP claims are built from the client clock read once before `BEGIN` (revision 1 used the running wall clock, which broke step-up after 60 s because `now()` is frozen at transaction start); expectation ORG_B V11 = **11000** (fixed $5.00 markup 10000 + 500 = 10500 is below the floor 11000; revision 1 expected 10500, which ignored the floor); 18 setup calls assert their result and a failed setup blocks its dependent checks (states PASS / FAIL / BLOCKED / SKIPPED); T15g is SKIPPED; 37 shipping cases are added to T15f; the result file is `P3-TIER-R-P0-RESULT.rev2.json` (it also records the seed hash and the rollback / fresh-comparison outcome) so the revision 1 result file is never overwritten.
* **Dry-execution harness:** pins the candidate; requires `--harness-sha` equal to its own hash; writes a new timestamped result file with flag `wx`; adds read-only shipping probes (the private function and `rpc_checkout` as a non-member).
* **Revision 1 trigger-comparison fix** (table, schema and function are parsed from `pg_get_triggerdef`) is retained in revision 2.

### 0.3 Commands for an approval to name (NOT run)
* Dry run (rollback-only): `node supabase/review/tests/dry-execute-p3.rev2.mjs --authorized-rolled-back-execution --authorized-read-env-local --harness-sha cb825bdf996049ba3f2af77fe2542d48cd7786a20c2bf51bbed08dd041d28e93`
* P0: `node supabase/review/tests/p3-workflow-rollback.rev2.mjs --phase p0 --authorized-rolled-back-execution --authorized-read-env-local --harness-sha 924aac9c7aad34f4cd58ac3362d9305998bc68f38f4f594cb4c83aa5ce83909b`
* Phase t: the same with `--phase t --approval-ref <reference of the separate approval>`; refuses unless `P3-TIER-R-P0-RESULT.rev2.json` records a pass for this harness hash, this migration hash and this project ref.
* `--authorized-read-env-local` is the already-approved narrow mechanism (the single `P2_DATABASE_URL` line, in memory, never printed); if it is not authorized, supply `P2_DATABASE_URL` in the process environment instead.

### 0.4 History of runs and artifacts (historical records, not rewritten)
| Artifact / run | What happened | Used by |
|---|---|---|
| Harness `ea42dfbf…`, P0 run 1 | stopped in read-only inspection (a harness defect: the expected-trigger comparison used `regclass` text, which omits `public.`); no insert occurred; fresh-connection comparison identical | original migration not involved |
| Harness `fbfe6102…`, P0 run 2 | **passed 42 of 42**: exactly the two inserts, one indirect `profiles` row, rolled back, 16 fresh-connection comparisons identical. Result file `P3-TIER-R-P0-RESULT.json` records harness `fbfe6102…`, migration `bfd391c1…` (recorded `at` 2026-11-10T18:53:46.699Z) | proves nothing about revision 2 |
| Harness `fbfe6102…`, Phase T run (original migration `bfd391c1…`) | executed to the end and rolled back: **269 passed, 19 FAILED**; fresh-connection comparison identical, nothing persisted. 14 failures are clock-related (`step_up_required`; mechanism confirmed in code, elapsed time not logged), T12b and T15f #1 are independent (harness expectation; migration NULL defect), T16, T15e and T21 are unverified/dependent. No failure is claimed as passed | motivated revision 2 |
| Harness `791879b1…` | offline clock correction; never run against a database | superseded |
| Migration `bfd391c1…`, dry run (harness `dry-execute-p3.mjs` `4060fe94…`) | earlier rollback-only dry execution passed 66 of 66 on PostgreSQL 17.11 | original migration only |
| Revision 2 artifacts (section 0.1) | offline checks only | none |

## 1. Rollback harness — REVISION 1 (historical; superseded by section 0)
| Item | Value |
|---|---|
| Path | `supabase/review/tests/p3-workflow-rollback.mjs` |
| **SHA-256** | `fbfe61023157bb7102e134063d4c0aee557d1fa0b4c3da2f5835a8cc692035eb` |
| Allow-list file (exact SQL, generated by `--print-manifest`) | `docs/P3-TIER-R-ALLOWLIST.txt`, sha256 `21c041bd4d9d78e91f9927be05ca7fffc9dfa06ebbdfdd6f908cc49bc613ae45`, 116 statements (15 only in P0, 58 only in phase t, 43 in both) |
| Status | **written offline and never run against a database.** Verified so far: `node --check` (syntax), `--offline-selftest` (7 of 7: artifact hashes, allow-list rules, scenario tables, namespace), and six refusal gates (below). Behavior against PostgreSQL is untested: a first run can fail because of a defect in the harness itself, and any such failure is reported as a harness failure, not as a product finding |
| Any edit | changes the hash and invalidates this manifest; the approval must name the hash and the harness refuses `--harness-sha` that differs from its own hash |

Gates verified offline (each stops BEFORE any credential read or connection): no `--phase` → exit 2; `--phase p0` without `--authorized-rolled-back-execution` → 2; wrong `--harness-sha` (either phase) → 2; phase `t` without `--approval-ref` → 2; phase `t` with no P0 result file → 2.

**Commands (for the approval to name; not run):**
- P0: `node supabase/review/tests/p3-workflow-rollback.mjs --phase p0 --authorized-rolled-back-execution --authorized-read-env-local --harness-sha fbfe6102…35eb`
- T01–T21: the same with `--phase t --approval-ref <reference of the separate approval>`; refuses unless `P3-TIER-R-P0-RESULT.json` (scratch directory) records a **pass for this exact harness hash, migration hash and project ref**.

Credential mechanism: the established one from the P2 and P3 dry executions (`P2_DATABASE_URL`, or with `--authorized-read-env-local` the single `P2_DATABASE_URL` line of the local file read in memory); host must be `db.semtmllmwhxznxechfsk.supabase.co`, user/db `postgres`, port 5432, strict TLS against the pinned Supabase Root 2021 CA; the value is redacted from every message and never printed. **If you prefer that the environment file not be read at all, the run must be started with `P2_DATABASE_URL` supplied in the process environment by you.**

## 2. Approved artifacts — REVISION 1 (historical; the revision 2 migration candidate is in section 0.1 and is NOT yet approved)
| File | SHA-256 |
|---|---|
| `supabase/review/p3/20261110000100_p3_catalog_pricing_orders.sql` | `bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e` |
| `supabase/review/p3/seed-products.sql` | `1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164` |
Both are re-hashed before any connection; the migration and the seed are executed (phase t only, inside the transaction) only if the hash still matches. P0 does not execute them.

## 3. P0 (separate first step; stop on any failure)
**P0 applies none of the P3 objects.** Steps:

**P0-a. Read-only inspection on a fresh connection (no write).** Statements `p0.env`, `p0.priv`, `p0.columns`, `p0.enums`, `p0.triggers`, `p0.rules`, `p0.policies`, `p0.rls`, `p0.publications`, `p0.fks`, `p0.eventtriggers`, the namespace pre-check and the BEFORE snapshot (full text in the allow-list file). It checks: primary (not in recovery); the connection role may INSERT into `auth.users` and `auth.mfa_factors`; the enum labels `auth.factor_type` ∋ `totp` and `auth.factor_status` ∋ `verified`; every column the two inserts use exists; **no other NOT NULL column without a default exists** on either table; **no trigger other than the expected ones** on `auth.users`, `auth.mfa_factors` and `public.profiles` (expected: `auth.users.on_auth_user_created → private.handle_new_user()` and `public.profiles.profiles_touch → private.touch_updated_at()`); no rewrite rule; no publication containing these tables; the reserved test namespace is empty; the migration history is the four applied versions; no P3 table exists. **Any deviation stops P0 before a write** (the unexpected trigger definitions are printed so you can judge them).

**P0-b. ONE rolled-back transaction with exactly two fixture inserts** (`begin isolation level read committed`, `idle_in_transaction_session_timeout 120s`, `statement_timeout 60s`, `lock_timeout 10s`):
```sql
-- 1) p0.insert.auth.users   ($1 = b3000000-0000-4000-8000-0000000000f0, $2 = p3test-p0-<8 hex>@example.invalid)
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ($1::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now(), now())
-- 2) fx.insert.auth.mfa_factors   ($1 = b3000000-0000-4000-8000-0000000000f1, $2 = the user above)
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values ($1::uuid, $2::uuid, 'totp'::auth.factor_type, 'verified'::auth.factor_status, now(), now())
```
plus three read-backs (`select count(*) from public.profiles where user_id = $1`, the factor row, the counts), then `rollback`.

**P0 pass criteria:** the user insert succeeds and `on_auth_user_created` created **exactly one** `public.profiles` row (the only indirect effect); the factor insert succeeds and reads back as a verified `totp` factor of the probe user; inside the transaction the counts are exactly +1 `auth.users`, +1 `auth.mfa_factors`, +1 `public.profiles` and unchanged for identities, staff, roles, organizations, members and audit events; after `ROLLBACK` a fresh connection shows every before/after comparison of section 11 identical and the namespace empty. The result is written to `P3-TIER-R-P0-RESULT.json` (pass or not, harness hash, migration hash, project ref, time) and the process exits 4 on failure.

**If P0 fails:** the harness stops; fixture creation and T01–T21 are not attempted (phase `t` refuses without a passing result file). **If P0 passes: report the result and wait for approval** before phase `t`.

## 4. Triggers and indirect effects (from migrations 0001–0004; the live list is verified by P0-a before any write)
| Statement | Direct trigger or function | Indirect effects |
|---|---|---|
| `insert into auth.users` (P0 ×1, phase t ×17: 8 staff, 6 customers, 3 refusal targets) | `on_auth_user_created` (AFTER INSERT) → `private.handle_new_user()` | inserts `public.profiles (user_id) … on conflict do nothing` (one row per user; `profiles_touch` fires only on UPDATE). No identity, session or token row is created. No other repo trigger exists on `auth.users`; any platform trigger would be listed and stop P0 |
| `insert into auth.mfa_factors` | none in the repo | any platform trigger would be listed and stop P0. FKs to `auth.users` checked by constraint |
| `insert into public.staff_members` | `staff_members_not_member` → `private.guard_staff_not_member()` | takes `pg_advisory_xact_lock(hashtextextended(user_id))`, requires READ COMMITTED, refuses a user with any membership |
| `insert into public.staff_roles` | none on INSERT (the last-admin triggers fire on UPDATE/DELETE only) | none |
| `insert into private.staff_mfa_enrolment_windows` | `staff_mfa_windows_guard_insert` | requires an active staff target; `authorized_by` NULL is the bootstrap form it allows |
| `insert into private.staff_mfa_factors` | `staff_mfa_factors_guard_insert` (SECURITY DEFINER) | locks the window row `FOR UPDATE`, validates the factor (verified, totp, created inside the window), then `UPDATE`s the window (`consumed_at`), which fires `staff_mfa_windows_guard_update` |
| `insert into public.organizations` | none on INSERT | none |
| `insert into public.organization_members` | `organization_members_not_staff` → `private.guard_member_not_staff()` | advisory lock per user, READ COMMITTED required, refuses staff users; the guard/last-owner triggers fire on UPDATE/DELETE only (the RPC member-add tests do update/insert rows and fire them) |
| `select private.run_auth_structure_check()` | writes `private.platform_validations` (upsert) | one row written inside the transaction; rolled back |
| the P3 migration (phase t) | creates 9 tables, 27 functions, 10 triggers, the sequence, grants | all transactional DDL; seed inserts 153 products and 221 variants |
| every RPC call | `private.write_audit` inserts into `public.audit_events` (append-only guards: the rows cannot be deleted, only rolled back) | pricing advisory lock `hashtextextended('shop:pricing')` taken and released at rollback; row locks |
**Nothing external:** no trigger or function in 0001–0004 or P3 sends a notification, calls HTTP, uses `pg_net`, `dblink`, `LISTEN/NOTIFY` or an extension (verified by search); inserts do not create GoTrue sessions or tokens; nothing is emitted by logical replication because P0-a refuses a publication that contains these tables and a rolled-back change is never decoded anyway.

## 5. Exact SQL statement allow-list
Every statement sent is one of the 116 entries of `docs/P3-TIER-R-ALLOWLIST.txt` (byte-for-byte after whitespace normalization); `Q()` refuses anything else BEFORE sending it, and refuses an entry outside its phase. Categories: transaction control (`begin isolation level read committed`, three `set local` timeouts, `rollback`, `savepoint s`, `rollback to savepoint s`, `release savepoint s`; **there is no COMMIT or END**); identity switching (`select set_config('request.jwt.claims', $1, true)`, `set local role authenticated|anon`, `reset role`); 33 snapshot statements (`snap.*`), 13 fixture/result reads (`rd.*`) and 16 P0 statements (12 read-only inspections including the namespace check, 3 read-backs, 1 insert into `auth.users`); 19 RPC calls (`select public.<rpc>($1::t, …) as r`, one per RPC with its exact signature); the second P0 insert (the `auth.mfa_factors` insert, shared with the fixtures); the 9 `fx.*` statements (8 fixture inserts plus the structure-check call; counting by id prefix: 9 `fx.*`, 4 `id.*`, 3 `sp.*`, 5 `tx.*`); 14 NEGATIVE statements that must FAIL (the 5 direct mutations of `order_items`, `orders`, `order_events`: `update public.order_items …`, `delete from public.orders …`, `truncate public.order_events`, `update public.orders set total_cents = 1 …`, `update public.orders set status = 'delivered' …`, each inside a savepoint on objects that exist only inside the transaction, and 9 `select count(*)` from the P3 tables as `authenticated`/`anon`); the two hash-checked files (the migration and the seed). The self-test asserts: no COMMIT/END/DDL statement in the list, no write to `supabase_migrations`, only these mutating statements (`p0.insert.*`, `fx.insert.*`, `neg.*`), and exactly two mutating statements reachable in P0. **No `isolateStaff`, no `delete`/`update` of any row outside the reserved namespace, no `truncate` of an existing table.**

## 6. Fixtures (phase t; all inside the transaction; reserved namespace `b3000000-0000-4000-8000-`)
Users (`id` suffix, 12 digits): ADMIN `…000000000001` (staff, admin), ADMIN_NOSTEP `…2` (admin, step-up 20 minutes old), OPS `…3` (operations), SUPPORT `…4`, FINANCE `…5`, STAFF_AAL1 `…6` (admin, JWT aal1), STAFF_DISABLED `…7` (status disabled, admin), STAFF_NOROLE `…8` (active, no role); customers A1 `…11` (owner of ORG_A), A2 `…12` (member of A), B1 `…21` (owner of B), C1 `…31` (member of suspended C), NONE `…41` (no membership), REMOVED `…51` (removed member of A); refusal targets BANNED `…61` (`banned_until` tomorrow), DELETED `…62` (`deleted_at` set), UNCONF `…63` (unconfirmed email). Emails `p3test-<tag>-<8 hex>@example.invalid` (never delivered). Every staff user except DISABLED gets an enrolment window (authorized_by NULL) and a verified totp factor row claimed through the **real** 0002 guard.
Organizations: ORG_A `…00a1` `P3T-A` active; ORG_B `…00b1` `P3T-B` active; ORG_C `…00c1` `P3T-C` suspended. Idempotency keys `…0c01`, `…0c02`, `…0c03`.
Catalog (seed rows by SKU/slug): PR1 `5-amino-1mq` (V11 `5-AMINO-1MQ-5MGX10`, V12 `5-AMINO-1MQ-10MGX10`), PR2 `adamax` (V21 `ADAMAX-5MGX10`, V22 `ADAMAX-10MGX10`), PR3 `aod9604` (V31 `AOD9604-5MGX10`, V32 `AOD9604-10MGX10`), PR4 `adipotide-fttp` (V41 `ADIPOTIDE-FTTP-2MGX10`, never priced). Prices by `rpc_admin_variant_set_price`: V11 10000/11000, V12 18000/15000, V21 333/100, V22 335/100, V31 20000/5000, V32 none/5000. Rules: ORG_A organization default 25 %, representative default 5 %, organization rule for PR2 10 % with representative bounds 2–3 %; ORG_B organization default fixed $5.00. Expected prices ORG_A: V11 13125, V12 23625, V21 377, V22 380, V31 26250; ORG_B: V11 10500 **(revision 1 expectation, wrong: the floor 11000 applies; revision 2 expects V11 11000, see 0.2)**, V12 18500, V31 20500.

## 7. RPCs and authorization scenarios in the harness (phase t) — all labelled **[SIM-JWT] [SINGLE-SESSION]**
T01–T05c (membership and anon/no-subject refusals; member-add added / already_member / role_changed / owner_downgrade_not_allowed / banned / deleted / unconfirmed / staff / suspended org), T06–T11 (catalog list, price set and its refusals, publish incl. `product_not_priced`, 4 rules + in-place update + 4 invalid rules, floor raise, base cleared), T12–T13 (visibility, prices, no cost fields, tenant refusal, 9 tables × 2 roles denied), T14–T14d (cart put/get/update/remove, refusals, per-user carts), T15a–T15f (checkout total 56270, snapshot, replay, empty cart, per-user key, floor applied, 5 invalid inputs), T16–T16c (future-only pricing, open cart repriced, 5 direct mutations refused, customer view without cost data), T17–T18c (order lists, detail, full lifecycle, invalid transitions, cancel once), T19 (**grid: 10 identities × 12 admin RPCs** with expected gate result `pass`/`forbidden`/`step_up_required`/`42501`), T19b, T20–T20f (cross-organization attempts), T21 (the audit table must equal, outcome for outcome, the audit rows derived from the returned codes; exactly 3 `order.place` rows; no cart or catalog action audited; no free text; actor kinds and organization ids).
**Not covered by this harness (stated in its output):** T14e (101 lines) and T15g (`order_too_large`) need 100+ priced variants at the cap; **all concurrency tests (D1–D7)**; **real GoTrue and real MFA**; PostgREST.

## 8. Transactions and rollback safety (confirmation)
Everything runs on one connection in one transaction opened with `begin isolation level read committed`; no statement ends it except `rollback`; there is no COMMIT, no `\commit`, no autocommit statement outside the transaction (the BEFORE/AFTER snapshots are SELECTs on separate fresh connections). All DDL used by the migration (create table/function/trigger/sequence/index, grant/revoke, alter table enable row level security, DO block) is transactional PostgreSQL DDL and disappears at rollback. **None of the following appears in the harness, the migration or the seed (verified by search): `CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`, `VACUUM`, `ALTER SYSTEM`, `CREATE DATABASE`/`TABLESPACE`, `LISTEN`/`NOTIFY`, `CREATE EXTENSION`, `pg_net`/`dblink`/HTTP, a write to `supabase_migrations`, the Supabase CLI or any migration command.** Honest limits inherent to PostgreSQL, not logical data: a rolled-back transaction still writes WAL, leaves dead tuples for autovacuum, increments statistics counters and may consume `auth`-side identity or sequence values only if a sequence existed for these tables (none: `auth.users` and `auth.mfa_factors` use uuid defaults; `order_number_seq` is created inside the transaction and vanishes).

## 9. Explicit rollback procedure
1. Normal end: `rollback` (statement `tx.rollback`), then the connection is closed.
2. Any error in the transaction (harness, SQL, timeout, signal): the `catch` issues `rollback` on the same connection (`ROLLBACK issued (after error)`), then closes it.
3. A dropped connection: PostgreSQL aborts the open transaction; `idle_in_transaction_session_timeout` (120 s) and `statement_timeout` (60 s) bound the worst case; the fresh-connection verification then still runs.
4. The `finally` block ALWAYS runs the fresh-connection verification (section 10), also after an abort.
5. If verification shows any difference: the harness exits non-zero and reports the differing object names; nothing is repaired automatically (any cleanup would be a separate, approved, reviewed step).

## 10. Fresh-connection post-rollback verification
A new connection (not the transaction's connection) takes the AFTER snapshot and compares it with the BEFORE snapshot (also a fresh connection): per-object md5 maps must be **identical** (compared by content, not by order). It also re-runs the namespace query (all zero) and asserts: no P3 table, no `products`/`orders`/`order_items`/`markup_rules`, the history is the same four versions.

## 11. Before/after checks
Row digests (md5 over all rows) and counts of: `auth.users`, `auth.identities`, `auth.mfa_factors`, `auth.sessions`, `auth.refresh_tokens`, `public.staff_members`, `public.staff_roles`, `public.organizations`, `public.organization_members`, `public.audit_events`, `public.profiles`, `public.organization_invites`, `public.organization_billing`, `public.capabilities`, `public.role_capabilities`, `private.platform_validations`, `private.staff_mfa_enrolment_windows`, `private.staff_mfa_factors`; schema objects of `public` and `private`: functions (source, owner, ACL, config), relations (kind, ACL, RLS), columns, constraints, policies, triggers (and, for `auth`, the triggers), row counts of every base table; ACLs: schema ACLs of `public`, `private`, `auth` and `pg_default_acl`; sequences (last value, start); the schema list; `supabase_migrations.schema_migrations`; the count of advisory locks; the headline counts of users, identities, factors, staff, roles, organizations, members, audit events and profiles; the server version.

## 12. Confirmations
No nontransactional DDL; no external side effect; no persistent migration history entry (the history table is only SELECTed); no migration command; no `supabase db push`; no Docker; no local database; no second project; no persistent write to `99purity-portal-dev`; no environment-file read happened while preparing this manifest; the harness reads the single credential line only behind `--authorized-read-env-local` (or takes `P2_DATABASE_URL` from the process environment); Aspen, P1/P2 migrations and rev3–rev7 are untouched; nothing is committed, pushed or deployed; P4 is not started.

## 13. Test-type labels (to be repeated in every report of these runs)
- **Simulated JWT/database claim tests** (all of phase t, and the staff fixtures): the identity is a `request.jwt.claims` value plus `set local role`; the "authenticators" are verified-factor rows inserted through the real guard. **Not proof of real MFA authentication, not proof that GoTrue issues such tokens.**
- **Real GoTrue-issued authentication tests:** none in this manifest; deferred.
- **Real PostgreSQL concurrent-session tests:** none in this manifest; deferred. A single-session rollback test is **not** evidence of concurrency correctness (the locking protocol of `rpc_checkout` and the admin price RPCs remains validated only by static review and the model test until an isolated environment is approved).
