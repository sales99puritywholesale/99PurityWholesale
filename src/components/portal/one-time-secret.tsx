'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * A form whose server action may return a secret that is shown ONCE (a new API key, a webhook signing key, a worker token). The secret travels only in the action's
 * response to this page: never in a URL, a cookie or the page source of a later visit. After the user navigates away it cannot be shown again.
 */
export type SecretState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'created'; secret: string; note: string };
export const IDLE: SecretState = { status: 'idle' };

function Submit({ label, quiet }: { label: string; quiet?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={quiet ? 'portal-btn-quiet' : 'portal-btn'}>
      {pending ? 'Working...' : label}
    </button>
  );
}

export function OneTimeSecretForm({ action, label, secretLabel, children, quiet = false, className = '' }: {
  action: (prev: SecretState, formData: FormData) => Promise<SecretState>;
  label: string;
  secretLabel: string;
  children?: ReactNode;
  quiet?: boolean;
  className?: string;
}) {
  const [state, formAction] = useFormState(action, IDLE);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Submit label={label} quiet={quiet} />
      </div>
      {state.status === 'error' && (
        <p role="alert" className="mt-3 rounded-lg border border-[#FECDCA] bg-portal-danger-soft px-3 py-2 text-sm text-portal-danger">{state.message}</p>
      )}
      {state.status === 'created' && (
        <div role="status" className="mt-3 rounded-lg border border-[#ABEFC6] bg-portal-success-soft p-3 text-sm text-portal-success">
          <p className="font-semibold">{secretLabel}</p>
          <p className="mt-1 break-all rounded bg-white px-2 py-1.5 font-portal-mono text-xs text-portal-text" data-testid="one-time-secret">{state.secret}</p>
          <p className="mt-2 text-xs">{state.note}</p>
        </div>
      )}
    </form>
  );
}
