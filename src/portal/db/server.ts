import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requireSupabasePublicConfig } from '@/lib/portal/config';
import { SESSION_COOKIE_OPTIONS } from './cookie-options';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers. Uses the PUBLIC key only.
 * Create one per request (never share across requests). Writes cookies where Next.js allows it; in a Server Component the
 * write is a no-op and the middleware has already refreshed the session.
 */
export function createPortalServerClient() {
  const { url, anonKey } = requireSupabasePublicConfig();
  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The middleware refreshes the session instead.
        }
      },
    },
  });
}
