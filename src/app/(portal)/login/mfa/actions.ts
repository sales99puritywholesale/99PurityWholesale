'use server';

import { redirect } from 'next/navigation';
import { assertPortalEnabled, requireUser } from '@/lib/portal/auth';
import { isDemoMode } from '@/lib/portal/demo/config';
import { createPortalServerClient } from '@/portal/db/server';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { createMfaApi } from '@/lib/portal/mfa/adapter';
import { UUID_PATTERN, cancelEnrolment, claimFactor, confirmEnrolment, isVerifiedTotp, removeSoleVerifiedFactor, startEnrolment, verifyChallenge, type MfaErrorCode } from '@/lib/portal/mfa/service';
import { safeRedirectPath } from '@/lib/portal/validation';
import { PORTAL_LOGIN } from '@/lib/portal/paths';

/**
 * Server actions of the authenticator (TOTP) flows. They use the signed-in user's own SSR session (Supabase Auth MFA API); no service role, no secret is read, stored, logged or returned
 * (the QR code image is returned once at enrolment, nothing else). Enrolment is for ACTIVE STAFF only; the challenge works for anyone who has a verified factor. These actions never grant
 * access by themselves: staff access still requires the database's own staff session check (aal2 + an APPROVED factor) and capabilities.
 */
export type EnrolState = { status: 'idle' } | { status: 'ready'; factorId: string; qrCode: string } | { status: 'error'; code: MfaErrorCode };
export type CodeState = { error: MfaErrorCode | null };
const text = (fd: FormData, k: string) => String(fd.get(k) ?? '');

async function gate(next: string): Promise<void> {
  assertPortalEnabled();
  if (isDemoMode()) redirect(PORTAL_LOGIN);
  await requireUser(next);
}

export async function beginEnrolmentAction(_prev: EnrolState, _formData: FormData): Promise<EnrolState> {
  await gate('/login/mfa/setup');
  const ctx = await getStaffAccessContext();
  if (ctx.staffStatus !== 'active') return { status: 'error', code: 'not_allowed' };
  const r = await startEnrolment(createMfaApi(createPortalServerClient().auth), { issuer: '99 Purity Wholesale', nowMs: Date.now() });
  return r.ok ? { status: 'ready', factorId: r.factorId, qrCode: r.qrCode } : { status: 'error', code: r.code };
}

export async function confirmEnrolmentAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const next = safeRedirectPath(formData.get('next'));
  await gate('/login/mfa/setup');
  const factorId = text(formData, 'factorId');
  if (!UUID_PATTERN.test(factorId)) return { error: 'failed' };
  const supabase = createPortalServerClient();
  const confirmed = await confirmEnrolment(createMfaApi(supabase.auth), factorId, formData.get('code'));
  if (!confirmed.ok) return { error: confirmed.code };
  // The session is now aal2. For a bootstrapped administrator, bind this factor to the open enrolment window (the database checks it).
  const windowId = text(formData, 'windowId').trim();
  if (windowId) {
    if (!UUID_PATTERN.test(windowId)) return { error: 'approval_rejected' };
    const claimed = await claimFactor(async (fn, args) => { const r = await supabase.rpc(fn, args); return { data: r.data, error: r.error }; }, windowId, factorId);
    if (!claimed.ok) return { error: claimed.code };
  }
  redirect(next);
}

/** Cancels an enrolment in progress (removes the unverified factor), ends the session and returns to sign-in. */
export async function cancelEnrolmentAction(formData: FormData): Promise<void> {
  assertPortalEnabled();
  if (isDemoMode()) redirect(PORTAL_LOGIN);
  const factorId = text(formData, 'factorId');
  const supabase = createPortalServerClient();
  if (UUID_PATTERN.test(factorId)) await cancelEnrolment(createMfaApi(supabase.auth), factorId);
  await supabase.auth.signOut();
  redirect(PORTAL_LOGIN);
}

/** Login challenge and step-up: verify a six-digit code. Success promotes the session to aal2 (or refreshes the TOTP time for a step-up). */
export async function challengeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const next = safeRedirectPath(formData.get('next'));
  await gate('/login/mfa');
  const r = await verifyChallenge(createMfaApi(createPortalServerClient().auth), formData.get('code'));
  if (!r.ok) return { error: r.code };
  redirect(next);
}

export async function mfaSignOutAction(): Promise<void> {
  assertPortalEnabled();
  if (!isDemoMode()) await createPortalServerClient().auth.signOut();
  redirect(PORTAL_LOGIN);
}

/** Approves an already VERIFIED authenticator for staff access with the enrolment authorization code (the recovery path when setup was interrupted before the approval step). */
export async function claimExistingFactorAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const next = safeRedirectPath(formData.get('next'));
  await gate('/login/mfa/setup');
  const ctx = await getStaffAccessContext();
  if (ctx.staffStatus !== 'active') return { error: 'not_allowed' };
  const windowId = text(formData, 'windowId').trim();
  if (!UUID_PATTERN.test(windowId)) return { error: 'approval_rejected' };
  const supabase = createPortalServerClient();
  const listed = await createMfaApi(supabase.auth).listFactors();
  const factor = listed.factors.find(isVerifiedTotp);
  if (listed.error || !factor) return { error: 'no_factor' };
  const claimed = await claimFactor(async (fn, args) => { const r = await supabase.rpc(fn, args); return { data: r.data, error: r.error }; }, windowId, factor.id);
  if (!claimed.ok) return { error: claimed.code };
  redirect(next);
}

/**
 * "Start over" for a staff member whose authenticator is verified but can no longer be approved (it was created before the setup window opened). Removes it, signs the person out and
 * returns to sign-in; the next sign-in creates a new authenticator inside the window. Never for administrators, and only with exactly one verified authenticator.
 */
export async function restartEnrolmentAction(_prev: CodeState, _formData: FormData): Promise<CodeState> {
  await gate('/login/mfa/setup');
  const ctx = await getStaffAccessContext();
  if (ctx.staffStatus !== 'active' || ctx.dbSessionOk || ctx.roles.includes('admin')) return { error: 'not_allowed' };
  const supabase = createPortalServerClient();
  const r = await removeSoleVerifiedFactor(createMfaApi(supabase.auth));
  if (!r.ok) return { error: r.code };
  await supabase.auth.signOut();
  redirect(PORTAL_LOGIN);
}
