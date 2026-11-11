# P10 backlog: comprehensive security review and production readiness

Created 2026-11-10 by decision of the project owner. **These items are FROZEN until P10.** No work on them is done during P3 to P9 unless a concrete blocker is raised.

## Frozen P2 items (state as of the freeze)
| # | Item | State at freeze |
|---|---|---|
| 1 | Independent review of rev7 and any resulting rev8 | rev7 drafted offline (`supabase/review/0005_rate_limits_and_owner_mfa.rev7.sql`, sha256 `7d5db7c0b61e51ba6fcfcf01c9e3e6281fbe6ca339969e23cfd8d6a19918eb90`); it corrects findings F1 to F13 of the independent rev6 review (see `docs/P2-4-0005-REV7-SECURITY-REVIEW.md`). Independent review of rev7 not started. |
| 2 | PostgreSQL parsing and migration execution validation | No revision of 0005 has ever been parsed or run. Plan: `docs/P2-REV7-VERIFICATION-PLAN.md` (R7-01 first). |
| 3 | Disposable Supabase project validation | not created |
| 4 | Owner MFA and recovery workflow verification | not started |
| 5 | Factor-removal and stranded-owner recovery edge cases | designed in rev7 (F3, F4, F5); unverified |
| 6 | PostgREST transaction-end (P1 invariant) and quota verification | unverified; no claim that any throttle or quota is effective |
| 7 | Recovery throttling and audit verification | unverified |
| 8 | Comprehensive security testing and production hardening | not started |

## Integration notes P10 must handle
- **0005 rev7 versus later migrations.** rev7's self-check asserts exact counts of capabilities (28), role capabilities and policies. Any later migration that changes those (P3 deliberately reuses the existing capabilities `org.read`, `org.manage` and `fulfillment.process` to avoid this) requires the rev7 expectations to be updated in a new revision (rev8). Re-check at P10 against the final migration set.
- **Rate-limit tables and RPCs of 0005** are not applied; P3 to P9 features must not depend on them. Rate limiting for P3 endpoints is therefore not in place (a P10 item for checkout and cart endpoints).
- **P3 to P9 migrations** are drafts under `supabase/review/p3/` and later folders until separately approved; P10 re-reviews all of them (RLS, grants, definers, search_path, tenant isolation tests against a real database).
- Preserved artifacts that must stay byte-identical: rev3, rev3.1, rev4, rev5, rev6, rev7 and migrations 0001 to 0004 (hash ledgers in `supabase/review/history/`).

## P10 additions requested for the other phases
Penetration test of the portal and RPC surface, tenant-isolation test suite on a real database for every tenant-owned table, load/abuse testing of cart and checkout, dependency audit, secrets and logging review, backup and recovery drill, production configuration review.

## Product-first demo: release checks (added with demo mode; the demo is localhost-only and NOT a launch candidate)
1. **Demo mode must be impossible in production.** Before any deployment: confirm `PORTAL_DEMO_MODE` is unset in every deployed environment, a production build ignores it (tested in `tests/portal/demo-engine.test.ts`), and `.demo-data/` is not deployed. Consider removing `src/lib/portal/demo/` from the production bundle.
2. **Replace the demo adapter with Supabase.** Requires the P3 migration to be applied (separate approval), then run the real workflow tests (customer order, admin processing, pricing) against the database with demo mode off. Re-run the Tier R validation if the migration or RPC contract changed.
3. **Real authentication for staff.** Demo sign-in has no password or MFA. Production needs the MFA challenge/enrolment UI, first-administrator bootstrap and the P2 recovery work (items 1-8 above).
4. **Payments, invoices, commissions, wallet, reconciliation, fulfillment and API/webhook modules** are demo-only or placeholders until their database design is approved; no demo screen may be presented as a real transaction.
5. **Re-validate** concurrency (checkout, price changes), tenant isolation on a real database, PostgREST behaviour after the P3 DDL, rate limiting, audit, and a security review of every demo-era code path before go-live.

## MFA, bootstrap and provisioning: items deferred to P10 (added with the MFA UI and the first-admin tools)
1. **Enrolment window id discovery.** `rpc_staff_claim_factor` needs the window id and no API function returns a staff member's own open window; the bootstrap prints a sign-in path carrying it (`/login/mfa/setup?window=...`). A migration adding a read RPC (own open window) would remove the manual hand-over.
2. **Recovery and factor removal:** lost authenticator, break-glass, stranded owner (frozen P2 items 4-5). The MFA UI offers no recovery path; the only administrator losing the authenticator needs the owner-run window script and a decision on D-P24-2.
3. **Rate limiting of code attempts** (beyond Supabase Auth's own limits), audit of MFA challenge outcomes, and session-assurance policy review (aal2 lifetime, step-up window) are not implemented.
4. **Real browser verification of the MFA pages** against a real Supabase project with real factors (the logic is unit-tested with fakes; the pages were not rendered with a live session).
5. **Provisioning and bootstrap tools were validated only against a fake database.** Their first real runs (dry runs first) may expose defects; each is hash-pinned and refuses on any difference. The development fixtures are not a model for production onboarding, which must use the audited admin workflows.

## Notes added by P5 and P6 (found while building, not yet addressed)
- **No API rate limiting.** `/api/v1/*` and the anon-callable RPCs have no throttle (the rate-limit tables of 0005 are not applied). Abuse tests and a limiter are P10.
- **Webhook sender DNS rebinding.** The worker resolves the host and then calls `fetch`, which resolves again; a hostile DNS answer between the two could reach a private address. Fix: connect to the validated IP (custom agent) or an egress proxy.
- **Webhook signing keys are stored in the database** (the sender must read them); consider a vault reference (DATABASE-DESIGN 7.8).
- **Uploads:** content is sniffed (PDF, PNG, JPEG) but not virus-scanned; storage policies and signed URL lifetime (5 minutes) need a real review.
- **API key last_used_at** is updated from an anon-callable function; review write amplification and the `idempotency_records` clean-up (expired rows are only replaced on reuse).
- **Anon grants:** exactly five functions are executable by anon (pinned in `static-check.mjs` `ANON_RPC_ALLOW` and in a self-check); re-verify at P10 on a real database.

## Notes added by P7 (found while building, not yet addressed)
- **Two-person rule for stock adjustments and large receipts** is not implemented (adjustments need a reason and a fresh step-up only). Shrink and fraud controls are a P10 item.
- **Concurrency:** allocation locks balance rows in a fixed order and the ledger has an idempotency key, but no concurrent allocation or receiving test has run on a real database. Run oversell and double-receive tests at P10.
- **Open decisions (not built):** company-owned wholesale stock and ownership transfer; fee generation and invoicing for fulfillment events (needs the fee schedule from P8 and the rate card); returns; multi-warehouse allocation rules; carrier integrations (tracking is typed by staff).
- **Expiry rule:** a lot expiring today is still allocatable; confirm the intended policy (for example a minimum days-to-expiry for shipping).

## Notes added by P8 (found while building, not yet addressed)
- **Not built, needs a decision:** a public application form (applications are entered by staff today; an anon-callable intake needs abuse controls and would be a sixth anon function), and owner invitations by e-mail (members are added by staff for existing confirmed accounts; the P1 invitation library exists but the invite RPCs are not part of the applied migrations).
- **Staff creation** needs an existing confirmed account that is not an organization member; there is no staff invitation e-mail. New staff must enrol an authenticator on first sign-in (the owner MFA and recovery work is frozen here).
- **Personal data:** the customer directory, organization detail and application contacts are capability-gated and audited ("staff.profiles.read"); review whether read audits should be rate limited and whether e-mail masking is needed for support.
- **Dashboard queries** scan invoices, payments, orders and fulfillment tables without caching; fine at current volume, review with load tests (materialized views if needed).
- **Fee schedule is data only:** no fee is generated or invoiced from it yet (the rate card is not decided in code); fee invoicing remains a post-P9 item.
- **Closing an organization** is refused while invoices or fulfillment orders are open, but does not yet revoke API keys explicitly (a closed organization is not "active", so the key check already refuses it).

## Notes added by P9 (found while building, not yet addressed)
- **No scheduler:** commission accrual, the notification scan and e-mail dispatch run when staff press a button. Automating them needs a cron route that can reach the database; the only way without a service-role key is another key-authenticated anon-callable function (a sixth one), which is an owner decision. Until then a quiet week means late notifications and late accruals.
- **No e-mail provider is wired:** `getEmailAdapter()` returns null, so queued messages never leave. Choosing a provider, SPF/DKIM/DMARC, bounce and complaint handling, unsubscribe headers and a send rate limit are open items. Plain text only by design.
- **Notification scan window is 14 days:** events older than that are never announced if the scan was not run in time. Invoice-overdue reminders and shipped-order e-mails for API orders are not separate templates.
- **Commissions:** no clawback is generated automatically (a refund path does not exist yet; staff use adjustments with a reason). Referral links are entered by staff (there is no public application form or code field). Commission is on wholesale invoice lines only; whether setup, fulfillment or shipping fees should earn commission is an open business decision. Two staff members can press payout at the same moment, which is safe (the referrer row is locked) but untested on a real database; add a concurrency test at the deep dive.
- **Certificates:** a certificate is attached to a lot or an order by staff; there is no lab-data validation (the PDF is not parsed or checked against the lot), no virus scan (same as every upload), and withdrawing does not notify the customer.
- **Reports:** at most 2000 rows and 366 days per run, computed live (no snapshots); every run is audited. Large tenants will need pagination or materialized views. CSV is generated in the page and saved in the browser; it is not signed or watermarked.
- **Storage policy:** staff with inventory.adjust may upload any strictly named file into the private bucket; unregistered files are inert but are not garbage-collected. Add an orphan cleanup job.
- **The anon-callable set** is still exactly the five key-authenticated functions (asserted in every migration self-check and in the static checker).

## Notes added by the deep dive (chain rehearsal and scenario test, 2026-11-11)
- **What was proven on PostgreSQL (hosted dev, one rolled-back transaction):** all five migrations execute in order and pass their self-checks; then `supabase/review/tests/scenario-p5-p9.mjs` drove the real RPCs as fake users and staff (386 checks, 0 failures): tenant isolation on 12 customer RPCs, role and step-up gates, the whole P5 onboarding to go-live, API keys and idempotency, webhooks and the worker, stock receiving, FEFO allocation, shipping, adjustments, the append-only ledgers, checkout and payment confirmation, commission accrual, hold and payout caps, notifications and the outbox, certificates, reports, organization and application management, fees and settings. A negative control (payout cap disabled) was caught by 8 checks.
- **Not covered, still open for P10:** real concurrency (two payouts, two allocations or two receipts at the same moment); the webhook retry and back-off schedule and the SSRF DNS-rebinding window; storage policies with the real Supabase storage API (the scenario inserted storage rows as the owner); the real MFA/step-up plumbing (only `private.staff_session_ok()` was replaced inside the transaction; step-up freshness and all capability checks were real); browser behaviour; load and performance.
- **Harness:** `supabase/review/tests/apply-chain.mjs` (rehearsal reads the drafts; commit mode reads promoted files and needs an exact confirm string) is hash-pinned by the confirmation and never commits in scenario mode.
