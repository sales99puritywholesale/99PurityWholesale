# Aspen Reuse Map

Audit date: 2026-11-07. Reference repo: `C:\Users\ASUS\Downloads\AspenWholesale\aspenwholesale-platform` (TanStack Start/Vite + Supabase). **Read-only; never modified.**

## Ground rules
1. **No code or credentials are copied from Aspen's environment.** `.env.local` and `.env.staging-credentials` were deliberately not opened. Our deployment gets a *new* Supabase project, new keys and new buckets.
2. **Do not copy migrations verbatim.** Write a squashed baseline from final definitions, then add our own migrations. Aspen's migrations contain seeded real data (see section 4).
3. **Framework gap:** Aspen is TanStack/Vite with browser→Supabase RPC calls and no server layer. We are Next.js. Pure TS libs port directly; routes/components are rewrites; SQL ports as a unit.
4. **Aspen's test status:** 314 unit tests pass (`node --test "tests/*/*.test.ts"`, Node 24, no `test` script in package.json). They cover pure TS helpers only. **No SQL, RLS, pricing, cart, coupon, audit, `*-api.ts` or component tests exist.** "Has tests" below means the helper only.
5. **Verification level:** *Traced* = implementation read by the audit; *Skimmed* = file existence and headers only. Anything skimmed must be re-read before porting.

## A. Reusable SQL (port as a unit; all under `supabase/migrations/`)
| Capability | Source migration(s) | Tables / functions | Traced? | Changes required |
|---|---|---|---|---|
| Roles & helpers | `20260902184256_*`, `20260902195854_*` | `app_role`, `user_roles`, `has_role`, `is_admin`, `is_approved_buyer`, `my_account_id` (in `private` schema) | Traced | Add staff roles (finance/ops/support); drop buyer-only assumptions |
| Catalog | `20260902184256_*`, `20260916214033_*`, `20260904172158_*` | `products`, `product_variants`, `product_images`, `categories`, `suppliers`, `account_product_exclusions` | Traced | Remove peptide seed data (`20260902184419`), CAS/purity columns if not needed |
| Price breaks | `20260904172158_*` | `product_price_breaks` | Traced | Add price-list dimension (US Direct vs Fulfillment-Direct) |
| Price floors | phase 6 `20261013000000_markup_payments_phase6.sql` | `product_price_floors`, trigger | Traced | Only if partners/markup are in scope |
| Cart | `…184256_*`, phase 5 `20261012000000_storefront_phase5.sql` | `carts`, `cart_items`, storefront carts (RPC-only, no price column) | Traced | |
| Server-priced checkout | phase 12 `20261019000000_catalog_coupons_phase12.sql` | `storefront_checkout` (idempotent, rate-limited, flag-gated, recomputes prices) | Traced | Re-point at our org model; remove partner attribution if unused |
| Orders + financial guard | phase 1 `20261008000000_*`, phase 6 `20261013000000_*` | `orders`, `order_items`, `orders_financial_guard` trigger, `admin_mark_order_paid`, `admin_record_refund` | Traced | Add wallet/invoice linkage; **do not reuse the wholesale (non-storefront) insert path** |
| Commission engine | phase 6 `20261013100000_commissions_phase6.sql` | `private.build_financial_snapshot`, `orders_commission_hook`, `accrue_order_commission`, `sync_order_reversals`, `commission_ledger` (append-only, TRUNCATE blocked) | Traced | USW commission rules unknown; add tests (none exist) |
| Payout reservation | phases 6, 15 `20261022000000_*` | negative ledger rows, admin "mark paid" RPC | Traced | Placeholder `PayoutAdapter` only |
| Hierarchy | phase 2 `20261009000000_*`, phase 18 `20261025000000_*` | `parent_partner_id`, acyclic deferrable trigger, `reorganize_partner_hierarchy`, `sales_partners_guard` | Traced | Reuse only if multi-level referral network is wanted |
| Coupons | phases 10, 11, 12, 21 | partner-funded coupons, RPC-write only | Skimmed | Narrow model; likely rewrite |
| Documents | `…184256_*` and phase 1 | `product_documents` (lot, test date), `account_documents`, `partner_documents`, private buckets + signed URLs | Traced | Recreate buckets in our project |
| Audit | `…184256_*` | `audit_logs`, SECURITY DEFINER diff trigger | Traced | Make immutable; redact PII |
| Email outbox | phases 25–26 `20261101000000_*`, `20261102000000_*` | outbox tables, templates | Skimmed | Dispatcher must be deployed (see C) |
| Organizations | phase 13 `20261020000000_organizations_phase13.sql` | `organizations`, org code, default plan, suspension | Traced | **No members table**: replace with `organization_members` |

**Not present in Aspen (BUILD for us):** wallet, invoices, payment provider, API keys, webhooks, inventory movements/decrement, carrier shipping, per-account pricing tiers.

## B. Reusable TypeScript (pure helpers; port after review)
Under `src/lib/` (all paths relative to the Aspen repo root):
| File | Purpose | Tests (tests/) | Notes |
|---|---|---|---|
| `backend-guard.ts` | Guard wrapper for backend calls | `backend-guard/guard.test.ts` | Most reusable; adapt to server actions |
| `commissions.ts`, `commissions-api.ts`, `commission-trend.ts`, `ledger-view.ts`, `payouts-view.ts` | Commission views/formatting/RPC wrappers | `commissions/*.test.ts` (helpers) | Wrappers untested |
| `organizations.ts`, `organizations-api.ts`, `organizations-hooks.ts` | Org logic | `organizations/organizations.test.ts` | Rebuild around members table |
| `partner-hierarchy*.ts` (5 files) | Tree rows/metrics/format/zoom | `partner-hierarchy/*.test.ts` | Optional module |
| `pricing.ts`, `cart.ts`, `price-floors.ts` | Pricing/cart math | `catalogs/price-floors.test.ts` only | **`pricing.ts` has hard-coded break constants and no tests; cart/pricing computed client-side: do not trust for money** |
| `catalog-*.ts`, `product-form.ts`, `catalogs*.ts` | Catalog admin/list/slug | `catalog/*.test.ts`, `catalogs/*.test.ts` | |
| `documents.ts`, `csv.ts`, `csv-export.ts` | Documents and CSV | none | Useful for SKU CSV import (USW step 1) |
| `email/` , `email-log-api.ts` | Email templates | `email/email.test.ts` | Scrub Aspen strings |
| `google-auth.ts` | OAuth wrapper | `google-auth/google-auth.test.ts` | Contains a Lovable project id: **drop** |
| `realtime-sync.ts` | Realtime hints | `realtime/*` | Channel is open to all authenticated users: restrict |

## C. Scripts and infra
- `scripts/staging/email-dispatch.mjs`: email dispatcher exists **only as a local script**. Re-implement as a scheduled server job.
- `supabase/proposed/*.tests.sql`, `.verify.sql`: SQL test material that was **not run**. Worth mining for a pgTAP suite.
- `src/integrations/supabase/client.server.ts`, `auth-middleware.ts`, `cron-auth.ts`: service-role client and cron auth exist but nothing imports them, so no secret reaches client code. Good patterns; re-create server-side in Next.

## D. Components (UI; rewrite, don't port)
`src/components/partners/*` (hierarchy tree/table/list/zoom, partner dashboard, coupons, profile, team pricing) and routes under `src/routes/` (`_authenticated/*`, `c.$catalogSlug.*`, `partner.*`, `admin.*`). TanStack route files do not port to Next; reuse as UX reference for admin/partner screens only. USW's customer UI is a different design and is specified by screenshots, not Aspen.

## E. Strip list before any reuse
- Real account UUID `9d8a6140-…` (migrations `20260929201629`, `…202152`, `…202238`).
- Personal email and `support@` / `info@` / `orders@aspenwholesale.com`, site URL (phase 25 seeds, plus app strings).
- "Aspen" in ~45 source files; `AW-`, `AW-ORD-`, `AWP-` numbering; `brand_label` 'ASPEN WHOLESALE'; GUC `aspen.sys`; Lovable project id `lovp_…` in `google-auth.ts`.
- Peptide seed products/categories; twelve `20260923*` wording-rewrite data migrations.
- Research-use/physician-use disclaimers (our copy rules differ; see project-rules.md).

## F. Known defects NOT to inherit
1. **Client-priced wholesale checkout** (`src/routes/_authenticated/checkout.tsx:117-132` inserts `subtotal`, `total`, `unit_price`, `line_total` from browser state; no trigger revalidates). Verified in code.
2. `audit_logs` mutable by service paths.
3. Realtime channel `sync` visible to all authenticated users.
4. Guards treat `auth.uid() IS NULL` as privileged (verify this cannot be reached through PostgREST).
5. `stock_quantity` is never decremented: Aspen has no inventory consistency to inherit.
6. Migration status labels are inconsistent (phase 1 "NOT APPLIED" yet in `migrations/`); phase 1 triplicated across `migrations/`, `supabase/proposed/`, `drizzle/migrations/`.


## G. Revision 2 (2026-11-07): reuse status for the expanded scope
Aspen remains **read-only reference**. Nothing is copied from it, and its credentials were never opened. With fulfillment, wallet, integrations and a full admin platform now in scope, the share of the platform that Aspen can inform is small.

| New capability | Aspen coverage | Use |
|---|---|---|
| Server-priced order placement | `storefront_checkout` (phase 12, traced) | Pattern; re-implement as `place_order` for orgs |
| Payment-status protection | `orders_financial_guard`, `admin_mark_order_paid` (traced) | Pattern for `payments` guard |
| Append-only ledger discipline | `commission_ledger` triggers, column grants, idempotency indexes (traced) | Pattern for financial ledger, wallet, inventory movements |
| Hierarchy/partner network | phases 2, 18 | Optional, only if referral network is wanted |
| Commissions and payouts | phases 6, 15 | Port for M9; add the SQL tests Aspen lacks |
| Documents/private storage | `product_documents`, `account_documents` | Pattern for certificates and uploads |
| Email outbox | phases 25–26 and `scripts/staging/email-dispatch.mjs` | Pattern only; the dispatcher must be deployed as a real job |
| Audit trigger | `audit_logs` | Pattern; make immutable |
| Organizations | phase 13 | Starting point; add `organization_members` |
| Role helpers | `has_role`, `is_admin`, etc. | Pattern; replace with capability model |
| **Wallet, invoices, double-entry ledger, inventory movements, fulfillment orders, onboarding engine, label/packaging, API keys, webhooks, sandbox, carriers, returns, admin consoles** | **None** | **New design (see DATABASE-DESIGN.md §7)** |

Defects not to inherit remain as in section F (client-priced wholesale checkout, mutable audit, open realtime channel, null-uid privilege, unreduced stock).

Additional hygiene rules: never connect to Aspen's Supabase project; never copy `.env*` files; if Aspen material is ported, strip the items in section E and re-review each function body (phases 14–22 and 26 were only skimmed in this audit).
