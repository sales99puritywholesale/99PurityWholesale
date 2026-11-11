import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Recovery codes (P2.4, approved defaults: single-use, hashed, no permanent MFA bypass).
 *
 * - 10 codes of 80 bits each (16 Crockford base32 characters, shown as XXXX-XXXX-XXXX-XXXX). 10 random bytes map to exactly 16
 *   five-bit groups, so there is no modulo bias.
 * - Only a hash is stored (SHA-256 bound to the user id, so a hash is useless for another account); the plain code exists only in
 *   memory and in the one-time display. A code is single use (enforced by the database row, not by this module).
 * - A recovery code NEVER creates an aal2 session and never satisfies a step-up: it only unlocks re-enrolment of a factor.
 * - Staff do not receive recovery codes (staff recovery is administrator-approved re-enrolment).
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
export const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_CHARS = 16;
const NORMALIZED_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/;

export type RandomBytes = (size: number) => Buffer;

export function generateRecoveryCode(rng: RandomBytes = randomBytes): string {
  const bytes = rng(10);
  if (bytes.length !== 10) throw new Error('random source returned the wrong size');
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = '';
  for (let i = RECOVERY_CODE_CHARS - 1; i >= 0; i--) out += ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)];
  return out.replace(/(.{4})(?=.)/g, '$1-');
}

/** A fresh set of distinct codes. */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT, rng: RandomBytes = randomBytes): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('invalid count');
  const set = new Set<string>();
  let guard = 0;
  while (set.size < count) {
    set.add(generateRecoveryCode(rng));
    if (++guard > count * 10) throw new Error('random source is not producing distinct codes');
  }
  return [...set];
}

/** Accepts typical user input (case, spaces, hyphens, Crockford look-alikes I/L/O) and returns the canonical form, or null. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const value = input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return NORMALIZED_RE.test(value) ? value : null;
}

/** Hex SHA-256 of the canonical code bound to the user. The only form that may be stored. */
export function hashRecoveryCode(userId: string, normalizedCode: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !NORMALIZED_RE.test(normalizedCode)) throw new Error('invalid input');
  return createHash('sha256').update(`p2:recovery:v1:${userId.toLowerCase()}:${normalizedCode}`).digest('hex');
}

/** Constant-time comparison of two stored hashes. */
export function recoveryHashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
