# P3 development provisioning plan (PLAN ONLY: nothing here has been created)

Purpose: make the real customer and admin commerce workflows testable on the hosted development project `semtmllmwhxznxechfsk` now that the P3 migration is applied. No account or record below exists yet; none may be created without the project owner's separate, explicit approval. No account is invented here: every identity needs a real email and password chosen by the owner.

## 1. Verified starting state (from the committed apply, 2026-11-10)
| Area | State |
|---|---|
| P3 objects | 9 tables, 19 public RPCs, 8 helpers, 10 triggers, `order_number_seq` (unused); history has 5 versions |
| Catalog | 153 products, 221 variants, active and seed-managed, **no price on any variant** |
| Organizations, memberships, staff, roles | **0** (counts verified before and after the apply) |
| Assignments, markup rules, carts, orders | **0** |
| Auth users | 2 validation accounts from the early M1 work (not for product use) |
| PostgREST | exposes the RPCs: an anonymous call answers `401 / 42501 permission denied`; a nonexistent function answers `404 PGRST202` (checked with a public-key probe) |

Consequence: with the real backend a customer sees an empty catalog (no organization, no prices, no assignments) and the admin area is access-denied for everyone (no staff, no MFA sign-in).

## 2. Identities the owner must supply (placeholders, not created)
| Id | Purpose | Notes |
|---|---|---|
| C1 | Customer owner of organization 1 | A confirmed Supabase Auth user (email + password known to the owner). Not staff. |
| C2 | Customer member of organization 1 (optional) | Exercises member-versus-owner and per-user carts |
| C3 | Customer owner of organization 2 (optional) | Exercises organization isolation (must not see organization 1) |
| A1 | Dedicated administrator | A NEW Auth user, not either validation account. Needs a TOTP authenticator for the owner. |

## 3. Records the identities need
| Record | Created by | Needs |
|---|---|---|
| R1 staff row, admin role, enrolment window, claimed TOTP factor for A1 | first-administrator bootstrap | a bootstrap tool (documented in `docs/P2-2-ADMIN-BOOTSTRAP-PROCEDURE.md`, **not present in `scripts/`**) and a TOTP enrol/challenge UI (**none exists**: sign-in is password only, so A1 can never reach the aal2 session the admin RPCs require) |
| R2 organization(s): code, name | `rpc_admin_org_create` (admin, fresh step-up) or provisioning script | R1 for the RPC path |
| R3 memberships C1/C2/C3 | `rpc_admin_org_member_add` or provisioning script | the Auth users must exist |
| R4 base price + floor per variant (a chosen subset) | `rpc_admin_variant_set_price` or provisioning script | a price list from the owner |
| R5 organization-product assignments | `rpc_admin_org_product_set` or provisioning script | R2, R4 |
| R6 markup rules (organization, optional representative) | `rpc_admin_markup_rule_set` or provisioning script | R2 |

## 4. Two provisioning paths
**Path A, through the product (preferred for Phase 2).** A1 signs in with MFA and uses the existing admin pages for R2-R6. Every change is validated by the database and audited. Engineering needed first: a TOTP enrolment and challenge UI (aal2 + step-up) and the bootstrap tool. Approvals: bootstrap write (staff row, role, window), then A1's own actions.

**Path B, one-time customer-side provisioning (fastest route to a real customer workflow).** A reviewed, hash-pinned provisioning script modelled on `apply-p3.mjs` (strict TLS, pinned CA, one transaction, rehearsal with rollback first, fresh-connection verification) inserts R2-R6 directly with the owner connection. Trade-offs: no audit rows, the RPC validations are bypassed (table constraints still apply), and it does not give A1 admin access (R1 still needs Path A). Approvals: the script design, a rehearsal, then a commit.

**Recommendation:** Path B for R2-R6 to verify the customer workflow immediately, and Path A (MFA UI + bootstrap) in parallel so the admin workflows are real. Do not use either until the owner approves.

## 5. Information needed from the owner
Emails (and the names) for C1, C2, C3 and A1; organization names and codes; which products to price first (suggest 10-20) and the base and floor price for each; the markup model for each organization (percent or fixed, optional representative rule and bounds).

## 6. What the real-browser verification will cover once R2-R6 exist
Sign in as C1; catalog shows only assigned products at the organization price with no cost data; add to cart; checkout with a ship-to address; the order appears in history with an immutable price snapshot; C2 sees the organization's orders but a separate cart; C3 cannot see organization 1's catalog or orders; re-submitting checkout does not duplicate the order. Admin steps (price and markup changes, order status, customer sees the new status) need A1 and R1.
