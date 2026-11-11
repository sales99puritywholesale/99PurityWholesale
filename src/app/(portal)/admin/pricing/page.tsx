import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminOrgsList, messageFor, type AdminOrg } from '@/lib/portal/commerce/server';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalTable } from '@/components/portal/portal-table';
import { Field, Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import { createOrgAction } from '../commerce-actions';

export const metadata: Metadata = { title: portalCopy.admin.modules.pricing.title };

/** Organizations with their markup and catalog assignment; creates organizations. The flow starts here: create, then open the organization to add members, assign products and set markups. */
export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/pricing', 'org.manage');
  const t = portalCopy.admin.modules.pricing;
  const res = await adminOrgsList();
  const rows = res.ok ? res.data.organizations : [];
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <Flash sp={searchParams} />
      {!res.ok && (
        <p role="alert" className="mb-4 text-sm text-portal-danger">
          {messageFor(res.code)}
        </p>
      )}
      <PortalCard title="Create organization" className="mb-6">
        <form action={createOrgAction} className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <input name="name" required maxLength={200} className={`${INPUT} w-64`} />
          </Field>
          <Field label="Code (A-Z, 0-9, dash; 3-20)">
            <input name="code" required minLength={3} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9-]{2,19}" className={`${INPUT} w-44 uppercase`} />
          </Field>
          <button className="portal-btn" type="submit">
            Create
          </button>
        </form>
        <p className="mt-2 text-xs text-portal-muted">Creating an organization needs a fresh authenticator verification.</p>
      </PortalCard>
      <PortalTable<AdminOrg>
        caption="Organizations"
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="No organizations yet"
        columns={[
          { key: 'n', header: 'Organization', cell: (r) => <Link className="portal-id" href={`/admin/pricing/${r.id}`}>{r.code}</Link> },
          { key: 'a', header: 'Name', cell: (r) => r.name },
          { key: 's', header: 'Status', cell: (r) => r.status },
          { key: 'm', header: 'Members', align: 'right', cell: (r) => r.members },
          { key: 'p', header: 'Products', align: 'right', cell: (r) => r.assigned_products },
          { key: 'k', header: 'Active rules', align: 'right', cell: (r) => r.rules },
        ]}
      />
    </>
  );
}
