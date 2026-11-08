import { createBrowserClient } from '@supabase/ssr';
import { requireSupabasePublicConfig } from '@/lib/portal/config';

/**
 * Supabase client for Client Components. PUBLIC key only; subject to Row Level Security like any browser client.
 *
 * P1 NOTE: nothing in P1 uses this client. Authentication happens on the server (login action, middleware, callback), and
 * the session cookie is httpOnly, so this client cannot read the session. It exists so later milestones (for example
 * realtime or direct RLS-protected reads) have one reviewed construction point. Never pass a service-role key here.
 */
export function createPortalBrowserClient() {
  const { url, anonKey } = requireSupabasePublicConfig();
  return createBrowserClient(url, anonKey);
}
