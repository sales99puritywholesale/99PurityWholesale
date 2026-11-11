import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { billingMessageFor, billingSummary, invoicesList, type InvoiceRow } from '@/lib/portal/billing/server';
import { formatCents } from '@/lib/portal/billing/invoices';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalTable } from '@/components/portal/portal-table';
import { InvoiceStatusPill, dateOnly } from '@/components/portal/billing-ui';
import { NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: portalCopy.client.modules.invoices.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/purchases');
  const t = portalCopy.client.modules.invoices;
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
  const [res, sum] = await Promise.all([invoicesList(org.id), billingSummary(org.id)]);
  const rows = res.ok ? res.data.invoices : [];
  const now = Date.now();
  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={`${t.description} Organization: ${org.name}.`} />
      {sum.ok && sum.data.unpaid_count > 0 && (
        <div role="note" className="mb-5 rounded-xl border border-[#FEDF89] bg-portal-warning-soft px-4 py-3 text-sm text-portal-warning">
          {sum.data.unpaid_count} unpaid invoice{sum.data.unpaid_count === 1 ? '' : 's'}: {formatCents(sum.data.unpaid_cents)} due
          {sum.data.overdue_count > 0 ? `, ${sum.data.overdue_count} overdue` : ''}.
        </div>
      )}
      {!res.ok && (
        <p role="alert" className="mb-4 text-sm text-portal-danger">
          {billingMessageFor(res.code)}
        </p>
      )}
      <PortalTable<InvoiceRow>
        caption="Invoices"
        rows={rows}
        rowKey={(r) => r.invoice_id}
        emptyTitle="No invoices yet"
        emptyDescription="An invoice is created automatically when you place an order."
        columns={[
          { key: 'n', header: 'Invoice', cell: (r) => <Link className="portal-id" href={`/client/purchases/${r.invoice_id}?org=${org.id}`}>{r.invoice_number}</Link> },
          { key: 'o', header: 'Order', cell: (r) => r.order_number ?? (r.kind === 'setup' ? 'Setup fee' : 'Funding') },
          { key: 'i', header: 'Issued', cell: (r) => dateOnly(r.issued_at) },
          {
            key: 'd',
            header: 'Due',
            cell: (r) => {
              const overdue = (r.status === 'open' || r.status === 'partially_paid') && new Date(r.due_at).getTime() < now;
              return <span className={overdue ? 'font-semibold text-portal-danger' : undefined}>{dateOnly(r.due_at)}{overdue ? ' (overdue)' : ''}</span>;
            },
          },
          {
            key: 's',
            header: 'Status',
            cell: (r) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                <InvoiceStatusPill status={r.status} />
                {r.pending_payments > 0 && <span className="text-xs text-portal-muted">{r.pending_payments} payment awaiting confirmation</span>}
              </span>
            ),
          },
          { key: 't', header: 'Total', align: 'right', cell: (r) => formatCents(r.total_cents) },
          { key: 'b', header: 'Balance', align: 'right', cell: (r) => formatCents(r.status === 'void' ? 0 : r.total_cents - r.paid_cents) },
        ]}
      />
    </>
  );
}
