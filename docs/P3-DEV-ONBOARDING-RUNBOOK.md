# P3 development onboarding runbook (PREPARED, NOT EXECUTED)

Nothing below has been run. Every database step needs the project owner's separate written approval naming the exact hashes. Do not paste passwords or secrets into any chat or message; set them only in the Supabase Dashboard.

## 1. Identities (created by the owner in Supabase Dashboard: Authentication > Users > Add user, "Auto Confirm User" on)
| Id | Purpose | Requirements |
|---|---|---|
| CUSTOMER-OWNER | owner of organization `99PW-DEV-001` | a real mailbox and a password known only to the person; NOT staff |
| ADMIN | the first administrator | a NEW dedicated account (never one of the two M1 validation accounts), a mailbox the owner controls, a password only that person knows, and an authenticator app on their phone; must be created AFTER 2026-11-10T21:04:32Z (the bootstrap checks this) |

## 2. Order of operations
1. **Customer fixtures (Path B).** Offline plan (safe, no database): `node supabase/review/provisioning/provision-p3-dev-fixtures.mjs --offline-plan`. The owner chooses the markup mode (see `docs/P3-DEV-FIXTURE-PRICING.md`). Then, with approval: a `--dry-run` (rolled back) followed by `--commit`.
2. **First administrator (Path A).** With approval: `bootstrap-first-admin.mjs --check`, then a dry run, then `--commit`. The tool prints a sign-in path containing the 30-minute authorization window; give it to ADMIN.
3. **ADMIN signs in** at `/login`, is sent to `/login/mfa/setup`, scans the QR code, enters the first code and the authorization code (pre-filled from the printed path). The factor is approved for staff access and ADMIN reaches the admin area at aal2.
4. **Real browser walkthrough** of the customer workflow (CUSTOMER-OWNER) and the admin workflow (ADMIN), recording what actually happened.

## 3. Commands (placeholders in angle brackets; hashes are printed by each tool's `--offline-selftest`)
Customer fixtures:
```
node supabase/review/provisioning/provision-p3-dev-fixtures.mjs --dry-run --authorized-read-env-local --harness-sha <script sha256> --owner-email <customer owner email> --markup-mode <org_percent_plus_rep_fixed|org_percent_only> --approval-ref <reference>
```
Commit adds `--commit` and, in the environment of that one process only, `P3_FIXTURES_COMMIT=yes` and `P3_FIXTURES_APPROVED=approve-p3-dev-fixtures:<manifest sha first 12>:<owner email lower case>:<markup mode>:<reference>`.

First administrator:
```
node supabase/review/tools/bootstrap-first-admin.mjs --check --authorized-read-env-local --harness-sha <tool sha256> --user-id <admin Auth user id> --email <admin email> --approval-ref <reference>
```
A dry run is the same command without `--check`; commit adds `--commit`, `P2_BOOTSTRAP_COMMIT=yes` and `P2_BOOTSTRAP_APPROVED=approve-first-admin:<user id>:<email lower case>:<reference>`.

## 4. What each tool refuses (all tested offline against a fake database)
Wrong project, TLS or CA failure, a tampered script, manifest or seed, a missing approval, an owner or admin that is missing, unconfirmed, banned, deleted or ineligible, an existing first administrator (bootstrap), existing records with different content (provisioning: a different price, organization name, rule or membership; nothing is overwritten), a failed write or verification (rolled back), an ambiguous COMMIT (reported, never retried).

## 5. After provisioning
The admin screens (products, pricing, organization catalog, orders, status) call the real RPCs; price, markup, organization-creation and member changes need a fresh TOTP step-up (the UI shows a "Verify now" link when the database asks for one). Normal staff management should then move to the admin interface; the bootstrap tool refuses to run again.
