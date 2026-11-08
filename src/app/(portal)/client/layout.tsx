import type { ReactNode } from 'react';
import { requireUser } from '@/lib/portal/auth';
import { CLIENT_NAV } from '@/lib/portal/nav';
import { PortalShell } from '@/components/portal/portal-shell';

/**
 * Customer area. P1 authorization: any signed-in user may see this EMPTY shell. There is no organization or staff data yet,
 * so nothing here is organization-specific and no business data is shown. Organization membership checks arrive with P2.
 */
export default async function ClientLayout({ children }: { children: ReactNode }) {
  const user = await requireUser('/client');
  return (
    <PortalShell area="client" items={CLIENT_NAV} email={user.email}>
      {children}
    </PortalShell>
  );
}
