import { z } from 'zod';
import { PORTAL_HOME, isAdminPath, isClientPath } from './paths';

/** Sign-in input. Email is normalised; the password is only length-bounded (never trimmed, never logged). */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

const MAX_NEXT_LENGTH = 512;
// Control characters, whitespace and backslashes are never legitimate in a post-login destination.
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f\s\\]/;

/**
 * Returns a safe, same-origin, portal-internal destination for a post-login redirect, or PORTAL_HOME.
 * Accepts only paths under /client or /admin. Rejects absolute and protocol-relative URLs, schemes, backslash tricks,
 * control characters and encoded variants of any of those.
 */
export function safeRedirectPath(input: unknown, fallback: string = PORTAL_HOME): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_NEXT_LENGTH) return fallback;

  // Check the raw value and every decoded form (single and double encoding) for tricks.
  let decoded = input;
  for (let i = 0; i < 3; i++) {
    if (FORBIDDEN_CHARS.test(decoded)) return fallback;
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback;
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
    if (next === decoded) break;
    decoded = next;
  }
  if (FORBIDDEN_CHARS.test(decoded) || !decoded.startsWith('/') || decoded.startsWith('//')) return fallback;

  let url: URL;
  try {
    url = new URL(input, 'http://portal.invalid');
  } catch {
    return fallback;
  }
  if (url.origin !== 'http://portal.invalid') return fallback;
  if (!(isClientPath(url.pathname) || isAdminPath(url.pathname))) return fallback;
  return `${url.pathname}${url.search}`;
}
