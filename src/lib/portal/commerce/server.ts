import 'server-only';
import { z } from 'zod';
import { createPortalServerClient } from '@/portal/db/server';
import { getPortalUser } from '@/lib/portal/auth';
import { isDemoMode } from '@/lib/portal/demo/config';

/**
 * Typed access to the P3 RPCs (supabase/migrations/20261110000100_p3_catalog_pricing_orders.sql, applied to the hosted development project). Every call runs with the signed-in user's own session, so the DATABASE decides who may do what;
 * nothing here uses a service-role key. Answers are validated; anything unexpected (an error, a missing function, a malformed body) becomes a generic failure.
 * Callers must have authenticated the user and, for staff screens, passed requireStaffCapability() first (defence in depth: the RPC re-checks everything).
 */
export type Result<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly code: string };

const envelope = z.object({ ok: z.boolean(), code: z.string().max(64).optional() }).passthrough();

async function call<S extends z.ZodTypeAny>(fn: string, args: Record<string, unknown>, schema: S): Promise<Result<z.infer<S>>> {
  try {
    const supabase = createPortalServerClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, code: 'unavailable' };
    const env = envelope.safeParse(data);
    if (!env.success) return { ok: false, code: 'invalid_response' };
    if (!env.data.ok) return { ok: false, code: env.data.code ?? 'failed' };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: 'invalid_response' };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

/** Demo mode (localhost demonstration, never in production builds): the same operations run on the local demo repository instead of the database RPCs. */
// Loaded lazily: in real (default) mode the demo code, its seed and its file store are never imported or executed.
const demo = async () => (isDemoMode() ? (await import('@/lib/portal/demo/adapter')).demoRepo() : null);

const cents = z.number().int().nonnegative();
const done = z.object({ ok: z.literal(true), code: z.string().optional() }).passthrough();

// ---------------------------------------------------------------------------------------------------------------- customer
export type MyOrganization = { id: string; name: string; code: string; role: 'owner' | 'member' };

/** Active organizations of the signed-in user, read through row level security with the user's own session. */
export async function getMyOrganizations(): Promise<MyOrganization[]> {
  const user = await getPortalUser();
  if (!user) return [];
  const d = await demo();
  if (d) return d.myOrganizations();
  try {
    const supabase = createPortalServerClient();
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, organizations!inner(id, name, code, status)')
      .eq('user_id', user.id)
      .eq('status', 'active');
    if (error || !Array.isArray(data)) return [];
    const row = z.object({ role: z.enum(['owner', 'member']), organizations: z.object({ id: z.string().uuid(), name: z.string(), code: z.string(), status: z.string() }) });
    return data
      .map((r) => row.safeParse(Array.isArray(r.organizations) ? { ...r, organizations: r.organizations[0] } : r))
      .flatMap((p) => (p.success && p.data.organizations.status === 'active' ? [{ id: p.data.organizations.id, name: p.data.organizations.name, code: p.data.organizations.code, role: p.data.role }] : []))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** The organization of this request: the one named by ?org= if the user belongs to it, else the first. null when the user has no active organization. */
export async function resolveOrganization(requested: string | undefined): Promise<MyOrganization | null> {
  const orgs = await getMyOrganizations();
  return orgs.find((o) => o.id === requested) ?? orgs[0] ?? null;
}

const catalogVariant = z.object({ variant_id: z.string().uuid(), spec: z.string(), sku: z.string(), unit_cents: cents.nullable() });
const catalogItem = z.object({
  product_id: z.string().uuid(), slug: z.string(), name: z.string(), category: z.string(), cas: z.string().nullable(), description: z.string().nullable(),
  available: z.boolean(), variants: z.array(catalogVariant),
});
export type CatalogItem = z.infer<typeof catalogItem>;
const real_catalogList = (organizationId: string) => call('rpc_catalog_list', { p_organization_id: organizationId }, z.object({ items: z.array(catalogItem) }));

const cartLine = z.object({
  variant_id: z.string().uuid(), product_name: z.string(), spec: z.string(), sku: z.string(), quantity: z.number().int().positive(),
  unit_cents: cents.nullable(), line_cents: cents.nullable(), purchasable: z.boolean(),
});
export type CartLine = z.infer<typeof cartLine>;
const real_cartGet = (organizationId: string) => call('rpc_cart_get', { p_organization_id: organizationId }, z.object({ lines: z.array(cartLine) }));
const real_cartPutItem = (organizationId: string, variantId: string, quantity: number) =>
  call('rpc_cart_put_item', { p_organization_id: organizationId, p_variant_id: variantId, p_quantity: quantity }, done);
const real_cartEmpty = (organizationId: string) => call('rpc_cart_empty', { p_organization_id: organizationId }, done);
const real_checkout = (organizationId: string, shipTo: Record<string, string | undefined>, notes: string | undefined, idempotencyKey: string) =>
  call('rpc_checkout', { p_organization_id: organizationId, p_ship_to: shipTo, p_notes: notes ?? null, p_idempotency_key: idempotencyKey },
       z.object({ order_id: z.string().uuid(), order_number: z.string(), total_cents: cents, replay: z.boolean().optional() }));

const orderSummary = z.object({ order_id: z.string().uuid(), order_number: z.string(), status: z.string(), total_cents: cents, created_at: z.string() });
export type OrderSummary = z.infer<typeof orderSummary>;
const real_ordersList = (organizationId: string) => call('rpc_orders_list', { p_organization_id: organizationId, p_limit: 50 }, z.object({ orders: z.array(orderSummary) }));

const orderDetail = z.object({
  order: z.object({ order_id: z.string().uuid(), order_number: z.string(), status: z.string(), subtotal_cents: cents, total_cents: cents, currency: z.string(), ship_to: z.record(z.string(), z.string()), notes: z.string().nullable(), created_at: z.string() }),
  items: z.array(z.object({ product_name: z.string(), spec: z.string(), sku: z.string(), quantity: z.number().int(), unit_price_cents: cents, line_total_cents: cents })),
  events: z.array(z.object({ from_status: z.string().nullable(), to_status: z.string(), at: z.string() })),
});
export type OrderDetail = z.infer<typeof orderDetail>;
const real_orderGet = (organizationId: string, orderId: string) => call('rpc_order_get', { p_organization_id: organizationId, p_order_id: orderId }, orderDetail);

// ---------------------------------------------------------------------------------------------------------------- admin (staff)
const adminOrg = z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), status: z.string(), members: z.number().int(), rules: z.number().int(), assigned_products: z.number().int() });
export type AdminOrg = z.infer<typeof adminOrg>;
const real_adminOrgsList = () => call('rpc_admin_orgs_list', {}, z.object({ organizations: z.array(adminOrg) }));
const real_adminOrgCreate = (name: string, code: string) => call('rpc_admin_org_create', { p_name: name, p_code: code, p_payment_terms: 'prepay' }, done);
const real_adminOrgMemberAdd = (organizationId: string, email: string, role: 'owner' | 'member') =>
  call('rpc_admin_org_member_add', { p_organization_id: organizationId, p_email: email, p_role: role }, done);

const adminVariant = z.object({ variant_id: z.string().uuid(), spec: z.string(), sku: z.string(), base_price_cents: cents.nullable(), min_price_cents: cents.nullable(), status: z.string() });
const adminProduct = z.object({ product_id: z.string().uuid(), slug: z.string(), name: z.string(), category: z.string(), status: z.string(), variants: z.array(adminVariant) });
export type AdminProduct = z.infer<typeof adminProduct>;
const real_adminCatalogList = () => call('rpc_admin_catalog_list', {}, z.object({ products: z.array(adminProduct) }));
const real_adminVariantSetPrice = (variantId: string, baseCents: number | null, minCents: number | null) =>
  call('rpc_admin_variant_set_price', { p_variant_id: variantId, p_base_cents: baseCents, p_min_cents: minCents }, done);
const real_adminProductSetStatus = (productId: string, status: 'active' | 'archived') => call('rpc_admin_product_set_status', { p_product_id: productId, p_status: status }, done);

const e4 = z.number().int().nonnegative().nullable();
const adminRule = z.object({
  rule_id: z.string().uuid(), kind: z.enum(['organization', 'representative']), product_id: z.string().uuid().nullable(), product_name: z.string().nullable(),
  markup_type: z.enum(['percent', 'fixed']), value_e4: z.number().int().nonnegative(), rep_min_percent_e4: e4, rep_max_percent_e4: e4, rep_min_fixed_e4: e4, rep_max_fixed_e4: e4, is_active: z.boolean(),
});
export type AdminRule = z.infer<typeof adminRule>;
const adminOrgCatalog = z.object({
  rules: z.array(adminRule),
  products: z.array(z.object({ product_id: z.string().uuid(), name: z.string(), slug: z.string(), status: z.string(), assigned: z.boolean(), available: z.boolean(), priced: z.boolean() })),
});
export type AdminOrgCatalog = z.infer<typeof adminOrgCatalog>;
const real_adminOrgCatalogGet = (organizationId: string) => call('rpc_admin_org_catalog_get', { p_organization_id: organizationId }, adminOrgCatalog);
const real_adminOrgProductSet = (organizationId: string, productId: string, assigned: boolean, available: boolean) =>
  call('rpc_admin_org_product_set', { p_organization_id: organizationId, p_product_id: productId, p_assigned: assigned, p_available: available }, done);
export type MarkupRuleInput = {
  organizationId: string; kind: 'organization' | 'representative'; productId: string | null; type: 'percent' | 'fixed'; valueE4: number;
  repMinPercentE4: number | null; repMaxPercentE4: number | null; repMinFixedE4: number | null; repMaxFixedE4: number | null; active: boolean;
};
const real_adminMarkupRuleSet = (r: MarkupRuleInput) =>
  call('rpc_admin_markup_rule_set', {
    p_organization_id: r.organizationId, p_kind: r.kind, p_product_id: r.productId, p_markup_type: r.type, p_value_e4: r.valueE4,
    p_rep_min_percent_e4: r.repMinPercentE4, p_rep_max_percent_e4: r.repMaxPercentE4, p_rep_min_fixed_e4: r.repMinFixedE4, p_rep_max_fixed_e4: r.repMaxFixedE4, p_active: r.active,
  }, done);

const adminOrderRow = z.object({ order_id: z.string().uuid(), order_number: z.string(), status: z.string(), total_cents: cents, organization_id: z.string().uuid(), organization_name: z.string(), organization_code: z.string(), created_at: z.string() });
export type AdminOrderRow = z.infer<typeof adminOrderRow>;
const real_adminOrdersList = (status: string | null) => call('rpc_admin_orders_list', { p_status: status, p_limit: 100 }, z.object({ orders: z.array(adminOrderRow) }));

const adminOrderDetail = z.object({
  order: z.object({
    order_id: z.string().uuid(), order_number: z.string(), status: z.string(), subtotal_cents: cents, total_cents: cents, currency: z.string(), ship_to: z.record(z.string(), z.string()),
    notes: z.string().nullable(), created_at: z.string(), organization_id: z.string().uuid(), organization_name: z.string(), organization_code: z.string(),
  }),
  items: z.array(z.object({
    product_name: z.string(), spec: z.string(), sku: z.string(), quantity: z.number().int(), base_price_cents: cents, floor_cents: cents, unit_price_cents: cents, line_total_cents: cents,
    pricing: z.object({
      org_type: z.enum(['percent', 'fixed']).nullable(), org_value_e4: z.number().nullable(), org_amount: z.number().int(), org_price: z.number().int(),
      rep_type: z.enum(['percent', 'fixed']).nullable(), rep_value_e4: z.number().nullable(), rep_amount: z.number().int(), rep_clamped: z.boolean(), raw: z.number().int(), floor_applied: z.boolean(),
    }).passthrough(),
  })),
  events: z.array(z.object({ from_status: z.string().nullable(), to_status: z.string(), actor_kind: z.string(), note: z.string().nullable(), at: z.string() })),
});
export type AdminOrderDetail = z.infer<typeof adminOrderDetail>;
const real_adminOrderGet = (orderId: string) => call('rpc_admin_order_get', { p_order_id: orderId }, adminOrderDetail);
const real_adminOrderSetStatus = (orderId: string, to: string, note: string | undefined) =>
  call('rpc_admin_order_set_status', { p_order_id: orderId, p_to_status: to, p_note: note ?? null }, done);

// ---------------------------------------------------------------------------------------------------------------- public API: demo repository in demo mode, database RPCs otherwise
export const catalogList = async (...a: Parameters<typeof real_catalogList>): Promise<Awaited<ReturnType<typeof real_catalogList>>> => {
  const d = await demo();
  return d ? d.catalogList(...a) : real_catalogList(...a);
};
export const cartGet = async (...a: Parameters<typeof real_cartGet>): Promise<Awaited<ReturnType<typeof real_cartGet>>> => {
  const d = await demo();
  return d ? d.cartGet(...a) : real_cartGet(...a);
};
export const cartPutItem = async (...a: Parameters<typeof real_cartPutItem>): Promise<Awaited<ReturnType<typeof real_cartPutItem>>> => {
  const d = await demo();
  return d ? d.cartPutItem(...a) : real_cartPutItem(...a);
};
export const cartEmpty = async (...a: Parameters<typeof real_cartEmpty>): Promise<Awaited<ReturnType<typeof real_cartEmpty>>> => {
  const d = await demo();
  return d ? d.cartEmpty(...a) : real_cartEmpty(...a);
};
export const checkout = async (...a: Parameters<typeof real_checkout>): Promise<Awaited<ReturnType<typeof real_checkout>>> => {
  const d = await demo();
  return d ? d.checkout(...a) : real_checkout(...a);
};
export const ordersList = async (...a: Parameters<typeof real_ordersList>): Promise<Awaited<ReturnType<typeof real_ordersList>>> => {
  const d = await demo();
  return d ? d.ordersList(...a) : real_ordersList(...a);
};
export const orderGet = async (...a: Parameters<typeof real_orderGet>): Promise<Awaited<ReturnType<typeof real_orderGet>>> => {
  const d = await demo();
  return d ? d.orderGet(...a) : real_orderGet(...a);
};
export const adminOrgsList = async (...a: Parameters<typeof real_adminOrgsList>): Promise<Awaited<ReturnType<typeof real_adminOrgsList>>> => {
  const d = await demo();
  return d ? d.adminOrgsList(...a) : real_adminOrgsList(...a);
};
export const adminOrgCreate = async (...a: Parameters<typeof real_adminOrgCreate>): Promise<Awaited<ReturnType<typeof real_adminOrgCreate>>> => {
  const d = await demo();
  return d ? d.adminOrgCreate(...a) : real_adminOrgCreate(...a);
};
export const adminOrgMemberAdd = async (...a: Parameters<typeof real_adminOrgMemberAdd>): Promise<Awaited<ReturnType<typeof real_adminOrgMemberAdd>>> => {
  const d = await demo();
  return d ? d.adminOrgMemberAdd(...a) : real_adminOrgMemberAdd(...a);
};
export const adminCatalogList = async (...a: Parameters<typeof real_adminCatalogList>): Promise<Awaited<ReturnType<typeof real_adminCatalogList>>> => {
  const d = await demo();
  return d ? d.adminCatalogList(...a) : real_adminCatalogList(...a);
};
export const adminVariantSetPrice = async (...a: Parameters<typeof real_adminVariantSetPrice>): Promise<Awaited<ReturnType<typeof real_adminVariantSetPrice>>> => {
  const d = await demo();
  return d ? d.adminVariantSetPrice(...a) : real_adminVariantSetPrice(...a);
};
export const adminProductSetStatus = async (...a: Parameters<typeof real_adminProductSetStatus>): Promise<Awaited<ReturnType<typeof real_adminProductSetStatus>>> => {
  const d = await demo();
  return d ? d.adminProductSetStatus(...a) : real_adminProductSetStatus(...a);
};
export const adminOrgCatalogGet = async (...a: Parameters<typeof real_adminOrgCatalogGet>): Promise<Awaited<ReturnType<typeof real_adminOrgCatalogGet>>> => {
  const d = await demo();
  return d ? d.adminOrgCatalogGet(...a) : real_adminOrgCatalogGet(...a);
};
export const adminOrgProductSet = async (...a: Parameters<typeof real_adminOrgProductSet>): Promise<Awaited<ReturnType<typeof real_adminOrgProductSet>>> => {
  const d = await demo();
  return d ? d.adminOrgProductSet(...a) : real_adminOrgProductSet(...a);
};
export const adminMarkupRuleSet = async (...a: Parameters<typeof real_adminMarkupRuleSet>): Promise<Awaited<ReturnType<typeof real_adminMarkupRuleSet>>> => {
  const d = await demo();
  return d ? d.adminMarkupRuleSet(...a) : real_adminMarkupRuleSet(...a);
};
export const adminOrdersList = async (...a: Parameters<typeof real_adminOrdersList>): Promise<Awaited<ReturnType<typeof real_adminOrdersList>>> => {
  const d = await demo();
  return d ? d.adminOrdersList(...a) : real_adminOrdersList(...a);
};
export const adminOrderGet = async (...a: Parameters<typeof real_adminOrderGet>): Promise<Awaited<ReturnType<typeof real_adminOrderGet>>> => {
  const d = await demo();
  return d ? d.adminOrderGet(...a) : real_adminOrderGet(...a);
};
export const adminOrderSetStatus = async (...a: Parameters<typeof real_adminOrderSetStatus>): Promise<Awaited<ReturnType<typeof real_adminOrderSetStatus>>> => {
  const d = await demo();
  return d ? d.adminOrderSetStatus(...a) : real_adminOrderSetStatus(...a);
};

export { COMMERCE_MESSAGES, messageFor } from './messages';
