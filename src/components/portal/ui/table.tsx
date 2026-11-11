import * as React from 'react';
import { cn } from '@/lib/portal/utils';

export const Table = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="relative w-full overflow-x-auto">
    <table className={cn('w-full caption-bottom text-left text-sm', className)} {...props} />
  </div>
);
export const TableHeader = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className={cn('bg-portal-canvas/60 text-xs font-medium text-portal-muted', className)} {...props} />;
export const TableBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className={cn('divide-y divide-portal-border', className)} {...props} />;
export const TableRow = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn('transition-colors hover:bg-portal-canvas/60', className)} {...props} />;
export const TableHead = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th scope="col" className={cn('h-11 px-4 text-left align-middle font-medium first:pl-5 last:pr-5', className)} {...props} />;
export const TableCell = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-4 py-3.5 align-middle first:pl-5 last:pr-5', className)} {...props} />;
