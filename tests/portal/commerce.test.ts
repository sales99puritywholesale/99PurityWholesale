import { describe, expect, it } from 'vitest';
import {
  MAX_FIXED_E4,
  MAX_LINE_QUANTITY,
  MAX_ORDER_TOTAL_CENTS,
  MAX_PERCENT_E4,
  composePrice,
  formatE4,
  formatUsd,
  parseDecimalToE4,
  parseMarkupValue,
  parseUsdToCents,
  priceCart,
  unitPriceCents,
} from '@/lib/portal/commerce/pricing';
import { ORDER_STATUSES, ORDER_TRANSITIONS, canTransition, isFinalStatus, isOrderStatus } from '@/lib/portal/commerce/orders';
import { cartSetItemSchema, checkoutSchema, markupRuleSchema, orderStatusSchema, setVariantPriceSchema } from '@/lib/portal/commerce/schemas';
import { messageFor } from '@/lib/portal/commerce/messages';

const ID = '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11';
const ID2 = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

describe('composePrice: base, organization markup, representative markup on the organization price, floor (Aspen semantics)', () => {
  const u = (base: number | null, floor: number | null, org: [('percent' | 'fixed'), number] | null, rep: [('percent' | 'fixed'), number] | null = null) =>
    unitPriceCents({ baseCents: base, floorCents: floor, org: org && { type: org[0], valueE4: org[1] }, rep: rep && { type: rep[0], valueE4: rep[1] } });
  it('percent and fixed markups', () => {
    expect(u(10_000, 1000, ['percent', 250_000])).toBe(12_500);
    expect(u(10_000, 1000, ['fixed', 50_000])).toBe(10_500);
    expect(u(10_000, 1000, null)).toBe(10_000);
  });
  it('the representative markup compounds on the organization price and each amount is rounded to cents', () => {
    expect(u(10_000, 1000, ['percent', 250_000], ['percent', 50_000])).toBe(13_125);
    expect(u(333, 100, ['percent', 100_000], ['percent', 100_000])).toBe(403);
  });
  it('a floor raises the price, never lowers it; both base and floor are required', () => {
    expect(u(10_000, 15_000, ['percent', 250_000])).toBe(15_000);
    expect(u(10_000, 5_000, ['percent', 250_000])).toBe(12_500);
    expect(u(10_000, null, null)).toBeNull();
    expect(u(null, 1000, null)).toBeNull();
    expect(u(0, 1000, null)).toBeNull();
    expect(u(10_000, 0, null)).toBeNull();
  });
  it('invalid inputs fail closed', () => {
    expect(u(1.5, 100, null)).toBeNull();
    expect(u(100, 100, ['percent', -1])).toBeNull();
    expect(u(100, 100, ['percent', MAX_PERCENT_E4 + 1])).toBeNull();
    expect(u(100, 100, ['fixed', MAX_FIXED_E4 + 1])).toBeNull();
    expect(u(100, 100, ['percent', Number.NaN])).toBeNull();
    expect(u(100_000_000, 1000, ['percent', MAX_PERCENT_E4])).toBeNull(); // above the unit cap
  });
  it('the breakdown is complete and never negative or fractional', () => {
    const b = composePrice({ baseCents: 12_345, floorCents: 100, org: { type: 'percent', valueE4: 123_456 }, rep: { type: 'fixed', valueE4: 12_345 }, bounds: { minFixedE4: 20_000 } });
    expect(b).not.toBeNull();
    expect(b!.repClamped).toBe(true);
    expect(b!.repValueE4).toBe(20_000);
    for (const n of [b!.orgAmount, b!.orgPrice, b!.repAmount, b!.raw, b!.unit]) expect(Number.isInteger(n) && n >= 0).toBe(true);
    expect(b!.unit).toBe(Math.max(b!.raw, b!.floor));
  });
});

describe('cart totals', () => {
  it('prices lines and sums the subtotal', () => {
    const r = priceCart([{ variantId: 'a', quantity: 2, unitCents: 1250 }, { variantId: 'b', quantity: 1, unitCents: 99 }]);
    expect(r).toEqual({ ok: true, lines: [{ variantId: 'a', quantity: 2, unitCents: 1250, lineCents: 2500 }, { variantId: 'b', quantity: 1, unitCents: 99, lineCents: 99 }], subtotalCents: 2599 });
  });
  it('refuses empty carts, unpriced lines, bad quantities and duplicate variants as a whole', () => {
    expect(priceCart([])).toEqual({ ok: false, code: 'empty' });
    expect(priceCart([{ variantId: 'a', quantity: 1, unitCents: null }])).toEqual({ ok: false, code: 'unpriced_line' });
    expect(priceCart([{ variantId: 'a', quantity: 0, unitCents: 1 }])).toEqual({ ok: false, code: 'invalid_quantity' });
    expect(priceCart([{ variantId: 'a', quantity: MAX_LINE_QUANTITY + 1, unitCents: 1 }])).toEqual({ ok: false, code: 'invalid_quantity' });
    expect(priceCart([{ variantId: 'a', quantity: 1, unitCents: 1 }, { variantId: 'a', quantity: 1, unitCents: 1 }])).toEqual({ ok: false, code: 'duplicate_line' });
    expect(priceCart(Array.from({ length: 101 }, (_, i) => ({ variantId: `v${i}`, quantity: 1, unitCents: 1 })))).toEqual({ ok: false, code: 'too_many_lines' });
  });
  it('L2: a total above the order limit is refused with a clear code (the database does the same: order_too_large) instead of a constraint error', () => {
    const lines = Array.from({ length: 100 }, (_, i) => ({ variantId: `v${i}`, quantity: MAX_LINE_QUANTITY, unitCents: 100_000_000 }));
    expect(priceCart(lines)).toEqual({ ok: false, code: 'order_too_large' });
    const ok = priceCart([{ variantId: 'a', quantity: MAX_LINE_QUANTITY, unitCents: 100_000_000 }]);
    expect(ok.ok && ok.subtotalCents).toBe(1_000_000_000_000);
    expect(MAX_ORDER_TOTAL_CENTS).toBe(1_000_000_000_000);
    expect(messageFor('order_too_large')).toMatch(/maximum order size/);
  });
});

describe('money and markup parsing', () => {
  it('parses plain positive dollar amounts only', () => {
    expect(parseUsdToCents('12')).toBe(1200);
    expect(parseUsdToCents('12.5')).toBe(1250);
    expect(parseUsdToCents('0.07')).toBe(7);
    for (const bad of ['', '0', '0.00', '-1', '1.234', '1,000', '$5', 'abc', '1e3', '12.', '9999999999']) expect(parseUsdToCents(bad), bad).toBeNull();
  });
  it('parses decimals with up to four places to units of 1e-4 and checks the type maximum', () => {
    expect(parseDecimalToE4('25')).toBe(250_000);
    expect(parseDecimalToE4('12.5')).toBe(125_000);
    expect(parseDecimalToE4('0.0625')).toBe(625);
    expect(parseMarkupValue('percent', '1000')).toBe(MAX_PERCENT_E4);
    expect(parseMarkupValue('percent', '1000.0001')).toBeNull();
    expect(parseMarkupValue('fixed', '1000000')).toBe(MAX_FIXED_E4);
    expect(parseMarkupValue('fixed', '1000000.0001')).toBeNull();
    for (const bad of ['', '-5', '5.12345', 'x', '1e2', '12345678']) expect(parseDecimalToE4(bad), bad).toBeNull();
  });
  it('formats cents and e4 values', () => {
    expect(formatUsd(123456)).toBe('$1,234.56');
    expect(formatE4(250_000)).toBe('25');
    expect(formatE4(125_000)).toBe('12.5');
    expect(formatE4(625)).toBe('0.0625');
    expect(formatE4(0)).toBe('0');
  });
});

describe('L3: result-code mapping ignores inherited object keys', () => {
  it('returns fixed copy for known codes and a generic message for everything else, including prototype keys', () => {
    expect(messageFor('cart_full')).toBe('Your cart has too many lines.');
    for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'unknown_code']) {
      expect(typeof messageFor(k), k).toBe('string');
      expect(messageFor(k), k).toBe('Something went wrong. Please try again.');
    }
  });
});

describe('order lifecycle', () => {
  it('has the documented states and only forward transitions, with cancellation before shipping', () => {
    expect(ORDER_STATUSES).toEqual(['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']);
    expect(canTransition('placed', 'confirmed')).toBe(true);
    expect(canTransition('processing', 'cancelled')).toBe(true);
    expect(canTransition('shipped', 'cancelled')).toBe(false);
    expect(canTransition('confirmed', 'placed')).toBe(false);
    expect(canTransition('placed', 'shipped')).toBe(false);
    expect(canTransition('delivered', 'cancelled')).toBe(false);
  });
  it('final states have no exits and every target is a known status', () => {
    expect(isFinalStatus('delivered')).toBe(true);
    expect(isFinalStatus('cancelled')).toBe(true);
    for (const [from, tos] of Object.entries(ORDER_TRANSITIONS)) for (const t of tos) expect(isOrderStatus(t) && isOrderStatus(from)).toBe(true);
  });
});

describe('input schemas are strict', () => {
  it('cart item: ids and quantity bounds; unknown keys rejected (no client price)', () => {
    expect(cartSetItemSchema.safeParse({ organizationId: ID, variantId: ID2, quantity: 3 }).success).toBe(true);
    expect(cartSetItemSchema.safeParse({ organizationId: ID, variantId: ID2, quantity: 3, unitCents: 1 }).success).toBe(false);
    expect(cartSetItemSchema.safeParse({ organizationId: 'x', variantId: ID2, quantity: 3 }).success).toBe(false);
    expect(cartSetItemSchema.safeParse({ organizationId: ID, variantId: ID2, quantity: 10_001 }).success).toBe(false);
  });
  it('checkout: a complete address and an idempotency key, no price fields', () => {
    const shipTo = { name: 'Lab', line1: '1 Main St', city: 'Austin', region: 'TX', postal: '78701', country: 'US' };
    expect(checkoutSchema.safeParse({ organizationId: ID, shipTo, idempotencyKey: ID2 }).success).toBe(true);
    expect(checkoutSchema.safeParse({ organizationId: ID, shipTo }).success).toBe(false); // the key is required (L1)
    expect(checkoutSchema.safeParse({ organizationId: ID, shipTo, idempotencyKey: 'nope' }).success).toBe(false);
    expect(checkoutSchema.safeParse({ organizationId: ID, shipTo: { ...shipTo, country: 'usa' }, idempotencyKey: ID2 }).success).toBe(false);
    expect(checkoutSchema.safeParse({ organizationId: ID, shipTo, idempotencyKey: ID2, totalCents: 1 }).success).toBe(false);
  });
  it('variant price: base and floor are positive or cleared', () => {
    expect(setVariantPriceSchema.safeParse({ variantId: ID, baseCents: 1000, floorCents: 1100 }).success).toBe(true);
    expect(setVariantPriceSchema.safeParse({ variantId: ID, baseCents: null, floorCents: null }).success).toBe(true);
    expect(setVariantPriceSchema.safeParse({ variantId: ID, baseCents: 0, floorCents: 100 }).success).toBe(false);
    expect(setVariantPriceSchema.safeParse({ variantId: ID, baseCents: 100, floorCents: -1 }).success).toBe(false);
  });
  it('markup rule: type-specific caps, bounds on organization rules only, bounds in order', () => {
    const base = { organizationId: ID, kind: 'organization' as const, productId: null, type: 'percent' as const, valueE4: 250_000, repMinPercentE4: null, repMaxPercentE4: null, repMinFixedE4: null, repMaxFixedE4: null, active: true };
    expect(markupRuleSchema.safeParse(base).success).toBe(true);
    expect(markupRuleSchema.safeParse({ ...base, productId: ID2, type: 'fixed', valueE4: 50_000 }).success).toBe(true);
    expect(markupRuleSchema.safeParse({ ...base, valueE4: MAX_PERCENT_E4 + 1 }).success).toBe(false);
    expect(markupRuleSchema.safeParse({ ...base, type: 'fixed', valueE4: MAX_FIXED_E4 }).success).toBe(true);
    expect(markupRuleSchema.safeParse({ ...base, kind: 'representative', repMaxPercentE4: 50_000 }).success).toBe(false);
    expect(markupRuleSchema.safeParse({ ...base, repMinPercentE4: 50_000, repMaxPercentE4: 20_000 }).success).toBe(false);
    expect(markupRuleSchema.safeParse({ ...base, repMinFixedE4: 30_000, repMaxFixedE4: 10_000 }).success).toBe(false);
    expect(markupRuleSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
  it('order status', () => {
    expect(orderStatusSchema.safeParse({ orderId: ID, to: 'shipped' }).success).toBe(true);
    expect(orderStatusSchema.safeParse({ orderId: ID, to: 'paid' }).success).toBe(false);
  });
});
