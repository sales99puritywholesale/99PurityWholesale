import 'server-only';
import { cache } from 'react';
import { createPortalServerClient } from '@/portal/db/server';
import { getPortalUser } from './auth';
import { denyAllContext, parseStaffContext } from './permissions/context';
import type { StaffAccessContext } from './permissions/evaluate';
import { isDemoMode } from './demo/config';
import { getDemoPersona } from './demo/session';

/**
 * Loads the staff authorization context of the CURRENT request from the database (public.rpc_my_staff_context, migration 0004).
 * The call runs with the user's own session, so the database evaluates the signed JWT (aal2, TOTP time) and the approved factor
 * binding itself. Any error, missing function or malformed answer yields the deny-all context (default deny).
 *
 * NOT wired into authorizeAdmin() or the middleware yet: P1 keeps /admin denied for everyone until the 0003/0004 migrations are
 * applied on the hosted project and an admin is bootstrapped (see docs/P2-2-P2-4-DESIGN.md).
 */
export const getStaffAccessContext = cache(async (): Promise<StaffAccessContext> => {
  const now = new Date();
  const user = await getPortalUser();
  if (!user) return denyAllContext(false, now);
  // Demo mode: the demo administrator is a verified staff session with the admin role (a demonstration stand-in for MFA; never active in a production build).
  if (isDemoMode()) return getDemoPersona()?.kind === 'admin' ? { authenticated: true, staffStatus: 'active', roles: ['admin'], dbSessionOk: true, totpVerifiedAt: now, now } : denyAllContext(true, now);
  try {
    const supabase = createPortalServerClient();
    const { data, error } = await supabase.rpc('rpc_my_staff_context');
    if (error) return denyAllContext(true, now);
    return parseStaffContext(data, true, now);
  } catch {
    return denyAllContext(true, now);
  }
});
