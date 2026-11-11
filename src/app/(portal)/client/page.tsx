import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { billingSummary } from '@/lib/portal/billing/server';
import { formatCents } from '@/lib/portal/billing/invoices';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';

export const metadata: Metadata = { title: portalCopy.client.overview.title };

const o = portalCopy.client.overview;
const CARDS = [o.cards.setup, o.cards.orders, o.cards.stock] as const;

/** Overview. The unpaid-invoices card shows real data (P4); the other cards are still placeholders and say so. */
export default async function Page() {
  await requireUser('/client');
  const orgs = await getMyOrganizations();
  const org = orgs[0];
  const sum = org ? await billingSummary(org.id) : null;
  return (
    <>
      <PortalPageHeader area="client" title={o.title} description={o.description} />
      <div role="note" className="mb-6 rounded-xl border border-[#FEDF89] bg-portal-warning-soft px-4 py-3 text-sm text-portal-warning">
        {o.banner}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PortalCard
          title={o.cards.invoices.title}
          actions={org ? <Link href={`/client/purchases?org=${org.id}`} className="portal-btn-quiet">View</Link> : <PortalStatusPill label={portalCopy.common.notConnected} tone="warning" />}
        >
          {sum && sum.ok ? (
            <>
              <p className="text-2xl font-semibold text-portal-text">{formatCents(sum.data.unpaid_cents)}</p>
              <p className="mt-2 text-sm text-portal-muted">
                {sum.data.unpaid_count} unpaid invoice{sum.data.unpaid_count === 1 ? '' : 's'}
                {sum.data.overdue_count > 0 ? `, ${sum.data.overdue_count} overdue` : ''}
              </p>
            </>
          ) : (
            <>
              <p aria-hidden="true" className="font-portal-mono text-2xl text-portal-border">—</p>
              <p className="mt-2 text-sm text-portal-muted">{org ? 'Invoice totals are temporarily unavailable.' : 'Invoice totals appear here once your account is linked to an organization.'}</p>
            </>
          )}
        </PortalCard>
        {CARDS.map((card) => (
          <PortalCard key={card.title} title={card.title} actions={<PortalStatusPill label={portalCopy.common.notConnected} tone="warning" />}>
            <p aria-hidden="true" className="font-portal-mono text-2xl text-portal-border">
              —
            </p>
            <p className="mt-2 text-sm text-portal-muted">{card.hint}</p>
          </PortalCard>
        ))}
      </div>
    </>
  );
}
