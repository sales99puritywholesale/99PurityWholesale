import { z } from 'zod';

/**
 * The public API contract (pure). `POST /api/v1/orders` accepts exactly this body; the database re-validates every rule and is authoritative.
 * Result codes map to HTTP statuses here so handlers and tests share one table. Nothing in an error body echoes database text.
 */
const recipient = z
  .object({
    name: z.string().trim().min(1).max(120),
    line1: z.string().trim().min(1).max(160),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().min(1).max(80),
    region: z.string().trim().min(1).max(80),
    postal: z.string().trim().min(1).max(20),
    country: z.string().trim().regex(/^[A-Z]{2}$/),
  })
  .strict();

export const apiOrderSchema = z
  .object({
    external_ref: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/),
    recipient,
    lines: z.array(z.object({ sku: z.string().trim().min(1).max(64), quantity: z.number().int().min(1).max(10000) }).strict()).min(1).max(50),
  })
  .strict()
  .refine((o) => new Set(o.lines.map((l) => l.sku)).size === o.lines.length, { message: 'duplicate sku', path: ['lines'] });
export type ApiOrderInput = z.infer<typeof apiOrderSchema>;

export const MAX_BODY_BYTES = 32 * 1024;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,80}$/;

export const HTTP_STATUS: Readonly<Record<string, number>> = {
  unauthorized: 401,
  forbidden_scope: 403,
  not_live: 403,
  not_found: 404,
  invalid_request: 400,
  unknown_sku: 422,
  duplicate_order: 409,
  idempotency_conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  unavailable: 503,
  invalid_response: 502,
};
export const httpStatusFor = (code: string): number => (Object.hasOwn(HTTP_STATUS, code) ? (HTTP_STATUS[code] ?? 400) : 400);

/** Short public descriptions (fixed text). */
export const API_ERROR_TEXT: Readonly<Record<string, string>> = {
  unauthorized: 'The API key is missing, invalid or revoked.',
  forbidden_scope: 'This API key is not allowed to do that.',
  not_live: 'Live keys only work after your fulfillment setup has gone live.',
  not_found: 'Not found.',
  invalid_request: 'The request is not valid.',
  unknown_sku: 'One or more SKUs are not approved product mappings for your account.',
  duplicate_order: 'An order with this external_ref already exists.',
  idempotency_conflict: 'This Idempotency-Key was already used with a different request.',
  payload_too_large: 'The request body is too large.',
  unsupported_media_type: 'Send the body as application/json.',
  unavailable: 'The service is temporarily unavailable. Please try again.',
  invalid_response: 'Something went wrong. Please try again.',
};
export const apiErrorText = (code: string): string => (Object.hasOwn(API_ERROR_TEXT, code) ? (API_ERROR_TEXT[code] ?? '') : 'The request could not be completed.');
