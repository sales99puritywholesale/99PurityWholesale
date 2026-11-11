import 'server-only';
import { z } from 'zod';
import { call, done } from '../rpc-call';

/**
 * Typed access to the P7 RPCs (supabase/review/p7/20261111000400_p7_inventory_warehouse.sql). Everything runs with the signed-in user's session: the database decides who may do what.
 * Callers must have authenticated the user and, for staff screens, passed requireStaffCapability() first (defence in depth: every RPC re-checks).
 */
const iso = z.string();
const status = z.enum(['pending', 'queued', 'allocated', 'picked', 'packed', 'ready', 'shipped', 'delivered', 'cancelled']);

const orderDetail = z.object({
  id: z.string().uuid(), order_number: z.string(), external_ref: z.string(), status, sandbox: z.boolean(), created_at: iso, lines: z.array(z.object({ sku: z.string(), quantity: z.number().int() })),
  shipment: z.object({ carrier: z.string(), service: z.string().nullable(), tracking_number: z.string(), shipped_at: iso, delivered_at: iso.nullable() }).nullable(),
  events: z.array(z.object({ from_status: z.string().nullable(), to_status: z.string(), actor_kind: z.string(), at: iso })),
  open_exceptions: z.array(z.object({ id: z.string().uuid(), kind: z.string(), detail: z.string().nullable(), created_at: iso })),
});
export type FulfillmentOrderDetail = z.infer<typeof orderDetail>;

// ---------------------------------------------------------------------------------------------------------------- customer
const stockItem = z.object({
  sku_mapping_id: z.string().uuid(), internal_sku: z.string(), external_sku: z.string(), product_name: z.string().nullable(), spec: z.string().nullable(), on_hand: z.number().int(), reserved: z.number().int(),
  available: z.number().int(), lots: z.array(z.object({ lot_number: z.string(), expires_on: z.string().nullable(), location: z.string(), on_hand: z.number().int(), reserved: z.number().int() })),
});
export type StockItem = z.infer<typeof stockItem>;
export const stockList = (organizationId: string) => call('rpc_stock_list', { p_organization_id: organizationId }, z.object({ items: z.array(stockItem) }));

const receiptRow = z.object({
  id: z.string().uuid(), reference: z.string(), status: z.enum(['expected', 'received', 'cancelled']), created_at: iso, received_at: iso.nullable(),
  lines: z.array(z.object({ external_sku: z.string(), expected_units: z.number().int(), received_units: z.number().int().nullable() })),
});
export type InboundRow = z.infer<typeof receiptRow>;
export const inboundList = (organizationId: string) => call('rpc_inbound_list', { p_organization_id: organizationId }, z.object({ can_edit: z.boolean(), warehouse_ready: z.boolean(), receipts: z.array(receiptRow) }));
export const inboundCreate = (organizationId: string, reference: string, lines: { sku_mapping_id: string; expected_units: number }[]) =>
  call('rpc_inbound_create', { p_organization_id: organizationId, p_reference: reference, p_lines: lines }, done);
export const inboundCancel = (organizationId: string, id: string) => call('rpc_inbound_cancel', { p_organization_id: organizationId, p_id: id }, done);

export const fulfillmentOrdersList = (organizationId: string) => call('rpc_fulfillment_orders_list', { p_organization_id: organizationId, p_limit: 50 }, z.object({ orders: z.array(orderDetail) }));
export const fulfillmentOrderGet = (organizationId: string, id: string) => call('rpc_fulfillment_order_get', { p_organization_id: organizationId, p_id: id }, z.object({ order: orderDetail }));
export const fulfillmentOrderCancel = (organizationId: string, id: string) => call('rpc_fulfillment_order_cancel', { p_organization_id: organizationId, p_id: id }, done);

// ---------------------------------------------------------------------------------------------------------------- admin (staff)
const location = z.object({ id: z.string().uuid(), code: z.string(), kind: z.enum(['receiving', 'storage', 'pick', 'quarantine']), active: z.boolean() });
const warehouse = z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), active: z.boolean(), locations: z.array(location) });
export type WarehouseRow = z.infer<typeof warehouse>;
export const adminInventoryOverview = () =>
  call('rpc_admin_inventory_overview', {}, z.object({ drift_count: z.number().int(), open_receipts: z.number().int(), open_exceptions: z.number().int(), warehouses: z.array(warehouse) }));
export const adminWarehouseSave = (id: string | undefined, code: string, name: string, active: boolean) => call('rpc_admin_warehouse_save', { p_id: id ?? null, p_code: code, p_name: name, p_active: active }, done);
export const adminLocationSave = (id: string | undefined, warehouseId: string, code: string, kind: string, active: boolean) =>
  call('rpc_admin_location_save', { p_id: id ?? null, p_warehouse_id: warehouseId, p_code: code, p_kind: kind, p_active: active }, done);

const stockRow = z.object({
  sku_mapping_id: z.string().uuid(), lot_id: z.string().uuid(), location_id: z.string().uuid(), organization_name: z.string(), organization_code: z.string(), external_sku: z.string(), internal_sku: z.string(),
  product_name: z.string().nullable(), lot_number: z.string(), expires_on: z.string().nullable(), location: z.string(), location_kind: z.string(), on_hand: z.number().int(), reserved: z.number().int(),
});
export type AdminStockRow = z.infer<typeof stockRow>;
export const adminStockList = (organizationId?: string) => call('rpc_admin_stock_list', { p_organization_id: organizationId ?? null, p_limit: 200 }, z.object({ rows: z.array(stockRow) }));

const movementRow = z.object({
  id: z.string().uuid(), movement_type: z.string(), qty: z.number().int(), external_sku: z.string(), organization_code: z.string(), lot_number: z.string(), location: z.string(),
  ref_type: z.string().nullable(), ref_id: z.string().nullable(), reason: z.string().nullable(), created_at: iso,
});
export type MovementRow = z.infer<typeof movementRow>;
export const adminMovementsList = () => call('rpc_admin_movements_list', { p_sku_mapping_id: null, p_limit: 40 }, z.object({ movements: z.array(movementRow) }));

const adminReceiptRow = z.object({ id: z.string().uuid(), reference: z.string(), status: z.string(), organization_name: z.string(), organization_code: z.string(), created_at: iso, units: z.number().int() });
export type AdminReceiptRow = z.infer<typeof adminReceiptRow>;
export const adminReceiptsList = (status: string | null) => call('rpc_admin_receipts_list', { p_status: status }, z.object({ receipts: z.array(adminReceiptRow) }));
const adminReceipt = z.object({
  receipt: z.object({ id: z.string().uuid(), reference: z.string(), status: z.enum(['expected', 'received', 'cancelled']), organization_name: z.string(), organization_code: z.string(), warehouse_id: z.string().uuid(), warehouse_code: z.string(), created_at: iso, received_at: iso.nullable() }),
  lines: z.array(z.object({ id: z.string().uuid(), sku_mapping_id: z.string().uuid(), external_sku: z.string(), internal_sku: z.string(), expected_units: z.number().int(), received_units: z.number().int().nullable() })),
  locations: z.array(z.object({ id: z.string().uuid(), code: z.string(), kind: z.string() })),
});
export type AdminReceipt = z.infer<typeof adminReceipt>;
export const adminReceiptGet = (id: string) => call('rpc_admin_receipt_get', { p_id: id }, adminReceipt);
export const adminReceiptReceive = (id: string, lines: Record<string, unknown>[]) => call('rpc_admin_receipt_receive', { p_id: id, p_lines: lines }, z.object({ units: z.number().int() }));
export const adminStockAdjust = (skuMappingId: string, lotId: string, locationId: string, delta: number, reason: string, idempotencyKey: string) =>
  call('rpc_admin_stock_adjust', { p_sku_mapping_id: skuMappingId, p_lot_id: lotId, p_location_id: locationId, p_delta: delta, p_reason: reason, p_idempotency_key: idempotencyKey }, done);

const foRow = z.object({
  id: z.string().uuid(), order_number: z.string(), external_ref: z.string(), status, sandbox: z.boolean(), organization_name: z.string(), organization_code: z.string(), created_at: iso,
  units: z.number().int(), open_exceptions: z.number().int(),
});
export type AdminFoRow = z.infer<typeof foRow>;
export const adminFoList = (statusFilter: string | null) => call('rpc_admin_fo_list', { p_status: statusFilter, p_limit: 200 }, z.object({ orders: z.array(foRow) }));
const foAdmin = z.object({
  organization_name: z.string(), organization_code: z.string(), order: orderDetail, recipient: z.record(z.string(), z.string()),
  reservations: z.array(z.object({ external_sku: z.string(), lot_number: z.string(), location: z.string(), qty: z.number().int(), status: z.enum(['active', 'released', 'consumed']) })),
});
export type AdminFoDetail = z.infer<typeof foAdmin>;
export const adminFoGet = (id: string) => call('rpc_admin_fo_get', { p_id: id }, foAdmin);
export const adminFoTransition = (orderId: string, to: string, details: Record<string, string>) => call('rpc_admin_fo_transition', { p_order_id: orderId, p_to_status: to, p_details: details }, done);
export const adminExceptionResolve = (id: string, resolution: string) => call('rpc_admin_exception_resolve', { p_id: id, p_resolution: resolution }, done);

export { INVENTORY_MESSAGES } from './messages';
