# Recommended Architecture

Audit date: 2026-11-07. Proposal only. Nothing here has been implemented.

## 1. Starting point (verified)
- Next.js 14.2.35 App Router, React 18, TypeScript, Tailwind 3.4, next-intl 4 (`localePrefix: as-needed`, EN unprefixed, ES at `/es`), next-pwa, Resend.
- The root layout is a passthrough. The only `<html>` lives in `src/app/[locale]/layout.tsx`, which also injects Header, Footer, WhatsApp button, CartDrawer, GA and Clarity, with `revalidate = 172800` (ISR).
- `src/middleware.ts` is next-intl only; its matcher excludes `api`, `_next`, and dotted paths. It would rewrite `/client/x` to `/en/client/x`.
- No database, auth, orders or tests. No `/client` or `/admin` route exists, so there is no literal path conflict.
- `next.config.mjs:15-16` disables type and lint failure in builds (`ignoreBuildErrors`, `ignoreDuringBuilds`).
- `project-rules.md` forbids cart, checkout and payments and requires "research use" language. **A portal contradicts those rules; they must be formally amended** (decision D1 below).

## 2. Core decision: one repo, two app surfaces
Keep the public site exactly as is. Add the portals as a separate route-group tree that shares the repo, deployment and design tokens but **not** the layout, middleware, caching or i18n of the marketing site.

```
src/app/
  [locale]/...            existing public site (untouched)
  (portal)/
    layout.tsx            NEW root layout: own <html>, no marketing header/footer/WhatsApp/GA
    client/               /client/* customer portal
    admin/                /admin/*  admin portal
    login/ , auth/        sign-in, callbacks (names TBD)
  api/
    og/                   existing
    portal/...            NEW route handlers (webhooks, public API v1)
```
Route groups with two root layouts is supported by App Router; each root layout needs its own `<html>`. Because `src/app/layout.tsx` is currently a passthrough, adding `(portal)/layout.tsx` as a root layout is compatible. **Must be verified in a throwaway branch before committing** (risk R1).

Required changes to shared infrastructure:
1. **Middleware:** extend the matcher to exclude `/client`, `/admin`, `/login`, `/auth` from next-intl, and add a second branch that refreshes the auth session and redirects unauthenticated users. Do not apply locale rewriting to portal paths.
2. **Rendering:** portal pages `export const dynamic = 'force-dynamic'`; never ISR.
3. **PWA:** next-pwa registers a service worker at scope `/`. Exclude `/client`, `/admin`, `/api` from runtime caching, otherwise authenticated pages and financial data can be cached. Consider disabling the PWA for the portal scope entirely.
4. **SEO:** add `/client`, `/admin`, `/login`, `/auth` to `robots.ts` disallow and set `noindex` metadata in the portal layout.
5. **Analytics:** do not load GA/Clarity in the portal (it contains financial and customer data), or load with masking only.
6. **Language:** portal is English-only at first; keep the portal outside next-intl to avoid prefix rewriting.

## 3. Data and auth backend
Recommendation: **a new, separate Supabase project** (Postgres + Auth + Storage), because (a) Aspen's SQL is Supabase/RLS-native and is the main reusable asset, (b) it satisfies "complete separation of customer data and credentials", (c) no ORM is needed. Alternatives (Neon + Auth.js + Drizzle) are workable but discard most of Aspen's reuse value. See decision D2.

Principles:
- **Server-side authority.** The browser may read through RLS; every financial or inventory mutation goes through a server route handler / server action that calls a SECURITY DEFINER RPC. No money, status or stock write from client code. (Aspen's wholesale checkout violates this; we must not copy it.)
- **Secrets only on the server.** Service-role key, Resend key, webhook signing secrets, API-key pepper: server env only, never `NEXT_PUBLIC_*`. Add `import 'server-only'` to modules using them.
- **Tenancy key:** every tenant row carries `organization_id`; RLS uses a `private.is_org_member(org_id)` helper.
- **Ledgers, not balances.** Wallet, commissions, inventory and payments are append-only tables; balances are derived/views or trigger-maintained and reconciled.
- **Money:** integer cents (`bigint`) plus currency; never floats.

## 4. Module layout (code)
```
src/portal/
  auth/            session helpers, role guards (server)
  db/              typed Supabase clients (browser, server, service)  [service client is server-only]
  modules/
    catalog/  pricing/  orders/  invoices/  payments/  wallet/  billing/
    organizations/  inventory/  certificates/  commissions/  fulfillment/
    api-keys/  integrations/  audit/  notifications/
  ui/              portal design system (tokens reproducing USW look: navy sidebar, gold pills)
```
Each module owns: SQL migration(s), server actions, route handlers, queries, components, tests. Public-site code must not import from `src/portal`.

## 5. Target routes and conflict check
| Proposed | Conflict check | Note |
|---|---|---|
| `/client`, `/client/shop`, `/client/orders`, `/client/billing`, `/client/account`, `/client/certificates`, `/client/commissions`, `/client/docs`, `/client/api-keys` | None | |
| `/client/purchases` | None | USW uses this slug for "Invoices & payments" (inferred from nav). Fine |
| `/client/stock` | None | USW slug for "Inventory" |
| `/client/fulfillment/setup` | None | |
| `/admin/*` (13 proposed) | None | Must be separately gated; never reachable by customer sessions |
| `/login`, `/auth/*` | Need to confirm no marketing slug `login` exists in `[locale]` | Check at implementation |
| `/es/client` | Would not be matched by the portal; middleware must 404 or redirect it | Edge case |
| Existing catch-alls under `[locale]` | Verify none shadows `(portal)` | Static folders win over dynamic segments, but confirm |

## 6. Cross-cutting services
- **Email:** reuse Resend; move to a verified domain sender (currently falls back to `onboarding@resend.dev`). Add an outbox table + a deployed dispatcher (Vercel cron / Supabase scheduled function). Aspen's dispatcher is a local script only.
- **Files:** Supabase Storage private buckets: `certificates`, `invoices`, `agreements`, `labels`, `proofs`; access via short-lived signed URLs after an RLS check.
- **Payments:** manual wire/Zelle first (matches USW evidence): admin confirms; customer "I've sent payment" is only a claim. Card/ACH provider deferred (D5).
- **Public API & webhooks:** `/api/portal/v1/...` with hashed API keys (store only a hash + prefix), per-key scopes, rate limit, HMAC-signed outbound webhooks with retry table. Test/live key separation as USW shows ("sandbox orders only").
- **Observability:** structured server logs, audit table, error tracking (choose later).
- **Testing:** add Vitest for pure logic, SQL tests (pgTAP or the pattern in Aspen's `supabase/proposed/*.tests.sql`) for RLS/ledger, Playwright for core flows. CI must run `tsc --noEmit` and lint; **remove `ignoreBuildErrors` for portal code** (or globally once existing errors are fixed).
- **Environments:** separate Supabase projects for dev/staging/prod; never reuse Aspen's project or keys.

## 7. Deployment
Vercel is the likely host (inferred; no config in repo). Keep one Vercel project, add portal env vars, protect `/admin` with additional controls (MFA required; optional IP allow-list). Cron endpoints require a secret header.

## 8. Risks
- R1: Two root layouts + next-intl middleware interplay; PWA caching; mitigated by a spike branch.
- R2: Rule conflict with `project-rules.md` (no cart/checkout/prices) and the plan's `noindex` for price pages (not implemented today).
- R3: Compliance exposure of selling research peptides online with accounts and payments: business/legal decision outside this audit.
- R4: Build currently hides type errors; the local `node_modules` was corrupt during the Milestone 0 audit (empty `typescript` folder), so `tsc` could not run then. **Corrected in Milestone 1:** after restoring dependencies from `pnpm-lock.yaml` the public-site baseline is **2 TypeScript errors** (both in `src/hooks/useNestedSmoothScroll.ts`: missing `@studio-freight/lenis` module, plus a consequent implicit `any`) and **0 ESLint errors**. Note `package-lock.json` is out of sync with `package.json` (webpack and dependencies missing from the lock), so `npm ci` fails; `pnpm install --frozen-lockfile` works.

## 9. Revision 2 (2026-11-07): verified structure and updated design

### 9.1 Verified current structure (inspected before proposing change)
- `src/app/layout.tsx` is a pure passthrough (`return children`). The only `<html>` is in `src/app/[locale]/layout.tsx`. Therefore **any route outside `[locale]` needs its own layout containing `<html>` and `<body>`**. This is a framework requirement, not an optional redesign. `src/app/not-found.tsx` also sits at the root; confirm it renders valid markup during the spike.
- `src/middleware.ts` is `createMiddleware(routing)` only, with matcher `'/((?!api|_next|_vercel|.*\\..*).*)'`. It would locale-rewrite `/client/*` and `/admin/*`.
- `src/app/robots.ts` has **two** rule blocks (`*` and the AI crawlers); both need portal disallows. `src/app/sitemap.ts` must not list portal URLs.
- `next.config.mjs` wraps the config as `withPWA(withNextIntl(...))`; `public/sw.js` and `workbox-*.js` are generated service-worker files; PWA is disabled only in development.
- `src/app/actions/formActions.ts` holds the only server actions; `src/app/api/og` is the only API route.

### 9.2 Least-change portal integration
Preferred: add `src/app/(portal)/layout.tsx` (own `<html>`), with `client/`, `admin/`, `login/`, `auth/` beneath; exclude those prefixes in the middleware matcher and add an auth-aware branch; leave `[locale]` untouched.
Fallback if the spike shows a conflict between two root layouts and next-intl: serve the portal from a dedicated host (for example `app.<domain>`) in the same Next project via host-based rewrites, keeping the `/client` and `/admin` paths from the spec on that host. The decision is made after the M1 spike; both options leave public pages unchanged.

### 9.3 Added subsystems
- **Server layer:** portal business logic in Postgres RPCs; thin Next server actions and route handlers; Node runtime for webhook dispatch and the API; `import 'server-only'` guard for service clients.
- **Background processing:** transactional outbox + scheduled workers (Vercel Cron and/or Supabase scheduled functions), `FOR UPDATE SKIP LOCKED`, idempotent jobs, attempt logging, dead-letter handling. Jobs: email dispatch, webhook delivery, carrier tracking sync, reconciliation (ledger, wallet, inventory), invoice aging, certificate availability, sandbox purge.
- **Storage:** private buckets (`certificates`, `invoices`, `agreements`, `labels`, `label-proofs`, `payment-proofs`, `resale-certs`, `receiving-docs`), path prefix `org/<id>/`, size and MIME limits, signed URLs.
- **Observability:** structured logs with request id, error tracking service (chosen in M1), uptime checks, queue-depth and webhook-failure alerts, database metrics.
- **Rate limiting:** edge/middleware limiter for auth and the public API, per-key limits in the API layer.
- **Backups:** Supabase point-in-time recovery on production, scheduled logical dumps to separate storage, quarterly restore drill, documented RPO/RTO.
- **Feature flags** (`platform_flags`, ADMIN capability `flags.write` with MFA step-up; no separate super-admin role in M1): `wallet_enabled=false`, `live_fulfillment_enabled=false`, `api_live_keys_enabled=false`, `commissions_enabled`.

### 9.4 Module map additions
`src/portal/modules/`: add `onboarding`, `fulfillment` (orders, warehouse, shipping, returns), `integrations` (api, webhooks, adapters, sandbox), `finance` (ledger, invoices, payments, reconciliation, wallet-dark) and `compliance` (gates). Customer and admin UIs share domain modules; UI trees are separate (`src/portal/ui/customer`, `src/portal/ui/admin`).

### 9.5 Detailed screens and flows
See CUSTOMER-PORTAL-SPECIFICATION.md, ADMIN-PORTAL-SPECIFICATION.md, FULFILLMENT-WORKFLOW.md and INTEGRATION-ARCHITECTURE.md.
