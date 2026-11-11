import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/portal/utils';

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors', {
  variants: {
    variant: {
      default: 'border-portal-border bg-portal-canvas text-portal-muted',
      info: 'border-[#B7E4EA] bg-[#E6F6F8] text-portal-accent-strong',
      success: 'border-[#ABEFC6] bg-portal-success-soft text-portal-success',
      warning: 'border-[#FEDF89] bg-portal-warning-soft text-portal-warning',
      danger: 'border-[#FECDCA] bg-portal-danger-soft text-portal-danger',
      outline: 'border-portal-border bg-white text-portal-text',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, variant, ...props }: BadgeProps) => <span className={cn(badgeVariants({ variant }), className)} {...props} />;
