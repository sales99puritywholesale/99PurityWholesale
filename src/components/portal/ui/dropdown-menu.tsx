'use client';

import * as React from 'react';
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/portal/utils';

/** shadcn/ui DropdownMenu (Radix): keyboard navigation, typeahead, focus return, collision-aware placement. */
export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof MenuPrimitive.Content>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>>(({ className, sideOffset = 8, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[12rem] origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-xl border border-portal-border bg-white p-1.5 text-portal-text shadow-[0_12px_32px_rgba(16,24,40,0.14)] data-[state=closed]:animate-[portal-menu-out_120ms_ease-in_forwards] data-[state=open]:animate-[portal-menu-in_160ms_cubic-bezier(0.16,1,0.3,1)]',
        className,
      )}
      {...props}
    />
  </MenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof MenuPrimitive.Item>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & { destructive?: boolean }>(
  ({ className, destructive, ...props }, ref) => (
    <MenuPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:bg-portal-canvas data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
        destructive ? 'text-portal-danger focus:bg-portal-danger-soft' : 'text-portal-text',
        className,
      )}
      {...props}
    />
  ),
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuLabel = React.forwardRef<React.ElementRef<typeof MenuPrimitive.Label>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label>>(({ className, ...props }, ref) => (
  <MenuPrimitive.Label ref={ref} className={cn('px-3 py-2 text-xs text-portal-muted', className)} {...props} />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export const DropdownMenuSeparator = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>) => (
  <MenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-portal-border', className)} {...props} />
);
