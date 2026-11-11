'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { parseDollarsToCents, reportPaymentSchema } from '@/lib/portal/billing/schemas';
import { paymentReport } from '@/lib/portal/billing/server';
import { back } from '@/components/portal/commerce-ui';

/**
 * "I've sent payment". The browser sends the organization, the invoice, the method, the amount it says it sent and optional reference, date and note.
 * This records a CLAIM only: the database checks that the caller is an owner of the organization and that the invoice is payable, and nothing here (or in the RPC)
 * can mark an invoice paid. Finance confirms the payment later.
 */
export async function reportPaymentAction(formData: FormData): Promise<void> {
  const text = (k: string) => String(formData.get(k) ?? '').trim();
  const orgId = text('organizationId').slice(0, 36);
  const invoiceId = text('invoiceId').slice(0, 36);
  const path = `/client/purchases/${invoiceId}`;
  await requireUser(path);
  const cents = parseDollarsToCents(text('amount'));
  const parsed = reportPaymentSchema.safeParse({
    organizationId: orgId,
    invoiceId,
    method: text('method'),
    amountCents: cents ?? 0,
    ...(text('reference') ? { reference: text('reference') } : {}),
    ...(text('sentOn') ? { sentOn: text('sentOn') } : {}),
    ...(text('note') ? { note: text('note') } : {}),
    idempotencyKey: text('idempotencyKey'),
  });
  if (!parsed.success || cents === null) redirect(back(path, { org: orgId }, { ok: false, code: 'invalid_response' }));
  const r = await paymentReport(parsed.data);
  redirect(back(path, { org: orgId }, r.ok ? { ok: true } : r));
}
