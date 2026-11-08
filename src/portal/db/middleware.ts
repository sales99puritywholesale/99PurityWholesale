import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { SupabasePublicConfig } from '@/lib/portal/config';
import { SESSION_COOKIE_OPTIONS } from './cookie-options';

export type SessionResult = {
  /** The user is verified with the auth server (getUser), never trusted from the cookie alone. */
  authenticated: boolean;
  /** Builds the response to return. It carries any refreshed session cookies and the request headers for the page render. */
  respond: (init?: { headers?: Record<string, string> }) => NextResponse;
};

/**
 * Edge-safe session refresh for the portal middleware (documented @supabase/ssr pattern). Refreshes an expiring session and
 * forwards refreshed cookies BOTH to the browser (response) and to the page render in this same request (request headers),
 * so a rotated refresh token is never used twice.
 *
 * `requestHeaders` is mutated: callers pass the headers they want forwarded to the page (CSP, nonce).
 */
export async function updateSession(
  request: NextRequest,
  config: SupabasePublicConfig,
  requestHeaders: Headers,
): Promise<SessionResult> {
  const pendingCookies: { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }[] = [];
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(config.url, config.anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          pendingCookies.push({ name, value, options });
        });
        requestHeaders.set('cookie', request.cookies.toString());
        Object.assign(pendingHeaders, headers);
      },
    },
  });

  // Validates the JWT with the auth server. Do not replace with getSession() (cookie contents are not verified).
  let authenticated = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    authenticated = !error && Boolean(data.user);
  } catch {
    authenticated = false; // fail closed on any network/library error
  }

  return {
    authenticated,
    respond(init) {
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      Object.entries(pendingHeaders).forEach(([k, v]) => response.headers.set(k, v));
      Object.entries(init?.headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      return response;
    },
  };
}

/** Copies refreshed session cookies from one response onto another (used when the middleware redirects or blocks). */
export function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}
