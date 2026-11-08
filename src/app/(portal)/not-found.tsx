import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';

export default function PortalNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-portal-border bg-portal-card p-8 text-center">
        <p className="portal-eyebrow mb-2">404</p>
        <h1 className="font-portal-heading text-2xl font-bold text-portal-text">{portalCopy.common.notFoundTitle}</h1>
        <p className="mt-3 text-sm text-portal-muted">{portalCopy.common.notFoundBody}</p>
        <Link href="/client" prefetch={false} className="portal-btn mt-6">
          {portalCopy.common.backToPortal}
        </Link>
      </div>
    </main>
  );
}
