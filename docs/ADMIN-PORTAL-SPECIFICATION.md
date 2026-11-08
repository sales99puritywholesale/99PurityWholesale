# Admin Portal Specification (`/admin`)

Revision 2, 2026-11-07. Specification only.

**Evidence statement:** we have **no** access to USW's admin portal and no admin screenshots. Everything here is **[PROP] proposed for 99 Purity**, designed to support the customer workflows observed in USW's customer portal. Where a customer screen implies an admin action (e.g. "Waiting on USW" chips, "Managed by USW" card, a rep-provided agreement), that implication is tagged **[INF]**. This is not a copy of any unseen USW interface and must not be described as one.

## 1. Principles
1. Customers never approve their own submissions; every approval is a staff action recorded with actor, time, reason.
2. Every mutation of money, stock, status or permissions goes through a server-side RPC and writes the audit log.
3. Separation of duties via staff roles (below). Admin UI hiding is cosmetic; RPCs re-authorize.
4. Impersonation ("view as customer") is read-only, time-boxed, and audited [PROP].
5. Queue-centric UX: staff work from queues with filters, SLAs and assignment, not from raw tables.

## 2. Staff roles [PROP]
| Role | Scope |
|---|---|
| `super_admin` | **Superseded for Milestone 1:** no such role exists; M1 staff roles are `admin`, `finance`, `operations`, `support` (see MILESTONE-1-SCHEMA-AND-RLS.md §3). Platform settings, staff management and feature flags are ADMIN capabilities at aal2 with step-up. Roles below are later-milestone proposals and must be approved into the capability catalog before they exist. |
| `account_manager` | Applications, organizations, pricing assignment, onboarding review |
| `finance` | Invoices, payment reconciliation, adjustments, refunds, funding requirements |
| `fulfillment_manager` | Fulfillment onboarding approvals (labels, packaging), inventory policy, exceptions |
| `warehouse` | Receiving, putaway, pick/pack/ship, cycle counts, returns |
| `support` | Read-mostly, notes, resend notifications, impersonate (read-only) |
| `integration_admin` | API keys/webhooks oversight, delivery retries, sandbox |
| `auditor` | Read-only on audit/ledgers/reports |
Permissions are capability-based (`orders.confirm_payment`, `inventory.adjust`, …) assigned to roles, so roles can be tuned without code changes.

## 3. Modules (all in `/admin`)

### 3.1 Dashboard `/admin` (M8)
KPIs: orders today/week, revenue invoiced vs collected, unpaid invoices aging, orders by fulfillment state, SLA breaches, exceptions open, onboarding queue depth, low stock, webhook failure rate, certificates pending. Links into queues. Data from SQL views/materialized views, refreshed on schedule [PROP].

### 3.2 Customer applications `/admin/applications` (M1/M8)
Queue of `account_requests` (replaces the wholesale inquiry form's dead-end). Review: company details, documents (resale cert, business license), compliance checklist (gate G2), approve → creates organization + owner invite; reject with reason; request more info. SLA timers [PROP].

### 3.3 Organizations & customers `/admin/organizations`, `/admin/customers` (M1/M8)
Org list/detail: status (pending, active, suspended, closed), payment terms (prepay/net), funding requirement, assigned price lists, feature flags (fulfillment, wallet, commissions, API), credit limit, resale certificate status, notes, linked users, activity, ledgers. Suspend/reactivate with reason. [INF from "Managed by USW" card: staff-controlled fields.]

### 3.4 Customer users & permissions `/admin/users` (M1)
Users by org, roles, MFA status, last login, force logout, resend invite, lock. Cannot demote the last owner.

### 3.5 Products & wholesale catalog `/admin/products` (M3)
Products, variants/SKUs, categories, images, documents, status (draft/active/discontinued), unit/box definitions, origin, availability rules, import from existing `products.json`, CSV import/export. Customer-specific availability (allow/deny lists).

### 3.6 Pricing `/admin/pricing` (M3)
Price lists, quantity breaks, floors, per-org assignment, effective dating, bulk edit with preview and diff, approval for changes above a threshold (two-person rule), history. Floors enforced in DB for every actor.

### 3.7 Orders `/admin/orders` (M3, M7)
Queue by status; detail: items with price snapshot, payment/funding state, allocation status, shipments, notes, audit trail. Actions (RPC-gated): hold, release, cancel (with reason, releases reservations), split, edit address before pick, add charge, re-open. Wholesale purchase vs fulfillment order views.

### 3.8 Invoices & billing `/admin/invoices` (M4)
Generate/void/reissue invoices, line items (wholesale, fulfillment fee, packaging, shipping, setup, adjustment), numbering, due dates, terms, PDF, send by email, aging report. Voiding writes a compensating record; numbers never reused.

### 3.9 Payment reconciliation `/admin/payments` (M4)
Queue of customer-reported payments ("I've sent payment") with proof; reconcile against bank/Zelle statements: confirm (full/partial, amount, bank reference, date received), reject with reason, mark duplicate; unmatched-receipts list for payments that arrive without a customer report; two-person rule above a limit; confirm creates immutable payment event and applies to invoices. Refunds and adjustments here, finance role only.

### 3.10 Funding requirements `/admin/funding` (M4/M5)
Per-org funding requirement for onboarding step 7 and ongoing orders: type (`prepay_invoice`, `deposit`, `credit_terms`, `waived`, `wallet` (flag-gated)), amount, status met/unmet, evidence link. Marking "met" is staff-only and audited. **`wallet` type is unavailable while Gate G3 is closed.**

### 3.11 Fulfillment onboarding review `/admin/fulfillment/onboarding` (M5)
Queue of submissions across all nine steps with step, org, age, assignee; review screen shows submission data, uploaded files, checklist, history; actions: approve, reject (reason + correction instructions required), request clarification, assign, escalate. Step 9 "Go live" is a staff action requiring all prerequisites and all compliance gates (G1–G6) recorded for that org.

### 3.12 Product configuration review `/admin/fulfillment/products` (M5)
Review private products and SKU mappings: validate units, handling flags, barcodes; approve/reject; map to internal fulfillment SKU.

### 3.13 Label approval `/admin/fulfillment/labels` (M5)
Proof viewer (PDF/image, dimensions, bleed checks), version compare, compliance checklist (claims/wording per `project-rules.md` and gate G2), approve/reject with annotated reason; approval locks the version used for production.

### 3.14 Packaging approval `/admin/fulfillment/packaging` (M5)
Packaging catalog management (items, cost, stock), approve customer selections, set packaging fees.

### 3.15 Store integrations `/admin/integrations` (M6)
All org connections, health, last success, error rates, pause/resume, adapter registry (which providers are enabled), per-org rate limits.

### 3.16 API keys & webhooks `/admin/api` (M6)
Search keys by prefix/org, scopes, last used, revoke/suspend; webhook endpoints, delivery log, replay/redeliver, dead-letter queue; **never displays secrets or full keys**.

### 3.17 Sandbox testing `/admin/sandbox` (M6)
Inspect sandbox orders, simulate carrier/status events, run integration conformance checks, reset an org's sandbox.

### 3.18 Inventory & warehouse `/admin/inventory` (M7)
Warehouses, zones/locations/bins, lots, owner (customer-owned vs company-owned), receipts (ASN, receiving with discrepancies), putaway, cycle counts, adjustments (reason, two-person above threshold), movement ledger explorer, reservations, low stock, expiry. All via `inventory_movements`; no direct balance edits.

### 3.19 Fulfillment processing `/admin/fulfillment/queue` (M7)
Validation exceptions, allocation, wave/batch creation, pick lists, pack stations (scan verification), label printing, shipment creation (carrier, service, weight, postage cost), tracking updates, delivery confirmation, exceptions and cancellations.

### 3.20 Picking & packing `/admin/warehouse` (M7)
Mobile/scanner-friendly screens: pick tasks by location, short-pick handling, pack verification, weigh, ship; per-operator audit.

### 3.21 Shipping & tracking `/admin/shipping` (M7)
Carrier accounts (credentials in vault), rate rules, postage markup (cost + % per fee schedule), tracking sync job status, delivery exceptions.

### 3.22 Returns & exceptions `/admin/returns`, `/admin/exceptions` (M7)
Return authorization, receipt, inspection, restock/quarantine/destroy, credit/charge; exception types: address invalid, SKU unmapped, insufficient stock, label mismatch, carrier failure, payment hold; owner, SLA, resolution notes, customer notification.

### 3.23 Certificates & documents `/admin/certificates` (M9)
Lots ↔ COA upload, test dates, validity, attach to orders (24 h post-ship rule is [OBS] for USW; our SLA [BIZ]), company-certificate requests, document library with visibility rules.

### 3.24 Commissions & payouts `/admin/commissions` (M9)
Plans, rules, referral links, accrual ledger, holds, reversals, payout batches with approval, payout records. Adapted from Aspen's engine (see REUSE-MAP.md). Rates [BIZ].

### 3.25 Reports & analytics `/admin/reports` (M9)
Sales, margin, AR aging, fee revenue, fulfillment throughput/SLA, inventory valuation and turns, exception rates, onboarding funnel, integration health. CSV export (audited, permission-gated).

### 3.26 Audit logs `/admin/audit` (M1 base, M8 UI)
Immutable log viewer with filters (actor, org, entity, action, date), diff view with redaction, export (audited). Auditor role.

### 3.27 Platform settings `/admin/settings` (M2/M8)
Fee schedules (effective-dated), numbering formats, payment instructions text, email templates, feature flags (wallet, live fulfillment, commissions, API live keys), compliance gate records, carrier/provider config, notification rules, retention. Changes audited; sensitive flags require the ADMIN role and a recorded MFA step-up (no `super_admin` role in M1).

## 4. Cross-cutting
Assignment and notes on every queue item; bulk actions with confirmation; CSV import with dry-run; saved filters; keyboard-friendly tables; every action surfaces its audit entry.

## 5. Evidence and caveats
- Admin screens are inferred from customer-visible statuses ("Waiting on …", "Managed by …", rep-provided agreement).
- No assertion is made about USW's admin navigation, role names or reports.
- Requests for USW admin access are not planned; customer evidence suffices unless a decision below cannot be made.
