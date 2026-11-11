import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminCatalogList, messageFor } from '@/lib/portal/commerce/server';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalEmptyState } from '@/components/portal/portal-empty-state';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Flash, INPUT, one, type Sp } from '@/components/portal/commerce-ui';
import { setProductStatusAction, setVariantPriceAction } from '../commerce-actions';

export const metadata: Metadata = { title: portalCopy.admin.modules.products.title };
const PAGE = 15;
const dollars = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2));

/** Catalog and base prices. Base price and floor are cost-side data: visible to staff holding org.manage only, changed only with a fresh step-up (checked in the database). */
export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/products', 'org.manage');
  const t = portalCopy.admin.modules.products;
  const q = (one(searchParams.q) ?? '').trim().toLowerCase().slice(0, 60);
  const page = Math.max(1, Math.min(200, Number(one(searchParams.page)) || 1));
  const res = await adminCatalogList();
  const all = res.ok ? res.data.products : [];
  const filtered = q ? all.filter((p) => p.name.toLowerCase().includes(q) || p.slug.includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q))) : all;
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const noPrice = all.reduce((n, p) => n + p.variants.filter((v) => v.base_price_cents === null).length, 0);
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={`${t.description} ${all.length} products; ${noPrice} variants have no price yet (not purchasable).`} />
      <Flash sp={searchParams} />
      {!res.ok && (
        <p role="alert" className="mb-4 text-sm text-portal-danger">
          {messageFor(res.code)}
        </p>
      )}
      <form method="get" className="mb-5 flex items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-portal-muted">Search name, slug or SKU</span>
          <input name="q" defaultValue={q} maxLength={60} className={INPUT} />
        </label>
        <button className="portal-btn-quiet" type="submit">
          Search
        </button>
      </form>
      {rows.length === 0 ? (
        <PortalEmptyState title="No products" description={all.length === 0 ? 'The catalog has not been loaded yet. Apply the catalog seed (see docs/P3-IMPLEMENTATION-PLAN.md).' : 'Nothing matches your search.'} />
      ) : (
        <div className="space-y-4">
          {rows.map((p) => (
            <PortalCard
              key={p.product_id}
              title={p.name}
              eyebrow={p.category.replace(/-/g, ' ')}
              actions={
                <form action={setProductStatusAction} className="flex items-center gap-2">
                  <input type="hidden" name="productId" value={p.product_id} />
                  <input type="hidden" name="q" value={q} />
                  <input type="hidden" name="status" value={p.status === 'active' ? 'archived' : 'active'} />
                  <PortalStatusPill label={p.status} tone={p.status === 'active' ? 'success' : 'neutral'} />
                  <button className="portal-btn-quiet" type="submit">
                    {p.status === 'active' ? 'Archive' : 'Restore'}
                  </button>
                </form>
              }
            >
              <ul className="space-y-2">
                {p.variants.map((v) => (
                  <li key={v.variant_id} className="flex flex-wrap items-end justify-between gap-3 border-t border-portal-border pt-2">
                    <span className="text-sm text-portal-text">
                      {v.spec} <span className="portal-id text-xs">{v.sku}</span>
                    </span>
                    <form action={setVariantPriceAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="variantId" value={v.variant_id} />
                      <input type="hidden" name="q" value={q} />
                      <label className="block">
                        <span className="mb-1 block text-xs text-portal-muted">Base (USD)</span>
                        <input name="base" defaultValue={dollars(v.base_price_cents)} inputMode="decimal" className={`${INPUT} w-28`} placeholder="not set" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-portal-muted">Floor (USD)</span>
                        <input name="floor" defaultValue={dollars(v.min_price_cents)} inputMode="decimal" className={`${INPUT} w-28`} placeholder="none" />
                      </label>
                      <button className="portal-btn-quiet" type="submit">
                        Save
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </PortalCard>
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link className="portal-btn-quiet" href={`/admin/products?q=${encodeURIComponent(q)}&page=${page - 1}`}>Previous</Link> : <span />}
          <span className="text-portal-muted">Page {page} of {pages}</span>
          {page < pages ? <Link className="portal-btn-quiet" href={`/admin/products?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next</Link> : <span />}
        </nav>
      )}
    </>
  );
}
