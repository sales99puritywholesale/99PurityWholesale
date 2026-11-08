'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { PortalNavItem } from '@/lib/portal/nav';
import { portalCopy } from '@/lib/portal/copy';
import { PortalNavList } from './portal-nav-list';

type Props = { items: readonly PortalNavItem[]; area: 'client' | 'admin' };

/** Navigation drawer for screens below the lg breakpoint. Closes on navigation and on Escape; focus moves into the drawer. */
export function PortalMobileNav({ items, area }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const root = area === 'client' ? '/client' : '/admin';

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        openerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="portal-mobile-nav"
        className="portal-btn-quiet !px-3"
      >
        <span className="sr-only">{portalCopy.common.openMenu}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={portalCopy.common.primaryNav} id="portal-mobile-nav">
          <button type="button" aria-hidden="true" tabIndex={-1} className="absolute inset-0 bg-portal-sidebar/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-portal-sidebar">
            <div className="flex items-center justify-between px-5 pb-4 pt-6">
              <span className="font-portal-heading text-lg font-bold text-white">{portalCopy.brand.name}</span>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-portal-sidebar-text hover:bg-portal-sidebar-hover hover:text-white">
                <span className="sr-only">{portalCopy.common.closeMenu}</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6">
              <PortalNavList items={items} areaRoot={root} onNavigate={() => setOpen(false)} />
            </div>
            <p className="border-t border-white/10 px-5 py-4 text-xs text-portal-sidebar-text">{portalCopy.common.sidebarFooter}</p>
          </div>
        </div>
      )}
    </div>
  );
}
