import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminInventoryOverview, adminMovementsList, adminReceiptsList, adminStockList } from '@/lib/portal/inventory/server';
import { LOCATION_KINDS, LOCATION_KIND_LABELS } from '@/lib/portal/inventory/fulfillment';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { Field, Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import { adjustAction, saveLocationAction, saveWarehouseAction } from '../inventory-actions';

export const metadata: Metadata = { title: portalCopy.admin.modules.inventory.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/inventory', 'org.read');
  const t = portalCopy.admin.modules.inventory;
  const [overview, stock, receipts, moves] = await Promise.all([adminInventoryOverview(), adminStockList(), adminReceiptsList('expected'), adminMovementsList()]);
  const ctx = await getStaffAccessContext();
  const canAdjust = evaluateCapability(ctx, 'inventory.adjust').allowed;
  const canSetup = evaluateCapability(ctx, 'org.manage').allowed;
  const hasWarehouse = overview.ok && overview.data.warehouses.length > 0;
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <Flash sp={searchParams} stepUpNext="/admin/inventory" />
      {!overview.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(overview.code)}</p>}
      <div className="space-y-4">
        {overview.ok && (
          <PortalCard title="Overview" actions={<span className="inline-flex gap-2"><Link href="/admin/inventory/certificates" className="portal-btn-quiet">Certificates</Link><Link href="/admin/fulfillment/orders" className="portal-btn-quiet">Fulfillment orders</Link></span>}>
            <div className="flex flex-wrap gap-3 text-sm">
              <PortalStatusPill label={`${overview.data.open_receipts} inbound shipment${overview.data.open_receipts === 1 ? '' : 's'} expected`} tone={overview.data.open_receipts ? 'warning' : 'neutral'} />
              <PortalStatusPill label={`${overview.data.open_exceptions} open exception${overview.data.open_exceptions === 1 ? '' : 's'}`} tone={overview.data.open_exceptions ? 'danger' : 'neutral'} />
              <PortalStatusPill label={overview.data.drift_count === 0 ? 'Balances match the ledger' : `${overview.data.drift_count} balance(s) differ from the ledger`} tone={overview.data.drift_count === 0 ? 'success' : 'danger'} />
            </div>
          </PortalCard>
        )}

        <PortalCard title="Inbound shipments to receive">
          {receipts.ok && receipts.data.receipts.length > 0 ? (
            <ul className="divide-y divide-portal-border text-sm">
              {receipts.data.receipts.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="text-portal-text">{r.organization_name} ({r.organization_code}): <span className="portal-id">{r.reference}</span> <span className="text-xs text-portal-muted">{r.units} units, announced {dateOnly(r.created_at)}</span></span>
                  <Link className="portal-btn-quiet" href={`/admin/inventory/receipts/${r.id}`}>Receive</Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-portal-muted">Nothing is waiting to be received.</p>}
        </PortalCard>

        <PortalCard title="Stock">
          {stock.ok && stock.data.rows.length > 0 ? (
            <ul className="divide-y divide-portal-border text-sm">
              {stock.data.rows.map((r) => (
                <li key={`${r.lot_id}-${r.location_id}`} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-portal-text">{r.organization_code}: {r.product_name ?? r.external_sku} <span className="portal-id text-xs">{r.external_sku}</span> <span className="text-xs text-portal-muted">lot {r.lot_number}{r.expires_on ? `, expires ${r.expires_on}` : ''}, {r.location}{r.location_kind === 'quarantine' ? ' (quarantine)' : ''}</span></span>
                    <span className="font-semibold text-portal-text">{r.on_hand} on hand, {r.reserved} reserved</span>
                  </div>
                  {canAdjust && (
                    <form action={adjustAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="skuMappingId" value={r.sku_mapping_id} />
                      <input type="hidden" name="lotId" value={r.lot_id} />
                      <input type="hidden" name="locationId" value={r.location_id} />
                      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                      <Field label="Correction (+/- units)"><input name="delta" inputMode="numeric" required className={`${INPUT} w-28`} placeholder="-2" /></Field>
                      <Field label="Reason (required)"><input name="reason" required maxLength={300} className={`${INPUT} w-64`} /></Field>
                      <button type="submit" className="portal-btn-quiet">Adjust (fresh code needed)</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-portal-muted">No stock yet. Stock appears when an inbound shipment is received.</p>}
        </PortalCard>

        <PortalCard title="Warehouses and locations">
          {overview.ok && overview.data.warehouses.map((w) => (
            <div key={w.id} className="mb-3 text-sm text-portal-text">
              <p className="font-semibold">{w.code}: {w.name} <PortalStatusPill label={w.active ? 'Active' : 'Inactive'} tone={w.active ? 'success' : 'neutral'} /></p>
              <p className="text-xs text-portal-muted">{w.locations.length === 0 ? 'No locations yet.' : w.locations.map((l) => `${l.code} (${LOCATION_KIND_LABELS[l.kind]}${l.active ? '' : ', inactive'})`).join(', ')}</p>
              {canSetup && (
                <form action={saveLocationAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="warehouseId" value={w.id} />
                  <Field label="New location code"><input name="code" required maxLength={20} className={`${INPUT} w-32`} placeholder="A-01" /></Field>
                  <Field label="Kind"><select name="kind" className={INPUT} defaultValue="storage">{LOCATION_KINDS.map((k) => <option key={k} value={k}>{LOCATION_KIND_LABELS[k]}</option>)}</select></Field>
                  <button type="submit" className="portal-btn-quiet">Add location</button>
                </form>
              )}
            </div>
          ))}
          {!hasWarehouse && <p className="mb-3 text-sm text-portal-muted">No warehouse yet. Customers cannot announce inbound shipments until one exists.</p>}
          {canSetup && (
            <form action={saveWarehouseAction} className="flex flex-wrap items-end gap-2 border-t border-portal-border pt-3">
              <Field label="Warehouse code"><input name="code" required maxLength={20} className={`${INPUT} w-32`} placeholder="TX1" /></Field>
              <Field label="Name"><input name="name" required maxLength={120} className={`${INPUT} w-64`} /></Field>
              <button type="submit" className="portal-btn-quiet">Add warehouse</button>
            </form>
          )}
        </PortalCard>

        <PortalCard title="Recent stock movements (ledger)">
          {moves.ok && moves.data.movements.length > 0 ? (
            <ul className="divide-y divide-portal-border text-xs text-portal-text">
              {moves.data.movements.map((m) => (
                <li key={m.id} className="py-1.5">{m.created_at.slice(0, 16).replace('T', ' ')}: <span className="font-semibold">{m.movement_type}</span> {m.qty} x {m.external_sku} ({m.organization_code}), lot {m.lot_number}, {m.location}{m.ref_type ? `, ${m.ref_type}` : ''}{m.reason ? `: ${m.reason}` : ''}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-portal-muted">No movements yet.</p>}
        </PortalCard>
      </div>
    </>
  );
}
