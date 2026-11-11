# Demo mode (localhost client demonstration)

Demo mode lets the customer and admin portals run end to end on localhost **without any database change**. It is for demonstrations only. Nothing in it is a real transaction, payment, shipment or integration, and it can never be active in a production build.

## Run it
`npm run dev:demo` (optionally `npm run dev:demo -- -p 3111`). Open `http://localhost:3000/login` and pick a persona. The script sets `PORTAL_ENABLED=true` and `PORTAL_DEMO_MODE=true` for that process only; no environment file is read or written, and Supabase is not contacted. `npm run dev` is unchanged and keeps using the real sign-in.

## Personas (sign in with one click, no password)
| Persona | Role | Organization |
|---|---|---|
| Morgan Reyes | administrator | (staff) |
| Alex Carter | customer, owner | Northwind Wellness Distributors (NWD, percent markup 25 percent + representative 5 percent) |
| Sam Patel | customer, member | Northwind Wellness Distributors |
| Jordan Lee | customer, owner | Summit Lab Supply (SLS, fixed $4.50 markup, about two thirds of the catalog) |
| Riley Nguyen | customer, owner | Coastal Research Partners (CRP, 30 percent with a product-specific 12 percent rule, representative bounds, three categories) |

## Data
The full public catalog (153 products, 221 variants) with deterministic prices, three organizations, five demo users and three seeded orders (delivered, processing, placed). Stored in `.demo-data/portal-demo.json` (git-ignored); it survives refreshes and restarts, and both portals read the same file. "Reset demo data" on the sign-in page restores the seed.

## How it fits the code
* `src/lib/portal/demo/engine.ts` implements the same operations, result shapes and result codes as the P3 RPCs, on a `DemoStore`. Prices always come from the shared pricing model (`commerce/pricing.ts`); no caller supplies a price. Customer operations check organization membership; staff operations check the actor is a demo administrator.
* `src/lib/portal/commerce/server.ts` is the single switch: every public function runs the demo engine in demo mode and the database RPC otherwise. Pages and server actions are unchanged, so **replacing the demo with Supabase is automatic** once the P3 migration is applied (demo mode off).
* Demo sign-in replaces Supabase sign-in only in demo mode: `auth.ts` (user), `staff-access.ts` (administrator context), `middleware.ts` (session), the login page and the sign-out action.

## Guards
`isDemoMode()` requires `PORTAL_DEMO_MODE=true` **and** `NODE_ENV !== 'production'`; a production build ignores the flag (tested). The demo cookie is only honoured when demo mode is on. No service-role key and no secret is involved.

## Known limits (see the release backlog in `docs/P10-BACKLOG.md`)
Demo sign-in has no password or MFA by design. Payment status exists in the demo model only (no UI yet). The demo store is a single local file for one developer machine, not a multi-user database.
