# Customer Portal Specification (`/client`)

Revision 2, 2026-11-07. Specification only; nothing is implemented.

**Evidence tags** (used throughout, defined in REFERENCE-ANALYSIS.md §Evidence classification):
`[OBS]` observed in USW screenshots · `[DESC]` supplied USW workflow description (none supplied to date) · `[PUB]` publicly verified (none gathered to date) · `[INF]` inferred · `[PROP]` proposed for 99 Purity · `[BIZ]` requires business confirmation.

**Design rules:** reproduce USW's information architecture and interaction patterns with 99 Purity branding. No USW logo, code or assets are used. The portal is a separate visual surface from the marketing site (own tokens, own layout); see ARCHITECTURE.md. Every screen below is backed by a real workflow in the stated milestone. No mockup-only pages.

## 1. Shell and navigation
| Element | Spec | Evidence |
|---|---|---|
| Sidebar | Flat text list, no icons/groups/badges; active item = lighter pill with accent bar; footer text "Questions? Contact your account manager." and Sign out | [OBS] |
| Order | Overview, Shop, Orders, Invoices & payments, Billing, Account, Certificates, Inventory, Commissions, Fulfillment setup, API Keys, API Docs | [OBS] |
| Top bar | "Signed in as <organization>" + Sign out | [OBS] |
| Extensions | Notification bell, integration-log link (`/client/integrations`), org switcher when a user belongs to >1 org | [PROP] |
| Permissions-aware nav | Items hidden or disabled by role/capability (e.g. Commissions only if enabled for org; API Keys only for owner/developer). Hiding is cosmetic; server enforces | [PROP] |
| Visual system | Light canvas, dark sidebar, rounded white cards, pill buttons, small-caps eyebrow labels, monospace underlined IDs, mint/amber/lavender status pills, **recoloured to 99 Purity brand tokens** | [OBS] pattern / [PROP] colours |

## 2. Modules
Milestones refer to IMPLEMENTATION-ROADMAP.md (Revision 2 numbering).

### 2.1 Overview `/client` (M2 shell, M4 financial widgets, M5 onboarding widget)
- Unpaid-invoices banner with count and total due, linking to Invoices [OBS: "2 unpaid invoices — $49,503.50 due"].
- "Set up fulfillment" card: "N of 9 steps done" and "Next: <step>" button [OBS].
- Recent orders, stock summary, open exceptions, certificate availability [INF/PROP].
- Data: aggregate queries scoped to organization. No client-side math on money.

### 2.2 Wholesale shop `/client/shop` (M3)
- Table columns [OBS]: Product/Variant, Available/owned, US Direct, FD 1+, FD 10+, FD 50+, FD 100+, Origin, Qty (boxes), Certificate, Subtotal; per-line "+ COA · $X" add-on; "N options shown"; footer "Place order & get invoice".
- Price headline "per box (box = 10), N% off standard" [OBS]. In 99 Purity the percent and box size are data, not constants [PROP].
- 99 Purity proposal: price list columns are driven by assigned `price_lists` (see DATABASE-DESIGN.md); two column families (direct and fulfillment-tier) are kept if the business model needs them [BIZ].
- Search, category filter, "owned stock only" toggle [PROP; filters not clearly visible in USW screenshot].
- Cart is server-side (`carts`/`cart_items`); a quote RPC returns authoritative prices and totals on every change; the browser displays, never calculates. Place order = `place_order` RPC creating order + invoice in one transaction [PROP; "get invoice" semantics OBS].
- Customer-specific availability (excluded products, restricted to approved customers) enforced by RLS/RPC [PROP].
- Unknown: tier aggregation rule, minimums, stock reservation timing [BIZ].

### 2.3 Product catalog and detail `/client/shop/[sku]` (M3)
Variant list, specs, documents (COA samples, SDS if applicable), price table for the org, availability, add to cart. Content is imported from existing `products.json`, with copy compliant with `project-rules.md` [PROP]. USW detail page not observed [INF].

### 2.4 Orders `/client/orders` (M3; fulfillment statuses M7)
- Filter pills: All, Pending, Queued, Allocated, Picked, Packed, Ready, Shipped, Delivered, Cancelled [OBS].
- Columns: Order ID, Status, Type, Items, Created, Shipped, Tracking; IDs are links; customer-friendly labels ("Preparing shipment", "In transit", "Delivered · date") mapped from internal states [OBS].
- Order detail `/client/orders/[id]`: items with historical prices, status timeline, shipment/tracking, invoice link, certificates, documents, cancel request (allowed only before allocation/pick, rule is [BIZ]) [PROP; detail page not observed].
- Types: wholesale purchase, fulfillment order (API/store), sandbox order, return [INF/PROP].

### 2.5 Invoices & purchases `/client/purchases` (M4)
- List: invoice number (`CPI-…` style, our prefix [PROP]), status Paid / Waiting for payment, "COA attached" chip, "Payment details", "I've sent payment" [OBS].
- Payment details panel: bank/Zelle instructions from platform settings, invoice reference to quote [PROP; content not observed].
- "I've sent payment": creates a `payments` row in status `reported` with optional proof upload. It never marks the invoice paid [PROP, security-critical].
- Invoice detail with line items, PDF download, payment history [PROP].
- Purchases tab: wholesale purchases vs fulfillment charges [INF].

### 2.6 Billing & payment history `/client/billing` (M4; wallet gated)
- Account balance, "Pay / Add funds" collapsed panel, top-up list, statement table pairing credits and debits [OBS].
- Rate card with effective date: per-order fee, postage cost + markup %, label application, receiving per box/pallet, platform fee, storage, setup, custom work, returns [OBS values; ours are [PROP]/[BIZ]].
- **Wallet is feature-flagged off until legal/payment approval (Gate G3).** While off, the page shows invoice-based billing, payment history, fee statement and funding requirements only; "Add funds" is hidden. Fees are billed by invoice [PROP].
- Funding requirement display (see FULFILLMENT-WORKFLOW.md step 7) [PROP].

### 2.7 Account & organization `/client/account` (M1/M2)
- Team: Owner/Member rules, invite form, role changes, remove, resend invite [OBS rules; operations PROP].
- Company profile and billing address forms [OBS].
- Read-only "Managed by 99 Purity" card: status, balance, payment terms ("Prepay only"/net), invoicing enabled, resale certificate on file [OBS pattern]. Fields changeable only by staff.
- Resale certificate upload (private storage, staff review) [INF/BIZ].
- Security: MFA enrolment, active sessions [PROP].

### 2.8 Certificates `/client/certificates` (M9)
One card per order: "Included" certificate (available N hours after ship, USW = 24 h) and "Company certificate" with lot number [OBS]. Download via short-lived signed URL; "In progress" state unknown [BIZ]. Company-certificate request/issue flow [BIZ].

### 2.9 Inventory & owned stock `/client/stock` (M7)
USW shows only an empty state [OBS]. Proposal: table by product/variant/lot/location with on-hand, reserved, available, in-transit; receipt history; adjustment history (read-only); low-stock thresholds; "Send inventory" receiving notice (ASN) creating an inbound shipment record [PROP]. Distinguishes **customer-owned** from **company-owned** stock [PROP, required].

### 2.10 Commissions `/client/commissions` (M9)
KPIs: Earned and unpaid, Waiting for fulfillment, Potential; tabs Earnings / Payments; "Payout setup"; "Create my referral link" [OBS]. Rates, tiers, payout methods [BIZ]. Visible only when the org has a commission plan.

### 2.11 Fulfillment onboarding `/client/fulfillment/setup` (M5)
Nine steps with owner chips ("Your step" / "Waiting on <company>") [OBS]. Full specification in FULFILLMENT-WORKFLOW.md. Routes: `/client/fulfillment/setup/[step]`.

### 2.12 Product configuration `/client/fulfillment/products` (M5)
SKU mapping (catalog product or private product), "quantities are individual units", CSV import [OBS step-1 form]; private product definition (name, strength, units, barcode, hazard/handling flags) [PROP]; submission for review; status per product (draft, submitted, approved, rejected, archived) [PROP].

### 2.13 Label design and approval `/client/fulfillment/labels` (M5)
Template list (observed 3 ml and 10 ml), "Create master", "Proof sheet" [OBS]; upload artwork (PDF/PNG with size limits), generate proof, customer submits for approval, staff approves/rejects with reason, versioning [PROP]. Label editor beyond buttons not observed [BIZ]. Label and claim content subject to compliance gate G2.

### 2.14 Packaging `/client/fulfillment/packaging` (M5)
Packaging option catalog (box type, inserts, branded vs plain), selection per product/order type, cost from fee schedule, staff approval [PROP; USW step 3 contents not observed].

### 2.15 Store connections & integrations `/client/integrations` (M6)
Provider-independent connection list (API-only, e-commerce adapters later), connection status/health, last event, error count [PROP]. Evidence: USW step 4 says "Create your test key… sandbox orders only" [OBS], which supports API-key-first; no platform named, so **no Shopify-specific work is planned** until evidence [INF]. See INTEGRATION-ARCHITECTURE.md.

### 2.16 Sandbox order testing `/client/integrations/sandbox` (M6)
Send/inspect test orders using the sandbox key; sandbox orders never touch inventory, billing or carriers; result viewer with validation errors; onboarding step 5 is satisfied by a validated sandbox order [PROP; step 5 internals not observed].

### 2.17 Fulfillment orders `/client/orders?type=fulfillment` (M7)
Same Orders UI filtered by type; extra columns: source (API/store), external order ref, customer-facing recipient (masked), exception state; actions: cancel request, view exception [PROP].

### 2.18 API keys `/client/api-keys` (M6)
Nav item observed [OBS]; page not observed. Proposal: list (name, prefix, environment test/live, scopes, created, last used, status); create (shown once); revoke; rotate; live keys disabled until step 9 (go live) [PROP].

### 2.19 API documentation `/client/docs` (M6)
Nav item observed [OBS]; content not observed. Proposal: authenticated docs for order submission, SKU mapping, webhooks, signatures, idempotency, errors, sandbox, rate limits, changelog [PROP].

### 2.20 Integration & webhook logs `/client/integrations/logs` (M6)
Inbound API request log and outbound webhook deliveries (event, status, attempts, response code, payload viewer with secrets masked, "redeliver") [PROP; not observed].

## 3. Cross-cutting UX
- Empty states for every list (USW uses explicit empty states) [OBS].
- Status pills use a single shared mapping, defined in one place; internal vs display status separated [OBS pattern].
- All IDs monospace and linked [OBS].
- Errors are actionable, never raw database messages.
- Accessibility: keyboard navigation, contrast checked on recoloured tokens, tables responsive.
- English only at first [PROP].

## 4. Permissions matrix (customer roles) [PROP, role names partly OBS]
| Capability | Owner | Member | Developer* |
|---|---|---|---|
| Browse shop, place orders | ✔ | ✔ (limit configurable) | – |
| View invoices, report payment | ✔ | view only | – |
| Invite/remove users | ✔ | – | – |
| Onboarding submissions | ✔ | ✔ (drafts) | – |
| API keys, integrations | ✔ | – | ✔ |
| Billing address, resale cert | ✔ | – | – |
\*`Developer` is a proposed third role [BIZ]. USW shows only Owner/Member rules [OBS].

## 5. Open decisions affecting this spec
Tier model and minimums; prepay vs terms per org; wallet launch; return policy and customer cancellation window; certificate SLA; commission program; role set. See IMPLEMENTATION-ROADMAP.md decisions.
