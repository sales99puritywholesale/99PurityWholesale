import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminOrgsOverview, type OrgOverviewRow } from '@/lib/portal/admin-ops/server';
import { ORG_STATUS_LABELS, termsLabel } from '@/lib/portal/admin-ops/model';
import { formatCents } from '@/lib/portal/billing/invoices';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalTable } from '@/components/portal/portal-table';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';

export const metadata: Metadata = { title: portalCopy.admin.modules.organizations.title };

export default async function Page() {
  await requireStaffCapability('/admin/organizations', 'org.read');
  const t = portalCopy.admin.modules.organizations;
  const res = await adminOrgsOverview();
  const rows = res.ok ? res.data.organizations : [];
  const fin = res.ok && res.data.can_see_finance;
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <p className="mb-4 text-sm text-portal-muted">New organizations are created from an approved <Link className="underline" href="/admin/applications">application</Link> or in <Link className="underline" href="/admin/pricing">Catalogs & Pricing</Link>.</p>
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(res.code)}</p>}
      <PortalTable<OrgOverviewRow>
        caption="Organizations"
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="No organizations"
        emptyDescription="Approve an application to create the first one."
        columns={[
          { key: 'n', header: 'Organization', cell: (r) => <Link className="portal-id" href={`/admin/organizations/${r.id}`}>{r.name} ({r.code})</Link> },
          { key: 's', header: 'Status', cell: (r) => <PortalStatusPill label={ORG_STATUS_LABELS[r.status]} tone={r.status === 'active' ? 'success' : r.status === 'suspended' ? 'warning' : 'neutral'} /> },
          { key: 't', header: 'Terms', cell: (r) => termsLabel(r.payment_terms) },
          { key: 'm', header: 'Members', align: 'right', cell: (r) => r.members },
          { key: 'o', header: 'Fulfillment', cell: (r) => (r.onboarding === 'live' ? 'Live' : r.onboarding ? 'In setup' : '-') },
          ...(fin ? [{ key: 'b', header: 'Outstanding', align: 'right' as const, cell: (r: OrgOverviewRow) => formatCents(r.outstanding_cents ?? 0) }] : []),
          { key: 'c', header: 'Created', cell: (r) => dateOnly(r.created_at) },
        ]}
      />
    </>
  );
}
