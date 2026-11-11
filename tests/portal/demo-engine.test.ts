import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DemoCommerce, type R } from '@/lib/portal/demo/engine';
import { buildSeedState, DEMO_ORGS } from '@/lib/portal/demo/seed';
import { DEMO_PERSONAS, isDemoMode } from '@/lib/portal/demo/config';
import type { Actor, DemoState, DemoStore } from '@/lib/portal/demo/types';
import { composePrice, priceFor, type MarkupRule } from '@/lib/portal/commerce/pricing';

const memory = (): { state: DemoState; store: DemoStore } => { const state = buildSeedState(); return { state, store: { get: () => state, save: () => undefined } }; };
const persona = (email: string): Actor => { const p = DEMO_PERSONAS.find((x) => x.email === email); if (!p) throw new Error(email); return { userId: p.id, kind: p.kind }; };
const as = (store: DemoStore, email: string) => new DemoCommerce(store, persona(email));
const data = <T>(r: R<T>): T => { if (!r.ok) throw new Error(`expected ok, got ${r.code}`); return r.data; };
const NW = DEMO_ORGS[0]!.id; const SU = DEMO_ORGS[1]!.id; const CO = DEMO_ORGS[2]!.id;
const SHIP = { name: 'Receiving', line1: '1 Test Way', city: 'Austin', region: 'TX', postal: '78701', country: 'US' };
let keySeq = 0; const key = () => `00000000-0000-4000-8000-${String(++keySeq).padStart(12, '0')}`;

afterEach(() => vi.unstubAllEnvs());

describe('demo seed', () => {
  const { state } = memory();
  it('is the full public catalog with a price and a floor on every variant, and valid UUIDs everywhere', () => {
    expect(state.products).toHaveLength(153); expect(state.variants).toHaveLength(221);
    expect(state.variants.every((v) => (v.baseCents ?? 0) > 0 && (v.floorCents ?? 0) > (v.baseCents ?? 0))).toBe(true);
    const uuid = z.string().uuid();
    const ids = [...state.products, ...state.variants, ...state.orgs, ...state.users, ...state.rules, ...state.orders].map((x) => x.id);
    expect(ids.every((i) => uuid.safeParse(i).success)).toBe(true); expect(new Set(ids).size).toBe(ids.length);
  });
  it('has three organizations with different markup models, members, rules and orders in several states', () => {
    expect(state.orgs.map((o) => o.code)).toEqual(['NWD', 'SLS', 'CRP']);
    expect(state.members.map((m) => m.role).sort()).toEqual(['member', 'owner', 'owner', 'owner']);
    expect(state.rules.some((r) => r.type === 'fixed')).toBe(true); expect(state.rules.some((r) => r.productId !== null)).toBe(true);
    expect(state.orders.map((o) => o.status).sort()).toEqual(['delivered', 'placed', 'processing']);
    for (const o of state.orders) { expect(o.items.reduce((a, i) => a + i.lineCents, 0)).toBe(o.totalCents); expect(o.items.every((i) => i.unitCents * i.quantity === i.lineCents)).toBe(true); }
  });
  it('is deterministic (same ids and prices every time)', () => {
    const a = buildSeedState(); const b = buildSeedState();
    expect(a.products.map((p) => p.id)).toEqual(b.products.map((p) => p.id)); expect(a.variants.map((v) => v.baseCents)).toEqual(b.variants.map((v) => v.baseCents));
  });
});

describe('workflow 1: customer browses at the organization price, carts and orders', () => {
  it('the catalog price is the shared pricing model applied to the organization rules (the browser never supplies a price)', () => {
    const { state, store } = memory(); const alex = as(store, 'alex@northwind.demo');
    const items = data(alex.catalogList(NW)).items; expect(items.length).toBe(153);
    const item = items[0]!; const v = item.variants[0]!; const sv = state.variants.find((x) => x.id === v.variant_id)!;
    const rules: MarkupRule[] = [{ kind: 'organization', productId: null, type: 'percent', valueE4: 250000, isActive: true }, { kind: 'representative', productId: null, type: 'percent', valueE4: 50000, isActive: true }];
    const expected = composePrice({ baseCents: sv.baseCents, floorCents: sv.floorCents, org: { type: 'percent', valueE4: 250000 }, rep: { type: 'percent', valueE4: 50000 } })!.unit;
    expect(v.unit_cents).toBe(expected); expect(priceFor(rules, item.product_id, sv.baseCents, sv.floorCents)!.unit).toBe(expected);
    expect(v.unit_cents).toBeGreaterThan(sv.baseCents ?? 0); expect(JSON.stringify(items)).not.toMatch(/base_price|min_price|floor|markup/);
  });
  it('different organizations see different prices for the same product (fixed markup, product-specific rule)', () => {
    const { store } = memory(); const cat = (email: string, org: string) => data(as(store, email).catalogList(org)).items;
    const nwItems = cat('alex@northwind.demo', NW); const suItems = cat('jordan@summit.demo', SU); const coItems = cat('riley@coastal.demo', CO);
    expect(suItems.length).toBeLessThan(nwItems.length); expect(coItems.length).toBeLessThan(nwItems.length); // organizations see only their assigned products
    const common = nwItems.find((i) => suItems.some((x) => x.slug === i.slug) && coItems.some((x) => x.slug === i.slug))!;
    const price = (items: typeof nwItems) => items.find((i) => i.slug === common.slug)?.variants.find((v) => v.spec === common.variants[0]!.spec)?.unit_cents;
    const prices = [price(nwItems), price(suItems), price(coItems)];
    expect(prices.every((n) => typeof n === 'number')).toBe(true); expect(new Set(prices).size).toBe(3);
  });
  it('cart: add, change, remove; unavailable items are refused; the cart is per user and organization', () => {
    const { store } = memory(); const alex = as(store, 'alex@northwind.demo'); const sam = as(store, 'sam@northwind.demo');
    const variant = data(alex.catalogList(NW)).items[0]!.variants[0]!.variant_id;
    expect(data(alex.cartPutItem(NW, variant, 3)).ok).toBe(true); expect(data(alex.cartGet(NW)).lines[0]).toMatchObject({ quantity: 3, purchasable: true });
    alex.cartPutItem(NW, variant, 5); expect(data(alex.cartGet(NW)).lines[0]?.quantity).toBe(5);
    expect(data(sam.cartGet(NW)).lines).toHaveLength(0);
    expect(alex.cartPutItem(NW, 'ffffffff-ffff-4fff-8fff-ffffffffffff', 1)).toEqual({ ok: false, code: 'not_available' });
    alex.cartPutItem(NW, variant, 0); expect(data(alex.cartGet(NW)).lines).toHaveLength(0);
  });
  it('checkout creates an order from the cart at server-computed prices, with a price snapshot, and empties the cart', () => {
    const { store } = memory(); const alex = as(store, 'alex@northwind.demo');
    const [a, b] = data(alex.catalogList(NW)).items.slice(0, 2).map((i) => i.variants[0]!);
    alex.cartPutItem(NW, a!.variant_id, 2); alex.cartPutItem(NW, b!.variant_id, 1);
    const k = key(); const placed = data(alex.checkout(NW, SHIP, 'leave at dock', k));
    expect(placed.total_cents).toBe(a!.unit_cents! * 2 + b!.unit_cents!); expect(placed.order_number).toMatch(/^ORD-\d{8}$/); expect(placed.replay).toBe(false);
    expect(data(alex.cartGet(NW)).lines).toHaveLength(0);
    const detail = data(alex.orderGet(NW, placed.order_id)); expect(detail.order).toMatchObject({ status: 'placed', total_cents: placed.total_cents, notes: 'leave at dock' }); expect(detail.items).toHaveLength(2);
    expect(JSON.stringify(detail)).not.toMatch(/base_price|floor|pricing|markup/);
  });
  it('a repeated submit with the same key returns the same order; an empty cart is refused', () => {
    const { store } = memory(); const alex = as(store, 'alex@northwind.demo'); const v = data(alex.catalogList(NW)).items[0]!.variants[0]!.variant_id;
    alex.cartPutItem(NW, v, 1); const k = key(); const first = data(alex.checkout(NW, SHIP, undefined, k)); const again = data(alex.checkout(NW, SHIP, undefined, k));
    expect(again).toMatchObject({ order_id: first.order_id, replay: true }); expect(data(alex.ordersList(NW)).orders.filter((o) => o.order_id === first.order_id)).toHaveLength(1);
    expect(alex.checkout(NW, SHIP, undefined, key())).toEqual({ ok: false, code: 'cart_empty' });
  });
  it('organization isolation: other organizations, staff and strangers get organization_not_found; admin RPCs answer forbidden to customers', () => {
    const { store } = memory(); const sam = as(store, 'sam@northwind.demo'); const alexOrderId = memory().state.orders[0]!.id;
    expect(sam.catalogList(SU)).toEqual({ ok: false, code: 'organization_not_found' }); expect(sam.cartGet(CO)).toEqual({ ok: false, code: 'organization_not_found' });
    expect(sam.orderGet(SU, alexOrderId)).toEqual({ ok: false, code: 'organization_not_found' });
    expect(as(store, 'admin@99purity.demo').catalogList(NW)).toEqual({ ok: false, code: 'organization_not_found' });
    expect(new DemoCommerce(store, { userId: '00000000-0000-4000-8000-000000000000', kind: 'customer' }).catalogList(NW)).toEqual({ ok: false, code: 'organization_not_found' });
    expect(sam.adminOrgsList()).toEqual({ ok: false, code: 'forbidden' }); expect(sam.adminOrderSetStatus(alexOrderId, 'confirmed', undefined)).toEqual({ ok: false, code: 'forbidden' });
    expect(data(as(store, 'jordan@summit.demo').ordersList(SU)).orders.every((o) => o.order_number.startsWith('ORD-'))).toBe(true);
  });
  it('a customer can only read an order of their own organization (an order id from another organization is not found)', () => {
    const { state, store } = memory(); const summitOrder = state.orders.find((o) => o.orgId === SU)!;
    expect(as(store, 'jordan@summit.demo').orderGet(SU, summitOrder.id).ok).toBe(true);
    expect(as(store, 'alex@northwind.demo').orderGet(NW, summitOrder.id)).toEqual({ ok: false, code: 'order_not_found' });
  });
});

describe('workflow 2: administrator processes the order and the customer sees the new status', () => {
  it('the admin sees the order with base price, floor and the full breakdown; status changes follow the lifecycle and reach the customer', () => {
    const { store } = memory(); const alex = as(store, 'alex@northwind.demo'); const admin = as(store, 'admin@99purity.demo');
    const v = data(alex.catalogList(NW)).items[0]!.variants[0]!.variant_id; alex.cartPutItem(NW, v, 2); const placed = data(alex.checkout(NW, SHIP, undefined, key()));
    const listed = data(admin.adminOrdersList('placed')).orders.find((o) => o.order_id === placed.order_id)!; expect(listed).toMatchObject({ organization_code: 'NWD', status: 'placed' });
    const d = data(admin.adminOrderGet(placed.order_id)); expect(d.items[0]).toMatchObject({ quantity: 2 }); expect(d.items[0]!.base_price_cents).toBeGreaterThan(0); expect(d.items[0]!.pricing.org_type).toBe('percent');
    expect(admin.adminOrderSetStatus(placed.order_id, 'shipped', undefined)).toEqual({ ok: false, code: 'invalid_transition' });
    expect(data(admin.adminOrderSetStatus(placed.order_id, 'confirmed', 'checked stock')).ok).toBe(true);
    expect(data(alex.ordersList(NW)).orders.find((o) => o.order_id === placed.order_id)?.status).toBe('confirmed');
    for (const to of ['processing', 'shipped', 'delivered']) admin.adminOrderSetStatus(placed.order_id, to, undefined);
    const final = data(alex.orderGet(NW, placed.order_id)); expect(final.order.status).toBe('delivered'); expect(final.events.map((e) => e.to_status)).toEqual(['placed', 'confirmed', 'processing', 'shipped', 'delivered']);
    expect(admin.adminOrderSetStatus(placed.order_id, 'cancelled', undefined)).toEqual({ ok: false, code: 'invalid_transition' });
  });
});

describe('workflow 3: administrator sets prices and markups and the customer sees the resulting price', () => {
  const unitOfVariant = (store: DemoStore, variantId: string) => data(as(store, 'alex@northwind.demo').catalogList(NW)).items.flatMap((i) => i.variants).find((v) => v.variant_id === variantId)?.unit_cents;
  it('changing the base price, the markup rule, the assignment or the product status changes what the customer sees; placed orders keep their snapshot', () => {
    const { state, store } = memory(); const admin = as(store, 'admin@99purity.demo'); const alex = as(store, 'alex@northwind.demo');
    const product = state.products.find((p) => p.slug === 'bpc-157')!; const variant = state.variants.find((v) => v.productId === product.id)!;
    const before = unitOfVariant(store, variant.id)!;
    alex.cartPutItem(NW, variant.id, 1); const old = data(alex.checkout(NW, SHIP, undefined, key()));
    admin.adminVariantSetPrice(variant.id, 10000, 11000);
    expect(unitOfVariant(store, variant.id)).toBe(composePrice({ baseCents: 10000, floorCents: 11000, org: { type: 'percent', valueE4: 250000 }, rep: { type: 'percent', valueE4: 50000 } })!.unit);
    admin.adminMarkupRuleSet({ organizationId: NW, kind: 'organization', productId: null, type: 'percent', valueE4: 400000, repMinPercentE4: null, repMaxPercentE4: null, repMinFixedE4: null, repMaxFixedE4: null, active: true });
    const after = unitOfVariant(store, variant.id)!; expect(after).toBe(composePrice({ baseCents: 10000, floorCents: 11000, org: { type: 'percent', valueE4: 400000 }, rep: { type: 'percent', valueE4: 50000 } })!.unit); expect(after).not.toBe(before);
    expect(data(alex.orderGet(NW, old.order_id)).order.total_cents).toBe(old.total_cents); // the earlier order is unchanged
    admin.adminOrgProductSet(NW, product.id, true, false); expect(unitOfVariant(store, variant.id)).toBeUndefined();
    admin.adminOrgProductSet(NW, product.id, true, true); expect(unitOfVariant(store, variant.id)).toBe(after);
    admin.adminProductSetStatus(product.id, 'archived'); expect(unitOfVariant(store, variant.id)).toBeUndefined();
    for (const v of state.variants.filter((x) => x.productId === product.id)) admin.adminVariantSetPrice(v.id, null, null); admin.adminProductSetStatus(product.id, 'active'); expect(unitOfVariant(store, variant.id)).toBeUndefined(); // no price: not sold
    expect(admin.adminOrgProductSet(NW, product.id, true, true)).toEqual({ ok: false, code: 'product_not_priced' });
  });
  it('the floor price wins over a low markup, and invalid prices are refused', () => {
    const { state, store } = memory(); const admin = as(store, 'admin@99purity.demo'); const v = state.variants[0]!;
    admin.adminVariantSetPrice(v.id, 10000, 30000); const alexItem = data(as(store, 'alex@northwind.demo').catalogList(NW)).items.find((i) => i.product_id === v.productId)!;
    expect(alexItem.variants.find((x) => x.variant_id === v.id)?.unit_cents).toBe(30000);
    expect(admin.adminVariantSetPrice(v.id, 0, 100)).toEqual({ ok: false, code: 'invalid_response' }); expect(admin.adminVariantSetPrice('ffffffff-ffff-4fff-8fff-ffffffffffff', 100, 100)).toEqual({ ok: false, code: 'variant_not_found' });
  });
  it('the admin creates an organization, assigns products and a markup, adds an existing customer as a member, and that customer can then shop', () => {
    const { state, store } = memory(); const admin = as(store, 'admin@99purity.demo');
    expect(data(admin.adminOrgCreate('Harbor Clinics', 'HRB')).code).toBe('created'); expect(admin.adminOrgCreate('Other', 'HRB')).toEqual({ ok: false, code: 'code_taken' });
    const org = data(admin.adminOrgsList()).organizations.find((o) => o.code === 'HRB')!;
    expect(admin.adminOrgMemberAdd(org.id, 'nobody@example.test', 'member')).toEqual({ ok: false, code: 'user_not_found' }); expect(admin.adminOrgMemberAdd(org.id, 'admin@99purity.demo', 'member')).toEqual({ ok: false, code: 'member_not_allowed' });
    expect(data(admin.adminOrgMemberAdd(org.id, 'sam@northwind.demo', 'member')).code).toBe('added'); expect(data(admin.adminOrgMemberAdd(org.id, 'sam@northwind.demo', 'member')).code).toBe('already_member');
    const sam = as(store, 'sam@northwind.demo'); expect(data(sam.catalogList(org.id)).items).toHaveLength(0);
    const product = state.products[0]!; expect(data(admin.adminOrgProductSet(org.id, product.id, true, true)).code).toBe('updated');
    admin.adminMarkupRuleSet({ organizationId: org.id, kind: 'organization', productId: null, type: 'fixed', valueE4: 50000, repMinPercentE4: null, repMaxPercentE4: null, repMinFixedE4: null, repMaxFixedE4: null, active: true });
    const items = data(sam.catalogList(org.id)).items; expect(items).toHaveLength(1);
    const sv = state.variants.find((v) => v.productId === product.id && v.id === items[0]!.variants[0]!.variant_id)!;
    expect(items[0]!.variants[0]!.unit_cents).toBe(Math.max((sv.baseCents ?? 0) + 500, sv.floorCents ?? 0));
    expect(data(admin.adminOrgCatalogGet(org.id)).rules).toHaveLength(1);
  });
});

describe('demo mode can never be active in a production build', () => {
  it('requires PORTAL_DEMO_MODE=true AND a non-production NODE_ENV', () => {
    vi.stubEnv('PORTAL_DEMO_MODE', 'true'); vi.stubEnv('NODE_ENV', 'development'); expect(isDemoMode()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production'); expect(isDemoMode()).toBe(false);
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('PORTAL_DEMO_MODE', 'yes'); expect(isDemoMode()).toBe(false);
    vi.stubEnv('PORTAL_DEMO_MODE', ''); expect(isDemoMode()).toBe(false);
  });
});
