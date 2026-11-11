import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminOrgDetail } from '@/lib/portal/admin-ops/server';
import { ORG_STATUSES, ORG_STATUS_HINTS, ORG_STATUS_LABELS, termsLabel } from '@/lib/portal/admin-ops/model';
import { uuid } from '@/lib/portal/admin-ops/schemas';
import { formatCents } from '@/lib/portal/billing/invoices';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { Field, Flash, INPUT, one, type Sp } from '@/components/portal/commerce-ui';
import { memberAddAction, memberSetAction, setOrgStatusAction, setOrgTermsAction } from '../../ops-actions';

export const metadata: Metadata = { title: 'Organization' };

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: Sp }) {
  const path = `/admin/organizations/${params.id}`;
  await requireStaffCapability(path, 'org.read');
  if (!uuid.safeParse(params.id).success) notFound();
  const res = await adminOrgDetail(params.id);
  if (!res.ok) notFound();
  const d = res.data;
  const o = d.organization;
  const ctx = await getStaffAccessContext();
  const canManage = evaluateCapability(ctx, 'org.manage').allowed;
  const canMembers = evaluateCapability(ctx, 'members.manage').allowed;
  const hidden = <input type="hidden" name="organizationId" value={o.id} />;
  const active = d.members.filter((m) => m.status === 'active');
  return (
    <>
      <PortalPageHeader area="admin" title={o.name} description={`${o.code}, created ${dateOnly(o.created_at)}.`} crumbs={[{ label: 'Organizations', href: '/admin/organizations' }]} />
      <Flash sp={searchParams} stepUpNext={path} />
      {one(searchParams.note) === 'owner_pending' && <p role="note" className="mb-4 rounded-lg border border-[#FEDF89] bg-portal-warning-soft px-3 py-2 text-sm text-portal-warning">The organization was created. The contact does not have a confirmed account yet: once they have signed up, add them below as an owner.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <PortalCard title="Members" actions={<span className="text-xs text-portal-muted">{active.length} active</span>}>
            {!d.can_see_people && <p className="mb-2 text-xs text-portal-muted">Names and e-mail addresses are hidden for your role.</p>}
            <ul className="divide-y divide-portal-border text-sm">
              {d.members.map((m) => (
                <li key={m.user_id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-portal-text">{m.email ?? `User ${m.user_id.slice(0, 8)}`}{m.name ? ` (${m.name})` : ''} <span className="text-xs text-portal-muted">joined {dateOnly(m.joined)}</span></span>
                    <span className="inline-flex items-center gap-2"><PortalStatusPill label={m.role === 'owner' ? 'Owner' : 'Member'} tone={m.role === 'owner' ? 'info' : 'neutral'} />{m.status === 'removed' && <PortalStatusPill label="Removed" tone="danger" />}</span>
                  </div>
                  {canMembers && m.status === 'active' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <form action={memberSetAction}>{hidden}<input type="hidden" name="userId" value={m.user_id} /><input type="hidden" name="action" value="set_role" /><input type="hidden" name="role" value={m.role === 'owner' ? 'member' : 'owner'} /><button type="submit" className="portal-btn-quiet">Make {m.role === 'owner' ? 'member' : 'owner'} (fresh code needed)</button></form>
                      <form action={memberSetAction}>{hidden}<input type="hidden" name="userId" value={m.user_id} /><input type="hidden" name="action" value="remove" /><button type="submit" className="portal-btn-quiet">Remove (fresh code needed)</button></form>
                    </div>
                  )}
                </li>
              ))}
              {d.members.length === 0 && <li className="py-3 text-portal-muted">No members yet.</li>}
            </ul>
            {canMembers && (
              <form action={memberAddAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-portal-border pt-4">
                {hidden}
                <Field label="Add by e-mail (confirmed account)"><input name="email" type="email" required maxLength={254} className={`${INPUT} w-72`} /></Field>
                <Field label="Role"><select name="role" className={INPUT} defaultValue="member"><option value="member">Member</option><option value="owner">Owner</option></select></Field>
                <button type="submit" className="portal-btn-quiet">Add (fresh code needed)</button>
              </form>
            )}
          </PortalCard>
          <PortalCard title="Summary">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-portal-muted">Orders</dt><dd className="text-portal-text">{d.orders.count}{d.orders.last_at ? `, last ${dateOnly(d.orders.last_at)}` : ''}</dd></div>
              <div><dt className="text-xs text-portal-muted">Open fulfillment orders</dt><dd className="text-portal-text">{d.fulfillment_open}</dd></div>
              <div><dt className="text-xs text-portal-muted">Fulfillment setup</dt><dd className="text-portal-text">{d.onboarding ? `${d.onboarding.status === 'live' ? 'Live' : 'In setup'}, ${d.onboarding.approved} of 9 steps approved` : 'Not started'}</dd></div>
              {d.invoices && <div><dt className="text-xs text-portal-muted">Outstanding</dt><dd className="text-portal-text">{formatCents(d.invoices.outstanding_cents)} on {d.invoices.open_count} invoice{d.invoices.open_count === 1 ? '' : 's'}</dd></div>}
            </dl>
            <p className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link className="underline" href={`/admin/pricing/${o.id}`}>Catalog and pricing</Link>
              <Link className="underline" href={`/admin/fulfillment/${o.id}`}>Fulfillment setup</Link>
              <Link className="underline" href="/admin/orders">Orders</Link>
              <Link className="underline" href="/admin/invoices">Invoices</Link>
            </p>
          </PortalCard>
        </div>
        <div className="space-y-4">
          <PortalCard title="Status" actions={<PortalStatusPill label={ORG_STATUS_LABELS[o.status]} tone={o.status === 'active' ? 'success' : o.status === 'suspended' ? 'warning' : 'neutral'} />}>
            {canManage ? (
              <form action={setOrgStatusAction} className="space-y-3">
                {hidden}
                <Field label="Change status to">
                  <select name="status" className={INPUT} defaultValue={o.status === 'active' ? 'suspended' : 'active'}>
                    {ORG_STATUSES.filter((s) => s !== o.status).map((s) => <option key={s} value={s}>{ORG_STATUS_LABELS[s]}</option>)}
                  </select>
                </Field>
                <Field label="Reason (required, kept in the audit log)"><input name="reason" required maxLength={300} className={INPUT} /></Field>
                <ul className="space-y-1 text-xs text-portal-muted">{ORG_STATUSES.map((s) => <li key={s}><strong>{ORG_STATUS_LABELS[s]}:</strong> {ORG_STATUS_HINTS[s]}</li>)}</ul>
                <button type="submit" className="portal-btn-quiet">Change status (fresh code needed)</button>
              </form>
            ) : <p className="text-sm text-portal-muted">{ORG_STATUS_HINTS[o.status]}</p>}
          </PortalCard>
          <PortalCard title="Payment terms" actions={<span className="text-xs text-portal-muted">{termsLabel(o.payment_terms)}</span>}>
            {canManage ? (
              <form action={setOrgTermsAction} className="space-y-3">
                {hidden}
                <Field label="Terms">
                  <select name="terms" className={INPUT} defaultValue={o.payment_terms === 'prepay' ? 'prepay' : 'custom'}>
                    <option value="prepay">Prepay (due on receipt)</option>
                    <option value="custom">Net days (below)</option>
                  </select>
                </Field>
                <Field label="Days (for net terms)"><input name="days" inputMode="numeric" maxLength={3} defaultValue={o.payment_terms.replace(/[^0-9]/g, '') || '30'} className={INPUT} /></Field>
                <p className="text-xs text-portal-muted">Applies to invoices issued from now on; existing invoices keep their terms.</p>
                <button type="submit" className="portal-btn-quiet">Save terms (fresh code needed)</button>
              </form>
            ) : null}
          </PortalCard>
        </div>
      </div>
    </>
  );
}
