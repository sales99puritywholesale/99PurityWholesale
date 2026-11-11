# Milestone 1: Validation Plan for V1–V5 (approved with conditions; revision 2)

Status 2026-11-07: **plan only.** Nothing here has been run. No migration, SQL file, validation script, dev-project connection, dependency install, code change or deployment exists. No secret appears in this file; variable names only. Design source: `MILESTONE-1-SCHEMA-AND-RLS.md` §5.3 and §5.12 (rev. 4).

## 1. What each check proves
| ID | Question | Why it matters |
|---|---|---|
| V5a | Does `auth.mfa_factors` expose `id`, `user_id`, `status`, `created_at` with expected status values? | The approved-factor backstop (§5.12) depends on it. |
| V1 | After sign-in + TOTP verify, does the token carry `aal2`, a TOTP `amr` entry with a timestamp, and a `session_id`? | `record_step_up()` reads exactly these claims; the exact method string must be known, not assumed. |
| V2 | Does a second challenge+verify followed by a refresh give a **newer** TOTP timestamp? | Distinguishes a real step-up from the first login. |
| V2b | **Fallback:** does a fresh sign-in give a new `session_id`, so an old session's step-up cannot authorize it, with MFA required before any step-up is recorded? | Gives a safe step-up mode if V2 fails. Recorded separately from V2. |
| V3 | Does an ordinary refresh leave an old TOTP timestamp unchanged? | **Hard blocker.** A refresh that freshens an old timestamp would let a stolen aal2 session pass the 60-second test. |
| V5b | Can a SECURITY DEFINER function with pinned `search_path` read `auth.mfa_factors`, and does staff access fail closed on any deviation? | The factor binding must never grant access because something unexpected happened. |
| V4 | Does `record_step_up()` reject stale, `aal1`, missing-claim and foreign-session tokens and write a DB-clock row only for fresh TOTP? | Enforces fail-closed step-up. |

## 2. Approved sequence: pre-migration gates versus post-migration acceptance tests
Checks that exercise Supabase Auth alone are **pre-migration gates**. Checks that need database objects are **post-migration acceptance tests**. This resolves the earlier circular dependency (V4 and V5b cannot run before the objects they test exist).
| Order | Check | Kind | Needs | Must pass before |
|---|---|---|---|---|
| 1 | **V5a** | pre-migration gate | dev project + one enrolled factor (read-only dashboard queries) | migration **0002** |
| 2 | **V1** | pre-migration gate | dev project, test user, TOTP on | migration **0002** |
| 3 | **V2** (and **V2b** if V2 fails) | pre-migration gate | same | migration **0002** |
| 4 | **V3** | pre-migration gate, **hard blocker** | same | migration **0002** (and step-up redesign before 0004 if it fails) |
| 5 | **V5b** | post-0002 acceptance test | migration 0002 on dev | migration **0004** |
| 6 | **V4** (incl. V2b binding cases) | post-0004 acceptance test | migrations 0001, 0002, 0004 | acceptance of the remaining M1 implementation |
Rules:
- **Migration 0001** (identity tables) has no MFA or step-up dependency and is **not blocked** by these gates.
- **V4 and V5b must both pass before the remaining M1 implementation is accepted** (0005–0009 and all RPC, auth, middleware and shell work that uses staff access or step-up).
- Nothing is promoted to staging until V1–V5 (and V2b where applicable) are recorded.
- Any gate failure stops the dependent migration (fail closed). Results go in `docs/M1-VALIDATION-RESULTS.md` (redacted; created when the first check is run).

## 3. Prerequisites per check
| | Dev project | Auth settings | Credentials | Local tooling | DB objects |
|---|---|---|---|---|---|
| V5a, V1, V2, V2b-claims, V3 | hosted | email+password on, sign-up **off**, TOTP enrol+verify on, confirmed test user | project URL, publishable/anon key, test user email+password | Node (present) | **none** |
| V5b | hosted and local | same | via migration tooling | pinned Supabase CLI, Docker | migration 0002 (`platform_validations`, structure check, `is_aal2()` guard) |
| V4, V2b-binding | local (and hosted dev) | same | test users with staff row and customer owner on the local stack | CLI, Docker, Vitest/pgTAP | migrations 0001, 0002, 0004 |

## 4. Checklist: what you must do
### 4.1 Supabase dashboard (project `99purity-portal-dev`, your own organization; never Aspen's)
- [ ] Create `99purity-portal-dev` (strong DB password in your password manager).
- [ ] Project Settings → API: note Project URL and the **publishable/anon key**. Do **not** copy the service-role key for these checks.
- [ ] Exposed schemas: `public` only.
- [ ] Authentication → Email: password sign-in on, **sign-up off**, confirm email on, minimum password 12, leaked-password protection on.
- [ ] Authentication → Multi-Factor: TOTP **enrol and verify both enabled**.
- [ ] Authentication → Users → add two auto-confirmed throwaway users `v-test-a` and `v-test-b` (mailbox you control; strong random passwords).
- [ ] URL configuration: Site URL `http://localhost:3000`; redirect `http://localhost:3000/auth/callback`.
- [ ] Note displayed Auth rate limits (MFA verify attempts are limited; keep runs short).
### 4.2 Local machine
Checked earlier (no changes made): Node v24.13.0 ✔, npm 11.6.2 ✔, git ✔, Docker installed ✔ but **daemon not running ✘**, **Supabase CLI not installed ✘**, no `@supabase/*`/Vitest/Playwright in `package.json`, no `.github/`.
- [ ] Start Docker Desktop (needed from V5b onward).
- [ ] Approve a **pinned** Supabase CLI devDependency when migrations are approved (not now).
- [ ] Keep any Supabase variables in `.env.local` (git-ignored, verified) or the shell, **not** `.env`.
### 4.3 Variables (names only)
| Variable | Needed for | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | V1–V3 | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | V1–V3 | public by design |
| `V_TEST_EMAIL`, `V_TEST_PASSWORD` | V1–V3 (user a) | **yes** (password) |
| `PORTAL_ENVIRONMENT=development` | scripts refuse to run otherwise | no |
| `SUPABASE_SERVICE_ROLE_KEY` | **not used** against hosted dev during validation; local stack only for V4/V5b user creation | yes |
| `SUPABASE_DB_URL` | applying migrations later (or you run SQL via dashboard) | yes; shell only |

## 5. Commands (run after the dev project exists)
PowerShell; the password is read without echo:
```powershell
cd D:\99puritywholesale-platform\99puritywholesale
$env:PORTAL_ENVIRONMENT            = "development"
$env:NEXT_PUBLIC_SUPABASE_URL      = "https://<your-dev-ref>.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<publishable-or-anon-key>"
$env:V_TEST_EMAIL                  = "<v-test-a email>"
$sec = Read-Host "Test user password" -AsSecureString
$env:V_TEST_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
```
After you approve and review it, the single validation script (not yet created) runs V1, V2, V2b-claims and V3 in one process and prints a redacted pass/fail table. V5a is two read-only queries you paste into the dashboard SQL editor (column list for `auth.mfa_factors` from `information_schema.columns`; and `id, user_id, factor_type, status, created_at` for the test user). Later steps (after migration approval): `docker info`; `npx supabase@<pinned> init|start|db reset|test db`; `npx vitest run --dir supabase/tests`; for hosted dev `login`, `link --project-ref <ref>`, `db push`.

## 6. Script-safety requirements (mandatory)
1. **No secrets in output or files:** never print or write access tokens, refresh tokens, passwords, API keys, TOTP seeds or enrolment URIs. The TOTP seed lives only in process memory and is never persisted; if the process dies, delete the factor in the dashboard and rerun.
2. **Redact `session_id`:** logs show only ordinal labels (`session#1`, `session#2`) and whether two sessions are equal or different. Also never print `sub`, email or any user identifier.
3. **Allow-listed claim output:** only `aal`, `amr[].method`, `amr[].timestamp` (printed as seconds relative to the verify event, plus absolute UTC time), `role`, and `exp`/`iat` as relative offsets. No raw JWT or response body is printed; errors print HTTP status and error code only; no debug or verbose flag.
4. **No new dependencies:** Node built-ins only (`fetch`, `node:crypto`); no changes to `package.json` or lockfiles.
5. **No application source changes:** the script lives outside the application tree (scratchpad), is not committed, and touches no repository file.
6. **Guard rails:** reads credentials from environment variables only; refuses to run unless `PORTAL_ENVIRONMENT=development` and the URL host is `*.supabase.co` or `localhost`; uses only the anon/publishable key; makes no writes except Auth calls for the test user; exits non-zero on any failure.
7. **Results file:** `docs/M1-VALIDATION-RESULTS.md` receives only the redacted table (check, pass/fail, observed method string, relative timestamps, step-up mode, Supabase/GoTrue versions, date). You review the script before its first run.

## 7. Steps and pass/fail criteria
### 7.1 Setup gate
All of §4.1 done; `v-test-a` can sign in with a password. Pass: session returned, token `aal1`. Fail: fix project settings first.

### 7.2 V5a: shape of `auth.mfa_factors` (pre-migration; read-only, run by you after V1 enrols a factor)
- **Pass:** columns `id`, `user_id`, `status`, `created_at` exist; `status` is `unverified` after enrol and `verified` after verify; `created_at` is near the enrol time.
- **Fail:** missing or renamed column or different status values ⇒ stop; redesign the §5.12 backstop before migration 0002.

### 7.3 V1: claims after sign-in and verify (pre-migration)
Steps: password sign-in; decode; enrol TOTP; challenge + verify with a code derived from the enrolment secret; refresh; decode.
- **Pass:** before verify `aal1`, password `amr` entry with numeric timestamp, `session_id` present; after verify and refresh `aal2`, a TOTP `amr` entry with numeric timestamp within ±5 s of the verify, `session_id` present. Record the exact method string and entry order.
- **Fail:** `amr`, timestamp, `session_id` or `aal` missing ⇒ `record_step_up()` cannot work as designed; stop and revisit §5.3. A method string other than `totp` is recorded and the spec updated; it is not a failure.

### 7.4 V2: re-verify advances the timestamp (pre-migration)
Steps: wait for the next 30-second code window, challenge + verify again, refresh, decode.
- **Pass:** TOTP timestamp strictly newer than V1's (≥ 25 s) and within ±5 s of the second verify ⇒ step-up mode **`reverify`**.
- **Fail:** timestamp unchanged ⇒ record **V2 = FAIL** and run V2b. V2 is never edited to "pass" because V2b passes.

### 7.5 V2b: fresh-sign-in fallback (separate test; mandatory if V2 fails, recommended otherwise)
Recorded as its own result line, separate from V2.
- **V2b-claims (pre-migration):** a new password sign-in (new session) yields (i) a `session_id` different from the earlier session's (compare only as equal/different), (ii) `aal1` with no TOTP `amr` entry, (iii) `aal2` and a fresh TOTP entry only after its own challenge + verify. **Pass:** all three. **Fail:** same `session_id`, or aal2 without MFA ⇒ stop.
- **V2b-binding (post-0004, part of V4):** a step-up row recorded for the previous session does **not** satisfy `has_recent_step_up()` for the new session; `record_step_up()` rejects the new session while it is still `aal1` (MFA required before a step-up can be recorded). **Pass:** both. **Fail:** 0004 does not proceed.
- **Outcome matrix:** V2 pass ⇒ mode `reverify`. V2 fail + V2b pass ⇒ mode **`fresh_session`** (UI forces a new sign-in for step-up; design remains fail-closed). V2 fail + V2b fail ⇒ stop and redesign.

### 7.6 V3: refresh must not freshen an old timestamp (**hard blocker**)
Steps: wait ≥ 60 s with no verify; refresh (always using the latest refresh token); decode; repeat once; sign out and confirm the old refresh token no longer works.
- **Pass:** TOTP timestamp identical to the last real verify (or the entry is absent), `aal` still `aal2`, never newer than the last verify; sign-out invalidates the refresh token.
- **Fail (hard blocker):** if an ordinary refresh makes an old TOTP timestamp appear fresh, **stop and redesign step-up before migration 0004** (for example a server-side one-time nonce established by a challenge + verify, or a mandatory new session) and obtain re-approval. Because V3 is a pre-0002 gate, the migration sequence halts here (0001 may proceed). The 60-second rule is never weakened and aal2 alone is never accepted.

### 7.7 V5b: definer read and fail-closed structure guard (post-0002, before 0004)
Acceptance tests inside migration 0002 (design: §5.12 "Fail-closed structure guard"):
- **Pass:** (T-V5B-1) a definer function with `search_path = ''` reads the caller's own factors on hosted dev and local; (T-V5B-2) unprivileged roles cannot read `auth.mfa_factors`; (T-V5B-3, local only, rolled back) revoking the definer's access makes `is_aal2()` false and records `failed` with SQLSTATE and no data; (T-V5B-4, local only, rolled back) renaming a column makes the check fail with expected/observed **column names** and `is_aal2()` false; (T-V5B-5) an absent or stale validation row denies all staff; (T-V5B-6) no diagnostic contains ids or secrets.
- **Safe diagnostics recorded:** check name, status, SQLSTATE, expected vs observed column names, server version, timestamp. Nothing else.
- **Fail:** any unexpected structure or access error leaves **staff access denied** (it must never grant), 0004 does not proceed, and `first-admin.sql` refuses to run until the check passes.

### 7.8 V4: `record_step_up()` behavior (post-0004)
Cases: fresh TOTP token ⇒ row with DB-clock `verified_at`; TOTP timestamp older than 60 s ⇒ rejected, no row; `aal1` token ⇒ rejected; token missing `amr` or `session_id` ⇒ rejected; token from another session ⇒ `has_recent_step_up()` false; 14:59 passes and 15:01 fails (rows aged by the privileged harness); customer owner and staff supported; non-owner customer rejected; V2b-binding cases (§7.5).
- **Pass:** all cases behave as listed; no rows on rejection; audit event on success. **Fail:** any permissive case ⇒ remaining M1 implementation is not accepted.

### 7.9 Overall sign-off
V5a, V1, V2 (and V2b where applicable), V3 recorded before 0002; V5b before 0004; V4 after 0004; **V4 and V5b both pass before the remaining M1 implementation is accepted.** Re-run V5 in CI after any Supabase upgrade (structure guard also does this on a schedule).

## 8. Cleanup after validation
Delete the test TOTP factors and `v-test-*` users in dev (or reset them); rotate their passwords; clear shell variables (`Remove-Item Env:V_TEST_PASSWORD`, etc.); confirm `git status` shows no secrets or script output in the repository.

## 9. Remaining blockers and assumptions
- **Blockers (you):** the dev project, test users and dashboard settings (§4.1); Docker daemon and CLI from V5b onward.
- **Assumptions:** hosted GoTrue is authoritative for V1–V3 (local may differ); `amr` and `session_id` exist as documented; Auth rate limits allow the few MFA calls; the publishable-key format works with the REST calls (sent as `apikey` plus the user JWT as `Authorization`); `pg_cron` is available for the structure-check schedule.
- **Not required for V1–V5:** Resend/SMTP, Turnstile keys, the service-role key on hosted dev, staging or production projects.
