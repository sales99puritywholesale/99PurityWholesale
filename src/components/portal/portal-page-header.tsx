import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';

type Crumb = { label: string; href?: string };
type Props = { title: string; description?: string; area: 'client' | 'admin'; crumbs?: readonly Crumb[] };

/** Breadcrumb + page heading. One per page; the heading is the page's <h1>. */
export function PortalPageHeader({ title, description, area, crumbs = [] }: Props) {
  const root = area === 'client' ? '/client' : '/admin';
  const trail: Crumb[] = [{ label: portalCopy.brand.area[area], href: root }, ...crumbs, { label: title }];
  return (
    <div className="mb-8">
      <nav aria-label={portalCopy.common.breadcrumbs}>
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-portal-muted">
          {trail.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              {c.href && i < trail.length - 1 ? (
                <Link href={c.href} prefetch={false} className="hover:text-portal-text hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <h1 className="mt-3 font-portal-heading text-3xl font-bold tracking-tight text-portal-text">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-sm text-portal-muted">{description}</p>}
    </div>
  );
}
