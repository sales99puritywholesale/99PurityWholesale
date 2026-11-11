import type { Metadata } from 'next';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { certificatesList } from '@/lib/portal/aftersales/server';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { Flash, NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';
import { downloadCertificateAction } from './actions';

export const metadata: Metadata = { title: portalCopy.client.modules.certificates.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/certificates');
  const t = portalCopy.client.modules.certificates;
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
  const list = await certificatesList(org.id);
  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={`${t.description} Organization: ${org.name}.`} />
      <Flash sp={searchParams} stepUpNext="/client" />
      {!list.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(list.code)}</p>}
      <PortalCard title="Certificates of analysis">
        {list.ok && list.data.certificates.length > 0 ? (
          <ul className="divide-y divide-portal-border text-sm">
            {list.data.certificates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-portal-text">
                  {c.title}
                  <span className="block text-xs text-portal-muted">
                    {[c.product_name, c.lot_number ? `lot ${c.lot_number}` : null, c.order_number ? `order ${c.order_number}` : null, c.issued_on ? `issued ${c.issued_on}` : `added ${dateOnly(c.created_at)}`].filter(Boolean).join(', ')}
                  </span>
                </span>
                {c.status === 'published' ? (
                  <form action={downloadCertificateAction}>
                    <input type="hidden" name="organizationId" value={org.id} />
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="portal-btn-quiet">Download</button>
                  </form>
                ) : <PortalStatusPill label="Withdrawn" tone="neutral" />}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-portal-muted">{list.ok ? t.empty : ''}</p>}
        <p className="mt-3 text-xs text-portal-muted">A withdrawn certificate was replaced or corrected by our team and can no longer be downloaded. Contact your account manager with questions about a lot.</p>
      </PortalCard>
    </>
  );
}
