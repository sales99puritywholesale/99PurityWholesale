import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminOrgsOverview } from '@/lib/portal/admin-ops/server';
import { adminCertificateTargets, adminCertificatesList } from '@/lib/portal/aftersales/server';
import { uuid } from '@/lib/portal/aftersales/schemas';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { Field, Flash, INPUT, one, type Sp } from '@/components/portal/commerce-ui';
import { downloadAdminCertificateAction, publishCertificateAction, withdrawCertificateAction } from '../../aftersales-actions';

export const metadata: Metadata = { title: 'Certificates of analysis' };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/inventory/certificates', 'inventory.adjust');
  const ctx = await getStaffAccessContext();
  const canRead = evaluateCapability(ctx, 'documents.read').allowed;
  const orgParam = one(searchParams.org);
  const orgId = orgParam && uuid.safeParse(orgParam).success ? orgParam : null;
  const [orgs, list, targets] = await Promise.all([
    adminOrgsOverview(),
    canRead ? adminCertificatesList(orgId) : Promise.resolve(null),
    orgId ? adminCertificateTargets(orgId) : Promise.resolve(null),
  ]);
  const orgRows = orgs.ok ? orgs.data.organizations : [];
  const current = orgRows.find((o) => o.id === orgId);
  return (
    <>
      <PortalPageHeader area="admin" title="Certificates of analysis" description="Attach a certificate to a lot or an order. The customer can download it from their Certificates page." />
      <Flash sp={searchParams} stepUpNext="/admin/inventory/certificates" />
      <div className="space-y-4">
        <PortalCard title="Publish a certificate" actions={<Link href="/admin/inventory" className="portal-btn-quiet">Back to inventory</Link>}>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Organization">
              <select name="org" defaultValue={orgId ?? ''} className={INPUT}>
                <option value="">Choose...</option>
                {orgRows.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
              </select>
            </Field>
            <button type="submit" className="portal-btn-quiet">Load lots and orders</button>
          </form>
          {orgId && targets && !targets.ok && <p role="alert" className="text-sm text-portal-danger">{messageFor(targets.code)}</p>}
          {orgId && targets && targets.ok && (
            <form action={publishCertificateAction} encType="multipart/form-data" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="organizationId" value={orgId} />
              <Field label="Title (for example: BPC-157 10 mg, lot A123)"><input name="title" required maxLength={160} className={INPUT} /></Field>
              <Field label="Issue date (optional)"><input name="issuedOn" type="date" className={INPUT} /></Field>
              <Field label="Lot">
                <select name="lotId" defaultValue="" className={INPUT}>
                  <option value="">None</option>
                  {targets.data.lots.map((l) => <option key={l.id} value={l.id}>{l.product_name ?? 'Product'} lot {l.lot_number}{l.expires_on ? ` (expires ${l.expires_on})` : ''}</option>)}
                </select>
              </Field>
              <Field label="Order">
                <select name="orderId" defaultValue="" className={INPUT}>
                  <option value="">None</option>
                  {targets.data.orders.map((o) => <option key={o.id} value={o.id}>{o.order_number} ({o.status})</option>)}
                </select>
              </Field>
              <Field label="File (PDF, PNG or JPEG, up to 10 MB)"><input name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className={INPUT} /></Field>
              <p className="self-end text-xs text-portal-muted">Choose at least a lot or an order. The file type is checked from the file itself, not its name.</p>
              <div className="sm:col-span-2"><button type="submit" className="portal-btn-quiet">Publish certificate</button></div>
            </form>
          )}
          {!orgId && <p className="text-sm text-portal-muted">Choose an organization to attach a certificate to one of its lots or orders.</p>}
          {current && targets && targets.ok && targets.data.lots.length === 0 && targets.data.orders.length === 0 && (
            <p className="mt-2 text-xs text-portal-muted">{current.name} has no lots or orders yet. Receive stock first, or wait for an order.</p>
          )}
        </PortalCard>

        <PortalCard title={current ? `Certificates for ${current.name}` : 'Recent certificates'}>
          {list === null && <p className="text-sm text-portal-muted">You can publish certificates but not read the list (the documents permission is needed).</p>}
          {list && !list.ok && <p role="alert" className="text-sm text-portal-danger">{messageFor(list.code)}</p>}
          {list && list.ok && list.data.certificates.length === 0 && <p className="text-sm text-portal-muted">No certificates yet.</p>}
          {list && list.ok && list.data.certificates.length > 0 && (
            <ul className="divide-y divide-portal-border text-sm">
              {list.data.certificates.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-portal-text">
                      {c.title} <span className="text-xs text-portal-muted">{c.organization_name}</span>
                      <span className="block text-xs text-portal-muted">{[c.lot_number ? `lot ${c.lot_number}` : null, c.order_number ? `order ${c.order_number}` : null, `added ${dateOnly(c.created_at)}`, c.file_name].filter(Boolean).join(', ')}</span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <PortalStatusPill label={c.status === 'published' ? 'Published' : 'Withdrawn'} tone={c.status === 'published' ? 'success' : 'neutral'} />
                      <form action={downloadAdminCertificateAction}><input type="hidden" name="id" value={c.id} /><button type="submit" className="portal-btn-quiet">Open</button></form>
                    </span>
                  </div>
                  {c.status === 'published' && (
                    <form action={withdrawCertificateAction} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      {orgId && <input type="hidden" name="org" value={orgId} />}
                      <input name="reason" required maxLength={300} placeholder="Reason for withdrawing" aria-label={`Reason for withdrawing ${c.title}`} className={`${INPUT} max-w-sm`} />
                      <button type="submit" className="portal-btn-quiet">Withdraw (fresh code needed)</button>
                    </form>
                  )}
                  {c.status === 'withdrawn' && c.withdraw_reason && <p className="mt-1 text-xs text-portal-muted">Withdrawn: {c.withdraw_reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </PortalCard>
      </div>
    </>
  );
}
