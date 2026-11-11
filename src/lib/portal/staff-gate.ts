import 'server-only';
import { notFound } from 'next/navigation';
import { requireUser, type PortalUser } from './auth';
import { getStaffAccessContext } from './staff-access';
import { evaluateAnyCapability } from './permissions/evaluate';
import type { CapabilityCode } from './permissions/capabilities';

/**
 * Page and action gate for staff screens (P3): requires a signed-in user whose staff context (read from the database with the user's own session)
 * holds ANY of the given capabilities. Anything else answers as "not found" (the same fail-closed answer the admin area already gives).
 * Defence in depth only: every RPC re-checks the capability, the verified staff session and (where required) a fresh step-up in the database.
 */
export async function requireStaffCapability(nextPath: string, ...capabilities: readonly CapabilityCode[]): Promise<PortalUser> {
  const user = await requireUser(nextPath);
  const ctx = await getStaffAccessContext();
  if (!evaluateAnyCapability(ctx, capabilities).allowed) notFound();
  return user;
}
