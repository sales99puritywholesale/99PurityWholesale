import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/portal/utils';

const field =
  'flex h-10 w-full rounded-lg border border-portal-border bg-white px-3 text-sm text-portal-text shadow-sm transition-colors placeholder:text-portal-muted focus-visible:border-portal-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent/40 disabled:cursor-not-allowed disabled:opacity-60';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input ref={ref} type={type} className={cn(field, className)} {...props} />
));
Input.displayName = 'Input';

/**
 * A native <select> in the shadcn field style. It is deliberately NOT the Radix Select: a native control posts its value with a plain server-action form, works without
 * JavaScript and is the most robust choice for the portal's forms.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(field, 'appearance-none pr-9', className)} {...props}>
      {children}
    </select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-portal-muted" />
  </div>
));
NativeSelect.displayName = 'NativeSelect';

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn('mb-1.5 block text-xs font-medium text-portal-muted', className)} {...props} />;
