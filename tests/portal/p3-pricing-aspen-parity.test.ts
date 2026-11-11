import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composePrice, markupAmountCents, pickRule, priceFor, type MarkupRule } from '@/lib/portal/commerce/pricing';

/**
 * AspenWholesale parity. The reference below is a line-by-line port of Aspen's SQL (read only; Aspen was not modified):
 *   private.markup_amount(type, value, price)  = CASE type WHEN 'percent' THEN round(price * value / 100, 2) ELSE round(value, 2) END   (numeric, round half away from zero)
 *   private.pick_markup_rule(org, partner, product) = the active rule of the scope; the product-specific rule beats the default rule
 *   private.rep_bounds(org, product) = the representative bounds of the ORGANIZATION rule picked for the product
 *   private.compute_markup_price: v_org_price := base + org_amount;  clamp the representative value to the bounds of its own type;  v_rep_amt := markup_amount(rep type, clamped, v_org_price);
 *                                 final := greatest(v_org_price + v_rep_amt, floor);  NULL when there is no base price or no floor row
 * The reference works in DOLLARS with numeric scale 2 for prices and 4 for values (numeric(12,2) / numeric(10,4)) using exact rational BigInt arithmetic, then converts to cents; the
 * P3 implementation works in cents and e4 integers. Agreement of the two on thousands of random inputs is the parity evidence. It is a TEXT/MODEL comparison: no Aspen code or
 * database was executed, and PostgreSQL has not run the P3 SQL.
 */
// exact rational helpers (BigInt)
const roundHalfAway = (num: bigint, den: bigint): bigint => {
  const neg = num < 0n !== den < 0n;
  const a = num < 0n ? -num : num;
  const b = den < 0n ? -den : den;
  const q = (2n * a + b) / (2n * b);
  return neg ? -q : q;
};
type AspenRule = { type: 'percent' | 'fixed'; value: string; active?: boolean; product?: string | null; repMinPercent?: string | null; repMaxPercent?: string | null; repMinFixed?: string | null; repMaxFixed?: string | null };
// value strings like "12.5" (numeric(10,4)); returns the value scaled by 10^4
const scaled4 = (v: string): bigint => {
  const [i, f = ''] = v.split('.');
  return BigInt(i ?? '0') * 10000n + BigInt(f.padEnd(4, '0').slice(0, 4));
};
// price in dollars given as cents (numeric(12,2)); returns dollars*100 (cents) of markup_amount
const aspenMarkupAmount = (type: 'percent' | 'fixed', value: string, priceCents: bigint): bigint => {
  const v4 = scaled4(value);
  // percent: round(price_d * value / 100, 2 dp): price_d = P/100, value = v4/10000  ->  dollars = P*v4 / (100*10000*100); in cents x100: P*v4/ (100*10000) -> rounded to 2 dp of dollars = whole cents
  if (type === 'percent') return roundHalfAway(priceCents * v4, 100n * 10000n);
  // fixed: round(value, 2 dp) dollars -> cents = round(v4/100)
  return roundHalfAway(v4, 100n);
};
const aspenPick = (rules: AspenRule[], product: string): AspenRule | null => {
  const active = rules.filter((r) => r.active !== false && (r.product === product || r.product === null || r.product === undefined));
  return active.find((r) => r.product === product) ?? active.find((r) => r.product === null || r.product === undefined) ?? null;
};
export const aspenFinalCents = (baseCents: bigint | null, floorCents: bigint | null, orgRules: AspenRule[], repRules: AspenRule[], product = 'p'): bigint | null => {
  if (baseCents === null || baseCents <= 0n || floorCents === null || floorCents <= 0n) return null;
  const org = aspenPick(orgRules, product);
  const orgAmt = org ? aspenMarkupAmount(org.type, org.value, baseCents) : 0n;
  const orgPrice = baseCents + orgAmt;
  const rep = aspenPick(repRules, product);
  let repAmt = 0n;
  if (rep) {
    let val = scaled4(rep.value);
    const lo = org ? (rep.type === 'percent' ? org.repMinPercent : org.repMinFixed) : null;
    const hi = org ? (rep.type === 'percent' ? org.repMaxPercent : org.repMaxFixed) : null;
    if (lo !== null && lo !== undefined && val < scaled4(lo)) val = scaled4(lo);
    if (hi !== null && hi !== undefined && val > scaled4(hi)) val = scaled4(hi);
    repAmt = aspenMarkupAmount(rep.type, `${val / 10000n}.${(val % 10000n).toString().padStart(4, '0')}`, orgPrice);
  }
  const raw = orgPrice + repAmt;
  return raw > floorCents ? raw : floorCents;
};

// P3 rule construction from the same description
const toRule = (kind: 'organization' | 'representative', r: AspenRule): MarkupRule => ({
  kind, productId: r.product ?? null, type: r.type, valueE4: Number(scaled4(r.value)), isActive: r.active !== false,
  repMinPercentE4: r.repMinPercent == null ? null : Number(scaled4(r.repMinPercent)), repMaxPercentE4: r.repMaxPercent == null ? null : Number(scaled4(r.repMaxPercent)),
  repMinFixedE4: r.repMinFixed == null ? null : Number(scaled4(r.repMinFixed)), repMaxFixedE4: r.repMaxFixed == null ? null : Number(scaled4(r.repMaxFixed)),
});
const p3Unit = (base: number | null, floor: number | null, orgRules: AspenRule[], repRules: AspenRule[], product = 'p') =>
  priceFor([...orgRules.map((r) => toRule('organization', r)), ...repRules.map((r) => toRule('representative', r))], product, base, floor)?.unit ?? null;
const both = (base: number | null, floor: number | null, orgRules: AspenRule[], repRules: AspenRule[], product = 'p') => ({
  p3: p3Unit(base, floor, orgRules, repRules, product),
  aspen: ((a) => (a === null ? null : Number(a)))(aspenFinalCents(base === null ? null : BigInt(base), floor === null ? null : BigInt(floor), orgRules, repRules, product)),
});

describe('Aspen parity: worked examples (base $100.00 = 10000 cents, floor $10.00 unless stated)', () => {
  const pc = (v: string, product: string | null = null): AspenRule => ({ type: 'percent', value: v, product });
  const fx = (v: string, product: string | null = null): AspenRule => ({ type: 'fixed', value: v, product });
  const cases: { name: string; base: number; floor: number; org: AspenRule[]; rep: AspenRule[]; unit: number }[] = [
    { name: 'zero markup (no rules)', base: 10000, floor: 1000, org: [], rep: [], unit: 10000 },
    { name: 'percent organization markup 25 %', base: 10000, floor: 1000, org: [pc('25')], rep: [], unit: 12500 },
    { name: 'fixed organization markup $5.00', base: 10000, floor: 1000, org: [fx('5')], rep: [], unit: 10500 },
    { name: 'percent representative markup 5 % only', base: 10000, floor: 1000, org: [], rep: [pc('5')], unit: 10500 },
    { name: 'organization 25 % then representative 5 % on the ORGANIZATION price (12500 + 625)', base: 10000, floor: 1000, org: [pc('25')], rep: [pc('5')], unit: 13125 },
    { name: 'organization fixed $5 then representative 10 % on 10500', base: 10000, floor: 1000, org: [fx('5')], rep: [pc('10')], unit: 11550 },
    { name: 'rounding: 333 cents + 10 % (33.3 -> 33)', base: 333, floor: 100, org: [pc('10')], rep: [], unit: 366 },
    { name: 'rounding half away: 335 cents + 10 % (33.5 -> 34)', base: 335, floor: 100, org: [pc('10')], rep: [], unit: 369 },
    { name: 'rounding at each stage: 333 + 10 % -> 366, then 10 % of 366 = 36.6 -> 37', base: 333, floor: 100, org: [pc('10')], rep: [pc('10')], unit: 403 },
    { name: 'four decimals: 0.0049 % of 10000 cents = 0.49 -> 0', base: 10000, floor: 1000, org: [pc('0.0049')], rep: [], unit: 10000 },
    { name: 'four decimals: 0.005 % of 10000 cents = 0.5 -> 1 (half away from zero)', base: 10000, floor: 1000, org: [pc('0.005')], rep: [], unit: 10001 },
    { name: 'fixed value rounding: $0.005 -> 1 cent, $0.0049 -> 0', base: 10000, floor: 1000, org: [fx('0.005')], rep: [], unit: 10001 },
    { name: 'floor above the marked-up price', base: 10000, floor: 15000, org: [pc('25')], rep: [], unit: 15000 },
    { name: 'floor below the marked-up price', base: 10000, floor: 5000, org: [pc('25')], rep: [], unit: 12500 },
    { name: 'product-specific organization rule beats the default rule', base: 10000, floor: 1000, org: [pc('10'), pc('30', 'p')], rep: [], unit: 13000 },
    { name: 'default rule applies to a product without a specific rule', base: 10000, floor: 1000, org: [pc('10'), pc('30', 'other')], rep: [], unit: 11000 },
    { name: 'an inactive rule is ignored (the default applies)', base: 10000, floor: 1000, org: [pc('10'), { ...pc('30', 'p'), active: false }], rep: [], unit: 11000 },
    { name: 'representative percent within the bounds of the organization rule (2 % to 5 %): 3 %', base: 10000, floor: 1000, org: [{ ...pc('10'), repMinPercent: '2', repMaxPercent: '5' }], rep: [pc('3')], unit: 11330 },
    { name: 'representative percent below the minimum is raised to 2 %', base: 10000, floor: 1000, org: [{ ...pc('10'), repMinPercent: '2', repMaxPercent: '5' }], rep: [pc('1')], unit: 11220 },
    { name: 'representative percent above the maximum is lowered to 5 %', base: 10000, floor: 1000, org: [{ ...pc('10'), repMinPercent: '2', repMaxPercent: '5' }], rep: [pc('9')], unit: 11550 },
    { name: 'representative FIXED rule uses the FIXED bounds ($1 to $3); the percent bounds are ignored', base: 10000, floor: 1000, org: [{ ...pc('0'), repMinPercent: '50', repMinFixed: '1', repMaxFixed: '3' }], rep: [fx('7')], unit: 10300 },
    { name: 'bounds come from the organization rule of the SAME product scope (specific beats default)', base: 10000, floor: 1000, org: [{ ...pc('10'), repMaxPercent: '1' }, { ...pc('10', 'p'), repMaxPercent: '4' }], rep: [pc('9')], unit: 11440 },
    { name: 'no organization rule: representative markup is unbounded and applies to the base', base: 10000, floor: 1000, org: [], rep: [pc('9')], unit: 10900 },
  ];
  for (const c of cases) {
    it(`${c.name}: ${c.unit}`, () => {
      const r = both(c.base, c.floor, c.org, c.rep);
      expect(r.aspen, 'Aspen reference').toBe(c.unit);
      expect(r.p3, 'P3').toBe(c.unit);
    });
  }
});

describe('Aspen parity: a floor is required before a product can be listed or sold', () => {
  it('no floor, no base, zero or negative values: not purchasable in both', () => {
    for (const [b, f] of [[10000, null], [null, 1000], [null, null], [0, 1000], [10000, 0], [-1, 1000]] as const) {
      const r = both(b as number | null, f as number | null, [], []);
      expect(r.p3, `${b}/${f}`).toBeNull();
      expect(r.aspen, `${b}/${f}`).toBeNull();
    }
  });
  it('a price above the unit cap is refused (fail closed)', () => {
    expect(composePrice({ baseCents: 100_000_000, floorCents: 1000, org: { type: 'percent', valueE4: 10_000_000 }, rep: null })).toBeNull();
  });
});

describe('Aspen parity: randomized agreement (seeded, 6000 cases)', () => {
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const val = (type: 'percent' | 'fixed') => (type === 'percent' ? `${Math.floor(rnd() * 1001)}${rnd() < 0.5 ? '' : `.${String(Math.floor(rnd() * 10000)).padStart(4, '0')}`}` : `${Math.floor(rnd() * 5000)}.${String(Math.floor(rnd() * 10000)).padStart(4, '0')}`);
  const cap = (v: string, type: 'percent' | 'fixed') => (type === 'percent' && Number(v) > 1000 ? '1000' : v);
  const rule = (kind: 'org' | 'rep'): AspenRule => {
    const type = pick(['percent', 'fixed'] as const);
    const r: AspenRule = { type, value: cap(val(type), type), product: rnd() < 0.4 ? 'p' : null, active: rnd() < 0.9 };
    if (kind === 'org') {
      const lo = Math.floor(rnd() * 20);
      if (rnd() < 0.6) { r.repMinPercent = String(lo); r.repMaxPercent = String(lo + Math.floor(rnd() * 30)); }
      if (rnd() < 0.6) { const f = Math.floor(rnd() * 50); r.repMinFixed = String(f); r.repMaxFixed = String(f + Math.floor(rnd() * 100)); }
    }
    return r;
  };
  it('the cents/e4 implementation equals the exact dollar-based reference on random rules, bases and floors', () => {
    let compared = 0;
    for (let n = 0; n < 6000; n++) {
      const org = Array.from({ length: Math.floor(rnd() * 3) }, () => rule('org')).filter((r, i, a) => a.findIndex((x) => (x.product ?? '') === (r.product ?? '')) === i);
      const rep = Array.from({ length: Math.floor(rnd() * 3) }, () => rule('rep')).filter((r, i, a) => a.findIndex((x) => (x.product ?? '') === (r.product ?? '')) === i);
      const base = 1 + Math.floor(rnd() * 5_000_000);
      const floor = 1 + Math.floor(rnd() * 6_000_000);
      const r = both(base, floor, org, rep);
      // an over-cap price is refused by P3 (null) and is above any realistic reference value; compare only where the reference is inside the cap
      if (r.aspen !== null && r.aspen > 100_000_000) { expect(r.p3).toBeNull(); continue; }
      expect(r.p3, JSON.stringify({ base, floor, org, rep })).toBe(r.aspen);
      compared++;
    }
    expect(compared).toBeGreaterThan(5500);
  });
});

describe('Aspen parity: rule selection and the percent/fixed markup amount in isolation', () => {
  it('markupAmountCents rounds half away from zero at the Aspen stage (per markup amount)', () => {
    expect(markupAmountCents('percent', 100_000, 335)).toBe(34); // 33.5
    expect(markupAmountCents('percent', 100_000, 333)).toBe(33); // 33.3
    expect(markupAmountCents('percent', 50, 10_000)).toBe(1); // 0.5
    expect(markupAmountCents('percent', 49, 10_000)).toBe(0); // 0.49
    expect(markupAmountCents('fixed', 50, 0)).toBe(1); // $0.005
    expect(markupAmountCents('fixed', 49, 0)).toBe(0); // $0.0049
    expect(markupAmountCents('fixed', 50_000, 123)).toBe(500); // $5.00 regardless of the price
  });
  it('pickRule: active only, product-specific beats default, kinds are separate', () => {
    const rules: MarkupRule[] = [
      { kind: 'organization', productId: null, type: 'percent', valueE4: 100_000, isActive: true },
      { kind: 'organization', productId: 'p', type: 'percent', valueE4: 300_000, isActive: false },
      { kind: 'representative', productId: 'p', type: 'fixed', valueE4: 20_000, isActive: true },
    ];
    expect(pickRule(rules, 'organization', 'p')?.valueE4).toBe(100_000);
    expect(pickRule(rules, 'representative', 'p')?.type).toBe('fixed');
    expect(pickRule(rules, 'representative', 'q')).toBeNull();
  });
});

describe('the SQL self-check vectors are the TypeScript model values', () => {
  // the promoted P3 migration (byte-identical to the reviewed revision 2 candidate; the pricing functions are unchanged from the original draft)
  const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20261110000100_p3_catalog_pricing_orders.sql'), 'utf8').replace(/--[^\n]*/g, '');
  const vectors = [...sql.matchAll(/private\.shop_compose\(([^)]*)\) ->> 'unit' <> '(\d+)'/g)];
  it('contains at least the documented vectors and every one equals the TypeScript result', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(11);
    for (const v of vectors) {
      const a = (v[1] as string).split(',').map((x) => x.trim());
      const num = (x: string | undefined) => (x === undefined || x === 'null' ? null : Number(x));
      const str = (x: string | undefined) => (x === undefined || x === 'null' ? null : x.replace(/'/g, ''));
      const orgType = str(a[2]) as 'percent' | 'fixed' | null;
      const repType = str(a[4]) as 'percent' | 'fixed' | null;
      const r = composePrice({
        baseCents: num(a[0]) as number, floorCents: num(a[1]),
        org: orgType ? { type: orgType, valueE4: num(a[3]) as number } : null,
        rep: repType ? { type: repType, valueE4: num(a[5]) as number } : null,
        bounds: { minPercentE4: num(a[6]), maxPercentE4: num(a[7]), minFixedE4: num(a[8]), maxFixedE4: num(a[9]) },
      });
      expect(r?.unit, (v[1] as string)).toBe(Number(v[2]));
    }
  });
  it('the null vectors (no base, no floor, above the cap) are null in TypeScript too', () => {
    const nulls = [...sql.matchAll(/private\.shop_compose\(([^)]*)\) is not null/g)];
    expect(nulls.length).toBeGreaterThanOrEqual(3);
    for (const v of nulls) {
      const a = (v[1] as string).split(',').map((x) => x.trim());
      const num = (x: string | undefined) => (x === undefined || x === 'null' ? null : Number(x));
      const orgType = (a[2] ?? 'null').replace(/'/g, '');
      expect(composePrice({ baseCents: num(a[0]), floorCents: num(a[1]), org: orgType !== 'null' ? { type: orgType as 'percent' | 'fixed', valueE4: Number(a[3]) } : null, rep: null })).toBeNull();
    }
  });
});
