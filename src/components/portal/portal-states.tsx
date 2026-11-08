'use client';

import { portalCopy } from '@/lib/portal/copy';

/** Loading skeleton. Static (no motion) so it respects reduced-motion preferences without extra code. */
export function PortalLoadingState() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{portalCopy.common.loading}</span>
      <div className="h-8 w-56 rounded-lg bg-portal-border" />
      <div className="h-4 w-80 max-w-full rounded bg-portal-border" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-2xl bg-portal-border" />
        <div className="h-28 rounded-2xl bg-portal-border" />
      </div>
    </div>
  );
}

/** Error boundary body. Never prints error details: they can contain internal information. */
export function PortalErrorState({ reset }: { reset?: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-portal-border bg-portal-card p-8 text-center">
      <h1 className="font-portal-heading text-2xl font-semibold text-portal-text">{portalCopy.common.errorTitle}</h1>
      <p className="mt-2 text-sm text-portal-muted">{portalCopy.common.errorBody}</p>
      {reset && (
        <button type="button" onClick={reset} className="portal-btn mt-5">
          {portalCopy.common.retry}
        </button>
      )}
    </div>
  );
}
