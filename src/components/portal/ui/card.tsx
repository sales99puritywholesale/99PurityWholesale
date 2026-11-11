import * as React from 'react';
import { cn } from '@/lib/portal/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-2xl border border-portal-border bg-portal-card text-portal-text shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)} {...props} />
));
Card.displayName = 'Card';
export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />;
export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn('font-portal-heading text-lg font-semibold leading-none text-portal-text', className)} {...props} />;
export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn('text-sm text-portal-muted', className)} {...props} />;
export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5 pt-0', className)} {...props} />;
