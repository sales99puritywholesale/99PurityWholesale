/**
 * Rate-limit buckets (D-P24-3, approved: PostgreSQL-backed atomic counters, never frontend throttling alone).
 * SOURCE OF TRUTH: private.rate_limit_policies in migration 0005 (draft in supabase/review). This mirror is for typing and for the
 * server code that must decide how to react; a unit test parses the SQL seed and fails if the two differ. Pure module.
 */
export const RATE_LIMIT_POLICIES = {
  recovery_code: { maxAttempts: 5, windowSecs: 900, blockSecs: 900 },
  mfa_recovery: { maxAttempts: 3, windowSecs: 3600, blockSecs: 3600 },
  invite_accept: { maxAttempts: 10, windowSecs: 3600, blockSecs: 3600 },
  invite_accept_ip: { maxAttempts: 30, windowSecs: 3600, blockSecs: 3600 },
  password_recovery: { maxAttempts: 1, windowSecs: 600, blockSecs: 600 },
  password_recovery_ip: { maxAttempts: 20, windowSecs: 3600, blockSecs: 3600 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMIT_POLICIES;
export const RATE_LIMIT_BUCKETS = Object.keys(RATE_LIMIT_POLICIES) as RateLimitBucket[];
export const isRateLimitBucket = (value: unknown): value is RateLimitBucket =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(RATE_LIMIT_POLICIES, value);

export type ThrottleResult = { readonly allowed: boolean; readonly retryAfterSecs: number };

/**
 * Parses the answer of a throttle RPC. Anything unexpected is a DENY with a retry hint (fail closed): a throttle that cannot answer
 * must never be read as permission.
 */
export function parseThrottleResult(raw: unknown): ThrottleResult {
  const denied: ThrottleResult = { allowed: false, retryAfterSecs: 60 };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return denied;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'allowed' && k !== 'retry_after_secs')) return denied;
  if (typeof o.allowed !== 'boolean') return denied;
  const retry = o.retry_after_secs;
  if (typeof retry !== 'number' || !Number.isInteger(retry) || retry < 0 || retry > 86_400) return denied;
  if (o.allowed && retry !== 0) return denied;
  if (!o.allowed && retry < 1) return denied;
  return { allowed: o.allowed, retryAfterSecs: retry };
}
