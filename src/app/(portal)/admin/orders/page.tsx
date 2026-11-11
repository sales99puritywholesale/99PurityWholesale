import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminOrdersList, messageFor, type AdminOrderRow } from '@/lib/portal/commerce/server';
import { formatUsd } from '@/lib/portal/commerce/pricing';
import { ORDER_STATUSES, STATUS_LABELS, isOrderStatus } from '@/lib/portal/commerce/orders';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalTable } from '@/components/portal/portal-table';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: portalCopy.admin.modules.orders.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/orders', 'org.read');
  const t = portalCopy.admin.modules.orders;
  const raw = one(searchParams.status);
  const status = isOrderStatus(raw) ? raw : null;
  const res = await adminOrdersList(status);
  const rows = res.ok ? res.data.orders : [];
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter by status">
        <Link href="/admin/orders" className={status === null ? 'portal-btn' : 'portal-btn-quiet'}>
          All
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/admin/orders?status=${s}`} className={status === s ? 'portal-btn' : 'portal-btn-quiet'}>
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>
      {!res.ok && (
        <p role="alert" className="mb-4 text-sm text-portal-danger">
          {messageFor(res.code)}
        </p>
      )}
      <PortalTable<AdminOrderRow>
        caption="Orders"
        rows={rows}
        rowKey={(r) => r.order_id}
        emptyTitle="No orders"
        emptyDescription="Orders placed by customers appear here."
        columns={[
          { key: 'n', header: 'Order', cell: (r) => <Link className="portal-id" href={`/admin/orders/${r.order_id}`}>{r.order_number}</Link> },
          { key: 'o', header: 'Organization', cell: (r) => `${r.organization_name} (${r.organization_code})` },
          { key: 'd', header: 'Placed', cell: (r) => new Date(r.created_at).toISOString().slice(0, 10) },
          { key: 's', header: 'Status', cell: (r) => <PortalStatusPill label={isOrderStatus(r.status) ? STATUS_LABELS[r.status] : r.status} tone={r.status === 'cancelled' ? 'danger' : r.status === 'delivered' ? 'success' : 'info'} /> },
          { key: 't', header: 'Total', align: 'right', cell: (r) => formatUsd(r.total_cents) },
        ]}
      />
    </>
  );
}
