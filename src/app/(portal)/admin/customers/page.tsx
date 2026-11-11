import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminCustomersList, type CustomerRow } from '@/lib/portal/admin-ops/server';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalTable } from '@/components/portal/portal-table';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { INPUT, one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: portalCopy.admin.modules.customers.title };

/** Customer users with their organizations. Reading this list is itself written to the audit log (personal data). */
export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/customers', 'profiles.read.basic');
  const t = portalCopy.admin.modules.customers;
  const q = (one(searchParams.q) ?? '').trim().slice(0, 100);
  const res = await adminCustomersList(q === '' ? null : q);
  const rows = res.ok ? res.data.customers : [];
  const phone = res.ok && res.data.can_see_phone;
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <label className="block"><span className="mb-1 block text-xs font-medium text-portal-muted">Search by e-mail or name</span><input name="q" defaultValue={q} maxLength={100} className={`${INPUT} w-72`} /></label>
        <button type="submit" className="portal-btn-quiet">Search</button>
        {q && <Link href="/admin/customers" className="portal-btn-quiet">Clear</Link>}
      </form>
      <p className="mb-3 text-xs text-portal-muted">Viewing this list is recorded in the audit log.</p>
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(res.code)}</p>}
      <PortalTable<CustomerRow>
        caption="Customers"
        rows={rows}
        rowKey={(r) => `${r.user_id}-${r.organization_id}`}
        emptyTitle="No customers"
        emptyDescription={q ? 'Nobody matches this search.' : 'Customer users appear here once they belong to an organization.'}
        columns={[
          { key: 'e', header: 'E-mail', cell: (r) => r.email ?? '-' },
          { key: 'n', header: 'Name', cell: (r) => r.name ?? '-' },
          ...(phone ? [{ key: 'p', header: 'Phone', cell: (r: CustomerRow) => r.phone ?? '-' }] : []),
          { key: 'o', header: 'Organization', cell: (r) => <Link className="portal-id" href={`/admin/organizations/${r.organization_id}`}>{r.organization_name} ({r.organization_code})</Link> },
          { key: 'r', header: 'Role', cell: (r) => <PortalStatusPill label={r.role === 'owner' ? 'Owner' : 'Member'} tone={r.role === 'owner' ? 'info' : 'neutral'} /> },
          { key: 'j', header: 'Joined', cell: (r) => dateOnly(r.joined) },
        ]}
      />
    </>
  );
}
