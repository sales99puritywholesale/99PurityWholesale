import type { Metadata } from 'next';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminOrgsOverview } from '@/lib/portal/admin-ops/server';
import { adminCommissionOverview } from '@/lib/portal/aftersales/server';
import { DEFAULT_HOLD_DAYS, PAYOUT_METHODS, formatRate, usd } from '@/lib/portal/aftersales/model';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Field, Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import {
  accrueCommissionsAction, adjustCommissionAction, endReferralAction, enrollReferrerAction, linkReferralAction, payoutAction, savePlanAction, setPlanActiveAction,
} from '../aftersales-actions';

export const metadata: Metadata = { title: 'Commissions' };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/commissions', 'org.billing.read');
  const ctx = await getStaffAccessContext();
  const canWrite = evaluateCapability(ctx, 'financial.write').allowed;
  const [data, orgs] = await Promise.all([adminCommissionOverview(), adminOrgsOverview()]);
  const orgRows = orgs.ok ? orgs.data.organizations : [];
  const today = new Date().toISOString().slice(0, 10);
  const plans = data.ok ? data.data.plans : [];
  const activePlans = plans.filter((p) => p.active);
  const enrolledIds = new Set(data.ok ? data.data.codes.map((c) => c.organization_id) : []);
  return (
    <>
      <PortalPageHeader area="admin" title="Commissions" description="Referral plans, referral codes, accrual from paid invoices, and manual payouts." />
      <Flash sp={searchParams} stepUpNext="/admin/commissions" />
      {!data.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(data.code)}</p>}
      {data.ok && (
        <div className="space-y-4">
          <PortalCard title="Plans">
            {plans.length === 0 ? <p className="text-sm text-portal-muted">No plans yet. Create one to enrol referring organizations.</p> : (
              <ul className="divide-y divide-portal-border text-sm">
                {plans.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-portal-text">{p.name} <span className="portal-id text-xs">{p.code}</span> <span className="text-xs text-portal-muted">{formatRate(p.rate_bps)}, payable {p.hold_days} days after payment</span></span>
                    <span className="inline-flex items-center gap-2">
                      <PortalStatusPill label={p.active ? 'Active' : 'Retired'} tone={p.active ? 'success' : 'neutral'} />
                      {canWrite && (
                        <form action={setPlanActiveAction}>
                          <input type="hidden" name="planId" value={p.id} /><input type="hidden" name="active" value={p.active ? 'false' : 'true'} />
                          <button type="submit" className="portal-btn-quiet">{p.active ? 'Retire' : 'Reactivate'}</button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <form action={savePlanAction} className="mt-4 grid gap-3 border-t border-portal-border pt-4 sm:grid-cols-4">
                <p className="text-xs text-portal-muted sm:col-span-4">A plan cannot be edited after it is created (accruals keep the rate they were made with). Create a new plan to change terms. Needs a fresh authenticator code.</p>
                <Field label="Code"><input name="code" required maxLength={40} placeholder="standard_5" className={INPUT} /></Field>
                <Field label="Name"><input name="name" required maxLength={120} className={INPUT} /></Field>
                <Field label="Rate (% of wholesale value)"><input name="ratePercent" required inputMode="decimal" placeholder="5" className={INPUT} /></Field>
                <Field label="Hold (days)"><input name="holdDays" inputMode="numeric" defaultValue={String(DEFAULT_HOLD_DAYS)} className={INPUT} /></Field>
                <div className="sm:col-span-4"><button type="submit" className="portal-btn-quiet">Create plan (fresh code needed)</button></div>
              </form>
            )}
          </PortalCard>

          <PortalCard title="Referring organizations" actions={canWrite ? (
            <form action={accrueCommissionsAction}><button type="submit" className="portal-btn-quiet">Accrue from paid invoices</button></form>
          ) : undefined}>
            {data.data.codes.length === 0 ? <p className="text-sm text-portal-muted">No organization is enrolled yet.</p> : (
              <ul className="divide-y divide-portal-border text-sm">
                {data.data.codes.map((c) => (
                  <li key={c.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-portal-text">{c.organization_name} <span className="portal-id text-xs">{c.code}</span> <span className="text-xs text-portal-muted">plan {c.plan_code}, {c.referred_count} active referral{c.referred_count === 1 ? '' : 's'}</span></span>
                      <span className="text-xs text-portal-muted">available {usd(c.available_cents)}, pending {usd(c.pending_cents)}, paid out {usd(c.paid_out_cents)}</span>
                    </div>
                    {canWrite && (
                      <div className="mt-2 grid gap-3 lg:grid-cols-2">
                        <form action={payoutAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="organizationId" value={c.organization_id} />
                          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                          <Field label="Payout amount (USD)"><input name="amount" required inputMode="decimal" placeholder="100.00" className={`${INPUT} w-32`} /></Field>
                          <Field label="Method"><select name="method" className={INPUT} defaultValue="wire">{PAYOUT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
                          <Field label="Sent on"><input name="paidOn" type="date" required defaultValue={today} className={INPUT} /></Field>
                          <Field label="Reference"><input name="reference" maxLength={120} className={`${INPUT} w-36`} /></Field>
                          <button type="submit" className="portal-btn-quiet">Record payout (fresh code)</button>
                        </form>
                        <form action={adjustCommissionAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="organizationId" value={c.organization_id} />
                          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                          <Field label="Adjustment (USD, negative removes)"><input name="amount" required inputMode="decimal" placeholder="-25.00" className={`${INPUT} w-36`} /></Field>
                          <Field label="Reason"><input name="reason" required maxLength={300} className={`${INPUT} w-52`} /></Field>
                          <button type="submit" className="portal-btn-quiet">Adjust (fresh code)</button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && activePlans.length > 0 && (
              <form action={enrollReferrerAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-portal-border pt-4">
                <Field label="Enrol organization">
                  <select name="organizationId" required defaultValue="" className={INPUT}>
                    <option value="" disabled>Choose...</option>
                    {orgRows.filter((o) => !enrolledIds.has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
                  </select>
                </Field>
                <Field label="Plan"><select name="planId" required className={INPUT}>{activePlans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatRate(p.rate_bps)})</option>)}</select></Field>
                <button type="submit" className="portal-btn-quiet">Create referral code (fresh code needed)</button>
              </form>
            )}
            <p className="mt-3 text-xs text-portal-muted">Accrual is safe to repeat: each paid order invoice earns commission once. Only the wholesale lines of an invoice count. Commission is paid out manually, never more than the available balance.</p>
          </PortalCard>

          <PortalCard title="Referral links">
            {data.data.referrals.length === 0 ? <p className="text-sm text-portal-muted">No referred organizations yet.</p> : (
              <ul className="divide-y divide-portal-border text-sm">
                {data.data.referrals.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-portal-text">{r.referred_name} <span className="text-xs text-portal-muted">referred by {r.referrer_name} since {r.started_on}</span></span>
                    <span className="inline-flex items-center gap-2">
                      <PortalStatusPill label={r.status === 'active' ? 'Active' : 'Ended'} tone={r.status === 'active' ? 'success' : 'neutral'} />
                      {canWrite && r.status === 'active' && (
                        <form action={endReferralAction} className="inline-flex items-center gap-1">
                          <input type="hidden" name="id" value={r.id} />
                          <input name="reason" required maxLength={300} placeholder="Reason" aria-label={`Reason for ending the link to ${r.referred_name}`} className={`${INPUT} w-40`} />
                          <button type="submit" className="portal-btn-quiet">End (fresh code)</button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <form action={linkReferralAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-portal-border pt-4">
                <Field label="Referred organization"><select name="referredOrgId" required defaultValue="" className={INPUT}><option value="" disabled>Choose...</option>{orgRows.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}</select></Field>
                <Field label="Referral code the applicant gave"><input name="code" required maxLength={12} className={INPUT} autoCapitalize="characters" /></Field>
                <button type="submit" className="portal-btn-quiet">Link (fresh code needed)</button>
              </form>
            )}
          </PortalCard>

          <PortalCard title="Recent payouts">
            {data.data.payouts.length === 0 ? <p className="text-sm text-portal-muted">No payouts recorded yet.</p> : (
              <ul className="divide-y divide-portal-border text-sm">
                {data.data.payouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-portal-text">{p.organization_name} <span className="text-xs text-portal-muted">{p.paid_on} by {p.method}{p.reference ? `, ${p.reference}` : ''}</span></span>
                    <span className="font-semibold text-portal-text">{usd(p.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </PortalCard>
        </div>
      )}
    </>
  );
}
