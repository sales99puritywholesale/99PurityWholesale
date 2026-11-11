# Security Assessment

Audit date: 2026-11-07. Static review; no penetration testing, no dynamic analysis, `.env` files not read.

## 1. Current 99 Purity posture (verified)
| Area | Finding | Severity |
|---|---|---|
| Auth/accounts | None exist | n/a (gap) |
| Forms (`src/app/actions/formActions.ts`) | Only required-field checks. No format validation, CAPTCHA or rate limiting | Medium |
| Staff email | User input interpolated **unescaped** into HTML email (HTML injection into staff inbox) | Medium |
| Lead durability | If Resend fails the lead is lost; Sheets webhook optional | Low |
| Email config | Falls back to hard-coded recipient list including a personal Gmail and to sandbox sender `onboarding@resend.dev` | Low/Medium |
| Build | `ignoreBuildErrors` + `ignoreDuringBuilds` true (`next.config.mjs:15-16`), so type/lint failures ship | Medium |
| Secrets | `.env` is gitignored (`.gitignore:46`); only `NEXT_PUBLIC_*` values are client-exposed (WhatsApp number, contact email, GA, Clarity IDs). `RESEND_API_KEY` is server-only. Env read in code but absent from `.env`: `NEXT_PUBLIC_BASE_URL`, `SENDER_EMAIL` | OK |
| Tooling | Corrected in M1: `node_modules` was corrupt (not simply missing typescript). After `pnpm install --frozen-lockfile`: 2 baseline TS errors (`useNestedSmoothScroll.ts`), lint clean. `package-lock.json` is out of sync with `package.json`; two lockfiles exist | Info |
| Third-party scripts | GA and Clarity load in the root locale layout; must not reach portal pages | High for portal |
| PWA | Service worker scope `/` may cache authenticated pages | High for portal |

## 2. Aspen reference findings relevant to our design
| # | Finding | Evidence | Severity |
|---|---|---|---|
| A1 | Wholesale checkout writes client-computed prices/totals; no trigger validates them. Any approved buyer can set any price | `checkout.tsx:117-132` (verified); insert policies/triggers (DB audit) | **Critical** if copied |
| A2 | `audit_logs` is mutable by service paths and contains PII diffs | DB audit | Medium |
| A3 | Realtime `sync` channel lets any authenticated user listen to change hints | DB audit | Medium |
| A4 | Guards that treat `auth.uid() IS NULL` as privileged | DB audit | Low (verify exposure) |
| A5 | Admin gating in UI is cosmetic; real enforcement is RLS and `assert_admin()` in RPCs | Source audit | OK if RLS holds |
| A6 | No secret reaches client bundles; service-role client and cron auth are unused server-side files | Source audit | OK |
| A7 | No SQL/RLS tests exist; 314 unit tests cover pure helpers only | Source audit | High (assurance gap) |
| A8 | Positive: payment-status guard trigger, append-only commission ledger (TRUNCATE blocked), column-level grants, idempotency keys, pinned `search_path` on SECURITY DEFINER | DB audit | Strengths to copy |
Caveat: DB audit did not exhaustively prove every RLS policy and skimmed phases 14–22 and 26.

## 3. Authentication and sessions (proposed)
- Supabase Auth with email+password and magic link; **MFA (TOTP) mandatory for all admin/staff**. Customer owners: MFA is optional in general but **mandatory (aal2 + a recorded step-up within 15 minutes, enforced inside the RPC) before creating an owner-role invitation or promoting a member to owner**; broader owner MFA is a prerequisite before other sensitive financial/administrative access (M4/M6). Ordinary member invitations need no extra step-up.
- Account creation is invitation or admin-approval only; no open self-signup into an org. Wholesale inquiry becomes `account_requests`.
- Session cookies via server helpers (httpOnly, Secure, SameSite=Lax); portal middleware refreshes the session and redirects unauthenticated users.
- Password reset and invite tokens: single use, hashed at rest, short expiry. **Invite tokens (rev. 3):** 32-byte server-generated plaintext goes only to the invitee; the database stores SHA-256 in a no-grant `private` table; the accept RPC takes the plaintext and hashes inside the definer function, so the stored hash is never a credential (see MILESTONE-1 §5.7).
- **Staff step-up (rev. 3):** sensitive staff mutations require a TOTP verification within 15 minutes, proven by a database-recorded step-up row bound to the session (created only when the JWT `amr` shows a fresh TOTP entry). `iat` is not used. Missing or unparseable claims fail closed; there is no aal2-only fallback (MILESTONE-1 §5.3).
- Rate limit login, reset, invite and API-key endpoints.

## 4. Authorization model
- Customer roles per org: `owner`, `member`. Staff roles: `admin`, `finance`, `ops`, `support`: stored in a table **no customer-writable policy can touch**; role checks via SECURITY DEFINER helpers in a non-exposed `private` schema with pinned `search_path`.
- Principle: UI hiding is never a control. Every admin action is re-authorized in the server action and in the RPC.
- Least privilege: finance can confirm payments but not edit prices; ops can move inventory but not confirm payments.
- Org admin actions (invite, remove) cannot remove the last owner; concurrency-safe via row/advisory locks (MILESTONE-1 §5.2).
- **Staff data minimization (rev. 3):** staff have no broad table access to PII. SUPPORT gets name+email (no phone, no billing); OPS gets no billing; FINANCE gets billing address but no unrelated profile data; ADMIN access is explicit and audited (`pii.read`). Billing is split into `organization_billing`.

## 5. Tenant isolation (RLS)
1. Enable RLS on **every** public table by default (CI check fails if a table lacks it).
2. Policies key on `organization_id` through `private.is_org_member(organization_id)`; INSERT/UPDATE policies use `WITH CHECK` as well as `USING`.
3. No `USING (true)` outside deliberately public catalog data.
4. Views: `security_invoker = on`; avoid SECURITY DEFINER views.
5. Storage: private buckets; object path prefix `org/<organization_id>/…` with a storage policy matching membership; signed URLs, short TTL.
6. Realtime: restrict to per-org channels with authorization, not a global broadcast.
7. Service-role key only in server code, never imported by client modules (`server-only`).
8. Mandatory automated tests: two orgs, user A must read/write 0 rows of org B for every table.

## 6. Financial security
- **Prices and totals computed only inside DB RPCs** from price tables; client supplies SKUs and quantities. (Fixes A1.)
- **Payment status not editable by customers:** customers can insert only `claimed` payment rows; `confirmed`/`rejected`/`refunded` only through finance RPC; a guard trigger rejects direct column updates, including from service paths without an explicit flag.
- **Ledger entries are append-only** (reject UPDATE/DELETE/TRUNCATE triggers; revoke table privileges; corrections are compensating entries).
- **Idempotency keys** unique on wallet entries, payments, checkout, webhooks.
- **Wallet:** reserve/charge/release performed in one transaction under a row lock on the wallet; no negative balance without explicit overdraft policy.
- **Segregation of duties:** the user who marks a payment confirmed cannot be the customer who claimed it; high-value adjustments require two staff.
- **Reconciliation job** compares derived balances to entries and alerts.
- Monetary type `bigint` cents; no floating point.
- Refunds and adjustments require reason + actor and are audited.

## 7. Inventory integrity
Append-only `inventory_movements`; allocation RPC with `FOR UPDATE` row locks; CHECK preventing negative levels; every movement references an order/receipt/adjustment and an actor; adjustments need a reason and audit entry.

## 8. API keys, webhooks and secrets
- API keys: generate 32+ random bytes, show once, store only a hash (HMAC with a server pepper) and a short prefix; scopes; test/live separation; last-used tracking; instant revocation; per-key rate limit.
- Third-party store credentials (step 4 integrations) stored encrypted / in a vault; the table holds a reference only.
- Outbound webhooks: HMAC signature + timestamp, retries with backoff, per-endpoint secret, SSRF guard (block private IP ranges) on destination URLs.
- **No secret in `NEXT_PUBLIC_*`**; add CI grep to block it. Rotate any key that has ever been pasted in chat or committed.

## 9. Application-layer controls
- Validate every input with a schema (e.g. zod) on the server; escape HTML in all emails (fix existing issue).
- CSRF: Server Actions same-origin checks; custom route handlers require auth + origin check.
- File uploads: size and MIME allow-list, server-side re-validation, malware scan for agreements/COAs if feasible, random object names.
- Security headers (CSP, HSTS, frame-ancestors none, referrer-policy) on portal routes; no third-party analytics there.
- Disable PWA caching for portal; `Cache-Control: no-store` on authenticated responses.
- Dependency audit and lockfile hygiene (repo has both `package-lock.json` and `pnpm-lock.yaml`: choose one).

## 10. Audit logging
Immutable `audit_log` with actor, org, action, entity, redacted diff, IP, timestamp; written by trigger/RPC, not by client. Hash-chained (SHA-256, fixed canonical encoding, genesis constant, advisory-lock writer, verification function; MILESTONE-1 §5.9). Limitation: a database owner/superuser can rewrite the chain; independent head export is planned for M10. Log: login, MFA changes, role changes, price changes, payment status transitions, wallet entries, inventory adjustments, API-key create/revoke, exports.

## 11. Data separation from Aspen
Separate Supabase project, keys, buckets, domains and email sender. Never connect to Aspen's database. Strip all Aspen data listed in REUSE-MAP section E. During this audit Aspen `.env.local` and `.env.staging-credentials` files were not read.

## 12. Compliance / business risk (outside engineering scope)
Online sale of research peptides, wallet balances held for customers, and card/ACH handling can carry legal, banking and payment-processor restrictions. Recommend legal review before launch. Stated project rules ("research use", banned wording) must be preserved in portal copy.

## 13. Priority actions
1. Server-side pricing RPC from day one.
2. RLS-on-everything CI check + cross-tenant tests.
3. MFA for staff and a segregated finance role.
4. Disable PWA/analytics on portal.
5. Fix HTML escaping and add spam protection on public forms.
6. Enforce `tsc` and lint in CI.

## 14. Revision 2 (2026-11-07): expanded scope review

### 14.1 Security-definer functions
All RPCs that write money, stock, status or permissions are SECURITY DEFINER with: pinned `search_path = ''` (fully qualified names), placed in a non-exposed schema where possible, `REVOKE EXECUTE FROM PUBLIC` then explicit `GRANT` to the intended role only, first-statement authorization check (capability or org membership), no dynamic SQL built from input, input validated inside. CI lint: list every SECURITY DEFINER function and fail on missing `search_path` or on `PUBLIC` execute grants. Aspen guards that treat `auth.uid() IS NULL` as privileged are **not** to be copied; system jobs use a dedicated role/claim, never an unauthenticated context.

### 14.2 Ledger and inventory protection
- Financial ledger: double-entry (sum to zero per transaction by constraint trigger), append-only (reject UPDATE/DELETE/TRUNCATE, no table privileges for app roles), idempotency key unique, only finance/system RPCs write.
- Inventory movements: append-only, single writer RPC, balances derived or transactionally maintained, nightly reconciliation with alerts.
- Payment events, onboarding events, audit log, order status history, price snapshots: append-only or write-once.
- Compensating entries only; "void" never deletes.

### 14.3 Private document uploads
Private buckets, org-prefixed paths, server-validated size/MIME/magic bytes, random object names, antivirus scan hook for agreements, labels and proofs, signed URLs under 5 minutes, access logged for sensitive buckets (payment proofs, resale certificates), no public listing, deletion only by retention job.

### 14.4 API keys, webhooks, idempotency
As INTEGRATION-ARCHITECTURE.md §3, §4, §6: hashed keys with pepper, scopes, test/live, rate limits; HMAC-signed webhooks with timestamp, SSRF guard and retries; idempotency table with request hash. Secrets never logged; payload logs masked.

### 14.5 Rate limiting
Auth endpoints, password reset, invite acceptance, public form actions, public API (per key and per IP), webhook test sends, export endpoints. Limiter choice made in M1; fail-closed for auth, fail-open with alert for read APIs.

### 14.6 Background-job reliability
Transactional outbox, `FOR UPDATE SKIP LOCKED`, idempotent handlers, attempt counters, exponential backoff with jitter, dead-letter queue visible to staff, heartbeat alert when no worker ran within N minutes, max runtime and concurrency limits, replay tooling, jobs authenticated by secret header or signed token.

### 14.7 Backup, recovery, monitoring
PITR on production; daily logical backup to a separate account/region; quarterly restore drill with measured RPO/RTO; migrations applied through CI with forward-only policy; secrets rotation runbook; monitoring for auth failure spikes, 5xx rate, queue backlog, webhook failure rate, ledger/inventory reconciliation alerts, storage anomalies, unusual staff actions (bulk exports, impersonation, price edits); on-call and incident procedure.

### 14.8 Staff-side controls
MFA mandatory, short session lifetime, re-authentication for sensitive actions (flag changes, refunds, key revocation, role changes), two-person rule thresholds (price changes, adjustments, payment confirmation above limit), read-only audited impersonation, export logging, least-privilege capability model (ADMIN-PORTAL-SPECIFICATION.md §2).

## 15. Compliance gates (business and legal; all must be recorded before any live activation)
These are **not engineering tasks**. The platform enforces them technically (`compliance_gates` table and flags) but cannot satisfy them. Until recorded, only sandbox operation is allowed; wallet remains disabled; live API keys cannot be issued.

| Gate | Subject | Evidence expected | Blocks |
|---|---|---|---|
| G1 | Product classification and regulatory status of every product/class handled (including how products may lawfully be sold, stored and shipped) | Written legal/regulatory opinion, per product class | Live catalog sales to portal customers, go-live |
| G2 | Labeling, claims and marketing wording (consistent with `project-rules.md`: research-use language, banned terms), including customer-supplied label content | Approved wording policy, reviewer sign-off per label | Label approvals, go-live |
| G3 | Payment-provider and legal approval for payment processing and any stored-value (wallet) or deposit handling; banking/processor acceptance of the business | Provider approval letter, counsel opinion, terms | Wallet flag, card/ACH, deposits |
| G4 | Supplier qualification and quality (supplier vetting, COA/testing program, lot traceability) | Supplier files, QA procedure | Certificates issuance, receiving live stock |
| G5 | Shipping eligibility, carrier acceptance, licensing and insurance (carrier terms, restricted-goods rules, business licenses, liability and product insurance) | Carrier written acceptance, licenses, insurance certificates | Live shipments |
| G6 | Go-live authorization: all above recorded and current, operational readiness (SOPs, staffing, monitoring, backups), owner sign-off | Signed go-live checklist | Live keys, live fulfillment flag, step 9 |

Per-org gates: customer eligibility/KYC, executed agreement, resale/business documents, funding requirement met. Records have expiry and re-review dates. Gate status changes are audited and require the **ADMIN** staff role (capability `gates.write`) at aal2 with a recorded MFA step-up within 15 minutes. **There is no `super_admin` role in Milestone 1** (staff roles are ADMIN, FINANCE, OPS, SUPPORT); earlier references are superseded (MILESTONE-1-SCHEMA-AND-RLS.md §3, C-4).

## 16. Additional risks introduced by the larger scope
Stored-value liability and money-transmission exposure if wallet is enabled prematurely (hence flag and G3); PII of end recipients in fulfillment orders (minimise, encrypt, retain-limit); webhook SSRF; label/artwork upload abuse; inventory shrink and fraud via adjustments (two-person rule); privileged staff misuse (audit, MFA, alerts); product-category regulatory risk (G1/G2/G5).

## 17. Revision 3 (2026-11-07): schema review corrections
Recorded owner decisions D-M1-1 to D-M1-10 (see MILESTONE-1-SCHEMA-AND-RLS.md §8). Security-relevant changes:
- **Invite tokens:** hash-as-credential flaw removed; plaintext token to accept RPC, hash secrets in an ungranted `private` table (§5.7 there).
- **Gate/flag separation (G-gates):** high-risk flags cannot be enabled with fewer than two active admins; with two or more, the activator must differ from every gate approver; revocation/expiry disables dependent flags in the same transaction; `assert_flag_enabled` re-checks gates at call time; no service_role path (§5.8).
- **Step-up:** fail closed, session-bound, database-clock freshness; Supabase `amr` persistence across refresh is **unverified** and is validated on the dev project through pre-migration gates V5a, V1, V2 (V2b fallback), V3 before migration 0002, and post-migration acceptance tests V5b (before 0004) and V4 (after 0004); V3 is a hard blocker (see §19).
- **Service key residual risk (high, partially mitigated in rev. 4):** the service key bypasses nothing in our database but can administer Auth users and MFA factors. See §18 for the enrolment window and approved-factor binding, and for what they cannot prevent.
- **Storage:** strict object-name regex, quota trigger, no UPDATE for anyone, ADMIN-only delete, no anon, Realtime lint.
- **Account requests:** PII table has no API grants; Turnstile verified server-side and fail closed; 12-month retention with legal hold; support sees minimal columns only.
- **Testing:** PostgREST-level tests with real JWTs exercising SELECT/INSERT/UPDATE/DELETE independently, cross-org attempts, zero-row-affected assertions with state read-back, matrix-driven coverage.

## 18. Revision 4 (2026-11-07): final design corrections before migration approval
Documentation only; see MILESTONE-1-SCHEMA-AND-RLS.md rev. 3 (§10 history).
- **Owner MFA (C-1):** creating an owner-role invite or promoting a member to owner requires aal2 and a step-up recorded within 15 minutes for the current session, enforced inside the SECURITY DEFINER RPCs before any write; denials are audited; no direct DML path exists. Ordinary member invitations are unaffected. Tests T-OMFA-1..12.
- **Staff MFA enrolment window (C-2):** an ADMIN (aal2, step-up) authorizes a short-lived (default 30, max 60 minutes), single-use window for one specific staff user (never self); authorization, consumption, revocation and expiry are audited; the server checks the caller's own window before application-mediated enrolment; a database backstop treats any verified factor not claimed inside a window as untrusted and suspends that user's staff privileges (fail closed, alerting). **Limitation:** this restricts application-mediated enrolment only; it cannot prevent direct Auth administration API abuse if the service-role key is compromised (that key can still alter users, passwords and factors). Retained controls: server-only key handling, Auth event monitoring and alerts, key rotation, incident-response runbook. Depends on validation V5 (`auth.mfa_factors` readable from a definer function). Tests T-MFAW-1..13.
- **Audit id allocation (C-3):** `write_audit()` takes the transaction advisory lock, then `nextval()`, reads the committed head, builds canonical bytes with that id, hashes, inserts with the explicit id, and commits while holding the lock; the sequence is owned by the migration owner and unusable by any API role; rejects non-READ COMMITTED callers; rollback gaps tolerated by verification.
- **Roles (C-4):** no `super_admin`; ADMIN capabilities (`staff.manage`, `flags.write`, `gates.write`) with aal2 + step-up perform staff, flag and gate duties (platform and per-organization), subject to gate/flag separation.
- **Invite trust boundary (C-5):** inviters cannot choose the token hash. `create_organization_invite` has no hash parameter and only creates a `pending_issue` authorization; only service-role server code can issue the hash (`issue_organization_invite`, once, within 5 minutes), generated from a server-side 32-byte CSPRNG token. Delivery failure or ambiguity burns the token (revoke and delete the secret); retry creates a fresh authorization and token; stale unissued rows are swept; rate limits (org, inviter, email, owner-role, preview/accept) and audit events cover every step. Tests T-INV-17..24.
- **New risks:** R-5 (owner first-factor enrolment is self-service), R-9 (invite issue window with a compromised service key), R-10 (`auth.mfa_factors` is not a public API).

## 19. Revision 5 (2026-11-07): approved validation sequence
Documentation only; procedure in `M1-VALIDATION-PLAN.md`, design in MILESTONE-1-SCHEMA-AND-RLS.md rev. 4 §5.3 and §5.12.
- **Gates versus acceptance tests:** V5a, V1, V2 (V2b if needed) and V3 are pre-migration gates against Supabase Auth and must pass before migration 0002; V5b is a post-0002 acceptance test that must pass before 0004; V4 is a post-0004 acceptance test. V4 and V5b must pass before the remaining M1 implementation is accepted. Migration 0001 has no MFA dependency.
- **V3 hard blocker:** if an ordinary token refresh makes an old TOTP timestamp appear fresh, a stolen aal2 session could pass the 60-second step-up test. Stop and redesign step-up before 0004; no weakening of the freshness rule.
- **V2b fallback:** fresh sign-in must yield a new `session_id`, a step-up recorded for the old session must not authorize the new one, and MFA must be completed before a step-up can be recorded. V2 failure and V2b success are recorded separately.
- **Fail-closed MFA factor check (V5b):** unexpected `auth.mfa_factors` structure or any access error never grants staff privileges; staff access is denied until a recorded validation passes (and re-denied if it goes stale or fails); diagnostics are limited to SQLSTATE, column names, version and timestamp, never data or identifiers.
- **Validation script safety:** no tokens, passwords, TOTP seeds or secrets in output or files; `session_id` redacted; no new dependencies; no application source changes.
