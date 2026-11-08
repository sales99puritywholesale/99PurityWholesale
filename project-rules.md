# 99 Purity Wholesale — Wholesale B2B Site Rules

## Ads Compliance (CRITICAL — never violate)
- NEVER use: treats, cures, clinical use, injection, patient, prescription
- ALWAYS use: research-grade, laboratory use, licensed professionals, 
  analytical standards, bulk supply for licensed facilities
- Every product page must include research-use disclaimer
- No before/after imagery anywhere
- No claims about weight loss, muscle growth, anti-aging results

## Brand
- Colors: #090C11 bg, #4FC3D0 teal accent, #EDF2F7 text
- Fonts: Rajdhani (headings), DM Sans (body), DM Mono (specs/numbers)
- Tone: professional, B2B pharmaceutical supplier — NOT consumer wellness

## Tech
- Framework: Next.js 14 App Router, TypeScript, Tailwind CSS
- i18n: next-intl, EN + ES
- Public website: No cart, no checkout, no payment processing (unchanged; the authenticated portal is governed by the "Authenticated Portal" section below)
- Public website: Contact CTAs: WhatsApp and Email ONLY
- WhatsApp number: [your number here]

## Contact
- WhatsApp CTA: floating button all pages, bottom-right
- Pre-filled message for product inquiries
- Email as secondary CTA

## Authenticated Portal (scoped amendment, approved 2026-11-07)
This section applies ONLY to the authenticated customer portal (`/client/*`) and admin portal (`/admin/*`), plus their auth routes (`/login`, `/auth/*`). Everything above remains in force for the public website and is not weakened by this section.

### Scope
- Authenticated wholesale and fulfillment functionality is permitted under `/client` and `/admin`: wholesale pricing, carts, orders, invoices, payment records, inventory, fulfillment, certificates, integrations.
- The public website (all `[locale]` routes, EN/ES) stays free of carts, checkout, prices and payment processing. No portal feature, price or account UI may be reachable or indexable from public pages except a plain login link.
- The Ads Compliance rules (banned and required wording, research-use disclaimer, no before/after imagery, no outcome claims) and the Brand rules apply to portal copy too.
- Portal pages are `noindex`, excluded from robots/sitemap, never cached by the service worker or CDN, and load no analytics (GA, Clarity) or marketing widgets (WhatsApp button).

### Mandatory engineering rules
- **Server-authoritative pricing:** prices, quantities-breaks, fees and totals are computed only on the server (database functions). The browser never supplies or calculates trusted prices or totals. Historical order prices are immutable.
- **Server-side authorization:** every action is authorized on the server and in the database. UI hiding is never a security control.
- **Tenant isolation:** every tenant-owned row carries `organization_id` and is protected by Row Level Security. Cross-organization access must be impossible and covered by automated tests.
- **Database-enforced security:** RLS on every table, security-definer functions with pinned `search_path`, constraints and triggers for invariants. Staff roles and feature flags cannot be changed through customer-writable paths.
- **Money and ledgers:** money is integer cents. Financial and inventory ledgers are append-only. Payment status is never editable by customers.
- **Secrets:** service-role keys, API secrets and webhook secrets exist only in server-side environment variables and are never committed or exposed to client code.
- **Audit:** security-relevant and financial actions write to an immutable audit log.

### Disabled until approval gates are satisfied
The following stay OFF (database feature flags enforced server-side and in SQL) until the corresponding gate in `docs/SECURITY-ASSESSMENT.md` is recorded by an ADMIN staff member (MFA step-up required; there is no separate super-admin role in Milestone 1):
- Real payment processing (card/ACH) and wallet / stored-value deposits (Gate G3).
- Live fulfillment and live shipments (Gates G1, G2, G4, G5, G6).
- Live customer API keys (Gate G6).
Only sandbox/test operation is allowed while a gate is open. Manual invoice payment records (wire/Zelle reported by customer, confirmed by staff) are allowed.

### Process
- Portal code lives outside the public `[locale]` tree and must not import from public-site-only modules, and public code must not import portal code.
- Portal code must pass `tsc` and lint in CI. Public code is held to the pre-existing baseline until separately cleaned up.
