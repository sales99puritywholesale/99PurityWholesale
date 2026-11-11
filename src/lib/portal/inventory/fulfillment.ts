/**
 * P7 fulfillment order lifecycle and stock model (pure: no server imports). Mirrors the P7 migration draft (supabase/review/p7/) and the P6 transition function
 * `private.fo_transition_ok`; the database is authoritative. Stock is customer-owned units by SKU, lot and location; `available` = on hand minus reserved,
 * counting only lots that have not expired and only locations that are not quarantine.
 */
export const FO_STATUSES = ['pending', 'queued', 'allocated', 'picked', 'packed', 'ready', 'shipped', 'delivered', 'cancelled'] as const;
export type FoStatus = (typeof FO_STATUSES)[number];

/** Allowed next states. Mirrors private.fo_transition_ok (sandbox orders never leave pending). */
export const FO_TRANSITIONS: Readonly<Record<FoStatus, readonly FoStatus[]>> = {
  pending: ['queued', 'cancelled'],
  queued: ['allocated', 'cancelled'],
  allocated: ['picked', 'cancelled'],
  picked: ['packed', 'cancelled'],
  packed: ['ready', 'cancelled'],
  ready: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
export const isFoStatus = (v: unknown): v is FoStatus => typeof v === 'string' && (FO_STATUSES as readonly string[]).includes(v);
export const canFoTransition = (from: FoStatus, to: FoStatus): boolean => FO_TRANSITIONS[from].includes(to);
export const isFoFinal = (s: FoStatus): boolean => FO_TRANSITIONS[s].length === 0;

/** Internal states and the shorter list the customer sees (the observed USW labels). */
export const FO_STAFF_LABELS: Readonly<Record<FoStatus, string>> = {
  pending: 'Pending', queued: 'Queued', allocated: 'Allocated', picked: 'Picked', packed: 'Packed', ready: 'Ready', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
};
export function customerLabel(status: FoStatus, sandbox: boolean): string {
  if (sandbox && status === 'pending') return 'Sandbox order';
  switch (status) {
    case 'pending': return 'Received';
    case 'queued': case 'allocated': case 'picked': case 'packed': return 'Preparing shipment';
    case 'ready': return 'Ready';
    case 'shipped': return 'In transit';
    case 'delivered': return 'Delivered';
    case 'cancelled': return 'Cancelled';
  }
}

/** What staff do next for each state (the button label), or null when nothing is left. Cancelling is offered separately before shipment. */
export const NEXT_STEP: Readonly<Record<FoStatus, { to: FoStatus; label: string } | null>> = {
  pending: { to: 'queued', label: 'Accept and queue' },
  queued: { to: 'allocated', label: 'Allocate stock' },
  allocated: { to: 'picked', label: 'Mark picked' },
  picked: { to: 'packed', label: 'Mark packed' },
  packed: { to: 'ready', label: 'Mark ready' },
  ready: { to: 'shipped', label: 'Ship (carrier and tracking)' },
  shipped: { to: 'delivered', label: 'Mark delivered' },
  delivered: null,
  cancelled: null,
};
export const canCustomerCancel = (status: FoStatus): boolean => status === 'pending' || status === 'queued';
export const canStaffCancel = (status: FoStatus): boolean => canFoTransition(status, 'cancelled');

// ------------------------------------------------------------------------------------------------------------------------------ stock
export type Balance = { lotId: string; locationId: string; onHand: number; reserved: number; expiresOn: string | null; createdAt: string; quarantine: boolean; active: boolean };
export const availableOf = (b: Pick<Balance, 'onHand' | 'reserved'>): number => b.onHand - b.reserved;

/** A balance counts toward availability only outside quarantine, in an active location, and in a lot that has not expired (a lot expiring today is still usable). */
export function usable(b: Balance, today: string): boolean {
  return !b.quarantine && b.active && (b.expiresOn === null || b.expiresOn >= today) && availableOf(b) > 0;
}
export const totalAvailable = (balances: readonly Balance[], today: string): number => balances.filter((b) => usable(b, today)).reduce((n, b) => n + availableOf(b), 0);

export type Take = { lotId: string; locationId: string; qty: number };
export type AllocationLine = { lineId: string; skuId: string; quantity: number };
export type Allocation = { ok: true; takes: Record<string, Take[]> } | { ok: false; shortLines: string[] };

/**
 * First-expiry-first-out allocation of whole orders, all or nothing: for each SKU, usable balances are taken in order of earliest expiry (no expiry last), then oldest lot,
 * then location id. Mirrors private.fo_allocate. `balancesBySku` maps a SKU to its balances; the input is never mutated.
 */
export function allocateFefo(lines: readonly AllocationLine[], balancesBySku: Readonly<Record<string, readonly Balance[]>>, today: string): Allocation {
  const work = new Map<string, Balance[]>();
  for (const [sku, list] of Object.entries(balancesBySku)) work.set(sku, list.map((b) => ({ ...b })));
  // the pre-check compares the SUMMED need of each SKU with what is available, so lines of one SKU can never over-allocate together
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.skuId, (need.get(l.skuId) ?? 0) + l.quantity);
  const shortSkus = new Set([...need].filter(([sku, q]) => q > totalAvailable(work.get(sku) ?? [], today)).map(([sku]) => sku));
  const short = lines.filter((l) => shortSkus.has(l.skuId)).map((l) => l.lineId);
  if (short.length > 0) return { ok: false, shortLines: short };
  const byLine: Record<string, Take[]> = {};
  const key = (b: Balance) => [b.expiresOn ?? '9999-12-31', b.createdAt, b.locationId] as const;
  for (const l of [...lines].sort((a, b) => a.skuId.localeCompare(b.skuId))) {
    let need = l.quantity;
    const takes: Take[] = [];
    const candidates = (work.get(l.skuId) ?? []).filter((b) => usable(b, today)).sort((a, b) => { const x = key(a), y = key(b); return x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]) || x[2].localeCompare(y[2]); });
    for (const b of candidates) {
      if (need === 0) break;
      const take = Math.min(need, availableOf(b));
      takes.push({ lotId: b.lotId, locationId: b.locationId, qty: take });
      b.reserved += take;
      need -= take;
    }
    byLine[l.lineId] = takes;
  }
  return { ok: true, takes: byLine };
}

export type MovementType = 'receive' | 'adjust_plus' | 'adjust_minus' | 'reserve' | 'release' | 'consume';
export const MOVEMENT_TYPES: readonly MovementType[] = ['receive', 'adjust_plus', 'adjust_minus', 'reserve', 'release', 'consume'];
/** Effect of one movement on a balance, exactly as private.inv_move applies it. Throws when a table constraint would be violated (negative stock, reserved above on hand). */
export function applyMovement(b: { onHand: number; reserved: number }, type: MovementType, qty: number): { onHand: number; reserved: number } {
  if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) throw new RangeError('invalid quantity');
  let { onHand, reserved } = b;
  switch (type) {
    case 'receive': case 'adjust_plus': onHand += qty; break;
    case 'adjust_minus': onHand -= qty; break;
    case 'reserve': reserved += qty; break;
    case 'release': reserved -= qty; break;
    case 'consume': onHand -= qty; reserved -= qty; break;
  }
  if (onHand < 0 || reserved < 0 || reserved > onHand) throw new RangeError('balance constraint violated');
  return { onHand, reserved };
}
/** Balances must equal the ledger (private.inv_reconcile): recompute a balance from its movements. */
export function replayMovements(moves: readonly { type: MovementType; qty: number }[]): { onHand: number; reserved: number } {
  return moves.reduce((acc, m) => applyMovement(acc, m.type, m.qty), { onHand: 0, reserved: 0 });
}
/** A stock correction may never take on-hand stock below what is already reserved. */
export const canAdjust = (onHand: number, reserved: number, delta: number): boolean =>
  Number.isInteger(delta) && delta !== 0 && Math.abs(delta) <= 1_000_000 && (delta > 0 || onHand - reserved >= -delta);

export const LOCATION_KINDS = ['receiving', 'storage', 'pick', 'quarantine'] as const;
export const LOCATION_KIND_LABELS: Readonly<Record<(typeof LOCATION_KINDS)[number], string>> = { receiving: 'Receiving', storage: 'Storage', pick: 'Pick face', quarantine: 'Quarantine (not available)' };
export const RECEIPT_STATUSES = ['expected', 'received', 'cancelled'] as const;
