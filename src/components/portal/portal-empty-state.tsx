import type { ReactNode } from 'react';

type Props = { title: string; description?: string; note?: string; action?: ReactNode };

/** Explicit empty state (every list in the portal has one). Nothing here implies live data. */
export function PortalEmptyState({ title, description, note, action }: Props) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-portal-border bg-portal-card px-6 py-12 text-center">
      <span aria-hidden="true" className="mb-4 h-1 w-10 rounded-full bg-portal-accent" />
      <h2 className="font-portal-heading text-xl font-semibold text-portal-text">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm text-portal-muted">{description}</p>}
      {note && <p className="mt-3 max-w-md text-xs text-portal-muted">{note}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
