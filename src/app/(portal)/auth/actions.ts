'use server';

import { redirect } from 'next/navigation';
import { createPortalServerClient } from '@/portal/db/server';
import { assertPortalEnabled } from '@/lib/portal/auth';
import { getSupabasePublicConfig } from '@/lib/portal/config';
import { PORTAL_LOGIN } from '@/lib/portal/paths';

/** Ends the session (revokes it with the auth server and clears the cookies), then returns to the sign-in page. */
export async function signOutAction(): Promise<void> {
  assertPortalEnabled();
  if (getSupabasePublicConfig().ok) {
    const supabase = createPortalServerClient();
    await supabase.auth.signOut();
  }
  redirect(PORTAL_LOGIN);
}
