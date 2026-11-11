import Link from 'next/link';
import { Headset } from 'lucide-react';
import type { PortalNavItem } from '@/lib/portal/nav';
import { portalCopy } from '@/lib/portal/copy';
import { PortalNavList } from './portal-nav-list';
import { Button } from './ui/button';

type Props = { items: readonly PortalNavItem[]; area: 'client' | 'admin' };

/** Desktop sidebar (dark): brand, the area name, icon navigation and a help card. On small screens the same navigation is offered through PortalMobileNav. */
export function PortalSidebar({ items, area }: Props) {
  const root = area === 'client' ? '/client' : '/admin';
  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-portal-sidebar lg:flex">
      <div className="px-6 pb-5 pt-7">
        <Link href={root} prefetch={false} className="block">
          <span className="font-portal-heading text-xl font-bold tracking-wide text-white">{portalCopy.brand.name}</span>
        </Link>
        <p className="mt-5 font-portal-heading text-lg font-semibold text-white">{portalCopy.brand.area[area]}</p>
        <div className="mt-4 h-px bg-white/10" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <PortalNavList items={items} areaRoot={root} />
      </div>
      <div className="m-4 rounded-2xl border border-white/10 bg-portal-sidebar-hover/70 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-portal-accent">
            <Headset aria-hidden="true" className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Need Help?</p>
            <p className="text-xs text-portal-sidebar-text">{area === 'admin' ? 'Contact the platform team' : 'Contact your account manager'}</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="mt-3 w-full border-white/15 bg-transparent text-white hover:bg-white/10">
          <a href="mailto:sales@99puritywholesale.com">Contact Support</a>
        </Button>
      </div>
    </aside>
  );
}
