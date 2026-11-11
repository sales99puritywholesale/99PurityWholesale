import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations, messageFor, ordersList, type OrderSummary } from '@/lib/portal/commerce/server';
import { formatUsd } from '@/lib/portal/commerce/pricing';
import { isOrderStatus, STATUS_LABELS } from '@/lib/portal/commerce/orders';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalTable } from '@/components/portal/portal-table';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: portalCopy.client.modules.orders.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/orders');
  const t = portalCopy.client.modules.orders;
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
  const res = await ordersList(org.id);
  const rows = res.ok ? res.data.orders : [];
  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={`${t.description} Organization: ${org.name}.`} />
      {!res.ok && (
        <p role="alert" className="mb-4 text-sm text-portal-danger">
          {messageFor(res.code)}
        </p>
      )}
      <PortalTable<OrderSummary>
        caption="Orders"
        rows={rows}
        rowKey={(r) => r.order_id}
        emptyTitle="No orders yet"
        emptyDescription="Orders you place from the shop appear here."
        columns={[
          {
            key: 'n',
            header: 'Order',
            cell: (r) => (
              <Link className="portal-id" href={`/client/orders/${r.order_id}?org=${org.id}`}>
                {r.order_number}
              </Link>
            ),
          },
          { key: 'd', header: 'Placed', cell: (r) => new Date(r.created_at).toISOString().slice(0, 10) },
          { key: 's', header: 'Status', cell: (r) => <PortalStatusPill label={isOrderStatus(r.status) ? STATUS_LABELS[r.status] : r.status} tone={r.status === 'cancelled' ? 'danger' : r.status === 'delivered' ? 'success' : 'info'} /> },
          { key: 't', header: 'Total', align: 'right', cell: (r) => formatUsd(r.total_cents) },
        ]}
      />
    </>
  );
}
