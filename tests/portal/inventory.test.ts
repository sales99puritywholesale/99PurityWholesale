import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FO_STATUSES, FO_TRANSITIONS, NEXT_STEP, allocateFefo, applyMovement, availableOf, canAdjust, canCustomerCancel, canFoTransition, canStaffCancel, customerLabel, isFoFinal, replayMovements, totalAvailable, usable,
  type Balance, type MovementType,
} from '@/lib/portal/inventory/fulfillment';
import { adjustSchema, inboundCreateSchema, receiveSchema, transitionSchema } from '@/lib/portal/inventory/schemas';
import { messageFor } from '@/lib/portal/commerce/messages';

const id = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f';
const TODAY = '2026-11-11';
const bal = (o: Partial<Balance> & { lotId: string }): Balance => ({ locationId: 'L1', onHand: 10, reserved: 0, expiresOn: null, createdAt: '2026-01-01', quarantine: false, active: true, ...o });

describe('fulfillment lifecycle', () => {
  it('equals the transition function of the P6 migration (the database is authoritative)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'review', 'p6', '20261111000300_p6_api_integrations.sql'), 'utf8');
    const body = /create function private\.fo_transition_ok[\s\S]*?\$\$;/.exec(sql)?.[0] ?? '';
    const pairs = [...body.matchAll(/\('([a-z]+)', '([a-z]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const model = Object.entries(FO_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)).sort();
    expect(pairs).toEqual(model);
  });
  it('has nine statuses, two final states and a single forward path', () => {
    expect(FO_STATUSES.length).toBe(9);
    expect(FO_STATUSES.filter(isFoFinal)).toEqual(['delivered', 'cancelled']);
    let s = 'pending' as (typeof FO_STATUSES)[number];
    const path = [s];
    while (NEXT_STEP[s]) { s = NEXT_STEP[s]!.to; path.push(s); }
    expect(path).toEqual(['pending', 'queued', 'allocated', 'picked', 'packed', 'ready', 'shipped', 'delivered']);
    for (const [from, step] of Object.entries(NEXT_STEP)) if (step) expect(canFoTransition(from as never, step.to)).toBe(true);
  });
  it('nothing goes backwards and shipped orders cannot be cancelled', () => {
    expect(canFoTransition('shipped', 'cancelled')).toBe(false);
    expect(canFoTransition('ready', 'cancelled')).toBe(false);
    expect(canFoTransition('delivered', 'pending')).toBe(false);
    expect(canFoTransition('packed', 'picked')).toBe(false);
    expect(canStaffCancel('packed')).toBe(true);
    expect(canStaffCancel('ready')).toBe(false);
  });
  it('a customer may cancel only before allocation', () => {
    expect(['pending', 'queued'].every((s) => canCustomerCancel(s as never))).toBe(true);
    expect(['allocated', 'picked', 'packed', 'ready', 'shipped', 'delivered', 'cancelled'].some((s) => canCustomerCancel(s as never))).toBe(false);
  });
  it('shows customers the short list of labels and marks sandbox orders', () => {
    expect(customerLabel('pending', true)).toBe('Sandbox order');
    expect(customerLabel('pending', false)).toBe('Received');
    expect(['queued', 'allocated', 'picked', 'packed'].map((s) => customerLabel(s as never, false))).toEqual(Array(4).fill('Preparing shipment'));
    expect(customerLabel('ready', false)).toBe('Ready');
    expect(customerLabel('shipped', false)).toBe('In transit');
    expect(customerLabel('delivered', false)).toBe('Delivered');
    expect(customerLabel('cancelled', false)).toBe('Cancelled');
  });
});

describe('availability', () => {
  it('counts only usable balances: not quarantined, active, not expired (expiring today is usable)', () => {
    expect(usable(bal({ lotId: 'a' }), TODAY)).toBe(true);
    expect(usable(bal({ lotId: 'a', quarantine: true }), TODAY)).toBe(false);
    expect(usable(bal({ lotId: 'a', active: false }), TODAY)).toBe(false);
    expect(usable(bal({ lotId: 'a', expiresOn: '2026-11-10' }), TODAY)).toBe(false);
    expect(usable(bal({ lotId: 'a', expiresOn: TODAY }), TODAY)).toBe(true);
    expect(usable(bal({ lotId: 'a', onHand: 5, reserved: 5 }), TODAY)).toBe(false);
    expect(totalAvailable([bal({ lotId: 'a', onHand: 10, reserved: 3 }), bal({ lotId: 'b', onHand: 4, quarantine: true }), bal({ lotId: 'c', onHand: 6, expiresOn: '2026-01-01' })], TODAY)).toBe(7);
    expect(availableOf({ onHand: 10, reserved: 4 })).toBe(6);
  });
});

describe('FEFO allocation (mirrors private.fo_allocate)', () => {
  it('takes the earliest-expiring lot first, no expiry last, then the oldest lot', () => {
    const balances = { S1: [bal({ lotId: 'noexp', onHand: 100 }), bal({ lotId: 'late', onHand: 10, expiresOn: '2027-06-01' }), bal({ lotId: 'early', onHand: 5, expiresOn: '2026-12-01' }), bal({ lotId: 'old-noexp', onHand: 5, createdAt: '2025-01-01' })] };
    const r = allocateFefo([{ lineId: 'l1', skuId: 'S1', quantity: 18 }], balances, TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.takes.l1).toEqual([{ lotId: 'early', locationId: 'L1', qty: 5 }, { lotId: 'late', locationId: 'L1', qty: 10 }, { lotId: 'old-noexp', locationId: 'L1', qty: 3 }]);
  });
  it('is all or nothing: one short line fails the whole order and reserves nothing', () => {
    const balances = { S1: [bal({ lotId: 'a', onHand: 10 })], S2: [bal({ lotId: 'b', onHand: 2 })] };
    const input = JSON.stringify(balances);
    const r = allocateFefo([{ lineId: 'l1', skuId: 'S1', quantity: 5 }, { lineId: 'l2', skuId: 'S2', quantity: 3 }], balances, TODAY);
    expect(r).toEqual({ ok: false, shortLines: ['l2'] });
    expect(JSON.stringify(balances)).toBe(input); // the input is never mutated
  });
  it('skips expired lots and quarantine locations and respects units already reserved', () => {
    const balances = { S1: [bal({ lotId: 'exp', onHand: 50, expiresOn: '2026-01-01' }), bal({ lotId: 'q', onHand: 50, quarantine: true }), bal({ lotId: 'ok', onHand: 10, reserved: 7 })] };
    expect(allocateFefo([{ lineId: 'l1', skuId: 'S1', quantity: 4 }], balances, TODAY).ok).toBe(false);
    const r = allocateFefo([{ lineId: 'l1', skuId: 'S1', quantity: 3 }], balances, TODAY);
    expect(r.ok && r.takes.l1).toEqual([{ lotId: 'ok', locationId: 'L1', qty: 3 }]);
  });
  it('two lines of the same SKU in one order cannot both take the same units', () => {
    const balances = { S1: [bal({ lotId: 'a', onHand: 5 })] };
    expect(allocateFefo([{ lineId: 'l1', skuId: 'S1', quantity: 5 }], balances, TODAY).ok).toBe(true);
    // different lines carry different SKUs in the database (unique per order and mapping), but the planner must still never over-allocate a balance
    const r = allocateFefo([{ lineId: 'a', skuId: 'S1', quantity: 3 }, { lineId: 'b', skuId: 'S1', quantity: 3 }], balances, TODAY);
    expect(r.ok).toBe(false);
  });
});

describe('ledger invariants (mirrors private.inv_move and private.inv_reconcile)', () => {
  it('applies each movement type exactly as the SQL does', () => {
    expect(applyMovement({ onHand: 0, reserved: 0 }, 'receive', 10)).toEqual({ onHand: 10, reserved: 0 });
    expect(applyMovement({ onHand: 10, reserved: 0 }, 'reserve', 4)).toEqual({ onHand: 10, reserved: 4 });
    expect(applyMovement({ onHand: 10, reserved: 4 }, 'release', 4)).toEqual({ onHand: 10, reserved: 0 });
    expect(applyMovement({ onHand: 10, reserved: 4 }, 'consume', 4)).toEqual({ onHand: 6, reserved: 0 });
    expect(applyMovement({ onHand: 10, reserved: 4 }, 'adjust_minus', 6)).toEqual({ onHand: 4, reserved: 4 });
    expect(applyMovement({ onHand: 10, reserved: 4 }, 'adjust_plus', 2)).toEqual({ onHand: 12, reserved: 4 });
  });
  it('refuses negative stock, over-reservation, consuming unreserved stock and bad quantities', () => {
    expect(() => applyMovement({ onHand: 5, reserved: 0 }, 'adjust_minus', 6)).toThrow();
    expect(() => applyMovement({ onHand: 5, reserved: 4 }, 'adjust_minus', 2)).toThrow(); // would drop below reserved
    expect(() => applyMovement({ onHand: 5, reserved: 5 }, 'reserve', 1)).toThrow();
    expect(() => applyMovement({ onHand: 5, reserved: 0 }, 'release', 1)).toThrow();
    expect(() => applyMovement({ onHand: 5, reserved: 0 }, 'consume', 1)).toThrow();
    for (const q of [0, -1, 1.5, 1_000_001]) expect(() => applyMovement({ onHand: 5, reserved: 0 }, 'receive', q)).toThrow(RangeError);
  });
  it('replaying any valid sequence of movements never breaks 0 <= reserved <= on hand (randomized)', () => {
    let seed = 12345;
    const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
    for (let run = 0; run < 200; run++) {
      let state = { onHand: 0, reserved: 0 };
      const moves: { type: MovementType; qty: number }[] = [];
      for (let i = 0; i < 60; i++) {
        const type = (['receive', 'adjust_plus', 'adjust_minus', 'reserve', 'release', 'consume'] as const)[rnd(6)]!;
        const qty = 1 + rnd(20);
        try { state = applyMovement(state, type, qty); moves.push({ type, qty }); } catch { /* a refused movement is simply not posted */ }
        expect(state.onHand).toBeGreaterThanOrEqual(0);
        expect(state.reserved).toBeGreaterThanOrEqual(0);
        expect(state.reserved).toBeLessThanOrEqual(state.onHand);
      }
      expect(replayMovements(moves)).toEqual(state); // balance == ledger
    }
  });
  it('a stock correction can never go below what is reserved', () => {
    expect(canAdjust(10, 4, -6)).toBe(true);
    expect(canAdjust(10, 4, -7)).toBe(false);
    expect(canAdjust(10, 4, 5)).toBe(true);
    expect(canAdjust(10, 4, 0)).toBe(false);
    expect(canAdjust(10, 4, 1.5)).toBe(false);
    expect(canAdjust(10, 4, 1_000_001)).toBe(false);
  });
});

describe('validation', () => {
  const ln = { sku_mapping_id: id, expected_units: 24 };
  it('inbound notices need unique SKU lines with positive units', () => {
    expect(inboundCreateSchema.safeParse({ organizationId: id, reference: 'PO-1', lines: [ln] }).success).toBe(true);
    expect(inboundCreateSchema.safeParse({ organizationId: id, reference: '', lines: [ln] }).success).toBe(false);
    expect(inboundCreateSchema.safeParse({ organizationId: id, reference: 'x', lines: [] }).success).toBe(false);
    expect(inboundCreateSchema.safeParse({ organizationId: id, reference: 'x', lines: [ln, ln] }).success).toBe(false);
    expect(inboundCreateSchema.safeParse({ organizationId: id, reference: 'x', lines: [{ ...ln, expected_units: 0 }] }).success).toBe(false);
    expect(inboundCreateSchema.safeParse({ organizationId: id, reference: 'x', lines: [ln], status: 'received' }).success).toBe(false);
  });
  it('receiving needs a lot number and location for any received units; zero units need neither', () => {
    const base = { line_id: id };
    expect(receiveSchema.safeParse({ receiptId: id, lines: [{ ...base, received_units: 0 }] }).success).toBe(true);
    expect(receiveSchema.safeParse({ receiptId: id, lines: [{ ...base, received_units: 5 }] }).success).toBe(false);
    expect(receiveSchema.safeParse({ receiptId: id, lines: [{ ...base, received_units: 5, lot_number: 'LOT-1', location_id: id, expires_on: '2027-01-31' }] }).success).toBe(true);
    expect(receiveSchema.safeParse({ receiptId: id, lines: [{ ...base, received_units: 5, lot_number: 'bad lot', location_id: id }] }).success).toBe(false);
    expect(receiveSchema.safeParse({ receiptId: id, lines: [{ ...base, received_units: 5, lot_number: 'L', location_id: id, expires_on: '2027-02-31x' }] }).success).toBe(false);
  });
  it('adjustments need a reason, a non-zero delta and an idempotency key', () => {
    const ok = { skuMappingId: id, lotId: id, locationId: id, delta: -3, reason: 'damaged in handling', idempotencyKey: id };
    expect(adjustSchema.safeParse(ok).success).toBe(true);
    expect(adjustSchema.safeParse({ ...ok, delta: 0 }).success).toBe(false);
    expect(adjustSchema.safeParse({ ...ok, reason: '' }).success).toBe(false);
    expect(adjustSchema.safeParse({ ...ok, delta: 1.5 }).success).toBe(false);
  });
  it('shipping needs a carrier and a tracking number; cancelling needs a reason; nothing moves back to pending', () => {
    expect(transitionSchema.safeParse({ orderId: id, to: 'shipped', carrier: 'UPS', trackingNumber: '1Z999' }).success).toBe(true);
    expect(transitionSchema.safeParse({ orderId: id, to: 'shipped', carrier: 'UPS' }).success).toBe(false);
    expect(transitionSchema.safeParse({ orderId: id, to: 'cancelled' }).success).toBe(false);
    expect(transitionSchema.safeParse({ orderId: id, to: 'cancelled', reason: 'customer request' }).success).toBe(true);
    expect(transitionSchema.safeParse({ orderId: id, to: 'pending' }).success).toBe(false);
    expect(transitionSchema.safeParse({ orderId: id, to: 'picked', status: 'shipped' }).success).toBe(false);
  });
  it('inventory result codes resolve in the shared banner', () => {
    expect(messageFor('below_reserved')).toMatch(/reserved/);
    expect(messageFor('insufficient_stock')).toMatch(/not enough/);
    expect(messageFor('step_locked')).toMatch(/earlier steps/);
  });
});
