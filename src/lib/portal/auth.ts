import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createPortalServerClient } from '@/portal/db/server';
import { isPortalEnabled } from './config';
import { PORTAL_LOGIN } from './paths';
import { safeRedirectPath } from './validation';
import { isDemoMode } from './demo/config';
import { getDemoPersona } from './demo/session';

/**
 * Server-side authentication and authorization boundary for the portal.
 *
 * Every portal server entry point (layout, page, server action, route handler) must call these helpers. Middleware is an
 * additional layer, never the only one. Layouts do NOT protect their child pages in the App Router (pages render
 * independently), so each page also calls requireUser()/requireAdminAccess().
 */

/** Minimal identity exposed to the UI: id and email only. No metadata is read or used for any decision. */
export type PortalUser = { id: string; email: string | null };

/** Fail closed: a disabled portal answers as if it did not exist. */
export function assertPortalEnabled(): void {
  if (!isPortalEnabled()) notFound();
}

/** The verified user of this request, or null. Verified with the auth server (getUser), not read from the cookie. Cached per request. */
export const getPortalUser = cache(async (): Promise<PortalUser | null> => {
  assertPortalEnabled();
  // Demo mode (localhost only, never in a production build): the signed-in user is the demo persona chosen on the sign-in page.
  if (isDemoMode()) { const p = getDemoPersona(); return p ? { id: p.id, email: p.email } : null; }
  const supabase = createPortalServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
});

/** Returns the signed-in user or redirects to sign-in, remembering a safe destination. */
export async function requireUser(nextPath: string): Promise<PortalUser> {
  const user = await getPortalUser();
  if (!user) redirect(`${PORTAL_LOGIN}?next=${encodeURIComponent(safeRedirectPath(nextPath))}`);
  return user;
}

/**
 * AUTHORIZATION BOUNDARY (P1): there are no organization or staff tables yet, so NO user is authorized for /admin.
 * This function must stay a hard "deny" until P2 implements staff roles, capability checks and MFA enforcement in the
 * database. It deliberately does not look at user_metadata, app_metadata, email domains or any other shortcut.
 */
export type AdminDecision = { allowed: false; reason: 'staff-authorization-not-implemented' };

export function authorizeAdmin(_user: PortalUser): AdminDecision {
  return { allowed: false, reason: 'staff-authorization-not-implemented' };
}

/** For admin pages: requires a signed-in user and then denies (404 body; the middleware already answers 403). */
export async function requireAdminAccess(): Promise<PortalUser> {
  const user = await requireUser('/admin');
  const decision = authorizeAdmin(user);
  if (!decision.allowed) notFound();
  return user;
}
