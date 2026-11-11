import { randomUUID } from 'node:crypto';
import { MAX_CART_LINES, MAX_LINE_QUANTITY, MAX_ORDER_TOTAL_CENTS, MAX_PRICE_CENTS, priceFor, type Breakdown, type MarkupRule } from '../commerce/pricing';
import { canTransition, isOrderStatus } from '../commerce/orders';
import type {
  AdminOrderDetail, AdminOrderRow, AdminOrg, AdminOrgCatalog, AdminProduct, CartLine, CatalogItem, MarkupRuleInput, MyOrganization, OrderDetail, OrderSummary,
} from '../commerce/server';
import type { Actor, DemoOrder, DemoOrg, DemoPaymentStatus, DemoProduct, DemoRule, DemoState, DemoStore, DemoVariant } from './types';

/**
 * The demo commerce engine: the same operations, result shapes and result codes as the P3 RPCs (commerce/server.ts), running on a local DemoStore instead of the database.
 * Prices are ALWAYS computed here with the shared pricing model (commerce/pricing.ts); no caller supplies a price. Customer operations check organization membership,
 * staff operations check that the actor is a demo administrator. Nothing here is a real payment, shipment or integration.
 */
export type R<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly code: string };
const ok = <T>(data: T): R<T> => ({ ok: true, data });
const fail = (code: string): R<never> => ({ ok: false, code });
type Done = { ok: true; code?: string };
const done = (code: string): R<Done> => ok({ ok: true, code });

const now = () => new Date().toISOString();
const cmp = (a: string, b: string) => a.localeCompare(b);
export const PAYMENT_STATUSES: readonly DemoPaymentStatus[] = ['unpaid', 'paid', 'refunded', 'failed'];

const snapshot = (b: Breakdown): Record<string, unknown> => ({
  base: b.base, floor: b.floor, org_type: b.orgType, org_value_e4: b.orgValueE4, org_amount: b.orgAmount, org_price: b.orgPrice,
  rep_type: b.repType, rep_value_e4: b.repValueE4, rep_amount: b.repAmount, rep_clamped: b.repClamped, raw: b.raw, floor_applied: b.floorApplied, unit: b.unit,
});

export class DemoCommerce {
  constructor(private readonly store: DemoStore, private readonly actor: Actor) {}

  private get s(): DemoState {
    return this.store.get();
  }
  private audit(action: string, detail: string): void {
    this.s.audit.push({ at: now(), actor: this.actor.userId, action, detail });
  }
  private isAdmin(): boolean {
    return this.actor.kind === 'admin' && this.s.users.some((u) => u.id === this.actor.userId && u.kind === 'admin');
  }

  // ------------------------------------------------------------------------------------------------------------------------------------ shared helpers
  private rulesFor(orgId: string): MarkupRule[] {
    return this.s.rules.filter((r) => r.orgId === orgId).map((r) => ({
      kind: r.kind, productId: r.productId, type: r.type, valueE4: r.valueE4, isActive: r.isActive,
      repMinPercentE4: r.repMinPercentE4, repMaxPercentE4: r.repMaxPercentE4, repMinFixedE4: r.repMinFixedE4, repMaxFixedE4: r.repMaxFixedE4,
    }));
  }
  private price(orgId: string, product: DemoProduct, variant: DemoVariant): Breakdown | null {
    return priceFor(this.rulesFor(orgId), product.id, variant.baseCents, variant.floorCents);
  }
  /** A variant is purchasable for an organization when its product is active and assigned+available to it and the variant has a base price and a floor. */
  private sellable(orgId: string, variantId: string): { product: DemoProduct; variant: DemoVariant; pricing: Breakdown } | null {
    const variant = this.s.variants.find((v) => v.id === variantId); if (!variant) return null;
    const product = this.s.products.find((p) => p.id === variant.productId); if (!product || product.status !== 'active') return null;
    if (!this.s.assignments.some((a) => a.orgId === orgId && a.productId === product.id && a.available)) return null;
    const pricing = this.price(orgId, product, variant); return pricing ? { product, variant, pricing } : null;
  }
  /** Tenant boundary: the actor must be an active member of an active organization. Everything else answers organization_not_found. */
  private member(orgId: string): DemoOrg | null {
    const org = this.s.orgs.find((o) => o.id === orgId && o.status === 'active'); if (!org) return null;
    return this.s.members.some((m) => m.orgId === orgId && m.userId === this.actor.userId) && this.actor.kind === 'customer' ? org : null;
  }

  // ------------------------------------------------------------------------------------------------------------------------------------ customer
  myOrganizations(): MyOrganization[] {
    if (this.actor.kind !== 'customer') return [];
    return this.s.members.filter((m) => m.userId === this.actor.userId).flatMap((m) => {
      const o = this.s.orgs.find((x) => x.id === m.orgId && x.status === 'active'); return o ? [{ id: o.id, name: o.name, code: o.code, role: m.role }] : [];
    }).sort((a, b) => cmp(a.name, b.name));
  }

  catalogList(orgId: string): R<{ items: CatalogItem[] }> {
    if (!this.member(orgId)) return fail('organization_not_found');
    const items: CatalogItem[] = [];
    for (const p of this.s.products) {
      if (p.status !== 'active' || !this.s.assignments.some((a) => a.orgId === orgId && a.productId === p.id && a.available)) continue;
      const variants = this.s.variants.filter((v) => v.productId === p.id).flatMap((v) => {
        const pr = this.price(orgId, p, v); return pr ? [{ variant_id: v.id, spec: v.spec, sku: v.sku, unit_cents: pr.unit }] : [];
      }).sort((a, b) => cmp(a.spec, b.spec));
      if (variants.length) items.push({ product_id: p.id, slug: p.slug, name: p.name, category: p.category, cas: p.cas, description: p.description, available: true, variants });
    }
    return ok({ items: items.sort((a, b) => cmp(a.name, b.name)) });
  }

  private cart(orgId: string) {
    let c = this.s.carts.find((x) => x.orgId === orgId && x.userId === this.actor.userId);
    if (!c) { c = { orgId, userId: this.actor.userId, lines: [] }; this.s.carts.push(c); }
    return c;
  }
  cartGet(orgId: string): R<{ lines: CartLine[] }> {
    if (!this.member(orgId)) return fail('organization_not_found');
    const c = this.s.carts.find((x) => x.orgId === orgId && x.userId === this.actor.userId);
    const lines: CartLine[] = (c?.lines ?? []).flatMap((l) => {
      const variant = this.s.variants.find((v) => v.id === l.variantId); const product = variant && this.s.products.find((p) => p.id === variant.productId); if (!variant || !product) return [];
      const sell = this.sellable(orgId, l.variantId);
      return [{ variant_id: variant.id, product_name: product.name, spec: variant.spec, sku: variant.sku, quantity: l.quantity, unit_cents: sell?.pricing.unit ?? null, line_cents: sell ? sell.pricing.unit * l.quantity : null, purchasable: Boolean(sell) }];
    }).sort((a, b) => cmp(a.product_name, b.product_name) || cmp(a.spec, b.spec));
    return ok({ lines });
  }
  cartPutItem(orgId: string, variantId: string, quantity: number): R<Done> {
    if (!this.member(orgId)) return fail('organization_not_found');
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) return fail('invalid_response');
    const c = this.cart(orgId); const existing = c.lines.find((l) => l.variantId === variantId);
    if (quantity === 0) { c.lines = c.lines.filter((l) => l.variantId !== variantId); this.store.save(); return done('updated'); }
    if (!this.sellable(orgId, variantId)) return fail('not_available');
    if (existing) existing.quantity = quantity;
    else { if (c.lines.length >= MAX_CART_LINES) return fail('cart_full'); c.lines.push({ variantId, quantity }); }
    this.store.save(); return done('updated');
  }
  cartEmpty(orgId: string): R<Done> {
    if (!this.member(orgId)) return fail('organization_not_found');
    this.cart(orgId).lines = []; this.store.save(); return done('updated');
  }

  checkout(orgId: string, shipTo: Record<string, string | undefined>, notes: string | undefined, key: string): R<{ order_id: string; order_number: string; total_cents: number; replay?: boolean }> {
    if (!this.member(orgId)) return fail('organization_not_found');
    const idemKey = `${orgId}:${this.actor.userId}:${key}`; const prior = this.s.idempotency.find((i) => i.key === idemKey);
    if (prior) { const o = this.s.orders.find((x) => x.id === prior.orderId); if (o) return ok({ order_id: o.id, order_number: o.number, total_cents: o.totalCents, replay: true }); }
    const cart = this.s.carts.find((x) => x.orgId === orgId && x.userId === this.actor.userId);
    if (!cart || cart.lines.length === 0) return fail('cart_empty');
    const items: DemoOrder['items'] = [];
    for (const l of cart.lines) {
      const sell = this.sellable(orgId, l.variantId); if (!sell) return fail('cart_not_purchasable');
      items.push({
        productName: sell.product.name, spec: sell.variant.spec, sku: sell.variant.sku, quantity: l.quantity, baseCents: sell.pricing.base, floorCents: sell.pricing.floor,
        unitCents: sell.pricing.unit, lineCents: sell.pricing.unit * l.quantity, pricing: snapshot(sell.pricing),
      });
    }
    const total = items.reduce((a, i) => a + i.lineCents, 0); if (total > MAX_ORDER_TOTAL_CENTS) return fail('order_too_large');
    items.sort((a, b) => cmp(a.productName, b.productName) || cmp(a.spec, b.spec));
    const at = now(); this.s.orderSeq += 1;
    const ship: Record<string, string> = {}; for (const [k, v] of Object.entries(shipTo)) if (typeof v === 'string' && v !== '') ship[k] = v;
    const order: DemoOrder = {
      id: randomUUID(), number: `ORD-${String(this.s.orderSeq).padStart(8, '0')}`, orgId, placedBy: this.actor.userId, status: 'placed', paymentStatus: 'unpaid', subtotalCents: total, totalCents: total, currency: 'USD',
      shipTo: ship, notes: notes?.trim() ? notes.trim() : null, createdAt: at, items, events: [{ from: null, to: 'placed', actor: 'customer', note: null, at }],
    };
    this.s.orders.push(order); this.s.idempotency.push({ key: idemKey, orderId: order.id }); cart.lines = [];
    this.audit('order.place', order.number); this.store.save();
    return ok({ order_id: order.id, order_number: order.number, total_cents: total, replay: false });
  }

  ordersList(orgId: string): R<{ orders: OrderSummary[] }> {
    if (!this.member(orgId)) return fail('organization_not_found');
    const orders = this.s.orders.filter((o) => o.orgId === orgId).sort((a, b) => cmp(b.createdAt, a.createdAt))
      .map((o) => ({ order_id: o.id, order_number: o.number, status: o.status, total_cents: o.totalCents, created_at: o.createdAt }));
    return ok({ orders });
  }
  orderGet(orgId: string, orderId: string): R<OrderDetail> {
    if (!this.member(orgId)) return fail('organization_not_found');
    const o = this.s.orders.find((x) => x.id === orderId && x.orgId === orgId); if (!o) return fail('order_not_found');
    return ok({
      order: { order_id: o.id, order_number: o.number, status: o.status, subtotal_cents: o.subtotalCents, total_cents: o.totalCents, currency: o.currency, ship_to: o.shipTo, notes: o.notes, created_at: o.createdAt },
      items: o.items.map((i) => ({ product_name: i.productName, spec: i.spec, sku: i.sku, quantity: i.quantity, unit_price_cents: i.unitCents, line_total_cents: i.lineCents })),
      events: o.events.map((e) => ({ from_status: e.from, to_status: e.to, at: e.at })),
    });
  }

  // ------------------------------------------------------------------------------------------------------------------------------------ administration
  private requireAdmin(): R<never> | null {
    return this.isAdmin() ? null : fail('forbidden');
  }
  adminOrgsList(): R<{ organizations: AdminOrg[] }> {
    const d = this.requireAdmin(); if (d) return d;
    return ok({ organizations: this.s.orgs.map((o) => ({
      id: o.id, code: o.code, name: o.name, status: o.status, members: this.s.members.filter((m) => m.orgId === o.id).length,
      rules: this.s.rules.filter((r) => r.orgId === o.id && r.isActive).length, assigned_products: this.s.assignments.filter((a) => a.orgId === o.id).length,
    })).sort((a, b) => cmp(a.name, b.name)) });
  }
  adminOrgCreate(name: string, code: string): R<Done> {
    const d = this.requireAdmin(); if (d) return d;
    if (this.s.orgs.some((o) => o.code === code)) return fail('code_taken');
    this.s.orgs.push({ id: randomUUID(), code, name, status: 'active', paymentTerms: 'prepay', createdAt: now() });
    this.audit('org.create', code); this.store.save(); return done('created');
  }
  adminOrgMemberAdd(orgId: string, email: string, role: 'owner' | 'member'): R<Done> {
    const d = this.requireAdmin(); if (d) return d;
    if (!this.s.orgs.some((o) => o.id === orgId && o.status === 'active')) return fail('organization_not_found');
    const user = this.s.users.find((u) => u.email === email.toLowerCase()); if (!user) return fail('user_not_found');
    if (user.kind === 'admin') return fail('member_not_allowed');
    const m = this.s.members.find((x) => x.orgId === orgId && x.userId === user.id);
    if (!m) { this.s.members.push({ orgId, userId: user.id, role }); this.audit('org.member.add', email); this.store.save(); return done('added'); }
    if (m.role === role) return done('already_member');
    if (m.role === 'owner') return fail('owner_downgrade_not_allowed');
    m.role = role; this.audit('org.member.role', email); this.store.save(); return done('role_changed');
  }

  adminCatalogList(): R<{ products: AdminProduct[] }> {
    const d = this.requireAdmin(); if (d) return d;
    return ok({ products: this.s.products.map((p) => ({
      product_id: p.id, slug: p.slug, name: p.name, category: p.category, status: p.status,
      variants: this.s.variants.filter((v) => v.productId === p.id).map((v) => ({ variant_id: v.id, spec: v.spec, sku: v.sku, base_price_cents: v.baseCents, min_price_cents: v.floorCents, status: 'active' })).sort((a, b) => cmp(a.spec, b.spec)),
    })).sort((a, b) => cmp(a.name, b.name)) });
  }
  adminVariantSetPrice(variantId: string, base: number | null, floor: number | null): R<Done> {
    const d = this.requireAdmin(); if (d) return d;
    const v = this.s.variants.find((x) => x.id === variantId); if (!v) return fail('variant_not_found');
    for (const n of [base, floor]) if (n !== null && (!Number.isInteger(n) || n < 1 || n > MAX_PRICE_CENTS)) return fail('invalid_response');
    v.baseCents = base; v.floorCents = floor; this.audit('variant.price', v.sku); this.store.save(); return done('updated');
  }
  adminProductSetStatus(productId: string, status: 'active' | 'archived'): R<Done> {
    const d = this.requireAdmin(); if (d) return d;
    const p = this.s.products.find((x) => x.id === productId); if (!p) return fail('product_not_found');
    p.status = status; this.audit('product.status', `${p.slug} ${status}`); this.store.save(); return done('updated');
  }
  adminOrgCatalogGet(orgId: string): R<AdminOrgCatalog> {
    const d = this.requireAdmin(); if (d) return d;
    if (!this.s.orgs.some((o) => o.id === orgId)) return fail('organization_not_found');
    const rules = this.s.rules.filter((r) => r.orgId === orgId).map((r) => ({
      rule_id: r.id, kind: r.kind, product_id: r.productId, product_name: r.productId ? this.s.products.find((p) => p.id === r.productId)?.name ?? null : null, markup_type: r.type, value_e4: r.valueE4,
      rep_min_percent_e4: r.repMinPercentE4, rep_max_percent_e4: r.repMaxPercentE4, rep_min_fixed_e4: r.repMinFixedE4, rep_max_fixed_e4: r.repMaxFixedE4, is_active: r.isActive,
    }));
    const products = this.s.products.map((p) => {
      const a = this.s.assignments.find((x) => x.orgId === orgId && x.productId === p.id);
      const priced = this.s.variants.some((v) => v.productId === p.id && v.baseCents !== null && v.floorCents !== null);
      return { product_id: p.id, name: p.name, slug: p.slug, status: p.status, assigned: Boolean(a), available: Boolean(a?.available), priced };
    }).sort((a, b) => cmp(a.name, b.name));
    return ok({ rules, products });
  }
  adminOrgProductSet(orgId: string, productId: string, assigned: boolean, available: boolean): R<Done> {
    const d = this.requireAdmin(); if (d) return d;
    if (!this.s.orgs.some((o) => o.id === orgId) || !this.s.products.some((p) => p.id === productId)) return fail('organization_not_found');
    if (assigned && !this.s.variants.some((v) => v.productId === productId && v.baseCents !== null && v.floorCents !== null)) return fail('product_not_priced');
    this.s.assignments = this.s.assignments.filter((a) => !(a.orgId === orgId && a.productId === productId));
    if (assigned) this.s.assignments.push({ orgId, productId, available });
    this.audit('org.product', `${orgId} ${productId}`); this.store.save(); return done('updated');
  }
  adminMarkupRuleSet(r: MarkupRuleInput): R<Done> {
    const d = this.requireAdmin(); if (d) return d;
    if (!this.s.orgs.some((o) => o.id === r.organizationId)) return fail('organization_not_found');
    if (r.productId !== null && !this.s.products.some((p) => p.id === r.productId)) return fail('product_not_found');
    const rule: DemoRule = {
      id: randomUUID(), orgId: r.organizationId, kind: r.kind, productId: r.productId, type: r.type, valueE4: r.valueE4,
      repMinPercentE4: r.repMinPercentE4, repMaxPercentE4: r.repMaxPercentE4, repMinFixedE4: r.repMinFixedE4, repMaxFixedE4: r.repMaxFixedE4, isActive: r.active,
    };
    const i = this.s.rules.findIndex((x) => x.orgId === rule.orgId && x.kind === rule.kind && x.productId === rule.productId);
    if (i >= 0) { const prev = this.s.rules[i]; if (prev) rule.id = prev.id; this.s.rules[i] = rule; } else this.s.rules.push(rule);
    this.audit('markup.set', `${r.organizationId} ${r.kind}`); this.store.save(); return done('updated');
  }

  private orgOf(o: DemoOrder) {
    const g = this.s.orgs.find((x) => x.id === o.orgId); return { organization_id: o.orgId, organization_name: g?.name ?? 'Unknown', organization_code: g?.code ?? '?' };
  }
  adminOrdersList(status: string | null): R<{ orders: AdminOrderRow[] }> {
    const d = this.requireAdmin(); if (d) return d;
    if (status !== null && !isOrderStatus(status)) return fail('invalid_response');
    const orders = this.s.orders.filter((o) => status === null || o.status === status).sort((a, b) => cmp(b.createdAt, a.createdAt)).slice(0, 100)
      .map((o) => ({ order_id: o.id, order_number: o.number, status: o.status, total_cents: o.totalCents, created_at: o.createdAt, ...this.orgOf(o) }));
    return ok({ orders });
  }
  adminOrderGet(orderId: string): R<AdminOrderDetail> {
    const d = this.requireAdmin(); if (d) return d;
    const o = this.s.orders.find((x) => x.id === orderId); if (!o) return fail('order_not_found');
    return ok({
      order: { order_id: o.id, order_number: o.number, status: o.status, subtotal_cents: o.subtotalCents, total_cents: o.totalCents, currency: o.currency, ship_to: o.shipTo, notes: o.notes, created_at: o.createdAt, ...this.orgOf(o) },
      items: o.items.map((i) => ({
        product_name: i.productName, spec: i.spec, sku: i.sku, quantity: i.quantity, base_price_cents: i.baseCents, floor_cents: i.floorCents, unit_price_cents: i.unitCents, line_total_cents: i.lineCents,
        pricing: i.pricing as AdminOrderDetail['items'][number]['pricing'],
      })),
      events: o.events.map((e) => ({ from_status: e.from, to_status: e.to, actor_kind: e.actor, note: e.note, at: e.at })),
    });
  }
  adminOrderSetStatus(orderId: string, to: string, note: string | undefined): R<Done> {
    const d = this.requireAdmin(); if (d) return d;
    const o = this.s.orders.find((x) => x.id === orderId); if (!o) return fail('order_not_found');
    if (!isOrderStatus(to) || !canTransition(o.status, to)) return fail('invalid_transition');
    o.events.push({ from: o.status, to, actor: 'staff', note: note?.trim() ? note.trim() : null, at: now() }); o.status = to;
    this.audit('order.status', `${o.number} ${to}`); this.store.save(); return done('updated');
  }
}
