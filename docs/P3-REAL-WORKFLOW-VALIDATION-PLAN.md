# P3 real workflow validation plan

Status 2026-11-10. **A PLAN. Nothing in it has been run, no database was contacted and no environment file was read to write it.** Subject: migration `bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e` and seed `1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164` (both unchanged; the dry execution on `99purity-portal-dev` parsed and ran them in a rolled-back transaction, 66 of 66 checks, PostgreSQL 17.11). This plan validates the BEHAVIOR of the 19 RPCs and the application actions, which the dry execution deliberately did not exercise.

## 0. Three execution tiers (and why)

| Tier | Where | Persistent writes | What it can prove | Needs |
|---|---|---|---|---|
| **R** (rollback) | hosted `99purity-portal-dev`, ONE transaction that creates the P3 objects, the seed AND all fixtures, then rolls back (the pattern of `tests/db/*.test.mjs` "BEGIN ... ROLLBACK" and of `supabase/review/tests/dry-execute-p3.mjs`) | **none persisted** (rows exist only inside the transaction; the P3 objects are created inside it too, so even `order_number_seq` disappears) | every single-session behavior: tests T01 to T14 and T16 | approval for transient fixture writes to `auth.*` inside a rolled-back transaction (section 3) |
| **L** (local stack) | the Docker Supabase stack of `docs/P2-1-LOCAL-STACK.md` (PostgreSQL 17, GoTrue, PostgREST, Kong), never the hosted project; 0001 to 0004 and P3 applied to the LOCAL database only | yes, in a disposable database that is destroyed afterwards | multi-session concurrency (T15), real GoTrue tokens, real TOTP step-up, PostgREST, the Next.js application actions (A01 to A08) | approval to start the stack and apply 0001 to 0004 and P3 **locally** (the "Phase B" of that document); no hosted write |
| **H** (hosted persistent) | hosted dev with the P3 migration applied for real | yes | nothing that R and L cannot prove | **NOT PROPOSED.** Reason in section 7 |

**Why concurrency needs tier L:** two sessions can see each other's rows only after COMMIT. A rolled-back transaction is invisible to a second session, so a real checkout-versus-admin race needs committed fixtures. Committed P3 test data cannot be removed afterwards on a shared database (section 7), so it belongs only in a disposable database.

## 1. Test identities (all fixtures; nothing refers to a real person or an existing user)

Reserved namespace: every id begins `b3000000-0000-4000-8000-`, every email is `p3test-<tag>-<rand>@example.invalid`, every organization code begins `P3T-`. A pre-check asserts that nothing in the target database uses the namespace; a post-check asserts that no row outside it changed (section 2).

| Tag | Id suffix | Kind | State |
|---|---|---|---|
| ADMIN | `…0001` | staff, role `admin` | active, approved TOTP factor, JWT `aal2` with a TOTP `amr` entry stamped now (step-up fresh) |
| ADMIN_NOSTEP | `…0002` | staff, role `admin` | as ADMIN but the TOTP `amr` entry is 20 minutes old (step-up stale) |
| OPS | `…0003` | staff, role `operations` | active, approved factor, aal2, fresh step-up |
| SUPPORT | `…0004` | staff, role `support` | same |
| FINANCE | `…0005` | staff, role `finance` | same |
| STAFF_AAL1 | `…0006` | staff, role `admin` | approved factor, JWT `aal1` |
| STAFF_DISABLED | `…0007` | staff, status `disabled`, role `admin` | aal2 |
| STAFF_NOROLE | `…0008` | staff row, no role | aal2 |
| CUST_A1 | `…0011` | owner of ORG_A | confirmed email, aal1 |
| CUST_A2 | `…0012` | member of ORG_A | confirmed |
| CUST_B1 | `…0021` | owner of ORG_B | confirmed |
| CUST_C1 | `…0031` | member of ORG_C (suspended) | confirmed |
| CUST_NONE | `…0041` | no membership | confirmed |
| CUST_REMOVED | `…0051` | removed member of ORG_A (`status = removed`) | confirmed |
| BANNED / DELETED / UNCONFIRMED | `…0061` / `…0062` / `…0063` | targets for member-add refusals | `banned_until` in the future / `deleted_at` set / `email_confirmed_at` null |

Organizations: ORG_A `b3000000-0000-4000-8000-0000000000a1` code `P3T-A`; ORG_B `…00b1` code `P3T-B`; ORG_C `…00c1` code `P3T-C`, status `suspended`.

**Catalog fixtures (from the approved seed, by SKU):** PR1 `5-amino-1mq` (V11 `5-AMINO-1MQ-5MGX10`, V12 `5-AMINO-1MQ-10MGX10`), PR2 `adamax` (V21 `ADAMAX-5MGX10`, V22 `ADAMAX-10MGX10`), PR3 `aod9604` (V31 `AOD9604-5MGX10`, V32 `AOD9604-10MGX10`), PR4 `adipotide-fttp` (never priced: the unpriced control).

**Prices set by ADMIN through `rpc_admin_variant_set_price` (cents):** V11 base 10000 floor 11000; V12 base 18000 floor 15000; V21 base 333 floor 100; V22 base 335 floor 100; V31 base 20000 floor 5000; V32 base `null` floor 5000 (no base: not purchasable); PR4 variants untouched (NULL, NULL).

**Rules set by ADMIN through `rpc_admin_markup_rule_set`:**
- ORG_A: organization default percent 25 (`value_e4` 250000); representative default percent 5 (50000); organization rule for PR2 only, percent 10 (100000) with representative percent bounds 2 to 3 (`rep_min_percent_e4` 20000, `rep_max_percent_e4` 30000).
- ORG_B: organization default fixed $5.00 (50000); no representative rule.
- ORG_C: none.

**Publishing (`rpc_admin_org_product_set`):** ORG_A: PR1, PR2, PR3 published and available; ORG_B: PR1, PR3 published, PR3 later made unavailable; ORG_C: PR1 published.

**Expected unit prices (cents) — worked from the Aspen semantics, each markup rounded half away from zero at its stage:**

| Variant | ORG_A | ORG_B |
|---|---|---|
| V11 (10000, floor 11000) | 10000 +2500 = 12500; +5 % of 12500 = 625 → **13125** | 10000 + 500 → **10500** |
| V12 (18000, floor 15000) | 18000 +4500 = 22500; +1125 → **23625** | 18500 (PR1 variant, published for B) |
| V21 (333, floor 100) | +10 % = 33 → 366; rep 5 % clamped to 3 % of 366 = 10.98 → 11 → **377** | not published for B |
| V22 (335, floor 100) | +10 % = 34 (33.5) → 369; rep 3 % = 11.07 → 11 → **380** | not published |
| V31 (20000, floor 5000) | +5000 = 25000; +1250 → **26250** | 20500 |
| V32 (no base) | **not listed, not purchasable** | not listed |

## 2. How every test proves it did not affect existing users or organizations

Common to all tiers: (1) **namespace pre-check** (no row anywhere uses the reserved ids, emails or codes; the pre-existing counts of `auth.users`, `public.organizations`, `organization_members`, `staff_members`, `staff_roles`, `audit_events` are recorded); (2) **row digests**: the snapshot of `tests/…/dry-execute-p3.mjs` (md5 over every row of `organizations`, `organization_members`, `profiles`, `staff_members`, `staff_roles`, `audit_events`, `organization_invites`, `organization_billing`, `capabilities`, `role_capabilities`, `platform_validations` and of `auth.users`, `auth.identities`, `auth.mfa_factors`) taken BEFORE (fresh connection) and AFTER (fresh connection); (3) **a statement allow-list**: the harness refuses to run any statement that is not one of the listed RPC calls, the fixture inserts below or a read-only SELECT (no `UPDATE`/`DELETE` of a row outside the namespace; no `isolateStaff`, which deletes staff and must never be used on a shared database); (4) **post-check**: the digests of everything outside the namespace are identical, row counts equal, migration history equal to the four applied versions, no P3 object exists (tier R) / the local database is destroyed (tier L).

## 3. Staff bootstrap: the safest route in the existing architecture

**What the architecture allows.** A staff session needs ALL of: a row in `public.staff_members` (active) with a role, a JWT with `aal = aal2`, an approved factor in `private.staff_mfa_factors` (inserted only through the 0002 guard trigger: an open enrolment window for that user, a VERIFIED TOTP factor of that user created inside the window), and a fresh structure check (`private.mfa_check_ok`). Step-up additionally needs a TOTP `amr` entry in the JWT younger than 15 minutes. There is no capability and no table privilege that lets an API role create any of this; the only real routes are (a) the owner-run `bootstrap-first-admin` procedure (`docs/P2-2-ADMIN-BOOTSTRAP-PROCEDURE.md`: first administrator only, exact approval string, refuses unless both staff tables are empty) and (b) `rpc_staff_add_member` + `rpc_staff_authorize_enrolment_window` by an EXISTING verified admin.

**Tier R (hosted, transient).** Create the staff fixtures INSIDE the rolled-back transaction by the same steps the 0002 tests use (`tests/db/lib/db.mjs`: `mkUser`, `mkStaff`, `mkWindow`, `mkFactor`, `claim`, i.e. `mkApprovedStaff`): insert the `auth.users` row, the `staff_members` and `staff_roles` rows, an enrolment window (`authorized_by` NULL, the bootstrap form the guard allows), a verified TOTP row in `auth.mfa_factors` created after the window opened, then the insert into `private.staff_mfa_factors`, which runs the REAL guard and consumes the window. Call `private.run_auth_structure_check()` inside the transaction if the recorded check is older than 12 hours. The JWT is simulated per call with `set_config('request.jwt.claims', …, true)` + `set local role authenticated` (the technique of the dry execution and of tests/db). Every real guard and trigger runs; nothing is disabled; the only simulated element is the token. This is not a bypass: it creates no persistent privilege and no service-role use; it needs the owner connection that the dry execution already used. **Do not run `isolateStaff`**, and do not touch existing staff rows.

**Tier L (local).** Same fixtures, plus real GoTrue users (`mkLoginUser`) and real TOTP enrolment through GoTrue so the staff JWT is issued by GoTrue with real `aal2` and `amr` (tests/db `50-http`; the TOTP code is computed with `node:crypto`, RFC 6238, no package). The first-admin script is also exercised in its dry-run mode against the empty local database.

**Hosted persistent staff: BLOCKER, not proposed.** A persistent test staff on hosted would need either the first-admin bootstrap (the staff tables must be empty: it is unknown whether the real first administrator already exists, because the dry-run snapshots recorded digests, not counts), or an existing real admin performing `rpc_staff_add_member` with a real authenticator. Both put a real person's credential in the loop and leave an undeletable staff row (the last-admin and approval guards). There is no safe automated route and none will be invented.

**Prerequisite to verify first (probe P0, rolled back):** that the hosted owner connection may INSERT into `auth.users` and `auth.mfa_factors` (the enum casts `auth.factor_type`, `auth.factor_status`) and that the 0001 trigger `handle_new_user` accepts the minimal user row. If any of this is refused, tier R cannot create customer or staff fixtures and the whole workflow validation moves to tier L; nothing else changes.

## 4. Test matrix (tier R unless stated; "PW" = persistent write)

Notation: **Call** = `set_config('request.jwt.claims', {sub: <id>, role: 'authenticated', aal, amr}, true); set local role authenticated; select public.<rpc>(…)`; "audit" = `public.audit_events` read by the owner connection; unless stated every test ends with the transaction `ROLLBACK` (cleanup), has **PW = no**, and uses the proof of section 2. Fixture prerequisites: F0 = P3 migration + seed applied inside the transaction; F1 = users and organizations of section 1; F2 = prices; F3 = rules; F4 = publishing.

### 4.1 Customer identity and organization membership (item 1)
| ID | Identity | Fixtures | Call | Expected result | Expected DB state |
|---|---|---|---|---|---|
| T01 | CUST_A1 | F0,F1 | `rpc_catalog_list(ORG_A)` | `{ok:true, items:[]}` (nothing published yet) | no writes |
| T02 | CUST_NONE | F0,F1 | `rpc_catalog_list(ORG_A)`, `rpc_cart_get(ORG_A)`, `rpc_orders_list(ORG_A)` | `organization_not_found` each | no writes |
| T03 | CUST_REMOVED | F0,F1 | same three | `organization_not_found` | none |
| T04 | CUST_C1 (suspended org) | F0,F1 | catalog, cart put, checkout on ORG_C | `organization_not_found` | none |
| T05 | unauthenticated (`request.jwt.claims` empty, role `anon`) and CUST_A1 with `sub` null | F0 | any customer RPC | SQLSTATE 42501 (permission denied for anon; "authentication required" when `auth.uid()` is null) | none |
| T05b | ADMIN | F0,F1 | `rpc_admin_org_member_add(ORG_A, <A2 email>, 'member')` then again | first `added`; second `already_member` (no new audit row); with `'owner'` → `role_changed` and audit old/new | membership row added once; audit rows = 2 (added, role_changed) |
| T05c | ADMIN | + BANNED, DELETED, UNCONFIRMED, a STAFF user, an owner | member-add of each | `user_not_found` ×3; staff user → `member_not_allowed` (0002 guard); owner → `member` → `owner_downgrade_not_allowed` | no membership rows for the refused targets; no audit rows for refusals other than the gate's |

### 4.2 Admin product, variant, assignment, markup, floor (items 2 to 5)
| ID | Identity | Call | Expected | DB state |
|---|---|---|---|---|
| T06 | ADMIN | `rpc_admin_catalog_list()` | 153 products, 221 variants, every base and floor NULL | none |
| T07 | ADMIN | `rpc_admin_variant_set_price(V11, 10000, 11000)` etc. for the F2 table | `updated` each; one audit row each (`staff.variant.price.set`, old NULL → new values) | variant rows updated |
| T07b | ADMIN | `rpc_admin_variant_set_price(V11, 0, 100)`, `(V11, 100, 100000001)` | SQLSTATE 22023 (invalid arguments); a bad id → `variant_not_found` | unchanged |
| T08 | ADMIN | `rpc_admin_org_product_set(ORG_A, PR4, true, true)` (PR4 unpriced) | `product_not_priced` | no assignment row |
| T08b | ADMIN | `rpc_admin_org_product_set(ORG_A, PR1, true, true)` after T07 | `updated` | assignment row; audit `staff.org.product.set` |
| T09 | ADMIN | `rpc_admin_markup_rule_set` for each F3 rule (kind, product, type, `value_e4`, bounds, active) | `updated` with `rule_id`; audit with old/new type, value, active | one row per (org, kind, product) |
| T09b | ADMIN | the same call with changed values; a representative rule WITH bounds; a percent value 1000.0001 (10000001); min > max; unknown organization/product | update in place (same `rule_id`); 22023 for the invalid ones; `organization_not_found` / `product_not_found` | no duplicate scope row (unique index) |
| T10 | ADMIN | set V12 floor 30000 | catalog price for ORG_A V12 becomes **30000** (floor applied) | restored to 15000 in the same test; price changes only affect the next read |
| T11 | ADMIN | clear V11 base (`null`), read catalog, restore | V11 disappears from ORG_A catalog and `add to cart` returns `not_available`; PR1 stays listed through V12 | none persisted |

### 4.3 Customer shop visibility and tenant isolation (item 6)
| ID | Identity | Call | Expected |
|---|---|---|---|
| T12 | CUST_A1 | `rpc_catalog_list(ORG_A)` after F2–F4 | PR1 (V11 13125, V12 23625), PR2 (V21 377, V22 380), PR3 (V31 26250; V32 absent); PR4 absent; no field named base, floor, markup, org_amount, pricing anywhere in the JSON |
| T12b | CUST_B1 | `rpc_catalog_list(ORG_B)` | PR1 (V11 10500, V12 18500), PR3 (V31 20500); PR2 absent |
| T12c | CUST_B1 | `rpc_catalog_list(ORG_A)` | `organization_not_found` (tenant isolation) |
| T12d | CUST_A1 | make PR3 unavailable for ORG_A; archive PR2 | PR3 still listed with `available:false`; PR2 gone; `cart_put_item` for a PR3 variant → `not_available` |
| T13 | CUST_A1 | `select * from public.products` / `orders` / `carts` / `markup_rules` as role authenticated and anon | SQLSTATE 42501 on every table (no grant, RLS on, no policy) |

### 4.4 Cart (item 7)
| ID | Identity | Call | Expected | DB state |
|---|---|---|---|---|
| T14 | CUST_A1 | `rpc_cart_put_item(ORG_A, V11, 2)`, `(V21, 10)`, `(V31, 1)`; `rpc_cart_get` | `updated` ×3; lines with unit 13125 / 377 / 26250, line 26250 / 3770 / 26250, all `purchasable:true` | 1 cart, 3 items; **no audit rows** (M2) |
| T14b | CUST_A1 | put V11 quantity 5, then 0 | quantity updated; line removed | |
| T14c | CUST_A1 | put V32 (no base), PR4 variant, V11 quantity 10001, quantity −1, a ORG_B variant on ORG_A | `not_available` ×3; 22023 ×2 | cart unchanged |
| T14d | CUST_A1 vs CUST_A2 | A2 `rpc_cart_get(ORG_A)` | empty: carts are per (organization, user) | 2 carts |
| T14e | CUST_A1 | 100 distinct purchasable variants then a 101st | 101st → `cart_full` (needs ≥101 priced variants: price a sample of the 221 seeded variants for this test only) | 100 items |
| T14f | CUST_A1 | after T14, ADMIN raises V11 base to 12000; A1 `rpc_cart_get` | V11 line now 15750 (25% + 5 % on 12000: 3000 → 15000, 750 → 15750): carts hold no prices | cart rows unchanged |
| T14g | CUST_A1 | PR1 unpublished by ADMIN, `rpc_cart_get` | V11/V12 lines `purchasable:false`; `rpc_checkout` → `cart_not_purchasable` listing the variant ids | no order |

### 4.5 Checkout, idempotency, snapshots (items 8 to 10)
| ID | Identity | Call | Expected | DB state |
|---|---|---|---|---|
| T15a | CUST_A1 | `rpc_checkout(ORG_A, shipTo, null, K1)` with the T14 cart (V11×2, V21×10, V31×1) | `order_placed`, `replay:false`, `total_cents` **56270** (26250 + 3770 + 26250), order number `ORD-` + 8 digits | 1 order (`placed`, subtotal = total = 56270, `idempotency_key` K1), 3 items with unit/line/base/floor and `pricing` breakdown (V11: org 2500, rep 625, clamped false, floor_applied false), 1 event `placed`, cart empty, **exactly 1 audit row** `order.place` (actor kind `organization_user`, org A, subject order, detail lines 3 / total 56270) |
| T15b | CUST_A1 | the SAME call again (same K1) | `order_placed`, `replay:true`, same `order_id` and number | still 1 order, 3 items, 1 event, 1 audit row (no second) |
| T15c | CUST_A1 | a new key K2 with the now empty cart | `cart_empty` | no order |
| T15d | CUST_A2 | `rpc_checkout(ORG_A, shipTo, null, K1)` after filling A2's cart | a NEW order for A2 (the key is unique per (organization, user)) | 2 orders |
| T15e | CUST_A1 | a cart with V12 where V12's floor is 30000 | line price 30000; snapshot `floor_applied:true`, `raw` 23625 | |
| T15f | CUST_A1 | invalid ship-to (missing city, country `usa`, unknown key), notes 501 chars, null key | 22023 each | no order, cart unchanged |
| T15g | CUST_A1 | 100 lines at quantity 10000 and unit 100000000 (priced test variants at the cap) | `order_too_large` before any write | no order |
| T16 | ADMIN then CUST_A1 | after T15a: ADMIN `rpc_admin_variant_set_price(V11, 12000, 11000)`, rule change org 25 → 40 %; then `rpc_admin_order_get(O1)` and `rpc_order_get(ORG_A, O1)` | the order is UNCHANGED: V11 unit 13125, pricing breakdown identical, total 56270 (future-only pricing); a NEW checkout uses the new prices | |
| T16b | owner connection | `update public.order_items …`, `delete from public.orders …`, `truncate public.order_events`, `update public.orders set total_cents = 1`, `set status = 'delivered'` directly | 23514 / "append-only" / "cannot be deleted" / "illegal order status transition" / truncate blocked | no change |
| T16c | CUST_A1 | `rpc_order_get(ORG_A, O1)` | items show name, spec, sku, quantity, unit and line prices only; no breakdown | |

### 4.6 Admin orders and status (item 11)
| ID | Identity | Call | Expected |
|---|---|---|---|
| T17 | ADMIN, OPS, SUPPORT, FINANCE | `rpc_admin_orders_list(null, 100)`, with each valid status filter, an invalid status | list contains the orders with organization name and code; `invalid` → 22023 |
| T17b | OPS | `rpc_admin_order_get(O1)` | order, items WITH base, floor and the full `pricing` breakdown, events |
| T18 | OPS | `rpc_admin_order_set_status(O1, 'confirmed', 'ok')` → `processing` → `shipped` → `delivered` | each `updated`; events appended (actor kind staff, note); audit `staff.order.status.set` success with from/to |
| T18b | OPS | `placed → shipped`, `shipped → cancelled`, `delivered → placed`, any move after `cancelled` | `invalid_transition` + audit `denied` (reason, from, to); status unchanged |
| T18c | OPS | `placed → cancelled` on a new order, then any further change | allowed once; final |

### 4.7 Staff authorization (item 12)
Expected codes for each (identity, RPC) pair; every refusal by the gate writes one audit row `denied` with the reason, except a missing verified session which raises 42501 and writes nothing:

| Identity \ RPC | catalog_list, org_catalog_get, product_set_status, org_product_set | variant_set_price, markup_rule_set, org_create | member_add | orders_list / order_get | order_set_status |
|---|---|---|---|---|---|
| ADMIN (fresh step-up) | ok | ok | ok | ok | ok (admin holds fulfillment.process) |
| ADMIN_NOSTEP | ok | `step_up_required` | `step_up_required` | ok | ok |
| OPS | `forbidden` | `forbidden` | `forbidden` | ok | ok |
| SUPPORT / FINANCE | `forbidden` | `forbidden` | `forbidden` | ok | `forbidden` |
| STAFF_AAL1 / STAFF_DISABLED / STAFF_NOROLE | 42501 | 42501 | 42501 | 42501 | 42501 |
| CUST_A1 (customer) | 42501 | 42501 | 42501 | 42501 | 42501 (no audit row) |
| anon | 42501 | 42501 | 42501 | 42501 | 42501 |

Test T19 runs the whole grid (12 RPCs × 9 identities) and asserts the code, the audit row count and that no state changed for refusals. T19b: a staff user cannot be added to an organization (0002 guard) and a member cannot become staff.

### 4.8 Cross-organization access attempts (item 13)
| ID | Identity | Attempt | Expected |
|---|---|---|---|
| T20 | CUST_B1 | `rpc_order_get(ORG_B, O1)` (an ORG_A order id with its own org) | `order_not_found` |
| T20b | CUST_B1 | `rpc_order_get(ORG_A, O1)` | `organization_not_found` |
| T20c | CUST_B1 | `rpc_orders_list(ORG_B)` | only ORG_B orders (zero) |
| T20d | CUST_A1 | `rpc_cart_put_item(ORG_B, V11, 1)`, `rpc_cart_get(ORG_B)`, `rpc_checkout(ORG_B, …)` | `organization_not_found`; no cart row for ORG_B |
| T20e | CUST_A1 (member of A and, in a variant of the test, also of B) | with `sub` of A1, an organization id of C | `organization_not_found` |
| T20f | CUST_A1 | `rpc_admin_*` | 42501 |

### 4.9 Audit (item 14)
T21 compares the audit rows of the whole run with an exact expected list: checkout → 1 `order.place`; every admin mutation → 1 success row with the old/new values listed in the SQL; every gate refusal → 1 `denied` row (`capability_missing` or `step_up_required`); cart edits, reads, lists and customer refusals → 0 rows; no free text (reasons, notes, addresses) in any detail; `actor_kind` `staff` / `organization_user`; `organization_id` set for org-scoped actions; all in the same transaction as the change (a forced failure after the audit call, by a `raise` injected through a trigger in the test transaction, leaves neither). **P1 caveat:** whether the hosted PostgREST commits an RPC transaction is unverified; tier R proves audit and data are written together INSIDE one transaction, not that a request commits.

### 4.10 Concurrency (item 15) — tier L, PW = yes (local database only)
See section 5.

### 4.11 Application actions (tier L, real GoTrue, the Next.js app against the local stack)
| ID | Flow | Expected |
|---|---|---|
| A01 | unauthenticated GET `/client/shop`, `/admin/orders` | redirect to `/login?next=…` (middleware), never page content |
| A02 | CUST_A1 signs in; `/client/shop` | storefront with the ORG_A prices only, no category label, research-use text |
| A03 | add to cart, update, empty; open `/client/cart` | server-priced lines; blocked checkout link when a line is unpurchasable |
| A04 | `/client/checkout`: submit the SAME rendered form twice (and refresh-resubmit) | one order; the second submit lands on the same order page |
| A05 | CUST_A1 requests `/admin/orders` and POSTs the admin server actions with crafted form data | admin layout shows the access-denied page; each action refuses without calling an RPC effect (no change in the database) |
| A06 | ADMIN signs in with real TOTP; opens products, prices a variant with a fresh step-up; again after 16 minutes | success; second attempt shows the step-up message and changes nothing |
| A07 | OPS opens `/admin/orders/<id>` | status form; price pages refuse (404) |
| A08 | SUPPORT | order detail read-only note; no status form |

## 5. Concurrency test (T15x, tier L only)

**Environment.** The local stack with 0001 to 0004 and P3 applied, F1–F4 committed (not rolled back), 3 organizations, 20 priced variants `W01…W20` (a dedicated set of seed variants), ADMIN and 8 customer users, each customer a member of ORG_A with a cart refilled by `rpc_cart_put_item` before every checkout. Each worker owns ONE PostgreSQL connection with the identity set by `set_config('request.jwt.claims', …, false)` + `set role authenticated` at session level, `READ COMMITTED` (the PostgREST default), `lock_timeout` 30 s, `statement_timeout` 60 s. An observer connection (owner) reads `pg_locks` and `pg_stat_activity`.

**Version marker (detects a mixed snapshot).** Every administrative "version" `v` (1,2,3, …) is applied in ONE admin transaction that calls, for all 20 variants, `rpc_admin_variant_set_price(Wi, 100000 + 1000·v + i, 90000)` and sets the ORG_A default organization rule to percent `v` (`value_e4 = v·10000`, v ≤ 100): so base price AND markup carry the same `v`, and `i` (1 to 20) identifies the variant. For a created order, decode `v_base = floor((base − 100000) / 1000)` for each item and `v_rule = pricing.org_value_e4 / 10000`: **the order is consistent only if every item has the same `v_base`, `v_rule = v_base`, `unit_price = base + round(base·v/100)` and the total equals the sum of the lines.** Any order with two different versions is a mixed-price snapshot and fails the test.

**Scenarios and expected serialization**
1. **D1 admin first (deterministic).** Admin session Y: `BEGIN`; the 20 price calls and the rule call for v+1 (the exclusive pricing lock is held to COMMIT; not committed). Customer session X: `rpc_checkout(...)`. Expected: X BLOCKS (the observer sees X waiting on an advisory lock, `wait_event_type = 'Lock'`; Y holds `ExclusiveLock` on key `hashtextextended('shop:pricing',0)`); Y `COMMIT`; X completes; the order has ALL items at v+1.
2. **D2 checkout first (deterministic).** X: `BEGIN; select rpc_checkout(...)` (shared lock held, not committed). Y: the admin transaction of D1. Expected: Y BLOCKS on its first price call; X `COMMIT`; Y completes; X's order has all items at version v; a second checkout afterwards has v+1.
3. **D3 coexistence.** Two customers (different users, same organization) each in an uncommitted `rpc_checkout`: neither blocks (`pg_locks` shows two granted shared locks, no waiter); the admin then waits for BOTH.
4. **D4 stress.** 8 customer workers loop 200 times each (refill cart, checkout) while the admin session applies a new version every 50 ms, 300 versions; run 3 times with different interleavings (random sleeps 0 to 20 ms, seeded). Expected: zero mixed-version orders; zero SQLSTATE 40P01 (deadlock) and zero lock timeouts (55P03); the only non-success answers are `cart_empty` (an empty cart is refilled first, so none expected) and `cart_not_purchasable` (none expected: no assignment changes); every admin transaction commits; throughput stays above 1 checkout per second per worker (not a pass criterion, reported).
5. **D5 idempotent double submit.** Two sessions of the SAME user call `rpc_checkout` with the same key at the same instant (barrier). Expected: one order exists; both calls return the same `order_id` (one `replay:true`); exactly 1 audit row; the second waits on the cart row lock (observer).
6. **D6 other changes.** While X is in an uncommitted checkout, Y attempts `rpc_admin_product_set_status`, `rpc_admin_org_product_set`, `rpc_admin_markup_rule_set`: each BLOCKS until X commits (all take the exclusive pricing lock after the gate). While Y holds the lock uncommitted, `rpc_cart_put_item` and `rpc_cart_get` do NOT block (they take no pricing lock).
7. **D7 negative control (the harness must be able to fail).** In the local database only, create `rpc_checkout_unsafe` = the rev-1 style checkout without the shared lock and with the price read in a separate statement from the item insert, and run D4 against it: the harness MUST report at least one mixed-version order. If it reports none, the harness (not the product) is invalid and D4's result means nothing.

**Pass criteria.** D1–D3, D5, D6 behave exactly as stated; D4 shows 0 mixed orders and 0 deadlocks over ≥ 4800 checkouts and ≥ 900 admin versions; D7 detects mixing. **Limits:** it proves the protocol on PostgreSQL 17 at READ COMMITTED; it does not prove PostgREST commit behavior (P1) or behavior at `REPEATABLE READ`/`SERIALIZABLE` (the P3 RPCs do not enforce an isolation level: add `private.require_read_committed()`-style refusal only if the project owner wants it; at higher levels the single-statement snapshot and the lock still hold, but the idempotency lookup after the lock could read a stale snapshot, so this is listed as an open question, not tested).

## 6. Cleanup and "does it persist?" by test

| Tests | Tier | Persistent write | Cleanup |
|---|---|---|---|
| P0 probe, T01–T21 | R (hosted) | **No** (everything, including the P3 objects and `order_number_seq`, exists only inside the transaction) | `ROLLBACK`, then the fresh-connection digest comparison of section 2; the harness exits non-zero if any digest, count or the migration history differs |
| T15x concurrency, A01–A08 | L (local) | Yes, in the local disposable database only | `npm run db:local:stop` and removal of the local volumes (or `db:reset`); the hosted project is not touched. Data in a P3 database cannot be deleted with SQL (orders, items and events are append-only, TRUNCATE is blocked), so "cleanup" is destroying the local database |
| any test on hosted with committed data | H | Yes | **not proposed** |

## 7. Why tier H is not proposed
Committed P3 rows (orders, items, events) are immutable by design: no `DELETE`, no `UPDATE`, no `TRUNCATE`. Test data committed to `99purity-portal-dev` could be removed only by disabling the guard triggers or dropping the tables, which are exactly the controls under test and would be a destructive, un-reviewed operation on a shared project. Staff fixtures would additionally be undeletable under the last-admin and approval guards. A persistent hosted apply is a separate, later decision (the promotion of the P3 migration) and is not part of validation.

## 8. Security risks and missing prerequisites

**Risks of the plan itself**
1. Tier R writes (transiently) into `auth.users`, `auth.mfa_factors` and the P1/P2 tables of the shared project; a harness bug or a dropped connection must still roll back: the same rollback-in-`finally` plus fresh-connection verification as the dry execution is mandatory; run with `lock_timeout`, `statement_timeout` and `idle_in_transaction_session_timeout`; keep each transaction under one minute. Rolled-back inserts take row locks only on the new rows and fire the 0001 `handle_new_user` trigger (a profile row inside the transaction).
2. The simulated JWT is a test technique: it proves database authorization given the claims, not GoTrue/PostgREST token handling (covered only in tier L).
3. The harness credential is the owner connection (powerful by nature): the same pinned-project, pinned-CA, in-memory, never-printed handling as the dry execution; no new credential, no service-role key anywhere.
4. Any use of `isolateStaff`, `reset`, `truncate`, `delete` against non-namespace rows is forbidden by the statement allow-list.
5. Emails use `.invalid`; no mail is sent (no invitation or recovery flow is called).

**Missing prerequisites**
- Verification of the owner connection's INSERT rights on `auth.*` (probe P0, section 3); otherwise tier R fixtures are impossible.
- Whether a real first administrator exists on hosted (matters only for tier H, which is not proposed).
- Docker Desktop and the Supabase images for tier L (documented in `P2-1-LOCAL-STACK.md`; approval to start the stack and apply migrations to the LOCAL database only); a GoTrue TOTP helper (RFC 6238 with `node:crypto`; no package installation).
- A new rollback harness (`supabase/review/tests/p3-workflow-rollback.mjs`, derived from `dry-execute-p3.mjs`) with the statement allow-list and the fixture builders; the existing `tests/db` guard refuses hosted targets on purpose, so tier R must not reuse it unchanged. A concurrency runner for tier L (extends `tests/db/lib/db.mjs` `twoTx`/`waitForLock`).
- 100+ priced variants for T14e and variants at the price cap for T15g (set inside the test transaction).
- Open product questions that change expected results but not the plan: the one-representative-per-organization assumption; the hidden category label; whether the P3 RPCs should refuse isolation levels above READ COMMITTED.

## 9. Which tests need which approval
- **Every test needs a database, so none can run without one of the two approvals below.** Tier R tests (T01–T21 and probe P0) have no persistent write at all; they are blocked only by the first approval.
- **Approval for transient (rolled-back) fixture writes on the hosted dev project** (probe P0, T01–T21): needed once, naming the migration and seed hashes and the new harness hash.
- **Approval to start the local Docker stack and apply 0001–0004 + P3 + seed to the LOCAL database, with persistent test data there** (T15x, A01–A08): needed once, never touches hosted.
- **Not requested:** any persistent hosted write, any hosted P3 apply, any commit, push or deploy; P4 is not started.
