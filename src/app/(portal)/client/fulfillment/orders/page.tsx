import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { fulfillmentOrdersList, type FulfillmentOrderDetail } from '@/lib/portal/inventory/server';
import { customerLabel } from '@/lib/portal/inventory/fulfillment';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalTable } from '@/components/portal/portal-table';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: 'Fulfillment orders' };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/fulfillment/orders');
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  if (!org) {
    return (
      <>
        <PortalPageHeader area="client" title="Fulfillment orders" />
        <NoOrganization />
      </>
    );
  }
  const res = await fulfillmentOrdersList(org.id);
  const rows = res.ok ? res.data.orders : [];
  return (
    <>
      <PortalPageHeader area="client" title="Fulfillment orders" description={`Orders sent to our warehouse through the API. Organization: ${org.name}.`} crumbs={[{ label: 'Stock', href: `/client/stock?org=${org.id}` }]} />
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(res.code)}</p>}
      <PortalTable<FulfillmentOrderDetail>
        caption="Fulfillment orders"
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="No orders yet"
        emptyDescription="Orders you send through the API appear here."
        columns={[
          { key: 'n', header: 'Order', cell: (r) => <Link className="portal-id" href={`/client/fulfillment/orders/${r.id}?org=${org.id}`}>{r.order_number}</Link> },
          { key: 'r', header: 'Your reference', cell: (r) => r.external_ref },
          { key: 'd', header: 'Received', cell: (r) => dateOnly(r.created_at) },
          { key: 'u', header: 'Units', align: 'right', cell: (r) => r.lines.reduce((n, l) => n + l.quantity, 0) },
          { key: 's', header: 'Status', cell: (r) => <PortalStatusPill label={customerLabel(r.status, r.sandbox)} tone={r.status === 'cancelled' ? 'danger' : r.status === 'delivered' ? 'success' : r.sandbox ? 'neutral' : 'info'} /> },
          { key: 't', header: 'Tracking', cell: (r) => r.shipment?.tracking_number ?? '-' },
        ]}
      />
    </>
  );
}
