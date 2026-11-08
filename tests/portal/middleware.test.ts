import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  intl: vi.fn(),
  opts: undefined as undefined | { cookies: { setAll: (c: { name: string; value: string; options?: object }[], headers: Record<string, string>) => void } },
}));

vi.mock('next-intl/middleware', () => ({ default: () => h.intl }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: NonNullable<typeof h.opts>) => {
    h.opts = opts;
    return { auth: { getUser: h.getUser } };
  },
}));

const URL_OK = 'https://abcdefgh.supabase.co';
const KEY_OK = 'sb_publishable_abcdefghijklmnopqrstuv';
const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`https://portal.test${path}`, init);
const signedIn = () => h.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
const signedOut = () => h.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });

async function run(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  const { default: middleware } = await import('@/middleware');
  return middleware(req(path, init));
}

beforeEach(() => {
  h.intl.mockImplementation(() => NextResponse.next({ headers: { 'x-intl': '1' } }));
  vi.stubEnv('PORTAL_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_OK);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', KEY_OK);
  signedOut();
});
afterEach(() => vi.unstubAllEnvs());

describe('middleware: public site', () => {
  it.each(['/', '/es', '/products/bpc-157', '/wholesale-application', '/es/blog'])('delegates %s to next-intl and never touches auth', async (path) => {
    const res = await run(path);
    expect(res.headers.get('x-intl')).toBe('1');
    expect(h.intl).toHaveBeenCalledTimes(1);
    expect(h.getUser).not.toHaveBeenCalled();
    expect(res.headers.get('content-security-policy')).toBeNull();
  });
  it('is unaffected when the portal flag is off', async () => {
    vi.stubEnv('PORTAL_ENABLED', '');
    const res = await run('/products');
    expect(res.headers.get('x-intl')).toBe('1');
  });
});

describe('middleware: feature flag and configuration fail closed', () => {
  it.each(['', 'false', 'TRUE', '1', 'yes'])('answers 404 for every portal path when PORTAL_ENABLED=%o', async (value) => {
    vi.stubEnv('PORTAL_ENABLED', value);
    for (const path of ['/client', '/client/orders', '/admin', '/login', '/auth/callback']) {
      const res = await run(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get('cache-control')).toContain('no-store');
    }
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.intl).not.toHaveBeenCalled();
  });
  it('answers 503 (no details) when enabled but Supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const res = await run('/client');
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('Service unavailable');
  });
  it('refuses a service-role key supplied as the public key', async () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`);
    expect((await run('/client')).status).toBe(503);
  });
});

describe('middleware: authentication redirects', () => {
  it('redirects an unauthenticated visitor to /login with a safe next parameter', async () => {
    const res = await run('/client/orders?status=shipped');
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location') ?? '');
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/client/orders?status=shipped');
    expect(loc.origin).toBe('https://portal.test');
  });
  it('redirects /admin visitors without a session to sign-in too', async () => {
    const res = await run('/admin/settings');
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login');
  });
  it('lets an unauthenticated visitor open /login and /auth/callback', async () => {
    expect((await run('/login')).status).toBe(200);
    expect((await run('/auth/callback?code=x')).status).toBe(200);
  });
  it('sends a signed-in user from /login to /client', async () => {
    signedIn();
    const res = await run('/login');
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/client');
  });
  it('allows the customer area for a signed-in user', async () => {
    signedIn();
    expect((await run('/client/shop')).status).toBe(200);
  });
  it('treats an auth-library error as signed out (fails closed)', async () => {
    h.getUser.mockRejectedValue(new Error('network down'));
    const res = await run('/client');
    expect(res.status).toBe(307);
  });
});

describe('middleware: admin is denied to everyone in P1', () => {
  it('answers 403 for a signed-in user on every admin path', async () => {
    signedIn();
    for (const path of ['/admin', '/admin/applications', '/admin/settings']) {
      const res = await run(path);
      expect(res.status, path).toBe(403);
    }
  });
});

describe('middleware: portal response hardening', () => {
  it('sets no-store, noindex and a nonce-based CSP, and forwards the same nonce to the page render', async () => {
    signedIn();
    const res = await run('/client');
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`connect-src 'self' ${URL_OK}`);
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });
  it('ignores a client-supplied nonce or CSP header', async () => {
    signedIn();
    const res = await run('/client', { headers: { 'x-nonce': 'attacker', 'content-security-policy': 'script-src *' } });
    expect(res.headers.get('x-middleware-request-x-nonce')).not.toBe('attacker');
    expect(res.headers.get('x-middleware-request-content-security-policy')).not.toContain('script-src *');
  });
  it('also hardens redirect and 403 responses', async () => {
    const redirect = await run('/client');
    expect(redirect.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(redirect.headers.get('cache-control')).toContain('no-store');
    signedIn();
    const forbidden = await run('/admin');
    expect(forbidden.headers.get('cache-control')).toContain('no-store');
    expect(forbidden.headers.get('x-robots-tag')).toContain('noindex');
  });
  it('propagates a refreshed session to the browser and to the page render, and no-store headers from the auth library', async () => {
    h.getUser.mockImplementation(async () => {
      h.opts?.cookies.setAll([{ name: 'sb-test-auth-token', value: 'refreshed', options: { path: '/', httpOnly: true } }], { 'Cache-Control': 'private, no-store' });
      return { data: { user: { id: 'u1' } }, error: null };
    });
    const res = await run('/client');
    expect(res.headers.get('set-cookie')).toContain('sb-test-auth-token=refreshed');
    expect(res.headers.get('x-middleware-request-cookie')).toContain('sb-test-auth-token=refreshed');
  });
  it('keeps refreshed cookies on a redirect response too', async () => {
    h.getUser.mockImplementation(async () => {
      h.opts?.cookies.setAll([{ name: 'sb-test-auth-token', value: 'cleared', options: { path: '/', maxAge: 0 } }], {});
      return { data: { user: null }, error: { message: 'expired' } };
    });
    const res = await run('/client');
    expect(res.status).toBe(307);
    expect(res.headers.get('set-cookie')).toContain('sb-test-auth-token=');
  });
});
