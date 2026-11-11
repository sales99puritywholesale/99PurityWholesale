'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isNavActive, type PortalNavItem } from '@/lib/portal/nav';
import { portalCopy } from '@/lib/portal/copy';
import { navIcon } from './nav-icons';
import { cn } from '@/lib/portal/utils';

type Props = { items: readonly PortalNavItem[]; areaRoot: '/client' | '/admin'; onNavigate?: () => void };

/**
 * Sidebar navigation: an icon and a label per item. The active item is filled with the accent colour and also carries aria-current, so it is never colour alone.
 * Hiding or showing a link is cosmetic; every destination page enforces access itself.
 */
export function PortalNavList({ items, areaRoot, onNavigate }: Props) {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label={portalCopy.common.primaryNav}>
      <ul className="space-y-1">
        {items.map((item) => {
          const active = isNavActive(item.href, pathname, areaRoot);
          const Icon = navIcon(item.key);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                prefetch={false}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200',
                  active ? 'bg-portal-accent font-semibold text-portal-sidebar shadow-[0_4px_14px_rgba(79,195,208,0.25)]' : 'text-portal-sidebar-text hover:bg-portal-sidebar-hover hover:text-white',
                )}
              >
                <Icon aria-hidden="true" className={cn('h-[18px] w-[18px] shrink-0 transition-transform duration-200', active ? '' : 'group-hover:scale-110')} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
