/**
 * Paths owned by the authenticated portal. They live outside the public [locale] tree:
 * no next-intl rewriting, no marketing chrome, no analytics, never cached or indexed.
 *
 * Pure module (no server-only, no Node APIs): it is imported by the edge middleware and by tests.
 */
export const PORTAL_PREFIXES = ['/client', '/admin', '/login', '/auth'] as const;

/** Paths reachable WITHOUT a session (sign-in page and the auth callback). Everything else needs one. */
export const PORTAL_PUBLIC_PATHS = ['/login', '/auth/callback'] as const;

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isPortalPath(pathname: string): boolean {
  return PORTAL_PREFIXES.some((p) => matches(pathname, p));
}

export const isClientPath = (pathname: string) => matches(pathname, '/client');
export const isAdminPath = (pathname: string) => matches(pathname, '/admin');
export const isPortalPublicPath = (pathname: string) => (PORTAL_PUBLIC_PATHS as readonly string[]).includes(pathname);

/** Where a signed-in user lands by default, and where an unauthenticated visitor is sent. */
export const PORTAL_HOME = '/client';
export const PORTAL_LOGIN = '/login';
