import type { ReactNode } from 'react';
import { PortalEmptyState } from './portal-empty-state';

export type PortalColumn<Row> = {
  key: string;
  header: string;
  /** Render a cell. Use className "portal-id" (monospace, underlined) for identifiers. */
  cell: (row: Row) => ReactNode;
  align?: 'left' | 'right';
};

type Props<Row> = {
  caption: string;
  columns: readonly PortalColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  emptyTitle: string;
  emptyDescription?: string;
};

/**
 * Responsive data table: scrolls horizontally on narrow screens (never crushes columns), real <table> semantics for
 * assistive technology, and an explicit empty state when there are no rows.
 */
export function PortalTable<Row>({ caption, columns, rows, rowKey, emptyTitle, emptyDescription }: Props<Row>) {
  if (rows.length === 0) return <PortalEmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="overflow-x-auto rounded-xl border border-portal-border bg-portal-card">
      <table className="min-w-full divide-y divide-portal-border text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-portal-canvas">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-portal-muted ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-portal-border">
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 text-portal-text ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
