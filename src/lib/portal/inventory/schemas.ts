import { z } from 'zod';
import { FO_STATUSES, LOCATION_KINDS } from './fulfillment';

/** Input validation for the P7 server actions (customer and staff). Strict objects, UUID ids; the database re-validates every rule. */
export const uuid = z.string().uuid();
const units = z.number().int().min(1).max(1_000_000);

export const inboundCreateSchema = z
  .object({
    organizationId: uuid,
    reference: z.string().trim().min(1).max(80),
    lines: z.array(z.object({ sku_mapping_id: uuid, expected_units: units }).strict()).min(1).max(50),
  })
  .strict()
  .refine((i) => new Set(i.lines.map((l) => l.sku_mapping_id)).size === i.lines.length, { message: 'duplicate SKU', path: ['lines'] });
export const orgIdSchema = z.object({ organizationId: uuid, id: uuid }).strict();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'invalid date');
export const receiveSchema = z
  .object({
    receiptId: uuid,
    lines: z
      .array(
        z.object({
          line_id: uuid,
          received_units: z.number().int().min(0).max(1_000_000),
          lot_number: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/).optional(),
          expires_on: isoDate.optional(),
          location_id: uuid.optional(),
        }).strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine((r) => r.lines.every((l) => l.received_units === 0 || (!!l.lot_number && !!l.location_id)), { message: 'lot number and location are needed for received units', path: ['lines'] });

export const adjustSchema = z
  .object({ skuMappingId: uuid, lotId: uuid, locationId: uuid, delta: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, 'delta must not be zero'), reason: z.string().trim().min(1).max(300), idempotencyKey: uuid })
  .strict();
export const warehouseSchema = z.object({ id: uuid.optional(), code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/), name: z.string().trim().min(1).max(120), active: z.boolean() }).strict();
export const locationSchema = z.object({ id: uuid.optional(), warehouseId: uuid, code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9._-]{0,19}$/), kind: z.enum(LOCATION_KINDS), active: z.boolean() }).strict();

const trimmed = (max: number) => z.string().trim().min(1).max(max);
export const transitionSchema = z
  .object({ orderId: uuid, to: z.enum(FO_STATUSES).refine((s) => s !== 'pending', 'cannot move back to pending'), carrier: trimmed(60).optional(), service: z.string().trim().max(60).optional(), trackingNumber: trimmed(80).optional(), reason: trimmed(300).optional() })
  .strict()
  .refine((t) => t.to !== 'shipped' || (!!t.carrier && !!t.trackingNumber), { message: 'carrier and tracking number are needed to ship', path: ['trackingNumber'] })
  .refine((t) => t.to !== 'cancelled' || !!t.reason, { message: 'a reason is needed to cancel', path: ['reason'] });
export const resolveSchema = z.object({ id: uuid, resolution: trimmed(300) }).strict();
