# Database Design

Audit date: 2026-11-07. **No migrations have been created.** This is an assessment plus a proposal.

## 1. Existing 99 Purity data layer (verified)
There is **no database, ORM, auth or storage** in the app. Data is:
- `src/data/products.json`: 153 products (`name`, `slug`, `category`, `specs`, `cas`, `description`). No price, SKU, stock. Specs are strings like `5mg×10`.
- Code-resident content: `productContent.ts` (~5,800 lines), `researchDb.ts`, image map hard-coded in `products/[slug]/page.tsx`.
- Inquiry cart in browser localStorage; leads go only to an optional Google Sheets webhook (`LEADS_SHEET_URL`) and Resend email.
Consequence: nothing is reusable as a transactional store. Existing JSON must be **imported** into the new catalog tables once, with spec strings normalised into variants.

## 2. Aspen schema assessment (reference only)
Aspen has 62 migrations in two eras: Lovable wholesale portal (2026-09, 34 files) and a hand-written Sales Partner Platform (phases 1–26, `20261008…` to `20261102…`). Production state of these migrations is **unknown**: headers say "PROPOSED, NOT APPLIED" (phase 1), "NOT APPLIED" (2–5), "applied to STAGING only" (6+).

| Domain | Aspen tables / objects | Quality | Reuse |
|---|---|---|---|
| Roles | `app_role` (admin/buyer), `user_roles`, `has_role`, `is_admin`, `is_approved_buyer`, `my_account_id` (SECURITY DEFINER, pinned search_path, in `private`) | Good; users cannot self-escalate | REUSE pattern; add `staff` roles |
| Organizations | flat `organizations`, `sales_partners.organization_id`, `org_role` owner/member. No members table | Weak | EXTEND |
| Hierarchy | `sales_partners.parent_partner_id`, deferrable acyclic trigger, `reorganize_partner_hierarchy` | Good; relies on triggers | REUSE if partner network is wanted |
| Catalog | products, variants, images, categories, suppliers, slug redirects, `account_product_exclusions` | Good | EXTEND (strip peptide seed data) |
| Pricing | `product_price_breaks`, `product_price_floors` (trigger-enforced), markup rules | Good, but one price family only | EXTEND for USW's two families |
| Carts | `carts`, `cart_items` (RLS good); storefront carts RPC-only | Good | REUSE |
| Checkout | `storefront_checkout` (phase 12): idempotent, rate-limited, server-priced | Good | REUSE |
| Wholesale checkout | direct client inserts of subtotal/total/unit_price/line_total | **Vulnerable** | REPLACE |
| Orders | channel CHECK, composite FKs, frozen attribution, `orders_financial_guard` blocks client edits to payment/refund/snapshot | Good | REUSE |
| Commissions | `build_financial_snapshot`, `commission_ledger` (append-only incl. TRUNCATE blocked, column grants, idempotency indexes), hold days, reversals | Strongest piece | REUSE |
| Payouts | negative ledger rows reserve money; "mark paid" by admin RPC | OK | REUSE |
| Coupons | partner-profit-funded only, RPC-write | Narrow | EXTEND |
| Documents | `product_documents` (lot, test date), `account_documents`, `partner_documents`, private buckets | Good | REUSE |
| Audit | `audit_logs` + diff trigger | Mutable by service paths, stores PII diffs | EXTEND |
| Wallet / invoices / payment provider / inventory logic | **absent** | n/a | BUILD |

Caveats: the DB audit skimmed phase 14–22 and 26 function bodies and did not read the `.tests.sql`/`.verify.sql` files; no RLS policy was exhaustively proven. Treat the table above as a guide to where to look, not as certification.

**Must strip before reuse:** seeded real account UUID `9d8a6140-…` (migrations `20260929201629`, `…202152`, `…202238`), personal and `aspenwholesale.com` emails (phase 25), `AW-` numbering and `aspen.sys` setting, peptide seed data, and the twelve `20260923*` wording-rewrite data migrations. Do not copy migrations verbatim; create a **squashed baseline** from final definitions.

## 3. Proposed schema (new Supabase project)
Conventions: `id uuid pk`, `created_at/updated_at timestamptz`, money in `bigint` cents with `currency char(3)`, `organization_id` on every tenant row, soft-delete via `status` not DELETE for financial rows.

### 3.1 Identity & tenancy
- `profiles(user_id→auth.users, full_name, phone)`
- `organizations(id, name, code unique, status[pending|active|suspended], billing_address jsonb, resale_cert_document_id, payment_terms[prepay|net], managed_flags jsonb)`
- `organization_members(organization_id, user_id, role[owner|member], status[invited|active|removed], invited_by)` unique(org,user)
- `organization_invites(token_hash, email, role, expires_at, accepted_at)`
- `staff_roles(user_id, role[admin|ops|finance|support])` (global, separate from customer roles)
- `account_requests` (replaces wholesale inquiry: company, contact, status, reviewed_by)

### 3.2 Catalog & pricing
- `products(sku, name, slug, category_id, status, public_json_ref)`; `product_variants(product_id, sku, label, units_per_box, strength)`; `categories`; `product_images`.
- `price_lists(id, name, kind[us_direct|fulfillment_direct|custom], effective_from)`; `price_list_breaks(price_list_id, variant_id, min_boxes, unit_price_cents)`; `organization_price_lists(org, price_list, priority)`; `price_floors(variant_id, floor_cents)`.
- `fee_schedules(id, effective_from)` + `fee_schedule_items(code, amount_cents, unit, basis)` for the USW-style rate card (per-order, postage markup %, label, receiving, platform, storage, setup, hourly, returns).

### 3.3 Orders, invoices, payments
- `orders(number, organization_id, placed_by, channel, type, status, internal_status, subtotal_cents, shipping_cents, total_cents, price_snapshot jsonb, placed_at)`; `order_items(order_id, variant_id, qty_boxes, unit_price_cents, line_total_cents, coa_addon bool)`; `order_status_history` (append-only).
- `invoices(number, organization_id, order_id, status[draft|open|paid|void], total_cents, due_at, paid_cents)`; `invoice_lines`.
- `payments(organization_id, method[wire|zelle|wallet|…], amount_cents, status[claimed|confirmed|rejected|refunded], reference, claimed_by, confirmed_by, proof_document_id)` plus `payment_events` (append-only). Customers may only INSERT a `claimed` row; `confirmed` is set by finance RPC.
- `shipments(order_id, carrier, tracking_number, status, shipped_at, delivered_at)`.

### 3.4 Wallet (ledger): **SUPERSEDED, see §7 Revision 2: wallet is built dark, flag-gated, and separate from invoices/payments**
- `wallets(organization_id unique, currency)`.
- `wallet_entries(wallet_id, entry_type[topup|invoice_payment|purchase_reserve|purchase_charge|reserve_release|fee|refund|adjustment], amount_cents signed, ref_type, ref_id, idempotency_key unique, created_by, created_at)`: **append-only** (reject UPDATE/DELETE/TRUNCATE triggers, as Aspen does for commissions).
- View `wallet_balances(wallet_id, available, reserved)` derived from entries; periodic reconciliation job. Implements the USW rule: reserve on accept, charge on ship, release on cancel.

### 3.5 Inventory
- `warehouses`, `lots(variant_id, lot_number, tested_at, expires_at)`, `inventory_movements(warehouse_id, variant_id, lot_id, organization_id nullable (customer-owned), qty_units signed, movement_type[receive|allocate|pick|pack|ship|return|adjust|writeoff], ref_type, ref_id, created_by)` **append-only**; `inventory_levels` derived. Allocation uses a transactional RPC with row locks to prevent oversell.

### 3.6 Certificates
- `certificates(organization_id nullable, lot_id, order_id nullable, kind[included|company], storage_path, available_at, status[pending|in_progress|available])`.

### 3.7 Commissions
Adapt Aspen: `commission_plans`, `commission_rules`, `referral_links`, `commission_ledger` (append-only), `payout_methods`, `payouts`. Rates unknown for USW (see REFERENCE-ANALYSIS).

### 3.8 Fulfillment onboarding
- `fulfillment_setups(organization_id, status)`; `fulfillment_steps(setup_id, step_no 1–9, owner[customer|staff], status[todo|in_progress|waiting_staff|done], completed_at, data jsonb)`; `sku_mappings(organization_id, variant_id | private_product_id, external_sku, units_per_pack)`; `private_products`; `label_templates`, `label_designs`, `label_proofs`; `packaging_options`, `packaging_selections`; `store_connections(platform, status, credentials_ref)` (secrets in a vault, not in rows); `test_orders`; `agreements(document_id, signed_at, signed_by)`; `launch_reviews`.

### 3.9 Integrations
- `api_keys(organization_id, name, prefix, key_hash, environment[test|live], scopes[], last_used_at, revoked_at)` (plaintext shown once, never stored); `webhook_endpoints(url, secret_ref, events[])`; `webhook_deliveries(status, attempts, next_attempt_at, response_code)`; `email_outbox`.

### 3.10 Audit
- `audit_log(id, actor_id, actor_type, organization_id, action, entity_type, entity_id, diff jsonb redacted, ip, created_at)`: append-only and immutable (no service-role bypass for UPDATE/DELETE).

## 4. Relationships (summary)
organizations 1─* organization_members *─1 auth.users; organizations 1─* orders 1─* order_items *─1 product_variants; orders 1─1 invoices; invoices 1─* payments; organizations 1─1 wallets 1─* wallet_entries; lots 1─* inventory_movements; orders 1─* certificates; organizations 1─1 fulfillment_setups 1─9 fulfillment_steps.

## 5. Financial and inventory integrity requirements
1. Append-only ledgers with reject-mutation triggers and `idempotency_key` uniqueness.
2. Signed-amount CHECK constraints per entry type; no negative available balance unless explicitly allowed.
3. Order totals recomputed in an RPC from price tables inside the transaction; the client never supplies prices.
4. Payment `confirmed` state settable only by finance RPC; guard trigger rejects direct updates (Aspen's `orders_financial_guard` pattern).
5. Cross-table invariants verified by scheduled reconciliation: wallet derived balance = sum(entries); invoice paid_cents = sum(confirmed payments); inventory level = sum(movements).
6. Inventory allocation with `SELECT … FOR UPDATE` and a constraint preventing negative levels.
7. Every state change writes `audit_log`.

## 6. Open schema questions (see also §7)
Are wallet funds refundable? Is prepay mandatory for all orders? Does stock belong to USW-style "customer-owned" units? Multi-currency? Sales tax / resale certificates? These need your decisions (see ROADMAP open items).

## 7. Revision 2 (2026-11-07): updated architecture for confirmed scope
Supersedes §3.4 and extends §3.5, §3.8, §3.9. Still **no migrations created**.

### 7.1 Financial separation: invoices, payments, ledger, wallet
Four independent layers, each with its own tables and RPCs; none may update another's rows directly.
1. **Receivables**: `invoices`, `invoice_lines`, invoice number sequence. Statuses: draft, open, partially_paid, paid, void. Line types: wholesale, setup_fee, fulfillment_fee, packaging_fee, shipping_fee, storage_fee, adjustment. Invoice rows change status only via RPC from payment application or void.
2. **Payments**: `payments` (reported / confirmed / rejected / refunded / duplicate), `payment_applications(payment_id, invoice_id, amount_cents)`, `payment_events` (append-only), `payment_proofs` (private storage refs). Customer-writable: INSERT of a `reported` payment only.
3. **Financial ledger**: `ledger_accounts` (receivable, cash_received, revenue_*, refunds, adjustments, customer_credit, ...) and `ledger_entries(id, txn_id, account_id, organization_id, amount_cents signed, currency, ref_type, ref_id, idempotency_key unique, created_by, created_at)`. **Double-entry**: a constraint trigger requires entries per `txn_id` to sum to zero at commit. Append-only (reject UPDATE/DELETE/TRUNCATE, revoke privileges; corrections are reversing transactions). Written only by finance/system RPCs.
4. **Wallet (feature-flagged off)**: `wallets`, `wallet_entries` as in the original §3.4 design, **plus** `platform_flags.wallet_enabled = false` checked inside every wallet RPC (RPCs raise when disabled; verified by test). No customer-facing top-up, no stored-value receipt, no UI affordance while the flag is off. When enabled, wallet movements post to the ledger as `customer_credit` liabilities. Gate G3 must be recorded before the flag can be switched; switching requires `ADMIN (no separate `super_admin` role in M1; see MILESTONE-1-SCHEMA-AND-RLS.md §3)`, MFA re-authentication and an audit entry.
`funding_requirements` reference payments/invoices, not the wallet, so onboarding step 7 works without stored value.

### 7.2 Money rules
`bigint` cents, `currency char(3)` (USD); CHECK `amount_cents <> 0` on ledger lines; no floats anywhere including JSON snapshots; rounding defined once in a DB function (half-even for percentage fees such as postage markup).

### 7.3 Order and price history
`orders.price_snapshot jsonb` plus `order_items.unit_price_cents / line_total_cents / price_list_id / break_id` captured at placement; a trigger forbids UPDATE of those columns after insert. `orders.status` changes only via a state-machine RPC. `order_status_history` is append-only.

### 7.4 Onboarding engine tables (new)
`onboarding_templates`, `onboarding_template_steps(template_id, step_no, key, title, owner, requires_approval, fields_schema jsonb, upload_rules jsonb, depends_on int[])`, `onboarding_instances(organization_id, template_id, status)`, `onboarding_steps(instance_id, step_no, status, owner, submitted_at, reviewed_at, reviewed_by, current_submission_id)`, `onboarding_submissions(step_id, version, data jsonb, submitted_by, submitted_at)`, `onboarding_submission_files`, `onboarding_reviews(submission_id, decision, reason_code, instructions, reviewer, reviewed_at)`, `onboarding_events` (append-only). Guard trigger: only staff-capability RPCs may set `approved`/`rejected`; `reviewed_by <> submitted_by`.
Compliance: `compliance_gates(code G1..G6, scope platform|org, organization_id null, status, evidence_document_id, approved_by, approved_at, expires_at)`; the go-live RPC checks them.

### 7.5 Fulfillment product / label / packaging (new)
`private_products`, `fulfillment_skus` (internal), `sku_mappings` (see INTEGRATION-ARCHITECTURE §5), `label_templates`, `label_designs(organization_id, product_ref, template_id, status, current_version_id)`, `label_versions(design_id, version, storage_path, checksum, status, reviewed_by, reason)`, `packaging_options`, `packaging_selections(organization_id, product_ref, option_id, status)`, `agreements`, `agreement_signatures`.

### 7.6 Inventory (replaces §3.5)
`warehouses`, `locations(warehouse_id, code, type)`, `lots`, and
`inventory_movements(id, movement_type, owner_type [customer|company], owner_org_id null, sku, lot_id, from_location_id, to_location_id, qty_units, ref_type, ref_id, reason, idempotency_key unique, created_by, created_at)` — append-only.
`inventory_balances(owner_type, owner_org_id, sku, lot_id, location_id, on_hand, reserved)` is written only by the single movement RPC inside the same transaction, with CHECK `on_hand >= 0` and `reserved <= on_hand`. A nightly job recomputes balances from movements and raises `reconciliation_alerts` on drift. `reservations(order_item_id, qty, status)` are always paired with `reserve`/`release` movements. Also `inbound_notices` (ASN), `receipts`, `receipt_lines`, `cycle_counts`.
Customer-owned stock is allocatable only to the owning organization (enforced in the allocate RPC and by trigger on reservations).

### 7.7 Fulfillment orders (new)
`fulfillment_orders(organization_id, source [api|adapter|manual], external_order_ref, is_sandbox, status, recipient jsonb, idempotency link)`, `fulfillment_order_lines`, `fulfillment_status_history`, `pick_tasks`, `pack_records`, `shipments`, `shipment_packages`, `shipment_events`, `exceptions(type, status, assignee, sla_due_at, resolution)`, `return_orders`, `return_lines`.

### 7.8 Integrations (new; detail in INTEGRATION-ARCHITECTURE.md)
`api_keys`, `api_key_events`, `idempotency_records(organization_id, key, request_hash, response, expires_at)`, `webhook_endpoints`, `webhook_secrets` (vault ref), `webhook_deliveries`, `event_outbox`, `integration_events`, `integration_connections(provider, status, credentials_vault_ref)`, optional `rate_limit_buckets`.

### 7.9 Staff and capabilities
`staff_roles`, `capabilities`, `role_capabilities`, `staff_assignments`; `has_capability(text)` security-definer function; read-only impersonation `support_sessions(staff_id, organization_id, expires_at, reason)`.

### 7.10 RLS summary for new entities
Tenant tables: SELECT where `organization_id` is in the caller's organizations (via a private helper). Writes only through RPCs, except draft rows (carts, onboarding drafts, label drafts) that get narrow INSERT/UPDATE policies with `WITH CHECK` on organization and on forbidden columns. Ledgers, payment events, inventory movements, audit log and price snapshots have no client write privileges at all. Staff tables are readable by capability. Storage policy uses the `organization_id` path prefix. The full policy matrix is produced in M1 and tested in CI.

### 7.11 Aspen reuse status for new entities
No Aspen equivalent exists for the double-entry ledger, wallet, invoices, inventory movements, fulfillment orders, onboarding engine, integration platform, or label/packaging. These are new designs. Aspen contributes patterns only (see REUSE-MAP.md Revision 2).
