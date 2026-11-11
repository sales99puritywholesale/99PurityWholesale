import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/portal/auth';
import { cartGet, getMyOrganizations, messageFor } from '@/lib/portal/commerce/server';
import { formatUsd, priceCart } from '@/lib/portal/commerce/pricing';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalEmptyState } from '@/components/portal/portal-empty-state';
import { Flash, INPUT, NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';
import { emptyCartAction, putCartItemAction } from '../shop/actions';

export const metadata: Metadata = { title: 'Cart' };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/cart');
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  if (!org) {
    return (
      <>
        <PortalPageHeader area="client" title="Cart" />
        <NoOrganization />
      </>
    );
  }
  const res = await cartGet(org.id);
  const lines = res.ok ? res.data.lines : [];
  const totals = priceCart(lines.map((l) => ({ variantId: l.variant_id, quantity: l.quantity, unitCents: l.purchasable ? l.unit_cents : null })));
  const blocked = lines.some((l) => !l.purchasable);
  return (
    <>
      <PortalPageHeader
        area="client"
        title="Cart"
        description={`Organization: ${org.name}. Prices are calculated by the server when you check out.`}
        crumbs={[{ label: 'Shop', href: `/client/shop?org=${org.id}` }]}
      />
      <Flash sp={searchParams} />
      {!res.ok && (
        <p role="alert" className="mb-4 text-sm text-portal-danger">
          {messageFor(res.code)}
        </p>
      )}
      {lines.length === 0 ? (
        <PortalEmptyState
          title="Your cart is empty"
          action={
            <Link href={`/client/shop?org=${org.id}`} className="portal-btn">
              Browse products
            </Link>
          }
        />
      ) : (
        <PortalCard>
          <ul className="divide-y divide-portal-border">
            {lines.map((l) => (
              <li key={l.variant_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-portal-text">
                    {l.product_name} <span className="text-portal-muted">{l.spec}</span>
                  </p>
                  <p className="portal-id text-xs">{l.sku}</p>
                  {!l.purchasable && <p className="text-xs text-portal-danger">No longer available or no price set: remove it to continue.</p>}
                </div>
                <p className="text-sm text-portal-text">{l.unit_cents === null ? '-' : formatUsd(l.unit_cents)}</p>
                <form action={putCartItemAction} className="flex items-center gap-2">
                  <input type="hidden" name="organizationId" value={org.id} />
                  <input type="hidden" name="variantId" value={l.variant_id} />
                  <input type="hidden" name="returnTo" value="cart" />
                  <input name="quantity" type="number" min={0} max={10000} defaultValue={l.quantity} aria-label={`Quantity for ${l.product_name} ${l.spec}`} className={`${INPUT} w-24`} />
                  <button className="portal-btn-quiet" type="submit">
                    Update
                  </button>
                </form>
                <p className="w-24 text-right text-sm font-semibold text-portal-text">{l.line_cents === null ? '-' : formatUsd(l.line_cents)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-portal-border pt-4">
            <form action={emptyCartAction}>
              <input type="hidden" name="organizationId" value={org.id} />
              <button className="portal-btn-quiet" type="submit">
                Empty cart
              </button>
            </form>
            <p className="text-lg font-semibold text-portal-text">Subtotal {totals.ok ? formatUsd(totals.subtotalCents) : '-'}</p>
            {blocked || !totals.ok ? (
              <span className="text-sm text-portal-muted">Resolve the flagged lines to check out.</span>
            ) : (
              <Link href={`/client/checkout?org=${org.id}`} className="portal-btn">
                Checkout
              </Link>
            )}
          </div>
        </PortalCard>
      )}
    </>
  );
}
