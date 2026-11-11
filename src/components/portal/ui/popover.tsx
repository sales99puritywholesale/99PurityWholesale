'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/portal/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(({ className, align = 'end', sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-80 origin-[var(--radix-popover-content-transform-origin)] rounded-xl border border-portal-border bg-white p-4 text-portal-text shadow-[0_12px_32px_rgba(16,24,40,0.14)] outline-none data-[state=closed]:animate-[portal-menu-out_120ms_ease-in_forwards] data-[state=open]:animate-[portal-menu-in_160ms_cubic-bezier(0.16,1,0.3,1)]',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';
