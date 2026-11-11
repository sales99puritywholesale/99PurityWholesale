import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminGatesList } from '@/lib/portal/onboarding/server';
import { GATE_TITLES, type GateCode } from '@/lib/portal/onboarding/steps';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Field, Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import { recordGateAction } from '../../onboarding-actions';

export const metadata: Metadata = { title: 'Compliance gates' };

/** The six compliance gates (SECURITY-ASSESSMENT). A gate is a recorded fact (with a note naming the evidence); go-live and label approval depend on them. */
export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/fulfillment/gates', 'gates.read');
  const res = await adminGatesList();
  const canWrite = evaluateCapability(await getStaffAccessContext(), 'gates.write').allowed;
  return (
    <>
      <PortalPageHeader area="admin" title="Compliance gates" description="Recorded approvals that must exist before labels are approved and organizations go live." crumbs={[{ label: 'Fulfillment', href: '/admin/fulfillment' }]} />
      <Flash sp={searchParams} stepUpNext="/admin/fulfillment/gates" />
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(res.code)}</p>}
      <div className="space-y-4">
        {(res.ok ? res.data.gates : []).map((g) => (
          <PortalCard key={g.code} eyebrow={g.code} title={GATE_TITLES[g.code as GateCode] ?? g.code} actions={<PortalStatusPill label={g.status === 'recorded' ? 'Recorded' : g.status === 'revoked' ? 'Revoked' : 'Not recorded'} tone={g.status === 'recorded' ? 'success' : g.status === 'revoked' ? 'danger' : 'warning'} />}>
            {g.note && <p className="mb-3 text-sm text-portal-text">{g.note}{g.recorded_at ? <span className="text-xs text-portal-muted"> ({g.recorded_at.slice(0, 10)})</span> : null}</p>}
            {canWrite ? (
              <form action={recordGateAction} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <input type="hidden" name="code" value={g.code} />
                <Field label="Evidence or note (required)"><input name="note" required maxLength={500} className={INPUT} /></Field>
                <button name="status" value="recorded" type="submit" className="portal-btn">Record (fresh code needed)</button>
                <button name="status" value="revoked" type="submit" className="portal-btn-quiet">Revoke</button>
              </form>
            ) : (
              <p className="text-sm text-portal-muted">Your role can read gates but not record them.</p>
            )}
          </PortalCard>
        ))}
      </div>
      <p className="mt-4 text-xs text-portal-muted"><Link href="/admin/fulfillment" className="underline">Back to onboarding</Link></p>
    </>
  );
}
