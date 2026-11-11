# P4 implementation plan: invoices, payments and wallet

Started 2026-11-11. Flow: customer places an order and gets an invoice; the customer owner reports a payment ("I've sent payment"); finance confirms or rejects it; the invoice moves to partially paid or paid. The wallet is built but locked.

## 1. Decisions taken from the existing specs (change any of them before the SQL is applied)
| Topic | Decision | Source |
|---|---|---|
| Invoice creation | One invoice per order, created in the same transaction as the order (checkout is replaced with the same signature). Orders that exist before P4 are backfilled; invoices of cancelled orders are void. | CUSTOMER-PORTAL-SPECIFICATION 2.3 |
| Payment methods | Manual: wire, Zelle, ACH, check, other. No card processor or payment provider in P4. | DATABASE-DESIGN 7.1 |
| Who reports | Organization **owner** only; members view. | CUSTOMER-PORTAL-SPECIFICATION section 7 |
| Who confirms | `payments.confirm` plus fresh step-up (finance, admin). Reject/duplicate: `payments.reconcile`. Void: `financial.write` plus step-up. Reads: `org.billing.read`. No new capabilities. | ADMIN-PORTAL-SPECIFICATION 3.8, 3.9 |
| Money rule | A customer report is a claim and never changes an invoice. Only the confirm RPC moves `paid_cents` (recomputed from confirmed payments under an invoice lock). No overpayment: confirmed amount is at most the remaining balance. | DATABASE-DESIGN 6 |
| Terms | `prepay` is due on receipt; `net30`, `net_15` etc. add days (default 30, maximum 365). | `organizations.payment_terms` |
| Cancelling an order | Voids its invoice only while unpaid. A paid or partly paid invoice stays (refunds are a later finance step). | this plan |
| Wallet | Tables and read/adjust RPCs exist; `platform_flags.wallet_enabled` is pinned to false by a table constraint until Gate G3 (legal/payment approval) is recorded. No customer top-up path. | DATABASE-DESIGN 7.1 |

## 2. Not in P4 (deliberately)
Refunds and reversing a confirmed payment; two-person approval above a limit; proof-of-payment uploads (needs storage); PDF invoices and email delivery; fee/adjustment lines (the line types are reserved); gating fulfillment on payment (P5); payment-instruction text from platform settings (P8). Each is listed in `ROADMAP.md` phases or `P10-BACKLOG.md`.

## 3. Milestones (each ships backend and frontend together)
| M | Deliverable | Files | State |
|---|---|---|---|
| M1 | status/payment/aging model, validation, safe messages, tests | `src/lib/portal/billing/{invoices,schemas,messages}.ts`, `tests/portal/billing.test.ts` | done |
| M2 | migration: tables, guards, RPCs, checkout update, backfill, wallet lock, self-check; static SQL tests | `supabase/migrations/20261111000100_p4_invoices_payments_wallet.sql` (copy of the draft in `supabase/review/p4/`), `tests/portal/billing-sql.test.ts` | done, **applied** |
| M3 | server data layer (typed RPC wrappers) | `src/lib/portal/billing/server.ts` | done |
| M4 | customer screens: unpaid-invoice banner and overview card, `/client/purchases` list and detail with "I've sent payment", `/client/billing` summary (wallet hidden), invoice on the order page | `src/app/(portal)/client/{page,purchases,billing,orders}/*` | done |
| M5 | admin screens: `/admin/invoices` (list, aging, detail, void), `/admin/invoices/payments` reconciliation queue (confirm, reject, duplicate) | `src/app/(portal)/admin/{invoices,billing-actions.ts}` | done |
| M6 | order screens show the invoice; authorization tests for the actions (`tests/portal/p4-billing-authz.test.ts`); typecheck, lint, build | | done (offline); database verification needs the apply approval |

## 4. Applying it
**Applied 2026-11-11** to the hosted development project (history 20261111000100) with `supabase/review/tests/apply-p4.mjs`: rehearsal (rolled back, 86 checks passed) then commit (117 checks passed, post-commit state re-verified). Browser verification of the flow is still to be done by the owner. Original wording follows.

The draft was **not** applied at the time of writing. Applying needs the project owner's explicit approval, as for P3: the dry run and the apply step name the exact file hash. The migration changes `rpc_checkout`, so after applying, the existing checkout flow must be re-verified in a browser.
