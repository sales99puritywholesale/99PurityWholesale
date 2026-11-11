# Application-level attempt throttle (rev5, P3): interface design, defense in depth

Status 2026-11-10. **Design plus a pure reference module** (`src/lib/portal/ratelimit/app-throttle.ts`, tested offline in `tests/portal/owner-rev5.test.ts`). Nothing is deployed, nothing runs against a database.

## 1. Purpose and honest limits
The database quotas of migration 0005 count **committed** rows. A call that ends in ROLLBACK leaves no row, no counter and no audit record, and no SQL can change that (`docs/P2-POSTGREST-TX-INVARIANT.md`). Whether a client can cause such a rollback after the function returned is an API-layer property that is **not verified**. The application server therefore counts ATTEMPTS itself, **before** it calls the RPC and **whatever the outcome**, in a store that is not part of the database transaction.
It is **defense in depth, not authority**: it never replaces a database check, never grants anything, and is bypassed by anyone who talks to the Data API directly with the public key (which is exactly why the database checks exist). It reduces automated probing and guessing that goes through the application, and it is the place to add a block if INV-TX turns out to be false.

## 2. Interface
`appThrottleHit(store, scope, keyHash, nowMs) -> {allowed: true} | {allowed: false, retryAfterSecs}`; `AppThrottleStore.hit(key, nowMs, windowMs)` atomically adds one attempt and returns the count in the window including this one. Rules: count first, decide second; keys are opaque keyed hashes (never an email, address, id or document number; the existing `deriveRateLimitKey` HMAC with the server-side pepper is the intended source); a malformed key, a failing store or an impossible count **denies** (fail closed).

| Scope | Key | Limit | Placed before |
|---|---|---|---|
| `operator_recovery_attempt` | operator account | 30 per hour | initiate, approve, cancel, attest, authorize, factor-loss review |
| `target_owner_probe` | target owner id (keyed hash) | 15 per hour across operators | the same calls (limits probing which owners are in which state) |
| `owner_code_attempt_user` | owner account | 12 per hour | `rpc_owner_recovery_request` (database: 5 per 15 minutes and 3 per hour, committed) |
| `owner_code_attempt_ip` | client address (keyed hash) | 40 per hour | `rpc_owner_recovery_request` |

The numbers are proposals (they are looser than the database quotas on purpose: they count attempts, the database counts effects) and need the project owner's confirmation.

## 3. Store requirements (for a later implementation decision)
A shared, atomic, expiring counter that all server instances see (a key-value service); the in-memory store in the module is a **reference for tests only** (per instance, lost on restart, useless in a serverless deployment). The store must not live in the same Postgres transaction (otherwise it inherits the problem); it must support atomic increment with expiry; its failure must deny; its contents are keyed hashes only (nothing personal).

## 4. What it does not do
It does not count the calls of a client that bypasses the application. It does not make the database quotas authoritative under INV-TX failure. It is not a substitute for the controls in `docs/P2-4-RECOVERY-EMAIL-ABUSE-CONTROLS.md`. No email is sent by it, and it reads no environment variable (the pepper is injected by the caller).

## 5. Offline test design (done) and what remains
Done offline: counting before outcome, limit decision, window restart, malformed-key refusal, failing-store denial, independent scopes. Remaining (needs an implementation approval): a shared-store adapter, a concurrency test of the store (N parallel hits, exactly the limit allowed), clock-skew handling, and wiring in the server actions with a test that the throttle is called before the RPC in every recovery action.
