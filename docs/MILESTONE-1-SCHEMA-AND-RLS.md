# Milestone 1: Schema and RLS Policy Matrix — Revision 4 (validation sequence recorded)

Status: **DESIGN ONLY. No migration, SQL file, database function, auth code or dependency has been created or changed.** Revision 3 incorporates the five final corrections (§10, C-1 to C-5) on top of Revision 2. Revision 4 records the approved validation sequence (§5.3, `M1-VALIDATION-PLAN.md`): pre-migration gates versus post-migration acceptance tests, V2b fallback, fail-closed V5b. Branch: `feature/portal-foundation`. Revision history: §10.

Changes from revision 1 (summary): invite tokens are now plaintext-to-RPC with hashing inside the database and secrets in a separate no-grant table (§2.4, §5.7); staff reads of PII tables moved from table access to minimal, audited RPCs (§2, §3); `organization_billing` split from `organizations`; gate/flag separation enforced in triggers (§2.9, §2.10, §5.8); step-up no longer uses `iat` and fails closed via a server-recorded step-up row (§5.3); audit hash chain fully specified (§2.8, §5.9); retention and legal hold added to `account_requests` (§2.7); storage, concurrency and PostgREST test plan hardened (§5.4, §5.2, §6).

## 0. Design principles
1. **Default deny.** Supabase grants `ALL` on new `public` tables to `anon`, `authenticated`, `service_role` by default. Each migration first revokes all privileges on each new table from `PUBLIC, anon, authenticated, service_role` and sets `ALTER DEFAULT PRIVILEGES` so future objects are not auto-granted; then grants the minimum.
2. **Writes go through RPCs.** Apart from a customer editing own profile `full_name`/`phone`, no API role has INSERT/UPDATE/DELETE on any table. Mutations are `SECURITY DEFINER` functions that authorize inside the function.
3. **`service_role` is not a master key.** It bypasses RLS but still needs privileges; it gets **no table privileges** and `EXECUTE` on exactly four RPCs (`submit_account_request`, `preview_invite`, `issue_organization_invite`, `mark_invite_delivery`). A leaked service key therefore cannot flip flags, mint staff, or edit the audit log through the database. **Residual risk:** the same key can call the Auth admin API (create/modify auth users and factors); see risk R-1.
4. **Authorization data never comes from `user_metadata`** (user-editable). It comes only from our tables plus verified JWT claims (`aal`, `session_id`).
5. **Schemas:** `public` (Data API exposed): tables and client-callable RPCs. `private` (not exposed): helpers, `rate_limits`, `step_ups`, secrets. `authenticated` gets `USAGE` on `private` and `EXECUTE` on policy helpers only.
6. **Staff separation (D-M1-2):** a user cannot be both staff and an active organization member. Enforced by triggers **in both directions** (§2.3, §2.5), independent of RPCs and callers. Staff access is evaluated at **aal2**; an aal1 staff user can read only their own `staff_members` row (so the UI can force MFA enrolment).
7. **Data minimization for staff (corr. C):** staff do not get broad table SELECT on PII tables. They get role-specific RPCs that return only needed columns; full-detail reads are audited.
8. **Defense in depth:** RLS **and** privileges **and** triggers for invariants **and** server-side checks. UI hiding is never relied on.

## 1. Actors
| Code | Who | How determined |
|---|---|---|
| ANON | Unauthenticated visitor | role `anon` |
| AUTH | Authenticated, no active membership, not staff | `auth.uid()` present |
| MEMBER | Active member of org X, role `member` | `organization_members` |
| OWNER | Active member of org X, role `owner` | `organization_members` |
| ADMIN / FINANCE / OPS / SUPPORT | Active staff with that role **and aal2** | `staff_roles` + JWT `aal` |
Legend: ✔ allowed (RLS-scoped) · ✘ denied · **R** only through the named RPC · "org" = rows of caller's own organizations · "own" = caller's own row. A user may belong to several orgs; every org-scoped check is per organization.

## 2. Tables

### 2.1 `profiles`
`user_id pk → auth.users on delete cascade`, `full_name`, `phone`, `created_at`, `updated_at`. Email is **not duplicated**; it lives in `auth.users` and is returned only by RPCs. Created by a definer trigger on `auth.users` insert (never copies privilege data).
| Actor | SELECT | INSERT | UPDATE | DELETE | Notes |
|---|---|---|---|---|---|
| ANON | ✘ | ✘ | ✘ | ✘ | |
| AUTH/MEMBER/OWNER | own | ✘ (trigger) | own, `full_name`,`phone` only (column GRANT) | ✘ | Team lists via `list_org_members` |
| ADMIN | **R** `admin_get_profile(user)` — all columns + email; **audited `pii.read`** | ✘ | ✘ | ✘ | cap `profiles.read.full` |
| SUPPORT | **R** `support_get_profile(user)` — `full_name`, `email`, org names/roles only; **no phone**; audited | ✘ | ✘ | ✘ | cap `profiles.read.basic` |
| FINANCE / OPS | ✘ | ✘ | ✘ | ✘ | Org contacts, when needed, come from a finance/ops RPC in M4/M7 returning only owner name+email |
No staff table SELECT policy exists on `profiles`; the table has only the `user_id = auth.uid()` policy.

### 2.2 `organizations` (non-sensitive base) and `organization_billing`
`organizations`: `id`, `name`, `code unique`, `status active|suspended|closed`, `payment_terms` (default `prepay`), `created_by`, `created_at`, `updated_at`. Contains no address or contact data.
`organization_billing`: `organization_id pk → organizations`, `billing_address jsonb`, `updated_at`.
| Actor | `organizations` SELECT | `organization_billing` SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| ANON, AUTH | ✘ | ✘ | ✘ | ✘ | ✘ |
| MEMBER | org | ✘ (revisit in M3) | ✘ | ✘ | ✘ |
| OWNER | org | org | ✘ | **R** `update_organization_profile` (name, billing_address) | ✘ |
| ADMIN | ✔ all (`org.read`) | **R** `admin_get_org_billing(org)`, audited | **R** `approve_account_request` | **R** `set_organization_status`, `update_organization_profile` | ✘ |
| FINANCE | ✔ all (`org.read`) | **R** `get_org_billing(org)` (`org.billing.read`), audited | ✘ | ✘ | ✘ |
| OPS | ✔ all (`org.read`) | ✘ (no documented workflow; shipping addresses arrive in M7 with their own capability) | ✘ | ✘ | ✘ |
| SUPPORT | ✔ all (`org.read`) | ✘ | ✘ | ✘ | ✘ |
Customers can never change `status`, `code`, `payment_terms`, `created_by`. Closure is a status, never a delete. A suspended/closed org keeps read access but all ordering/upload paths refuse.

### 2.3 `organization_members`
`id`, `organization_id`, `user_id`, `role owner|member`, `status active|removed`, `created_at`, `removed_at`, unique `(organization_id, user_id)`. Contains no PII.
| Actor | SELECT | INSERT | UPDATE | DELETE | RPC |
|---|---|---|---|---|---|
| ANON, AUTH | ✘ | ✘ | ✘ | ✘ | |
| MEMBER | org | ✘ | ✘ | ✘ | `leave_organization` (self, not last owner) |
| OWNER | org | **R** `accept_organization_invite` (own row only) | **R** `set_member_role`, `remove_member` | ✘ (soft remove) | |
| ADMIN | ✔ all (`members.read`) | **R** `admin_add_member` | **R** `set_member_role`, `remove_member` | ✘ | `members.manage` |
| SUPPORT | ✔ all (`members.read`) | ✘ | ✘ | ✘ | |
| FINANCE / OPS | ✘ | ✘ | ✘ | ✘ | not needed in M1 |
**Invariants (triggers, caller-independent, including service paths):**
(a) **Last-owner:** any UPDATE/DELETE that would leave an organization with zero active owners raises, unless the org is being set to `closed` in the same transaction. The trigger first takes `SELECT … FROM organizations WHERE id = NEW.organization_id FOR UPDATE`, serializing concurrent demotions/removals (see §5.2).
(b) **Staff exclusion:** inserting an active membership for a user who is in `staff_members` raises (reverse direction in §2.5).
(c) Owners may invite/promote other owners (D-M1-8), but **owner grants require owner MFA step-up (C-1, §5.11)**: `create_organization_invite` with role `owner` and `set_member_role(…,'owner')` each require the caller to be OWNER of that org (or ADMIN with staff step-up), JWT `aal2` and `private.has_recent_step_up()` (≤ 15 minutes), enforced inside the definer RPC. Ordinary `member` invitations and demotions do not require it. There is no self-promotion path: no direct INSERT/UPDATE grant exists on `organization_members`.
(d) FK cascade from `auth.users` deletion is subject to (a): deleting the last owner's auth user fails; the org must be closed first (deliberate).

### 2.4 `organization_invites` and `organization_invite_secrets`
`organization_invites`: `id`, `organization_id`, `email check (email = lower(email))`, `role owner|member`, `invited_by`, `delivery_status pending_issue|issued|sent|failed` (default `pending_issue`), `authorized_at`, `expires_at` (default now()+7 days), `accepted_at`, `accepted_by`, `revoked_at`, `revoke_reason`, `created_at`. Partial unique index on `(organization_id, email)` where `accepted_at is null and revoked_at is null`. A row in `pending_issue` has **no secret row** and can never be previewed or accepted.
`private.organization_invite_secrets`: `invite_id pk → organization_invites on delete cascade`, `token_hash bytea not null check (octet_length = 32) unique`. **No API role has any privilege on this table** (not even service_role). It lives in `private`, so the hash can never be selected via PostgREST, by any role, in any query shape.
| Actor | SELECT (`organization_invites`) | INSERT | UPDATE | DELETE | RPC |
|---|---|---|---|---|---|
| ANON | ✘ | ✘ | ✘ | ✘ | `preview_invite(token)`, `issue_organization_invite(invite_id, token_hash)`, `mark_invite_delivery(invite_id, outcome)` are **service_role only** (server code) |
| AUTH | ✘ | ✘ | ✘ | ✘ | **R** `accept_organization_invite(token)` |
| MEMBER | ✘ | ✘ | ✘ | ✘ | |
| OWNER | org | **R** `create_organization_invite` (authorizes only; no hash parameter; role `owner` needs step-up, §5.11) | **R** `revoke_organization_invite` | ✘ | |
| ADMIN | ✔ (`invites.read`) | **R** `create_organization_invite` (owner role needs staff step-up) | **R** `revoke_organization_invite` | ✘ | |
| SUPPORT | ✔ (`invites.read`; email, role, status, expiry — needed to help invitees) | ✘ | ✘ | ✘ | |
| FINANCE / OPS | ✘ | ✘ | ✘ | ✘ | |
Token lifecycle, trust boundary, delivery failure and rate limits: §5.7 (exact steps and tests).

### 2.5 `staff_members`, `staff_roles`
`staff_members(user_id pk → auth.users, status active|disabled, created_by, created_at)`; `staff_roles(user_id → staff_members, role admin|finance|operations|support, granted_by, granted_at, pk(user_id, role))`. **These four are the only M1 staff roles. There is no `super_admin` (C-4, §3).** Also `private.staff_mfa_enrolment_windows` and `private.staff_mfa_factors` (§5.12; no API privileges).
| Actor | SELECT | INSERT | UPDATE | DELETE | RPC |
|---|---|---|---|---|---|
| ANON, AUTH, MEMBER, OWNER | ✘ (customers cannot learn who is staff) | ✘ | ✘ | ✘ | |
| Any staff (even aal1) | own rows | ✘ | ✘ | ✘ | |
| ADMIN (aal2) | ✔ all (`staff.read`) | **R** `admin_grant_staff_role` | **R** `admin_set_staff_status` | **R** `admin_revoke_staff_role` | `staff.manage` + step-up |
| FINANCE / OPS / SUPPORT | own only | ✘ | ✘ | ✘ | |
**Escalation prevention:** no DML grants to any API role (incl. service_role). RPCs require ADMIN at aal2 **with a recorded step-up within 15 minutes** (§5.3), reject `target = caller`, reject targets that are active org members (reverse of §2.3(b), also a trigger), reject unknown roles (CHECK), and write audit. **Last active admin** cannot be disabled/revoked: trigger takes `pg_advisory_xact_lock` on a fixed key, counts admins excluding the row being changed, raises if zero (§5.2). **Staff MFA enrolment is gated by an authorized window and approved-factor binding (C-2, §5.12).** **Bootstrap:** first admin created once by the project owner via the SQL editor script `supabase/bootstrap/first-admin.sql` (parameterized by email, not a migration, no secrets); the script is run as the database owner, also opens the first enrolment window for that admin, and writes audit rows marked `actor_kind = 'system'`. The same script is the documented break-glass path if the **only** admin loses their factor (no second admin can authorize).

### 2.6 `capabilities`, `role_capabilities`
Static seed data. Staff (aal2) SELECT ✔; everyone else ✘; nobody can write (changes ship only as migrations). `private.has_capability(code)` = active staff ∧ aal2 ∧ role holds capability.

### 2.7 `account_requests`
`id`, `company_name`, `contact_name`, `email`, `phone`, `country`, `website`, `business_type`, `message`, `status new|in_review|more_info|approved|rejected|expired`, `reviewed_by`, `reviewed_at`, `review_reason`, `organization_id`, `source`, `ip_hash bytea` (HMAC with pepper), `legal_hold boolean default false`, `legal_hold_reason`, `retain_until timestamptz`, `created_at`.
**No API role has any privilege on this table.** All reads/writes go through RPCs; `ip_hash` is never returned by any RPC.
| Actor | Read | Write | RPC |
|---|---|---|---|
| ANON | ✘ | ✘ | `submit_account_request(...)` is **service_role only**; Next server action first verifies Turnstile (§5.10), honeypot, rate limit |
| AUTH, MEMBER, OWNER | ✘ | ✘ | |
| ADMIN | **R** `admin_list_account_requests`, `admin_get_account_request` (full columns except `ip_hash`; detail read audited `pii.read`) | **R** `review_account_request`, `approve_account_request`, `set_account_request_hold` | `applications.read.full`, `applications.review` |
| SUPPORT | **R** `support_list_account_requests`: `id`, `company_name`, `contact_name`, `email`, `country`, `business_type`, `status`, `created_at`; **no phone, message, website** | ✘ | `applications.read.basic` |
| FINANCE / OPS | ✘ | ✘ | |
`approve_account_request(id, org_name)` runs in one transaction (ADMIN, aal2, step-up): creates org (`active`) and empty `organization_billing`, creates an **owner invite in `pending_issue`** (no hash; the server then issues the token via `issue_organization_invite`, §5.7), links the request, audits. If delivery fails, `admin_resend_owner_invite(org)` (same capability and step-up) creates a fresh authorization. Rejection requires a reason.
**Retention (D-M1-5):** `retain_until` is set at decision time to `reviewed_at + 12 months` for `rejected`; requests left in `new`/`more_info` for 90 days become `expired` and get the same 12-month retention. A scheduled purge `private.purge_account_requests()` deletes rows past `retain_until` **unless `legal_hold` is true**, and writes one audit row with counts only (no PII). Approved requests are kept as the onboarding record for the life of the organization. Legal hold can be set/cleared only by ADMIN RPC with reason, audited. Final retention periods remain subject to counsel review (risk R-6).

### 2.8 `audit_log`
`id bigint not null primary key` (**no identity, no default**; allocated only by `write_audit()` from `private.audit_log_id_seq`, §5.9), `occurred_at timestamptz`, `actor_user_id`, `actor_kind customer|staff|system`, `organization_id`, `action`, `entity_type`, `entity_id`, `diff jsonb` (redacted by writer; never contains secrets or tokens), `ip inet`, `user_agent`, `request_id`, `prev_hash bytea(32)`, `row_hash bytea(32)`.
| Actor | SELECT | INSERT | UPDATE | DELETE/TRUNCATE |
|---|---|---|---|---|
| ANON, customers | ✘ | ✘ | ✘ | ✘ |
| ADMIN | ✔ (`audit.read`) | ✘ direct | ✘ | ✘ |
| FINANCE / OPS / SUPPORT | ✘ | ✘ | ✘ | ✘ |
Immutability layers: (1) no INSERT/UPDATE/DELETE/TRUNCATE privilege for any API role incl. service_role; (2) rows written only by `private.write_audit()` (definer, no API EXECUTE); (3) `BEFORE UPDATE OR DELETE` row trigger and `BEFORE TRUNCATE` statement trigger raise; (4) hash chain (§5.9). Audited events in M1: staff grant/revoke/disable, role and membership changes, invite create/revoke/accept/failed-accept, org create/status/profile change, account-request review/approval/hold/purge, `pii.read`, step-up recorded, gate approve/revoke/expire, flag enable/disable/enable-denied, MFA-related staff events observed by the server.

### 2.9 `platform_flags`
`key pk`, `enabled boolean not null default false`, `required_gates text[]`, `high_risk boolean`, `description`, `updated_by`, `updated_at`. Seed (all `false`): `wallet_enabled` (G3, G6; high-risk), `live_fulfillment_enabled` (G1, G2, G4, G5, G6; high-risk), `api_live_keys_enabled` (G6; high-risk), `commissions_enabled` (none; not high-risk).
| Actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| ANON | ✘ | ✘ | ✘ | ✘ |
| AUTH/MEMBER/OWNER | ✘; RPC `feature_enabled(key)` returns a boolean for the four keys | ✘ | ✘ | ✘ |
| ADMIN | ✔ (`flags.read`) | ✘ | **R** `set_platform_flag` (`flags.write`) | ✘ |
| FINANCE / OPS / SUPPORT | ✔ read | ✘ | ✘ | ✘ |
Enforcement: §5.8.

### 2.10 `compliance_gates`
`id`, `code G1..G6`, `scope platform|org`, `organization_id` (required iff org), `status pending|approved|revoked|expired`, `evidence_ref` (path in `platform-documents`, required to approve), `notes`, `approved_by`, `approved_at`, `expires_at`, `created_at`; partial unique index on approved `(code, scope, organization_id)`.
| Actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| ANON, customers | ✘ | ✘ | ✘ | ✘ |
| ADMIN | ✔ (`gates.read`) | **R** `record_compliance_gate` | **R** `revoke_compliance_gate` | ✘ |
| FINANCE / OPS / SUPPORT | ✔ read (`gates.read`) | ✘ | ✘ | ✘ |
Writes require `gates.write`, aal2, step-up within 15 minutes, evidence.

### 2.11 `private.rate_limits`, `private.step_ups`
`rate_limits(key, window_start, count, pk(key, window_start))`. `step_ups(user_id, session_id uuid, verified_at timestamptz, pk(user_id, session_id))` (§5.3; applies to staff **and** customer owners). `staff_mfa_enrolment_windows` and `staff_mfa_factors` are defined in §5.12. None is exposed; only definer functions touch them.

## 3. Capability catalog and role mapping
`†` = seeded now so role boundaries are testable; unused until the milestone shown.
| Capability | ADMIN | FINANCE | OPS | SUPPORT | Used by |
|---|---|---|---|---|---|
| org.read (name, code, status, terms) | ✔ | ✔ | ✔ | ✔ | M1 |
| org.billing.read (billing address) | ✔ | ✔ | | | M1 (audited) |
| org.manage | ✔ | | | | M1 |
| members.read (no PII) | ✔ | | | ✔ | M1 |
| members.manage | ✔ | | | | M1 |
| invites.read | ✔ | | | ✔ | M1 |
| profiles.read.full (incl. phone, email) | ✔ | | | | M1 (audited) |
| profiles.read.basic (name, email) | ✔ | | | ✔ | M1 (audited) |
| applications.read.full | ✔ | | | | M1 (audited) |
| applications.read.basic | ✔ | | | ✔ | M1 |
| applications.review | ✔ | | | | M1 |
| staff.read / staff.manage | ✔ | | | | M1 |
| flags.read | ✔ | ✔ | ✔ | ✔ | M1 |
| flags.write | ✔ | | | | M1 |
| gates.read | ✔ | ✔ | ✔ | ✔ | M1 |
| gates.write | ✔ | | | | M1 |
| audit.read | ✔ | | | | M1 |
| documents.read / documents.delete | ✔ / ✔ | ✔ / | ✔ / | ✔ / | M1 (storage) |
| payments.confirm † | ✔ | ✔ | | | M4 |
| payments.reconcile † | ✔ | ✔ | | | M4 |
| financial.write † | ✔ | ✔ | | | M4 |
| inventory.adjust † | ✔ | | ✔ | | M7 |
| fulfillment.process † | ✔ | | ✔ | | M7 |
| onboarding.review † | ✔ | | ✔ | | M5 |
| onboarding.golive † | ✔ | | | | M5 |
D-M1-1: ADMIN keeps explicit finance capabilities in M1 (listed explicitly above, not implied by "admin = everything"); separation of duties is revisited in M4.
**Role model (C-4):** M1 staff roles are exactly ADMIN, FINANCE, OPS, SUPPORT. No `super_admin` role exists. Everything earlier documents assigned to a "super-admin" (staff management, feature flags, platform and per-organization compliance gates) is performed by **ADMIN** using the capabilities `staff.manage`, `flags.write`, `gates.write`, always at aal2 with a recorded step-up within 15 minutes, and subject to the gate/flag separation of §5.8. The broader role list in `ADMIN-PORTAL-SPECIFICATION.md` §2 is a later-milestone proposal; any new role must be added to this catalog and approved before it exists. Per-organization gates use the same `record_compliance_gate`/`revoke_compliance_gate` RPCs with `scope = 'org'`. FINANCE no longer receives `members.read` or unrelated profile data; OPS receives no billing data.

## 4. SECURITY DEFINER functions
Rules for **every** definer function: `SET search_path = ''` with all references schema-qualified (including `pg_catalog`, `extensions`, `auth`); owner is a non-login role; `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` then explicit `GRANT EXECUTE`; first statement is the authorization check (and `private.is_aal2()` for staff); no dynamic SQL from input; correct `STABLE`/`VOLATILE`; minimal return data. A CI test enumerates all `SECURITY DEFINER` functions and fails if any lacks pinned `search_path`, or is executable by `PUBLIC`/`anon`, or is outside the allow-list below.
| Function | Schema | EXECUTE | Authorization |
|---|---|---|---|
| `has_capability`, `is_staff`, `is_aal2`, `has_recent_step_up`, `is_org_member`, `is_org_owner`, `my_org_ids`, `storage_org_id`, `gates_satisfied`, `assert_flag_enabled` | private | authenticated (policy helpers) | pure checks |
| `write_audit`, `purge_account_requests`, `expire_gates`, `expire_enrolment_windows`, `expire_unissued_invites` | private | no API role (internal/cron) | internal |
| `me()` | public | authenticated | own profile, memberships, staff roles, capabilities |
| `feature_enabled(key)` | public | authenticated | known keys only |
| `list_org_members(org)` | public | authenticated | member/owner of org (email only for owners) or `members.read` |
| `create_organization_invite(org, email, role)` | public | authenticated | OWNER of org or `members.manage`; **role `owner` requires aal2 + recent step-up (§5.11)**; rate limited; creates `pending_issue` row, returns `invite_id` only |
| `issue_organization_invite(invite_id, token_hash)` | public | **service_role only** | invite is `pending_issue`, authorized ≤ 5 minutes ago, no secret yet; stores hash once; returns nothing |
| `mark_invite_delivery(invite_id, outcome)` | public | **service_role only** | `sent` or `failed`; `failed` revokes and deletes the secret (§5.7) |
| `revoke_organization_invite(id)` | public | authenticated | OWNER or `members.manage` |
| `preview_invite(token)` | public | **service_role only** | hashes token internally; generic result when invalid |
| `accept_organization_invite(token)` | public | authenticated | hashes token internally; confirmed-email match; single use |
| `set_member_role`, `remove_member`, `leave_organization` | public | authenticated | OWNER/`members.manage`/self; **promotion to `owner` requires aal2 + recent step-up (§5.11)**; last-owner trigger |
| `admin_add_member` | public | authenticated | `members.manage` + aal2; role `owner` also requires staff step-up |
| `update_organization_profile(org, name, billing_address)` | public | authenticated | OWNER or `org.manage` |
| `set_organization_status(org, status, reason)` | public | authenticated | `org.manage` + aal2 |
| `get_org_billing`, `admin_get_org_billing` | public | authenticated | `org.billing.read`; audited |
| `admin_get_profile`, `support_get_profile` | public | authenticated | `profiles.read.full` / `.basic`; audited |
| `submit_account_request(...)` | public | **service_role only** | format/length validation; Turnstile already verified by server |
| `admin_list_account_requests`, `admin_get_account_request`, `support_list_account_requests` | public | authenticated | capabilities in §3 |
| `review_account_request`, `approve_account_request`, `admin_resend_owner_invite`, `set_account_request_hold` | public | authenticated | `applications.review` + aal2 (+ step-up for approve and resend) |
| `admin_grant_staff_role`, `admin_revoke_staff_role`, `admin_set_staff_status` | public | authenticated | `staff.manage` + aal2 + step-up; not self; last-admin guard |
| `record_step_up()` | public | authenticated | **staff or customer owner**, aal2, fresh TOTP `amr` entry (§5.3) |
| `admin_authorize_staff_mfa_enrolment`, `admin_revoke_staff_mfa_enrolment` | public | authenticated | `staff.manage` + aal2 + step-up; target ≠ caller (§5.12) |
| `check_staff_mfa_enrolment()`, `claim_staff_mfa_factor(factor_id)` | public | authenticated | own open window only (§5.12) |
| `set_platform_flag(key, enabled, reason)` | public | authenticated | `flags.write` + aal2 + step-up + §5.8 |
| `record_compliance_gate`, `revoke_compliance_gate` | public | authenticated | `gates.write` + aal2 + step-up + evidence |
| `verify_audit_chain()`, `audit_chain_head()` | public | authenticated | `audit.read` |
Trigger functions (`handle_new_user`, member/owner/staff guards, flag guard, gate-revocation cascade, audit immutability, audit chain) are definer, pinned, not executable by API roles.

## 5. Cross-cutting rules

### 5.1 Tenant isolation
Every tenant-owned table carries `organization_id`. SELECT policies are `organization_id IN (SELECT private.my_org_ids())` (active memberships only; `removed` loses access immediately), wrapped in a subselect so it evaluates once per statement. Every future tenant table must be added to the machine-readable matrix (§6) or CI fails.

### 5.2 Last-owner / last-admin concurrency
- **Owners:** guard trigger runs `SELECT 1 FROM organizations WHERE id = … FOR UPDATE`, then counts active owners **excluding the row being changed**; raises if the result is zero. Two concurrent transactions demoting each other's owners serialize on the org row; the second sees the first's committed state and fails. Closure exception requires the org status already `closed` in the same transaction.
- **Admins:** guard trigger takes `pg_advisory_xact_lock(<fixed key>)`, counts active admins excluding the row changed, raises on zero. The same lock covers `staff_members.status` and `staff_roles` changes.
- **Test (mandatory):** two real connections, two owners (and two admins), each transaction demotes/removes the other; exactly one commits, the other raises; final active count ≥ 1. Repeat 50 times in a loop to catch races.
- Ownership transfer = promote new owner first, then demote.

### 5.3 Step-up authentication (D-M1-9) — fail closed
**Findings validated against Supabase documentation (web search, 2026-11-07):** access tokens carry `aal` and an `amr` array of `{method, timestamp}` entries (most recent first); a successful MFA verify upgrades the session to aal2 and a refreshed token reflects it. `iat` changes on every token refresh (hourly), so it **cannot** prove MFA freshness; revision 1's `iat` check is withdrawn. The docs do **not** state whether older `amr` entries survive a refresh. Therefore the design does not depend on `amr` persistence.
**Mechanism:**
1. When a sensitive operation requires step-up, the UI performs a **new** TOTP `challenge`+`verify`, then refreshes the session so the new access token includes the fresh `amr` entry.
2. Server calls `record_step_up()` (authenticated). It requires: caller is **active staff or an active OWNER of at least one organization** (customer owners use the same mechanism for §5.11); `auth.jwt()->>'aal' = 'aal2'`; the JWT contains an `amr` entry with method `totp` whose timestamp is within **60 seconds** of `now()`; a `session_id` claim is present. On success it upserts `private.step_ups(user_id, session_id, verified_at = now())` using the **database clock**.
3. `private.has_recent_step_up()` is true only if the JWT is still aal2, and a `step_ups` row exists for the current `session_id` with `verified_at >= now() - interval '15 minutes'`. Every sensitive RPC calls it as its first authorization step.
4. **Fail closed:** if `amr`, its timestamp, `aal`, or `session_id` is missing or unparseable, `record_step_up()` raises and no row is written; with no row, sensitive RPCs refuse. There is no fallback to aal2 alone. New sessions (new login) start with no step-up row.
**Validation gates and acceptance tests (full procedure and pass/fail criteria: `M1-VALIDATION-PLAN.md`).** Checks that exercise Supabase Auth alone are **pre-migration gates**; checks that need database objects are **post-migration acceptance tests**. Approved sequence:
| Order | Check | Needs | Must pass before |
|---|---|---|---|
| 1 | **V5a** shape of `auth.mfa_factors` (read-only introspection) | dev project + one enrolled factor | migration 0002 |
| 2 | **V1** claims after sign-in + TOTP verify | dev project, test user | migration 0002 |
| 3 | **V2** re-verify advances the TOTP timestamp (**V2b** fresh-sign-in fallback, recorded separately) | same | migration 0002 |
| 4 | **V3** refresh does not freshen an old TOTP timestamp | same | migration 0002 |
| 5 | **V5b** definer function reads `auth.mfa_factors`; structure guard fails closed | migration 0002 applied to dev | migration 0004 |
| 6 | **V4** `record_step_up()` behaviour (incl. V2b binding cases) | migrations 0001, 0002, 0004 | acceptance of the remaining M1 implementation |
Migration 0001 has no step-up or MFA dependency and is not blocked by these gates. **V4 and V5b must both pass before the remaining M1 implementation (0005–0009 and all RPC/auth work that uses staff access or step-up) is accepted.** Nothing is promoted to staging until V1–V5 (and V2b where applicable) are recorded.
- **V1:** after password sign-in the token has `aal1`, a password `amr` entry and a `session_id`; after challenge+verify and a refresh it has `aal2`, a TOTP `amr` entry with a numeric timestamp near the verify time, and a `session_id`. The exact method string is recorded.
- **V2:** a second challenge+verify (next 30-second code window) followed by a refresh yields a strictly newer TOTP timestamp.
- **V2b (separate fallback test; run whenever V2 fails, recorded as its own result, never merged with V2):** (i) *claims level, pre-migration:* a fresh password sign-in produces a token whose `session_id` differs from the earlier session's, whose `aal` is `aal1` with no TOTP `amr` entry, and which reaches `aal2` only after its own challenge+verify; (ii) *binding level, post-0004 (part of V4):* a step-up row recorded for the earlier session does **not** satisfy `has_recent_step_up()` for the new session, and `record_step_up()` rejects the new session while it is still `aal1` (MFA is required before a step-up can be recorded). Outcomes: V2 pass ⇒ step-up mode `reverify`; V2 fail and V2b pass ⇒ step-up mode `fresh_session` (UI forces a new sign-in); V2 fail and V2b fail ⇒ stop and redesign.
- **V3 (hard blocker, unchanged):** a plain refresh must not change or advance an old TOTP timestamp. If an ordinary refresh makes an old TOTP timestamp appear fresh, a stolen aal2 session could refresh and pass the 60-second freshness test. **In that case stop and redesign step-up (for example a server-side one-time nonce or mandatory new session) and obtain re-approval before migration 0004 is authored; because V3 runs before 0002, the migration sequence halts at that point (0001 may proceed).** No weakening of the 60-second rule or fallback to aal2 alone is permitted.
- **V4:** `record_step_up()` writes a DB-clock row only for fresh TOTP at `aal2` and rejects stale, `aal1`, missing-claim and foreign-session tokens; 14:59 passes and 15:01 fails.
- **V5a / V5b:** `auth.mfa_factors` exposes `id`, `user_id`, `status`, `created_at` (V5a, introspection); a SECURITY DEFINER function with pinned `search_path` can read it and the structure guard of §5.12 fails closed on any deviation (V5b).
Unchanged fail-closed principle: if any claim, timestamp, session id or factor read is missing, unexpected or errors, step-up is not recorded and staff access is denied.

### 5.4 Storage
Buckets (created by migration, **private**): `org-documents` (10 MB limit; MIME allow-list `application/pdf, image/png, image/jpeg, text/csv`) and `platform-documents` (staff only). Required object name pattern, validated by `private.storage_org_id()`: `^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z_]{1,32}/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$`; anything else, including `..` or extra slashes ⇒ NULL ⇒ deny.
| `storage.objects` op | `org-documents` | `platform-documents` |
|---|---|---|
| SELECT (incl. list/search) | active member of path org; or staff with `documents.read` at aal2 | staff with `documents.read` |
| INSERT | active OWNER/MEMBER of path org **and** org `active` **and** pattern matches **and** per-org object-count/byte quota not exceeded (trigger) | ADMIN (`gates.write`) |
| UPDATE (also blocks move/rename/upsert) | ✘ everyone | ✘ |
| DELETE | ADMIN (`documents.delete`) only | ADMIN only |
| ANON | ✘ all | ✘ all |
Extra controls: bucket `public = false`; no policy for `anon`; client `upsert` disabled; signed URLs only after a server-side SELECT check (TTL ≤ 5 min); MIME is bucket-enforced from the client claim, so magic-byte validation and malware scanning are required before any document is used in a workflow (later milestone; risk R-4). Realtime publication must not include any M1 table or `storage.objects` (lint).

### 5.5 Auth configuration
Public sign-up disabled. Accounts are created by the server (service role, Auth admin API) only after a valid invite token or by an admin for staff. Email+password (minimum 12, leaked-password protection); TOTP enabled; staff must enrol/verify before any staff access (middleware **and** RLS). Cookies via `@supabase/ssr` (httpOnly, Secure, SameSite=Lax). Redirect allow-list limited to our domains. Custom SMTP (Resend). OWNER MFA (D-M1-3, implemented by C-1): a customer owner needs aal2 plus a recorded step-up within 15 minutes before **creating an owner-role invitation** or **promoting a member to owner** (§5.11); this is enforced inside the RPCs from M1. Mandatory owner MFA for other sensitive financial or administrative access (wallet, payments, API keys, team administration beyond these two actions) is a hard prerequisite to be added to the M4/M6 checklists.

### 5.6 What M1 cannot literally test yet
| Required test | M1 coverage | Completed in |
|---|---|---|
| Customer A cannot read/write org B records | Full, every M1 tenant table + storage | — |
| Members cannot grant themselves owner or staff | Full | — |
| Customers cannot access admin actions | Full (all staff RPCs, flags, gates, audit, staff tables, enrolment windows) | — |
| Owners need recent MFA to grant owner | Full (T-OMFA-*, §5.11) | — |
| Finance cannot perform operations-only actions | Capability-level | M5/M7 |
| Operations cannot confirm payments | Capability-level (`payments.confirm` denied) | M4 |
| Support cannot modify financial records | Capability-level; support has no write on any M1 table | M4 |
| Customers cannot approve own onboarding/go-live | Capability-level; no customer DML | M5 |
| Wallet operations fail while flag disabled | `assert_flag_enabled('wallet_enabled')` fails; test-only stub RPC inside the test transaction | M4 |
| Live fulfillment remains disabled | Flag false by seed; cannot enable without G1,G2,G4,G5,G6 and two admins | M7 |
| Live API keys cannot be issued | `api_live_keys_enabled` false; cannot enable without G6 | M6 |

### 5.7 Invitation token lifecycle and trust boundary (corr. B, C-5)
Principles: the stored hash is never a credential; the database never receives a usable credential except the plaintext token at acceptance; **users cannot choose the hash that protects an invite.**

**Why a two-step issue (trust boundary).** If `create_organization_invite` accepted a caller-supplied hash, any authorized inviter could call the RPC directly with the hash of a token they invented. Because the server later creates a confirmed Auth account for the invite email on proof of the token (step 7), an inviter who knows the token could complete that step themselves and pre-claim an email address they do not control. The design therefore separates *authorization* (user JWT) from *token issuance* (server key):
1. **Authorize (user JWT, from the server action):** the inviter's request reaches `create_organization_invite(org, email, role)`. It checks OWNER/`members.manage`, the owner-role step-up rule (§5.11), rate limits, creates the invite with `delivery_status = 'pending_issue'` and **no secret**, audits `invite.authorized`, and returns only `invite_id`. There is no hash parameter, so a direct RPC call can produce nothing but an inert pending row.
2. **Generate (server):** Next.js server code calls `crypto.randomBytes(32)`, base64url-encodes it (43 chars) as the plaintext token and computes `SHA-256(token_bytes)`.
3. **Issue (service_role only):** server calls `issue_organization_invite(invite_id, token_hash)`. The function requires status `pending_issue`, `authorized_at` within the last 5 minutes, no existing secret row, hash length exactly 32 bytes; it stores the hash in `private.organization_invite_secrets`, sets `delivery_status = 'issued'`, audits `invite.issued`, returns nothing. It cannot be called a second time for the same invite. `authenticated`, `anon` and `PUBLIC` have no EXECUTE, so a direct call with an arbitrary hash is impossible for any user; a holder of the service key can only issue for invites that a real user JWT authorized in the last 5 minutes (and the Auth-admin residual risk R-1 stands regardless).
4. **Deliver:** the server emails the plaintext only inside `/auth/invite?token=…` to the invite address (Resend). The accept page sends `Referrer-Policy: no-referrer` and `no-store`, loads no analytics, and the token is never written to application logs; `log_statement` stays off and API logs must not capture RPC bodies (verified in Supabase settings).
5. **Delivery outcome:** the server then calls `mark_invite_delivery(invite_id, 'sent')` or `'failed'`.
   - **Failed or ambiguous (provider error, timeout):** the server calls `mark_invite_delivery(…, 'failed')`, which sets `revoked_at = now()`, `revoke_reason = 'delivery_failed'`, `delivery_status = 'failed'`, **deletes the secret row**, and audits `invite.delivery_failed`. Because a timeout may still have delivered the email, the token is always treated as burned; it can never be accepted afterwards.
   - **Retry:** the inviter repeats step 1 (a **new** authorization and a **new** random token); the partial unique index allows this because the failed invite is revoked. Retries consume the same rate limits.
   - **Crash before outcome:** `private.expire_unissued_invites()` (cron, every 5 minutes) revokes `pending_issue` rows older than 5 minutes (nothing was issued). Rows stuck in `issued` (email possibly sent, outcome unknown) stay valid until expiry or revocation; the UI shows "issued, delivery not confirmed" and offers *Revoke and resend* (revoke, then step 1 again). `sent` is informational only.
6. **Preview (service_role only):** `preview_invite(token)` hashes inside the function, looks up the hash among `issued`/`sent` invites, and returns org name, masked email and validity; unknown, expired, revoked, used, unissued or failed tokens all return an identical generic result (no oracle).
7. **Account:** if the invitee has no account, the server creates the Auth user with the invite email, the password they chose and `email_confirm = true` (possession of the emailed server-generated token is the email proof). Existing users sign in; their email must already be confirmed.
8. **Accept:** authenticated user calls `accept_organization_invite(token)` (plaintext). In the definer function: hash with `extensions.digest(...)`; caller is not staff; `lower(auth.users.email) = invite.email` and `email_confirmed_at is not null`; then one statement `UPDATE organization_invites SET accepted_at = now(), accepted_by = auth.uid() WHERE id = … AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() AND delivery_status IN ('issued','sent') RETURNING …`. Zero rows ⇒ generic failure. Then insert the membership (`unique` conflict ⇒ whole transaction rolls back). The secret row is deleted on success. The function never returns the stored hash. Accepting an owner invite does not itself require step-up (the owner-role authorization was step-up-protected at creation); it is refused if the org is `closed`.
9. **Revoke/expire:** `revoke_organization_invite` sets `revoked_at` and deletes the secret; expiry is evaluated at acceptance time.

**Rate limits (via `private.rate_limits`; counters are persisted by structured denial rather than a raising exception, so a rolled-back transaction cannot erase them):** per organization 20 authorizations/hour and 50 pending invites; per inviter 30/hour; per target email 3 per 24 hours per organization and 10 per 24 hours platform-wide; `issue`/`mark` bounded by the same keys; `preview` and failed `accept` per IP hash (10 per 10 minutes) and per user (5 per 10 minutes) with a 15-minute lockout; owner-role authorizations additionally 5/hour per inviter.
**Audit events (no token or hash is ever placed in `diff`):** `invite.authorized`, `invite.issued`, `invite.delivery_sent`, `invite.delivery_failed`, `invite.revoked`, `invite.expired_unissued`, `invite.accepted`, `invite.accept_failed`, `invite.rate_limited` (once per window), `invite.owner_stepup_denied`.

**Tests (all mandatory):** T-INV-1 valid acceptance creates exactly one membership and one audit row; T-INV-2 replay fails; T-INV-3 two concurrent acceptances of one token: exactly one succeeds; T-INV-4 expired; T-INV-5 revoked; T-INV-6 wrong email; T-INV-7 unconfirmed email; T-INV-8 staff user rejected; T-INV-9 passing the **stored hash** as the token fails; T-INV-10 no role can SELECT `organization_invite_secrets` or any token column; T-INV-11 invalid/expired/used/unissued/failed tokens give identical responses; T-INV-12 failed-accept rate limiting trips; T-INV-13 token and hash absent from every audit `diff`; T-INV-14 owner invite created through `approve_account_request` follows the same two-step lifecycle; T-INV-15 MEMBER cannot create owner invites and an OWNER with fresh step-up can (D-M1-8); T-INV-16 owner invite into a closed org fails; **T-INV-17** `create_organization_invite` has no hash parameter and creates an inert row that cannot be previewed or accepted; **T-INV-18** `authenticated`/`anon` cannot execute `issue_organization_invite` or `mark_invite_delivery`; **T-INV-19** issue succeeds once, a second issue fails, issue after 5 minutes fails; **T-INV-20** delivery failure revokes the invite and deletes the secret, and the old token no longer previews or accepts; **T-INV-21** retry after failure creates a new invite with a different token and the old one stays dead; **T-INV-22** `expire_unissued_invites` revokes stale `pending_issue` rows and leaves `issued` rows; **T-INV-23** per-org, per-inviter, per-email and owner-role rate limits trip and persist across rolled-back calls; **T-INV-24** every event in the audit list above is written exactly once on its path.

### 5.8 Gate/flag separation (D-M1-6, corr. D)
- **Distinct audit events:** `gate.approved`, `gate.revoked`, `gate.expired`, `flag.enabled`, `flag.disabled`, `flag.enable_denied` (recorded by `set_platform_flag` returning a structured denial after writing the audit row, so denials persist), each carrying the actor.
- **Single-admin rule:** the flag guard trigger counts active admins (N). For `high_risk` flags: **N < 2 ⇒ false→true is blocked outright.** N ≥ 2 ⇒ the activator (`auth.uid()` read inside the trigger, not a caller-supplied column) must differ from `approved_by` of **every** required gate record.
- **No bypass:** the trigger requires `auth.uid()` to be an active admin at aal2; calls without a user JWT (service_role, scripts) fail. Neither service_role nor `authenticated` has table privileges; only `set_platform_flag` (definer) changes flags, and the trigger still re-validates gates, expiry, distinct-admin and reason. (Superuser/owner can disable triggers; see §5.9 limitation and R-2.)
- **Atomic disabling:** an AFTER UPDATE trigger on `compliance_gates` sets dependent `platform_flags.enabled = false` in the **same transaction** when a gate becomes `revoked` or `expired`, with audit events attributed to the revoking actor or `system`. A scheduled `private.expire_gates()` (pg_cron, every 5 minutes) flips expired gates. Fail-safe at read time: `assert_flag_enabled(key)` = `enabled AND gates_satisfied(required_gates)` evaluated at call time, so an expired gate stops the feature immediately even before the sweeper runs.
- **Tests:** T-GF-1 enabling with a missing/pending/revoked/expired gate fails; T-GF-2 single admin cannot enable a high-risk flag even with all gates; T-GF-3 with two admins the gate approver cannot enable, the other admin can; T-GF-4 revoking a gate disables dependent flags atomically and writes audit rows; T-GF-5 expiry (clock-advanced) makes `assert_flag_enabled` fail before the sweeper; T-GF-6 service_role and `authenticated` direct UPDATE fail; T-GF-7 dashboard-style UPDATE with no JWT fails the trigger; T-GF-8 flag changes always have `reason` and two distinct audit events for approve vs enable; T-GF-9 `commissions_enabled` (not high-risk) enable works with one admin.

### 5.9 Audit hash-chain specification (D-M1-10, corr. F)
- **Algorithm:** SHA-256 (`extensions.digest(data, 'sha256')`), 32-byte values.
- **Genesis:** `prev_hash` of the first row = `sha256('99purity-audit-genesis-v1')` (fixed constant, documented).
- **Canonical serialization (v1):** UTF-8 byte string `v1` followed, for each field in this fixed order, by `|<n>:<value>` where `n` is the byte length of the UTF-8 value and NULL is written as `|-`. Order: `id`, `occurred_at` (UTC, `YYYY-MM-DD"T"HH24:MI:SS.US"Z"`), `actor_user_id`, `actor_kind`, `organization_id`, `action`, `entity_type`, `entity_id`, `diff` (`jsonb::text`, which is deterministic for a stored jsonb value), `ip` (text), `user_agent`, `request_id`. Length prefixes make the encoding unambiguous. `row_hash = sha256(prev_hash || canonical_bytes)`.
- **ID allocation and write sequence (C-3).** `audit_log.id` is a plain `bigint not null primary key` with **no identity and no default**, so a hash can never be computed over an id the database has not yet assigned. `private.write_audit()` performs exactly these steps, in this order, in one transaction:
  1. Acquire `pg_advisory_xact_lock(<fixed key>)` (transaction-scoped; released only at commit or rollback). It first asserts `current_setting('transaction_isolation') = 'read committed'` and raises otherwise (a repeatable-read snapshot could miss the latest committed head).
  2. Allocate the id with `nextval('private.audit_log_id_seq')`.
  3. Read the latest **committed** chain head: `SELECT row_hash FROM public.audit_log ORDER BY id DESC LIMIT 1` (genesis constant if the table is empty). Holding the lock guarantees no other writer can commit a newer row between this read and our insert.
  4. Build the canonical bytes using the allocated id.
  5. Compute `row_hash = sha256(prev_hash || canonical_bytes)`.
  6. `INSERT` the row with the **explicit** allocated id, `prev_hash` and `row_hash`.
  7. Commit while still holding the lock (the commit releases it). Because the lock is taken before `nextval`, ids are monotone in commit order and chain order equals id order.
- **Sequence ownership and permissions:** `private.audit_log_id_seq` is created by the migration owner role and `OWNED BY` that role's `audit_log.id`; no API role (`PUBLIC`, `anon`, `authenticated`, `service_role`) has `USAGE`, `SELECT` or `UPDATE` on it, so none can call `nextval` or `setval`; the `private` schema is not exposed to the Data API; only the definer `write_audit()` uses it. A lint test fails if any other role holds a privilege on the sequence or if `audit_log.id` gains a default or identity.
- **Rollback gaps:** `nextval` is not transactional, so a rolled-back audit write consumes an id and leaves a gap but no chain row. Verification never requires contiguous ids; it relies on `prev_hash` linkage. Throughput is intentionally serialized (acceptable at this volume; revisit if audit writes exceed roughly 100/s).
- **Verification (`verify_audit_chain(from_id default 0, expected_head default null)`):** iterate rows by `id`; for each, check `prev_hash` equals the previous row's `row_hash` (genesis for the first), recompute `row_hash` from stored fields and compare. Return the first failing `id` and reason: `link_broken`, `hash_mismatch`, `genesis_mismatch`, or (when `expected_head` is given) `head_mismatch`/`tail_truncated`.
- **Detection and verification tests (tamper tests run with triggers disabled by the test harness acting as database owner):** modified row ⇒ `hash_mismatch` at that id; deleted middle row ⇒ `link_broken` at the next id; reordered/swapped rows ⇒ `link_broken`; modified `prev_hash` ⇒ `link_broken`; deleted **last** row ⇒ undetectable by the chain alone, detected only via `expected_head` (test asserts `tail_truncated`); **concurrent writers** (50 parallel transactions, repeated) produce a valid unbroken chain with ids strictly increasing in commit order; **rollback gaps**: a deliberately rolled-back write leaves an id gap, `verify_audit_chain()` still passes and the next row links to the last committed hash; an insert without an id fails (no default); a call under `REPEATABLE READ` is refused; `authenticated`/`anon`/`service_role` cannot `nextval`/`setval` the sequence or insert/update/delete/truncate the table; the lint test for sequence ownership and privileges passes.
- **Limitation (explicit):** a database owner or superuser can disable triggers and rewrite the entire chain from any point forward with valid hashes. The chain makes casual or partial tampering detectable; it is not protection against a fully privileged insider.
- **Future independent export:** in Milestone 10 a scheduled job writes `(max id, row_hash, timestamp)` to separate write-once storage (for example an object-locked bucket in a different account or a signed email to a compliance mailbox). Until then `audit_chain_head()` exists and recording the head manually at each release is a checklist item.

### 5.10 Turnstile and account-request intake (D-M1-4, D-M1-7)
`/request-access` (new, portal tree) posts to a Next server action that: checks a honeypot field, **verifies the Turnstile token server-side** with Cloudflare `siteverify` (secret key server-only, includes remote IP), rate-limits by IP hash and email, then calls `submit_account_request` as service_role. **Fail closed:** if Turnstile is unreachable, errors, or returns failure, the request is rejected (no bypass mode). The public `/wholesale-application` page and its email flow are untouched; linking between them is a separate approved change.

### 5.11 Owner MFA step-up for owner grants (D-M1-3, C-1)
**Scope:** exactly two operations require it: (1) creating an invitation with role `owner`; (2) promoting an existing member to `owner`. Ordinary `member` invitations, demotions, removals and all other owner actions do **not** require this extra step-up in M1.
**Rule, enforced inside the SECURITY DEFINER RPCs** (`create_organization_invite`, `set_member_role`, and for ADMIN callers also `admin_add_member`, `approve_account_request`, `admin_resend_owner_invite`, using the staff step-up of §5.3): after the OWNER/capability check, and **before any write**, require `private.is_aal2()` **and** `private.has_recent_step_up()` (verified TOTP step-up recorded within the last 15 minutes for the current session). If either fails the function returns a structured denial `owner_mfa_required` and audits `invite.owner_stepup_denied` / `member.owner_stepup_denied`; it never falls back to aal1 and never proceeds. There is no direct DML path to grant owner (no INSERT/UPDATE grants on `organization_members` or `organization_invites`), so the RPC is the only door.
**Enrolment of the owner's own factor:** a customer owner enrols their own TOTP factor through normal Supabase MFA (self-service; the staff enrolment window of §5.12 applies to staff only). An owner with no verified factor cannot reach aal2 and therefore cannot grant owner; the UI sends them to enrolment. Residual risk R-5.
**Tests (mandatory):** T-OMFA-1 OWNER at aal1 cannot create an owner invite; T-OMFA-2 OWNER at aal2 **without** a step-up row cannot create an owner invite; T-OMFA-3 OWNER at aal2 with a step-up older than 15 minutes cannot (14:59 passes, 15:01 fails); T-OMFA-4 a step-up recorded for a **different session** does not count; T-OMFA-5 the same cases for promoting a member to owner; T-OMFA-6 OWNER with a fresh step-up can do both; T-OMFA-7 a MEMBER can do neither, with or without step-up; T-OMFA-8 ordinary member invitations succeed at aal1 without step-up; T-OMFA-9 denied attempts write the denial audit event and change no rows; T-OMFA-10 direct INSERT/UPDATE on `organization_members` and `organization_invites` fail for every role; T-OMFA-11 `record_step_up()` fails closed when `amr` or `session_id` is missing; T-OMFA-12 ADMIN paths (`admin_add_member` with owner role, `approve_account_request`, `admin_resend_owner_invite`) require staff step-up.

### 5.12 Staff MFA enrolment window (approved design, C-2)
**Purpose:** no staff MFA factor becomes effective unless an administrator has authorized enrolment for that specific staff user, for a short time, with a recorded, audited decision.
**Objects (all in `private`, no API privileges):**
- `staff_mfa_enrolment_windows(id, target_user_id → staff_members, authorized_by, authorized_at, expires_at, revoked_at, revoked_by, revoke_reason, consumed_at, reason)`; `expires_at` defaults to `authorized_at + 30 minutes`, CHECK ≤ 60 minutes; partial unique index: at most one open window per target.
- `staff_mfa_factors(user_id, factor_id uuid pk, window_id, approved_at)`: the factors that count.
**RPCs:**
- `admin_authorize_staff_mfa_enrolment(target_user_id, minutes, reason)`: caller is ADMIN (`staff.manage`) at aal2 with step-up; **target ≠ caller** (a second person must authorize; the sole-admin case is the break-glass bootstrap script); target must be an active staff member; audits `staff_mfa_window.authorized`.
- `admin_revoke_staff_mfa_enrolment(window_id, reason)`: same authorization; audits `staff_mfa_window.revoked`.
- `check_staff_mfa_enrolment()`: called by the server **before** any application-mediated enrolment call to Auth (`mfa.enroll`); returns whether the caller has an open, unexpired, unrevoked, unconsumed window. The server refuses to start enrolment otherwise. The function evaluates only the **caller's own** `auth.uid()`, so a window for user X cannot be used to enrol user Y.
- `claim_staff_mfa_factor(factor_id)`: after the user has enrolled and verified the factor, the server calls this. It requires: caller is active staff; the caller's own open window; the factor exists in `auth.mfa_factors` with `user_id = auth.uid()`, `status = 'verified'` and `created_at >= window.authorized_at`; and the window is still open **now**. In one transaction it inserts `staff_mfa_factors`, sets `consumed_at` (single use) and audits `staff_mfa_window.consumed` and `staff_mfa.factor_approved`.
- Expiry: `private.expire_enrolment_windows()` (cron, every 5 minutes) audits `staff_mfa_window.expired`; every read also evaluates `expires_at`, so an expired window is dead immediately even if the job is late.
**Database backstop (needed because browsers can call Auth directly):** the application server cannot intercept a browser calling Auth's enrol endpoint, so `private.is_aal2()` for **staff** is true only if the user has **no verified factor in `auth.mfa_factors` that is absent from `staff_mfa_factors`**, and at least one approved factor exists. **Owner decision (all factor types):** the rule applies to **every verified factor of every type** (TOTP, phone, WebAuthn and any type Supabase adds later). Factor types are handled explicitly: the check compares `factor_type` and `status` as text against an allow-list and treats any verified factor whose type is not recognized, or whose type/status cannot be read, as **unapproved** (fail closed). M1 enrolment is TOTP only, so `claim_staff_mfa_factor` accepts only `factor_type = 'totp'`; claiming any other type is refused until a later approved change. The structure guard and every function or diagnostic reading `auth.mfa_factors` select only `id`, `user_id`, `factor_type`, `status`, `created_at` and **never the `secret` column**. A factor enrolled outside an authorized window is therefore never trusted: while it exists, all of that user's staff privileges are suspended (fail closed) and an alert audit event `staff_mfa.unapproved_factor_detected` is written by the next check. Removing or replacing an approved factor likewise requires a new authorized window. `verify_staff_factors()` (ADMIN) reports every divergence between `auth.mfa_factors` and `staff_mfa_factors`. (The claim RPC itself is callable at aal2 before approval; it is the only function exempt from the approved-factor condition.)
**Fail-closed structure guard (V5b, migration 0002).** The approved-factor backstop must never grant access because something unexpected happened. Objects: `private.platform_validations(check_name pk, status passed|failed, checked_at, sqlstate, expected_columns text[], observed_columns text[], server_version text)` (no API privileges) and `private.run_auth_structure_check()` (VOLATILE definer, no API EXECUTE; run by migration tests, CI and cron). It reads only column **names** from the catalogue plus a count-only probe of `auth.mfa_factors`, inside an exception block. Rules:
1. **Denied until validated:** with no `passed` row for `auth_mfa_factors_shape`, or one older than 24 hours, `private.is_aal2()` is false for every staff user. Staff access stays denied until the check succeeds.
2. **Errors never grant:** inside `is_aal2()` the factor read is wrapped in an exception handler; any error (`undefined_table`, `undefined_column`, `insufficient_privilege`, or anything else) or an unexpected column set returns false.
3. **Safe diagnostics only:** check name, status, SQLSTATE, expected versus observed column **names**, server version, timestamp. Never row data, user ids, factor ids, tokens or secrets.
4. **Alert and bootstrap:** a failed check audits `platform.validation_failed` (system actor); `supabase/bootstrap/first-admin.sql` refuses to run unless the check has passed.
5. **Drift:** the check re-runs on a schedule and in CI after any Supabase upgrade, so a structural change flips staff access to denied automatically.
**V5b tests (additional):** T-V5B-7 a verified factor of each non-TOTP type (phone, WebAuthn) not claimed through a window suspends staff privileges; T-V5B-8 an unrecognized `factor_type` value or an unreadable type/status fails closed (staff denied); T-V5B-9 a static test fails the build if any migration, function or diagnostic references `auth.mfa_factors.secret`; T-V5B-10 `claim_staff_mfa_factor` refuses non-TOTP types in M1.
**V5b tests:** T-V5B-1 passes on hosted dev and local; T-V5B-2 unprivileged roles cannot read `auth.mfa_factors`; T-V5B-3 (local only, in a rolled-back transaction) revoking the definer's access makes `is_aal2()` false and records `failed` with SQLSTATE and no data; T-V5B-4 (local only, rolled back) renaming a column makes the check fail with expected/observed names and `is_aal2()` false; T-V5B-5 an absent or stale validation row denies all staff; T-V5B-6 no diagnostic column contains ids or secrets.
**Stated limitation (explicit):** the window and the approved-factor binding restrict **application-mediated** enrolment and make unapproved factors ineffective for staff authorization. They **cannot prevent direct Auth administration API abuse if the service-role key itself is compromised**: a holder of that key can still create or alter Auth users, reset passwords, and add or delete factors. The binding limits what such actions achieve (an unapproved factor does not grant staff access, and it locks the account and raises an alert), but it is not a substitute for protecting the key, and it depends on the `auth.mfa_factors` read validated in V5. A party with direct database-owner access is outside this control (R-2).
**Retained requirements:** the service-role key is server-only (`server-only` imports, never `NEXT_PUBLIC_*`, marked Sensitive in Vercel, secret scan in CI); Auth events are monitored (log drain and alerts on factor enrol/unenrol/verify, password reset, email change, admin-API user create/update/delete, and on `staff_mfa.unapproved_factor_detected`); the key is rotated on a schedule and immediately on any suspicion; an incident-response runbook is a Milestone 1 deliverable (rotate key, revoke all sessions, close open windows, run `verify_staff_factors()` and `verify_audit_chain()`, review Auth logs, notify the owner).
**Tests (mandatory):** T-MFAW-1 happy path: authorize → check → enrol → verify → claim → staff aal2 works; T-MFAW-2 **expired** window: check and claim fail, `expired` audit written, lazy expiry works without the cron; T-MFAW-3 **revoked** window: check and claim fail, `revoked` audit written; T-MFAW-4 **wrong user**: a window for X cannot be checked or claimed by Y, a factor belonging to Y cannot be claimed by X, X cannot claim a factor created before the window; T-MFAW-5 **unauthorized**: customer, FINANCE/OPS/SUPPORT, ADMIN at aal1, ADMIN at aal2 without step-up, and an ADMIN authorizing their own enrolment are all refused and audited; T-MFAW-6 a consumed window cannot be reused; T-MFAW-7 a window length above 60 minutes is rejected; T-MFAW-8 two simultaneous claims: exactly one succeeds; T-MFAW-9 a verified factor enrolled outside any window suspends all staff privileges and raises the alert; T-MFAW-10 deleting the approved factor and enrolling a new one without a window leaves the user without privileges; T-MFAW-11 customers cannot call any window RPC; T-MFAW-12 `verify_staff_factors()` reports divergences; T-MFAW-13 window RPCs write exactly the audit events listed.

## 6. Test strategy
**Machine-readable matrix:** `supabase/tests/rls-matrix.json` (created in implementation) lists every table, actor and operation with expected result; tests are generated from it and a coverage test fails if any `public`/`private` table or definer function is missing from it, so this document and the tests cannot drift.
**PostgREST-level RLS tests (authoritative, Vitest against the local Supabase stack):** real users sign in with real passwords to obtain real JWTs (customers A/B in orgs A/B, owner, member, AUTH-only, four staff roles each with and without aal2, anon key only). For **every table × actor × own-org/other-org**, SELECT (GET), INSERT (POST), UPDATE (PATCH) and DELETE (DELETE) are exercised **independently**:
- Denied SELECT ⇒ `[]` or 401/403; denied INSERT ⇒ 401/403 (`42501`); denied UPDATE/DELETE under RLS typically return success with **zero rows affected**, so each test asserts both the response **and unchanged database state** read back through a separate privileged harness connection.
- Cross-organization attempts: user A tries to read B's rows by id, by filter, by `select=*`, via embedded resources, via RPC with B's ids, and tries to INSERT/UPDATE rows setting `organization_id = B`, and tries to move a row from A to B.
- Every RPC × every actor (allowed and denied), including staff at aal1, aal2 without step-up, and aal2 with step-up older than 15 minutes.
**pgTAP** suites cover policies, grants (no PUBLIC/anon/service_role table privileges), triggers, last-owner/last-admin, flag guard, audit chain, storage policies (including path-traversal names and removed members).
**Integration tests (Vitest):** acceptance tests V4, V5b and V2b-binding (§5.3; V1–V3 and V5a are pre-migration gates run by the validation procedure, not by Vitest), invite lifecycle T-INV-1..24, owner MFA T-OMFA-1..12, staff enrolment window T-MFAW-1..13, gate/flag T-GF-*, audit chain (§5.9), Turnstile fail-closed, retention purge with and without legal hold.
**Playwright smoke:** public home EN/ES unchanged, portal paths redirect unauthenticated users, staff without MFA is sent to enrolment, portal responses are `no-store`/`noindex`, no GA/Clarity requests on portal pages.
**Static:** `tsc --noEmit` and ESLint on portal code; SECURITY DEFINER lint; RLS-enabled-on-every-table lint; no `NEXT_PUBLIC_*` secret lint.
Environment note: Docker Desktop is installed, but its daemon is not running on this machine and must be started for local database suites and CI parity.

## 7. Migration plan and checklist (none created; each reviewed individually; dev first)
Each migration: forward-only, idempotent-safe, default-deny grants, RLS enabled, tests written **with** the migration, matrix JSON updated, all prior tests green.
- [ ] **0001_foundation_identity**: schemas; default-privilege lockdown; `profiles` + `handle_new_user`; `organizations`; `organization_billing`; `organization_members` + last-owner guard; `organization_invites` (with `delivery_status`, `authorized_at`, `revoke_reason`) + `private.organization_invite_secrets`. Tests: grants lint, own-profile only, cross-org read/write denied (all four ops), last-owner (incl. concurrency), no secret-table access.
- [ ] **0002_staff_capabilities**: `staff_members`, `staff_roles`, `capabilities`, `role_capabilities`, helpers (`is_staff`, `is_aal2`, `has_capability`), staff↔member exclusion triggers, last-admin guard; seed capability catalog (§3, four roles only, no `super_admin`); `private.staff_mfa_enrolment_windows`, `private.staff_mfa_factors`, factor-binding in `is_aal2()` guarded by `private.platform_validations` and `run_auth_structure_check()` (§5.12); **authoring requires V5a, V1, V2 (V2b if needed) and V3 recorded; acceptance requires V5b before 0004**; staff access stays denied until V5b passes. Tests: customers cannot see staff, no self-grant, exclusion both directions, last-admin concurrency, role-catalog test (exactly four roles).
- [ ] **0003_audit_log**: table (no identity/default on `id`), `private.audit_log_id_seq` with ownership and privilege lockdown, `write_audit` (lock → nextval → head → hash → explicit-id insert), immutability triggers, chain, `verify_audit_chain`, `audit_chain_head`. Tests: §5.9 detection suite plus concurrent-writer, rollback-gap, isolation-level and sequence-privilege tests.
- [ ] **0004_step_up** *(authored only after V5b has passed on dev; V3 hard blocker already cleared; step-up mode `reverify` or `fresh_session` fixed by V2/V2b)*: `private.step_ups`, `record_step_up` (staff and customer owners), `has_recent_step_up`, owner-grant step-up helper. Tests: **V4** (including V2b binding cases), T-OMFA-4/11, missing-claim fail-closed, 14/16-minute boundary, new session has no step-up.
- [ ] **0005_flags_gates**: `platform_flags`, `compliance_gates`, flag guard, gate cascade, `expire_gates`, `assert_flag_enabled`, seed (all false). Tests: T-GF-1..9, required stub-RPC tests for wallet/live fulfillment/live API keys.
- [ ] **0006_account_requests**: `account_requests`, `private.rate_limits`, retention columns, `submit_account_request` (service_role only), purge function. Tests: no table privileges for any role, service-only submit, support column limits, purge/legal hold, `ip_hash` never returned.
- [ ] **0007_rpcs_identity**: invite (`create`/`issue`/`mark_delivery`/`revoke`/`accept`/`preview`), member/org/staff/profile/billing RPCs, `admin_resend_owner_invite`, enrolment-window RPCs (`authorize`/`revoke`/`check`/`claim`), cron functions (`expire_unissued_invites`, `expire_enrolment_windows`), with audit and PII-read audit. Tests: T-INV-1..24, T-OMFA-1..12, T-MFAW-1..13, every RPC × every actor, PII RPC field-limit tests per role, escalation attempts.
- [ ] **0008_storage**: buckets, policies, quota trigger. Tests: all four storage ops × actors × own/other org, traversal names, removed member, immutable objects, anon denied, signed-URL TTL.
- [ ] **0009_lint_and_grants_check**: assertions that every table has RLS, no PUBLIC/anon/service_role table grants, definer functions pinned and allow-listed, Realtime publication empty of M1 tables.
- [ ] After each: apply to **dev only**, run full suite, record results; staging after M1 acceptance; production untouched.

## 8. Decision log
| ID | Decision (owner, 2026-11-07) | Where implemented |
|---|---|---|
| D-M1-1 | ADMIN retains explicit finance capabilities in M1; revisit separation of duties in M4 | §3 |
| D-M1-2 | Staff cannot be organization members; enforced both directions in the database | §0.6, §2.3, §2.5 |
| D-M1-3 | OWNER MFA optional generally; **mandatory (aal2 + step-up ≤ 15 min, enforced in the RPC) before creating an owner-role invitation or promoting a member to owner**; broader owner MFA required before other sensitive financial/administrative access (M4/M6 prerequisite) | §5.5, §5.11 (C-1) |
| D-M1-4 | Cloudflare Turnstile for account requests; server-side verification mandatory (fail closed) | §5.10 |
| D-M1-5 | Rejected requests retained 12 months, subject to legal holds and applicable obligations | §2.7, R-6 |
| D-M1-6 | Gate recorder and flag enabler differ once ≥2 active admins; with 1 admin, high-risk activation blocked | §5.8 |
| D-M1-7 | Add `/request-access`; `/wholesale-application` unchanged | §5.10 |
| D-M1-8 | OWNER may invite another OWNER, subject to last-owner protections | §2.3, §5.7 |
| D-M1-9 | Sensitive staff mutations need verified MFA step-up within 15 minutes; fail closed | §5.3 |
| D-M1-10 | Audit hash chain accepted with full spec and tests; id allocated by `nextval()` inside the lock, explicit-id insert | §5.9 (C-3) |
| C-2 | Staff MFA enrolment only inside an admin-authorized, audited, expiring, single-user window; approved-factor binding; limitation vs service-key compromise documented | §5.12 |
| C-4 | No `super_admin`; ADMIN capabilities with aal2 + step-up perform those duties | §3 |
| C-5 | Invite hash is issued only by service-role code after a user-authorized `pending_issue` row; delivery failure burns the token; retries create a new token | §5.7 |
| V-1 | Validation sequence: V5a, V1, V2 (V2b if needed), V3 before 0002; V5b after 0002 and before 0004; V4 after 0004; V4 and V5b must pass before remaining M1 implementation is accepted | §5.3, `M1-VALIDATION-PLAN.md` |
| V-2 | V2b is a separate fallback test; V2 failure and V2b success recorded separately | §5.3 |
| V-3 | V5b fails closed; unexpected `auth.mfa_factors` structure or access error never grants staff privileges; safe diagnostics only | §5.12 |
| V-4 | V3 stays a hard blocker; redesign step-up before 0004 if refresh freshens an old TOTP timestamp | §5.3 |
| V-5 | Validation scripts: no secrets or tokens, session_id redacted, no new dependencies, no app source changes | `M1-VALIDATION-PLAN.md` §6 |

## 9. Unresolved risks and assumptions
- **R-1 service key and Auth admin API (high, partially mitigated):** the service key can create/modify auth users and delete or add MFA factors via the Auth admin API even though it has no database privileges, and §5.12 cannot stop that. Mitigation now designed: approved-factor binding makes an attacker-added factor ineffective for staff authorization (and locks the account with an alert), plus server-only key handling, Auth event monitoring, rotation and an incident-response runbook. Remaining exposure: customer accounts (password reset/email change by key holder), denial of service by adding an unapproved factor, and dependence on V5.
- **R-2 database owner/superuser:** can disable triggers (flag guard, audit immutability, last-owner). Mitigation: restrict dashboard/DB access, log SQL editor use, export audit heads (M10).
- **R-3 `amr`/`session_id` behavior:** assumptions in §5.3 are validated only by documentation until V1–V3 run on the real dev project (pre-migration gates for 0002). V3 is a hard blocker: if an ordinary refresh makes an old TOTP timestamp appear fresh, step-up must be redesigned before 0004. V4 and V5b are acceptance tests that must pass before the remaining M1 implementation is accepted.
- **R-4 uploads:** MIME is client-claimed; magic-byte checks and malware scanning are deferred to the milestone that consumes documents.
- **R-5 owner first-factor enrolment:** owner factors are self-service. An attacker who takes over an owner's password before that owner has enrolled a factor could enrol their own and then pass the step-up. Mitigations: email-confirmed sessions only, notification email on first factor enrolment, audit event, and the owner-grant actions being limited to two audited operations. Staff are not affected (§5.12).
- **R-9 invite pre-claim via issue window:** a holder of the service key could issue a token for an invite authorized in the last 5 minutes. Impact bounded by R-1; invites need a real user JWT authorization first.
- **R-10 `auth.mfa_factors` is not a public API:** its shape may change on Supabase upgrades; the structure guard (§5.12) re-checks it on a schedule and in CI, and any deviation or read error denies staff access (fail closed) until validation passes again.
- **R-6 retention:** 12 months is an engineering default; legal/tax/KYC retention obligations for applicants and customers need counsel review before production.
- **R-7 audit throughput:** the advisory lock serializes audit writes; fine at current volume.
- **R-8 pg_cron availability:** the gate sweeper and purge need `pg_cron` (available on Supabase); read-time `assert_flag_enabled` covers the gap if the job is delayed.
- **Assumptions:** Supabase `auth.jwt()` exposes `aal`, `amr`, `session_id`; Turnstile keys will be supplied by the owner; Docker will be started for local suites; one active admin exists at launch (high-risk flags therefore stay blocked until a second admin is created).

## 10. Revision history
| Rev | Date | Summary |
|---|---|---|
| 1 | 2026-11-07 | Initial schema and RLS matrix for review. |
| 2 | 2026-11-07 | Ten owner decisions recorded; invite token flaw fixed (plaintext to RPC, hash in no-grant table); staff PII minimization and `organization_billing` split; gate/flag separation; fail-closed step-up (no `iat`); audit hash-chain spec; storage, concurrency and PostgREST test hardening. |
| 3 | 2026-11-07 | **C-1** owner MFA step-up for owner invites and promotions (§5.11, T-OMFA-*); **C-2** staff MFA enrolment window plus approved-factor binding (§5.12, T-MFAW-*); **C-3** audit id allocated by `nextval()` after taking the lock, explicit-id insert, sequence ownership and tests (§5.9); **C-4** `super_admin` removed, ADMIN with step-up performs those duties (§3); **C-5** invite trust boundary: `pending_issue` authorization, service-only hash issuance, delivery-failure revocation, retry, rate limits, audit (§5.7, T-INV-17..24); R-5 rewritten, R-9/R-10 added; checklist adjusted for migrations 0001, 0002, 0003, 0004, 0007. |
| 4 | 2026-11-07 | Approved validation plan recorded: circular V-gate dependency resolved into pre-migration gates (V5a, V1, V2/V2b, V3 before 0002) and post-migration acceptance tests (V5b after 0002 and before 0004; V4 after 0004; both required before the remaining M1 implementation is accepted); V2b separated; fail-closed structure guard for V5b (§5.12); V3 reaffirmed as hard blocker; script-safety requirements; checklist and risks R-3/R-10 updated. |
