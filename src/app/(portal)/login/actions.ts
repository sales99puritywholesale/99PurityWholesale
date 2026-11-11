'use server';

import { redirect } from 'next/navigation';
import { createPortalServerClient } from '@/portal/db/server';
import { assertPortalEnabled } from '@/lib/portal/auth';
import { getSupabasePublicConfig } from '@/lib/portal/config';
import { loginSchema, safeRedirectPath } from '@/lib/portal/validation';
import { PORTAL_LOGIN } from '@/lib/portal/paths';
import type { LoginErrorCode } from '@/lib/portal/copy';
import { cookies } from 'next/headers';
import { createMfaApi } from '@/lib/portal/mfa/adapter';
import { loginDestination } from '@/lib/portal/mfa/service';
import { DEMO_COOKIE, isDemoMode, personaById } from '@/lib/portal/demo/config';

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

  // Second factor: a verified authenticator means a challenge; an active staff member without one is sent to setup. Customers without a factor continue unchanged.
  const { data: staff } = await supabase.rpc('rpc_my_staff_context');
  const s = (staff as { staff_status?: unknown } | null)?.staff_status;
  redirect(await loginDestination({ api: createMfaApi(supabase.auth), staffStatus: s === 'active' || s === 'disabled' ? s : 'none', next }));
}

/** Demo mode only: signs in as one of the fixed demo personas (no password, no database). Refused outside demo mode, which cannot exist in a production build. */
export async function demoSignInAction(formData: FormData): Promise<void> {
  assertPortalEnabled();
  if (!isDemoMode()) redirect(PORTAL_LOGIN);
  const persona = personaById(String(formData.get('persona') ?? ''));
  if (!persona) redirect(PORTAL_LOGIN);
  const next = safeRedirectPath(formData.get('next'));
  cookies().set(DEMO_COOKIE, persona.id, { httpOnly: true, sameSite: 'lax', path: '/', secure: false });
  redirect(persona.kind === 'admin' && (next === '/client' || next === '/') ? '/admin' : next);
}

/** Demo mode only: restores the seeded demo data (orders, carts, prices and rules created during the demo are discarded). */
export async function demoResetAction(): Promise<void> {
  assertPortalEnabled();
  if (!isDemoMode()) redirect(PORTAL_LOGIN);
  (await import('@/lib/portal/demo/file-store')).resetDemoState();
  cookies().delete(DEMO_COOKIE);
  redirect(PORTAL_LOGIN);
}
