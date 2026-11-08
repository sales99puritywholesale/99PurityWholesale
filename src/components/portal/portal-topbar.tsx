import type { PortalNavItem } from '@/lib/portal/nav';
import { portalCopy } from '@/lib/portal/copy';
import { PortalAccountMenu } from './portal-account-menu';
import { PortalMobileNav } from './portal-mobile-nav';

type Props = { items: readonly PortalNavItem[]; area: 'client' | 'admin'; email: string | null };

/** Top bar: menu button on small screens, the area name, and the account menu ("Signed in as ..." and Sign out). */
export function PortalTopbar({ items, area, email }: Props) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-portal-border bg-portal-canvas px-4 py-3 sm:px-8">
      <PortalMobileNav items={items} area={area} />
      <p className="portal-eyebrow hidden sm:block">{portalCopy.brand.area[area]}</p>
      <div className="ml-auto">
        <PortalAccountMenu email={email} />
      </div>
    </header>
  );
}
