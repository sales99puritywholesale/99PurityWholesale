import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminFoList, type AdminFoRow } from '@/lib/portal/inventory/server';
import { FO_STATUSES, FO_STAFF_LABELS, isFoStatus } from '@/lib/portal/inventory/fulfillment';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalTable } from '@/components/portal/portal-table';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: 'Fulfillment orders' };

/** Orders received through the API (and, later, other channels): the warehouse queue. */
export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/fulfillment/orders', 'org.read');
  const raw = one(searchParams.status);
  const statusFilter = isFoStatus(raw) ? raw : null;
  const res = await adminFoList(statusFilter);
  const rows = res.ok ? res.data.orders : [];
  return (
    <>
      <PortalPageHeader area="admin" title="Fulfillment orders" description="Orders to accept, allocate, pick, pack and ship." crumbs={[{ label: 'Fulfillment', href: '/admin/fulfillment' }]} />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter by status">
        <Link href="/admin/fulfillment/orders" className={statusFilter === null ? 'portal-btn' : 'portal-btn-quiet'}>All</Link>
        {FO_STATUSES.map((s) => <Link key={s} href={`/admin/fulfillment/orders?status=${s}`} className={statusFilter === s ? 'portal-btn' : 'portal-btn-quiet'}>{FO_STAFF_LABELS[s]}</Link>)}
      </nav>
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(res.code)}</p>}
      <PortalTable<AdminFoRow>
        caption="Fulfillment orders"
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="No orders"
        emptyDescription="Orders sent through the API appear here."
        columns={[
          { key: 'n', header: 'Order', cell: (r) => <Link className="portal-id" href={`/admin/fulfillment/orders/${r.id}`}>{r.order_number}</Link> },
          { key: 'o', header: 'Organization', cell: (r) => `${r.organization_name} (${r.organization_code})` },
          { key: 'r', header: 'Reference', cell: (r) => r.external_ref },
          { key: 'u', header: 'Units', align: 'right', cell: (r) => r.units },
          { key: 'd', header: 'Received', cell: (r) => dateOnly(r.created_at) },
          { key: 's', header: 'Status', cell: (r) => <span className="inline-flex flex-wrap items-center gap-2"><PortalStatusPill label={FO_STAFF_LABELS[r.status]} tone={r.status === 'cancelled' ? 'danger' : r.status === 'delivered' ? 'success' : 'info'} />{r.sandbox && <PortalStatusPill label="Sandbox" tone="neutral" />}{r.open_exceptions > 0 && <PortalStatusPill label="Exception" tone="danger" />}</span> },
        ]}
      />
    </>
  );
}
