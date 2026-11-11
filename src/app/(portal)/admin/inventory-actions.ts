'use server';

import { redirect } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adjustSchema, locationSchema, receiveSchema, resolveSchema, transitionSchema, uuid, warehouseSchema } from '@/lib/portal/inventory/schemas';
import {
  adminExceptionResolve, adminFoTransition, adminLocationSave, adminReceiptReceive, adminStockAdjust, adminWarehouseSave,
} from '@/lib/portal/inventory/server';
import { back } from '@/components/portal/commerce-ui';

/**
 * Staff actions of P7. Each one: (1) page-level gate (verified staff context holds the capability), (2) strict input validation, (3) the RPC, which re-checks the verified staff
 * session and the capability (stock adjustments also need a FRESH step-up), enforces the stock and lifecycle rules in one transaction and writes the audit row.
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const INVENTORY = '/admin/inventory';
const ORDERS = '/admin/fulfillment/orders';
const go = (path: string, r: { ok: true } | { ok: false; code: string }) => redirect(back(path, {}, r.ok ? { ok: true } : r));
const bad = (path: string) => redirect(back(path, {}, { ok: false, code: 'invalid_response' }));

export async function saveWarehouseAction(f: FormData): Promise<void> {
  await requireStaffCapability(INVENTORY, 'org.manage');
  const p = warehouseSchema.safeParse({ ...(str(f, 'id') ? { id: str(f, 'id') } : {}), code: str(f, 'code').toUpperCase(), name: str(f, 'name'), active: str(f, 'active') !== 'false' });
  if (!p.success) return bad(INVENTORY);
  return go(INVENTORY, await adminWarehouseSave(p.data.id, p.data.code, p.data.name, p.data.active));
}

export async function saveLocationAction(f: FormData): Promise<void> {
  await requireStaffCapability(INVENTORY, 'org.manage');
  const p = locationSchema.safeParse({ ...(str(f, 'id') ? { id: str(f, 'id') } : {}), warehouseId: str(f, 'warehouseId'), code: str(f, 'code').toUpperCase(), kind: str(f, 'kind'), active: str(f, 'active') !== 'false' });
  if (!p.success) return bad(INVENTORY);
  return go(INVENTORY, await adminLocationSave(p.data.id, p.data.warehouseId, p.data.code, p.data.kind, p.data.active));
}

/** Receives an inbound shipment: one answer per expected line (units received, lot number, expiry, location). Lines with 0 units need no lot or location. */
export async function receiveAction(f: FormData): Promise<void> {
  const receiptId = str(f, 'receiptId').slice(0, 36);
  const path = uuid.safeParse(receiptId).success ? `${INVENTORY}/receipts/${receiptId}` : INVENTORY;
  await requireStaffCapability(path, 'inventory.adjust');
  const lineIds = f.getAll('lineId').map(String);
  const lines = lineIds.map((lineId, i) => {
    const units = Number(String(f.getAll('units')[i] ?? '0').trim() || '0');
    const lot = String(f.getAll('lot')[i] ?? '').trim();
    const exp = String(f.getAll('expires')[i] ?? '').trim();
    const loc = String(f.getAll('location')[i] ?? '').trim();
    return { line_id: lineId, received_units: units, ...(lot ? { lot_number: lot } : {}), ...(exp ? { expires_on: exp } : {}), ...(loc ? { location_id: loc } : {}) };
  });
  const p = receiveSchema.safeParse({ receiptId, lines });
  if (!p.success) return bad(path);
  return go(path, await adminReceiptReceive(p.data.receiptId, p.data.lines));
}

export async function adjustAction(f: FormData): Promise<void> {
  await requireStaffCapability(INVENTORY, 'inventory.adjust');
  const p = adjustSchema.safeParse({
    skuMappingId: str(f, 'skuMappingId'), lotId: str(f, 'lotId'), locationId: str(f, 'locationId'), delta: Number(str(f, 'delta')), reason: str(f, 'reason'), idempotencyKey: str(f, 'idempotencyKey'),
  });
  if (!p.success) return bad(INVENTORY);
  return go(INVENTORY, await adminStockAdjust(p.data.skuMappingId, p.data.lotId, p.data.locationId, p.data.delta, p.data.reason, p.data.idempotencyKey));
}

export async function transitionAction(f: FormData): Promise<void> {
  const orderId = str(f, 'orderId').slice(0, 36);
  const path = uuid.safeParse(orderId).success ? `${ORDERS}/${orderId}` : ORDERS;
  await requireStaffCapability(path, 'fulfillment.process');
  const p = transitionSchema.safeParse({
    orderId, to: str(f, 'to'), ...(str(f, 'carrier') ? { carrier: str(f, 'carrier') } : {}), ...(str(f, 'service') ? { service: str(f, 'service') } : {}),
    ...(str(f, 'trackingNumber') ? { trackingNumber: str(f, 'trackingNumber') } : {}), ...(str(f, 'reason') ? { reason: str(f, 'reason') } : {}),
  });
  if (!p.success) return bad(path);
  const details: Record<string, string> = {};
  if (p.data.carrier) details.carrier = p.data.carrier;
  if (p.data.service) details.service = p.data.service;
  if (p.data.trackingNumber) details.tracking_number = p.data.trackingNumber;
  if (p.data.reason) details.reason = p.data.reason;
  return go(path, await adminFoTransition(p.data.orderId, p.data.to, details));
}

export async function resolveExceptionAction(f: FormData): Promise<void> {
  const orderId = str(f, 'orderId').slice(0, 36);
  const path = uuid.safeParse(orderId).success ? `${ORDERS}/${orderId}` : ORDERS;
  await requireStaffCapability(path, 'fulfillment.process');
  const p = resolveSchema.safeParse({ id: str(f, 'id'), resolution: str(f, 'resolution') });
  if (!p.success) return bad(path);
  return go(path, await adminExceptionResolve(p.data.id, p.data.resolution));
}
