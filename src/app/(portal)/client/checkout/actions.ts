'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { checkoutSchema } from '@/lib/portal/commerce/schemas';
import { checkout } from '@/lib/portal/commerce/server';
import { back } from '@/components/portal/commerce-ui';

/** Checkout. The browser sends the organization id, the ship-to address and optional notes. NO price, total or line is accepted: the database rebuilds them from the cart. */
export async function checkoutAction(formData: FormData): Promise<void> {
  await requireUser('/client/checkout');
  const text = (k: string) => String(formData.get(k) ?? '');
  const line2 = text('line2').trim();
  const notes = text('notes').trim();
  const parsed = checkoutSchema.safeParse({
    organizationId: text('organizationId'),
    shipTo: { name: text('name'), line1: text('line1'), ...(line2 ? { line2 } : {}), city: text('city'), region: text('region'), postal: text('postal'), country: text('country').toUpperCase() },
    ...(notes ? { notes } : {}),
    idempotencyKey: text('idempotencyKey'),
  });
  if (!parsed.success) redirect(back('/client/checkout', { org: text('organizationId').slice(0, 36) }, { ok: false, code: 'invalid_response' }));
  const { organizationId, shipTo, notes: n, idempotencyKey } = parsed.data;
  const r = await checkout(organizationId, shipTo, n, idempotencyKey);
  if (!r.ok) redirect(back('/client/checkout', { org: organizationId }, r));
  redirect(`/client/orders/${r.data.order_id}?org=${organizationId}&ok=1`);
}
