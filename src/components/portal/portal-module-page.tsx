import { portalCopy, type AdminModuleKey, type ClientModuleKey } from '@/lib/portal/copy';
import { requireAdminAccess, requireUser } from '@/lib/portal/auth';
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

/** Admin placeholder. In P1 requireAdminAccess() always denies, so the body below is never rendered for anyone. */
export async function AdminModulePage({ moduleKey }: { moduleKey: AdminModuleKey }) {
  await requireAdminAccess();
  const m = portalCopy.admin.modules[moduleKey];
  return (
    <>
      <PortalPageHeader area="admin" title={m.title} description={m.description} />
      <PortalEmptyState title={m.empty} note={portalCopy.common.notConnectedNote} />
    </>
  );
}
