import 'server-only';
import { z } from 'zod';
import { createPortalServerClient } from '@/portal/db/server';
import { PAYMENT_METHODS } from './invoices';

/**
 * Typed access to the P4 RPCs (supabase/review/p4/20261111000100_p4_invoices_payments_wallet.sql). Every call runs with the signed-in user's own session, so the DATABASE decides
 * who may do what; nothing here uses a service-role key. Answers are validated; anything unexpected (an error, a missing function, a malformed body) becomes a generic failure.
 * Callers must have authenticated the user and, for staff screens, passed requireStaffCapability() first (defence in depth: the RPC re-checks everything).
 * There is deliberately no demo-mode branch: money screens never run on demo data.
 */
export type Result<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly code: string };

const envelope = z.object({ ok: z.boolean(), code: z.string().max(64).optional() }).passthrough();

async function call<S extends z.ZodTypeAny>(fn: string, args: Record<string, unknown>, schema: S): Promise<Result<z.infer<S>>> {
  try {
    const supabase = createPortalServerClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, code: 'unavailable' };
    const env = envelope.safeParse(data);
    if (!env.success) return { ok: false, code: 'invalid_response' };
    if (!env.data.ok) return { ok: false, code: env.data.code ?? 'failed' };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: 'invalid_response' };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

const cents = z.number().int().nonnegative();
const done = z.object({ ok: z.literal(true), code: z.string().optional() }).passthrough();
const method = z.enum(PAYMENT_METHODS);
const paymentStatus = z.enum(['reported', 'confirmed', 'rejected', 'duplicate']);
const invoiceStatus = z.enum(['open', 'partially_paid', 'paid', 'void']);
const invoiceKind = z.enum(['order', 'setup', 'funding']).default('order');

// ---------------------------------------------------------------------------------------------------------------- customer
const summary = z.object({
  unpaid_count: z.number().int().nonnegative(), unpaid_cents: cents, overdue_count: z.number().int().nonnegative(), paid_cents: cents,
  wallet_enabled: z.boolean(), can_report_payment: z.boolean(),
});
export type BillingSummary = z.infer<typeof summary>;
export const billingSummary = (organizationId: string) => call('rpc_billing_summary', { p_organization_id: organizationId }, summary);

const invoiceRow = z.object({
  invoice_id: z.string().uuid(), invoice_number: z.string(), kind: invoiceKind, order_number: z.string().nullable(), status: invoiceStatus, total_cents: cents, paid_cents: cents,
  issued_at: z.string(), due_at: z.string(), pending_payments: z.number().int().nonnegative(),
});
export type InvoiceRow = z.infer<typeof invoiceRow>;
export const invoicesList = (organizationId: string) => call('rpc_invoices_list', { p_organization_id: organizationId, p_limit: 100 }, z.object({ invoices: z.array(invoiceRow) }));

const invoiceCore = z.object({
  invoice_id: z.string().uuid(), invoice_number: z.string(), kind: invoiceKind, order_id: z.string().uuid().nullable(), order_number: z.string().nullable(), status: invoiceStatus, total_cents: cents, paid_cents: cents,
  currency: z.string(), terms: z.string(), issued_at: z.string(), due_at: z.string(), voided_at: z.string().nullable(), void_reason: z.string().nullable(),
});
const line = z.object({ line_type: z.string(), description: z.string(), quantity: z.number().int(), unit_price_cents: z.number().int(), line_total_cents: z.number().int() });
const payment = z.object({
  payment_id: z.string().uuid(), method, status: paymentStatus, claimed_cents: cents, confirmed_cents: cents.nullable(), reference: z.string().nullable(),
  sent_on: z.string().nullable(), received_on: z.string().nullable(), created_at: z.string(),
});
const invoiceDetail = z.object({ invoice: invoiceCore, lines: z.array(line), payments: z.array(payment), can_report_payment: z.boolean() });
export type InvoiceDetail = z.infer<typeof invoiceDetail>;
export const invoiceGet = (organizationId: string, invoiceId: string) => call('rpc_invoice_get', { p_organization_id: organizationId, p_invoice_id: invoiceId }, invoiceDetail);

export type ReportPaymentInput = {
  organizationId: string; invoiceId: string; method: (typeof PAYMENT_METHODS)[number]; amountCents: number;
  reference?: string; sentOn?: string; note?: string; idempotencyKey: string;
};
export const paymentReport = (i: ReportPaymentInput) =>
  call('rpc_payment_report', {
    p_organization_id: i.organizationId, p_invoice_id: i.invoiceId, p_method: i.method, p_amount_cents: i.amountCents,
    p_reference: i.reference ?? null, p_sent_on: i.sentOn ?? null, p_note: i.note ?? null, p_idempotency_key: i.idempotencyKey,
  }, done);

// ---------------------------------------------------------------------------------------------------------------- admin (staff)
const adminInvoiceRow = invoiceRow.extend({ organization_id: z.string().uuid(), organization_name: z.string(), organization_code: z.string() });
export type AdminInvoiceRow = z.infer<typeof adminInvoiceRow>;
export const adminInvoicesList = (status: string | null) => call('rpc_admin_invoices_list', { p_status: status, p_limit: 200 }, z.object({ invoices: z.array(adminInvoiceRow) }));

const adminPayment = payment.extend({ bank_reference: z.string().nullable(), review_note: z.string().nullable(), reviewed_at: z.string().nullable() });
const adminInvoiceDetail = z.object({
  invoice: invoiceCore.extend({ organization_id: z.string().uuid(), organization_name: z.string(), organization_code: z.string() }),
  lines: z.array(line),
  payments: z.array(adminPayment),
});
export type AdminInvoiceDetail = z.infer<typeof adminInvoiceDetail>;
export const adminInvoiceGet = (invoiceId: string) => call('rpc_admin_invoice_get', { p_invoice_id: invoiceId }, adminInvoiceDetail);

const adminPaymentRow = z.object({
  payment_id: z.string().uuid(), invoice_id: z.string().uuid(), invoice_number: z.string(), invoice_status: invoiceStatus, invoice_total_cents: cents, invoice_paid_cents: cents,
  organization_name: z.string(), organization_code: z.string(), method, status: paymentStatus, claimed_cents: cents, confirmed_cents: cents.nullable(),
  reference: z.string().nullable(), sent_on: z.string().nullable(), note: z.string().nullable(), created_at: z.string(),
});
export type AdminPaymentRow = z.infer<typeof adminPaymentRow>;
export const adminPaymentsList = (status: string | null) => call('rpc_admin_payments_list', { p_status: status, p_limit: 200 }, z.object({ payments: z.array(adminPaymentRow) }));

export const adminPaymentConfirm = (paymentId: string, confirmedCents: number, receivedOn: string, bankReference?: string, note?: string) =>
  call('rpc_admin_payment_confirm', {
    p_payment_id: paymentId, p_confirmed_cents: confirmedCents, p_received_on: receivedOn, p_bank_reference: bankReference ?? null, p_note: note ?? null,
  }, done);
export const adminPaymentReject = (paymentId: string, outcome: 'rejected' | 'duplicate', note: string) =>
  call('rpc_admin_payment_reject', { p_payment_id: paymentId, p_outcome: outcome, p_note: note }, done);
export const adminInvoiceVoid = (invoiceId: string, reason: string) => call('rpc_admin_invoice_void', { p_invoice_id: invoiceId, p_reason: reason }, done);

export { BILLING_MESSAGES, billingMessageFor } from './messages';
