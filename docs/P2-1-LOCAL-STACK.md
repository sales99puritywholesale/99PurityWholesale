# P2.1 database validation on Docker Desktop + Supabase local stack

Status 2026-11-09: **Phase A done; Phase B applied the two reviewed migrations to the LOCAL Docker database only** (never to `99purity-portal-dev`). Results are in the Phase B reports; section 8 lists the known limitation. This replaces the hosted scratch project for now ([P2-1-SCRATCH-PROJECT.md](P2-1-SCRATCH-PROJECT.md) is kept for later hosted use). The existing `99purity-portal-dev` project is never contacted by this harness.

## 1. Decisions (owner, 2026-11-09)
Dev PostgreSQL is **17.11**; local major is **17** (`supabase/config.toml`). CLI `supabase@2.121.0` is an exact-pinned devDependency (no install script; platform binary from `@supabase/cli-windows-x64`). Docker disk image on `D:`. WSL: `memory=4GB`, `processors=3`, `swap=2GB` (`%UserProfile%\.wslconfig`).

## 2. Services
Reduced set: **db, auth (GoTrue), rest (PostgREST), gateway (Kong)**, plus whatever the CLI needs internally. Off in `config.toml`: realtime, studio, mail, storage (incl. s3/vector), edge runtime, analytics, pooler. Auth: sign-ups off (users come from SQL fixtures), TOTP enroll/verify on. API schemas: `public`, `graphql_public` only (**`private` not exposed**). Seed disabled.

## 3. Phase A never applies migrations
`npm run db:local:start` copies `supabase/config.toml` to a staging workdir (`D:\tmp\p2-local-stack`) whose `migrations/` folder is empty and starts the stack from there, so starting services cannot apply `supabase/migrations`. `npm run db:local:verify` proves it (empty migration history, no `public.organizations`, no `private` schema). Phase B (explicit approval only): `P2_LOCAL_APPLY_APPROVED=phase-b npm run db:local:apply` runs `supabase db reset --local` from the real workdir; without that variable the script refuses.

## 4. Commands (PowerShell)
```
npm run test:db:guard      # pure unit tests, no Docker (26 tests incl. local-mode guard)
npm run db:local:start     # Phase A start (no migrations)
npm run db:local:status
npm run db:local:env       # writes git-ignored .env.local-stack (db URL, API URL, anon key, PG major); prints no values
$env:P2_DB_TEST_CONFIRM='scratch-only'; $env:P2_DB_MODE='local'; npm run db:local:verify
npm run db:local:stop      # keeps volumes
# Phase B only, after approval:
$env:P2_LOCAL_APPLY_APPROVED='phase-b'; npm run db:local:apply
$env:P2_DB_TEST_CONFIRM='scratch-only'; npm run test:db:local
```

## 5. Local guard rules (`P2_DB_MODE=local`)
`.env.local-stack` present; `P2_DB_TEST_CONFIRM=scratch-only`; database host exactly `127.0.0.1` or `localhost`, port 54322, user `postgres`, database `postgres`, password present; API URL `http://127.0.0.1|localhost:54321`; key is an anon/publishable key (service-role and `sb_secret_` refused); PG major recorded; role `supabase_admin` exists on connect. Errors are codes only. The elevated connection (`supabase_admin`, same loopback host/port/password, derived in code) exists only in local mode. Hosted mode is unchanged.

## 6. What local mode adds and what it cannot prove
Adds (run instead of SKIPPED): DDL-drift tests T-AV-2..6, T-AV-11, T-V5B-3/4 (`60-structure-ddl`, ported from the frozen CI branch, all rolled back) and T-EX-5. Cannot prove: hosted `postgres` role privileges (locally `postgres` may hold more), hosted GoTrue/PostgREST versions and settings, pooler/TLS behaviour. **A pass here does not replace verifying the first apply to `99purity-portal-dev`.** Still SKIPPED by scope: service-role paths, audit, step-up, invitations, flags, D-16(b).

## 8. Phase state and known limitation
**`db:local:verify` has two phases.** By default it runs the Phase A *pre-apply* checks, including "no project migrations applied" and "no P2.1 objects exist"; these are valid only before the apply and are **expected to fail after Phase B**. After the apply run it with `P2_VERIFY_PHASE=B`, which instead asserts exactly 2 recorded migrations and that the P2.1 objects exist. It ends without `process.exit()` (exit code is set, resources drain).

**T-AV-6 is NOT TESTABLE on the Supabase local stack (recorded as skipped, never as passed).** T-AV-6 revokes SELECT on `auth.mfa_factors` from the definer owner `postgres` and expects the structure check to fail. On this stack `postgres` also inherits SELECT through membership in `pg_read_all_data` (and has `rolbypassrls`), so after the revoke it can still read the table and the check correctly stays `passed` (diagnosed read-only: table ACL `postgres=ar*wdDxtm/supabase_auth_admin`; revoke rolled back). Role memberships and grants were deliberately **not** changed to force the scenario, and D-3 (definer owner `postgres`) is unchanged. Consequence: the structure check's detection of a *lost* privilege is untested here; it is only ever true when the owner genuinely cannot read the table. Security note: the definer owner can read all data and bypasses RLS by design (D-3, provisional).

## 7. Reset
`supabase stop` keeps data; Phase B's `db reset --local` rebuilds the database. Removing the stack volumes (`supabase stop --no-backup`) discards only the local stack's own volumes (named after `project_id` `99puritywholesale`); other Docker volumes are never touched by these scripts.
