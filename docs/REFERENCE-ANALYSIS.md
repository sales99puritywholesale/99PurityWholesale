# USW Reference Analysis (screenshots)

Source: `reference/usw-reference/screenshots/` (11 files, **10 unique screens**; `image(20261105-213054).png` and `image(20261105-213156).png` are byte-identical, MD5-verified).
Convention: **[C]** confirmed visible, **[I]** inferred, **[?]** unknown. Personal data in the screenshots (owner name, email, phone, tracking and lot numbers) is deliberately not reproduced.
Two captures are low resolution (Shop 642x610, Billing 532x966); text was read from upscaled crops, so small digits there carry slightly more risk of misreading.
Evidence limit: we have no USW admin access. Nothing about admin behavior is asserted.

## Global shell
- [C] Dark navy sidebar, light canvas. Sidebar is a flat text list with no icons, groups or badges, identical on every screen.
- [C] Order: Overview, Shop, Orders, Invoices & payments, Billing, Account, Certificates, Inventory, Commissions, Fulfillment setup, API Keys, API Docs; divider; Sign out; footer "Questions? Contact your USW account manager."
- [C] Active item: lighter navy pill with a gold left bar.
- [C] Top bar: only "Signed in as <tenant>" and Sign out. No wallet balance, bell or user menu.
- [C] Visual language: gold pill primary buttons, very rounded white cards, gold small-caps eyebrow labels, monospace underlined IDs, mint / amber / lavender status pills.
- [I] URL slugs: Shop `/client/shop`, Invoices `/client/purchases`, Inventory `/client/stock`, others match the nav label.

## Screens

### 1. Overview — `image(20261105-212452).png`
- [C] Alert banner: "2 unpaid invoices — $49,503.50 due".
- [C] "Set up fulfillment" card: "0 of 9 steps done", gold "Next: Add your products" button.
- [I] Likely also summary cards for orders/stock (not fully legible); linking from banner to Invoices.
- [?] Whether the banner amount sums only overdue or all unpaid invoices.

### 2. Shop — `image(20261105-212803).png` (no URL bar, low-res)
- [C] Pricing statement: "per box (box = 10), 30% off standard".
- [C] Table columns: Product/Variant, Available/owned, US Direct, FD 1+, FD 10+, FD 50+, FD 100+, Origin, Qty (boxes), Certificate, Subtotal.
- [C] Per-line "+ COA · $100" add-on; footer button "Place order & get invoice"; "137 options shown".
- [I] FD = Fulfillment-Direct price tiers by quantity; US Direct = single price for US-origin stock; "Available/owned" mixes warehouse availability with customer-owned units.
- [?] How tiers aggregate (per SKU vs whole cart), minimum order, stock reservation at order time, filters/search (none clearly visible).

### 3. Orders — `image(20261105-212842).png`
- [C] Nine filter pills: All, Pending, Queued, Allocated, Picked, Packed, Ready, Shipped, Delivered, Cancelled.
- [C] Columns: Order ID, Status, Type, Items, Created, Shipped, Tracking. IDs like `CW-####`; 7 orders.
- [C] Customer-facing labels differ from pill names: "Preparing shipment", "In transit", "Delivered · <date>".
- [I] Two-layer status model: internal pipeline states mapped to friendlier customer labels.
- [?] Meaning of "Type" values, order detail page, cancel rights.

### 4. Invoices & payments — `image(20261105-212906).png` (`/purchases`)
- [C] Invoice IDs `CPI-CW-####` (tied to order IDs), status "Paid" or "Waiting for payment", "COA attached" chip, links "Payment details" and "I've sent payment".
- [C] Two unpaid: $49,418.50 and $85.00. Wire and Zelle named as payment methods.
- [I] Customer self-reports payment; an admin confirms (consistent with Aspen's manual model).
- [?] Payment-instruction content, proof upload, due dates, partial payments, PDF download.

### 5. Billing — `image(20261105-212938).png` (low-res)
- [C] Balance $0.00; collapsed "Pay USW / Add funds"; empty top-ups list.
- [C] Rate card (effective Oct 29, 2026): $5 per order; postage actual cost + 10%; label application $1/unit; receiving $50/box and $350/pallet; platform $199/month starting one month after first real order ships; pallet storage $75/month; setup $5,000 = $4,000 fee + $1,000 into wallet; custom work $45/hour; returns $20 each.
- [C] Statement pairs a green "Invoice payment" credit row with a red "Purchase" debit row.
- [C] Wallet rule (stated on Billing/Fulfillment pages): reserve on accept, charge on ship, release on cancel.
- [?] Funding methods and minimum, auto-top-up, refund of wallet, how invoice payment credits the wallet.

### 6. Account — `screencapture-…-client-account-…png`
- [C] Team section with Owner/Member rules and an invite form.
- [C] Company and billing-address form fields.
- [C] Read-only "Managed by USW" card: Active, $0.00, "Prepay only", Invoicing Enabled, Resale certificate: None.
- [?] Role permissions beyond the stated rules; resale-certificate upload flow; who can change "Prepay only".

### 7. Certificates — `screencapture-…-client-certificates-…png`
- [C] One card per order with two columns: "Included" and "Company certificate", plus a lot number.
- [C] Included certificate: "Available 24 hours after your order ships".
- [?] "In progress" state, download format, how a company certificate is requested or issued (the shop's $100 COA add-on is presumably related, [I]).

### 8. Inventory — `image(20261105-213054).png` and duplicate `…213156.png` (`/stock`)
- [C] Empty state only.
- [?] Columns, lot tracking, receiving workflow, low-stock alerts. Everything beyond the empty state is unknown.

### 9. Commissions — `screencapture-…-client-commissions-…png`
- [C] Three $0.00 KPI cards: Earned and unpaid, Waiting for fulfillment, Potential. Tabs Earnings / Payments (empty). "Payout setup" and "Create my referral link" buttons.
- [I] Customers can be referrers; commission accrues on referred orders and unlocks after fulfillment.
- [?] Rates, tiers, hold period, payout method and schedule.

### 10. Fulfillment setup — `screencapture-…-client-fulfillment-setup-…png`
Nine steps. Chips: steps 1–5, 7, 8 show "Your step"; steps 6 and 9 show "Waiting on USW". Only step 1 is expanded.

| Step | Title | Confirmed content |
|---|---|---|
| 1 | Add products | SKU-mapping form: USW catalog or private product; "Quantities are individual units"; CSV import. Labels panel: 3 ml and 10 ml templates, "Create master", "Proof sheet" |
| 2 | Design labels | Title only [C]; the Labels panel above is likely part of 1 or 2 [I] |
| 3 | Choose packaging | Title only. Contents **[?]** |
| 4 | Connect your store | "Create your test key… sandbox orders only". Which store platforms: **[?]** |
| 5 | Send a test order | Title only [C]. Likely uses the sandbox key [I] |
| 6 | Sign agreement and pay setup | "Waiting on USW"; "Ask your rep for [the agreement]". Setup = $5,000 ($4,000 fee + $1,000 wallet) per rate card |
| 7 | Fund wallet | Title only [C] |
| 8 | Launch review | "Your step" chip [C]; review content **[?]** |
| 9 | Go live | "Waiting on USW" — admin-gated [I] |

## Module coverage
All 10 requested modules appear in at least one screenshot. Depth varies:
- **Well evidenced:** Shop, Orders, Invoices, Billing, Account.
- **Shell only / empty state:** Inventory, Commissions, Certificates (one state), Overview.
- **Partial:** Fulfillment setup (step 1 of 9 only).
- **In nav, never shown:** API Keys, API Docs.

## Data-model hints (inferred)
Organization (tenant) with owner/member users; customer product catalog with US Direct and FD tiered prices; orders with channel/type and internal vs display status; invoices linked 1:1 to orders; wallet with ledger entries (invoice payment, purchase, top-up, fees, reserve/release); fee rate card with effective date; certificates linked to order and lot; fulfillment setup progress (9 steps, owner = customer or USW); SKU mapping; label templates; API keys (test/live); referral links and commission records.

## Unknown workflows (need more evidence)
1. Wire/Zelle payment-instruction page and the "I've sent payment" confirmation.
2. Wallet top-up (methods, minimum, approval).
3. Shop tier aggregation, minimums, and stock reservation.
4. Order and invoice detail pages; cancellations and returns.
5. Fulfillment steps 3–9 (packaging options, store connections, test order, agreement, launch review).
6. Label design editor and proof approval.
7. API key screen, API docs, webhooks, and order-submission API payload.
8. Commission rates, payout methods and referral attribution.
9. Inventory columns and receiving flow.
10. Prepay-only versus the large unpaid invoice shown (see Feature Matrix).
11. Anything admin-side (approvals, pricing, wallet adjustments, step transitions).

**Recommended extra evidence:** screenshots of the unexpanded steps 2–9, the Payment details panel, Add funds panel, an order detail, an invoice detail, API Keys and API Docs.


---

# Revision 2 (2026-11-07)

## Evidence classification
| Class | Meaning | Status in this project |
|---|---|---|
| **OBS** | Observed in USW screenshots | 10 unique screens (11 files, 2 byte-identical). Everything marked [C] above is OBS |
| **DESC** | Observed in supplied USW workflow descriptions | **None supplied so far.** Nothing is classified DESC |
| **PUB** | Publicly verified (USW public site/docs, etc.) | **None gathered yet.** No public research has been done on USW; nothing is classified PUB |
| **INF** | Inferred from observed evidence | Tagged [I] above; must be validated before relying on it |
| **PROP** | Proposed for 99 Purity | All admin features, steps 2–9 internals, API/doc screens, notifications, returns, warehouse operations |
| **BIZ** | Requires business confirmation | Pricing model, terms, fees, commissions, policies, compliance gates |

Rule: a proposed or inferred feature is never described as "USW functionality" in any document.

## What each observed fact supports
- OBS → reproduce faithfully: sidebar IA and labels, Overview banner + setup card, Shop table structure, Orders pills/columns and label mapping, Invoice list pattern and "I've sent payment" concept, Billing structure and rate-card pattern, Account structure, Certificates card, onboarding step titles/owners.
- OBS but partial → reproduce the pattern, design the remainder: Inventory (empty state only), Commissions (empty state only), step 1 form, label templates.
- Nav-only OBS → design from scratch: API Keys, API Docs.

## Missing screenshots, workflows and decisions (consolidated)
### Missing screenshots (customer portal only; no admin access requested)
1. Fulfillment setup with each of steps 2–9 expanded (and completed/rejected/in-review states, if available).
2. "Payment details" panel and "I've sent payment" dialog on Invoices.
3. "Pay USW / Add funds" panel expanded, and a populated top-up list.
4. An order detail page; an invoice detail page; a populated Orders status timeline.
5. Shop interactions: cart state, quantity edits, COA add-on, order confirmation, filters/search, a product detail page.
6. Inventory with data; receiving/ASN flow if present.
7. Commissions with data; Payout setup dialog; referral link dialog.
8. API Keys page and API Docs page.
9. Certificates "In progress" state and a populated company-certificate example.
10. Account: invite dialog, role change, resale-certificate upload.
11. Any notifications/emails received (screenshots of sample emails).

### Missing workflows
Wire/Zelle instruction content and confirmation SLAs; wallet top-up methods/minimums; tier aggregation; stock reservation timing at order; cancellation windows; returns process; label proofing rounds; packaging options; store connection methods and supported platforms; test-order criteria; agreement and e-sign; launch review checklist; go-live steps; commission rates, holds and payouts; certificate generation rules.

### Business decisions required (cannot be inferred from USW)
Terms (prepay vs net), fee amounts, setup fee structure, wallet launch (G3), stock ownership transfer moment, return/cancel policies, certificate SLA, commission program, role set, supported integrations, compliance gates G1–G6, warehouse/carrier operating model.

Not required at this time: USW admin access. The customer evidence plus the proposed admin design is sufficient to start Milestones 1–4.
