import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';

/** Shown instead of the admin shell. Contains no navigation, no data and no hints about what exists behind it. */
export function PortalAccessDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-portal-border bg-portal-card p-8 text-center">
        <p className="portal-eyebrow mb-2">{portalCopy.brand.name}</p>
        <h1 className="font-portal-heading text-2xl font-bold text-portal-text">{portalCopy.admin.denied.title}</h1>
        <p className="mt-3 text-sm text-portal-muted">{portalCopy.admin.denied.body}</p>
        <Link href="/client" prefetch={false} className="portal-btn mt-6">
          {portalCopy.common.backToPortal}
        </Link>
      </div>
    </main>
  );
}
