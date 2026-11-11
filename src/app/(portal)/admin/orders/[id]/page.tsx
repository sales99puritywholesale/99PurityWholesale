import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminInvoicesList } from '@/lib/portal/billing/server';
import { formatCents } from '@/lib/portal/billing/invoices';
import { InvoiceStatusPill } from '@/components/portal/billing-ui';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminOrderGet } from '@/lib/portal/commerce/server';
import { formatE4, formatUsd } from '@/lib/portal/commerce/pricing';
import { ORDER_TRANSITIONS, STATUS_LABELS, isOrderStatus } from '@/lib/portal/commerce/orders';
import { uuid } from '@/lib/portal/commerce/schemas';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import { setOrderStatusAction } from '../../commerce-actions';

export const metadata: Metadata = { title: 'Order' };
const markup = (type: 'percent' | 'fixed' | null, e4: number | null, amount: number) =>
  type === null || e4 === null ? 'none' : `${type === 'percent' ? `${formatE4(e4)}%` : formatUsd(Math.round(e4 / 100))} = ${formatUsd(amount)}`;

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: Sp }) {
  await requireStaffCapability(`/admin/orders/${params.id}`, 'org.read');
  if (!uuid.safeParse(params.id).success) notFound();
  const res = await adminOrderGet(params.id);
  if (!res.ok) notFound();
  const { order, items, events } = res.data;
  const canManage = evaluateCapability(await getStaffAccessContext(), 'fulfillment.process').allowed;
  const next = isOrderStatus(order.status) ? ORDER_TRANSITIONS[order.status] : [];
  // the invoice of this order, only for staff who may read billing (the list RPC denies everyone else, so nothing is shown to them)
  const invs = evaluateCapability(await getStaffAccessContext(), 'org.billing.read').allowed ? await adminInvoicesList(null) : null;
  const invoice = invs && invs.ok ? invs.data.invoices.find((i) => i.order_number === order.order_number) : undefined;
  return (
    <>
      <PortalPageHeader area="admin" title={order.order_number} description={`${order.organization_name} (${order.organization_code}), placed ${new Date(order.created_at).toISOString().slice(0, 10)}`} crumbs={[{ label: 'Orders', href: '/admin/orders' }]} />
      <Flash sp={searchParams} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <PortalCard title="Items (price snapshot)" actions={<PortalStatusPill label={isOrderStatus(order.status) ? STATUS_LABELS[order.status] : order.status} tone={order.status === 'cancelled' ? 'danger' : order.status === 'delivered' ? 'success' : 'info'} />}>
          <ul className="divide-y divide-portal-border text-sm">
            {items.map((i) => (
              <li key={i.sku} className="py-2.5">
                <div className="flex flex-wrap justify-between gap-3">
                  <span className="text-portal-text">
                    {i.product_name} {i.spec} <span className="portal-id text-xs">{i.sku}</span>
                  </span>
                  <span className="font-semibold text-portal-text">
                    {i.quantity} x {formatUsd(i.unit_price_cents)} = {formatUsd(i.line_total_cents)}
                  </span>
                </div>
                <p className="text-xs text-portal-muted">
                  base {formatUsd(i.base_price_cents)}; organization markup {markup(i.pricing.org_type, i.pricing.org_value_e4, i.pricing.org_amount)}; representative markup{' '}
                  {markup(i.pricing.rep_type, i.pricing.rep_value_e4, i.pricing.rep_amount)}
                  {i.pricing.rep_clamped ? ' (clamped to bounds)' : ''}; floor {formatUsd(i.floor_cents)}
                  {i.pricing.floor_applied ? ' (applied)' : ''}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex justify-between border-t border-portal-border pt-3 text-base font-semibold text-portal-text">
            <span>Total ({order.currency})</span>
            <span>{formatUsd(order.total_cents)}</span>
          </p>
        </PortalCard>
        <div className="space-y-4">
          <PortalCard title="Status">
            {next.length === 0 ? (
              <p className="text-sm text-portal-muted">This order is in a final state.</p>
            ) : canManage ? (
              <form action={setOrderStatusAction} className="space-y-3">
                <input type="hidden" name="orderId" value={order.order_id} />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-portal-muted">Change status to</span>
                  <select name="to" className={INPUT} defaultValue={next[0]}>
                    {next.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-portal-muted">Note (optional, visible to staff)</span>
                  <input name="note" maxLength={300} className={INPUT} />
                </label>
                <button className="portal-btn" type="submit">
                  Update status
                </button>
              </form>
            ) : (
              <p className="text-sm text-portal-muted">Your role can view this order but not change its status.</p>
            )}
          </PortalCard>
          {invoice && (
            <PortalCard title="Invoice" actions={<InvoiceStatusPill status={invoice.status} />}>
              <p className="text-sm text-portal-text">
                <Link className="portal-id" href={`/admin/invoices/${invoice.invoice_id}`}>{invoice.invoice_number}</Link>
                <span className="ml-2 text-portal-muted">{formatCents(invoice.paid_cents)} of {formatCents(invoice.total_cents)} paid</span>
              </p>
            </PortalCard>
          )}
          <PortalCard title="Ship to">
            <address className="text-sm not-italic text-portal-text">
              {Object.entries(order.ship_to).map(([k, v]) => (
                <div key={k}>{v}</div>
              ))}
            </address>
            {order.notes && <p className="mt-3 text-xs text-portal-muted">Customer notes: {order.notes}</p>}
          </PortalCard>
          <PortalCard title="History">
            <ol className="space-y-1.5 text-sm text-portal-text">
              {events.map((e, idx) => (
                <li key={idx}>
                  {isOrderStatus(e.to_status) ? STATUS_LABELS[e.to_status] : e.to_status} <span className="text-xs text-portal-muted">{new Date(e.at).toISOString().slice(0, 16).replace('T', ' ')} ({e.actor_kind}){e.note ? `: ${e.note}` : ''}</span>
                </li>
              ))}
            </ol>
          </PortalCard>
        </div>
      </div>
    </>
  );
}
