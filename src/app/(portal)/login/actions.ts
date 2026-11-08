'use server';

import { redirect } from 'next/navigation';
import { createPortalServerClient } from '@/portal/db/server';
import { assertPortalEnabled } from '@/lib/portal/auth';
import { getSupabasePublicConfig } from '@/lib/portal/config';
import { loginSchema, safeRedirectPath } from '@/lib/portal/validation';
import { PORTAL_LOGIN } from '@/lib/portal/paths';
import type { LoginErrorCode } from '@/lib/portal/copy';

function back(code: LoginErrorCode, next: string): never {
  redirect(`${PORTAL_LOGIN}?error=${code}&next=${encodeURIComponent(next)}`);
}

/**
 * Email + password sign-in. Server Action (Next.js enforces same-origin for actions).
 * - Input is validated with zod; the destination is validated with safeRedirectPath (no open redirect).
 * - Failures are generic ("email or password is incorrect"): no account enumeration, no raw provider messages.
 * - No sign-up path exists: accounts are created by invitation or approved application (later milestones).
 * NOTE: rate limiting for this action is planned with the P2 foundation (database rate limits); until then the auth
 * provider's own limits apply.
 */
export async function signInAction(formData: FormData): Promise<void> {
  assertPortalEnabled();
  const next = safeRedirectPath(formData.get('next'));
  if (!getSupabasePublicConfig().ok) back('unavailable', next);

  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) back('invalid_input', next);

  const supabase = createPortalServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) back(error.status === 429 ? 'rate_limited' : 'invalid_credentials', next);

  redirect(next);
}
