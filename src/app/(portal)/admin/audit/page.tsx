import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminAuditList } from '@/lib/portal/admin-ops/server';
import { AUDIT_FILTERS, isAuditPrefix } from '@/lib/portal/admin-ops/model';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: 'Audit log' };

/** Read-only view of the append-only audit log: who did what, to which record, with which outcome. Denied attempts are recorded too. */
export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/audit', 'audit.read');
  const raw = one(searchParams.prefix) ?? '';
  const prefix = isAuditPrefix(raw) ? raw : '';
  const res = await adminAuditList(prefix === '' ? null : prefix, null);
  const events = res.ok ? res.data.events : [];
  return (
    <>
      <PortalPageHeader area="admin" title="Audit log" description="Every sensitive action, by staff and customers. Entries cannot be changed or deleted." />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter by action">
        {AUDIT_FILTERS.map((f) => <Link key={f.prefix || 'all'} href={f.prefix ? `/admin/audit?prefix=${encodeURIComponent(f.prefix)}` : '/admin/audit'} className={prefix === f.prefix ? 'portal-btn' : 'portal-btn-quiet'}>{f.label}</Link>)}
      </nav>
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(res.code)}</p>}
      <PortalCard title={`Latest ${events.length} events`}>
        {events.length === 0 ? <p className="text-sm text-portal-muted">No events match.</p> : (
          <ul className="divide-y divide-portal-border text-xs text-portal-text">
            {events.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-portal-muted">{e.occurred_at.slice(0, 19).replace('T', ' ')}</span>
                  <span className="font-semibold">{e.action}</span>
                  <PortalStatusPill label={e.outcome} tone={e.outcome === 'success' ? 'success' : e.outcome === 'denied' ? 'warning' : 'danger'} />
                  <span className="text-portal-muted">{e.actor_kind}{e.actor_roles.length ? ` (${e.actor_roles.join(', ')})` : ''}</span>
                  {e.organization_name && <span>{e.organization_name}</span>}
                  {e.subject_type && <span className="text-portal-muted">{e.subject_type}{e.subject_id ? ` ${e.subject_id.slice(0, 13)}` : ''}</span>}
                </div>
                {Object.keys(e.detail).length > 0 && <p className="mt-1 break-all font-portal-mono text-[11px] text-portal-muted">{JSON.stringify(e.detail)}</p>}
              </li>
            ))}
          </ul>
        )}
      </PortalCard>
    </>
  );
}
