import { portalCopy } from '@/lib/portal/copy';
import { signOutAction } from '@/app/(portal)/auth/actions';

/**
 * Account menu: shows who is signed in and offers Sign out. A native <details> element keeps it keyboard accessible and
 * working without client JavaScript. Sign out is a Server Action (same-origin enforced by Next.js).
 */
export function PortalAccountMenu({ email }: { email: string | null }) {
  const label = email ?? 'account';
  return (
    <details className="group relative">
      <summary
        aria-label={portalCopy.common.accountMenu}
        className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-portal-border bg-portal-card px-3 py-1.5 text-sm text-portal-text hover:bg-portal-canvas [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-portal-sidebar font-portal-heading text-xs font-bold text-portal-accent">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[16rem] truncate sm:inline">
          <span className="text-portal-muted">{portalCopy.common.signedInAs} </span>
          <span className="font-medium">{label}</span>
        </span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-portal-border bg-portal-card p-2 shadow-lg">
        <p className="truncate px-3 py-2 text-xs text-portal-muted">
          {portalCopy.common.signedInAs} <span className="font-medium text-portal-text">{label}</span>
        </p>
        <form action={signOutAction}>
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-portal-text hover:bg-portal-canvas">
            {portalCopy.common.signOut}
          </button>
        </form>
      </div>
    </details>
  );
}
