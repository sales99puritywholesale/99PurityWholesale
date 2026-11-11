import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/portal/auth';
import { cartGet, getMyOrganizations } from '@/lib/portal/commerce/server';
import { formatUsd, priceCart } from '@/lib/portal/commerce/pricing';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalEmptyState } from '@/components/portal/portal-empty-state';
import { Field, Flash, INPUT, NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';
import { checkoutAction } from './actions';

export const metadata: Metadata = { title: 'Checkout' };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/checkout');
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  if (!org) {
    return (
      <>
        <PortalPageHeader area="client" title="Checkout" />
        <NoOrganization />
      </>
    );
  }
  // one key per rendered form: submitting the same form twice (double click, refresh, retry) returns the SAME order instead of creating a second one
  const idempotencyKey = crypto.randomUUID();
  const res = await cartGet(org.id);
  const lines = res.ok ? res.data.lines : [];
  const totals = priceCart(lines.map((l) => ({ variantId: l.variant_id, quantity: l.quantity, unitCents: l.purchasable ? l.unit_cents : null })));
  return (
    <>
      <PortalPageHeader area="client" title="Checkout" description={`Organization: ${org.name}. Payment is handled after the order is placed.`} crumbs={[{ label: 'Cart', href: `/client/cart?org=${org.id}` }]} />
      <Flash sp={searchParams} />
      {!totals.ok ? (
        <PortalEmptyState
          title="Nothing to check out"
          description="Your cart is empty or has lines that need attention."
          action={
            <Link href={`/client/cart?org=${org.id}`} className="portal-btn">
              Back to cart
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <PortalCard title="Shipping address">
            <form action={checkoutAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="organizationId" value={org.id} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <div className="sm:col-span-2"><Field label="Recipient or facility name"><input name="name" required maxLength={120} className={INPUT} /></Field></div>
              <div className="sm:col-span-2"><Field label="Address line 1"><input name="line1" required maxLength={160} className={INPUT} /></Field></div>
              <div className="sm:col-span-2"><Field label="Address line 2 (optional)"><input name="line2" maxLength={160} className={INPUT} /></Field></div>
              <Field label="City"><input name="city" required maxLength={80} className={INPUT} /></Field>
              <Field label="State or region"><input name="region" required maxLength={80} className={INPUT} /></Field>
              <Field label="Postal code"><input name="postal" required maxLength={20} className={INPUT} /></Field>
              <Field label="Country (2 letters)"><input name="country" required minLength={2} maxLength={2} defaultValue="US" className={INPUT} /></Field>
              <div className="sm:col-span-2"><Field label="Order notes (optional)"><textarea name="notes" maxLength={500} rows={3} className={INPUT} /></Field></div>
              <div className="sm:col-span-2">
                <button type="submit" className="portal-btn">
                  Place order
                </button>
              </div>
            </form>
          </PortalCard>
          <PortalCard title="Summary">
            <ul className="space-y-2 text-sm">
              {totals.lines.map((l) => {
                const line = lines.find((x) => x.variant_id === l.variantId);
                return (
                  <li key={l.variantId} className="flex justify-between gap-3">
                    <span className="text-portal-text">
                      {line?.product_name} {line?.spec} x {l.quantity}
                    </span>
                    <span className="text-portal-text">{formatUsd(l.lineCents)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 flex justify-between border-t border-portal-border pt-3 text-base font-semibold text-portal-text">
              <span>Total</span>
              <span>{formatUsd(totals.subtotalCents)}</span>
            </p>
            <p className="mt-2 text-xs text-portal-muted">The final amount is recalculated by the server when the order is placed.</p>
          </PortalCard>
        </div>
      )}
    </>
  );
}
