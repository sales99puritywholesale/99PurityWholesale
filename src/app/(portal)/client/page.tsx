import type { Metadata } from 'next';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';

export const metadata: Metadata = { title: portalCopy.client.overview.title };

const o = portalCopy.client.overview;
const CARDS = [o.cards.invoices, o.cards.setup, o.cards.orders, o.cards.stock] as const;

/** Overview. Placeholder cards only: nothing here is connected to account data, and the page says so explicitly. */
export default async function Page() {
  await requireUser('/client');
  return (
    <>
      <PortalPageHeader area="client" title={o.title} description={o.description} />
      <div role="note" className="mb-6 rounded-xl border border-[#FEDF89] bg-portal-warning-soft px-4 py-3 text-sm text-portal-warning">
        {o.banner}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
