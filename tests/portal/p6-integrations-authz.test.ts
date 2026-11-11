import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { denyAllContext, parseStaffContext } from '@/lib/portal/permissions/context';
import type { StaffAccessContext } from '@/lib/portal/permissions/evaluate';

// Scenario tests for the P6 server actions with authentication and the staff context mocked. They prove the APPLICATION-side decision and the secret handling (generated on the
// server, only a hash or the signing key sent to the database, shown once). The database re-check (owner gate, step-up, scopes) is the second layer and is NOT exercised here.
const h = vi.hoisted(() => {
  const ok = async () => ({ ok: true, data: {} });
  return {
    user: { id: 'u1', email: 'u@example.test' } as { id: string; email: string } | null,
    ctx: null as unknown,
    rpc: {
      apiKeyCreate: vi.fn(async (_o: string, _n: string, _e: string, _k: unknown) => ({ ok: true, data: {} })), apiKeyRevoke: vi.fn(ok),
      webhookEndpointCreate: vi.fn(async (_o: string, _u: string, _e: string[], _s: string) => ({ ok: true, data: {} })), webhookEndpointRotate: vi.fn(async (_o: string, _i: string, _s: string) => ({ ok: true, data: {} })),
      webhookEndpointSetActive: vi.fn(ok), webhookTest: vi.fn(ok), adminApiKeyRevoke: vi.fn(ok), adminWorkerTokenCreate: vi.fn(async (_h: string) => ({ ok: true, data: {} })),
    },
  };
});

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/portal/auth', () => ({
  requireUser: async (next: string) => {
    if (!h.user) throw new Error(`REDIRECT:/login?next=${next}`);
    return h.user;
  },
}));
vi.mock('@/components/portal/commerce-ui', () => ({
  back: (path: string, params: Record<string, string>, outcome: { ok: boolean; code?: string }) => {
    const q = new URLSearchParams(params);
    if (outcome.ok) q.set('ok', '1');
    else q.set('e', String(outcome.code));
    return `${path}?${q.toString()}`;
  },
}));
vi.mock('@/lib/portal/staff-access', () => ({ getStaffAccessContext: async () => h.ctx }));
vi.mock('@/lib/portal/integrations/server', async (orig) => ({ ...(await orig<object>()), ...h.rpc }));

const ORG = '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11';
const ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const now = new Date('2026-11-10T12:00:00Z');
const staff = (roles: string[], over: Partial<{ staff_status: string; session_ok: boolean }> = {}): StaffAccessContext =>
  parseStaffContext({ staff_status: 'active', roles, session_ok: true, step_up_ok: true, last_totp_epoch: Math.floor(now.getTime() / 1000), ...over }, true, now);
const SCENARIOS: Record<string, { user: boolean; ctx: StaffAccessContext }> = {
  unauthenticated: { user: false, ctx: denyAllContext(false, now) },
  'normal customer (not staff)': { user: true, ctx: parseStaffContext({ staff_status: 'none', roles: [], session_ok: false, step_up_ok: false }, true, now) },
  'inactive (disabled) staff': { user: true, ctx: staff(['admin'], { staff_status: 'disabled' }) },
  'staff with an unverified session': { user: true, ctx: staff(['admin'], { session_ok: false }) },
  'staff with an unknown role': { user: true, ctx: staff(['superuser']) },
  support: { user: true, ctx: staff(['support']) },
  operations: { user: true, ctx: staff(['operations']) },
  finance: { user: true, ctx: staff(['finance']) },
  admin: { user: true, ctx: staff(['admin']) },
};
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const IDLE = { status: 'idle' } as const;

beforeEach(() => {
  for (const f of Object.values(h.rpc)) f.mockClear();
});

describe('P6 staff actions: capability checked before any RPC', () => {
  for (const [label, sc] of Object.entries(SCENARIOS)) {
    it(`revoke any key (org.manage), ${label}: ${label === 'admin' ? 'reaches the RPC' : 'is refused'}`, async () => {
      h.user = sc.user ? { id: 'u1', email: 'u@example.test' } : null;
      h.ctx = sc.ctx;
      const a = await import('@/app/(portal)/admin/integrations-actions');
      let thrown = '';
      try { await a.adminRevokeKeyAction(fd({ id: ID })); } catch (e) { thrown = (e as Error).message; }
      if (label === 'admin') {
        expect(h.rpc.adminApiKeyRevoke).toHaveBeenCalledWith(ID);
        expect(thrown).toMatch(/^REDIRECT:\/admin\/integrations\?.*ok=1/);
      } else {
        expect(h.rpc.adminApiKeyRevoke).not.toHaveBeenCalled();
        expect(thrown).toMatch(sc.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
      }
    });
    it(`create the worker credential (flags.write), ${label}: ${label === 'admin' ? 'reaches the RPC' : 'is refused'}`, async () => {
      h.user = sc.user ? { id: 'u1', email: 'u@example.test' } : null;
      h.ctx = sc.ctx;
      const a = await import('@/app/(portal)/admin/integrations-actions');
      let thrown = '';
      let out = null as { status: string; secret?: string } | null;
      try { out = (await a.createWorkerTokenAction(IDLE)) as { status: string; secret?: string }; } catch (e) { thrown = (e as Error).message; }
      if (label === 'admin') {
        expect(out?.status).toBe('created');
        expect(out?.secret).toMatch(/^99pw_worker_[0-9a-f]{64}$/);
        expect(h.rpc.adminWorkerTokenCreate).toHaveBeenCalledWith(sha(out?.secret ?? ''));
      } else {
        expect(h.rpc.adminWorkerTokenCreate).not.toHaveBeenCalled();
        expect(thrown).toMatch(sc.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
      }
    });
  }
  it('an invalid key id never reaches the RPC; the stored credential is never the plaintext', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const a = await import('@/app/(portal)/admin/integrations-actions');
    await expect(a.adminRevokeKeyAction(fd({ id: 'nope' }))).rejects.toThrow(/e=invalid_response/);
    expect(h.rpc.adminApiKeyRevoke).not.toHaveBeenCalled();
    const out = (await a.createWorkerTokenAction(IDLE)) as { secret: string };
    expect(JSON.stringify(h.rpc.adminWorkerTokenCreate.mock.calls)).not.toContain(out.secret);
  });
  it('every exported staff action is covered', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', '(portal)', 'admin', 'integrations-actions.ts'), 'utf8');
    expect([...src.matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]).sort()).toEqual(['adminRevokeKeyAction', 'createWorkerTokenAction']);
  });
});

describe('P6 customer actions', () => {
  it('every action requires a signed-in user and calls nothing otherwise', async () => {
    h.user = null;
    const a = await import('@/app/(portal)/client/api-keys/actions');
    await expect(a.createKeyAction(IDLE, fd({ organizationId: ORG, name: 'x', environment: 'test' }))).rejects.toThrow(/^REDIRECT:\/login/);
    await expect(a.createEndpointAction(IDLE, fd({ organizationId: ORG, url: 'https://hooks.example.com/x', events: ['ping'] }))).rejects.toThrow(/^REDIRECT:\/login/);
    await expect(a.rotateEndpointAction(IDLE, fd({ organizationId: ORG, id: ID }))).rejects.toThrow(/^REDIRECT:\/login/);
    await expect(a.revokeKeyAction(fd({ organizationId: ORG, id: ID }))).rejects.toThrow(/^REDIRECT:\/login/);
    await expect(a.toggleEndpointAction(fd({ organizationId: ORG, id: ID, active: 'true' }))).rejects.toThrow(/^REDIRECT:\/login/);
    await expect(a.testEndpointAction(fd({ organizationId: ORG, id: ID }))).rejects.toThrow(/^REDIRECT:\/login/);
    for (const f of Object.values(h.rpc)) expect(f).not.toHaveBeenCalled();
  });
  it('a new API key is generated on the server, only its hash and prefix go to the database, and the plaintext comes back once', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/api-keys/actions');
    const out = (await a.createKeyAction(IDLE, fd({ organizationId: ORG, name: 'My shop', environment: 'test' }))) as { status: string; secret: string };
    expect(out.status).toBe('created');
    expect(out.secret).toMatch(/^99pw_test_[0-9a-f]{40}$/);
    const call = h.rpc.apiKeyCreate.mock.calls[0] as [string, string, string, { key: string; prefix: string; hash: string }];
    expect(call[0]).toBe(ORG);
    expect(call[1]).toBe('My shop');
    expect(call[2]).toBe('test');
    expect(call[3].hash).toBe(sha(out.secret));
    expect(call[3].prefix).toBe(out.secret.slice(0, 16));
    // the RPC wrapper receives the generated key object only to extract the hash and prefix (the real wrapper sends p_prefix and p_key_hash, never the key)
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'portal', 'integrations', 'server.ts'), 'utf8');
    expect(src).toMatch(/p_prefix: k\.prefix, p_key_hash: k\.hash/);
    expect(src).not.toMatch(/p_key: k\.key|key: k\.key/);
  });
  it('two keys are never equal', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/api-keys/actions');
    const x = (await a.createKeyAction(IDLE, fd({ organizationId: ORG, name: 'a', environment: 'live' }))) as { secret: string };
    const y = (await a.createKeyAction(IDLE, fd({ organizationId: ORG, name: 'b', environment: 'live' }))) as { secret: string };
    expect(x.secret).not.toBe(y.secret);
    expect(x.secret).toMatch(/^99pw_live_/);
  });
  it('invalid key requests never reach the RPC and show a generic message (empty name, unknown environment)', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/api-keys/actions');
    for (const over of [{ name: '' }, { environment: 'prod' }, { organizationId: 'nope' }]) {
      const out = (await a.createKeyAction(IDLE, fd({ organizationId: ORG, name: 'x', environment: 'test', ...over }))) as { status: string; message: string };
      expect(out.status).toBe('error');
      expect(out.message).toBe('Something went wrong. Please try again.');
    }
    expect(h.rpc.apiKeyCreate).not.toHaveBeenCalled();
  });
  it('database refusals (not an owner, organization not live) are shown with fixed text and no secret is returned', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/api-keys/actions');
    h.rpc.apiKeyCreate.mockResolvedValueOnce({ ok: false, code: 'owner_required' } as never);
    expect(await a.createKeyAction(IDLE, fd({ organizationId: ORG, name: 'x', environment: 'test' }))).toEqual({ status: 'error', message: 'Only an organization owner can do this.' });
    h.rpc.apiKeyCreate.mockResolvedValueOnce({ ok: false, code: 'not_live' } as never);
    const live = (await a.createKeyAction(IDLE, fd({ organizationId: ORG, name: 'x', environment: 'live' }))) as { status: string; secret?: string };
    expect(live.status).toBe('error');
    expect(live.secret).toBeUndefined();
  });
  it('webhook endpoints: only safe https URLs and known events reach the database; the signing key is shown once and sent once', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/api-keys/actions');
    for (const url of ['http://hooks.example.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://hooks.example.com:8080/x', 'https://u:p@hooks.example.com/x']) {
      expect(((await a.createEndpointAction(IDLE, fd({ organizationId: ORG, url, events: ['order.created'] }))) as { status: string }).status).toBe('error');
    }
    expect(((await a.createEndpointAction(IDLE, fd({ organizationId: ORG, url: 'https://hooks.example.com/x', events: ['order.deleted'] }))) as { status: string }).status).toBe('error');
    expect(((await a.createEndpointAction(IDLE, fd({ organizationId: ORG, url: 'https://hooks.example.com/x', events: [] }))) as { status: string }).status).toBe('error');
    expect(h.rpc.webhookEndpointCreate).not.toHaveBeenCalled();
    const out = (await a.createEndpointAction(IDLE, fd({ organizationId: ORG, url: 'https://hooks.example.com/x', events: ['order.created', 'ping'] }))) as { status: string; secret: string };
    expect(out.secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(h.rpc.webhookEndpointCreate).toHaveBeenCalledWith(ORG, 'https://hooks.example.com/x', ['order.created', 'ping'], out.secret);
  });
  it('rotating a signing key returns the new key once and sends it; invalid ids are refused', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/api-keys/actions');
    expect(((await a.rotateEndpointAction(IDLE, fd({ organizationId: ORG, id: 'nope' }))) as { status: string }).status).toBe('error');
    expect(h.rpc.webhookEndpointRotate).not.toHaveBeenCalled();
    const out = (await a.rotateEndpointAction(IDLE, fd({ organizationId: ORG, id: ID }))) as { secret: string };
    expect(h.rpc.webhookEndpointRotate).toHaveBeenCalledWith(ORG, ID, out.secret);
  });
  it('revoke, pause/resume and test events validate their ids and call the RPC with exact values', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/api-keys/actions');
    await expect(a.revokeKeyAction(fd({ organizationId: ORG, id: 'x' }))).rejects.toThrow(/e=invalid_response/);
    await expect(a.revokeKeyAction(fd({ organizationId: ORG, id: ID }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.apiKeyRevoke).toHaveBeenCalledWith(ORG, ID);
    await expect(a.toggleEndpointAction(fd({ organizationId: ORG, id: ID, active: 'true' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.webhookEndpointSetActive).toHaveBeenCalledWith(ORG, ID, true);
    await expect(a.toggleEndpointAction(fd({ organizationId: ORG, id: ID, active: 'anything' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.webhookEndpointSetActive).toHaveBeenLastCalledWith(ORG, ID, false);
    await expect(a.testEndpointAction(fd({ organizationId: ORG, id: ID }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.webhookTest).toHaveBeenCalledWith(ORG, ID);
  });
  it('every exported customer action is covered', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', '(portal)', 'client', 'api-keys', 'actions.ts'), 'utf8');
    expect([...src.matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]).sort()).toEqual(['createEndpointAction', 'createKeyAction', 'revokeKeyAction', 'rotateEndpointAction', 'testEndpointAction', 'toggleEndpointAction']);
  });
});
