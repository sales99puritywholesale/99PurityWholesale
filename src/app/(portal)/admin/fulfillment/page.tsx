import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminOnboardingList, type OnboardingListRow } from '@/lib/portal/onboarding/server';
import { STEP_COUNT } from '@/lib/portal/onboarding/steps';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalTable } from '@/components/portal/portal-table';
import { PortalStatusPill } from '@/components/portal/portal-status';

export const metadata: Metadata = { title: portalCopy.admin.modules.fulfillment.title };

/** Onboarding queue: every active organization with its progress and the steps waiting for review. */
export default async function Page() {
  await requireStaffCapability('/admin/fulfillment', 'onboarding.review');
  const t = portalCopy.admin.modules.fulfillment;
  const res = await adminOnboardingList();
  const rows = res.ok ? [...res.data.organizations].sort((a, b) => b.submitted_steps.length - a.submitted_steps.length || a.organization_name.localeCompare(b.organization_name)) : [];
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Fulfillment sections">
        <Link href="/admin/fulfillment" className="portal-btn">Onboarding</Link>
        <Link href="/admin/fulfillment/orders" className="portal-btn-quiet">Orders</Link>
        <Link href="/admin/fulfillment/gates" className="portal-btn-quiet">Compliance gates</Link>
      </nav>
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(res.code)}</p>}
      <PortalTable<OnboardingListRow>
        caption="Onboarding"
        rows={rows}
        rowKey={(r) => r.organization_id}
        emptyTitle="No organizations"
        emptyDescription="Active organizations appear here."
        columns={[
          { key: 'o', header: 'Organization', cell: (r) => <Link className="portal-id" href={`/admin/fulfillment/${r.organization_id}`}>{r.organization_name} ({r.organization_code})</Link> },
          { key: 'p', header: 'Progress', cell: (r) => (r.started ? `${r.approved} of ${STEP_COUNT} steps` : 'Not started') },
          { key: 'w', header: 'Waiting for review', cell: (r) => (r.submitted_steps.length > 0 ? <PortalStatusPill label={`Step${r.submitted_steps.length === 1 ? '' : 's'} ${r.submitted_steps.join(', ')}`} tone="warning" /> : '-') },
          { key: 's', header: 'Status', cell: (r) => <PortalStatusPill label={r.status === 'live' ? 'Live' : 'In setup'} tone={r.status === 'live' ? 'success' : 'info'} /> },
        ]}
      />
    </>
  );
}
