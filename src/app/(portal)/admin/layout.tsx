import type { ReactNode } from 'react';
import { authorizeAdmin, requireUser } from '@/lib/portal/auth';
import { ADMIN_NAV } from '@/lib/portal/nav';
import { PortalShell } from '@/components/portal/portal-shell';
import { PortalAccessDenied } from '@/components/portal/portal-access-denied';

/**
 * Admin area. In P1 NO ONE is authorized (see authorizeAdmin): the shell and the children are never rendered; every page
 * additionally calls requireAdminAccess() because layouts do not protect child pages. The shell below becomes reachable
 * only when P2 implements staff authorization in the database.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser('/admin');
  if (!authorizeAdmin(user).allowed) return <PortalAccessDenied />;
  return (
    <PortalShell area="admin" items={ADMIN_NAV} email={user.email}>
      {children}
    </PortalShell>
  );
}
