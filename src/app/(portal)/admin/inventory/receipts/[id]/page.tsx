import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminReceiptGet } from '@/lib/portal/inventory/server';
import { uuid } from '@/lib/portal/inventory/schemas';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { Flash, INPUT, LABEL, type Sp } from '@/components/portal/commerce-ui';
import { receiveAction } from '../../../inventory-actions';

export const metadata: Metadata = { title: 'Receive inbound shipment' };

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: Sp }) {
  await requireStaffCapability(`/admin/inventory/receipts/${params.id}`, 'org.read');
  if (!uuid.safeParse(params.id).success) notFound();
  const res = await adminReceiptGet(params.id);
  if (!res.ok) notFound();
  const { receipt, lines, locations } = res.data;
  const canReceive = evaluateCapability(await getStaffAccessContext(), 'inventory.adjust').allowed && receipt.status === 'expected';
  return (
    <>
      <PortalPageHeader
        area="admin"
        title={receipt.reference}
        description={`${receipt.organization_name} (${receipt.organization_code}), warehouse ${receipt.warehouse_code}, announced ${dateOnly(receipt.created_at)}.`}
        crumbs={[{ label: 'Inventory', href: '/admin/inventory' }]}
      />
      <Flash sp={searchParams} stepUpNext={`/admin/inventory/receipts/${receipt.id}`} />
      <PortalCard title="Lines" actions={<PortalStatusPill label={receipt.status === 'received' ? 'Received' : receipt.status === 'cancelled' ? 'Cancelled' : 'Expected'} tone={receipt.status === 'received' ? 'success' : receipt.status === 'cancelled' ? 'danger' : 'warning'} />}>
        {canReceive ? (
          <form action={receiveAction}>
            <input type="hidden" name="receiptId" value={receipt.id} />
            <p className="mb-3 text-xs text-portal-muted">Enter what actually arrived for every line. Leave units at 0 if nothing arrived (no lot or location is needed then). Received units become stock immediately and can be allocated to orders.</p>
            <div className="space-y-4">
              {lines.map((l) => (
                <div key={l.id} className="grid gap-3 rounded-lg border border-portal-border p-3 sm:grid-cols-4">
                  <input type="hidden" name="lineId" value={l.id} />
                  <p className="text-sm text-portal-text sm:col-span-4"><span className="portal-id">{l.external_sku}</span> <span className="text-xs text-portal-muted">{l.internal_sku}, expected {l.expected_units} units</span></p>
                  <label className="block"><span className={LABEL}>Units received</span><input name="units" inputMode="numeric" defaultValue={l.expected_units} className={INPUT} /></label>
                  <label className="block"><span className={LABEL}>Lot number</span><input name="lot" maxLength={40} className={INPUT} /></label>
                  <label className="block"><span className={LABEL}>Expiry date (optional)</span><input name="expires" type="date" className={INPUT} /></label>
                  <label className="block"><span className={LABEL}>Location</span>
                    <select name="location" className={INPUT} defaultValue="">
                      <option value="">Choose...</option>
                      {locations.map((x) => <option key={x.id} value={x.id}>{x.code} ({x.kind})</option>)}
                    </select>
                  </label>
                </div>
              ))}
            </div>
            <button type="submit" className="portal-btn mt-4">Confirm receipt</button>
          </form>
        ) : (
          <ul className="divide-y divide-portal-border text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-3 py-2.5 text-portal-text"><span className="portal-id">{l.external_sku}</span><span>expected {l.expected_units}{l.received_units !== null ? `, received ${l.received_units}` : ''}</span></li>
            ))}
          </ul>
        )}
        {receipt.status === 'expected' && !canReceive && <p className="mt-3 text-xs text-portal-muted">Your role can view this shipment but not receive it.</p>}
      </PortalCard>
    </>
  );
}
