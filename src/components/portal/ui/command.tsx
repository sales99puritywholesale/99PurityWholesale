'use client';

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { cn } from '@/lib/portal/utils';

/** shadcn/ui Command (cmdk): a searchable list with keyboard navigation, shown inside a Dialog as a command palette. */
export const Command = React.forwardRef<React.ElementRef<typeof CommandPrimitive>, React.ComponentPropsWithoutRef<typeof CommandPrimitive>>(({ className, ...props }, ref) => (
  <CommandPrimitive ref={ref} className={cn('flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white text-portal-text', className)} {...props} />
));
Command.displayName = 'Command';

export const CommandDialog = ({ children, title, description, ...props }: React.ComponentProps<typeof Dialog> & { title: string; description: string }) => (
  <Dialog {...props}>
    <DialogContent hideClose className="top-[20%] max-w-lg translate-y-0 overflow-hidden p-0">
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <DialogDescription className="sr-only">{description}</DialogDescription>
      <Command className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-portal-muted">{children}</Command>
    </DialogContent>
  </Dialog>
);

export const CommandInput = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Input>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>>(({ className, ...props }, ref) => (
  <div className="flex items-center gap-2 border-b border-portal-border px-4" cmdk-input-wrapper="">
    <Search className="h-4 w-4 shrink-0 text-portal-muted" aria-hidden="true" />
    <CommandPrimitive.Input ref={ref} className={cn('flex h-12 w-full bg-transparent text-sm text-portal-text outline-none placeholder:text-portal-muted', className)} {...props} />
  </div>
));
CommandInput.displayName = 'CommandInput';

export const CommandList = React.forwardRef<React.ElementRef<typeof CommandPrimitive.List>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(({ className, ...props }, ref) => (
  <CommandPrimitive.List ref={ref} className={cn('max-h-80 overflow-y-auto overflow-x-hidden p-2', className)} {...props} />
));
CommandList.displayName = 'CommandList';

export const CommandEmpty = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Empty>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>>((props, ref) => (
  <CommandPrimitive.Empty ref={ref} className="py-8 text-center text-sm text-portal-muted" {...props} />
));
CommandEmpty.displayName = 'CommandEmpty';

export const CommandGroup = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Group>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group ref={ref} className={cn('overflow-hidden text-portal-text', className)} {...props} />
));
CommandGroup.displayName = 'CommandGroup';

export const CommandItem = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Item>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn('group relative flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-portal-canvas [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-portal-muted', className)}
    {...props}
  />
));
CommandItem.displayName = 'CommandItem';
