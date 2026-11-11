import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { denyAllContext, parseStaffContext } from '@/lib/portal/permissions/context';
import type { StaffAccessContext } from '@/lib/portal/permissions/evaluate';

// Scenario tests for the P4 server actions with authentication and the staff context mocked. They prove the APPLICATION-side decision only (no RPC is even attempted without
// the right staff context, and the customer action sends only validated claim data). The database re-check (staff_gate, owner check, invoice lock) is the second layer and is
// NOT exercised here: no database is involved.
const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'u@example.test' } as { id: string; email: string } | null,
  ctx: null as unknown,
  rpc: {
    adminPaymentConfirm: vi.fn(async () => ({ ok: true, data: {} })),
    adminPaymentReject: vi.fn(async () => ({ ok: true, data: {} })),
    adminInvoiceVoid: vi.fn(async () => ({ ok: true, data: {} })),
    paymentReport: vi.fn(async (_i: unknown) => ({ ok: true, data: {} })),
  },
}));

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
vi.mock('@/lib/portal/billing/server', async (orig) => ({ ...(await orig<object>()), ...h.rpc }));

const ID = '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11';
const ID2 = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
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
const MONEY_ROLES = ['finance', 'admin'];

const ACTIONS: { name: string; allowed: string[]; form: Record<string, string>; rpc: keyof typeof h.rpc }[] = [
  { name: 'confirmPaymentAction', allowed: MONEY_ROLES, form: { paymentId: ID, amount: '10.00', receivedOn: '2026-11-10', from: 'queue' }, rpc: 'adminPaymentConfirm' },
  { name: 'rejectPaymentAction', allowed: MONEY_ROLES, form: { paymentId: ID, outcome: 'rejected', note: 'not received', from: 'queue' }, rpc: 'adminPaymentReject' },
  { name: 'voidInvoiceAction', allowed: MONEY_ROLES, form: { invoiceId: ID, reason: 'duplicate order', from: 'invoice' }, rpc: 'adminInvoiceVoid' },
];
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  for (const f of Object.values(h.rpc)) f.mockClear();
});

describe('P4 staff actions: the staff context and capability are checked BEFORE any RPC call', () => {
  for (const a of ACTIONS) {
    describe(a.name, () => {
      for (const [label, sc] of Object.entries(SCENARIOS)) {
        const shouldRun = a.allowed.includes(label);
        it(`${label}: ${shouldRun ? 'reaches the RPC' : 'is refused and no RPC is called'}`, async () => {
          h.user = sc.user ? { id: 'u1', email: 'u@example.test' } : null;
          h.ctx = sc.ctx;
          const actions = await import('@/app/(portal)/admin/billing-actions');
          const fn = (actions as unknown as Record<string, (f: FormData) => Promise<void>>)[a.name] as (f: FormData) => Promise<void>;
          let thrown = '';
          try {
            await fn(fd(a.form));
          } catch (e) {
            thrown = (e as Error).message;
          }
          if (shouldRun) {
            expect(h.rpc[a.rpc]).toHaveBeenCalledTimes(1);
            expect(thrown).toMatch(/^REDIRECT:\/admin\/invoices.*[?&]ok=1/);
          } else {
            expect(h.rpc[a.rpc]).not.toHaveBeenCalled();
            expect(thrown).toMatch(sc.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
          }
        });
      }
    });
  }
  it('every exported staff action is covered by this matrix', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', '(portal)', 'admin', 'billing-actions.ts'), 'utf8');
    expect([...src.matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]).sort()).toEqual(ACTIONS.map((a) => a.name).sort());
  });
  it('invalid input never reaches the RPC (no amount, bad date, missing reason, unknown outcome)', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['finance']);
    const a = await import('@/app/(portal)/admin/billing-actions');
    const bad: [(f: FormData) => Promise<void>, Record<string, string>][] = [
      [a.confirmPaymentAction, { paymentId: ID, amount: '', receivedOn: '2026-11-10' }],
      [a.confirmPaymentAction, { paymentId: ID, amount: '0', receivedOn: '2026-11-10' }],
      [a.confirmPaymentAction, { paymentId: ID, amount: '10.123', receivedOn: '2026-11-10' }],
      [a.confirmPaymentAction, { paymentId: ID, amount: '10', receivedOn: 'yesterday' }],
      [a.confirmPaymentAction, { paymentId: 'not-a-uuid', amount: '10', receivedOn: '2026-11-10' }],
      [a.rejectPaymentAction, { paymentId: ID, outcome: 'rejected', note: '' }],
      [a.rejectPaymentAction, { paymentId: ID, outcome: 'confirmed', note: 'x' }],
      [a.voidInvoiceAction, { invoiceId: ID, reason: '' }],
    ];
    for (const [fn, form] of bad) {
      await expect(fn(fd(form))).rejects.toThrow(/e=invalid_response/);
    }
    for (const f of Object.values(h.rpc)) expect(f).not.toHaveBeenCalled();
  });
  it('the confirmed amount is converted to exact integer cents', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['finance']);
    const a = await import('@/app/(portal)/admin/billing-actions');
    await expect(a.confirmPaymentAction(fd({ paymentId: ID, amount: '$1,234.50', receivedOn: '2026-11-10', bankReference: 'WIRE-77' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminPaymentConfirm).toHaveBeenCalledWith(ID, 123450, '2026-11-10', 'WIRE-77', undefined);
  });
  it('the return path can only be the queue or an invoice page', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['finance']);
    const a = await import('@/app/(portal)/admin/billing-actions');
    await expect(a.voidInvoiceAction(fd({ invoiceId: '../../etc/passwd', reason: 'x', from: 'invoice' }))).rejects.toThrow(/^REDIRECT:\/admin\/invoices\/payments\?/);
    await expect(a.rejectPaymentAction(fd({ paymentId: ID, outcome: 'duplicate', note: 'x', from: 'https://evil.test' }))).rejects.toThrow(/^REDIRECT:\/admin\/invoices\/payments\?/);
    await expect(a.rejectPaymentAction(fd({ paymentId: ID, outcome: 'duplicate', note: 'x', from: 'invoice', invoiceId: ID2 }))).rejects.toThrow(new RegExp(`^REDIRECT:/admin/invoices/${ID2}\\?`));
  });
});

describe('P4 customer action: report a payment', () => {
  const good = { organizationId: ID, invoiceId: ID2, method: 'zelle', amount: '264.60', idempotencyKey: '7c9e6679-7425-40de-944b-e07fc1f90ae7' };
  it('requires a signed-in user and calls nothing otherwise', async () => {
    h.user = null;
    const a = await import('@/app/(portal)/client/purchases/actions');
    await expect(a.reportPaymentAction(fd(good))).rejects.toThrow(/^REDIRECT:\/login/);
    expect(h.rpc.paymentReport).not.toHaveBeenCalled();
  });
  it('sends only the validated claim (exact cents, no status, no confirmed amount) and returns to the invoice', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/purchases/actions');
    await expect(a.reportPaymentAction(fd({ ...good, reference: 'ZEL123', status: 'confirmed', confirmedCents: '26460', paidCents: '26460' }))).rejects.toThrow(new RegExp(`^REDIRECT:/client/purchases/${ID2}\\?.*ok=1`));
    expect(h.rpc.paymentReport).toHaveBeenCalledTimes(1);
    const sent = h.rpc.paymentReport.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toEqual({ organizationId: ID, invoiceId: ID2, method: 'zelle', amountCents: 26460, reference: 'ZEL123', idempotencyKey: good.idempotencyKey });
    expect(Object.keys(sent)).not.toContain('status');
    expect(Object.keys(sent)).not.toContain('confirmedCents');
  });
  it('rejects an invalid amount, method, date or idempotency key without calling the RPC', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/purchases/actions');
    const overrides: Record<string, string>[] = [{ amount: '' }, { amount: '0' }, { amount: '-5' }, { amount: '1.999' }, { method: 'bitcoin' }, { sentOn: '2026-99-99' }, { idempotencyKey: 'abc' }];
    for (const over of overrides) {
      await expect(a.reportPaymentAction(fd({ ...good, ...over }))).rejects.toThrow(/e=invalid_response/);
    }
    expect(h.rpc.paymentReport).not.toHaveBeenCalled();
  });
  it('shows the database result code (for example owner_required) without echoing anything else', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.rpc.paymentReport.mockResolvedValueOnce({ ok: false, code: 'owner_required' } as never);
    const a = await import('@/app/(portal)/client/purchases/actions');
    await expect(a.reportPaymentAction(fd(good))).rejects.toThrow(/e=owner_required/);
  });
});
