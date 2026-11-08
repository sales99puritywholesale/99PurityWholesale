import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { isPortalPath, PORTAL_LOGIN } from './lib/portal/paths';
import { getSupabasePublicConfig, isPortalEnabled } from './lib/portal/config';
import { decideRoute } from './lib/portal/route-policy';
import { buildPortalCsp, generateNonce } from './lib/portal/csp';
import { copyCookies, updateSession } from './portal/db/middleware';

const intlMiddleware = createMiddleware(routing);

const PORTAL_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

function plain(status: number, body: string): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { ...PORTAL_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function withHeaders(response: NextResponse, headers: Record<string, string>): NextResponse {
  Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

/**
 * Edge middleware. Two branches:
 *  1. Public site paths: untouched next-intl behaviour.
 *  2. Portal paths (/client, /admin, /login, /auth): feature flag, session refresh, access decision, CSP and no-store.
 *
 * This is ONE layer of defence. Server layouts, pages, actions and route handlers re-check authentication themselves
 * (src/lib/portal/auth.ts); API routes under /api are outside this matcher and must authenticate on their own.
 */
export default async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isPortalPath(pathname)) return intlMiddleware(request);

  const portalEnabled = isPortalEnabled();
  const auth = getSupabasePublicConfig();

  // Decisions that need no session: portal off (404, fail closed), authentication not configured (503, no details).
  const early = decideRoute({ pathname, search, portalEnabled, authConfigured: auth.ok, authenticated: false });
  if (early.type === 'not-found') return plain(404, 'Not Found');
  if (early.type === 'unavailable' || !auth.ok) return plain(503, 'Service unavailable');

  const nonce = generateNonce();
  const csp = buildPortalCsp({
    nonce,
    supabaseOrigin: auth.config.url,
    isDev: process.env.NODE_ENV !== 'production',
  });
  // Always overwrite: a client can never supply its own nonce or CSP for the page render.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const session = await updateSession(request, auth.config, requestHeaders);
  const decision = decideRoute({
    pathname,
    search,
    portalEnabled,
    authConfigured: true,
    authenticated: session.authenticated,
  });
  const securityHeaders = { ...PORTAL_HEADERS, 'Content-Security-Policy': csp };
  const finish = (response: NextResponse) => withHeaders(copyCookies(session.respond(), response), securityHeaders);

  switch (decision.type) {
    case 'login': {
      const url = request.nextUrl.clone();
      url.pathname = PORTAL_LOGIN;
      url.search = '';
      url.searchParams.set('next', decision.next);
      return finish(NextResponse.redirect(url));
    }
    case 'redirect': {
      const url = request.nextUrl.clone();
      url.pathname = decision.to;
      url.search = '';
      return finish(NextResponse.redirect(url));
    }
    case 'forbidden':
      return finish(plain(403, 'Forbidden'));
    case 'not-found':
      return finish(plain(404, 'Not Found'));
    case 'unavailable':
      return finish(plain(503, 'Service unavailable'));
    case 'allow':
    case 'public':
    default:
      return session.respond({ headers: securityHeaders });
  }
}

export const config = {
  // Match all pathnames except
  // - api routes (they must authenticate themselves)
  // - _next (static files)
  // - _vercel (Vercel internals)
  // - static files (e.g. /favicon.ico, /sitemap.xml, etc.)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
