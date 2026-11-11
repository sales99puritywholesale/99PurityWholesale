import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { onboardingGet } from '@/lib/portal/onboarding/server';
import { inboundList, stockList } from '@/lib/portal/inventory/server';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { Field, Flash, INPUT, NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';
import { cancelInboundAction, createInboundAction } from './actions';

export const metadata: Metadata = { title: portalCopy.client.modules.inventory.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/stock');
  const t = portalCopy.client.modules.inventory;
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
  const [stock, inbound, setup] = await Promise.all([stockList(org.id), inboundList(org.id), onboardingGet(org.id)]);
  const approved = setup.ok ? setup.data.state.mappings.filter((m) => m.status === 'approved') : [];
  const canEdit = inbound.ok && inbound.data.can_edit;
  const hidden = <input type="hidden" name="organizationId" value={org.id} />;
  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={`${t.description} Organization: ${org.name}.`} />
      <Flash sp={searchParams} stepUpNext="/client" />
      {!stock.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(stock.code)}</p>}
      <div className="space-y-4">
        <PortalCard title="Your stock" actions={<Link href={`/client/fulfillment/orders?org=${org.id}`} className="portal-btn-quiet">Fulfillment orders</Link>}>
          {stock.ok && stock.data.items.length > 0 ? (
            <ul className="divide-y divide-portal-border text-sm">
              {stock.data.items.map((i) => (
                <li key={i.sku_mapping_id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-portal-text">{i.product_name} {i.spec} <span className="portal-id text-xs">{i.external_sku}</span></span>
                    <span className="inline-flex items-center gap-3"><span className="text-xs text-portal-muted">{i.on_hand} on hand, {i.reserved} reserved</span><PortalStatusPill label={`${i.available} available`} tone={i.available > 0 ? 'success' : 'warning'} /></span>
                  </div>
                  {i.lots.length > 0 && <p className="mt-1 text-xs text-portal-muted">{i.lots.map((l) => `lot ${l.lot_number}${l.expires_on ? ` (expires ${l.expires_on})` : ''}: ${l.on_hand} at ${l.location}`).join('; ')}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-portal-muted">{stock.ok ? 'No approved products yet. Complete step 1 of your fulfillment setup, then send your stock to our warehouse.' : ''}</p>}
        </PortalCard>

        <PortalCard title="Inbound shipments">
          {inbound.ok && inbound.data.receipts.length > 0 ? (
            <ul className="divide-y divide-portal-border text-sm">
              {inbound.data.receipts.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-portal-text"><span className="portal-id">{r.reference}</span> <span className="text-xs text-portal-muted">announced {dateOnly(r.created_at)}{r.received_at ? `, received ${dateOnly(r.received_at)}` : ''}</span></span>
                    <span className="inline-flex items-center gap-2">
                      <PortalStatusPill label={r.status === 'received' ? 'Received' : r.status === 'cancelled' ? 'Cancelled' : 'Expected'} tone={r.status === 'received' ? 'success' : r.status === 'cancelled' ? 'neutral' : 'warning'} />
                      {canEdit && r.status === 'expected' && <form action={cancelInboundAction}>{hidden}<input type="hidden" name="id" value={r.id} /><button type="submit" className="portal-btn-quiet">Cancel</button></form>}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-portal-muted">{r.lines.map((l) => `${l.external_sku}: ${l.expected_units}${l.received_units !== null ? ` (received ${l.received_units})` : ''}`).join(', ')}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-portal-muted">No inbound shipments yet.</p>}
          {canEdit && inbound.ok && !inbound.data.warehouse_ready && <p className="mt-3 text-xs text-portal-muted">The warehouse is not set up yet, so shipments cannot be announced for now.</p>}
          {canEdit && inbound.ok && inbound.data.warehouse_ready && approved.length > 0 && (
            <form action={createInboundAction} className="mt-4 space-y-3 border-t border-portal-border pt-4">
              {hidden}
              <p className="text-xs text-portal-muted">Announce a shipment before you send it. Units count as stock only after our warehouse receives them.</p>
              <Field label="Your reference (PO number or tracking)"><input name="reference" required maxLength={80} className={INPUT} /></Field>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                  <Field label={i === 0 ? 'Product' : `Product ${i + 1} (optional)`}>
                    <select name={`sku${i}`} className={INPUT} defaultValue="">
                      <option value="">{i === 0 ? 'Choose...' : 'None'}</option>
                      {approved.map((m) => <option key={m.id} value={m.id}>{m.product_name} {m.spec} ({m.external_sku})</option>)}
                    </select>
                  </Field>
                  <Field label="Units"><input name={`units${i}`} inputMode="numeric" className={INPUT} /></Field>
                </div>
              ))}
              <button type="submit" className="portal-btn-quiet">Announce shipment</button>
            </form>
          )}
          {!canEdit && <p className="mt-3 text-xs text-portal-muted">Only an organization owner can announce inbound shipments.</p>}
        </PortalCard>
      </div>
    </>
  );
}
