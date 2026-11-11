'use server';

import { redirect } from 'next/navigation';
import { createPortalServerClient } from '@/portal/db/server';
import { assertPortalEnabled } from '@/lib/portal/auth';
import { getSupabasePublicConfig } from '@/lib/portal/config';
import { PORTAL_LOGIN } from '@/lib/portal/paths';
import { cookies } from 'next/headers';
import { DEMO_COOKIE, isDemoMode } from '@/lib/portal/demo/config';

/** Ends the session (revokes it with the auth server and clears the cookies), then returns to the sign-in page. */
export async function signOutAction(): Promise<void> {
  assertPortalEnabled();
  if (isDemoMode()) {
    cookies().delete(DEMO_COOKIE);
    redirect(PORTAL_LOGIN);
  }
  if (getSupabasePublicConfig().ok) {
    const supabase = createPortalServerClient();
    await supabase.auth.signOut();
  }
  redirect(PORTAL_LOGIN);
}
