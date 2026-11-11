import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateAdminAccess } from '@/lib/portal/permissions/evaluate';
import { filterAdminNav } from '@/lib/portal/permissions/admin-nav';
import { ADMIN_NAV } from '@/lib/portal/nav';
import { PortalShell } from '@/components/portal/portal-shell';
import { PortalAccessDenied } from '@/components/portal/portal-access-denied';
import { isDemoMode } from '@/lib/portal/demo/config';
import { createPortalServerClient } from '@/portal/db/server';
import { createMfaApi } from '@/lib/portal/mfa/adapter';
import { assuranceState } from '@/lib/portal/mfa/service';

/**
 * Admin area (P3). The edge only requires a session; HERE the staff context is read from the database with the user's own session
 * (public.rpc_my_staff_context): a verified staff session (aal2, approved factor) is required to see the shell, and the navigation shows only what the
 * staff member's capabilities allow (cosmetic). Layouts do not protect child pages, so every admin page re-checks (requireStaffCapability / requireAdminAccess),
 * and every RPC re-checks in the database.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser('/admin');
  const ctx = await getStaffAccessContext();
  if (!evaluateAdminAccess(ctx).allowed) {
    // An ACTIVE staff member whose session is not yet aal2 is sent to the authenticator challenge (or setup): the page that reaches aal2. An aal2 session that the database still
    // refuses (authenticator not approved for staff access) is NOT redirected (no loop): it sees the access-denied page.
    if (!isDemoMode() && ctx.staffStatus === 'active' && !ctx.dbSessionOk && (await assuranceState(createMfaApi(createPortalServerClient().auth))) !== 'satisfied') redirect('/login/mfa?next=/admin');
    return <PortalAccessDenied />;
  }
  return (
    <PortalShell area="admin" items={filterAdminNav(ctx, ADMIN_NAV)} email={user.email}>
      {children}
    </PortalShell>
  );
}
