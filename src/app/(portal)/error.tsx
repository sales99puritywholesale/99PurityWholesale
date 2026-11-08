'use client';

import { PortalErrorState } from '@/components/portal/portal-states';

// Segment error boundary for the portal. Never renders error.message (it may contain internal details).
export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="px-4 py-16">
      <PortalErrorState reset={reset} />
    </main>
  );
}
