'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { orgIdSchema } from '@/lib/portal/inventory/schemas';
import { fulfillmentOrderCancel } from '@/lib/portal/inventory/server';
import { back } from '@/components/portal/commerce-ui';

/** A customer owner may cancel an order that is still pending or queued; the database re-checks ownership and the status. */
export async function cancelFulfillmentOrderAction(f: FormData): Promise<void> {
  const org = String(f.get('organizationId') ?? '').trim().slice(0, 36);
  const id = String(f.get('id') ?? '').trim().slice(0, 36);
  const path = `/client/fulfillment/orders/${id}`;
  await requireUser(path);
  const p = orgIdSchema.safeParse({ organizationId: org, id });
  if (!p.success) redirect(back('/client/fulfillment/orders', { org }, { ok: false, code: 'invalid_response' }));
  const r = await fulfillmentOrderCancel(p.data.organizationId, p.data.id);
  redirect(back(path, { org }, r.ok ? { ok: true } : r));
}
