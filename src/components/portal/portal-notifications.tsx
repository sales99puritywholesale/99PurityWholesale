'use client';

import { Bell, CheckCircle2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

/**
 * Notifications bell. The portal has no notification feed yet, so the bell honestly shows an empty state and NO unread dot. When a feed exists, pass its items and the dot appears
 * only while something is unread.
 */
export type PortalNotification = { id: string; title: string; detail?: string };

export function PortalNotifications({ items = [] }: { items?: readonly PortalNotification[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={items.length ? `Notifications (${items.length} unread)` : 'Notifications'} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-portal-text transition-colors hover:bg-white hover:shadow-sm">
          <Bell aria-hidden="true" className="h-5 w-5" />
          {items.length > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-portal-accent ring-2 ring-portal-canvas" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="border-b border-portal-border px-4 py-3">
          <p className="font-portal-heading text-sm font-semibold text-portal-text">Notifications</p>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-portal-success-soft text-portal-success"><CheckCircle2 aria-hidden="true" className="h-5 w-5" /></span>
            <p className="text-sm font-medium text-portal-text">You are all caught up</p>
            <p className="text-xs text-portal-muted">Nothing needs your attention right now.</p>
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-portal-border overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <p className="text-sm font-medium text-portal-text">{n.title}</p>
                {n.detail && <p className="mt-0.5 text-xs text-portal-muted">{n.detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
