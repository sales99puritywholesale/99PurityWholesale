import Link from 'next/link';
import type { PortalNavItem } from '@/lib/portal/nav';
import { portalCopy } from '@/lib/portal/copy';
import { PortalNavList } from './portal-nav-list';

type Props = { items: readonly PortalNavItem[]; area: 'client' | 'admin' };

/** Desktop sidebar (dark). On small screens the same navigation is offered through PortalMobileNav. */
export function PortalSidebar({ items, area }: Props) {
  const root = area === 'client' ? '/client' : '/admin';
  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-portal-sidebar lg:flex">
      <div className="px-6 pb-6 pt-7">
        <Link href={root} prefetch={false} className="block">
          <span className="font-portal-heading text-xl font-bold tracking-wide text-white">{portalCopy.brand.name}</span>
          <span className="portal-eyebrow mt-1 block !text-portal-accent">{portalCopy.brand.area[area]}</span>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <PortalNavList items={items} areaRoot={root} />
      </div>
      <p className="border-t border-white/10 px-6 py-5 text-xs text-portal-sidebar-text">{portalCopy.common.sidebarFooter}</p>
    </aside>
  );
}
