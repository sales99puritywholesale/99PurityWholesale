import 'server-only';
import { createHmac } from 'node:crypto';
import type { RateLimitBucket } from './policies';

/**
 * Keyed identifiers for the rate-limit tables. The database never sees an email address, IP address or user id: the application
 * sends HMAC-SHA256(secret, bucket + normalized identifier), 32 bytes. Without the secret nobody can compute the key of a victim
 * (so an outsider cannot burn someone else's attempts) and a copy of the table reveals no identifier.
 *
 * The secret is the server-only environment variable RATE_LIMIT_PEPPER (at least 32 characters). If it is missing or weak the
 * functions THROW, and callers must treat that as "do not perform the sensitive operation" (fail closed).
 */
const MIN_PEPPER_LENGTH = 32;

export function loadRateLimitPepper(env: NodeJS.ProcessEnv = process.env): string {
  const pepper = env.RATE_LIMIT_PEPPER;
  if (typeof pepper !== 'string' || pepper.length < MIN_PEPPER_LENGTH) throw new Error('rate limiting is not configured');
  return pepper;
}

const EMAIL_BUCKETS: ReadonlySet<RateLimitBucket> = new Set(['password_recovery']);
const IP_BUCKETS: ReadonlySet<RateLimitBucket> = new Set(['password_recovery_ip', 'invite_accept_ip']);

export function normalizeRateLimitIdentifier(bucket: RateLimitBucket, identifier: string): string {
  if (typeof identifier !== 'string') throw new Error('invalid identifier');
  let v = identifier.trim().toLowerCase();
  if (IP_BUCKETS.has(bucket)) v = v.replace(/^\[|\]$/g, '');
  if (v.length < 1 || v.length > 320 || /[\u0000-\u001f\u007f\s]/.test(v)) throw new Error('invalid identifier');
  if (EMAIL_BUCKETS.has(bucket) && !/^[^@]+@[^@]+$/.test(v)) throw new Error('invalid identifier');
  return v;
}

export function deriveRateLimitKey(pepper: string, bucket: RateLimitBucket, identifier: string): Buffer {
  if (pepper.length < MIN_PEPPER_LENGTH) throw new Error('rate limiting is not configured');
  return createHmac('sha256', pepper).update(`p2:rl:v1:${bucket}:${normalizeRateLimitIdentifier(bucket, identifier)}`).digest();
}

/** PostgREST accepts bytea parameters in hex form: \x followed by hex digits. */
export const toPostgrestBytea = (key: Buffer): string => `\\x${key.toString('hex')}`;
