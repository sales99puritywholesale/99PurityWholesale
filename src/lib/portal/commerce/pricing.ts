/**
 * P3 pricing model: a faithful port of AspenWholesale's markup pricing (supabase/migrations/20261013000000_markup_payments_phase6.sql: markup_amount, pick_markup_rule,
 * rep_bounds, compute_markup_price). The DATABASE is authoritative (private.shop_compose / private.shop_price_breakdown in the P3 migration draft); this pure module mirrors it
 * for tests, previews and display. The browser never supplies a price. Money is integer cents; markup VALUES are integers in units of 1e-4 (percent x 10000, or dollars x 10000
 * for a fixed amount), the same four decimals as Aspen's numeric(10,4). Arithmetic uses BigInt: no floating point anywhere.
 *
 *   org amount  = markup_amount(org rule, base)                     org price = base + org amount
 *   rep value   = clamp(rep rule value, org rule representative bounds for the rep rule's type)   (a bound applies only when set)
 *   rep amount  = markup_amount(rep rule with the clamped value, ORG PRICE)                      (the representative markup compounds on the organization price)
 *   unit        = max(org price + rep amount, floor)
 *   markup_amount: percent -> round(price * value / 100, 2 decimals); fixed -> round(value, 2 decimals); numeric round() rounds half away from zero.
 * A variant is sellable only with BOTH a base price (> 0) and a floor (> 0).
 */
export const MAX_PRICE_CENTS = 100_000_000; // USD 1,000,000.00 per unit
export const MAX_PERCENT_E4 = 10_000_000; // 1000 %
export const MAX_FIXED_E4 = 10_000_000_000; // USD 1,000,000.0000
export const MAX_LINE_QUANTITY = 10_000;
export const MAX_CART_LINES = 100;
export const MAX_ORDER_TOTAL_CENTS = 1_000_000_000_000;

export type MarkupType = 'percent' | 'fixed';
export type MarkupKind = 'organization' | 'representative';
export type MarkupRule = {
  readonly kind: MarkupKind;
  /** null = every product; a product id = that product only */
  readonly productId: string | null;
  readonly type: MarkupType;
  readonly valueE4: number;
  readonly isActive: boolean;
  /** organization rules only */
  readonly repMinPercentE4?: number | null;
  readonly repMaxPercentE4?: number | null;
  readonly repMinFixedE4?: number | null;
  readonly repMaxFixedE4?: number | null;
};

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

/** Aspen private.markup_amount in cents: both operands are non-negative, so adding half the divisor before the integer division is round-half-away-from-zero. */
export function markupAmountCents(type: MarkupType, valueE4: number, priceCents: number): number {
  if (type === 'percent') return Number((BigInt(priceCents) * BigInt(valueE4) + 500_000n) / 1_000_000n);
  return Number((BigInt(valueE4) + 50n) / 100n);
}

/** Aspen pick_markup_rule: the active rule of the kind; a product-specific rule beats the default (all products) rule. */
export function pickRule(rules: readonly MarkupRule[], kind: MarkupKind, productId: string): MarkupRule | null {
  const mine = rules.filter((r) => r.kind === kind && r.isActive && (r.productId === productId || r.productId === null));
  return mine.find((r) => r.productId === productId) ?? mine.find((r) => r.productId === null) ?? null;
}

export type Breakdown = {
  readonly base: number;
  readonly floor: number;
  readonly orgType: MarkupType | null;
  readonly orgValueE4: number | null;
  readonly orgAmount: number;
  readonly orgPrice: number;
  readonly repType: MarkupType | null;
  readonly repValueE4: number | null; // after clamping
  readonly repAmount: number;
  readonly repClamped: boolean;
  readonly raw: number;
  readonly floorApplied: boolean;
  readonly unit: number;
};

export type ComposeInput = {
  readonly baseCents: number | null;
  readonly floorCents: number | null;
  readonly org: { type: MarkupType; valueE4: number } | null;
  readonly rep: { type: MarkupType; valueE4: number } | null;
  readonly bounds?: { minPercentE4?: number | null; maxPercentE4?: number | null; minFixedE4?: number | null; maxFixedE4?: number | null };
};

/** private.shop_compose: null (not sellable) unless base and floor are both set, or when any input is invalid or the result exceeds the cap. */
export function composePrice(i: ComposeInput): Breakdown | null {
  const { baseCents: base, floorCents: floor } = i;
  if (!isInt(base) || base <= 0 || base > MAX_PRICE_CENTS || !isInt(floor) || floor <= 0 || floor > MAX_PRICE_CENTS) return null;
  for (const r of [i.org, i.rep]) {
    if (r === null) continue;
    if (!isInt(r.valueE4) || r.valueE4 < 0 || r.valueE4 > (r.type === 'percent' ? MAX_PERCENT_E4 : MAX_FIXED_E4)) return null;
  }
  const orgAmount = i.org ? markupAmountCents(i.org.type, i.org.valueE4, base) : 0;
  const orgPrice = base + orgAmount;
  let repAmount = 0;
  let repValue: number | null = null;
  let clamped = false;
  if (i.rep) {
    const b = i.bounds ?? {};
    const lo = i.rep.type === 'percent' ? b.minPercentE4 ?? null : b.minFixedE4 ?? null;
    const hi = i.rep.type === 'percent' ? b.maxPercentE4 ?? null : b.maxFixedE4 ?? null;
    repValue = i.rep.valueE4;
    if (lo !== null && repValue < lo) { repValue = lo; clamped = true; }
    if (hi !== null && repValue > hi) { repValue = hi; clamped = true; }
    repAmount = markupAmountCents(i.rep.type, repValue, orgPrice);
  }
  const raw = orgPrice + repAmount;
  const unit = Math.max(raw, floor);
  if (unit > MAX_PRICE_CENTS) return null;
  return {
    base, floor, orgType: i.org?.type ?? null, orgValueE4: i.org?.valueE4 ?? null, orgAmount, orgPrice,
    repType: i.rep?.type ?? null, repValueE4: repValue, repAmount, repClamped: clamped, raw, floorApplied: raw < floor, unit,
  };
}

/** private.shop_price_breakdown: picks the rules of one product (product-specific beats default; the org rule also supplies the representative bounds) and composes the price. */
export function priceFor(rules: readonly MarkupRule[], productId: string, baseCents: number | null, floorCents: number | null): Breakdown | null {
  const org = pickRule(rules, 'organization', productId);
  const rep = pickRule(rules, 'representative', productId);
  return composePrice({
    baseCents, floorCents,
    org: org ? { type: org.type, valueE4: org.valueE4 } : null,
    rep: rep ? { type: rep.type, valueE4: rep.valueE4 } : null,
    bounds: org ? { minPercentE4: org.repMinPercentE4, maxPercentE4: org.repMaxPercentE4, minFixedE4: org.repMinFixedE4, maxFixedE4: org.repMaxFixedE4 } : {},
  });
}

export const unitPriceCents = (i: ComposeInput): number | null => composePrice(i)?.unit ?? null;

// ---------------------------------------------------------------------------------------------------------------- carts and totals
export type CartLineInput = { readonly variantId: string; readonly quantity: number; readonly unitCents: number | null };
export type PricedTotals =
  | { readonly ok: true; readonly lines: readonly { readonly variantId: string; readonly quantity: number; readonly unitCents: number; readonly lineCents: number }[]; readonly subtotalCents: number }
  | { readonly ok: false; readonly code: 'empty' | 'too_many_lines' | 'invalid_quantity' | 'unpriced_line' | 'duplicate_line' | 'order_too_large' };

/** Totals from priced lines. An unpriced line, a bad quantity, a duplicate variant, an empty cart or a total above the order limit is refused as a whole. */
export function priceCart(lines: readonly CartLineInput[]): PricedTotals {
  if (lines.length === 0) return { ok: false, code: 'empty' };
  if (lines.length > MAX_CART_LINES) return { ok: false, code: 'too_many_lines' };
  const seen = new Set<string>();
  const out: { variantId: string; quantity: number; unitCents: number; lineCents: number }[] = [];
  let subtotal = 0n;
  for (const l of lines) {
    if (seen.has(l.variantId)) return { ok: false, code: 'duplicate_line' };
    seen.add(l.variantId);
    if (!isInt(l.quantity) || l.quantity < 1 || l.quantity > MAX_LINE_QUANTITY) return { ok: false, code: 'invalid_quantity' };
    if (l.unitCents === null || !isInt(l.unitCents) || l.unitCents < 1) return { ok: false, code: 'unpriced_line' };
    const lineCents = l.unitCents * l.quantity;
    subtotal += BigInt(lineCents);
    out.push({ variantId: l.variantId, quantity: l.quantity, unitCents: l.unitCents, lineCents });
  }
  if (subtotal > BigInt(MAX_ORDER_TOTAL_CENTS)) return { ok: false, code: 'order_too_large' };
  return { ok: true, lines: out, subtotalCents: Number(subtotal) };
}

// ---------------------------------------------------------------------------------------------------------------- formatting and parsing
/** "1234" cents to "$12.34". Display only. */
export const formatUsd = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Parses a decimal dollar string ("12.5", "12.50") to cents; null when not a plain positive amount with at most 2 decimals. */
export function parseUsdToCents(text: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return cents >= 1 && cents <= MAX_PRICE_CENTS ? cents : null;
}

/** Parses a decimal with at most 4 decimals ("25", "12.5", "0.0625") to units of 1e-4; null when invalid. The caller checks the type-specific maximum. */
export function parseDecimalToE4(text: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,4}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 10_000 + Number((m[2] ?? '').padEnd(4, '0') || '0');
}
export const parseMarkupValue = (type: MarkupType, text: string): number | null => {
  const v = parseDecimalToE4(text);
  return v !== null && v <= (type === 'percent' ? MAX_PERCENT_E4 : MAX_FIXED_E4) ? v : null;
};
export const formatE4 = (e4: number): string => (e4 / 10_000).toFixed(4).replace(/\.?0+$/, '') || '0';
