import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { invoicesList } from '@/lib/portal/billing/server';
import { formatCents } from '@/lib/portal/billing/invoices';
import { InvoiceStatusPill, dateOnly } from '@/components/portal/billing-ui';
import { getMyOrganizations, orderGet } from '@/lib/portal/commerce/server';
import { formatUsd } from '@/lib/portal/commerce/pricing';
import { isOrderStatus, STATUS_LABELS } from '@/lib/portal/commerce/orders';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Flash, one, type Sp } from '@/components/portal/commerce-ui';
import { uuid } from '@/lib/portal/commerce/schemas';

export const metadata: Metadata = { title: 'Order' };

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: Sp }) {
  await requireUser(`/client/orders/${params.id}`);
  if (!uuid.safeParse(params.id).success) notFound();
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  if (!org) notFound();
  const res = await orderGet(org.id, params.id);
  if (!res.ok) notFound();
  const { order, items, events } = res.data;
  // the invoice of this order (matched by order number in the organization's own invoice list; absent if the list is unavailable)
  const invs = await invoicesList(org.id);
  const invoice = invs.ok ? invs.data.invoices.find((i) => i.order_number === order.order_number) : undefined;
  return (
    <>
      <PortalPageHeader area="client" title={order.order_number} description={`Placed ${new Date(order.created_at).toISOString().slice(0, 10)}`} crumbs={[{ label: 'Orders', href: `/client/orders?org=${org.id}` }]} />
      <Flash sp={searchParams} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <PortalCard title="Items" actions={<PortalStatusPill label={isOrderStatus(order.status) ? STATUS_LABELS[order.status] : order.status} tone={order.status === 'cancelled' ? 'danger' : order.status === 'delivered' ? 'success' : 'info'} />}>
          <ul className="divide-y divide-portal-border text-sm">
            {items.map((i) => (
              <li key={i.sku} className="flex flex-wrap justify-between gap-3 py-2.5">
                <span className="text-portal-text">
                  {i.product_name} {i.spec} <span className="portal-id text-xs">{i.sku}</span>
                </span>
                <span className="text-portal-muted">
                  {i.quantity} x {formatUsd(i.unit_price_cents)}
                </span>
                <span className="font-semibold text-portal-text">{formatUsd(i.line_total_cents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex justify-between border-t border-portal-border pt-3 text-base font-semibold text-portal-text">
            <span>Total ({order.currency})</span>
            <span>{formatUsd(order.total_cents)}</span>
          </p>
        </PortalCard>
        <div className="space-y-4">
          {invoice && (
            <PortalCard title="Invoice" actions={<InvoiceStatusPill status={invoice.status} />}>
              <p className="text-sm text-portal-text">
                <Link className="portal-id" href={`/client/purchases/${invoice.invoice_id}?org=${org.id}`}>{invoice.invoice_number}</Link>
                <span className="ml-2 text-portal-muted">{formatCents(invoice.total_cents)}, due {dateOnly(invoice.due_at)}</span>
              </p>
            </PortalCard>
          )}
          <PortalCard title="Ship to">
            <address className="text-sm not-italic text-portal-text">
              {Object.entries(order.ship_to).map(([k, v]) => (
                <div key={k}>{v}</div>
              ))}
            </address>
            {order.notes && <p className="mt-3 text-xs text-portal-muted">Notes: {order.notes}</p>}
          </PortalCard>
          <PortalCard title="History">
            <ol className="space-y-1.5 text-sm text-portal-text">
              {events.map((e, idx) => (
                <li key={idx}>
                  {isOrderStatus(e.to_status) ? STATUS_LABELS[e.to_status] : e.to_status} <span className="text-xs text-portal-muted">{new Date(e.at).toISOString().slice(0, 16).replace('T', ' ')}</span>
                </li>
              ))}
            </ol>
          </PortalCard>
        </div>
      </div>
    </>
  );
}
