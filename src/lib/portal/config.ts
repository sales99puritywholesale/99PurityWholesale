import { z } from 'zod';

/**
 * Portal configuration. FAIL CLOSED: anything missing, malformed or suspicious disables the portal; nothing here ever
 * echoes a configuration value (errors name the problem, never the value).
 *
 * Pure module (no server-only): used by the edge middleware, server code and tests. Public (NEXT_PUBLIC_*) values only.
 */

/** The portal is ON only when PORTAL_ENABLED is exactly the word "true". Every other value, or none, means OFF. */
export function isPortalEnabled(value: string | undefined = process.env.PORTAL_ENABLED): boolean {
  return value === 'true';
}

const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

const urlSchema = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url())
  .refine((value) => {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' || (u.protocol === 'http:' && isLoopback(u.hostname));
    } catch {
      return false;
    }
  }, 'Supabase URL must be https (http only for localhost)')
  .refine((value) => {
    // zod runs every check even after an earlier one failed, so this must never throw on a malformed value.
    try {
      const u = new URL(value);
      return !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash;
    } catch {
      return false;
    }
  }, 'Supabase URL must be an origin without credentials, path, query or fragment');

/** Decodes the payload of a JWT without verifying it. Edge-safe (atob). Returns null when it is not a JWT. */
function jwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (parts.length !== 3 || !payloadPart) return null;
  try {
    const b64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True for keys that must NEVER be used as the public key: new-style secret keys and legacy service_role JWTs. */
export function looksLikeServiceKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const payload = jwtPayload(key);
  return payload?.role === 'service_role';
}

const keySchema = z
  .string()
  .trim()
  .min(20)
  .max(4096)
  .refine((key) => !/\s/.test(key), 'Key must not contain whitespace')
  .refine((key) => !looksLikeServiceKey(key), 'A service-role/secret key must never be used as the public key');

export type SupabasePublicConfig = { url: string; anonKey: string };
export type SupabaseConfigResult = { ok: true; config: SupabasePublicConfig } | { ok: false };

/** Validates raw values. Exposed for tests; use getSupabasePublicConfig() in app code. */
export function parseSupabasePublicConfig(raw: { url: unknown; anonKey: unknown }): SupabaseConfigResult {
  const url = urlSchema.safeParse(raw.url);
  const anonKey = keySchema.safeParse(raw.anonKey);
  if (!url.success || !anonKey.success) return { ok: false };
  return { ok: true, config: { url: new URL(url.data).origin, anonKey: anonKey.data } };
}

/**
 * Reads the two PUBLIC Supabase variables. The literal environment accesses below (written out in full) are required so that Next.js
 * can inline them into client bundles. No service-role variable is ever read by the portal in this milestone.
 */
export function getSupabasePublicConfig(): SupabaseConfigResult {
  return parseSupabasePublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** For server code that cannot proceed without configuration. The message never contains a value. */
export function requireSupabasePublicConfig(): SupabasePublicConfig {
  const result = getSupabasePublicConfig();
  if (!result.ok) throw new Error('Portal authentication is not configured.');
  return result.config;
}

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
