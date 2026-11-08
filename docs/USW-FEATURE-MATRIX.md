# USW Feature Matrix (Milestone 0 audit)

Audit date: 2026-11-07. Documentation only; no application code was changed.

**Legend:** REUSE = suitable as-is · EXTEND = exists, needs changes · BUILD = missing · REPLACE = exists but unsuitable · UNKNOWN = insufficient evidence.
**Evidence tags for USW:** `C` = confirmed in a screenshot, `I` = inferred, `?` = not evidenced.
**Aspen column** describes the AspenWholesale reference repo (Supabase + TanStack). "Source" means the app's TS code; "SQL" means migrations/RPCs. Aspen items marked *(unverified)* were skimmed, not traced.

| # | Feature | 99 Purity (today) | Aspen | USW evidence | Class | Notes |
|---|---|---|---|---|---|---|
| 1 | Customer portal shell (`/client`) | None. Marketing site only | Authenticated customer routes exist | C: flat 12-item sidebar, "Signed in as <tenant>" top bar | BUILD | New layout outside `[locale]`; reproduce USW sidebar order |
| 2 | Admin portal (`/admin`) | None | `admin.*` routes; UI gating cosmetic, real checks in RLS/`assert_admin()` | ? (no admin access) | BUILD | Design from Aspen + own requirements, not USW |
| 3 | Authentication / registration | None | Supabase auth, `app_role` admin/buyer, buyer approval | C: "Signed in as", Sign out | BUILD | Registration likely invite/approval-based (I) |
| 4 | Public marketing site | Works (EN/ES, ISR, SEO) | n/a | n/a | REUSE | Must remain unchanged |
| 5 | Product catalog (browse) | 153 products in `products.json`, static pages, Fuse search | DB products/variants/images/categories | C: Shop table "137 options shown" | REPLACE (for portal) | JSON has no price/SKU/stock. Keep JSON for public site, add DB catalog for portal |
| 6 | Variants (box / strengths) | Spec strings like `5mg×10` parsed by split | `product_variants` table | C: Product/Variant rows, "box = 10" | BUILD | Normalise 99 Purity spec strings into variants |
| 7 | Wholesale pricing tiers | None | `product_price_breaks` (qty breaks), per-account exclusions | C: columns US Direct, FD 1+, FD 10+, FD 50+, FD 100+; "30% off standard" | EXTEND (Aspen logic) | USW has two price families (US Direct vs Fulfillment-Direct tiers). Aspen has one break table; schema must be extended |
| 8 | Price floors | None | `product_price_floors`, trigger-enforced | ? | REUSE (concept) | Only needed if partners/markup exist |
| 9 | Cart | localStorage inquiry cart → WhatsApp/mailto | Wholesale `carts`/`cart_items` with RLS | C: qty (boxes) column + subtotal + "Place order & get invoice" | REPLACE | Existing cart has no prices and no server state |
| 10 | Checkout / place order | None (project rules forbid it) | Wholesale checkout trusts client prices (**vulnerable**); storefront RPC is server-priced | C: "Place order & get invoice" (creates invoice, not card payment) | BUILD | Use Aspen's `storefront_checkout` pattern, not the wholesale path |
| 11 | Orders list | None | Orders, order_items, status history | C: 9 status pills, columns Order ID/Status/Type/Items/Created/Shipped/Tracking; IDs `CW-####` | BUILD | Status model: Pending→Queued→Allocated→Picked→Packed→Ready→Shipped→Delivered/Cancelled |
| 12 | Order detail | None | Exists | ? not shown | UNKNOWN | IDs are links (I) but page never shown |
| 13 | Invoices | None | **No invoice generation** | C: `CPI-CW-####`, Paid / "Waiting for payment", "COA attached" chip | BUILD | |
| 14 | Payments (manual) | None | Manual only: admin RPCs record payment in append-only events; client cannot edit payment fields | C: "Payment details", "I've sent payment"; Wire and Zelle named | EXTEND | Reuse the payment-guard trigger + admin RPC pattern |
| 15 | Payment provider (card/ACH) | None | None | ? Not evidenced | UNKNOWN | Do not assume Stripe. Needs your decision |
| 16 | Wallet / balance | None | **None** | C: balance $0.00, "Pay USW / Add funds", top-ups list, rule "reserve on accept, charge on ship, release on cancel" | BUILD | Needs double-entry ledger; borrow Aspen's append-only ledger discipline |
| 17 | Billing rate card | None | None | C: $5/order, postage cost+10%, $1/unit labeling, $50/box + $350/pallet receiving, $199/mo platform, $75/mo pallet storage, $5,000 setup, $45/hr custom, $20/return | BUILD | Make rates data, not constants |
| 18 | Organizations | None | Flat `organizations`; no members table | C: company + billing-address fields | EXTEND | Add true membership table |
| 19 | Team management | None | `org_role` owner/member on `sales_partners` | C: Owner/Member rules + invite form | EXTEND | Aspen's model is partner-centric; need `organization_members` |
| 20 | Account management | None | Partial | C: read-only "Managed by USW" card (status, balance, "Prepay only", invoicing, resale certificate) | BUILD | |
| 21 | Inventory / stock (customer) | None | `stock_quantity` never decremented | C: `/stock` empty state only | BUILD | Columns/behaviour unknown (`?`) |
| 22 | Inventory (admin, movements) | None | None | ? | BUILD | Requires auditable movements table |
| 23 | Certificates of analysis | Not in portal | `product_documents` (lot, test date, private bucket, signed URLs) | C: per-order card, "Included" + "Company certificate", lot no., "Available 24 hours after your order ships"; shop add-on "+ COA · $100" | EXTEND | Reuse document storage pattern |
| 24 | Commissions | None | Strong: snapshot at checkout, append-only `commission_ledger`, hold days, reversals, payouts | C: 3 KPI cards (Earned & unpaid, Waiting for fulfillment, Potential), Earnings/Payments tabs, "Payout setup", "Create my referral link" | EXTEND | Rates, tiers, payout methods unknown |
| 25 | Referral links | None | Partner catalogs `/c/$slug` | C: "Create my referral link" | EXTEND | |
| 26 | Fulfillment onboarding (9 steps) | None | None | C: all 9 titles, chips "Your step" / "Waiting on USW", step 1 expanded | BUILD | Steps 3–9 internals unknown |
| 27 | Step 1: Add products / SKU mapping | None | None | C: USW catalog or private product, "Quantities are individual units", CSV import | BUILD | |
| 28 | Labels | None | None | C: 3 ml and 10 ml templates, "Create master", "Proof sheet" | BUILD | Label editor never shown |
| 29 | Packaging | None | None | ? Step 3 collapsed | UNKNOWN | |
| 30 | External store integrations | None | None | C: step 4 "Connect your store" text only | UNKNOWN | Which platforms (Shopify/Woo/etc.) not shown |
| 31 | Test order | None | None | C: step 5 title; step 4 mentions sandbox test key | UNKNOWN | |
| 32 | Agreement / setup payment | None | Documents storage exists | C: step 6 "Waiting on USW", "Ask your rep for [the agreement]"; setup $5,000 = $4,000 fee + $1,000 wallet | BUILD | Agreement is rep-driven, not self-serve (C) |
| 33 | Launch review / Go live | None | None | C: step 8 "Your step", step 9 "Waiting on USW" | BUILD | Admin-gated transitions (I) |
| 34 | API keys | None | None | C: nav item "API Keys"; step 4 "Create your test key… sandbox orders only" | BUILD | Page itself not shown |
| 35 | API docs | None | None | C: nav item "API Docs" | UNKNOWN | Page not shown |
| 36 | Webhooks | None | None (SQL outbox for email only) | ? | UNKNOWN | |
| 37 | Shipping / carrier | None | None | C: tracking column, "In transit"/"Preparing shipment" | BUILD | Carrier integration unknown |
| 38 | Tracking | None | Text field only | C: tracking numbers in Orders table | EXTEND | |
| 39 | Audit logs | None | `audit_logs` + diff trigger (mutable by service paths) | ? | EXTEND | Make immutable |
| 40 | Email / notifications | Resend, staff-only, no customer mail | SQL outbox + Resend dispatcher (runs as local script only) | ? | EXTEND | Need deployed dispatcher |
| 41 | Wholesale inquiry form | Works (no spam protection, unescaped HTML in email) | n/a | n/a | EXTEND | Harden; convert into account-request flow |
| 42 | Coupons | None | Partner-profit-funded only | ? | UNKNOWN | Not evidenced in USW |
| 43 | Overview dashboard | None | Partial | C: unpaid-invoice banner ("2 unpaid invoices — $49,503.50 due"), "0 of 9 steps done" setup card | BUILD | |
| 44 | Testing | None (only a JSON-parse script) | 314 passing unit tests; no SQL/RLS tests | n/a | BUILD | |

## Inconsistency worth clarifying
The screenshots show an order "Preparing shipment" with a large unpaid invoice, while the account is flagged "Prepay only". It is unclear whether prepay is enforced for wholesale orders or only for fulfillment orders. Needs your decision.


---

# Revision 2 (2026-11-07): confirmed scope, additional features and changed classifications

Product direction is now confirmed: wholesale purchasing + complete fulfillment services; replicate the observed USW customer experience; build a proposed admin platform. The original table above stands except where overridden below.

**Evidence classes used from here on:** OBS = observed in USW screenshots · DESC = supplied USW workflow description (none supplied to date) · PUB = publicly verified (none gathered to date) · INF = inferred · PROP = proposed for 99 Purity · BIZ = requires business confirmation.

## A. Overrides to Revision 1
| Feature | Was | Now | Reason |
|---|---|---|---|
| Wallet | BUILD | **BUILD, dark (flag off), separate from invoices/payments** | Gate G3 (legal/payment approval) not met |
| Card/ACH provider | UNKNOWN | **BUILD later, blocked by G3** | No evidence; not enabling real payments |
| Fulfillment onboarding / labels / packaging | BUILD / UNKNOWN | **BUILD (M5)**, internals for steps 2–9 are PROP | Confirmed in scope |
| External store integrations | UNKNOWN | **BUILD provider-independent API first; adapters only with evidence** | No platform named in any screenshot |
| API keys / docs / webhooks | BUILD / UNKNOWN | **BUILD (M6)** | Nav items observed; contents PROP |
| Inventory | BUILD | **BUILD with owner model + movement ledger (M7)** | Confirmed; ownership distinction required |
| Admin portal | BUILD | **BUILD, fully PROP (M8, alongside each domain)** | No admin evidence |
| Commissions | EXTEND | EXTEND (M9), rates BIZ | unchanged |

## B. Additional features now in scope
| # | Feature | 99 Purity | Aspen | USW evidence | Class | Milestone |
|---|---|---|---|---|---|---|
| 45 | Customer applications / approvals | wholesale inquiry form (email only) | buyer approval (`is_approved_buyer`) | INF | EXTEND | M1/M2 |
| 46 | Product configuration (private products) | none | none | OBS (step 1: catalog or private product) | BUILD | M5 |
| 47 | Label design + proof + approval workflow | none | none | OBS partial (templates, master, proof sheet) | BUILD | M5 |
| 48 | Packaging selection + approval | none | none | step title only | BUILD | M5 |
| 49 | Agreement signing | none | documents storage | OBS partial (rep provides) | BUILD | M5 |
| 50 | Launch review / go-live gate | none | none | OBS titles and chips | BUILD | M5 |
| 51 | Compliance gates G1–G6 | none | none | n/a | BUILD (PROP) | M1 table, M10 sign-off |
| 52 | Sandbox orders | none | none | OBS ("sandbox orders only") | BUILD | M6 |
| 53 | Integration/webhook logs | none | email log only | PROP | BUILD | M6 |
| 54 | Fulfillment order ingestion + validation | none | none | INF | BUILD | M6/M7 |
| 55 | Warehouse locations, receipts, putaway | none | none | OBS (receiving fees); screens not seen | BUILD | M7 |
| 56 | Reservation and allocation | none | none (stock never decremented) | OBS (wallet rule mentions reserve) | BUILD | M7 |
| 57 | Picking, packing | none | none | INF (status pills) | BUILD | M7 |
| 58 | Shipments + carrier tracking | none | text field | OBS (tracking column, statuses) | BUILD | M7 |
| 59 | Exceptions, cancellations, returns | none | none | OBS (Cancelled; returns fee $20) | BUILD | M7 |
| 60 | Customer notifications for orders | none | outbox pattern (dispatcher not deployed) | INF | EXTEND | M3/M7 |
| 61 | Double-entry financial ledger | none | commission ledger only | INF | BUILD | M4 |
| 62 | Customer-owned vs company-owned stock | none | none | OBS partial ("Available/owned") | BUILD | M7 |
| 63 | Reconciliation (payments, ledger, inventory) | none | none | PROP | BUILD | M4/M7 |
| 64 | Admin KPI dashboard, reports | none | partial | PROP | BUILD | M8/M9 |
| 65 | Rate limiting, background jobs, monitoring, backups | none | scripts only | PROP | BUILD | M1/M10 |
| 66 | Staff roles and capability model | none | admin/buyer only | PROP | BUILD | M1 |
| 67 | Impersonation (read-only, audited) | none | none | PROP | BUILD | M8 |
| 68 | Returns (RMA) workflow | none | none | OBS partial (fee) | BUILD | M7 |

## C. Classification totals (Rev 2 view, approximate)
REUSE: public site, catalog data (as import source), Aspen patterns for server-priced checkout, commission engine, payment guard, document storage, outbox idea. EXTEND: org/team, documents, certificates, commissions, notifications. REPLACE: inquiry cart, client-priced wholesale checkout, JSON-only catalog for portal. BUILD: nearly everything else. UNKNOWN (needs more USW evidence): packaging contents, store connection method, agreement flow, launch review content, API/docs content, commission rates, inventory screens.

## D. Reproduction priority
1. Reproduce exactly (OBS): sidebar IA, Overview banner/cards, Shop table structure, Orders pills/columns, Invoices list pattern, Billing structure, Account structure, Certificates cards, Fulfillment setup structure.
2. Reproduce by pattern (OBS partial): Inventory, Commissions, step 1 form, labels panel.
3. Design from scratch (PROP): steps 2–9 internals, API keys/docs/logs pages, all admin screens.
