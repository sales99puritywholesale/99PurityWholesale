import { describe, expect, it } from 'vitest';
import { decideRoute, type RouteInput } from '@/lib/portal/route-policy';
import { isPortalPath } from '@/lib/portal/paths';
import { buildPortalCsp, generateNonce } from '@/lib/portal/csp';

const base = { portalEnabled: true, authConfigured: true, authenticated: false } as const;
const d = (over: Partial<RouteInput> & { pathname: string }) => decideRoute({ ...base, ...over });

describe('decideRoute: public site', () => {
  it.each(['/', '/es', '/products', '/products/bpc-157', '/es/products', '/blog/some-post', '/wholesale-application', '/locations/us/texas', '/clients', '/administrator', '/logins'])(
    'hands %s to the public middleware, whatever the portal state',
    (pathname) => {
      for (const portalEnabled of [true, false]) {
        for (const authenticated of [true, false]) expect(d({ pathname, portalEnabled, authenticated })).toEqual({ type: 'public' });
      }
    },
  );
});

describe('decideRoute: portal disabled or unconfigured (fail closed)', () => {
  it.each(['/client', '/client/orders', '/admin', '/admin/settings', '/login', '/auth/callback'])('%s is 404 when the portal is off', (pathname) => {
    expect(d({ pathname, portalEnabled: false, authenticated: true })).toEqual({ type: 'not-found' });
  });
  it.each(['/client', '/admin', '/login', '/auth/callback'])('%s is unavailable when authentication is not configured', (pathname) => {
    expect(d({ pathname, authConfigured: false })).toEqual({ type: 'unavailable' });
  });
});

describe('decideRoute: authentication', () => {
  it('redirects unauthenticated visitors to sign-in, keeping the destination', () => {
    expect(d({ pathname: '/client' })).toEqual({ type: 'login', next: '/client' });
    expect(d({ pathname: '/client/orders', search: '?status=shipped' })).toEqual({ type: 'login', next: '/client/orders?status=shipped' });
    expect(d({ pathname: '/admin/settings' })).toEqual({ type: 'login', next: '/admin/settings' });
  });
  it('lets anyone reach the sign-in page and the callback', () => {
    expect(d({ pathname: '/login' })).toEqual({ type: 'allow' });
    expect(d({ pathname: '/auth/callback' })).toEqual({ type: 'allow' });
    expect(d({ pathname: '/auth/callback', authenticated: true })).toEqual({ type: 'allow' });
  });
  it('sends a signed-in user away from the sign-in page', () => {
    expect(d({ pathname: '/login', authenticated: true })).toEqual({ type: 'redirect', to: '/client' });
  });
  it('allows the customer area to any signed-in user (P1 foundation)', () => {
    for (const pathname of ['/client', '/client/shop', '/client/fulfillment/setup']) expect(d({ pathname, authenticated: true })).toEqual({ type: 'allow' });
  });
  it('answers 404 for unknown portal paths', () => {
    for (const pathname of ['/login/extra', '/auth', '/auth/other', '/auth/callback/x']) {
      expect(d({ pathname, authenticated: true })).toEqual({ type: 'not-found' });
    }
  });
});

describe('decideRoute: admin is denied to everyone in P1', () => {
  it.each(['/admin', '/admin/applications', '/admin/settings', '/admin/anything/else'])('%s is forbidden for an authenticated user', (pathname) => {
    expect(d({ pathname, authenticated: true })).toEqual({ type: 'forbidden' });
  });
  it('never returns "allow" for an admin path in any state', () => {
    for (const portalEnabled of [true, false]) {
      for (const authConfigured of [true, false]) {
        for (const authenticated of [true, false]) {
          expect(d({ pathname: '/admin/orders', portalEnabled, authConfigured, authenticated }).type).not.toBe('allow');
        }
      }
    }
  });
});

describe('isPortalPath', () => {
  it('matches exact prefixes and children only', () => {
    expect(isPortalPath('/client')).toBe(true);
    expect(isPortalPath('/client/x')).toBe(true);
    expect(isPortalPath('/clients')).toBe(false);
    expect(isPortalPath('/es/client')).toBe(false);
    expect(isPortalPath('/')).toBe(false);
  });
});

describe('portal Content-Security-Policy', () => {
  const csp = buildPortalCsp({ nonce: 'abc123', supabaseOrigin: 'https://x.supabase.co', isDev: false });
  it('uses a nonce for scripts and never allows unsafe-inline scripts', () => {
    const script = csp.split('; ').find((p) => p.startsWith('script-src')) ?? '';
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain('unsafe-eval');
  });
  it('forbids framing, plugins and foreign form targets, and allows the Supabase origin', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("connect-src 'self' https://x.supabase.co");
    expect(csp).toContain('upgrade-insecure-requests');
  });
  it('allows unsafe-eval only in development', () => {
    expect(buildPortalCsp({ nonce: 'n', isDev: true })).toContain("'unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });
  it('generates distinct, sufficiently long nonces', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(22);
  });
});
