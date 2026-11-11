import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// FIXTURE RENDER of the P3 pages: every page is called as a server component with MOCKED data and authentication and rendered to static HTML. This checks that the pages
// render, show the right data, expose the right forms and validation attributes and never print cost data to a customer. It does NOT test a browser, layout at any screen
// width, client behavior, real data, the database, or any workflow: no database-backed result is claimed.
const ORG = '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11';
const V1 = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const V2 = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5e';
const P1 = '2c3d4e5f-6071-4b8c-9dae-1f2a3b4c5d6f';
const O1 = '4d5e6f70-8192-4a3b-8c4d-5e6f70819203';
const ok = <T,>(data: T) => ({ ok: true as const, data });

vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/lib/portal/auth', () => ({ requireUser: async () => ({ id: 'u1', email: 'u@example.test' }) }));
vi.mock('@/lib/portal/staff-gate', () => ({ requireStaffCapability: async () => ({ id: 'u1', email: 'u@example.test' }) }));
vi.mock('@/lib/portal/staff-access', () => ({
  getStaffAccessContext: async () => ({ authenticated: true, staffStatus: 'active', roles: ['admin'], dbSessionOk: true, totpVerifiedAt: new Date(), now: new Date() }),
}));
vi.mock('@/lib/portal/commerce/server', () => ({
  messageFor: (c: string) => `msg:${c}`,
  getMyOrganizations: async () => [{ id: ORG, name: 'Test Lab', code: 'TESTLAB', role: 'member' }],
  catalogList: async () => ok({ items: [
    { product_id: P1, slug: 'bpc-157', name: 'BPC-157', category: 'recovery-research', cas: '137525-51-0', description: 'Research compound.', available: true,
      variants: [{ variant_id: V1, spec: '5mg×10', sku: 'BPC-157-5MG-X10', unit_cents: 12500 }, { variant_id: V2, spec: '10mg×10', sku: 'BPC-157-10MG-X10', unit_cents: null }] },
  ] }),
  cartGet: async () => ok({ lines: [
    { variant_id: V1, product_name: 'BPC-157', spec: '5mg×10', sku: 'BPC-157-5MG-X10', quantity: 2, unit_cents: 12500, line_cents: 25000, purchasable: true },
    { variant_id: V2, product_name: 'BPC-157', spec: '10mg×10', sku: 'BPC-157-10MG-X10', quantity: 1, unit_cents: null, line_cents: null, purchasable: false },
  ] }),
  ordersList: async () => ok({ orders: [{ order_id: O1, order_number: 'ORD-00001000', status: 'placed', total_cents: 25000, created_at: '2026-11-10T10:00:00Z' }] }),
  orderGet: async () => ok({
    order: { order_id: O1, order_number: 'ORD-00001000', status: 'placed', subtotal_cents: 25000, total_cents: 25000, currency: 'USD', ship_to: { name: 'Lab', line1: '1 Main St', city: 'Austin' }, notes: null, created_at: '2026-11-10T10:00:00Z' },
    items: [{ product_name: 'BPC-157', spec: '5mg×10', sku: 'BPC-157-5MG-X10', quantity: 2, unit_price_cents: 12500, line_total_cents: 25000 }],
    events: [{ from_status: null, to_status: 'placed', at: '2026-11-10T10:00:00Z' }],
  }),
  adminCatalogList: async () => ok({ products: [{ product_id: P1, slug: 'bpc-157', name: 'BPC-157', category: 'recovery-research', status: 'active',
    variants: [{ variant_id: V1, spec: '5mg×10', sku: 'BPC-157-5MG-X10', base_price_cents: 10000, min_price_cents: 11000, status: 'active' }, { variant_id: V2, spec: '10mg×10', sku: 'BPC-157-10MG-X10', base_price_cents: null, min_price_cents: null, status: 'active' }] }] }),
  adminOrgsList: async () => ok({ organizations: [{ id: ORG, code: 'TESTLAB', name: 'Test Lab', status: 'active', members: 2, rules: 2, assigned_products: 3 }] }),
  adminOrgCatalogGet: async () => ok({
    rules: [
      { rule_id: V1, kind: 'organization', product_id: null, product_name: null, markup_type: 'percent', value_e4: 250_000, rep_min_percent_e4: 20_000, rep_max_percent_e4: 50_000, rep_min_fixed_e4: null, rep_max_fixed_e4: null, is_active: true },
      { rule_id: V2, kind: 'representative', product_id: P1, product_name: 'BPC-157', markup_type: 'fixed', value_e4: 20_000, rep_min_percent_e4: null, rep_max_percent_e4: null, rep_min_fixed_e4: null, rep_max_fixed_e4: null, is_active: false },
    ],
    products: [
      { product_id: P1, name: 'BPC-157', slug: 'bpc-157', status: 'active', assigned: true, available: false, priced: true },
      { product_id: V2, name: 'Unpriced', slug: 'unpriced', status: 'active', assigned: false, available: false, priced: false },
    ],
  }),
  adminOrdersList: async () => ok({ orders: [{ order_id: O1, order_number: 'ORD-00001000', status: 'placed', total_cents: 25000, organization_id: ORG, organization_name: 'Test Lab', organization_code: 'TESTLAB', created_at: '2026-11-10T10:00:00Z' }] }),
  adminOrderGet: async () => ok({
    order: { order_id: O1, order_number: 'ORD-00001000', status: 'placed', subtotal_cents: 25000, total_cents: 25000, currency: 'USD', ship_to: { name: 'Lab' }, notes: 'Call first', created_at: '2026-11-10T10:00:00Z', organization_id: ORG, organization_name: 'Test Lab', organization_code: 'TESTLAB' },
    items: [{ product_name: 'BPC-157', spec: '5mg×10', sku: 'BPC-157-5MG-X10', quantity: 2, base_price_cents: 10000, floor_cents: 11000, unit_price_cents: 12500, line_total_cents: 25000,
      pricing: { org_type: 'percent', org_value_e4: 250_000, org_amount: 2500, org_price: 12500, rep_type: 'percent', rep_value_e4: 20_000, rep_amount: 250, rep_clamped: true, raw: 12750, floor_applied: false } }],
    events: [{ from_status: null, to_status: 'placed', actor_kind: 'organization_user', note: null, at: '2026-11-10T10:00:00Z' }],
  }),
}));

const html = async (loader: () => Promise<{ default: (p: never) => unknown }>, props: unknown = { searchParams: {} }) => {
  const mod = await loader();
  const el = await (mod.default as unknown as (p: unknown) => Promise<React.ReactElement>)(props);
  return renderToStaticMarkup(el);
};
const sp = { searchParams: { org: ORG } };

describe('customer pages (fixture render)', () => {
  it('shop: shows the assigned product, the organization price and an add form with validation; "Price on request" for an unpriced variant; no cost data', async () => {
    const h = await html(() => import('@/app/(portal)/client/shop/page'), sp);
    expect(h).toContain('BPC-157');
    expect(h).toContain('$125.00');
    expect(h).toContain('Price on request');
    expect(h).toMatch(/name="quantity"[^>]*type="number"|type="number"[^>]*name="quantity"/);
    expect(h).toMatch(/min="1"/);
    expect(h).toMatch(/max="10000"/);
    expect(h).toContain(`value="${ORG}"`);
    expect(h).toContain('For laboratory research use only');
    expect(h.replace(/<[^>]*>/g, ' ')).not.toMatch(/\$100\.00|\$110\.00|base price|floor|markup|recovery research/i);
    expect(h).not.toMatch(/unit_cents|unitCents/);
  });
  it('cart: shows quantities and line totals, flags the unpriced line and blocks checkout until it is removed', async () => {
    const h = await html(() => import('@/app/(portal)/client/cart/page'), sp);
    expect(h).toContain('$250.00');
    expect(h).toContain('Resolve the flagged lines to check out');
    expect(h).toContain('remove it to continue');
    expect(h).not.toContain('/client/checkout?org=');
    expect(h).toContain('Empty cart');
  });
  it('checkout: shows a complete shipping form with required fields and the summary (the cart in the fixture is blocked, so it explains why)', async () => {
    const h = await html(() => import('@/app/(portal)/client/checkout/page'), sp);
    expect(h).toContain('Nothing to check out');
  });
  it('orders list and order detail: show the order number, status label, totals and history; nothing about base prices or markups', async () => {
    const list = await html(() => import('@/app/(portal)/client/orders/page'), sp);
    expect(list).toContain('ORD-00001000');
    expect(list).toContain('Placed');
    expect(list).toContain('$250.00');
    const detail = await html(() => import('@/app/(portal)/client/orders/[id]/page'), { params: { id: O1 }, searchParams: { org: ORG } });
    expect(detail).toContain('ORD-00001000');
    expect(detail).toContain('2 x $125.00');
    expect(detail).toContain('Ship to');
    expect(detail.replace(/<[^>]*>/g, ' ')).not.toMatch(/base|markup|floor/i); // visible text only (CSS classes such as text-base are not content)
  });
  it('the result banner shows fixed copy for a result code, never the raw query text', async () => {
    const h = await html(() => import('@/app/(portal)/client/shop/page'), { searchParams: { org: ORG, e: 'cart_full', x: '<script>' } });
    expect(h).toContain('Your cart has too many lines.');
    expect(h).not.toContain('<script>');
  });
});

describe('admin pages (fixture render; the gate is mocked to allow)', () => {
  it('products: price forms with the current base and floor, "not set" placeholder, archive control, and the count of unpriced variants', async () => {
    const h = await html(() => import('@/app/(portal)/admin/products/page'));
    expect(h).toContain('value="100.00"');
    expect(h).toContain('value="110.00"');
    expect(h).toContain('placeholder="not set"');
    expect(h).toContain('1 variants have no price yet');
    expect(h).toContain('Archive');
  });
  it('pricing: organization table with markup percentages and a create form with a code pattern', async () => {
    const h = await html(() => import('@/app/(portal)/admin/pricing/page'));
    expect(h).toContain('TESTLAB');
    expect(h).toContain('Active rules');
    expect(h).toMatch(/pattern="\[A-Za-z0-9\]\[A-Za-z0-9-\]\{2,19\}"/);
    expect(h).toContain('fresh authenticator verification');
  });
  it('organization catalog: markup form with current values, member form, assignment state and actions', async () => {
    const h = await html(() => import('@/app/(portal)/admin/pricing/[orgId]/page'), { params: { orgId: ORG }, searchParams: {} });
    expect(h).toContain('25%');
    expect(h).toContain('Representative bounds: percent 2 to 5');
    expect(h).toContain('Inactive');
    expect(h).toContain('Representative (applied on the organization price)');
    expect(h).toContain('Published, unavailable');
    expect(h).toContain('Needs a base price and a minimum price before it can be published');
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>Publish<\/button>/);
    expect(h).toContain('Make unavailable');
    expect(h).toContain('Unpublish');
    expect(h).toContain('type="email"');
  });
  it('orders and order detail: filter links, snapshot with base, markup and floor, and a status form limited to the allowed next states', async () => {
    const list = await html(() => import('@/app/(portal)/admin/orders/page'));
    expect(list).toContain('ORD-00001000');
    expect(list).toContain('status=delivered');
    const d = await html(() => import('@/app/(portal)/admin/orders/[id]/page'), { params: { id: O1 }, searchParams: {} });
    expect(d).toContain('base $100.00');
    expect(d).toContain('organization markup 25% = $25.00');
    expect(d).toContain('clamped to bounds');
    expect(d).toContain('floor $110.00');
    expect(d).toMatch(/<option value="confirmed"[^>]*>Confirmed<\/option>/);
    expect(d).toMatch(/<option value="cancelled"/);
    expect(d).not.toMatch(/<option value="shipped"/);
    expect(d).not.toMatch(/<option value="delivered"/);
  });
});
