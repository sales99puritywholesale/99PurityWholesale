# P3 implementation plan: catalog, pricing, cart and orders

Started 2026-11-10. Flow: admin creates organization, assigns catalog, configures markup; partner shares storefront; customer shops; cart; checkout; order; admin manages order.

## 1. What exists and is reused
| Need | Existing piece |
|---|---|
| Identity, organizations, membership (`owner`/`member`), RLS helper `private.my_org_ids()` | migration 0001 (applied) |
| Staff roles and capabilities, `private.staff_gate()`, step-up, audit (`private.write_audit`) | migrations 0002, 0003, 0004 (applied) |
| Staff context in the app (`getStaffAccessContext`, `evaluateCapability`, `evaluateAdminAccess`) | `src/lib/portal/staff-access.ts`, `permissions/` (not yet wired into `/admin`: the layout still denies everyone) |
| Portal shell, tables, cards, states; routes and nav for `/client/shop`, `/client/orders`, `/admin/products`, `/admin/pricing`, `/admin/orders` (placeholders today) | `src/components/portal/*`, `src/app/(portal)/*`, `src/lib/portal/nav.ts` |
| Supabase server client with the user session; `requireUser` | `src/portal/db/server.ts`, `src/lib/portal/auth.ts` |
| Product content (about 150 products with name, slug, category, specs, CAS, description) | `src/data/products.json` (public site; **not modified**) |

Capabilities: P3 **reuses** existing capabilities (no new capability rows, so no change to the staff catalog and no conflict with the deferred 0005 self-check): catalog, assignment and pricing changes need `org.manage` (admin only; pricing changes also need a fresh step-up); order management needs `fulfillment.process` (operations and admin); reading orders needs `org.read` (admin, finance, operations, support).

## 2. Missing (genuine) structures
No product, price, catalog-assignment, cart or order tables exist. One migration is required: **`supabase/review/p3/20261110000100_p3_catalog_pricing_orders.sql`** (draft; not applied; not in `supabase/migrations/`, whose integrity test and ledger describe only applied files). Tables: `products`, `product_variants` (base price and floor, integer cents), `organization_products` (assignment, visibility, availability), `markup_rules` (Aspen-style organization and representative markup rules), `carts`, `cart_items`, `orders`, `order_items` (immutable price snapshot), `order_events` (append-only status history). All access is through SECURITY DEFINER RPCs (RLS enabled, no table grants); order numbers from a sequence; status transitions guarded by a trigger. Product rows are seeded from `products.json` by `scripts/gen-catalog-seed.mjs` (generates SQL; base prices start empty, so nothing is purchasable until an admin sets a price).

## 3. Pricing rule (revision 2: Aspen parity, approved 2026-11-10)
Reproduces AspenWholesale's markup pricing (`markup_amount`, `pick_markup_rule`, `rep_bounds`, `compute_markup_price`); evaluated only in the database (`private.shop_compose`, `private.shop_price_breakdown`) and mirrored by `src/lib/portal/commerce/pricing.ts`.
- **Variant:** base price (cents, > 0) and floor (cents, > 0). BOTH are required to list, publish or sell.
- **Markup rules** (`public.markup_rules`): kind `organization` or `representative`; type `percent` or `fixed`; value in units of 1e-4 (percent x 10000, or dollars x 10000); scope all products or one product (the product-specific active rule beats the default); representative bounds (min/max percent and min/max fixed) live on organization rules.
- **Formula:** org amount = markup_amount(org rule, base); org price = base + org amount; rep value = clamp(rep value, bounds of the organization rule for the rep rule's type); rep amount = markup_amount(rep rule, org price); unit = max(org price + rep amount, floor). `markup_amount`: percent = round(price x value / 100) to cents, fixed = round(value) to cents, half away from zero.
- **Future checkouts only:** the checkout prices all lines in one statement under a shared pricing lock, snapshots the full breakdown into `order_items.pricing`, and nothing rewrites it.
- **Assumption:** P3 has no partner entity; one representative rule set per organization plays the role of Aspen's partner rules.

## 4. Milestones (each ships backend and frontend together)
| M | Deliverable | Files |
|---|---|---|
| M0 | roadmap, P10 backlog, this plan | `docs/ROADMAP.md`, `docs/P10-BACKLOG.md`, this file |
| M1 | pricing and order-lifecycle models with tests; validation schemas | `src/lib/portal/commerce/{pricing,orders,schemas}.ts`, `tests/portal/commerce.test.ts` |
| M2 | migration draft with RPCs, RLS, guards, audit; seed generator; static tests on the SQL | `supabase/review/p3/*.sql`, `scripts/gen-catalog-seed.mjs`, `tests/portal/commerce-sql.test.ts` |
| M3 | server data layer (typed RPC wrappers, response parsing, safe errors) | `src/lib/portal/commerce/server.ts` |
| M4 | admin wiring (staff context, layout, capability helper) and admin screens: catalog and prices, organization catalog and markup, orders and status changes | `src/lib/portal/staff-gate.ts`, `src/app/(portal)/admin/{layout,products,pricing,orders}/*`, `src/app/(portal)/admin/orders/[id]/page.tsx` |
| M5 | customer storefront, cart, checkout, order history and details | `src/app/(portal)/client/{shop,cart,checkout,orders}/*` |
| M6 | verification of what can be verified offline (tests, typecheck); list of what needs a database | report |

Database-dependent verification (applying the draft, RLS and tenant-isolation tests against a real database) is **not** done in P3 without the project owner's approval; comprehensive security testing is P10.
