import { PORTAL_HOME, PORTAL_LOGIN, isAdminPath, isClientPath, isPortalMfaPath, isPortalPath, isPortalPublicPath } from './paths';

/**
 * Pure routing decision for the edge middleware. Middleware is one layer only: every server layout, page, action and route
 * handler re-checks (see src/lib/portal/auth.ts). Keeping the decision pure makes it unit-testable.
 */
export type RouteDecision =
  | { type: 'public' } //          not a portal path: hand over to the public (next-intl) middleware
  | { type: 'not-found' } //       portal disabled, or an unknown portal path
  | { type: 'unavailable' } //     portal enabled but authentication is not configured (503, no details)
  | { type: 'login'; next: string } // unauthenticated visitor: send to sign-in
  | { type: 'redirect'; to: string } //  already signed in on /login
  | { type: 'forbidden' } //       authenticated but not authorised (no longer produced by decideRoute since P3; kept for callers)
  | { type: 'allow' };

export type RouteInput = {
  pathname: string;
  search?: string;
  portalEnabled: boolean;
  authConfigured: boolean;
  authenticated: boolean;
};

export function decideRoute(input: RouteInput): RouteDecision {
  const { pathname, portalEnabled, authConfigured, authenticated } = input;
  if (!isPortalPath(pathname)) return { type: 'public' };
  if (!portalEnabled) return { type: 'not-found' };
  if (!authConfigured) return { type: 'unavailable' };

  if (isPortalPublicPath(pathname)) {
    if (pathname === PORTAL_LOGIN && authenticated) return { type: 'redirect', to: PORTAL_HOME };
    return { type: 'allow' };
  }

  // MFA pages need a session (aal1 is enough) and nothing else.
  if (isPortalMfaPath(pathname)) return authenticated ? { type: 'allow' } : { type: 'login', next: `${pathname}${input.search ?? ''}` };

  const isProtected = isClientPath(pathname) || isAdminPath(pathname);
  if (!isProtected) return { type: 'not-found' }; // e.g. /login/x, /auth/anything-else

  if (!authenticated) return { type: 'login', next: `${pathname}${input.search ?? ''}` };

  // P3: the edge no longer denies /admin wholesale. An authenticated visitor reaches the server, where the admin layout and EVERY admin page decide from the
  // database (verified staff session and capability: src/lib/portal/staff-gate.ts); anyone who is not verified staff gets the access-denied page or a 404.
  // The edge cannot read the staff context, so this layer only requires a session.
  return { type: 'allow' };
}
