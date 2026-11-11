import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminApplicationsList } from '@/lib/portal/admin-ops/server';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, suggestOrgCode, type ApplicationStatus } from '@/lib/portal/admin-ops/model';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalEmptyState } from '@/components/portal/portal-empty-state';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { Field, Flash, INPUT, one, type Sp } from '@/components/portal/commerce-ui';
import { createApplicationAction, reviewApplicationAction } from '../ops-actions';

export const metadata: Metadata = { title: portalCopy.admin.modules.applications.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/applications', 'applications.read.basic');
  const t = portalCopy.admin.modules.applications;
  const raw = one(searchParams.status);
  const status: ApplicationStatus | null = raw === 'all' ? null : (APPLICATION_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as ApplicationStatus) : 'new';
  const res = await adminApplicationsList(status);
  const canReview = evaluateCapability(await getStaffAccessContext(), 'applications.review').allowed;
  const rows = res.ok ? res.data.applications : [];
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <Flash sp={searchParams} stepUpNext="/admin/applications" />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter by status">
        {APPLICATION_STATUSES.map((s) => <Link key={s} href={`/admin/applications?status=${s}`} className={status === s ? 'portal-btn' : 'portal-btn-quiet'}>{APPLICATION_STATUS_LABELS[s]}</Link>)}
        <Link href="/admin/applications?status=all" className={status === null ? 'portal-btn' : 'portal-btn-quiet'}>All</Link>
      </nav>
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(res.code)}</p>}
      <div className="space-y-4">
        {rows.length === 0 && res.ok && <PortalEmptyState title="No applications" description={status === 'new' ? 'No applications are waiting for review.' : 'No applications match this filter.'} />}
        {rows.map((a) => (
          <PortalCard key={a.id} title={a.company_name} actions={<PortalStatusPill label={APPLICATION_STATUS_LABELS[a.status]} tone={a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'danger' : 'warning'} />}>
            <p className="text-xs text-portal-muted">Received {dateOnly(a.created_at)}{a.reviewed_at ? `, reviewed ${dateOnly(a.reviewed_at)}` : ''}</p>
            {res.ok && res.data.can_see_contact ? (
              <p className="mt-2 text-sm text-portal-text">{a.contact_name}, {a.contact_email}{a.phone ? `, ${a.phone}` : ''}{a.website ? `, ${a.website}` : ''}</p>
            ) : <p className="mt-2 text-xs text-portal-muted">Contact details are hidden for your role.</p>}
            {a.message && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-portal-canvas p-3 text-sm text-portal-text">{a.message}</p>}
            {a.review_note && <p className="mt-2 text-xs text-portal-muted">Note: {a.review_note}</p>}
            {a.organization_id && <p className="mt-2 text-sm"><Link className="underline" href={`/admin/organizations/${a.organization_id}`}>Open the organization</Link></p>}
            {canReview && a.status === 'new' && (
              <div className="mt-4 grid gap-4 border-t border-portal-border pt-4 lg:grid-cols-2">
                <form action={reviewApplicationAction} className="space-y-3">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <Field label="Organization code (letters, digits, dashes)"><input name="orgCode" required maxLength={20} defaultValue={suggestOrgCode(a.company_name)} className={INPUT} /></Field>
                  <Field label="Note (optional)"><input name="note" maxLength={300} className={INPUT} /></Field>
                  <p className="text-xs text-portal-muted">Creates the organization on prepay terms. If the contact already has a confirmed account they become its owner.</p>
                  <button type="submit" className="portal-btn">Approve (fresh code needed)</button>
                </form>
                <form action={reviewApplicationAction} className="space-y-3">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <Field label="Reason (required)"><input name="note" required maxLength={300} className={INPUT} /></Field>
                  <button type="submit" className="portal-btn-quiet">Reject (fresh code needed)</button>
                </form>
              </div>
            )}
          </PortalCard>
        ))}
        {canReview && (
          <PortalCard title="Add an application">
            <p className="mb-3 text-xs text-portal-muted">Record a request that arrived by e-mail, phone or the public site. A public sign-up form is not part of this release.</p>
            <form action={createApplicationAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Company"><input name="company" required maxLength={200} className={INPUT} /></Field>
              <Field label="Contact name"><input name="contactName" required maxLength={120} className={INPUT} /></Field>
              <Field label="Contact e-mail"><input name="contactEmail" type="email" required maxLength={254} className={INPUT} /></Field>
              <Field label="Phone (optional)"><input name="phone" maxLength={40} className={INPUT} /></Field>
              <Field label="Website (optional)"><input name="website" maxLength={200} className={INPUT} /></Field>
              <div className="sm:col-span-2"><Field label="Message (optional)"><textarea name="message" rows={3} maxLength={2000} className={INPUT} /></Field></div>
              <div className="sm:col-span-2"><button type="submit" className="portal-btn-quiet">Add application</button></div>
            </form>
          </PortalCard>
        )}
      </div>
    </>
  );
}
