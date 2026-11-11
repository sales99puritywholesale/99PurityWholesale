import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminFoGet } from '@/lib/portal/inventory/server';
import { FO_STAFF_LABELS, NEXT_STEP, canStaffCancel } from '@/lib/portal/inventory/fulfillment';
import { uuid } from '@/lib/portal/inventory/schemas';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Field, Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import { resolveExceptionAction, transitionAction } from '../../../inventory-actions';

export const metadata: Metadata = { title: 'Fulfillment order' };

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: Sp }) {
  const path = `/admin/fulfillment/orders/${params.id}`;
  await requireStaffCapability(path, 'org.read');
  if (!uuid.safeParse(params.id).success) notFound();
  const res = await adminFoGet(params.id);
  if (!res.ok) notFound();
  const { order, recipient, reservations, organization_name, organization_code } = res.data;
  const canProcess = evaluateCapability(await getStaffAccessContext(), 'fulfillment.process').allowed && !order.sandbox;
  const next = NEXT_STEP[order.status];
  const hidden = <input type="hidden" name="orderId" value={order.id} />;
  return (
    <>
      <PortalPageHeader area="admin" title={order.order_number} description={`${organization_name} (${organization_code}), reference ${order.external_ref}.`} crumbs={[{ label: 'Fulfillment orders', href: '/admin/fulfillment/orders' }]} />
      <Flash sp={searchParams} stepUpNext={path} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <PortalCard title="Items" actions={<span className="inline-flex gap-2"><PortalStatusPill label={FO_STAFF_LABELS[order.status]} tone={order.status === 'cancelled' ? 'danger' : order.status === 'delivered' ? 'success' : 'info'} />{order.sandbox && <PortalStatusPill label="Sandbox" tone="neutral" />}</span>}>
            <ul className="divide-y divide-portal-border text-sm">
              {order.lines.map((l) => <li key={l.sku} className="flex justify-between gap-3 py-2 text-portal-text"><span className="portal-id">{l.sku}</span><span>{l.quantity} units</span></li>)}
            </ul>
            {reservations.length > 0 && (
              <div className="mt-4 border-t border-portal-border pt-3">
                <p className="mb-1 text-xs font-medium text-portal-muted">Reserved stock (first expiry first)</p>
                <ul className="space-y-1 text-xs text-portal-text">
                  {reservations.map((r, i) => <li key={i}>{r.qty} x {r.external_sku}, lot {r.lot_number}, {r.location} <span className="text-portal-muted">({r.status})</span></li>)}
                </ul>
              </div>
            )}
          </PortalCard>
          {order.open_exceptions.length > 0 && (
            <PortalCard title="Open exceptions">
              <ul className="space-y-3 text-sm">
                {order.open_exceptions.map((x) => (
                  <li key={x.id}>
                    <p className="text-portal-danger">{x.kind.replace('_', ' ')}{x.detail ? `: ${x.detail}` : ''}</p>
                    {canProcess && (
                      <form action={resolveExceptionAction} className="mt-2 flex flex-wrap items-end gap-2">
                        {hidden}
                        <input type="hidden" name="id" value={x.id} />
                        <Field label="Resolution note (required)"><input name="resolution" required maxLength={300} className={`${INPUT} w-72`} /></Field>
                        <button type="submit" className="portal-btn-quiet">Mark resolved</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </PortalCard>
          )}
          <PortalCard title="History">
            <ol className="space-y-1 text-sm text-portal-text">
              {order.events.length === 0 && <li className="text-portal-muted">No status changes yet.</li>}
              {order.events.map((e, i) => <li key={i}>{FO_STAFF_LABELS[e.to_status as keyof typeof FO_STAFF_LABELS] ?? e.to_status} <span className="text-xs text-portal-muted">{e.at.slice(0, 16).replace('T', ' ')} ({e.actor_kind})</span></li>)}
            </ol>
          </PortalCard>
        </div>
        <div className="space-y-4">
          <PortalCard title="Next step">
            {order.sandbox ? <p className="text-sm text-portal-muted">Sandbox orders are for testing only and cannot be processed.</p>
              : !canProcess ? <p className="text-sm text-portal-muted">Your role can view this order but not process it.</p>
              : !next ? <p className="text-sm text-portal-muted">This order is in a final state.</p> : (
              <form action={transitionAction} className="space-y-3">
                {hidden}
                <input type="hidden" name="to" value={next.to} />
                {next.to === 'shipped' && (
                  <>
                    <Field label="Carrier"><input name="carrier" required maxLength={60} className={INPUT} placeholder="UPS" /></Field>
                    <Field label="Service (optional)"><input name="service" maxLength={60} className={INPUT} placeholder="Ground" /></Field>
                    <Field label="Tracking number"><input name="trackingNumber" required maxLength={80} className={INPUT} /></Field>
                    <p className="text-xs text-portal-muted">Shipping removes the reserved units from stock and tells the customer (and their webhook) the order is in transit.</p>
                  </>
                )}
                <button type="submit" className="portal-btn">{next.label}</button>
              </form>
            )}
          </PortalCard>
          {canProcess && canStaffCancel(order.status) && (
            <PortalCard title="Cancel order">
              <form action={transitionAction} className="space-y-3">
                {hidden}
                <input type="hidden" name="to" value="cancelled" />
                <Field label="Reason (required)"><input name="reason" required maxLength={300} className={INPUT} /></Field>
                <p className="text-xs text-portal-muted">Releases any reserved stock. An order cannot be cancelled after it is ready to ship.</p>
                <button type="submit" className="portal-btn-quiet">Cancel order</button>
              </form>
            </PortalCard>
          )}
          <PortalCard title="Ship to">
            <address className="text-sm not-italic text-portal-text">{Object.entries(recipient).map(([k, v]) => <div key={k}>{v}</div>)}</address>
          </PortalCard>
          {order.shipment && (
            <PortalCard title="Shipment">
              <p className="text-sm text-portal-text">{order.shipment.carrier}{order.shipment.service ? ` ${order.shipment.service}` : ''}: <span className="portal-id">{order.shipment.tracking_number}</span></p>
              <p className="text-xs text-portal-muted">Shipped {order.shipment.shipped_at.slice(0, 10)}{order.shipment.delivered_at ? `, delivered ${order.shipment.delivered_at.slice(0, 10)}` : ''}</p>
            </PortalCard>
          )}
        </div>
      </div>
    </>
  );
}
