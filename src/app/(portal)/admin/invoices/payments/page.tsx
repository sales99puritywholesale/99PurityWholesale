import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminPaymentsList, billingMessageFor } from '@/lib/portal/billing/server';
import { formatCents, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, isPaymentStatus } from '@/lib/portal/billing/invoices';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalEmptyState } from '@/components/portal/portal-empty-state';
import { Field, Flash, INPUT, one, type Sp } from '@/components/portal/commerce-ui';
import { PaymentStatusPill, dateOnly, methodLabel } from '@/components/portal/billing-ui';
import { confirmPaymentAction, rejectPaymentAction } from '../../billing-actions';

export const metadata: Metadata = { title: 'Payment reconciliation' };

/** Queue of customer-reported payments. Confirm only after the money is seen in the bank; the customer's claim alone never marks anything paid. */
export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/invoices/payments', 'payments.reconcile');
  const raw = one(searchParams.status);
  const status = isPaymentStatus(raw) ? raw : raw === 'all' ? null : 'reported';
  const res = await adminPaymentsList(status);
  const rows = res.ok ? res.data.payments : [];
  const ctx = await getStaffAccessContext();
  const canConfirm = evaluateCapability(ctx, 'payments.confirm').allowed;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PortalPageHeader area="admin" title="Payment reconciliation" description="Match reported payments against bank and Zelle statements." crumbs={[{ label: 'Invoices & Payments', href: '/admin/invoices' }]} />
      <Flash sp={searchParams} stepUpNext="/admin/invoices/payments" />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter by status">
        {PAYMENT_STATUSES.map((s) => (
          <Link key={s} href={`/admin/invoices/payments?status=${s}`} className={status === s ? 'portal-btn' : 'portal-btn-quiet'}>{PAYMENT_STATUS_LABELS[s]}</Link>
        ))}
        <Link href="/admin/invoices/payments?status=all" className={status === null ? 'portal-btn' : 'portal-btn-quiet'}>All</Link>
      </nav>
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{billingMessageFor(res.code)}</p>}
      {rows.length === 0 ? (
        <PortalEmptyState title="Nothing here" description={status === 'reported' ? 'No payments are waiting for confirmation.' : 'No payments match this filter.'} />
      ) : (
        <div className="space-y-4">
          {rows.map((p) => {
            const remaining = p.invoice_total_cents - p.invoice_paid_cents;
            return (
              <PortalCard key={p.payment_id} title={`${p.organization_name} (${p.organization_code})`} actions={<PaymentStatusPill status={p.status} />}>
                <p className="text-sm text-portal-text">
                  <span className="font-semibold">{formatCents(p.claimed_cents)}</span> by {methodLabel(p.method)}, reported {dateOnly(p.created_at)}
                  {p.sent_on ? `, sent ${p.sent_on}` : ''}{p.reference ? `, reference ${p.reference}` : ''}
                </p>
                <p className="mt-1 text-xs text-portal-muted">
                  Invoice <Link className="portal-id" href={`/admin/invoices/${p.invoice_id}`}>{p.invoice_number}</Link>: total {formatCents(p.invoice_total_cents)}, paid {formatCents(p.invoice_paid_cents)}, remaining {formatCents(p.invoice_status === 'void' ? 0 : remaining)}
                  {p.note ? `. Customer note: ${p.note}` : ''}
                </p>
                {p.status === 'confirmed' && p.confirmed_cents !== null && <p className="mt-1 text-xs text-portal-muted">Confirmed amount {formatCents(p.confirmed_cents)}.</p>}
                {p.status === 'reported' && (
                  <div className="mt-4 grid gap-4 border-t border-portal-border pt-4 lg:grid-cols-2">
                    {canConfirm ? (
                      <form action={confirmPaymentAction} className="space-y-3">
                        <input type="hidden" name="paymentId" value={p.payment_id} />
                        <input type="hidden" name="from" value="queue" />
                        <p className="text-xs font-semibold text-portal-text">Confirm (needs a fresh authenticator code)</p>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Amount received (USD)"><input name="amount" required inputMode="decimal" defaultValue={(Math.min(p.claimed_cents, Math.max(remaining, 0)) / 100).toFixed(2)} className={INPUT} /></Field>
                          <Field label="Date received"><input name="receivedOn" type="date" required defaultValue={today} className={INPUT} /></Field>
                        </div>
                        <Field label="Bank reference (optional)"><input name="bankReference" maxLength={120} className={INPUT} /></Field>
                        <Field label="Note (optional)"><input name="note" maxLength={300} className={INPUT} /></Field>
                        <button type="submit" className="portal-btn">Confirm payment</button>
                      </form>
                    ) : (
                      <p className="text-sm text-portal-muted">Your role can review but not confirm payments.</p>
                    )}
                    <form action={rejectPaymentAction} className="space-y-3">
                      <input type="hidden" name="paymentId" value={p.payment_id} />
                      <input type="hidden" name="from" value="queue" />
                      <p className="text-xs font-semibold text-portal-text">Reject or mark duplicate</p>
                      <Field label="Outcome">
                        <select name="outcome" className={INPUT} defaultValue="rejected">
                          <option value="rejected">Rejected (funds not received)</option>
                          <option value="duplicate">Duplicate report</option>
                        </select>
                      </Field>
                      <Field label="Reason (required, kept in the history)"><input name="note" required maxLength={300} className={INPUT} /></Field>
                      <button type="submit" className="portal-btn-quiet">Reject</button>
                    </form>
                  </div>
                )}
              </PortalCard>
            );
          })}
        </div>
      )}
    </>
  );
}
