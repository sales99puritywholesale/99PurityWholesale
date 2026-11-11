# Supabase Environment Setup (dev / staging / production)

Status 2026-11-07: **No Supabase project has been created by this work.** There is no Supabase tooling or account access available to the assistant in this session, so project creation needs you. Nothing below contains real IDs or keys; placeholders are in `<angle brackets>`.

## 1. Rules
- Three **separate** Supabase projects (separate databases, keys, storage, auth users). Never share between environments.
- **Never** use Aspen's Supabase project, keys, data or migrations. Create fresh projects under your own organization.
- Secrets never go in git, in `NEXT_PUBLIC_*` variables, in chat, or in screenshots. If a key is ever pasted anywhere, rotate it.
- Production is created later and stays **empty and un-activated** during Milestone 1.

## 2. Create the development project (do this first)
1. Sign in at supabase.com → choose (or create) your own organization → **New project**.
2. Name: `99purity-portal-dev`. Choose a strong database password (store it in your password manager, not in the repo). Region: closest to your Vercel region and warehouse (US East is typical). Plan: free/pro both fine for dev.
3. When provisioned, open **Project Settings → API** and note:
   - Project URL → will be `NEXT_PUBLIC_SUPABASE_URL`.
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe for browsers only because RLS is enforced).
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY` (**server only**, never exposed to the client).
4. **Project Settings → API → Exposed schemas:** set to **`public` only** (do not expose `private`, `graphql_public` can be removed if unused). Extra search path: leave empty.
5. **Authentication → Providers → Email:** enable email + password; **disable "Allow new users to sign up"** (accounts are created only by our server after an invite or by an admin); enable "Confirm email". Enable **leaked password protection** and set minimum password length to 12 (Authentication → Policies / Password security, wording varies by dashboard version).
6. **Authentication → Multi-Factor:** enable **TOTP** (verify enabled for enrol and verify).
7. **Authentication → URL Configuration:**
   - Site URL (dev): `http://localhost:3000`.
   - Redirect URLs allow-list: `http://localhost:3000/auth/callback` and your Vercel preview pattern if used (`https://<project>-*.vercel.app/auth/callback`). No wildcards beyond that.
8. **Authentication → Emails / SMTP:** configure **custom SMTP** using your verified Resend domain (host/port/user from Resend; keep credentials in Supabase only). Edit templates later in M2 to carry 99 Purity wording that complies with `project-rules.md`.
9. **Authentication → Sessions:** JWT expiry 3600 s (default) is fine; set refresh-token reuse detection on; inactivity timeout optional (Pro).
10. **Database → Extensions:** enable `pgcrypto` and `pg_stat_statements` (default). Do **not** enable extensions we do not use.
11. **Storage:** no manual buckets; migration `0007_storage` will create them (`org-documents`, `platform-documents`, both private).
12. **Database → Backups / Replication:** note plan limits (PITR requires Pro; mandatory for production).
13. Send me nothing secret. To let me apply migrations I need only either (a) you run the SQL through the dashboard/CLI yourself, or (b) you export `SUPABASE_DB_URL` into your local shell environment (not the repo) for the CLI session.

## 3. Staging project
Same steps with name `99purity-portal-staging`; Site URL = your staging URL (for example a Vercel preview/staging domain you choose); separate keys. Prepared later for validation, not populated now. Add a Vercel environment scoped to **Preview/Staging** with these keys.

## 4. Production project
Name `99purity-portal-prod`; **Pro plan with PITR enabled**; Site URL = production domain; enable **network restrictions / SSL enforcement**; same auth settings; **do not** run migrations or create users in Milestone 1. Add the three variables only to Vercel's **Production** scope when you decide to activate.

## 5. Environment variables (names only)
| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | per environment |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | per environment; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | per environment; used only for narrow server tasks (create invited user, `submit_account_request`) |
| `PORTAL_ENVIRONMENT` | server | `development` / `staging` / `production` (guards destructive scripts) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | site key public, secret server | only if CAPTCHA decision D-M1-4 = yes |
| `PORTAL_AUDIT_IP_PEPPER` | server only | random 32+ bytes for hashing IPs |
Existing public-site variables (`RESEND_API_KEY`, `NOTIFICATION_EMAIL`, `SENDER_EMAIL`, `NEXT_PUBLIC_*`) are unchanged.
Local file: create `.env.local` (git-ignored) from `.env.example` (names only, committed). In Vercel: add variables per environment scope; mark service key and pepper as **Sensitive**.

## 6. Local development with the Supabase CLI
Prerequisites: Docker Desktop **running** (installed on this machine; daemon currently stopped), Node.
```
npx supabase init            # creates supabase/ config (no secrets)
npx supabase start           # local Postgres + Auth + Storage via Docker
npx supabase db reset        # applies migrations + seed
npx supabase test db         # pgTAP suites
npx supabase link --project-ref <dev-project-ref>   # you run this; needs your access token via `supabase login`
npx supabase db push         # applies migrations to dev project (after review)
```
The local stack gives deterministic test projects with throwaway keys, used by CI and by Vitest integration tests. CLI access tokens stay in your user profile, not in the repo.

## 7. First admin bootstrap (only after V5b has passed; see §9)
1. In dev **Authentication → Users**, create your own user (email confirmed).
2. Run `supabase/bootstrap/first-admin.sql` in the SQL editor (it inserts the user into `staff_members` and `staff_roles` as `admin`; the file takes your email as a parameter and contains no secrets).
3. Sign in and enrol TOTP; staff access works only at aal2.

## 8. Checklist before staging/production
- [ ] RLS-enabled and grants lint passes on the target project.
- [ ] Exposed schemas = `public` only.
- [ ] Sign-up disabled; MFA on; SMTP set; redirect URLs minimal.
- [ ] Backups/PITR on (prod).
- [ ] Service key present only in server env; rotated if ever exposed.
- [ ] `platform_flags` all false; no compliance gates recorded.
- [ ] V1–V5 (and V2b where applicable) recorded in `docs/M1-VALIDATION-RESULTS.md` with redacted claims and Supabase/GoTrue versions; structure guard check passing on the target project.

## 9. Validation prerequisites and sequence (approved)
Full procedure, scripts rules and pass/fail criteria: `docs/M1-VALIDATION-PLAN.md`. Summary of what the setup above must provide:
1. **Settings required for validation** (in addition to §2): TOTP **enrol enabled and verify enabled** (Authentication → Multi-Factor); sign-up disabled; two auto-confirmed throwaway users `v-test-a` and `v-test-b` created in the dashboard; exposed schemas `public` only. The service-role key is **not** needed for V1–V3 or V5a and must not be given to validation scripts against the hosted project.
2. **Variables for validation scripts (names only):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `V_TEST_EMAIL`, `V_TEST_PASSWORD`, `PORTAL_ENVIRONMENT=development`. Set them in the shell (password via `Read-Host -AsSecureString`) or in `.env.local`; never in `.env`, never in files committed to git.
3. **Sequence:** V5a, V1, V2 (V2b if V2 fails), V3 **before migration 0002** (V3 is a hard blocker); **V5b after 0002 and before 0004**; **V4 after 0004**; **V4 and V5b must pass before the remaining M1 implementation is accepted.** Migration 0001 is not blocked by these gates.
4. **Fail closed:** until V5b succeeds, staff access stays denied; the first-admin bootstrap (§7) refuses to run before V5b has passed. If `auth.mfa_factors` ever changes shape (for example after a Supabase upgrade), staff access is denied until the check passes again.
5. **Tooling for later steps:** Docker Desktop running and a pinned Supabase CLI (devDependency) are required from V5b onward, not for V1–V3 or V5a. Hosted dev is authoritative for V1–V3; the local stack is used for CI and the destructive/rolled-back V5b tests.
6. **Cleanup after validation:** delete the test TOTP factors and `v-test-*` users (or reset them), rotate their passwords, clear shell variables.
