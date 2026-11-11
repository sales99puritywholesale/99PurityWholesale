import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { denyAllContext, parseStaffContext } from '@/lib/portal/permissions/context';
import type { StaffAccessContext } from '@/lib/portal/permissions/evaluate';

// Scenario tests for the P7 server actions with authentication and the staff context mocked. They prove the APPLICATION-side decision only (no RPC is even attempted without the
// right staff context; customer actions send only validated data). The database re-check (owner gate, stock rules, step-up) is the second layer and is NOT exercised here.
const h = vi.hoisted(() => {
  const ok = async () => ({ ok: true, data: {} });
  return {
    user: { id: 'u1', email: 'u@example.test' } as { id: string; email: string } | null,
    ctx: null as unknown,
    rpc: {
      adminWarehouseSave: vi.fn(ok), adminLocationSave: vi.fn(ok), adminReceiptReceive: vi.fn(ok), adminStockAdjust: vi.fn(ok), adminFoTransition: vi.fn(ok), adminExceptionResolve: vi.fn(ok),
      inboundCreate: vi.fn(ok), inboundCancel: vi.fn(ok), fulfillmentOrderCancel: vi.fn(ok),
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
vi.mock('@/lib/portal/inventory/server', async (orig) => ({ ...(await orig<object>()), ...h.rpc }));

const ORG = '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11';
const ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const KEY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
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
const WAREHOUSE_ROLES = ['operations', 'admin']; // inventory.adjust and fulfillment.process
const SETUP_ROLES = ['admin']; // org.manage

const ACTIONS: { name: string; allowed: string[]; form: Record<string, string | string[]>; rpc: keyof typeof h.rpc; path: RegExp }[] = [
  { name: 'saveWarehouseAction', allowed: SETUP_ROLES, form: { code: 'tx1', name: 'Texas 1' }, rpc: 'adminWarehouseSave', path: /^REDIRECT:\/admin\/inventory\?/ },
  { name: 'saveLocationAction', allowed: SETUP_ROLES, form: { warehouseId: ID, code: 'a-01', kind: 'storage' }, rpc: 'adminLocationSave', path: /^REDIRECT:\/admin\/inventory\?/ },
  { name: 'receiveAction', allowed: WAREHOUSE_ROLES, form: { receiptId: ID, lineId: [ID], units: ['5'], lot: ['LOT-1'], expires: [''], location: [ORG] }, rpc: 'adminReceiptReceive', path: /^REDIRECT:\/admin\/inventory\/receipts\// },
  { name: 'adjustAction', allowed: WAREHOUSE_ROLES, form: { skuMappingId: ID, lotId: ID, locationId: ORG, delta: '-2', reason: 'damaged', idempotencyKey: KEY }, rpc: 'adminStockAdjust', path: /^REDIRECT:\/admin\/inventory\?/ },
  { name: 'transitionAction', allowed: WAREHOUSE_ROLES, form: { orderId: ID, to: 'queued' }, rpc: 'adminFoTransition', path: /^REDIRECT:\/admin\/fulfillment\/orders\// },
  { name: 'resolveExceptionAction', allowed: WAREHOUSE_ROLES, form: { orderId: ID, id: ORG, resolution: 'restocked' }, rpc: 'adminExceptionResolve', path: /^REDIRECT:\/admin\/fulfillment\/orders\// },
];
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

beforeEach(() => {
  for (const f of Object.values(h.rpc)) f.mockClear();
});

describe('P7 staff actions: the staff context and capability are checked BEFORE any RPC call', () => {
  for (const a of ACTIONS) {
    describe(a.name, () => {
      for (const [label, sc] of Object.entries(SCENARIOS)) {
        const shouldRun = a.allowed.includes(label);
        it(`${label}: ${shouldRun ? 'reaches the RPC' : 'is refused and no RPC is called'}`, async () => {
          h.user = sc.user ? { id: 'u1', email: 'u@example.test' } : null;
          h.ctx = sc.ctx;
          const actions = await import('@/app/(portal)/admin/inventory-actions');
          const fn = (actions as unknown as Record<string, (f: FormData) => Promise<void>>)[a.name] as (f: FormData) => Promise<void>;
          let thrown = '';
          try { await fn(fd(a.form)); } catch (e) { thrown = (e as Error).message; }
          if (shouldRun) {
            expect(h.rpc[a.rpc]).toHaveBeenCalledTimes(1);
            expect(thrown).toMatch(a.path);
            expect(thrown).toMatch(/[?&]ok=1/);
          } else {
            expect(h.rpc[a.rpc]).not.toHaveBeenCalled();
            expect(thrown).toMatch(sc.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
          }
        });
      }
    });
  }
  it('every exported staff action is covered by this matrix', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', '(portal)', 'admin', 'inventory-actions.ts'), 'utf8');
    expect([...src.matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]).sort()).toEqual(ACTIONS.map((a) => a.name).sort());
  });
  it('invalid input never reaches an RPC (bad codes, zero or fractional corrections, missing reasons, shipping without tracking, cancelling without a reason, back to pending)', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const a = await import('@/app/(portal)/admin/inventory-actions');
    const bad: [(f: FormData) => Promise<void>, Record<string, string | string[]>][] = [
      [a.saveWarehouseAction, { code: 'x', name: 'n' }], [a.saveWarehouseAction, { code: 'TX1', name: '' }], [a.saveLocationAction, { warehouseId: ID, code: 'a b', kind: 'storage' }], [a.saveLocationAction, { warehouseId: ID, code: 'A1', kind: 'vault' }],
      [a.adjustAction, { skuMappingId: ID, lotId: ID, locationId: ORG, delta: '0', reason: 'x', idempotencyKey: KEY }], [a.adjustAction, { skuMappingId: ID, lotId: ID, locationId: ORG, delta: '1.5', reason: 'x', idempotencyKey: KEY }],
      [a.adjustAction, { skuMappingId: ID, lotId: ID, locationId: ORG, delta: '-2', reason: '', idempotencyKey: KEY }], [a.adjustAction, { skuMappingId: ID, lotId: ID, locationId: ORG, delta: '-2', reason: 'x', idempotencyKey: 'no' }],
      [a.transitionAction, { orderId: ID, to: 'shipped', carrier: 'UPS' }], [a.transitionAction, { orderId: ID, to: 'cancelled' }], [a.transitionAction, { orderId: ID, to: 'pending' }], [a.transitionAction, { orderId: ID, to: 'bogus' }],
      [a.receiveAction, { receiptId: ID, lineId: [ID], units: ['5'], lot: [''], expires: [''], location: [''] }], [a.receiveAction, { receiptId: ID, lineId: [ID], units: ['-1'], lot: ['L'], expires: [''], location: [ORG] }],
      [a.resolveExceptionAction, { orderId: ID, id: ORG, resolution: '' }],
    ];
    for (const [fn, form] of bad) await expect(fn(fd(form))).rejects.toThrow(/e=invalid_response/);
    for (const f of Object.values(h.rpc)) expect(f).not.toHaveBeenCalled();
  });
  it('sends exact validated values: shipping details, a lot with an expiry, an adjustment', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['operations']);
    const a = await import('@/app/(portal)/admin/inventory-actions');
    await expect(a.transitionAction(fd({ orderId: ID, to: 'shipped', carrier: 'UPS', service: 'Ground', trackingNumber: '1Z999', status: 'delivered' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminFoTransition).toHaveBeenCalledWith(ID, 'shipped', { carrier: 'UPS', service: 'Ground', tracking_number: '1Z999' });
    await expect(a.receiveAction(fd({ receiptId: ID, lineId: [ID, ORG], units: ['24', '0'], lot: ['LOT-9', ''], expires: ['2027-01-31', ''], location: [KEY, ''] }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminReceiptReceive).toHaveBeenCalledWith(ID, [{ line_id: ID, received_units: 24, lot_number: 'LOT-9', expires_on: '2027-01-31', location_id: KEY }, { line_id: ORG, received_units: 0 }]);
    await expect(a.adjustAction(fd({ skuMappingId: ID, lotId: ID, locationId: ORG, delta: '-3', reason: ' damaged ', idempotencyKey: KEY }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminStockAdjust).toHaveBeenCalledWith(ID, ID, ORG, -3, 'damaged', KEY);
  });
  it('database refusals are shown as codes (below_reserved, insufficient_stock, sandbox_order)', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const a = await import('@/app/(portal)/admin/inventory-actions');
    h.rpc.adminStockAdjust.mockResolvedValueOnce({ ok: false, code: 'below_reserved' } as never);
    await expect(a.adjustAction(fd({ skuMappingId: ID, lotId: ID, locationId: ORG, delta: '-3', reason: 'x', idempotencyKey: KEY }))).rejects.toThrow(/e=below_reserved/);
    h.rpc.adminFoTransition.mockResolvedValueOnce({ ok: false, code: 'insufficient_stock' } as never);
    await expect(a.transitionAction(fd({ orderId: ID, to: 'allocated' }))).rejects.toThrow(/e=insufficient_stock/);
  });
});

describe('P7 customer actions', () => {
  it('every action requires a signed-in user and calls nothing otherwise', async () => {
    h.user = null;
    const s = await import('@/app/(portal)/client/stock/actions');
    const o = await import('@/app/(portal)/client/fulfillment/orders/actions');
    await expect(s.createInboundAction(fd({ organizationId: ORG, reference: 'PO-1', sku0: ID, units0: '5' }))).rejects.toThrow(/^REDIRECT:\/login/);
    await expect(s.cancelInboundAction(fd({ organizationId: ORG, id: ID }))).rejects.toThrow(/^REDIRECT:\/login/);
    await expect(o.cancelFulfillmentOrderAction(fd({ organizationId: ORG, id: ID }))).rejects.toThrow(/^REDIRECT:\/login/);
    for (const f of Object.values(h.rpc)) expect(f).not.toHaveBeenCalled();
  });
  it('announces an inbound shipment with only the filled rows, exact numbers, and no status', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const s = await import('@/app/(portal)/client/stock/actions');
    await expect(s.createInboundAction(fd({ organizationId: ORG, reference: ' PO-1 ', sku0: ID, units0: '24', sku1: '', units1: '', sku2: KEY, units2: '6', status: 'received' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.inboundCreate).toHaveBeenCalledWith(ORG, 'PO-1', [{ sku_mapping_id: ID, expected_units: 24 }, { sku_mapping_id: KEY, expected_units: 6 }]);
  });
  it('rejects empty, duplicate, zero or negative inbound lines without calling the RPC', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const s = await import('@/app/(portal)/client/stock/actions');
    const forms: Record<string, string>[] = [{ reference: 'x' }, { reference: '', sku0: ID, units0: '5' }, { reference: 'x', sku0: ID, units0: '0' }, { reference: 'x', sku0: ID, units0: '-4' }, { reference: 'x', sku0: ID, units0: '5', sku1: ID, units1: '5' }, { reference: 'x', sku0: 'nope', units0: '5' }];
    for (const form of forms) {
      await expect(s.createInboundAction(fd({ organizationId: ORG, ...form }))).rejects.toThrow(/e=invalid_response/);
    }
    expect(h.rpc.inboundCreate).not.toHaveBeenCalled();
  });
  it('cancel actions validate ids and pass the organization, showing the database code on refusal', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const s = await import('@/app/(portal)/client/stock/actions');
    const o = await import('@/app/(portal)/client/fulfillment/orders/actions');
    await expect(s.cancelInboundAction(fd({ organizationId: ORG, id: 'x' }))).rejects.toThrow(/e=invalid_response/);
    await expect(s.cancelInboundAction(fd({ organizationId: ORG, id: ID }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.inboundCancel).toHaveBeenCalledWith(ORG, ID);
    h.rpc.fulfillmentOrderCancel.mockResolvedValueOnce({ ok: false, code: 'invalid_transition' } as never);
    await expect(o.cancelFulfillmentOrderAction(fd({ organizationId: ORG, id: ID }))).rejects.toThrow(/e=invalid_transition/);
    expect(h.rpc.fulfillmentOrderCancel).toHaveBeenCalledWith(ORG, ID);
  });
  it('every exported customer action is covered', () => {
    const base = join(process.cwd(), 'src', 'app', '(portal)', 'client');
    const names = (p: string) => [...readFileSync(join(base, p), 'utf8').matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]).sort();
    expect(names('stock/actions.ts')).toEqual(['cancelInboundAction', 'createInboundAction']);
    expect(names('fulfillment/orders/actions.ts')).toEqual(['cancelFulfillmentOrderAction']);
  });
});
