import type { OrderStatus } from '../commerce/orders';

/** Demo data model. Plain JSON-serialisable records; the file store persists exactly this object. Money is integer cents; markup values are integers in units of 1e-4 (as in the P3 design). */
export type DemoUser = { id: string; email: string; name: string; kind: 'customer' | 'admin' };
export type DemoOrg = { id: string; code: string; name: string; status: 'active' | 'suspended'; paymentTerms: string; createdAt: string };
export type DemoMember = { orgId: string; userId: string; role: 'owner' | 'member' };
export type DemoProduct = { id: string; slug: string; name: string; category: string; cas: string | null; description: string | null; status: 'active' | 'archived' };
export type DemoVariant = { id: string; productId: string; spec: string; sku: string; baseCents: number | null; floorCents: number | null };
export type DemoAssignment = { orgId: string; productId: string; available: boolean };
export type DemoRule = {
  id: string; orgId: string; kind: 'organization' | 'representative'; productId: string | null; type: 'percent' | 'fixed'; valueE4: number;
  repMinPercentE4: number | null; repMaxPercentE4: number | null; repMinFixedE4: number | null; repMaxFixedE4: number | null; isActive: boolean;
};
export type DemoCart = { orgId: string; userId: string; lines: { variantId: string; quantity: number }[] };
export type DemoOrderItem = {
  productName: string; spec: string; sku: string; quantity: number; baseCents: number; floorCents: number; unitCents: number; lineCents: number; pricing: Record<string, unknown>;
};
export type DemoOrderEvent = { from: string | null; to: string; actor: 'customer' | 'staff'; note: string | null; at: string };
/** Demo-only payment state (the P3 database design has none: payments are a later phase). Nothing here moves money. */
export type DemoPaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'failed';
export type DemoOrder = {
  id: string; number: string; orgId: string; placedBy: string; status: OrderStatus; paymentStatus: DemoPaymentStatus; subtotalCents: number; totalCents: number; currency: 'USD';
  shipTo: Record<string, string>; notes: string | null; createdAt: string; items: DemoOrderItem[]; events: DemoOrderEvent[];
};
export type DemoAudit = { at: string; actor: string; action: string; detail: string };

export type DemoState = {
  version: number; orderSeq: number;
  users: DemoUser[]; orgs: DemoOrg[]; members: DemoMember[]; products: DemoProduct[]; variants: DemoVariant[]; assignments: DemoAssignment[]; rules: DemoRule[];
  carts: DemoCart[]; orders: DemoOrder[]; idempotency: { key: string; orderId: string }[]; audit: DemoAudit[];
};

export type Actor = { userId: string; kind: 'customer' | 'admin' };
/** Persistence boundary: the engine mutates the object returned by get() and calls save(). Tests use an in-memory store; the app uses the file store. */
export interface DemoStore {
  get(): DemoState;
  save(): void;
}
