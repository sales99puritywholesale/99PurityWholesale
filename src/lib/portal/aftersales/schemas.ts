import { z } from 'zod';
import { MAX_HOLD_DAYS, MAX_RATE_BPS, OPTIONAL_CATEGORIES, PAYOUT_METHODS, PLAN_CODE, REFERRAL_CODE, TEMPLATE_KEYS, reportDef, periodOk } from './model';

/** Input validation for the P9 server actions. Strict objects, UUID ids; the database re-validates every rule. */
export const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'invalid date');
const reason = z.string().trim().min(1).max(300);
const cents = z.number().int().min(1).max(1_000_000_000_000);

export const orgIdSchema = z.object({ organizationId: uuid }).strict();

// certificates
export const certificatePublishSchema = z
  .object({
    organizationId: uuid, title: z.string().trim().min(1).max(160), issuedOn: isoDate.optional(), lotId: uuid.optional(), orderId: uuid.optional(),
  })
  .strict()
  .refine((c) => !!c.lotId || !!c.orderId, { message: 'choose a lot or an order', path: ['lotId'] });
export const certificateWithdrawSchema = z.object({ id: uuid, reason }).strict();

// commissions
export const planSaveSchema = z
  .object({ code: z.string().trim().regex(PLAN_CODE), name: z.string().trim().min(1).max(120), rateBps: z.number().int().min(1).max(MAX_RATE_BPS), holdDays: z.number().int().min(0).max(MAX_HOLD_DAYS) })
  .strict();
export const planActiveSchema = z.object({ planId: uuid, active: z.boolean() }).strict();
export const enrollSchema = z.object({ organizationId: uuid, planId: uuid }).strict();
export const referralLinkSchema = z.object({ referredOrgId: uuid, code: z.string().trim().toUpperCase().regex(REFERRAL_CODE) }).strict();
export const referralEndSchema = z.object({ id: uuid, reason }).strict();
export const payoutSchema = z
  .object({ organizationId: uuid, amountCents: cents, method: z.enum(PAYOUT_METHODS), reference: z.string().trim().max(120).optional(), paidOn: isoDate, idempotencyKey: uuid })
  .strict();
export const adjustSchema = z
  .object({ organizationId: uuid, amountCents: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000).refine((n) => n !== 0, 'zero'), reason, idempotencyKey: uuid })
  .strict();

// notifications
export const prefSchema = z.object({ category: z.enum(OPTIONAL_CATEGORIES), enabled: z.boolean() }).strict();
export const templateSaveSchema = z.object({ key: z.enum(TEMPLATE_KEYS), subject: z.string().trim().min(1).max(150).refine((s) => !/[\r\n]/.test(s), 'no line breaks'), body: z.string().trim().min(1).max(4000) }).strict();
export const outboxStatusSchema = z.enum(['queued', 'sending', 'sent', 'failed']);

// reports
export const reportRequestSchema = z
  .object({ report: z.string().refine((r) => !!reportDef(r), 'unknown report'), from: isoDate.optional(), to: isoDate.optional() })
  .strict()
  .refine((r) => (r.from === undefined) === (r.to === undefined), { message: 'give both dates or none', path: ['from'] })
  .refine((r) => r.from === undefined || r.to === undefined || periodOk(r.from, r.to, new Date()), { message: 'invalid period', path: ['from'] });
