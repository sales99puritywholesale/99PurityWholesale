'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/portal/utils';

/** shadcn/ui Dialog (Radix): focus trap, Escape, inert background, accessible title. Open and close animations are defined in portal.css. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-[rgba(9,12,17,0.45)] backdrop-blur-[2px] data-[state=closed]:animate-[portal-fade-out_150ms_ease-in_forwards] data-[state=open]:animate-[portal-fade_200ms_ease-out]', className)}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }>(
  ({ className, children, hideClose, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-portal-border bg-portal-card p-6 text-portal-text shadow-[0_24px_60px_rgba(9,12,17,0.25)] data-[state=closed]:animate-[portal-dialog-out_150ms_ease-in_forwards] data-[state=open]:animate-[portal-dialog-in_220ms_cubic-bezier(0.16,1,0.3,1)]',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 text-portal-muted transition-colors hover:bg-portal-canvas hover:text-portal-text">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
DialogContent.displayName = 'DialogContent';

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('mb-4 flex flex-col gap-1.5 pr-8', className)} {...props} />;
export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('mt-5 flex flex-wrap justify-end gap-2', className)} {...props} />;
export const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('font-portal-heading text-lg font-semibold text-portal-text', className)} {...props} />
));
DialogTitle.displayName = 'DialogTitle';
export const DialogDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-portal-muted', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';
