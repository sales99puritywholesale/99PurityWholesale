'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { mfaMessage } from '@/lib/portal/mfa/service';
import { beginEnrolmentAction, cancelEnrolmentAction, challengeAction, claimExistingFactorAction, confirmEnrolmentAction, restartEnrolmentAction, type CodeState, type EnrolState } from './actions';

const INPUT = 'w-full rounded-lg border border-portal-border bg-white px-3 py-2.5 text-center font-portal-mono text-lg tracking-[0.4em] text-portal-text outline-none focus:border-portal-accent-strong';

function Submit({ label, pending }: { label: string; pending: string }) {
  const { pending: busy } = useFormStatus();
  return <button type="submit" className="portal-btn w-full" disabled={busy}>{busy ? pending : label}</button>;
}

const ErrorLine = ({ code }: { code: string | null }) =>
  code ? <p role="alert" className="mt-3 rounded-lg border border-[#FECDCA] bg-portal-danger-soft px-3 py-2 text-sm text-portal-danger">{mfaMessage(code)}</p> : null;

function CodeField({ id }: { id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-portal-text">Six-digit code</label>
      <input id={id} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className={INPUT} />
    </div>
  );
}

/** Login verification (and step-up): one code field. The page that renders this never shows a secret. */
export function MfaChallengeForm({ next }: { next: string }) {
  const [state, action] = useFormState<CodeState, FormData>(challengeAction, { error: null });
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <CodeField id="code" />
      <ErrorLine code={state.error} />
      <Submit label="Verify" pending="Verifying..." />
    </form>
  );
}

/**
 * First-time authenticator setup: begin (shows the QR code once), then confirm with the first code. The QR code lives only in this component's state; cancelling removes the
 * unverified factor and signs out. The optional authorization code is the staff enrolment window issued with the administrator's invitation.
 */
export function MfaSetupForm({ next, windowId }: { next: string; windowId: string }) {
  const [enrol, begin] = useFormState<EnrolState, FormData>(beginEnrolmentAction, { status: 'idle' });
  const [state, confirm] = useFormState<CodeState, FormData>(confirmEnrolmentAction, { error: null });

  if (enrol.status !== 'ready') {
    return (
      <form action={begin} className="mt-6 space-y-4">
        <p className="text-sm text-portal-muted">You will scan a QR code with an authenticator app (for example Google Authenticator, 1Password or Authy), then enter the code it shows.</p>
        {enrol.status === 'error' && <ErrorLine code={enrol.code} />}
        <Submit label="Set up authenticator" pending="Preparing..." />
      </form>
    );
  }
  return (
    <div className="mt-6 space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-portal-muted">
        <li>Open your authenticator app and add an account by scanning this QR code.</li>
        <li>Enter the six-digit code the app shows for this account.</li>
      </ol>
      <div className="flex justify-center rounded-xl border border-portal-border bg-white p-3">
        {/* The QR code is an SVG data URI returned once by Supabase at enrolment; the secret itself is never shown or stored. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrol.qrCode} alt="QR code for your authenticator app" width={200} height={200} />
      </div>
      <form action={confirm} className="space-y-4" noValidate>
        <input type="hidden" name="factorId" value={enrol.factorId} />
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="windowId" className="mb-1 block text-sm font-medium text-portal-text">Authorization code <span className="font-normal text-portal-muted">(from your administrator invitation)</span></label>
          <input id="windowId" name="windowId" defaultValue={windowId} autoComplete="off" spellCheck={false} maxLength={36} className="w-full rounded-lg border border-portal-border bg-white px-3 py-2 font-portal-mono text-xs text-portal-text outline-none focus:border-portal-accent-strong" />
        </div>
        <CodeField id="setup-code" />
        <ErrorLine code={state.error} />
        <Submit label="Verify and activate" pending="Verifying..." />
      </form>
      <form action={cancelEnrolmentAction}>
        <input type="hidden" name="factorId" value={enrol.factorId} />
        <button type="submit" className="w-full text-center text-sm text-portal-muted underline hover:text-portal-text">Cancel setup and sign out</button>
      </form>
    </div>
  );
}

/** Start over: for an authenticator that was created before the administrator opened the setup window (so approval is always refused). Removes it and signs the person out. */
function StartOver() {
  const [state, action] = useFormState<CodeState, FormData>(restartEnrolmentAction, { error: null });
  return (
    <form action={action} className="mt-6 border-t border-portal-border pt-5" noValidate>
      <p className="text-sm font-medium text-portal-text">Approval keeps failing?</p>
      <p className="mt-1 text-sm text-portal-muted">
        An authenticator can only be approved if it was created <strong className="font-semibold">after</strong> your administrator opened your setup window. If you set it up earlier, remove it and start over: you will be signed out, then sign in again and
        scan the new QR code.
      </p>
      <ErrorLine code={state.error} />
      <div className="mt-3"><Submit label="Remove it and start over" pending="Removing..." /></div>
    </form>
  );
}

/** Recovery state: the authenticator is verified (the session is aal2) but not yet approved for staff access. */
export function MfaClaimForm({ next, windowId }: { next: string; windowId: string }) {
  const [state, action] = useFormState<CodeState, FormData>(claimExistingFactorAction, { error: null });
  return (
    <>
    <form action={action} className="mt-6 space-y-4" noValidate>
      <p className="text-sm text-portal-muted">Your authenticator is verified but not yet approved for staff access. Enter the authorization code from your administrator invitation.</p>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="claim-window" className="mb-1 block text-sm font-medium text-portal-text">Authorization code</label>
        <input id="claim-window" name="windowId" defaultValue={windowId} autoComplete="off" spellCheck={false} maxLength={36} required className="w-full rounded-lg border border-portal-border bg-white px-3 py-2 font-portal-mono text-xs text-portal-text outline-none focus:border-portal-accent-strong" />
      </div>
      <ErrorLine code={state.error} />
      <Submit label="Approve authenticator" pending="Approving..." />
    </form>
    <StartOver />
    </>
  );
}
