'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import { portalCopy } from '@/lib/portal/copy';
import { signOutAction } from '@/app/(portal)/auth/actions';
import { Avatar } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';

/** Account menu: avatar, who is signed in and which portal, with Sign out (a server action; same-origin is enforced by Next.js). */
export function PortalAccountMenu({ email, area }: { email: string | null; area: 'client' | 'admin' }) {
  const label = email ?? 'account';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={portalCopy.common.accountMenu} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white hover:shadow-sm data-[state=open]:bg-white">
          <Avatar className="h-9 w-9 text-sm">{label.slice(0, 1)}</Avatar>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[14rem] truncate text-sm font-semibold text-portal-text">{label}</span>
            <span className="block text-xs text-portal-muted">{portalCopy.brand.area[area]}</span>
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-portal-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {portalCopy.common.signedInAs} <span className="font-medium text-portal-text">{label}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden="true" />
              {portalCopy.common.signOut}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
