'use server';

import { redirect } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { confirmPaymentSchema, parseDollarsToCents, rejectPaymentSchema, voidInvoiceSchema } from '@/lib/portal/billing/schemas';
import { adminInvoiceVoid, adminPaymentConfirm, adminPaymentReject } from '@/lib/portal/billing/server';
import { back } from '@/components/portal/commerce-ui';

/**
 * Staff actions of P4. Each one: (1) page-level gate (verified staff context holds the capability), (2) strict input validation, (3) the RPC, which re-checks the verified
 * staff session, the capability and (confirm, void) a FRESH step-up in the database, locks the invoice and writes the audit row. A result code is shown as a message.
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Where to return: the reconciliation queue or the invoice the action started from. Only these two shapes are ever produced. */
function returnPath(f: FormData): string {
  const invoiceId = str(f, 'invoiceId').slice(0, 36);
  return str(f, 'from') === 'invoice' && /^[0-9a-f-]{36}$/.test(invoiceId) ? `/admin/invoices/${invoiceId}` : '/admin/invoices/payments';
}

export async function confirmPaymentAction(f: FormData): Promise<void> {
  const to = returnPath(f);
  await requireStaffCapability(to, 'payments.confirm');
  const cents = parseDollarsToCents(str(f, 'amount'));
  const parsed = confirmPaymentSchema.safeParse({
    paymentId: str(f, 'paymentId'),
    confirmedCents: cents ?? 0,
    receivedOn: str(f, 'receivedOn'),
    ...(str(f, 'bankReference') ? { bankReference: str(f, 'bankReference') } : {}),
    ...(str(f, 'note') ? { note: str(f, 'note') } : {}),
  });
  if (!parsed.success || cents === null) redirect(back(to, {}, { ok: false, code: 'invalid_response' }));
  const r = await adminPaymentConfirm(parsed.data.paymentId, parsed.data.confirmedCents, parsed.data.receivedOn, parsed.data.bankReference, parsed.data.note);
  redirect(back(to, {}, r.ok ? { ok: true } : r));
}

export async function rejectPaymentAction(f: FormData): Promise<void> {
  const to = returnPath(f);
  await requireStaffCapability(to, 'payments.reconcile');
  const parsed = rejectPaymentSchema.safeParse({ paymentId: str(f, 'paymentId'), outcome: str(f, 'outcome'), note: str(f, 'note') });
  if (!parsed.success) redirect(back(to, {}, { ok: false, code: 'invalid_response' }));
  const r = await adminPaymentReject(parsed.data.paymentId, parsed.data.outcome, parsed.data.note);
  redirect(back(to, {}, r.ok ? { ok: true } : r));
}

export async function voidInvoiceAction(f: FormData): Promise<void> {
  const to = returnPath(f);
  await requireStaffCapability(to, 'financial.write');
  const parsed = voidInvoiceSchema.safeParse({ invoiceId: str(f, 'invoiceId'), reason: str(f, 'reason') });
  if (!parsed.success) redirect(back(to, {}, { ok: false, code: 'invalid_response' }));
  const r = await adminInvoiceVoid(parsed.data.invoiceId, parsed.data.reason);
  redirect(back(to, {}, r.ok ? { ok: true } : r));
}
