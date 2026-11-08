import { NextResponse, type NextRequest } from 'next/server';
import { createPortalServerClient } from '@/portal/db/server';
import { getSupabasePublicConfig, isPortalEnabled } from '@/lib/portal/config';
import { PORTAL_LOGIN } from '@/lib/portal/paths';
import { safeRedirectPath } from '@/lib/portal/validation';

// Auth callbacks must never be prerendered or cached.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' } as const;

function redirectTo(request: NextRequest, path: string): NextResponse {
  const url = request.nextUrl.clone();
  const target = new URL(path, 'http://portal.invalid');
  url.pathname = target.pathname;
  url.search = target.search;
  return NextResponse.redirect(url, { headers: NO_STORE });
}

/**
 * PKCE callback: exchanges the one-time `code` for a session (the code verifier cookie set at sign-in start binds it to
 * this browser). The destination goes through safeRedirectPath, so the callback cannot be used as an open redirect.
 * Fails closed when the portal is disabled or authentication is not configured.
 */
export async function GET(request: NextRequest) {
  if (!isPortalEnabled()) return new NextResponse('Not Found', { status: 404, headers: NO_STORE });
  if (!getSupabasePublicConfig().ok) return new NextResponse('Service unavailable', { status: 503, headers: NO_STORE });

  const code = request.nextUrl.searchParams.get('code');
  const next = safeRedirectPath(request.nextUrl.searchParams.get('next'));
  if (!code || code.length > 2048) return redirectTo(request, `${PORTAL_LOGIN}?error=callback`);

  const supabase = createPortalServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return redirectTo(request, `${PORTAL_LOGIN}?error=callback`);
  return redirectTo(request, next);
}
