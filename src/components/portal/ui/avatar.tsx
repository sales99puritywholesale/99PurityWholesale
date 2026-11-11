import * as React from 'react';
import { cn } from '@/lib/portal/utils';

/** Initial-letter avatar (the portal has no profile pictures). */
export const Avatar = ({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span aria-hidden="true" className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-portal-sidebar text-xs font-semibold uppercase text-white', className)} {...props}>
    {children}
  </span>
);
