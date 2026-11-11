import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { portalCopy } from '@/lib/portal/copy';
import { assertPortalEnabled, requireUser } from '@/lib/portal/auth';
import { isDemoMode } from '@/lib/portal/demo/config';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { createPortalServerClient } from '@/portal/db/server';
import { createMfaApi } from '@/lib/portal/mfa/adapter';
import { UUID_PATTERN, assuranceState } from '@/lib/portal/mfa/service';
import { safeRedirectPath } from '@/lib/portal/validation';
import { PORTAL_LOGIN } from '@/lib/portal/paths';
import { MfaClaimForm, MfaSetupForm } from '../mfa-forms';

export const metadata: Metadata = { title: 'Set up your authenticator' };

type SearchParams = { next?: string | string[]; window?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * First-time authenticator setup for ACTIVE STAFF. A customer or anyone who is not staff is sent away. A user who already has a verified factor is sent to the challenge; a user whose
 * session is aal2 but whose authenticator is not yet approved for staff access sees the approval form. ?window=<uuid> pre-fills the enrolment authorization code (not a secret).
 */
export default async function MfaSetupPage({ searchParams }: { searchParams: SearchParams }) {
  assertPortalEnabled();
  if (isDemoMode()) redirect(PORTAL_LOGIN);
  const next = safeRedirectPath(first(searchParams.next) ?? '/admin');
  const rawWindow = first(searchParams.window) ?? '';
  const windowId = UUID_PATTERN.test(rawWindow) ? rawWindow : '';
  await requireUser('/login/mfa/setup');
  const ctx = await getStaffAccessContext();
  if (ctx.staffStatus !== 'active') redirect('/client');
  const state = await assuranceState(createMfaApi(createPortalServerClient().auth));
  if (state === 'needs_challenge') redirect(`/login/mfa?next=${encodeURIComponent(next)}`);
  if (state === 'satisfied' && ctx.dbSessionOk) redirect(next);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="portal-eyebrow mb-2">{portalCopy.login.eyebrow}</p>
          <h1 className="font-portal-heading text-4xl font-bold tracking-tight text-portal-text">{portalCopy.brand.name}</h1>
        </div>
        <div className="rounded-2xl border border-portal-border bg-portal-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-8">
          <h2 className="font-portal-heading text-xl font-semibold text-portal-text">Set up your authenticator</h2>
          <p className="mt-1 text-sm text-portal-muted">Staff accounts require a second factor. This takes about a minute.</p>
          {state === 'satisfied' ? <MfaClaimForm next={next} windowId={windowId} /> : <MfaSetupForm next={next} windowId={windowId} />}
        </div>
      </div>
    </main>
  );
}
