import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminInvoiceGet } from '@/lib/portal/billing/server';
import { balanceCents, formatCents, isInvoiceStatus } from '@/lib/portal/billing/invoices';
import { uuid } from '@/lib/portal/commerce/schemas';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { Field, Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import { InvoiceStatusPill, PaymentStatusPill, dateOnly, methodLabel } from '@/components/portal/billing-ui';
import { confirmPaymentAction, rejectPaymentAction, voidInvoiceAction } from '../../billing-actions';

export const metadata: Metadata = { title: 'Invoice' };

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: Sp }) {
  await requireStaffCapability(`/admin/invoices/${params.id}`, 'org.billing.read');
  if (!uuid.safeParse(params.id).success) notFound();
  const res = await adminInvoiceGet(params.id);
  if (!res.ok) notFound();
  const { invoice, lines, payments } = res.data;
  const ctx = await getStaffAccessContext();
  const canConfirm = evaluateCapability(ctx, 'payments.confirm').allowed;
  const canReconcile = evaluateCapability(ctx, 'payments.reconcile').allowed;
  const canVoid = evaluateCapability(ctx, 'financial.write').allowed;
  const balance = isInvoiceStatus(invoice.status) ? balanceCents(invoice.status, invoice.total_cents, invoice.paid_cents) : 0;
  const payable = invoice.status === 'open' || invoice.status === 'partially_paid';
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PortalPageHeader
        area="admin"
        title={invoice.invoice_number}
        description={`${invoice.organization_name} (${invoice.organization_code}), issued ${dateOnly(invoice.issued_at)}, due ${dateOnly(invoice.due_at)}, terms ${invoice.terms}.`}
        crumbs={[{ label: 'Invoices & Payments', href: '/admin/invoices' }]}
      />
      <Flash sp={searchParams} stepUpNext={`/admin/invoices/${invoice.invoice_id}`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <PortalCard title="Items" actions={<InvoiceStatusPill status={invoice.status} />}>
            <ul className="divide-y divide-portal-border text-sm">
              {lines.map((l, idx) => (
                <li key={idx} className="flex flex-wrap justify-between gap-3 py-2.5">
                  <span className="text-portal-text">{l.description}</span>
                  <span className="text-portal-muted">{l.quantity} x {formatCents(l.unit_price_cents)}</span>
                  <span className="font-semibold text-portal-text">{formatCents(l.line_total_cents)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1 border-t border-portal-border pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-portal-muted">Total ({invoice.currency})</dt><dd className="font-semibold text-portal-text">{formatCents(invoice.total_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-portal-muted">Paid (confirmed)</dt><dd className="text-portal-text">{formatCents(invoice.paid_cents)}</dd></div>
              <div className="flex justify-between text-base"><dt className="font-semibold text-portal-text">Balance</dt><dd className="font-semibold text-portal-text">{formatCents(balance)}</dd></div>
            </dl>
            {invoice.status === 'void' && <p className="mt-3 text-xs text-portal-muted">Void{invoice.void_reason ? `: ${invoice.void_reason}` : ''}{invoice.voided_at ? ` (${dateOnly(invoice.voided_at)})` : ''}.</p>}
          </PortalCard>
          <PortalCard title="Payments">
            {payments.length === 0 ? (
              <p className="text-sm text-portal-muted">No payments reported.</p>
            ) : (
              <ul className="divide-y divide-portal-border text-sm">
                {payments.map((p) => (
                  <li key={p.payment_id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-portal-text">
                        {methodLabel(p.method)} <span className="text-xs text-portal-muted">reported {dateOnly(p.created_at)}{p.reference ? `, ref ${p.reference}` : ''}</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="font-semibold text-portal-text">{formatCents(p.claimed_cents)}</span>
                        <PaymentStatusPill status={p.status} />
                      </span>
                    </div>
                    {p.status !== 'reported' && (
                      <p className="mt-1 text-xs text-portal-muted">
                        {p.status === 'confirmed' && p.confirmed_cents !== null ? `Confirmed ${formatCents(p.confirmed_cents)}${p.received_on ? `, received ${p.received_on}` : ''}${p.bank_reference ? `, bank ref ${p.bank_reference}` : ''}. ` : ''}
                        {p.review_note ? `Note: ${p.review_note}` : ''}
                      </p>
                    )}
                    {p.status === 'reported' && payable && (
                      <div className="mt-3 grid gap-4 lg:grid-cols-2">
                        {canConfirm ? (
                          <form action={confirmPaymentAction} className="space-y-2">
                            <input type="hidden" name="paymentId" value={p.payment_id} />
                            <input type="hidden" name="invoiceId" value={invoice.invoice_id} />
                            <input type="hidden" name="from" value="invoice" />
                            <div className="grid grid-cols-2 gap-2">
                              <Field label="Amount received (USD)"><input name="amount" required inputMode="decimal" defaultValue={(Math.min(p.claimed_cents, balance) / 100).toFixed(2)} className={INPUT} /></Field>
                              <Field label="Date received"><input name="receivedOn" type="date" required defaultValue={today} className={INPUT} /></Field>
                            </div>
                            <Field label="Bank reference (optional)"><input name="bankReference" maxLength={120} className={INPUT} /></Field>
                            <button type="submit" className="portal-btn">Confirm (fresh code needed)</button>
                          </form>
                        ) : null}
                        {canReconcile && (
                          <form action={rejectPaymentAction} className="space-y-2">
                            <input type="hidden" name="paymentId" value={p.payment_id} />
                            <input type="hidden" name="invoiceId" value={invoice.invoice_id} />
                            <input type="hidden" name="from" value="invoice" />
                            <Field label="Outcome"><select name="outcome" className={INPUT} defaultValue="rejected"><option value="rejected">Rejected</option><option value="duplicate">Duplicate</option></select></Field>
                            <Field label="Reason (required)"><input name="note" required maxLength={300} className={INPUT} /></Field>
                            <button type="submit" className="portal-btn-quiet">Reject</button>
                          </form>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </PortalCard>
        </div>
        <div className="space-y-4">
          <PortalCard title="Order">
            <p className="text-sm text-portal-text">
              {invoice.order_id ? <Link className="portal-id" href={`/admin/orders/${invoice.order_id}`}>{invoice.order_number}</Link> : <span>{invoice.kind === 'setup' ? 'Setup fee (no order)' : 'Funding (no order)'}</span>}
            </p>
          </PortalCard>
          <PortalCard title="Void invoice">
            {invoice.status === 'void' ? (
              <p className="text-sm text-portal-muted">This invoice is already void.</p>
            ) : invoice.status !== 'open' ? (
              <p className="text-sm text-portal-muted">An invoice with confirmed payments cannot be voided.</p>
            ) : canVoid ? (
              <form action={voidInvoiceAction} className="space-y-3">
                <input type="hidden" name="invoiceId" value={invoice.invoice_id} />
                <input type="hidden" name="from" value="invoice" />
                <Field label="Reason (required)"><input name="reason" required maxLength={300} className={INPUT} /></Field>
                <p className="text-xs text-portal-muted">Voiding needs a fresh authenticator code and rejects any payment still awaiting review. The number is never reused.</p>
                <button type="submit" className="portal-btn-quiet">Void invoice</button>
              </form>
            ) : (
              <p className="text-sm text-portal-muted">Your role cannot void invoices.</p>
            )}
          </PortalCard>
        </div>
      </div>
    </>
  );
}
