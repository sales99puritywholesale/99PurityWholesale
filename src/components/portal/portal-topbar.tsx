import type { PortalNavItem } from '@/lib/portal/nav';
import { PortalAccountMenu } from './portal-account-menu';
import { PortalMobileNav } from './portal-mobile-nav';
import { PortalNotifications } from './portal-notifications';
import { PortalSearch } from './portal-search';

type Props = { items: readonly PortalNavItem[]; area: 'client' | 'admin'; email: string | null };

/** Top bar: menu button on small screens, the "Search anything" command palette, notifications and the account menu. */
export function PortalTopbar({ items, area, email }: Props) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-portal-border bg-portal-canvas/85 px-4 py-3 backdrop-blur sm:px-8">
      <PortalMobileNav items={items} area={area} />
      <div className="min-w-0 flex-1">
        <PortalSearch items={items} />
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3">
        <PortalNotifications />
        <PortalAccountMenu email={email} area={area} />
      </div>
    </header>
  );
}
