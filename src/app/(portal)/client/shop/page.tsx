import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { catalogList, getMyOrganizations, messageFor } from '@/lib/portal/commerce/server';
import { formatUsd } from '@/lib/portal/commerce/pricing';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalEmptyState } from '@/components/portal/portal-empty-state';
import { Flash, INPUT, NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';
import { putCartItemAction } from './actions';

export const metadata: Metadata = { title: portalCopy.client.modules.shop.title };
const PAGE = 24;

/** Wholesale storefront of the caller's organization: assigned products only, the organization's price per variant (the base price is never sent to the browser). */
export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/shop');
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  const t = portalCopy.client.modules.shop;
  if (!org) {
    return (
      <>
        <PortalPageHeader area="client" title={t.title} description={t.description} />
        <NoOrganization />
      </>
    );
  }

  const q = (one(searchParams.q) ?? '').trim().toLowerCase().slice(0, 60);
  const page = Math.max(1, Math.min(200, Number(one(searchParams.page)) || 1));
  const res = await catalogList(org.id);
  const all = res.ok ? res.data.items : [];
  const filtered = q ? all.filter((i) => i.name.toLowerCase().includes(q) || i.category.includes(q)) : all;
  const items = filtered.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  // the category label is deliberately NOT shown to customers: several category names read as health claims (portal copy rules)
  const pageHref = (p: number) => `/client/shop?org=${org.id}&q=${encodeURIComponent(q)}&page=${p}`;

  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={`${t.description} Organization: ${org.name}.`} />
      <Flash sp={searchParams} />
      {!res.ok && (
        <p role="alert" className="mb-4 text-sm text-portal-danger">
          {messageFor(res.code)}
        </p>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="org" value={org.id} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-portal-muted">Search</span>
            <input name="q" defaultValue={q} maxLength={60} className={INPUT} />
          </label>
          <button className="portal-btn-quiet" type="submit">
            Search
          </button>
        </form>
        <div className="flex items-center gap-2">
          {orgs.length > 1 &&
            orgs.map((o) => (
              <Link key={o.id} href={`/client/shop?org=${o.id}`} className={o.id === org.id ? 'portal-btn' : 'portal-btn-quiet'}>
                {o.code}
              </Link>
            ))}
          <Link href={`/client/cart?org=${org.id}`} className="portal-btn">
            Cart
          </Link>
        </div>
      </div>
      {items.length === 0 ? (
        <PortalEmptyState title="No products to show" description="Your organization has no products assigned yet, or nothing matches your search." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <PortalCard key={p.product_id} title={p.name}>
              {p.description && <p className="mb-3 line-clamp-3 text-sm text-portal-muted">{p.description}</p>}
              <p className="mb-3 text-xs text-portal-muted">For laboratory research use only.{p.cas ? ` CAS ${p.cas}.` : ''}</p>
              <ul className="space-y-2">
                {p.variants.map((v) => (
                  <li key={v.variant_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-portal-border pt-2">
                    <span className="text-sm text-portal-text">
                      {v.spec}
                      <span className="portal-id ml-2 text-xs">{v.sku}</span>
                    </span>
                    <span className="text-sm font-semibold text-portal-text">{v.unit_cents === null ? 'Price on request' : formatUsd(v.unit_cents)}</span>
                    {v.unit_cents !== null && p.available ? (
                      <form action={putCartItemAction} className="flex items-center gap-2">
                        <input type="hidden" name="organizationId" value={org.id} />
                        <input type="hidden" name="variantId" value={v.variant_id} />
                        <input name="quantity" type="number" min={1} max={10000} defaultValue={1} aria-label={`Quantity for ${p.name} ${v.spec}`} className={`${INPUT} w-20`} />
                        <button className="portal-btn-quiet" type="submit">
                          Add
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-portal-muted">Not available</span>
                    )}
                  </li>
                ))}
              </ul>
            </PortalCard>
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link className="portal-btn-quiet" href={pageHref(page - 1)}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-portal-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className="portal-btn-quiet" href={pageHref(page + 1)}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
