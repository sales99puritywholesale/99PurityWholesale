import type { ReactNode } from 'react';
import type { PortalNavItem } from '@/lib/portal/nav';
import { portalCopy } from '@/lib/portal/copy';
import { PortalSidebar } from './portal-sidebar';
import { PortalTopbar } from './portal-topbar';

type Props = { area: 'client' | 'admin'; items: readonly PortalNavItem[]; email: string | null; children: ReactNode };

/** Page frame shared by both areas: dark sidebar, light canvas, sticky top bar, one consistent content container. */
export function PortalShell({ area, items, email, children }: Props) {
  return (
    <div className="flex min-h-screen">
      <a href="#portal-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-portal-card focus:px-4 focus:py-2 focus:text-sm">
        {portalCopy.common.skipToContent}
      </a>
      <PortalSidebar items={items} area={area} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PortalTopbar items={items} area={area} email={email} />
        <main id="portal-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
