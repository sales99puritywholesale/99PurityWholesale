import { z } from 'zod';
import { MAX_INVOICE_CENTS, PAYMENT_METHODS } from './invoices';

/** Input validation for P4 server actions. Strict objects, UUID ids. The server never trusts a client-supplied invoice state, only amounts the database re-validates. */
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'invalid date');

/** Customer: "I've sent payment". idempotencyKey is generated per rendered form; a repeated submit returns the same report. */
export const reportPaymentSchema = z
  .object({
    organizationId: uuid,
    invoiceId: uuid,
    method: z.enum(PAYMENT_METHODS),
    amountCents: z.number().int().min(1).max(MAX_INVOICE_CENTS),
    reference: z.string().trim().max(120).optional(),
    sentOn: isoDate.optional(),
    note: z.string().trim().max(300).optional(),
    idempotencyKey: uuid,
  })
  .strict();

export const confirmPaymentSchema = z
  .object({
    paymentId: uuid,
    confirmedCents: z.number().int().min(1).max(MAX_INVOICE_CENTS),
    receivedOn: isoDate,
    bankReference: z.string().trim().max(120).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const rejectPaymentSchema = z.object({ paymentId: uuid, outcome: z.enum(['rejected', 'duplicate']), note: z.string().trim().min(1).max(300) }).strict();
export const voidInvoiceSchema = z.object({ invoiceId: uuid, reason: z.string().trim().min(1).max(300) }).strict();

/** Dollars typed in a form -> integer cents, exact (no floating point). Returns null for anything that is not a plain positive amount with at most 2 decimals. */
export function parseDollarsToCents(input: string): number | null {
  const m = /^\s*\$?\s*([0-9]{1,10})(?:\.([0-9]{1,2}))?\s*$/.exec(input.replaceAll(',', ''));
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 1 && cents <= MAX_INVOICE_CENTS ? cents : null;
}
