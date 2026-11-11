# First-administrator bootstrap: final procedure and security review

Status 2026-11-10. **Prepared, not performed.** No bootstrap write has been made, and none is authorized until you approve it separately and name the administrator account. The tooling exists and was tested only in refusal mode (self-test and hosted `--check`/dry-run with dummy inputs, all refused, nothing written).

## 1. What must be true before it can run
1. Migrations **0003 and 0004 are applied and verified on hosted** (the script refuses otherwise: it needs `private.write_audit` and `public.rpc_staff_claim_factor`).
2. You identify **one dedicated administrator account**: a new Auth user created by you in the Dashboard with a mailbox you control and a password only that person knows. It must not be either validation account (the script excludes their recorded ids and never prints them), must not be an organization member, must have no MFA factor yet, and must have a confirmed email.
3. You give a written approval naming the **user id and email** and an **approval reference** (a ticket or message id, no secrets). The script accepts it only as the exact string `approve-first-admin:<user-id>:<email lower case>:<approval-ref>` in `P2_BOOTSTRAP_APPROVED`.
4. `public.staff_members` and `public.staff_roles` are empty: **the script cannot add a second administrator**, ever; later administrators are added through `rpc_staff_add_member` by an existing verified admin.

## 2. Steps (owner-run unless stated)
| # | Who | Action | Writes |
|---|---|---|---|
| 0 | owner | `node bootstrap-first-admin.mjs --check --user-id … --email … --approval-ref …`: read-only, lists every violated precondition | none |
| 1 | owner | same command without `--check`: **dry run**: performs all writes inside the transaction, verifies the resulting state, **rolls back** | none persisted |
| 2 | owner | `P2_BOOTSTRAP_APPROVED=<exact string> P2_BOOTSTRAP_COMMIT=yes node bootstrap-first-admin.mjs --commit …`: one transaction: staff row (`created_by` NULL), role `admin` (`granted_by` NULL), a 30-minute enrolment window (`authorized_by` NULL, allowed only for this script), one audit event `staff.bootstrap.admin` (actor kind `system`, with the approval reference and the window id); post-write state verified before COMMIT | persisted |
| 3 | the administrator | within the 30 minutes: signs in, enrols a TOTP authenticator in the portal, verifies the first code, then claims the factor with `rpc_staff_claim_factor` (requires a fresh TOTP verification; the 0002 trigger checks the factor was created inside the window and consumes the window) | by the RPC |
| 4 | owner (read-only) | verification: `rpc_my_staff_context` for the real session returns `session_ok = true`; the directory lists exactly one active admin; the audit log holds the bootstrap event; the two validation accounts are byte-for-byte unchanged | none |
| 5 | the administrator | adds a **second administrator** (another person, own mailbox and authenticator) through `rpc_staff_add_member`, so that no single lost device locks the platform | by the RPC |
If the window lapses before step 3, a second owner-run script revokes the lapsed window and opens a new one (one open window per user; a lapsed window still counts as open). Same preconditions, approval and audit. Nothing else changes.

## 3. Security review
| Threat | Control |
|---|---|
| A visitor or customer promotes themselves | no API role has any write grant on the staff tables; every staff RPC needs an existing verified admin; the exclusion guard blocks any user with an organization membership |
| A second "first admin" appears later | the script refuses unless both staff tables are empty |
| Use of a validation or other unintended account | recorded validation ids are excluded; the script requires the exact id **and** email, a confirmed email, an identity, no membership and no factor |
| The approval is replayed for another account | the approval string contains the user id, the email and the reference; any change fails the comparison |
| Accidental write | default modes never write; commit needs the `--commit` flag, `P2_BOOTSTRAP_COMMIT=yes` and the approval string |
| Partial state | one transaction; post-write counts are asserted before COMMIT; any error rolls back |
| The window is hijacked | the window targets one user; the factor must be a verified TOTP factor of that user created inside the window; a different user's factor or a factor created before the window is rejected by the 0002 trigger; the window is consumed on use and expires in 30 minutes |
| An observer reads secrets | nothing secret is printed or stored; the audit detail holds only the approval reference and the window id; TLS is strictly verified against the pinned CA |
| The operator acts without trace | the audit event is written by the same transaction; the script log is kept; the first admin is recognizable by `created_by`/`granted_by` NULL |
| The operator and the administrator are the same person | allowed only if the approval reference documents it; recommended that they differ |
**Residual risks.** The database owner credential is powerful by nature: whoever holds it can write the staff tables directly, bypassing this script; protect and rotate it, and treat its use as an incident outside the approved procedure. A lost authenticator of the **only** administrator cannot be recovered through the API: mitigated by step 5 and by the break-glass path (owner-run window script plus the lost-factor decision D-P24-2).

## 4. Abort and rollback
Before COMMIT everything is rolled back automatically. After COMMIT there is no automated undo (it would be destructive: remove the staff row, which cascades to roles, windows and approvals, and requires the last-admin guard to be set aside): it needs your separate approval and an owner-run script that does not exist yet by design.
