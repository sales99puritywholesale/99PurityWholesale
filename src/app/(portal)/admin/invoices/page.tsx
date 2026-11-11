import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminInvoicesList, billingMessageFor, type AdminInvoiceRow } from '@/lib/portal/billing/server';
import { agingBucket, formatCents, INVOICE_STATUSES, INVOICE_STATUS_LABELS, isInvoiceStatus, type AgingBucket } from '@/lib/portal/billing/invoices';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalTable } from '@/components/portal/portal-table';
import { PortalCard } from '@/components/portal/portal-card';
import { InvoiceStatusPill, dateOnly } from '@/components/portal/billing-ui';
import { one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: portalCopy.admin.modules.invoices.title };

const BUCKETS: readonly AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/invoices', 'org.billing.read');
  const t = portalCopy.admin.modules.invoices;
  const raw = one(searchParams.status);
  const status = isInvoiceStatus(raw) ? raw : null;
  const res = await adminInvoicesList(status);
  const rows = res.ok ? res.data.invoices : [];
  const now = new Date();
  // aging of what is still owed (open and partially paid invoices), by days past due
  const aging = new Map<AgingBucket, { n: number; cents: number }>(BUCKETS.map((b) => [b, { n: 0, cents: 0 }]));
  for (const r of rows) {
    if (r.status !== 'open' && r.status !== 'partially_paid') continue;
    const slot = aging.get(agingBucket(r.status, new Date(r.due_at), now));
    if (slot) { slot.n += 1; slot.cents += r.total_cents - r.paid_cents; }
  }
  const pending = rows.reduce((n, r) => n + r.pending_payments, 0);
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <nav className="mb-5 flex flex-wrap items-center gap-2" aria-label="Filter by status">
        <Link href="/admin/invoices" className={status === null ? 'portal-btn' : 'portal-btn-quiet'}>All</Link>
        {INVOICE_STATUSES.map((s) => (
          <Link key={s} href={`/admin/invoices?status=${s}`} className={status === s ? 'portal-btn' : 'portal-btn-quiet'}>{INVOICE_STATUS_LABELS[s]}</Link>
        ))}
        <Link href="/admin/invoices/payments" className="portal-btn-quiet ml-auto">Payment reconciliation{pending > 0 ? ` (${pending})` : ''}</Link>
      </nav>
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{billingMessageFor(res.code)}</p>}
      <PortalCard title="Receivables aging (open and partially paid)">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {BUCKETS.map((b) => (
            <div key={b}>
              <dt className="text-xs text-portal-muted">{b === 'current' ? 'Not yet due' : `${b} days late`}</dt>
              <dd className="font-semibold text-portal-text">{formatCents(aging.get(b)?.cents ?? 0)} <span className="text-xs font-normal text-portal-muted">({aging.get(b)?.n ?? 0})</span></dd>
            </div>
          ))}
        </dl>
      </PortalCard>
      <div className="mt-4">
        <PortalTable<AdminInvoiceRow>
          caption="Invoices"
          rows={rows}
          rowKey={(r) => r.invoice_id}
          emptyTitle="No invoices"
          emptyDescription="Invoices are created automatically when customers place orders."
          columns={[
            { key: 'n', header: 'Invoice', cell: (r) => <Link className="portal-id" href={`/admin/invoices/${r.invoice_id}`}>{r.invoice_number}</Link> },
            { key: 'o', header: 'Organization', cell: (r) => `${r.organization_name} (${r.organization_code})` },
            { key: 'r', header: 'Order', cell: (r) => r.order_number ?? (r.kind === 'setup' ? 'Setup fee' : 'Funding') },
            { key: 'd', header: 'Due', cell: (r) => dateOnly(r.due_at) },
            { key: 's', header: 'Status', cell: (r) => <span className="inline-flex flex-wrap items-center gap-2"><InvoiceStatusPill status={r.status} />{r.pending_payments > 0 && <span className="text-xs text-portal-muted">{r.pending_payments} to review</span>}</span> },
            { key: 't', header: 'Total', align: 'right', cell: (r) => formatCents(r.total_cents) },
            { key: 'p', header: 'Paid', align: 'right', cell: (r) => formatCents(r.paid_cents) },
          ]}
        />
      </div>
    </>
  );
}
