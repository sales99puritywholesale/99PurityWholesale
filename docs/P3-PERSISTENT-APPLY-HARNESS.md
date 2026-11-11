# P3 persistent apply harness (prepared offline; NOT run; persistent application NOT authorized)

Status: prepared for review. **No database connection, no migration application and no seed execution has happened.** The harness has never executed against a database in any mode. Its logic is validated offline against a scripted fake database; **that is not evidence that a real hosted commit works.**

## 1. What it does
`supabase/review/tests/apply-p3.mjs` applies, to the hosted development project `semtmllmwhxznxechfsk`, in **one READ COMMITTED transaction**: the promoted P3 migration, the seed, and the migration-history row (`20261110000100`, `p3_catalog_pricing_orders`). It verifies everything read-only before commit and **commits only in an explicitly confirmed commit mode**. Without that it rolls back (rehearsal). It never uses the Supabase CLI, `db push` or Docker.

## 2. Pinned artifacts (all verified before any environment read or connection)
| Artifact | Path | SHA-256 |
|---|---|---|
| Promoted migration (byte-identical to the reviewed revision 2 candidate) | `supabase/migrations/20261110000100_p3_catalog_pricing_orders.sql` | `d5efe7e9753b13c6ccaedf1fb70d31ab3431d967d46764ceb3cb290ce5195beb` |
| Reviewed candidate | `supabase/review/p3/20261110000100_p3_catalog_pricing_orders.rev2.sql` | same |
| Original defective draft (must differ from the promoted file; preserved) | `supabase/review/p3/20261110000100_p3_catalog_pricing_orders.sql` | `bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e` |
| Seed | `supabase/review/p3/seed-products.sql` | `1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164` |
| Change-control manifest | `supabase/migration-hashes.txt` | `89d3b7142ab4e31b931ea70f70ad19e9393f128a2c92541bc33dfad5cd8d2380` |
| Tier R execution manifest | `docs/P3-TIER-R-EXECUTION-MANIFEST.md` | `725e769c2a0c145b1d96f1fbe76591dd4c3c6c388ae0c25c408eb0b57429fb90` |
| The four applied migrations | `supabase/migrations/20261108000001…4_*.sql` | the hashes in `migration-hashes.txt` (each re-verified) |
`supabase/migrations/` must hold exactly those five files. The harness's own SHA-256 is printed by `--offline-selftest` and must be named in the approval.

## 3. Modes and the exact commands (NOT to be run without separate approval)
Common: `--harness-sha <sha256 of apply-p3.mjs>` and credentials via `--authorized-read-env-local` (the single `P2_DATABASE_URL` line, in memory, never printed) or `P2_DATABASE_URL` in the process environment.
* **Offline self-test** (no network, no environment read): `node supabase/review/tests/apply-p3.mjs --offline-selftest`
* **Rehearsal** (does everything including the history row and the full verification, then ROLLS BACK, then proves nothing persisted): `node supabase/review/tests/apply-p3.mjs --authorized-rolled-back-execution --authorized-read-env-local --harness-sha <H>`
* **Commit** (the persistent apply): `node supabase/review/tests/apply-p3.mjs --authorized-persistent-apply --authorized-read-env-local --harness-sha <H> --approval-ref <reference> --commit-confirm p3-apply:d5efe7e9753b:1b3b922dbb62:<first 12 characters of H>`
The two mode flags are mutually exclusive; the commit confirmation string binds the migration hash, the seed hash and the harness hash. **Recommended order: rehearsal first (its own approval), then commit.**

## 4. Sequence of a run
1. Offline: verify every pinned artifact (section 2), LF-only, no transaction control inside the files; refuse on any difference (exit 3). Commit mode also needs the exact confirmation and an approval reference (exit 2 otherwise).
2. Credentials; verify host `db.<ref>.supabase.co`, project ref, user, database, port and the pinned CA fingerprint; strict TLS always.
3. Fresh connection: history table shape (columns, anything the harness cannot fill refuses); history is **exactly** the four applied versions and names; no P3 table, sequence, function or policy exists; take the BEFORE snapshot.
4. Second connection: `BEGIN ISOLATION LEVEL READ COMMITTED`, timeouts (idle 600 s, statement 120 s, lock 10 s), an advisory transaction lock, then **the same state checks again inside the transaction** (a racing or duplicate run is refused here).
5. Migration, seed, history insert (2-column form, or with the `statements` column if existing rows use it).
6. Read-only verification: 9 tables, 27 functions, 10 triggers, RLS, grants, owner, `search_path`, no policies; the new sequence unused; pricing vectors; seed 153/221 with no prices; no marketing wording; no data in P3 tables; 37 invalid and 3 valid shipping inputs in PostgreSQL (the validator and `rpc_checkout`); anon/non-staff/non-member refusals; P1/P2 row digests, auth digests, row counts, ACLs, schemas and history; the probes wrote nothing.
7. Rehearsal: `ROLLBACK`. Commit mode: `COMMIT` only if every check passed. Failure anywhere: `ROLLBACK`.
8. Fresh connection: after a rollback, the full BEFORE/AFTER comparison and "no P3 object, no history entry"; after a commit, the same verification repeated on persisted state.
9. A new timestamped result file (flag `wx`, never overwrites) and the log; no URL, credential or message in either.

## 5. Exit codes and outcomes
0 success (rehearsal rolled back and proven clean, or commit verified) · 1 failed and rolled back (proven clean) · 2 refused before connecting (flags, confirmation) · 3 artifact, target, TLS or connection refusal · 4 refused by database state (history mismatch or shape, P3 objects exist, **already applied**) · 5 committed but post-commit verification failed (no automatic cleanup) · 6 **ambiguous COMMIT** (error after COMMIT was sent; a fresh connection reports which state the database is in) · 7 inconsistent state.

## 6. Risks specific to the commit path, and how the harness treats them
| Risk (absent from the rollback harnesses) | Handling | Residual |
|---|---|---|
| A bug sends COMMIT too early or in the wrong mode | one COMMIT site, the final `else` after "verification failed" and "rehearsal" branches; commit needs the flag, the exact confirmation, an approval reference and the harness hash; tested, including six deliberate mutations of the harness that the tests catch | the real database may behave differently from the fake |
| Arbitrary SQL reaches the database | every statement is checked against an exact-text allow-list (80 texts + the two pinned files) BEFORE sending; the only writers are the advisory lock, the two history-insert forms, COMMIT, the migration and the seed | the allow-list is only as good as its review |
| The verification itself writes (the dry run's seed-idempotency probe updates rows) | that probe is NOT included; all checks are read-only; a final check asserts the probes changed no row digest | none known |
| Connection drops during COMMIT (outcome unknown) | never retried, never "repaired"; a fresh connection decides: persisted (verified) or not persisted (verified clean); exit 6 either way so a human sees it | a human must read the report |
| A SIGINT/SIGTERM mid-run | before COMMIT: the connection is closed (the server rolls an uncommitted transaction back); after COMMIT was sent: nothing is rolled back, the fresh-connection check decides | none known |
| Post-commit verification fails | exit 5, the persisted state is left untouched; any correction is a new, reviewed, approved step (a "down" migration would be needed: orders are append-only and cannot be deleted) | the change is durable |
| Duplicate or concurrent run | refused by the pre-check, again inside the transaction after the advisory lock, and by the unique history key | none known |
| History row format differs from what the Supabase CLI writes | the table shape is inspected first; the row mirrors the existing convention (statements omitted if existing rows have none) | a later CLI `db push` may treat the entry differently: not tested |
| Lock waits on referenced tables (FKs from new tables) | `lock_timeout` 10 s makes the run fail and roll back rather than wait | a retry needs a new approval |
| PostgREST schema cache | the platform reloads it on DDL (event trigger seen in P0); NOT verified by this harness | confirm by the app/an API call after apply |
| TLS downgrade through the URL: the `pg` driver lets a connection string OVERRIDE the explicit `ssl` option (`sslmode=disable` gives `ssl=false`, `no-verify` gives `rejectUnauthorized:false`, `require` gives `{}` and drops the pinned CA; demonstrated against the installed pg 8.13.1) | the client is built from URL components only (`buildClientConfig`, never a connection string); a URL with any SSL parameter is refused before connecting; every session must be TLS with a verified peer (`assertTls`) before use | the earlier rollback harnesses (P0, dry run, Phase T) used `connectionString`; their runs connected with the pinned CA, but whether the URL carried an SSL parameter was never checked |
| A failed fresh-connection comparison after a rollback masked by a success exit code (found in the source review) | any failed AFTER comparison, or a persisted P3 object, gives outcome `rollback_not_verified_clean` and exit 7 | none known |
| A durable change to the only development database | rehearsal first; the post-commit verification; no automatic cleanup | irreversible without a reviewed down step |

## 7. What was and was not validated
Validated offline (`supabase/review/tests/apply-p3-offline.mjs`, fake database only): hash and provenance refusals, wrong project/port/user/database, a non-pinned CA, TLS/connection failure, history mismatches and shape, failed migration/seed/history insert, failed in-transaction verification (ten injected faults, including the two original shipping defects), rollback behaviour, duplicate and racing execution, commit sequencing, ambiguous COMMIT both ways, post-commit failure, no write outside a transaction, no write after COMMIT, credential redaction, the CLI gates, and a source review (single COMMIT site, strict TLS, env access, no mutating probes).
**Not validated:** PostgreSQL behaviour of the new SQL (history queries, `seqProps`, `noDataCreated`, the history insert), a real COMMIT, TLS against the real server in this harness, signal handling in a real process, PostgREST, the real Supabase CLI history format. The first real run (the rehearsal) may reveal harness defects; that would be reported as such.

## 7a. Static checker rule R11 (`select *`)
`supabase/review/static-check.mjs` rule R11 forbids star selects (it protects `auth.mfa_factors`). The reviewed P3 migration reads the whole `public.orders` row at exactly four statements. The exemption is pinned to those four: it applies only when the file's sha256 equals the reviewed hash `d5efe7e9…5beb` AND each exact normalised statement occurs exactly once. Any other star (another table, another file, another place, an edited statement, a duplicated statement, or any one-byte change to the file) is still reported; the self-tests prove each case. Changing the reviewed migration therefore requires updating the pin in the same reviewed change.

## 8. After a successful commit (manual or separate steps, each needs its own approval)
`npm run check:portal`, then localhost product testing; note the blockers listed in the readiness report (no MFA challenge UI, no staff, no organizations). Update the comment in `supabase/migration-hashes.txt` to say the P3 migration is applied.
