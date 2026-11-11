import { z } from 'zod';
import { DOCUMENT_KINDS, FUNDING_TYPES, LABEL_TEMPLATES, STORE_METHODS, GATE_CODES } from './steps';
import { MAX_INVOICE_CENTS } from '../billing/invoices';

/** Input validation for P5 server actions. Strict objects, UUID ids. The server never trusts a client-supplied step state; the database re-validates every rule. */
export const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const opt = (max: number) => z.string().trim().max(max).optional();

export const skuMappingSchema = z
  .object({
    organizationId: uuid,
    id: uuid.optional(),
    source: z.enum(['catalog', 'private']),
    variantId: uuid.optional(),
    productName: opt(160),
    spec: opt(120),
    externalSku: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/, 'invalid SKU'),
    unitsPerPack: z.number().int().min(1).max(10000),
    barcode: z.string().trim().regex(/^[0-9]{8,14}$/).optional(),
    weightGrams: z.number().int().min(1).max(100000).optional(),
  })
  .strict()
  .refine((m) => (m.source === 'catalog' ? !!m.variantId : !!m.productName && m.productName.length > 0 && !m.variantId), { message: 'catalog needs a variant; private needs a name only' });

export const labelDesignSchema = z.object({ organizationId: uuid, skuMappingId: uuid, template: z.enum(LABEL_TEMPLATES), documentId: uuid }).strict();
export const packagingSelectSchema = z.object({ organizationId: uuid, optionId: uuid, notes: opt(300) }).strict();

const httpsUrl = z.string().trim().max(300).url().refine((u) => u.startsWith('https://'), 'https only');
export const storeConnectionSchema = z
  .object({ organizationId: uuid, method: z.enum(STORE_METHODS), storeUrl: httpsUrl.optional(), webhookUrl: httpsUrl.optional(), notes: opt(500) })
  .strict()
  .refine((s) => s.method === 'manual' || !!s.storeUrl, { message: 'a store URL is needed unless the method is manual' });

export const agreementAcceptSchema = z.object({ organizationId: uuid, signerName: text(120), signerTitle: text(120), signedDocumentId: uuid.optional(), accept: z.literal(true) }).strict();

const contact = z.object({ name: text(120), email: z.string().trim().email().max(254), phone: opt(40) }).strict();
const address = z
  .object({ name: text(120), line1: text(160), line2: opt(160), city: text(80), region: text(80), postal: text(20), country: z.string().trim().regex(/^[A-Z]{2}$/) })
  .strict();
export const launchSubmissionSchema = z
  .object({
    organizationId: uuid,
    contacts: z.array(contact).min(1).max(5),
    escalation: contact,
    returnAddress: address,
    confirmations: z.object({ accurate: z.literal(true), labelsApproved: z.literal(true), terms: z.literal(true) }).strict(),
  })
  .strict();
export const acknowledgeSchema = z.object({ organizationId: uuid, acknowledge: z.literal(true) }).strict();

export const documentRegisterSchema = z
  .object({ organizationId: uuid, documentId: uuid, kind: z.enum(DOCUMENT_KINDS), fileName: text(200), contentType: z.enum(['application/pdf', 'image/png', 'image/jpeg']), sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024) })
  .strict();

export const stepReviewSchema = z
  .object({ organizationId: uuid, stepNo: z.number().int().min(1).max(9), decision: z.enum(['approve', 'reject']), reason: opt(300), instructions: opt(500) })
  .strict()
  .refine((r) => r.decision === 'approve' || (!!r.reason && r.reason.length > 0), { message: 'a reason is required to reject', path: ['reason'] });
export const itemReviewSchema = z.object({ id: uuid, decision: z.enum(['approve', 'reject']), reason: opt(300) }).strict().refine((r) => r.decision === 'approve' || (!!r.reason && r.reason.length > 0), { message: 'a reason is required to reject', path: ['reason'] });
export const setupInvoicesSchema = z
  .object({ organizationId: uuid, setupFeeCents: z.number().int().min(0).max(MAX_INVOICE_CENTS), fundingCents: z.number().int().min(0).max(MAX_INVOICE_CENTS) })
  .strict()
  .refine((s) => s.setupFeeCents + s.fundingCents > 0, { message: 'at least one amount is needed' });
export const fundingSetSchema = z
  .object({ organizationId: uuid, type: z.enum(FUNDING_TYPES), reason: opt(300) })
  .strict()
  .refine((f) => (f.type !== 'waived' && f.type !== 'credit_terms') || (!!f.reason && f.reason.length > 0), { message: 'a reason is required', path: ['reason'] });
export const gateRecordSchema = z.object({ code: z.enum(GATE_CODES), status: z.enum(['recorded', 'revoked']), note: text(500) }).strict();
export const goLiveSchema = z.object({ organizationId: uuid }).strict();
