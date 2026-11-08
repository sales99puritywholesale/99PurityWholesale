'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isNavActive, type PortalNavItem } from '@/lib/portal/nav';
import { portalCopy } from '@/lib/portal/copy';

type Props = { items: readonly PortalNavItem[]; areaRoot: '/client' | '/admin'; onNavigate?: () => void };

/**
 * Flat text list (no icons, groups or badges), matching the observed reference sidebar.
 * Active item: lighter pill with an accent bar on the left. Active state is conveyed with aria-current as well as colour.
 * Hiding or showing a link is cosmetic; every destination page enforces access itself.
 */
export function PortalNavList({ items, areaRoot, onNavigate }: Props) {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label={portalCopy.common.primaryNav}>
      <ul className="space-y-1">
        {items.map((item) => {
          const active = isNavActive(item.href, pathname, areaRoot);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                prefetch={false}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`relative block rounded-lg px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-portal-sidebar-hover font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-portal-accent'
                    : 'text-portal-sidebar-text hover:bg-portal-sidebar-hover hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
