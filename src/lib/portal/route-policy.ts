import { PORTAL_HOME, PORTAL_LOGIN, isAdminPath, isClientPath, isPortalPath, isPortalPublicPath } from './paths';

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
  | { type: 'forbidden' } //       authenticated but not authorised (all of /admin in P1)
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

  const isProtected = isClientPath(pathname) || isAdminPath(pathname);
  if (!isProtected) return { type: 'not-found' }; // e.g. /login/x, /auth/anything-else

  if (!authenticated) return { type: 'login', next: `${pathname}${input.search ?? ''}` };

  // P1 has no staff authorization yet: /admin is denied to everyone. Do not loosen this without P2 staff tables.
  if (isAdminPath(pathname)) return { type: 'forbidden' };
  return { type: 'allow' };
}
