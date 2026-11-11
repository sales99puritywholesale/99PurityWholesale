/**
 * APPLICATION-LEVEL ATTEMPT THROTTLE (rev5, P3). DEFENSE IN DEPTH, NOT AUTHORITATIVE.
 *
 * Why it exists: the database quotas of migration 0005 count COMMITTED rows. A transaction that ends in ROLLBACK leaves no request row, no audit row and no rate-limit
 * counter (PostgreSQL semantics), and no SQL in the migration can change that. Whether a client can make PostgREST roll back after the response is an API-layer setting
 * (db-tx-end / Prefer: tx=rollback; docs/P2-POSTGREST-TX-INVARIANT.md) that is UNVERIFIED for this project until tested in a disposable Supabase project. This module counts
 * ATTEMPTS in the application server, BEFORE the RPC call and regardless of the RPC's outcome, in a store that is not part of the database transaction, so a rolled-back
 * database call can never erase an attempt here.
 *
 * What it is not: it is not the approved quota (the database rows are), it does not replace any database check, it never grants anything, and an in-memory store is only a
 * reference implementation for tests (a serverless deployment needs a shared store such as a key-value service; the interface is the contract). Pure module: no I/O.
 */

/** Scopes that the server actions of the recovery workflow must pass through BEFORE calling the corresponding RPC. Limits are per attempt, outcome-independent. */
export const APP_THROTTLE_POLICIES = {
  /** per operator account: every call of initiate, approve, cancel, attest, authorize or the factor-loss review */
  operator_recovery_attempt: { maxAttempts: 30, windowSecs: 3600 },
  /** per target owner id across all operators: probing which owners are in which state */
  target_owner_probe: { maxAttempts: 15, windowSecs: 3600 },
  /** per owner account: recovery-code submissions (the database throttles committed attempts too: recovery_code 5 per 15 minutes) */
  owner_code_attempt_user: { maxAttempts: 12, windowSecs: 3600 },
  /** per client address hash: recovery-code submissions from one source */
  owner_code_attempt_ip: { maxAttempts: 40, windowSecs: 3600 },
} as const;
export type AppThrottleScope = keyof typeof APP_THROTTLE_POLICIES;

/** The store contract: atomically add one attempt to the window of a key and return the number of attempts in the window including this one. */
export interface AppThrottleStore {
  hit(key: string, nowMs: number, windowMs: number): Promise<number>;
}

export type AppThrottleDecision = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSecs: number };

/** Counts the attempt FIRST (an attempt counts whether or not the RPC later succeeds, fails or is rolled back), then decides. Fails closed if the store fails. */
export async function appThrottleHit(store: AppThrottleStore, scope: AppThrottleScope, keyHash: string, nowMs: number): Promise<AppThrottleDecision> {
  const p = APP_THROTTLE_POLICIES[scope];
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(keyHash)) return { allowed: false, retryAfterSecs: p.windowSecs }; // keys are opaque keyed hashes, never raw identifiers
  try {
    const n = await store.hit(`${scope}:${keyHash}`, nowMs, p.windowSecs * 1000);
    return Number.isInteger(n) && n >= 1 && n <= p.maxAttempts ? { allowed: true } : { allowed: false, retryAfterSecs: p.windowSecs };
  } catch {
    return { allowed: false, retryAfterSecs: 60 }; // fail closed: an unavailable store never turns into unlimited attempts
  }
}

/** REFERENCE implementation for tests only: a fixed-window counter in process memory (not shared between instances, not durable). */
export function createInMemoryAppThrottleStore(): AppThrottleStore {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    async hit(key, nowMs, windowMs) {
      const w = windows.get(key);
      if (!w || nowMs - w.start >= windowMs) {
        windows.set(key, { start: nowMs, count: 1 });
        return 1;
      }
      w.count += 1;
      return w.count;
    },
  };
}
