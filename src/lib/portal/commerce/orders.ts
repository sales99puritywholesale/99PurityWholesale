/** P3 order lifecycle. Mirrors private.p3_order_transition_ok and the status trigger of the P3 migration draft (the database is authoritative). */
export const ORDER_STATUSES = ['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed next states. Final states have none. Payment status is separate (P4). */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const isOrderStatus = (v: unknown): v is OrderStatus => typeof v === 'string' && (ORDER_STATUSES as readonly string[]).includes(v);
export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => ORDER_TRANSITIONS[from].includes(to);
export const isFinalStatus = (s: OrderStatus): boolean => ORDER_TRANSITIONS[s].length === 0;
/** A customer may not cancel once the order is being processed (staff can). In P3 the customer path is read-only; cancellation is a staff action. */
export const STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
