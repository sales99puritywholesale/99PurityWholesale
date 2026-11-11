# Milestone 1: Validation Results (pre-migration gates)

Recorded 2026-11-07 against the hosted dev project `99purity-portal-dev`. Redacted: no tokens, passwords, TOTP seeds, user or session identifiers, project reference or keys appear here. Plan: `M1-VALIDATION-PLAN.md`. Script: standalone, dependency-free, outside the repository (not committed).

## Gate status
| Check | Status | Blocks |
|---|---|---|
| Settings recheck (sign-up off) | **PASS** | — |
| V1 claims after sign-in + verify | **PASS** | — |
| V2 re-verify advances timestamp | **PASS** (mode `reverify`; V2b not required) | — |
| V3 refresh does not freshen timestamp | **PASS (fully closed)**: hard-blocker criterion passed in two runs; corrected sign-out sub-check passed in the rerun | — |
| V5a shape of `auth.mfa_factors` | **PASS** (columns confirmed; status `verified`, type `totp`, age 3 min 15 s; `unverified` evidenced via Auth API only, see caveat) | — |
**All pre-migration gates are closed: V5a, V1, V2, V3 (V2b not required). This does not authorize any migration: no migration authorization has been granted, and migration and implementation work stays blocked until the owner explicitly approves 0001/0002. V5b (after 0002) and V4 (after 0004) remain required acceptance tests.**

## Evidence
### Settings (S0 probe)
- First probe: public sign-up **enabled** (non-compliant). Corrected by the owner. Recheck: sign-up disabled `true`, email provider enabled, auto-confirm for sign-ups off, clock skew server-local 0 s.

### V1 (PASS)
- After password sign-in: `aal1`, `amr` = [password @ T+0 s], session id present.
- TOTP factor status after enrol: `unverified`; after verify: `verified` (Auth API view).
- After verify and after refresh: `aal2`, `amr` = [**totp** @ T+1 s, password @ T+0 s], session id present and unchanged.
- Observed method string: exactly **`totp`**; entry order: most recent first; TOTP timestamp within 0.4 s of the verify.

### V2 (PASS)
- After waiting for the next 30 s code window: second challenge + verify + refresh gave `amr` = [totp @ T+35 s, password @ T+0 s].
- TOTP timestamp newer than V1's by 34.0 s; within 0.3 s of the second verify. Step-up mode: **`reverify`**.

### V3 (hard blocker criterion: PASS)
- After 65 s without a verify, two ordinary refreshes both returned `amr` = [totp @ T+35 s, password @ T+0 s], `aal2`, identical to the last verify. The TOTP timestamp did not advance.
- Token `iat` advanced to T+101 s and T+106 s while the TOTP timestamp stayed at T+35 s. This confirms `iat` is not a valid MFA-freshness signal and the `amr` TOTP timestamp is.
- **Open sub-check:** the original script tested sign-out against a refresh token already consumed by the earlier refresh, so it proved only reuse rejection. The script has been corrected to test the latest refresh token after logout. The corrected sub-check has **not yet been run** (the test factor must be deleted first because the seed exists only in process memory of the finished run).

### V5a (PARTIAL: columns confirmed, age open)
Owner ran the read-only dashboard queries and reported:
- **Column list (confirmed):** `id` (uuid), `user_id` (uuid), `friendly_name` (text), `factor_type` (USER-DEFINED enum), `status` (USER-DEFINED enum), `created_at` (timestamptz), `updated_at` (timestamptz), `secret` (text), `phone` (text), `last_challenged_at` (timestamptz), `web_authn_credential` (jsonb), `web_authn_aaguid` (uuid), `last_webauthn_challenge_data` (jsonb). The four required columns `id`, `user_id`, `status`, `created_at` are present with the expected types. **Criterion met.**
- **Distinct `status` values observed in the table at query time:** `verified` only (the test factor). The `unverified` state was observed through the Auth API view in V1 (after enrol), so both states are evidenced, but only `verified` was seen at database level. Acceptable but noted.
- **Factor age query: no rows returned** (the factor had already been removed, or the email filter did not match). **Age criterion not confirmed.** V5a therefore stays **OPEN**.
- **Observation 2026-11-07:** a read-only Auth API check (counts only) shows the test user still has **1 factor, type `totp`, status `verified`**, so the empty age-query result most likely came from the email filter not matching (case or value), not from a missing factor. Re-run the age query using the user's id from Authentication → Users or `ilike` on the email.
- Required next action: in the rerun, immediately after V1 enrols and verifies a fresh factor, the owner re-runs the age query (status, factor_type, age; no identifiers). Pass criterion: `status = verified` and age a few minutes; ideally also run the status query right after enrol to see `unverified` at database level.

### Design observations from the column list (for the 0002 design review; no design changed yet)
- `auth.mfa_factors` contains a **`secret`** column (the TOTP seed). The structure guard and every definer function that reads this table must select **only** `id`, `user_id`, `status`, `created_at` (and `factor_type` if needed) and never `secret`; diagnostics must list column **names** only. No API role may read the table (T-V5B-2). Add a test that no function or diagnostic output touches `secret`.
- **DECIDED (owner, 2026-11-07):** the approved-factor rule applies to **all verified factor types**; unclaimed or unrecognized verified factors are unapproved; types are handled explicitly and fail closed; the `secret` column is never selected, logged, exposed or copied (recorded in `MILESTONE-1-SCHEMA-AND-RLS.md` §5.12, tests T-V5B-7..10). The next two bullets are superseded by this decision where they differ.
- `factor_type` and `status` are **enum types**, so comparisons need enum-qualified casts, and `factor_type` includes values beyond TOTP (the table also has WebAuthn and phone columns). The approved-factor rule in §5.12 should count **any** verified factor of any type that is not in `staff_mfa_factors` as unapproved (conservative), unless the owner decides otherwise.
- `last_challenged_at` exists and could support later monitoring; not required now.

## Rerun 2026-11-07 (corrected script, one run, after factor removal)
Precheck (read-only, counts only): test user had **0** MFA factors. Then the corrected script ran once.
- Settings: sign-up disabled `true`, email enabled, auto-confirm off, clock skew 0 s.
- **V1 PASS:** pre-verify `aal1`, [password @ T+1 s]; factor `unverified` after enrol, `verified` after verify (API view); after verify and refresh `aal2`, [totp @ T+2 s, password @ T+1 s]; method string `totp`; delta vs verify 0.7 s.
- **V2 PASS:** second verify after the next window: totp @ T+34 s, newer by 32.0 s, delta 0.7 s. Mode `reverify`.
- **V3 PASS:** after 65 s, refresh #1 (iat T+100 s) and #2 (iat T+105 s) left totp @ T+34 s identical, `aal2` retained.
- **V3 sign-out sub-check PASS (closed):** after logout, the **latest** unconsumed refresh token was rejected. Prior run had tested an already-rotated token; this run corrected that.
- V5a database-level evidence is outside the script's reach (no database connection by design).

### V5a status after rerun
- Columns: confirmed (earlier). Status values: `verified` seen at database level earlier; `unverified` seen via API in both runs.
- **Age: CONFIRMED (closed 2026-11-07).** Owner's query for the fresh factor returned `status = verified`, `factor_type = totp`, `age = 00:03:15` (about 3 minutes, matching the run). Criterion met. Superseded note follows.
- (superseded) **Age: still OPEN.** A fresh factor now exists (enrolled and verified during this run, a few minutes before this note). Owner to run the age query now, filtering by user id (not email), selecting only `status`, `factor_type`, age; never `secret`:
  `select f.status, f.factor_type, now() - f.created_at as age from auth.mfa_factors f where f.user_id = '<user id>';`
  Pass criterion: `status = verified`, `factor_type = totp`, age a few minutes (the run took about 3 minutes; the factor was created about 1 s into it). A small number of minutes up to roughly 15 is acceptable; report the exact age.
- **V5a closure caveat:** the `unverified` state was evidenced via the Auth API (both runs), not at database level. Accepted for V5a; the database-level view of `unverified` is to be covered by the V5b/0002 tests (T-V5B) on the local stack. 
- The `unverified` state at database level cannot be captured with the current script (the factor is verified within about a second of enrolment). It is evidenced via the Auth API. Optional: accept that, or add a pause flag to the script in a later approved step.

## Environment notes
- GoTrue/Postgres server versions were not captured in this run (the script prints only allow-listed claims). Capture them with the V5b/CI run.
- `V_TEST_EMAIL` and `V_TEST_PASSWORD` remain in the git-ignored `.env.local` pending the owner's decision; they must be removed after validation closes.
- The test user again has one verified TOTP factor (created by the rerun); the seed was held in memory only and is gone. Leave it until the V5a age query is done, then delete it in the dashboard.

## Next actions (in order)
1. ~~Owner reports the V5a column list and status values~~ — received and recorded above. Remaining for V5a: the factor-age check (rerun, step 3).
2. Owner confirms the TOTP factor has been removed.
3. Rerun the corrected script once (V1 → V2 → V3) to close the V3 sign-out sub-check; V2b only if V2 fails. Expected: same results as above plus sign-out sub-check PASS. **Owner runs the V5a age query immediately after V1 enrols and verifies the fresh factor** (the script run lasts ~3 minutes; the factor remains afterwards, so the query can also be run after the run if done within a few minutes).
4. If V5a and the V3 sub-check both pass: record closure here and request approval for migrations 0001 and 0002 (V5b follows 0002).
5. Clean up: delete the test factor and `v-test-*` users (or reset), rotate their passwords, remove the `V_TEST_*` values from `.env.local`.
