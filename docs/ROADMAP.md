# Roadmap

Updated 2026-11-11 (P3 completed; earlier on 2026-11-10 the project owner decided to defer the remaining P2 security work to P10 and start P3). This file is the single roadmap; older documents that mention "milestones" use the earlier numbering and are historical.

| Phase | Scope | Status |
|---|---|---|
| P1 | Authentication and portal foundation | **Completed** |
| P2 | Organization, permissions and security foundations | **Core foundation established** (identity, organizations, staff roles and capabilities, audit log, step-up, staff-management RPCs: migrations 0001 to 0004 are applied on the hosted development project). Remaining comprehensive security work is **deferred to P10** (see `P10-BACKLOG.md`). |
| P3 | Catalog, pricing, cart and orders | **Completed** (2026-11-11, marked by the project owner). Applied to the hosted development project; dev fixtures and the first admin are provisioned; the core path (customer order, admin confirmation) was verified in a real browser. Plan: `P3-IMPLEMENTATION-PLAN.md`. The owner will test the remaining admin screens (pricing, products, step-up), order status transitions and a second organization themselves. |
| P4 | Invoices, payments and wallet | **In progress** (started 2026-11-11). Code complete and the migration is APPLIED to the hosted development project (2026-11-11, `supabase/migrations/20261111000100_p4_invoices_payments_wallet.sql`). The owner still has to verify the flow in a browser (order, invoice, report payment, finance confirmation) before P4 is marked complete. Plan: `P4-IMPLEMENTATION-PLAN.md`. |
| P5 | Fulfillment onboarding | **Code complete, APPLIED to dev 2026-11-11 (manual testing pending)** (2026-11-11): nine-step engine, documents/storage, products, labels, packaging, store, agreement, setup invoices, funding, gates, go-live. Migration draft in `supabase/review/p5/`. Plan: `P5-P9-BUILD-PLAN.md`. |
| P6 | API keys, documentation, webhooks and sandbox | **Code complete, APPLIED to dev 2026-11-11 (manual testing pending)** (2026-11-11): hashed API keys, idempotent sandbox order intake, signed webhooks with retries, docs and admin screens. Migration draft in `supabase/review/p6/`. |
| P7 | Inventory and warehouse | **Code complete, APPLIED to dev 2026-11-11 (manual testing pending)** (2026-11-11): warehouses and locations, lots, ledger, receiving, FEFO allocation, shipments with tracking, exceptions. Migration draft in `supabase/review/p7/`. |
| P8 | Admin operations and management | **Code complete, APPLIED to dev 2026-11-11 (manual testing pending)** (2026-11-11): dashboard and finance KPIs, organizations, applications, customers, staff, audit log, settings and fee schedule, customer account. Migration draft in `supabase/review/p8/`. |
| P9 | Certificates, commissions, notifications and reporting | **Code complete, APPLIED to dev 2026-11-11 (manual testing pending)** (2026-11-11): certificates of analysis (lots and orders, customer download, staff publish and withdraw), referral commissions (plans, codes, append-only ledger accrued from paid invoices after a 14-day hold, manual payouts), e-mail notification templates, preferences and outbox (no provider wired), and reports (sales, receivables, inventory, commissions) with CSV export. Migration draft in `supabase/review/p9/`. |
| P10 | Comprehensive security review, owner MFA/recovery migration validation, penetration testing, hardening and production readiness | Planned (receives the deferred P2 work) |

## Rules for P3 to P9
- Fast, incremental delivery: backend and frontend of a feature ship together; no UI-only placeholders; no review-only design documents.
- Reuse the P1/P2 architecture (portal shell, `requireUser`, the staff context and capability evaluation, RPC-first mutations, `private.write_audit`); do not redesign authentication or permissions.
- Each feature carries baseline tenant isolation (`organization_id` + RLS or RPC membership checks), server-side authorization, validation and essential tests. Comprehensive security testing is P10.
- Server-authoritative pricing and money as integer cents (`project-rules.md`). The public marketing site and its routes stay untouched.
- Nothing is applied to a database, committed, pushed or deployed without explicit approval; new SQL lives as a draft under `supabase/review/` until the project owner approves applying it.
