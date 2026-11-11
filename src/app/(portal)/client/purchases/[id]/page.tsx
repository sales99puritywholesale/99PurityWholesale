import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { invoiceGet } from '@/lib/portal/billing/server';
import { paymentInstructions } from '@/lib/portal/admin-ops/server';
import { balanceCents, formatCents, isInvoiceStatus, PAYMENT_METHODS } from '@/lib/portal/billing/invoices';
import { uuid } from '@/lib/portal/commerce/schemas';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { Field, Flash, INPUT, one, type Sp } from '@/components/portal/commerce-ui';
import { InvoiceStatusPill, PaymentStatusPill, dateOnly, methodLabel } from '@/components/portal/billing-ui';
import { reportPaymentAction } from '../actions';

export const metadata: Metadata = { title: 'Invoice' };

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: Sp }) {
  await requireUser(`/client/purchases/${params.id}`);
  if (!uuid.safeParse(params.id).success) notFound();
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  if (!org) notFound();
  const [res, instr] = await Promise.all([invoiceGet(org.id, params.id), paymentInstructions()]);
  if (!res.ok) notFound();
  const howToPay = instr.ok ? instr.data.payment_instructions.trim() : '';
  const footer = instr.ok ? instr.data.invoice_footer.trim() : '';
  const { invoice, lines, payments, can_report_payment } = res.data;
  const balance = isInvoiceStatus(invoice.status) ? balanceCents(invoice.status, invoice.total_cents, invoice.paid_cents) : 0;
  const payable = invoice.status === 'open' || invoice.status === 'partially_paid';
  // one key per rendered form: submitting the same form twice returns the SAME report instead of a second claim
  const idempotencyKey = crypto.randomUUID();
  return (
    <>
      <PortalPageHeader
        area="client"
        title={invoice.invoice_number}
        description={`Issued ${dateOnly(invoice.issued_at)}, due ${dateOnly(invoice.due_at)}.${invoice.order_number ? ` Order ${invoice.order_number}.` : ` ${invoice.kind === 'setup' ? 'Fulfillment setup fee.' : 'Funding requirement.'}`}`}
        crumbs={[{ label: 'Invoices & Payments', href: `/client/purchases?org=${org.id}` }]}
      />
      <Flash sp={searchParams} stepUpNext="/client" />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <PortalCard title="Items" actions={<InvoiceStatusPill status={invoice.status} />}>
            <ul className="divide-y divide-portal-border text-sm">
              {lines.map((l, idx) => (
                <li key={idx} className="flex flex-wrap justify-between gap-3 py-2.5">
                  <span className="text-portal-text">{l.description}</span>
                  <span className="text-portal-muted">
                    {l.quantity} x {formatCents(l.unit_price_cents)}
                  </span>
                  <span className="font-semibold text-portal-text">{formatCents(l.line_total_cents)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1 border-t border-portal-border pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-portal-muted">Total ({invoice.currency})</dt><dd className="font-semibold text-portal-text">{formatCents(invoice.total_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-portal-muted">Paid</dt><dd className="text-portal-text">{formatCents(invoice.paid_cents)}</dd></div>
              <div className="flex justify-between text-base"><dt className="font-semibold text-portal-text">Balance due</dt><dd className="font-semibold text-portal-text">{formatCents(balance)}</dd></div>
            </dl>
            {footer && <p className="mt-3 whitespace-pre-wrap text-xs text-portal-muted">{footer}</p>}
            {invoice.status === 'void' && <p className="mt-3 text-xs text-portal-muted">This invoice is void{invoice.void_reason ? `: ${invoice.void_reason}` : ''}.</p>}
          </PortalCard>
          <PortalCard title="Payments">
            {payments.length === 0 ? (
              <p className="text-sm text-portal-muted">No payments reported yet.</p>
            ) : (
              <ul className="divide-y divide-portal-border text-sm">
                {payments.map((p) => (
                  <li key={p.payment_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-portal-text">
                      {methodLabel(p.method)} <span className="text-xs text-portal-muted">reported {dateOnly(p.created_at)}{p.reference ? `, ref ${p.reference}` : ''}</span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-semibold text-portal-text">{formatCents(p.status === 'confirmed' && p.confirmed_cents !== null ? p.confirmed_cents : p.claimed_cents)}</span>
                      <PaymentStatusPill status={p.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PortalCard>
        </div>
        <div className="space-y-4">
          <PortalCard title="How to pay">
            {howToPay && <p className="mb-3 whitespace-pre-wrap rounded-lg bg-portal-canvas p-3 text-sm text-portal-text">{howToPay}</p>}
            <p className="text-sm text-portal-muted">
              Send the amount due by wire, Zelle or ACH and quote <span className="portal-id">{invoice.invoice_number}</span> as the reference. Your account manager provides the payment details.
              After you have sent it, report it below; the invoice is marked paid only after our finance team confirms the funds.
            </p>
          </PortalCard>
          <PortalCard title="I've sent payment">
            {!payable ? (
              <p className="text-sm text-portal-muted">{invoice.status === 'paid' ? 'This invoice is paid.' : 'This invoice is not open for payment.'}</p>
            ) : !can_report_payment ? (
              <p className="text-sm text-portal-muted">Only an organization owner can report a payment. You can view this invoice.</p>
            ) : (
              <form action={reportPaymentAction} className="space-y-3">
                <input type="hidden" name="organizationId" value={org.id} />
                <input type="hidden" name="invoiceId" value={invoice.invoice_id} />
                <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
                <Field label="Method">
                  <select name="method" className={INPUT} defaultValue="zelle">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{methodLabel(m)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount sent (USD)"><input name="amount" required inputMode="decimal" defaultValue={(balance / 100).toFixed(2)} className={INPUT} /></Field>
                <Field label="Date sent (optional)"><input name="sentOn" type="date" className={INPUT} /></Field>
                <Field label="Reference or confirmation number (optional)"><input name="reference" maxLength={120} className={INPUT} /></Field>
                <Field label="Note (optional)"><input name="note" maxLength={300} className={INPUT} /></Field>
                <button type="submit" className="portal-btn">Report payment</button>
              </form>
            )}
          </PortalCard>
          <p className="text-xs text-portal-muted">
            {invoice.order_id ? <Link href={`/client/orders/${invoice.order_id}?org=${org.id}`} className="underline">View order {invoice.order_number}</Link> : <Link href={`/client/fulfillment/setup?org=${org.id}`} className="underline">Back to fulfillment setup</Link>}
          </p>
        </div>
      </div>
    </>
  );
}
