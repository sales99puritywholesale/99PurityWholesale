import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { portalCopy } from '@/lib/portal/copy';
import { assertPortalEnabled, requireUser } from '@/lib/portal/auth';
import { isDemoMode } from '@/lib/portal/demo/config';
import { createPortalServerClient } from '@/portal/db/server';
import { createMfaApi } from '@/lib/portal/mfa/adapter';
import { assuranceState } from '@/lib/portal/mfa/service';
import { safeRedirectPath } from '@/lib/portal/validation';
import { PORTAL_LOGIN } from '@/lib/portal/paths';
import { MfaChallengeForm } from './mfa-forms';
import { mfaSignOutAction } from './actions';

export const metadata: Metadata = { title: 'Verify your identity' };

type SearchParams = { next?: string | string[]; stepup?: string | string[]; window?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Authenticator challenge. Reached after the password step when a verified factor exists, and for a step-up (?stepup=1) before sensitive changes.
 * A session that is already aal2 continues (unless this is a step-up); a user with no factor is sent to setup. The page shows no secret.
 */
export default async function MfaChallengePage({ searchParams }: { searchParams: SearchParams }) {
  assertPortalEnabled();
  if (isDemoMode()) redirect(PORTAL_LOGIN);
  const next = safeRedirectPath(first(searchParams.next));
  const stepUp = first(searchParams.stepup) === '1';
  await requireUser('/login/mfa');
  const state = await assuranceState(createMfaApi(createPortalServerClient().auth));
  if (state === 'satisfied' && !stepUp) redirect(next);
  if (state === 'no_factor') redirect(`/login/mfa/setup?next=${encodeURIComponent(next)}`);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="portal-eyebrow mb-2">{portalCopy.login.eyebrow}</p>
          <h1 className="font-portal-heading text-4xl font-bold tracking-tight text-portal-text">{portalCopy.brand.name}</h1>
        </div>
        <div className="rounded-2xl border border-portal-border bg-portal-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-8">
          <h2 className="font-portal-heading text-xl font-semibold text-portal-text">{stepUp ? 'Confirm this change' : 'Verify your identity'}</h2>
          <p className="mt-1 text-sm text-portal-muted">Enter the six-digit code from your authenticator app.</p>
          {state === 'unknown' && <p role="alert" className="mt-4 rounded-lg border border-[#FECDCA] bg-portal-danger-soft px-3 py-2 text-sm text-portal-danger">Your session could not be checked. Sign out and sign in again.</p>}
          <MfaChallengeForm next={next} />
          <form action={mfaSignOutAction} className="mt-4 text-center">
            <button type="submit" className="text-sm text-portal-muted underline hover:text-portal-text">Cancel and sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}
