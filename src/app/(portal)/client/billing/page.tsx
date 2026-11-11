import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { billingMessageFor, billingSummary, invoicesList } from '@/lib/portal/billing/server';
import { feeScheduleCurrent } from '@/lib/portal/admin-ops/server';
import { formatFee } from '@/lib/portal/admin-ops/model';
import { formatCents } from '@/lib/portal/billing/invoices';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { InvoiceStatusPill, dateOnly } from '@/components/portal/billing-ui';
import { NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: portalCopy.client.modules.billing.title };

/** Invoice-based billing: totals and recent invoices. The wallet is not shown anywhere while it is locked (Gate G3); fees are billed by invoice. */
export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/billing');
  const t = portalCopy.client.modules.billing;
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  if (!org) {
    return (
      <>
        <PortalPageHeader area="client" title={t.title} description={t.description} />
        <NoOrganization />
      </>
    );
  }
  const [sum, inv, fees] = await Promise.all([billingSummary(org.id), invoicesList(org.id), feeScheduleCurrent()]);
  const recent = inv.ok ? inv.data.invoices.slice(0, 8) : [];
  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={`${t.description} Organization: ${org.name}.`} />
      {!sum.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{billingMessageFor(sum.code)}</p>}
      {sum.ok && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <PortalCard title="Amount due">
            <p className="text-2xl font-semibold text-portal-text">{formatCents(sum.data.unpaid_cents)}</p>
            <p className="mt-1 text-xs text-portal-muted">{sum.data.unpaid_count} unpaid invoice{sum.data.unpaid_count === 1 ? '' : 's'}</p>
          </PortalCard>
          <PortalCard title="Overdue">
            <p className="text-2xl font-semibold text-portal-text">{sum.data.overdue_count}</p>
            <p className="mt-1 text-xs text-portal-muted">invoice{sum.data.overdue_count === 1 ? '' : 's'} past the due date</p>
          </PortalCard>
          <PortalCard title="Paid to date">
            <p className="text-2xl font-semibold text-portal-text">{formatCents(sum.data.paid_cents)}</p>
            <p className="mt-1 text-xs text-portal-muted">confirmed payments</p>
          </PortalCard>
        </div>
      )}
      <PortalCard title="Recent invoices" actions={<Link href={`/client/purchases?org=${org.id}`} className="portal-btn-quiet">All invoices</Link>}>
        {recent.length === 0 ? (
          <p className="text-sm text-portal-muted">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-portal-border text-sm">
            {recent.map((r) => (
              <li key={r.invoice_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <Link className="portal-id" href={`/client/purchases/${r.invoice_id}?org=${org.id}`}>{r.invoice_number}</Link>
                <span className="text-xs text-portal-muted">due {dateOnly(r.due_at)}</span>
                <span className="inline-flex items-center gap-2"><span className="font-semibold text-portal-text">{formatCents(r.total_cents)}</span><InvoiceStatusPill status={r.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </PortalCard>
      {fees.ok && fees.data.fees.length > 0 && (
        <PortalCard title="Fee schedule" className="mt-4">
          <ul className="divide-y divide-portal-border text-sm">
            {fees.data.fees.map((f) => <li key={f.code} className="flex flex-wrap justify-between gap-3 py-2 text-portal-text"><span>{f.name}{f.note ? <span className="text-xs text-portal-muted"> ({f.note})</span> : null}</span><span className="font-semibold">{formatFee(f.amount_cents, f.unit)}</span></li>)}
          </ul>
        </PortalCard>
      )}
      <p className="mt-4 text-xs text-portal-muted">Fees and charges are billed by invoice. Payment is made by wire, Zelle or ACH and confirmed by our finance team.</p>
    </>
  );
}
