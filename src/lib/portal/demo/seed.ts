import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_PERSONAS } from './config';
import { DemoCommerce } from './engine';
import type { DemoMember, DemoOrg, DemoProduct, DemoRule, DemoState, DemoStore, DemoUser, DemoVariant } from './types';

/**
 * Seed for the demo database: the public catalog (153 products, 221 variants) with deterministic wholesale prices, three organizations with different markup models,
 * customers, one administrator and a few orders in different states. Deterministic: the same code always produces the same ids and prices. NOT real data; no real customer exists here.
 */
export const DEMO_STATE_VERSION = 1;
const hex = (s: string) => createHash('sha1').update(s).digest('hex');
/** A UUID-shaped, zod-valid (version 4, variant 8) id derived from a name. */
const uid = (name: string): string => { const h = hex(name); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const bucket = (name: string, n: number) => parseInt(hex(name).slice(0, 8), 16) % n;
const round5 = (n: number) => Math.round(n / 5) * 5;

type RawProduct = { name: string; slug: string; category: string; specs: string[]; cas: string; description: string };
/** The public catalog content, read from disk at seed time (a file read, not a module import: portal code must not import public-site modules). */
const RAW = JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'products.json'), 'utf8')) as RawProduct[];

/** Wholesale base price (cents) from the kit size, with a small deterministic spread; the floor (minimum selling price) is 8 percent above base. */
function basePrice(sku: string, spec: string): number {
  const m = /(\d+(?:\.\d+)?)\s*(mg|ml)/i.exec(spec); const size = m ? Number(m[1]) : 5;
  return round5(1400 + size * 340 + bucket(sku, 700));
}

export const DEMO_ORGS: readonly DemoOrg[] = [
  { id: uid('org:northwind'), code: 'NWD', name: 'Northwind Wellness Distributors', status: 'active', paymentTerms: 'net30', createdAt: '2026-01-12T15:00:00.000Z' },
  { id: uid('org:summit'), code: 'SLS', name: 'Summit Lab Supply', status: 'active', paymentTerms: 'prepay', createdAt: '2026-02-03T15:00:00.000Z' },
  { id: uid('org:coastal'), code: 'CRP', name: 'Coastal Research Partners', status: 'active', paymentTerms: 'net15', createdAt: '2026-03-20T15:00:00.000Z' },
];
const [NW, SU, CO] = DEMO_ORGS as [DemoOrg, DemoOrg, DemoOrg];

function build(): DemoState {
  const users: DemoUser[] = DEMO_PERSONAS.map((p) => ({ id: p.id, email: p.email, name: p.name, kind: p.kind }));
  const id = (email: string) => DEMO_PERSONAS.find((p) => p.email === email)?.id ?? '';
  const members: DemoMember[] = [
    { orgId: NW.id, userId: id('alex@northwind.demo'), role: 'owner' }, { orgId: NW.id, userId: id('sam@northwind.demo'), role: 'member' },
    { orgId: SU.id, userId: id('jordan@summit.demo'), role: 'owner' }, { orgId: CO.id, userId: id('riley@coastal.demo'), role: 'owner' },
  ];
  const prods: DemoProduct[] = []; const variants: DemoVariant[] = [];
  for (const r of RAW) {
    prods.push({ id: uid(`product:${r.slug}`), slug: r.slug, name: r.name, category: r.category, cas: r.cas || null, description: `${r.name}. Supplied as ${r.specs.join(' and ')} kits. CAS ${r.cas || 'n/a'}. Catalog item for the demo.`, status: 'active' });
    for (const spec of r.specs) {
      const sku = `${r.slug}-${spec}`.toUpperCase().replace(/×/g, 'X').replace(/[^A-Z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
      const base = basePrice(sku, spec);
      variants.push({ id: uid(`variant:${sku}`), productId: uid(`product:${r.slug}`), spec, sku, baseCents: base, floorCents: round5(base * 1.08) });
    }
  }
  // assignments: Northwind sees everything; Summit about two thirds; Coastal three categories
  const assignments = prods.flatMap((p) => {
    const out = [{ orgId: NW.id, productId: p.id, available: true }];
    if (bucket(`su:${p.slug}`, 3) !== 0) out.push({ orgId: SU.id, productId: p.id, available: true });
    if (['metabolic-research', 'recovery-research', 'essentials'].includes(p.category)) out.push({ orgId: CO.id, productId: p.id, available: true });
    return out;
  });
  const rule = (orgId: string, kind: DemoRule['kind'], type: DemoRule['type'], valueE4: number, productId: string | null, bounds: Partial<DemoRule> = {}): DemoRule => ({
    id: uid(`rule:${orgId}:${kind}:${productId ?? 'all'}`), orgId, kind, productId, type, valueE4, repMinPercentE4: null, repMaxPercentE4: null, repMinFixedE4: null, repMaxFixedE4: null, isActive: true, ...bounds,
  });
  const featured = prods.find((p) => p.slug === '5-amino-1mq')?.id ?? null;
  const rules: DemoRule[] = [
    rule(NW.id, 'organization', 'percent', 250000, null), rule(NW.id, 'representative', 'percent', 50000, null),
    rule(SU.id, 'organization', 'fixed', 45000, null), rule(SU.id, 'representative', 'percent', 30000, null),
    rule(CO.id, 'organization', 'percent', 300000, null, { repMinPercentE4: 20000, repMaxPercentE4: 60000 }), rule(CO.id, 'representative', 'percent', 100000, null),
    ...(featured ? [rule(CO.id, 'organization', 'percent', 120000, featured, { repMinPercentE4: 20000, repMaxPercentE4: 60000 })] : []),
  ];
  const state: DemoState = {
    version: DEMO_STATE_VERSION, orderSeq: 1000, users, orgs: DEMO_ORGS.map((o) => ({ ...o })), members, products: prods, variants, assignments, rules, carts: [], orders: [], idempotency: [], audit: [],
  };
  seedOrders(state);
  return state;
}

/** A few historical orders placed through the same engine as live orders (so snapshots and totals are consistent), then aged and moved through the lifecycle. */
function seedOrders(state: DemoState): void {
  const store: DemoStore = { get: () => state, save: () => undefined };
  const ship = (name: string, city: string, region: string) => ({ name, line1: '100 Commerce Way', city, region, postal: '78701', country: 'US' });
  const plan: { email: string; org: DemoOrg; slugs: [string, number][]; at: number; finish: string[]; ship: Record<string, string>; paid: boolean }[] = [
    { email: 'alex@northwind.demo', org: NW, slugs: [['5-amino-1mq', 2], ['bpc-157', 3]], at: 21, finish: ['confirmed', 'processing', 'shipped', 'delivered'], ship: ship('Northwind Receiving Dock', 'Austin', 'TX'), paid: true },
    { email: 'sam@northwind.demo', org: NW, slugs: [['aod9604', 4]], at: 6, finish: ['confirmed', 'processing'], ship: ship('Northwind Receiving Dock', 'Austin', 'TX'), paid: true },
    { email: 'jordan@summit.demo', org: SU, slugs: [['bac-water', 10], ['cagrilintide', 1]], at: 2, finish: [], ship: ship('Summit Lab Supply', 'Denver', 'CO'), paid: false },
  ];
  for (const [i, p] of plan.entries()) {
    const userId = DEMO_PERSONAS.find((x) => x.email === p.email)?.id ?? '';
    const customer = new DemoCommerce(store, { userId, kind: 'customer' });
    const admin = new DemoCommerce(store, { userId: DEMO_PERSONAS[0]?.id ?? '', kind: 'admin' });
    for (const [slug, qty] of p.slugs) {
      const product = state.products.find((x) => x.slug === slug); const variant = state.variants.find((v) => v.productId === product?.id);
      if (variant && state.assignments.some((a) => a.orgId === p.org.id && a.productId === variant.productId)) customer.cartPutItem(p.org.id, variant.id, qty);
    }
    const res = customer.checkout(p.org.id, p.ship, undefined, uid(`seed-order:${i}`));
    if (!res.ok) continue;
    for (const to of p.finish) admin.adminOrderSetStatus(res.data.order_id, to, undefined);
    const o = state.orders.find((x) => x.id === res.data.order_id); if (!o) continue;
    const shift = p.at * 86_400_000; const base = Date.now() - shift;
    o.createdAt = new Date(base).toISOString(); o.paymentStatus = p.paid ? 'paid' : 'unpaid';
    o.events.forEach((e, k) => { e.at = new Date(base + k * 6 * 3_600_000).toISOString(); });
  }
  state.audit = [];
}

export function buildSeedState(): DemoState {
  return build();
}
