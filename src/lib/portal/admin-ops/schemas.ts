import { z } from 'zod';
import { FEE_UNITS, ORG_CODE, ORG_STATUSES, SETTING_KEYS, isValidTerms } from './model';

/** Input validation for the P8 server actions. Strict objects, UUID ids; the database re-validates every rule. */
export const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'invalid date');
const email = z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+$/);

export const orgStatusSchema = z.object({ organizationId: uuid, status: z.enum(ORG_STATUSES), reason: z.string().trim().min(1).max(300) }).strict();
export const orgTermsSchema = z.object({ organizationId: uuid, terms: z.string().trim().refine(isValidTerms, 'invalid terms') }).strict();
export const memberSetSchema = z
  .object({ organizationId: uuid, userId: uuid, action: z.enum(['remove', 'set_role']), role: z.enum(['owner', 'member']).optional() })
  .strict()
  .refine((m) => m.action !== 'set_role' || !!m.role, { message: 'a role is needed', path: ['role'] });
export const memberAddSchema = z.object({ organizationId: uuid, email, role: z.enum(['owner', 'member']) }).strict();

export const applicationCreateSchema = z
  .object({
    company: z.string().trim().min(1).max(200), contactName: z.string().trim().min(1).max(120), contactEmail: email,
    phone: z.string().trim().max(40).optional(), website: z.string().trim().max(200).optional(), message: z.string().trim().max(2000).optional(),
  })
  .strict();
export const applicationReviewSchema = z
  .object({ id: uuid, decision: z.enum(['approve', 'reject']), note: z.string().trim().max(300).optional(), orgCode: z.string().trim().toUpperCase().optional() })
  .strict()
  .refine((r) => r.decision !== 'reject' || !!r.note, { message: 'a note is needed to reject', path: ['note'] })
  .refine((r) => r.decision !== 'approve' || (!!r.orgCode && ORG_CODE.test(r.orgCode)), { message: 'an organization code is needed to approve', path: ['orgCode'] });

export const settingSchema = z.object({ key: z.enum(SETTING_KEYS), value: z.string().max(2000) }).strict();
export const feeSaveSchema = z
  .object({
    code: z.string().trim().regex(/^[a-z0-9_]{2,40}$/), name: z.string().trim().min(1).max(120), amountCents: z.number().int().min(0).max(100_000_000), unit: z.enum(FEE_UNITS),
    note: z.string().trim().max(300).optional(), effectiveFrom: isoDate,
  })
  .strict();
export const feeRetireSchema = z.object({ code: z.string().trim().regex(/^[a-z0-9_]{2,40}$/), effectiveTo: isoDate }).strict();
export const profileSchema = z.object({ fullName: z.string().trim().max(200), phone: z.string().trim().max(40).regex(/^([0-9+()./ -]{3,40})?$/) }).strict();

export const STAFF_ROLES = ['admin', 'finance', 'operations', 'support'] as const;
export const staffAddSchema = z.object({ userId: uuid, role: z.enum(STAFF_ROLES) }).strict();
export const staffRoleSchema = z.object({ userId: uuid, role: z.enum(STAFF_ROLES) }).strict();
export const staffStatusSchema = z.object({ userId: uuid, status: z.enum(['active', 'disabled']) }).strict();
export const enrolmentWindowSchema = z.object({ userId: uuid, minutes: z.number().int().min(5).max(60) }).strict();
export const staffLookupSchema = z.object({ email }).strict();
