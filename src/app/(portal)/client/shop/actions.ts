'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { cartSetItemSchema } from '@/lib/portal/commerce/schemas';
import { cartEmpty, cartPutItem } from '@/lib/portal/commerce/server';
import { back } from '@/components/portal/commerce-ui';

/** Customer cart actions. The client sends ONLY an organization id, a variant id and a quantity; the database prices everything and re-checks membership. */
export async function putCartItemAction(formData: FormData): Promise<void> {
  await requireUser('/client/shop');
  const raw = { organizationId: formData.get('organizationId'), variantId: formData.get('variantId'), quantity: Number(formData.get('quantity')) };
  const target = String(formData.get('returnTo') ?? '') === 'cart' ? '/client/cart' : '/client/shop';
  const parsed = cartSetItemSchema.safeParse(raw);
  if (!parsed.success) redirect(back(target, {}, { ok: false, code: 'not_available' }));
  const r = await cartPutItem(parsed.data.organizationId, parsed.data.variantId, parsed.data.quantity);
  redirect(back(target, { org: parsed.data.organizationId }, r.ok ? { ok: true } : r));
}

export async function emptyCartAction(formData: FormData): Promise<void> {
  await requireUser('/client/cart');
  const org = String(formData.get('organizationId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(org)) redirect('/client/cart');
  const r = await cartEmpty(org);
  redirect(back('/client/cart', { org }, r.ok ? { ok: true } : r));
}
