import type { ReactNode } from 'react';

type CardProps = { title?: string; eyebrow?: string; actions?: ReactNode; children: ReactNode; className?: string };

/** White, softly rounded surface used for every content block. */
export function PortalCard({ title, eyebrow, actions, children, className = '' }: CardProps) {
  return (
    <section className={`rounded-2xl border border-portal-border bg-portal-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6 ${className}`}>
      {(title || eyebrow || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {eyebrow && <p className="portal-eyebrow mb-1">{eyebrow}</p>}
            {title && <h2 className="font-portal-heading text-lg font-semibold text-portal-text">{title}</h2>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
