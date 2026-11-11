# P2.1 scratch project and database test harness

**Superseded for now (2026-11-09) by [P2-1-LOCAL-STACK.md](P2-1-LOCAL-STACK.md)** (Docker Desktop + Supabase local stack). Kept for a later hosted scratch run.

Status 2026-11-08: **harness written; nothing has connected to any project.** The existing `99purity-portal-dev` project is never used by this harness and must not be touched without separate approval.

## 1. What the harness is
`tests/db/` runs real PostgreSQL sessions (and real GoTrue/PostgREST requests) against ONE hosted Supabase **scratch** project. It uses Node's built-in `node:test` runner plus the `pg` package (approval pending, see section 6). No test is mocked.

| File | Purpose |
|---|---|
| `guard.test.mjs` | Pure unit tests of the connection guard and the migration change control. **Runs without any project.** |
| `lib/config.mjs` | The guard: host/ref allow-list, explicit confirmation, session mode, key-type checks, no values in errors |
| `lib/db.mjs` | Guarded connection (marker schema and PostgreSQL major are verified on every connect), fixtures, rollback and concurrency helpers |
| `apply-migrations.mjs` / `reset-scratch.mjs` / `reset-scratch.sql` | Apply (recorded with sha256 in `p2_scratch_marker.applied`) and reset |
| `10-apply` | migrations recorded and identical to the repository, schema/RLS/grant/definer inventory, structure check, PG major |
| `20-rls` | SQL-level RLS: tenant isolation, OWNER/MEMBER, anon, staff read policies fail closed, stale/future-dated validation |
| `30-guards` | last owner, last admin, TRUNCATE, isolation refusals (REPEATABLE READ/SERIALIZABLE), staff/member exclusion, cascades and attribution |
| `35-windows-factors` | enrolment windows, approved factors, `staff_session_ok` behavior, set-null exception |
| `40-concurrency` | two real connections: last owner, last admin, exclusion, revoke-vs-claim races (lock-wait is proven, deadlocks fail) |
| `50-http` | real tokens through PostgREST: isolation, write denial, removed member, private schema hidden, READ COMMITTED probe, staff session with a real TOTP factor |
| `90-not-performed` | SKIPPED entries for what a hosted project cannot do or P2.1 excludes |

Commands (after approval and setup):
```
npm run test:db:guard      # no project needed
npm run check:sql          # static checker only (text patterns; not a parser)
npm run db:apply:scratch   # apply supabase/migrations to the scratch project
npm run test:db            # all suites
npm run db:reset:scratch   # reset procedure
```
Database commands need `P2_DB_TEST_CONFIRM=scratch-only` in the environment of that command. Results of a run go to `tests/db/reports/notes.jsonl` (git-ignored, scrubbed).

## 2. Create the scratch project (you do this in the dashboard)
1. New project, same organization as dev. **Name:** `99purity-portal-scratch`. **Region:** the same as `99purity-portal-dev` (so the PostgreSQL version matches). **Database password:** generate a strong one; keep it only in your password manager and in the git-ignored file below.
2. Settings -> Infrastructure: write down the **PostgreSQL major version** (and confirm the dev project shows the same; tell me both).
3. Authentication -> Sign In / Providers: Email enabled; **sign-ups disabled** (test users are created by SQL); email confirmation can stay on. Multi-factor: **TOTP enrolment and verification enabled** (needed for the staff end-to-end test).
4. Settings -> API (Data API): exposed schemas must remain `public` and `graphql_public` only (**`private` must not be listed**).
5. SQL editor, run once, so the harness can recognise this project as the scratch one:
   `create schema p2_scratch_marker; comment on schema p2_scratch_marker is 'P2 scratch project: disposable';`
6. Collect: the **project ref**, the **Project URL**, the **publishable/anon key**, and the **Session pooler** connection string (Connect -> Session pooler, port **5432**; transaction mode on 6543 is refused because advisory locks and session state need a session). **Do not collect or use the service-role key.**
7. Copy `tests/db/scratch.env.example` to `.env.scratch.local` in the repository root (git-ignored by the existing `.env*.local` rule) and fill it in. Optionally list the dev project ref in `P2_FORBIDDEN_PROJECT_REFS` as a safety net. Never paste values into chat or commit them.

## 3. Guard rules (the harness refuses otherwise)
Local file present; `P2_DB_TEST_CONFIRM=scratch-only`; project ref well formed and not forbidden; database host is exactly `db.<ref>.supabase.co` (user `postgres`) or a `*.pooler.supabase.com` host with user `postgres.<ref>`; port 5432; password present; database `postgres`; TLS not disabled; API URL exactly `https://<ref>.supabase.co`; the key is an anon/publishable key (a service-role JWT or `sb_secret_` key is refused); `P2_EXPECTED_PG_MAJOR` recorded; and on connect the marker schema exists and the server major equals the recorded one. Errors contain codes only, never values.

## 4. Reset procedure
`npm run db:reset:scratch` (guarded, needs `--yes`, built in): drops the migration tables and the `private` schema, removes `p2test-*@example.test` users and the apply records. It does not alter the `auth` schema structure. The `alter default privileges` entries from migration 0001 remain and are re-set identically on re-apply. Alternative: delete the project and create a new one (then repeat section 2).

## 5. What cannot be tested on a hosted project (recorded as SKIPPED, never as passed)
DDL against `auth.mfa_factors` (T-AV-2..6, T-AV-11, T-V5B-3/4) and the staff-and-member state that needs `session_replication_role` (T-EX-5): hosted projects give no superuser. Tests needing the service-role key (real Auth-admin deletion path, GoTrue sign-up trigger path, service-key isolation probe) are deferred by decision. Tests for audit, step-up, invitations, flags and D-16(b) belong to later migrations. The only place CI would add value is destructive structure drift tests; the structure check fails closed by design and these remain a documented residual risk.

## 6. Dependency (approved and installed 2026-11-09)
`pg@8.13.1` is a **devDependency, exactly pinned**. Registry integrity `sha512-OUir1A0rPNZlX//c7ksiu7crsGZTKSOXJPgtNiHGIlC9H0lO+NC6ZDYksSgBYY/thSWhnSRBv8w1lieNNGATNQ==` matches the lock file. It adds 13 development-only packages (pg, pg-cloudflare, pg-connection-string, pg-int8, pg-pool, pg-protocol, pg-types, pgpass, postgres-array, postgres-bytea, postgres-date, postgres-interval, xtend), none with install scripts, none changing an existing package version, all from registry.npmjs.org. It is never bundled or deployed.
