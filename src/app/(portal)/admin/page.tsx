import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminDashboard } from '@/lib/portal/admin-ops/server';
import { formatCents } from '@/lib/portal/billing/invoices';
import { percent } from '@/lib/portal/admin-ops/model';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';

export const metadata: Metadata = { title: portalCopy.admin.modules.overview.title };

const BUCKETS = [['current', 'Not yet due'], ['1-30', '1-30 days late'], ['31-60', '31-60 days late'], ['61-90', '61-90 days late'], ['90+', 'Over 90 days late']] as const;
const Stat = ({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) => (
  <div className="rounded-xl border border-portal-border bg-white p-4">
    <p className="text-xs font-medium text-portal-muted">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-portal-text">{href ? <Link className="hover:underline" href={href}>{value}</Link> : value}</p>
    {hint && <p className="mt-1 text-xs text-portal-muted">{hint}</p>}
  </div>
);

/** Operations and finance dashboard. Everyone with org.read sees operations; money figures appear only for staff who may read billing. */
export default async function Page() {
  await requireStaffCapability('/admin', 'org.read');
  const t = portalCopy.admin.modules.overview;
  const res = await adminDashboard();
  if (!res.ok) {
    return (
      <>
        <PortalPageHeader area="admin" title={t.title} description={t.description} />
        <p role="alert" className="text-sm text-portal-danger">{messageFor(res.code)}</p>
      </>
    );
  }
  const d = res.data;
  const f = d.finance;
  const fo = d.fulfillment.by_status;
  const ord = d.orders.by_status;
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <div className="space-y-4">
        {f && (
          <PortalCard title="Finance" actions={<Link href="/admin/invoices" className="portal-btn-quiet">Invoices & Payments</Link>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Invoiced (30 days)" value={formatCents(f.invoiced_30d_cents)} />
              <Stat label="Collected (30 days)" value={formatCents(f.collected_30d_cents)} hint={`${percent(f.collected_30d_cents, f.invoiced_30d_cents)}% of invoiced`} />
              <Stat label="Outstanding" value={formatCents(f.outstanding_cents)} hint={`${f.outstanding_count} invoice${f.outstanding_count === 1 ? '' : 's'}`} href="/admin/invoices" />
              <Stat label="Overdue" value={formatCents(f.overdue_cents)} hint={`${f.overdue_count} invoice${f.overdue_count === 1 ? '' : 's'}`} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Stat label="Payments awaiting confirmation" value={f.pending_payments_count} hint={f.pending_payments_count ? `${formatCents(f.pending_payments_cents)} reported` : 'Nothing to reconcile'} href="/admin/invoices/payments" />
              <div className="rounded-xl border border-portal-border bg-white p-4">
                <p className="text-xs font-medium text-portal-muted">Receivables aging</p>
                <ul className="mt-2 space-y-1 text-sm text-portal-text">
                  {BUCKETS.map(([k, label]) => <li key={k} className="flex justify-between"><span>{label}</span><span>{formatCents(f.aging[k]?.cents ?? 0)} <span className="text-xs text-portal-muted">({f.aging[k]?.count ?? 0})</span></span></li>)}
                </ul>
              </div>
            </div>
            {f.top_balances.length > 0 && (
              <div className="mt-3 rounded-xl border border-portal-border bg-white p-4">
                <p className="text-xs font-medium text-portal-muted">Largest balances</p>
                <ul className="mt-2 space-y-1 text-sm text-portal-text">
                  {f.top_balances.map((b) => <li key={b.organization_code} className="flex justify-between"><span>{b.organization_name} ({b.organization_code})</span><span>{formatCents(b.outstanding_cents)}</span></li>)}
                </ul>
              </div>
            )}
          </PortalCard>
        )}
        <PortalCard title="Orders">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Placed today" value={d.orders.today} href="/admin/orders" />
            <Stat label="Last 7 days" value={d.orders.last_7_days} />
            <Stat label="Waiting for confirmation" value={ord.placed ?? 0} href="/admin/orders?status=placed" />
            <Stat label="In processing" value={(ord.confirmed ?? 0) + (ord.processing ?? 0)} />
          </div>
        </PortalCard>
        <PortalCard title="Fulfillment" actions={<Link href="/admin/fulfillment/orders" className="portal-btn-quiet">Order queue</Link>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="To accept" value={fo.pending ?? 0} href="/admin/fulfillment/orders?status=pending" />
            <Stat label="To allocate or pick" value={(fo.queued ?? 0) + (fo.allocated ?? 0) + (fo.picked ?? 0)} />
            <Stat label="To pack or ship" value={(fo.packed ?? 0) + (fo.ready ?? 0)} />
            <Stat label="Open exceptions" value={d.fulfillment.open_exceptions} hint={d.fulfillment.open_exceptions ? 'Needs attention' : 'None'} />
            <Stat label="Setup steps to review" value={d.fulfillment.onboarding_waiting} href="/admin/fulfillment" />
            <Stat label="Inbound shipments expected" value={d.fulfillment.open_receipts} href="/admin/inventory" />
            <Stat label="Webhook failures (24 h)" value={d.fulfillment.webhook_failed_24h} href="/admin/integrations" />
            {d.applications_new !== null && <Stat label="New applications" value={d.applications_new} href="/admin/applications" />}
          </div>
        </PortalCard>
        <PortalCard title="Organizations" actions={<Link href="/admin/organizations" className="portal-btn-quiet">All organizations</Link>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Active" value={d.organizations.active} />
            <Stat label="Live for fulfillment" value={d.organizations.live} />
            <Stat label="Suspended" value={d.organizations.suspended} />
          </div>
        </PortalCard>
        {!d.can_see_finance && <p className="text-xs text-portal-muted">Money figures are visible to finance and administrators.</p>}
      </div>
    </>
  );
}
