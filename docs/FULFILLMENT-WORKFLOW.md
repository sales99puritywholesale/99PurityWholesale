# Fulfillment Workflow

Revision 2, 2026-11-07. Specification only. No live fulfillment or payment processing is activated by anything in this document.

Evidence tags: `[OBS]` seen in USW customer screenshots · `[INF]` inferred · `[PROP]` proposed for 99 Purity · `[BIZ]` needs business confirmation. Only the **step titles, step-1 content, owner chips, setup-fee figures, the wallet rule and order status names** are observed. Everything else is proposed.

## Part A. Nine-step onboarding

### A.1 Engine design (applies to every step) [PROP]
- **Configurable**: steps are rows in `onboarding_templates` → `onboarding_template_steps` (order, key, title, description, owner, required fields schema, required uploads, approval required, dependencies). Templates are assigned per customer type / service / product class. The default template reproduces the observed nine steps.
- **Per-organization instance**: `onboarding_instances` and `onboarding_steps` (status, owner, timestamps) with append-only `onboarding_events` (who/what/when/why).
- **Step states**: `locked` → `todo` → `in_progress` → `submitted` → (`approved` | `rejected` → `in_progress` → `submitted`) ; plus `waiting_staff` display for steps whose owner is staff. `skipped` only if template marks optional, by staff.
- **Dependency validation** is enforced in the database function that transitions state, not in the UI. A step cannot be `submitted` unless its prerequisites are `approved`. Table of default dependencies below.
- **No self-approval**: transition to `approved`/`rejected` requires a staff capability; customers can only reach `submitted`. A trigger rejects any other writer. A staff user cannot approve a submission they authored (staff-on-behalf cases are flagged).
- **Rejection**: reason code + free-text correction instructions are mandatory; customer sees them on the step; re-submission creates a new `submission` version (previous versions preserved).
- **Timestamps and audit**: `submitted_at`, `reviewed_at`, `reviewed_by`, `approved_at`, `version`; every transition writes `onboarding_events` and `audit_log`.
- **Progress**: "N of 9 steps done" counts `approved`; overview widget and "Next: <step>" button [OBS pattern].
- **Re-opening**: staff may reopen an approved step (e.g. label change after approval); downstream approvals are flagged for re-review rather than silently invalidated.

### A.2 Step table
| # | Step | Owner [OBS chip] | Customer screen & instructions | Required fields | Required uploads | Admin approval | Depends on |
|---|---|---|---|---|---|---|---|
| 1 | Add products | Customer [OBS "Your step"] | SKU-mapping form: choose catalog product or define private product; quantities are individual units; CSV import [OBS]. Instructions explain units, barcodes, handling | product/variant ref or private-product definition, external SKU, units per pack, barcode, weight/dimensions, hazard/handling flags | optional: spec sheet, CSV | Yes: product configuration review | Org active, application approved |
| 2 | Design labels | Customer | Template selection (observed 3 ml / 10 ml), "Create master", "Proof sheet" [OBS]; upload artwork; submit proof | template, product(s), label text fields | artwork (PDF/PNG), optional barcode file | Yes: label approval (compliance checklist, gate G2) | Step 1 (≥1 approved product) |
| 3 | Choose packaging | Customer | Choose packaging option per product or order type; shows fees | packaging option(s), insert preferences | optional branded insert art | Yes | Step 1 |
| 4 | Connect your store | Customer | "Create your test key… sandbox orders only" [OBS]; shows API key creation, docs link, SKU mapping to external IDs; connection health | integration method (API / adapter), webhook URL, external SKU map | – | Optional (staff verify connection) | Step 1 |
| 5 | Send sandbox test order | Customer | Send an order through sandbox key; viewer shows validation result | sandbox order reference | – | Auto-pass when system validates; staff may override | Steps 1, 4 |
| 6 | Sign agreement and pay setup | **Staff-gated** [OBS "Waiting on USW", rep provides agreement] | Shows agreement document, e-sign or upload signed copy, setup fee invoice (USW: $5,000 = $4,000 fee + $1,000 wallet credit [OBS]) | signer name/title, acceptance, setup invoice reference | signed agreement if not e-signed | Yes: staff confirm agreement executed and setup invoice paid (via reconciliation, never customer-reported alone) | Steps 1–3 approved (proposed); compliance gates G1/G2 |
| 7 | Fund wallet / meet funding requirement | Customer [OBS "Your step"] | Shows the org's funding requirement: amount, type, status, how to pay (invoice/deposit). Wallet option shown only if flag enabled | acknowledgement of terms | – | Yes: finance marks requirement met | Step 6 |
| 8 | Launch review | Customer [OBS chip] / staff reviews | Checklist summary of everything approved, final confirmations (return address, contact, escalation contacts), request launch | contacts, return address, confirmation checkboxes | – | Yes: fulfillment manager review of all steps + gates | Steps 1–7 |
| 9 | Go live | **Staff-gated** [OBS "Waiting on USW"] | Read-only status "Waiting for <company>"; on approval shows live key issuance instructions | – | – | Staff action: enable live keys / live fulfillment flag for org | Step 8 + all compliance gates recorded |

Observed step ordering and owner chips are reproduced. Observed: steps 1–5, 7, 8 show "Your step"; steps 6 and 9 show "Waiting on USW". Contents of steps 2–9 beyond titles and the fragments above are **not observed**; the table is [PROP].

### A.3 Funding requirement abstraction (step 7) [PROP]
`funding_requirements(organization_id, type, amount_cents, status)`; types: `prepay_invoice`, `deposit_invoice`, `credit_terms` (with limit), `waived` (staff, reason), `wallet` (**disabled behind Gate G3**). "Met" is determined by confirmed payments (not customer claims). This lets 99 Purity satisfy step 7 without stored-value deposits.

## Part B. Fulfillment lifecycle (post go-live)

### B.1 Entities
Customer product → SKU mapping → fulfillment SKU (internal) → stock (owner, lot, location) → order → allocation → pick → pack → shipment → tracking → delivery → (exception | return).

### B.2 Ownership of stock [PROP, required]
Every stock row and movement has `owner_type` (`customer` | `company`) and `owner_org_id` (null for company stock). Customer-owned stock is never allocated to another org's orders. Company-owned stock sold via the wholesale shop converts ownership to the buyer at **an explicit event** (`ownership_transfer` movements pair) rather than silently [BIZ: when ownership transfers: on invoice, on payment, on ship]. Shop column "Available/owned" [OBS] reflects this distinction.

### B.3 Order state machine
Customer-visible labels in brackets. Internal states follow the observed pill list [OBS: Pending, Queued, Allocated, Picked, Packed, Ready, Shipped, Delivered, Cancelled].

```
received ─► validating ─► pending ─► queued ─► allocated ─► picked ─► packed ─► ready ─► shipped ─► delivered
   │            │            │         │          │            │        │       │         │
   │            └─► exception (resolve → back to the state it left)                      └─► delivery_exception
   └─► rejected (validation failed, returned to the API caller)
cancellation: allowed from pending/queued/allocated (releases reservation), restricted after picked [BIZ]; never after shipped.
return: separate return_order linked to the original.
```
Mapping to customer labels: pending/queued/allocated/picked/packed → "Preparing shipment" ; ready → "Ready" ; shipped → "In transit" ; delivered → "Delivered · date" [OBS labels].

### B.4 Steps in detail
1. **External order ingestion**: API/webhook/adapter creates `fulfillment_orders` via idempotent endpoint (`Idempotency-Key`); stores raw payload; sandbox keys create sandbox-flag orders that never reserve stock.
2. **Validation**: org live? funding requirement met? SKUs mapped and approved? labels approved? address valid? stock sufficient? fees computable? failures create exceptions (typed), return structured error to API caller, notify customer per settings.
3. **Fulfillment queue**: ordered by SLA/priority; staff or auto-wave.
4. **Reservation and allocation**: `reserve` movement at acceptance (matches observed wallet rule "reserve on accept") then `allocate` to specific lot/location with `FOR UPDATE` locking; FEFO by expiry unless customer rule; customer-owned stock only from that customer's stock.
5. **Picking**: pick tasks per location; scan-confirm; short-pick → re-allocate or exception.
6. **Packing**: scan-verify items vs order, select packaging (approved config), weigh, print label (carrier + product label from approved artwork version).
7. **Shipment creation**: carrier/service/tracking/postage cost recorded; fee lines created (per-order fee, postage cost + markup %, packaging, label application, as per effective fee schedule [OBS rate-card pattern]); `consume` movement on ship ("charge on ship").
8. **Tracking updates**: carrier polling/webhooks update `shipment_events`; customer sees status; outbound webhook `shipment.updated`.
9. **Delivery status**: `delivered` with timestamp; certificates become available per rule ("24 hours after ship" [OBS] for USW; ours [BIZ]).
10. **Exceptions**: typed, assigned, SLA-timed, resolution recorded; customer notified when action needed.
11. **Cancellations**: customer request or staff; releases reservations via `release` movement; fee reversal rules [BIZ]; outbound `order.cancelled`.
12. **Returns**: RMA created by staff or customer request; receipt, inspection, disposition (restock/quarantine/destroy), credit/charge per fee schedule (USW lists "returns $20 each" [OBS]); inventory via `return_receipt`, `restock` or `destroy` movements.
13. **Customer notifications**: email + webhook per event: accepted, exception, shipped, delivered, cancelled, return received; templates in settings; outbox with retry.
14. **Status synchronization**: our status is source of truth; outbound webhooks and polling endpoint `GET /orders/{id}`; for adapters, push status back to the store on each transition; reconciliation job re-sends missed updates.

### B.5 Inventory ledger rules
- **Movement types**: `receive`, `putaway`, `transfer`, `reserve`, `release`, `allocate`, `pick`, `pack`, `consume` (ship), `return_receipt`, `restock`, `adjust_plus`, `adjust_minus`, `quarantine`, `destroy`, `ownership_transfer_out/in`.
- `inventory_movements` is **append-only** with reject triggers. Balances (`on_hand`, `reserved`, `available`) are maintained inside the same transaction or derived by view; nightly reconciliation compares both and alerts on drift.
- No UPDATE of a balance without a movement. Adjustments need reason, actor and (above threshold) a second approver.
- Negative stock prohibited by CHECK; allocation under row locks.
- Each movement carries `ref_type/ref_id` (order, receipt, count, return), actor, idempotency key.

### B.6 Receiving [PROP]
Customer creates inbound notice (ASN) → warehouse receives against it → discrepancies recorded → lots created (lot, expiry, test status) → putaway to locations → movements `receive`, `putaway`. Receiving fees ($/box, $/pallet [OBS pattern]) billed via invoice lines.

### B.7 Fees [OBS pattern, values BIZ]
Fee schedule is effective-dated data: per-order fee, postage (cost + %), label application per unit, receiving per box/pallet, platform monthly, pallet storage monthly, setup, hourly custom work, returns. Applied automatically at the lifecycle event that earns them and invoiced; never from client input.

### B.8 Operational readiness gates
Live fulfillment for an org requires: onboarding step 9 approved **and** compliance gates G1–G6 (SECURITY-ASSESSMENT.md §Compliance gates) recorded for the platform and the org. Until then only sandbox orders are accepted.

## Part C. Evidence status
Observed: step titles/owners, step-1 form, label template sizes, rate-card items and amounts, wallet rule, order status names and labels. Not observed: steps 2–9 internals, packaging options, store connection methods, test-order mechanics, agreement process, launch review content, returns/exception workflows, any admin behaviour.
