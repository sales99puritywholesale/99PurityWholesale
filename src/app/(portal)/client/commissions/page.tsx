import type { Metadata } from 'next';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { commissionsGet } from '@/lib/portal/aftersales/server';
import { formatRate, usd } from '@/lib/portal/aftersales/model';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: portalCopy.client.modules.commissions.title };

const ENTRY_LABEL = { accrual: 'Commission earned', adjustment: 'Adjustment', payout: 'Payout' } as const;

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/commissions');
  const t = portalCopy.client.modules.commissions;
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
  const c = await commissionsGet(org.id);
  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={`${t.description} Organization: ${org.name}.`} />
      {!c.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(c.code)}</p>}
      {c.ok && !c.data.enrolled && (
        <PortalCard title="Referral program">
          <p className="text-sm text-portal-muted">Your organization is not enrolled in the referral program. Contact your account manager if you would like to refer other businesses and earn a commission on their paid orders.</p>
        </PortalCard>
      )}
      {c.ok && c.data.enrolled && (
        <div className="space-y-4">
          <PortalCard title="Your referral code" actions={<PortalStatusPill label={c.data.code_active ? 'Active' : 'Paused'} tone={c.data.code_active ? 'success' : 'neutral'} />}>
            <p className="portal-id text-2xl font-semibold tracking-wider text-portal-text">{c.data.code}</p>
            <p className="mt-2 text-sm text-portal-muted">
              Plan: {c.data.plan_name}, {formatRate(c.data.rate_bps)} of the wholesale value of each paid order from a business you refer. A commission becomes payable {c.data.hold_days} days after the customer&apos;s payment is confirmed.
              Give the code to the business when they apply; our team links it to their account.
            </p>
          </PortalCard>
          <PortalCard title="Balance">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div><dt className="text-xs text-portal-muted">Available to pay out</dt><dd className="text-lg font-semibold text-portal-text">{usd(c.data.available_cents)}</dd></div>
              <div><dt className="text-xs text-portal-muted">Pending (in the {c.data.hold_days}-day hold)</dt><dd className="text-lg font-semibold text-portal-text">{usd(c.data.pending_cents)}</dd></div>
              <div><dt className="text-xs text-portal-muted">Paid out so far</dt><dd className="text-lg font-semibold text-portal-text">{usd(c.data.paid_out_cents)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-portal-muted">Payouts are sent manually by our team (wire, Zelle, ACH or check) and recorded here.</p>
          </PortalCard>
          <PortalCard title={`Businesses you referred (${c.data.referrals.length})`}>
            {c.data.referrals.length > 0 ? (
              <ul className="divide-y divide-portal-border text-sm">
                {c.data.referrals.map((r) => (
                  <li key={r.label} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-portal-text">{r.label} <span className="text-xs text-portal-muted">since {r.started_on}</span></span>
                    <PortalStatusPill label={r.status === 'active' ? 'Active' : 'Ended'} tone={r.status === 'active' ? 'success' : 'neutral'} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-portal-muted">No referrals yet. Names and orders of referred businesses are never shown to you.</p>}
          </PortalCard>
          <PortalCard title="Statement">
            {c.data.entries.length > 0 ? (
              <ul className="divide-y divide-portal-border text-sm">
                {c.data.entries.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-portal-text">
                      {ENTRY_LABEL[e.entry_type]}{e.referral ? ` from ${e.referral}` : ''}
                      <span className="block text-xs text-portal-muted">
                        {dateOnly(e.created_at)}
                        {e.base_cents !== null && e.rate_bps !== null ? `, ${formatRate(e.rate_bps)} of ${usd(e.base_cents)}` : ''}
                        {e.available_at && new Date(e.available_at).getTime() > Date.now() ? `, payable from ${dateOnly(e.available_at)}` : ''}
                        {e.reason ? `, ${e.reason}` : ''}
                      </span>
                    </span>
                    <span className={`font-semibold ${e.amount_cents < 0 ? 'text-portal-muted' : 'text-portal-text'}`}>{e.amount_cents < 0 ? `-${usd(-e.amount_cents)}` : usd(e.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-portal-muted">Nothing on the statement yet.</p>}
          </PortalCard>
        </div>
      )}
    </>
  );
}
