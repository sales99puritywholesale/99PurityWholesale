import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { fulfillmentOrderGet, inboundList } from '@/lib/portal/inventory/server';
import { canCustomerCancel, customerLabel } from '@/lib/portal/inventory/fulfillment';
import { uuid } from '@/lib/portal/inventory/schemas';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Flash, one, type Sp } from '@/components/portal/commerce-ui';
import { cancelFulfillmentOrderAction } from '../actions';

export const metadata: Metadata = { title: 'Fulfillment order' };

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: Sp }) {
  await requireUser(`/client/fulfillment/orders/${params.id}`);
  if (!uuid.safeParse(params.id).success) notFound();
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  if (!org) notFound();
  const [res, inbound] = await Promise.all([fulfillmentOrderGet(org.id, params.id), inboundList(org.id)]);
  if (!res.ok) notFound();
  const o = res.data.order;
  const canEdit = inbound.ok && inbound.data.can_edit;
  return (
    <>
      <PortalPageHeader area="client" title={o.order_number} description={`Your reference ${o.external_ref}, received ${o.created_at.slice(0, 10)}.`} crumbs={[{ label: 'Fulfillment orders', href: `/client/fulfillment/orders?org=${org.id}` }]} />
      <Flash sp={searchParams} stepUpNext="/client" />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <PortalCard title="Items" actions={<PortalStatusPill label={customerLabel(o.status, o.sandbox)} tone={o.status === 'cancelled' ? 'danger' : o.status === 'delivered' ? 'success' : 'info'} />}>
          <ul className="divide-y divide-portal-border text-sm">
            {o.lines.map((l) => <li key={l.sku} className="flex justify-between gap-3 py-2 text-portal-text"><span className="portal-id">{l.sku}</span><span>{l.quantity} units</span></li>)}
          </ul>
          {o.sandbox && <p className="mt-3 text-xs text-portal-muted">This is a sandbox order from a test key: it is stored for testing and is never shipped.</p>}
          {o.open_exceptions.length > 0 && <p role="note" className="mt-3 rounded-lg border border-[#FEDF89] bg-portal-warning-soft px-3 py-2 text-sm text-portal-warning">Our team is looking into a problem with this order and will contact you if we need anything.</p>}
        </PortalCard>
        <div className="space-y-4">
          {o.shipment && (
            <PortalCard title="Tracking">
              <p className="text-sm text-portal-text">{o.shipment.carrier}{o.shipment.service ? ` ${o.shipment.service}` : ''}</p>
              <p className="portal-id text-sm">{o.shipment.tracking_number}</p>
              <p className="mt-1 text-xs text-portal-muted">Shipped {o.shipment.shipped_at.slice(0, 10)}{o.shipment.delivered_at ? `, delivered ${o.shipment.delivered_at.slice(0, 10)}` : ''}</p>
            </PortalCard>
          )}
          <PortalCard title="History">
            <ol className="space-y-1 text-sm text-portal-text">
              {o.events.length === 0 && <li className="text-portal-muted">Received.</li>}
              {o.events.map((e, i) => <li key={i}>{customerLabel(e.to_status as never, false)} <span className="text-xs text-portal-muted">{e.at.slice(0, 16).replace('T', ' ')}</span></li>)}
            </ol>
          </PortalCard>
          {canEdit && canCustomerCancel(o.status) && (
            <PortalCard title="Cancel">
              <form action={cancelFulfillmentOrderAction}>
                <input type="hidden" name="organizationId" value={org.id} />
                <input type="hidden" name="id" value={o.id} />
                <p className="mb-3 text-xs text-portal-muted">You can cancel until we start allocating stock.</p>
                <button type="submit" className="portal-btn-quiet">Cancel this order</button>
              </form>
            </PortalCard>
          )}
        </div>
      </div>
    </>
  );
}
