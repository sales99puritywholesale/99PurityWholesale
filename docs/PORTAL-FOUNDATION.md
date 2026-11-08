# Portal foundation (P1)

Status: implemented on `feature/portal-foundation`. **Authentication and layouts only: no database, no business data, no organization or staff concepts.** Language: English only (text is centralized so EN/ES can be added later). The public website is unchanged.

## 1. What exists
| Area | Implementation |
|---|---|
| Feature flag | `PORTAL_ENABLED` must be exactly `true`. Any other value (or none) returns **404** for every portal path, from the middleware and again from the root layout, pages, actions and the callback route. |
| Authentication | Supabase Auth, email and password, on the server. Session cookies are httpOnly, SameSite=Lax, Secure in production. Session refresh in the middleware (the documented `@supabase/ssr` pattern) with refreshed cookies forwarded to the page render. |
| Authorization | Customer area: any signed-in user sees an **empty shell** (no data). `/admin`: **denied to everyone** (`authorizeAdmin()` is a hard deny; middleware answers 403; layout and every page also deny). No `user_metadata`, `app_metadata` or email-domain shortcut exists anywhere. |
| Defence in depth | Middleware (one layer) plus a server re-check in every layout, page, server action and route handler. Layouts do not protect child pages in the App Router, so each page checks itself. `/api/*` is outside the middleware matcher and must authenticate on its own. |
| Headers | Portal responses: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, a per-request **nonce-based Content-Security-Policy** (middleware), plus the frame/sniff/referrer headers from `next.config.mjs`. Service-worker `NetworkOnly` rule for portal paths. Public-site headers are untouched. |
| UI | Light canvas, dark sidebar, 99 Purity accent; Rajdhani (headings), DM Sans (body), DM Mono (identifiers) via `next/font` with portal-only CSS variables; portal stylesheet separate from the public `globals.css`. |

## 2. Directory structure
```
src/
  app/(portal)/            own root layout (<html>), portal.css, error/loading/not-found
    login/                 page + server action
    auth/callback/         PKCE route handler; auth/actions.ts (sign out)
    client/                layout (auth guard) + 12 pages
    admin/                 layout (denies everyone) + 13 pages
  components/portal/       shell, sidebar, topbar, mobile nav, account menu, card, table, status pill, empty/loading/error states
  lib/portal/              paths, config (flag + env validation), validation (zod + safe redirect), route-policy, csp, copy, nav, auth (server-only)
  portal/db/               server.ts, browser.ts, middleware.ts, cookie-options.ts (Supabase clients, public key only)
  middleware.ts            public next-intl branch + portal branch
tests/portal/              Vitest unit tests
tsconfig.portal.json       strict type-check scope for portal code
vitest.config.mts
```

## 3. Authentication flow
1. A request for `/client/...` or `/admin/...` reaches the middleware. Portal off: 404. Authentication not configured: 503 (no details).
2. The middleware refreshes the session and verifies the user with the auth server (`getUser`, never trusting the cookie alone). No session: redirect to `/login?next=<original path>`.
3. `/login` posts to a server action: zod validation, `signInWithPassword`, then a redirect to a **validated** destination (`safeRedirectPath`: same-origin, `/client` or `/admin` only, no schemes, backslashes, control characters or encoded tricks). Every credential failure gives one generic message; the provider's 429 maps to a rate-limit message. The password is never logged or echoed.
4. Server components and actions call `requireUser()` (cached per request), which re-verifies the user.
5. Sign out is a server action: revokes the session and clears cookies.
6. `/auth/callback` performs the PKCE `exchangeCodeForSession` (for future magic-link or recovery flows). It cannot be used as an open redirect.
There is no sign-up route. Accounts come from invitations or approved applications in later milestones.

## 4. Routes
**Customer** (all require a signed-in user; static empty states): `/client` (Overview, clearly marked "not connected"), `/client/shop`, `/client/orders`, `/client/purchases` (Invoices & Payments), `/client/billing`, `/client/account`, `/client/certificates`, `/client/stock` (Inventory), `/client/commissions`, `/client/fulfillment/setup`, `/client/api-keys`, `/client/docs` (API Docs). Order and labels follow the observed US Wholesale Peptides sidebar.
**Admin** (proposed modules, not observed; **all denied in P1**): `/admin`, `/admin/applications`, `/admin/organizations`, `/admin/customers`, `/admin/products`, `/admin/pricing`, `/admin/orders`, `/admin/invoices`, `/admin/fulfillment`, `/admin/inventory`, `/admin/integrations`, `/admin/reports`, `/admin/settings`.
**Auth:** `/login`, `/auth/callback`.

## 5. Environment variables (names only; never commit values)
| Name | Where | Notes |
|---|---|---|
| `PORTAL_ENABLED` | server | exactly `true` to enable; unset on production until approved |
| `NEXT_PUBLIC_SUPABASE_URL` | public | the project origin (https; http only for localhost) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | the publishable (anon) key; the portal **rejects** a service-role or `sb_secret_` key supplied here |
The service-role key is not used by the portal in P1. See `.env.example`. Supabase client libraries require **Node 22 or newer** on the deployment (the supabase-js engines field).

## 6. Quality gates
```
npm run check:portal      # strict tsc (tsconfig.portal.json) + eslint (max-warnings 0) + vitest
```
Unit tests cover navigation (order, slugs, real route files), safe-redirect validation, the feature flag and configuration (fail closed), the routing decision matrix, the middleware (flag, 503, redirects, 403, CSP/nonce, no-store, cookie propagation), the server auth guards and actions (mocked auth client), the callback route, and public-site regression (no route collisions, matcher unchanged, headers scoped, robots/sitemap, import boundaries, no analytics or marketing code in the portal). **Not covered by tests:** a real sign-in against Supabase, browser rendering, accessibility audits and visual regression. The public build keeps its pre-existing `ignoreBuildErrors` setting; portal code is held to the strict gate above.

## 7. Known limits (by design, resolved in later milestones)
No rate limiting of the sign-in action beyond the auth provider's own; no MFA; no organization or staff authorization (P2); no Spanish; the CSP keeps `'unsafe-inline'` for styles only; placeholder pages show no data.
