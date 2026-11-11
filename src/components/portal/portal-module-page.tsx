import { portalCopy, type AdminModuleKey, type ClientModuleKey } from '@/lib/portal/copy';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateAdminAccess } from '@/lib/portal/permissions/evaluate';
import { PortalPageHeader } from './portal-page-header';
import { PortalEmptyState } from './portal-empty-state';
import { PortalStatusPill } from './portal-status';

/**
 * Placeholder page for a customer module that is not implemented yet. It performs its OWN authentication check (layouts
 * do not protect child pages in the App Router) and shows only static text: no data, no actions.
 */
export async function ClientModulePage({ moduleKey, href }: { moduleKey: ClientModuleKey; href: string }) {
  await requireUser(href);
  const m = portalCopy.client.modules[moduleKey];
  return (
    <>
      <PortalPageHeader area="client" title={m.title} description={m.description} />
      <div className="mb-4">
        <PortalStatusPill label={portalCopy.common.notConnected} tone="warning" />
      </div>
      <PortalEmptyState title={m.empty} note={portalCopy.common.notConnectedNote} />
    </>
  );
}

/**
 * Admin placeholder for a module that is not implemented yet (static text only: no data, no actions). It re-checks the verified staff session itself (the database's own answer: active
 * staff, aal2, approved authenticator), the same condition as the admin layout, because layouts do not protect child pages. Anything else answers "not found" (fail closed).
 */
export async function AdminModulePage({ moduleKey }: { moduleKey: AdminModuleKey }) {
  await requireUser('/admin');
  if (!evaluateAdminAccess(await getStaffAccessContext()).allowed) notFound();
  const m = portalCopy.admin.modules[moduleKey];
  return (
    <>
      <PortalPageHeader area="admin" title={m.title} description={m.description} />
      <PortalEmptyState title={m.empty} note={portalCopy.common.notConnectedNote} />
    </>
  );
}
