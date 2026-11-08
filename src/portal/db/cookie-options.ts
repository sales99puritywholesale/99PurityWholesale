import type { CookieOptionsWithName } from '@supabase/ssr';
import { IS_PRODUCTION } from '@/lib/portal/config';

/**
 * Session cookie attributes for the SERVER and MIDDLEWARE clients. Edge-safe module.
 * - httpOnly: the session is only ever read on the server in P1 (script access to tokens is unnecessary and a risk).
 *   Consequence: the browser client in ./browser.ts cannot read this session; do not use it for authentication in P1.
 * - sameSite=lax: blocks cross-site POSTs carrying the cookie while allowing normal top-level navigation.
 * - secure in production only (plain http://localhost development would otherwise lose the cookie).
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: '/',
  sameSite: 'lax',
  secure: IS_PRODUCTION,
  httpOnly: true,
};
