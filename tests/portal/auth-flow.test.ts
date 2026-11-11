import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  rpc: vi.fn(),
  aal: vi.fn(),
}));

// Next/React runtime pieces that only exist inside the framework: replaced by observable stand-ins.
vi.mock('react', () => ({ cache: <T,>(fn: T) => fn }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/portal/db/server', () => ({
  createPortalServerClient: () => ({
    auth: { getUser: h.getUser, signInWithPassword: h.signInWithPassword, signOut: h.signOut, exchangeCodeForSession: h.exchangeCodeForSession, mfa: { getAuthenticatorAssuranceLevel: h.aal } },
    rpc: h.rpc,
  }),
}));

import { authorizeAdmin, getPortalUser, requireAdminAccess, requireUser } from '@/lib/portal/auth';
import { signInAction } from '@/app/(portal)/login/actions';
import { signOutAction } from '@/app/(portal)/auth/actions';
import { GET as callback } from '@/app/(portal)/auth/callback/route';

const URL_OK = 'https://abcdefgh.supabase.co';
const KEY_OK = 'sb_publishable_abcdefghijklmnopqrstuv';
const user = (email = 'buyer@example.com') => ({ data: { user: { id: 'u1', email, user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } } }, error: null });
const none = () => ({ data: { user: null }, error: { message: 'no session' } });
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => f.set(k, v));
  return f;
};
const thrown = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return (e as Error).message;
  }
  return 'NO_THROW';
};

beforeEach(() => {
  vi.stubEnv('PORTAL_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_OK);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', KEY_OK);
  h.getUser.mockResolvedValue(none());
  h.signInWithPassword.mockResolvedValue({ error: null });
  h.signOut.mockResolvedValue({ error: null });
  h.exchangeCodeForSession.mockResolvedValue({ error: null });
  // a customer: no staff row, no authenticator factor (aal1 now and next): the sign-in destination is the requested page, exactly as before MFA existed
  h.rpc.mockResolvedValue({ data: { staff_status: 'none', roles: [], session_ok: false, step_up_ok: false }, error: null });
  h.aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('server-side authentication guards (second layer behind the middleware)', () => {
  it('getPortalUser returns only id and email, verified through getUser', async () => {
    h.getUser.mockResolvedValue(user());
    expect(await getPortalUser()).toEqual({ id: 'u1', email: 'buyer@example.com' });
    expect(h.getUser).toHaveBeenCalled();
  });
  it('returns null when the auth server rejects the session', async () => {
    expect(await getPortalUser()).toBeNull();
  });
  it('requireUser redirects an unauthenticated request to sign-in with a safe next', async () => {
    expect(await thrown(() => requireUser('/client/orders'))).toBe(`REDIRECT:/login?next=${encodeURIComponent('/client/orders')}`);
  });
  it('requireUser sanitises a hostile destination', async () => {
    expect(await thrown(() => requireUser('//evil.example'))).toBe(`REDIRECT:/login?next=${encodeURIComponent('/client')}`);
  });
  it('requireUser returns the user when signed in', async () => {
    h.getUser.mockResolvedValue(user());
    await expect(requireUser('/client')).resolves.toEqual({ id: 'u1', email: 'buyer@example.com' });
  });
  it('everything answers not-found when the portal flag is off', async () => {
    vi.stubEnv('PORTAL_ENABLED', 'false');
    h.getUser.mockResolvedValue(user());
    expect(await thrown(() => getPortalUser())).toBe('NOT_FOUND');
    expect(await thrown(() => requireUser('/client'))).toBe('NOT_FOUND');
    expect(await thrown(() => signInAction(form({ email: 'a@b.co', password: 'x' })))).toBe('NOT_FOUND');
    expect(await thrown(() => signOutAction())).toBe('NOT_FOUND');
  });
});

describe('admin authorization boundary (P1: nobody)', () => {
  it('authorizeAdmin denies every identity, including ones that look like admins', () => {
    for (const email of ['admin@99puritywholesale.com', 'owner@example.com', null]) {
      expect(authorizeAdmin({ id: 'u1', email })).toEqual({ allowed: false, reason: 'staff-authorization-not-implemented' });
    }
  });
  it('requireAdminAccess denies a signed-in user even when metadata claims an admin role', async () => {
    h.getUser.mockResolvedValue(user('admin@99puritywholesale.com'));
    expect(await thrown(() => requireAdminAccess())).toBe('NOT_FOUND');
  });
  it('requireAdminAccess sends an anonymous request to sign-in first', async () => {
    expect(await thrown(() => requireAdminAccess())).toBe(`REDIRECT:/login?next=${encodeURIComponent('/admin')}`);
  });
});

describe('signInAction', () => {
  it('signs in with normalised credentials and redirects to the validated destination', async () => {
    const msg = await thrown(() => signInAction(form({ email: '  Buyer@Example.com ', password: 'pw', next: '/client/orders' })));
    expect(h.signInWithPassword).toHaveBeenCalledWith({ email: 'buyer@example.com', password: 'pw' });
    expect(msg).toBe('REDIRECT:/client/orders');
  });
  it('replaces a hostile next with /client', async () => {
    for (const next of ['https://evil.example', '//evil.example', '/%2F%2Fevil.example', 'javascript:alert(1)']) {
      expect(await thrown(() => signInAction(form({ email: 'a@b.co', password: 'pw', next })))).toBe('REDIRECT:/client');
    }
  });
  it('second factor routing: a verified authenticator means the challenge; an active staff member with none is sent to setup; customers and disabled staff are not', async () => {
    h.aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    expect(await thrown(() => signInAction(form({ email: 'a@b.co', password: 'pw', next: '/admin' })))).toBe(`REDIRECT:/login/mfa?next=${encodeURIComponent('/admin')}`);
    h.aal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    h.rpc.mockResolvedValue({ data: { staff_status: 'active', roles: ['admin'], session_ok: false, step_up_ok: false }, error: null });
    expect(await thrown(() => signInAction(form({ email: 'a@b.co', password: 'pw', next: '/admin' })))).toBe(`REDIRECT:/login/mfa/setup?next=${encodeURIComponent('/admin')}`);
    h.rpc.mockResolvedValue({ data: { staff_status: 'disabled', roles: [], session_ok: false, step_up_ok: false }, error: null });
    expect(await thrown(() => signInAction(form({ email: 'a@b.co', password: 'pw', next: '/admin' })))).toBe('REDIRECT:/admin');
  });
  it('a failing MFA or staff lookup never blocks a customer sign-in and never invents a flow', async () => {
    h.aal.mockResolvedValue({ data: null, error: { message: 'boom' } });
    h.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await thrown(() => signInAction(form({ email: 'a@b.co', password: 'pw', next: '/client/shop' })))).toBe('REDIRECT:/client/shop');
  });
  it('rejects invalid input without contacting the auth server and never echoes the password or email', async () => {
    const msg = await thrown(() => signInAction(form({ email: 'nope', password: 'hunter2' })));
    expect(h.signInWithPassword).not.toHaveBeenCalled();
    expect(msg).toBe(`REDIRECT:/login?error=invalid_input&next=${encodeURIComponent('/client')}`);
    expect(msg).not.toContain('hunter2');
    expect(msg).not.toContain('nope');
  });
  it('returns one generic error for every credential failure (no account enumeration)', async () => {
    for (const status of [400, 401, 422, undefined]) {
      h.signInWithPassword.mockResolvedValue({ error: { status, message: 'Invalid login credentials / Email not confirmed / User not found' } });
      const msg = await thrown(() => signInAction(form({ email: 'a@b.co', password: 'pw' })));
      expect(msg).toBe(`REDIRECT:/login?error=invalid_credentials&next=${encodeURIComponent('/client')}`);
    }
  });
  it('maps provider rate limiting to a distinct friendly code', async () => {
    h.signInWithPassword.mockResolvedValue({ error: { status: 429, message: 'rate limit' } });
    expect(await thrown(() => signInAction(form({ email: 'a@b.co', password: 'pw' })))).toContain('error=rate_limited');
  });
  it('reports unavailable (and does not call the provider) when authentication is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(await thrown(() => signInAction(form({ email: 'a@b.co', password: 'pw' })))).toContain('error=unavailable');
    expect(h.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('signOutAction', () => {
  it('revokes the session and returns to sign-in', async () => {
    expect(await thrown(() => signOutAction())).toBe('REDIRECT:/login');
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('PKCE callback route', () => {
  const get = (qs: string) => callback(new NextRequest(`https://portal.test/auth/callback${qs}`));
  const target = (res: Response) => {
    const u = new URL(res.headers.get('location') ?? '');
    return `${u.origin}${u.pathname}${u.search}`;
  };

  it('exchanges the code and redirects to a safe destination', async () => {
    const res = await get('?code=abc&next=/client/orders');
    expect(h.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(target(res)).toBe('https://portal.test/client/orders');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
  it('cannot be used as an open redirect', async () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/%2F%2Fevil.example']) {
      const res = await get(`?code=abc&next=${encodeURIComponent(next)}`);
      expect(target(res), next).toBe('https://portal.test/client');
    }
  });
  it('sends a missing code, an oversized code or a failed exchange to sign-in with a fixed error', async () => {
    expect(target(await get(''))).toBe('https://portal.test/login?error=callback');
    expect(target(await get(`?code=${'a'.repeat(3000)}`))).toBe('https://portal.test/login?error=callback');
    h.exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad code' } });
    expect(target(await get('?code=abc'))).toBe('https://portal.test/login?error=callback');
  });
  it('answers 404 when the portal is off and 503 when authentication is not configured', async () => {
    vi.stubEnv('PORTAL_ENABLED', '');
    expect((await get('?code=abc')).status).toBe(404);
    vi.stubEnv('PORTAL_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect((await get('?code=abc')).status).toBe(503);
    expect(h.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
