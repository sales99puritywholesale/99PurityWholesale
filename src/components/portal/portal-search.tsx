'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Search } from 'lucide-react';
import type { PortalNavItem } from '@/lib/portal/nav';
import { navIcon } from './nav-icons';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';

/**
 * "Search anything" command palette (Ctrl+K or Cmd+K, or click the bar). It searches the pages this person can open: the list is the same navigation the sidebar shows, so it
 * can never offer a page the navigation hides. Choosing an entry navigates there; every page still checks access itself.
 */
export function PortalSearch({ items }: { items: readonly PortalNavItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-10 w-full max-w-sm items-center gap-2.5 rounded-xl border border-portal-border bg-white px-3 text-sm text-portal-muted shadow-sm transition-all hover:border-[#cfd8e3] hover:shadow"
      >
        <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search anything...</span>
        <kbd className="hidden rounded-md border border-portal-border bg-portal-canvas px-1.5 py-0.5 font-portal-mono text-[11px] text-portal-muted sm:inline">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search for a page and press Enter to open it.">
        <CommandInput placeholder="Search pages..." />
        <CommandList>
          <CommandEmpty>No page matches your search.</CommandEmpty>
          <CommandGroup heading="Pages">
            {items.map((item) => {
              const Icon = navIcon(item.key);
              return (
                <CommandItem key={item.key} value={`${item.label} ${item.key}`} onSelect={() => go(item.href)}>
                  <Icon aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  <CornerDownLeft aria-hidden="true" className="opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
