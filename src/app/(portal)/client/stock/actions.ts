'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { inboundCreateSchema, orgIdSchema } from '@/lib/portal/inventory/schemas';
import { inboundCancel, inboundCreate } from '@/lib/portal/inventory/server';
import { back } from '@/components/portal/commerce-ui';

/**
 * Customer actions for inbound shipments. The units become stock only when staff receive them at the warehouse; these actions only ANNOUNCE (or cancel the announcement of) a shipment.
 * The RPC re-checks that the caller is an owner of the organization and that every SKU is an approved product of that organization.
 */
const PATH = '/client/stock';
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function createInboundAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = str(f, 'organizationId').slice(0, 36);
  const lines: { sku_mapping_id: string; expected_units: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const sku = str(f, `sku${i}`);
    const units = str(f, `units${i}`);
    if (sku && units) lines.push({ sku_mapping_id: sku, expected_units: Number(units) });
  }
  const p = inboundCreateSchema.safeParse({ organizationId: org, reference: str(f, 'reference'), lines });
  if (!p.success) redirect(back(PATH, { org }, { ok: false, code: 'invalid_response' }));
  const r = await inboundCreate(p.data.organizationId, p.data.reference, p.data.lines);
  redirect(back(PATH, { org }, r.ok ? { ok: true } : r));
}

export async function cancelInboundAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = str(f, 'organizationId').slice(0, 36);
  const p = orgIdSchema.safeParse({ organizationId: org, id: str(f, 'id') });
  if (!p.success) redirect(back(PATH, { org }, { ok: false, code: 'invalid_response' }));
  const r = await inboundCancel(p.data.organizationId, p.data.id);
  redirect(back(PATH, { org }, r.ok ? { ok: true } : r));
}
