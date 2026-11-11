'use server';

import { redirect } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { markupRuleSchema, orderStatusSchema, orgProductSchema, setVariantPriceSchema, uuid } from '@/lib/portal/commerce/schemas';
import { parseMarkupValue, parseUsdToCents } from '@/lib/portal/commerce/pricing';
import {
  adminMarkupRuleSet, adminOrderSetStatus, adminOrgCreate, adminOrgMemberAdd, adminOrgProductSet, adminProductSetStatus, adminVariantSetPrice,
} from '@/lib/portal/commerce/server';
import { back } from '@/components/portal/commerce-ui';

/**
 * Staff actions of P3. Each one: (1) page-level gate (verified staff context holds the capability), (2) strict input validation, (3) the RPC, which re-checks
 * the verified staff session, the capability and (for prices, markups and organization creation) a FRESH step-up in the database and writes the audit row.
 * A "step_up_required" result is shown as a message; nothing here can raise a price or markup without the database agreeing.
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? '');

export async function setVariantPriceAction(f: FormData): Promise<void> {
  await requireStaffCapability('/admin/products', 'org.manage');
  const q = str(f, 'q').slice(0, 60);
  const baseText = str(f, 'base').trim();
  const floorText = str(f, 'floor').trim();
  const base = baseText === '' ? null : parseUsdToCents(baseText);
  const floor = floorText === '' ? null : parseUsdToCents(floorText);
  const parsed = setVariantPriceSchema.safeParse({ variantId: str(f, 'variantId'), baseCents: base, floorCents: floor });
  if (!parsed.success || (baseText !== '' && base === null) || (floorText !== '' && floor === null)) redirect(back('/admin/products', { q }, { ok: false, code: 'invalid_response' }));
  const r = await adminVariantSetPrice(parsed.data.variantId, parsed.data.baseCents, parsed.data.floorCents);
  redirect(back('/admin/products', { q }, r.ok ? { ok: true } : r));
}

export async function setProductStatusAction(f: FormData): Promise<void> {
  await requireStaffCapability('/admin/products', 'org.manage');
  const q = str(f, 'q').slice(0, 60);
  const id = uuid.safeParse(str(f, 'productId'));
  const status = str(f, 'status');
  if (!id.success || (status !== 'active' && status !== 'archived')) redirect(back('/admin/products', { q }, { ok: false, code: 'invalid_response' }));
  const r = await adminProductSetStatus(id.data, status as 'active' | 'archived');
  redirect(back('/admin/products', { q }, r.ok ? { ok: true } : r));
}

export async function createOrgAction(f: FormData): Promise<void> {
  await requireStaffCapability('/admin/pricing', 'org.manage');
  const name = str(f, 'name').trim();
  const code = str(f, 'code').trim().toUpperCase();
  if (name.length < 1 || name.length > 200 || !/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(code)) redirect(back('/admin/pricing', {}, { ok: false, code: 'invalid_response' }));
  const r = await adminOrgCreate(name, code);
  redirect(back('/admin/pricing', {}, r.ok ? { ok: true } : r));
}

export async function addMemberAction(f: FormData): Promise<void> {
  await requireStaffCapability('/admin/pricing', 'members.manage');
  const org = uuid.safeParse(str(f, 'organizationId'));
  const email = str(f, 'email').trim().toLowerCase();
  const role = str(f, 'role');
  if (!org.success || email.length < 3 || email.length > 254 || !/^[^@\s]+@[^@\s]+$/.test(email) || (role !== 'owner' && role !== 'member')) redirect(back('/admin/pricing', {}, { ok: false, code: 'invalid_response' }));
  const r = await adminOrgMemberAdd(org.data, email, role as 'owner' | 'member');
  redirect(back(`/admin/pricing/${org.data}`, {}, r.ok ? { ok: true } : r));
}

/** One markup rule (Aspen: organization or representative, percent or fixed, all products or one product, representative bounds on organization rules). Fresh step-up is enforced by the RPC. */
export async function setMarkupRuleAction(f: FormData): Promise<void> {
  await requireStaffCapability('/admin/pricing', 'org.manage');
  const orgId = str(f, 'organizationId');
  const target = uuid.safeParse(orgId).success ? `/admin/pricing/${orgId}` : '/admin/pricing';
  const fail = (code: string): never => redirect(back(target, {}, { ok: false, code }));
  const type = str(f, 'type');
  if (type !== 'percent' && type !== 'fixed') return fail('invalid_response');
  const value = parseMarkupValue(type, str(f, 'value'));
  const optional = (name: string, t: 'percent' | 'fixed'): number | null | 'bad' => {
    const raw = str(f, name).trim();
    if (raw === '') return null;
    return parseMarkupValue(t, raw) ?? 'bad';
  };
  const kind = str(f, 'kind');
  const bounds = kind === 'organization' ? [optional('minPercent', 'percent'), optional('maxPercent', 'percent'), optional('minFixed', 'fixed'), optional('maxFixed', 'fixed')] : [null, null, null, null];
  if (value === null || bounds.includes('bad')) return fail('invalid_response');
  const product = str(f, 'productId').trim();
  const parsed = markupRuleSchema.safeParse({
    organizationId: orgId, kind, productId: product === '' ? null : product, type, valueE4: value,
    repMinPercentE4: bounds[0], repMaxPercentE4: bounds[1], repMinFixedE4: bounds[2], repMaxFixedE4: bounds[3], active: f.get('active') === 'on',
  });
  if (!parsed.success) return fail('invalid_response');
  const d = parsed.data;
  const r = await adminMarkupRuleSet({
    organizationId: d.organizationId, kind: d.kind, productId: d.productId, type: d.type, valueE4: d.valueE4,
    repMinPercentE4: d.repMinPercentE4, repMaxPercentE4: d.repMaxPercentE4, repMinFixedE4: d.repMinFixedE4, repMaxFixedE4: d.repMaxFixedE4, active: d.active,
  });
  redirect(back(`/admin/pricing/${d.organizationId}`, {}, r.ok ? { ok: true } : r));
}

export async function setOrgProductAction(f: FormData): Promise<void> {
  await requireStaffCapability('/admin/pricing', 'org.manage');
  const mode = str(f, 'mode');
  const q = str(f, 'q').slice(0, 60);
  const parsed = orgProductSchema.safeParse({
    organizationId: str(f, 'organizationId'), productId: str(f, 'productId'), assigned: mode !== 'unassign', available: mode === 'assign',
  });
  if (!parsed.success || !['assign', 'unassign', 'hide'].includes(mode)) redirect(back('/admin/pricing', {}, { ok: false, code: 'invalid_response' }));
  const r = await adminOrgProductSet(parsed.data.organizationId, parsed.data.productId, parsed.data.assigned, parsed.data.available);
  redirect(back(`/admin/pricing/${parsed.data.organizationId}`, { q }, r.ok ? { ok: true } : r));
}

export async function setOrderStatusAction(f: FormData): Promise<void> {
  await requireStaffCapability('/admin/orders', 'fulfillment.process');
  const note = str(f, 'note').trim();
  const parsed = orderStatusSchema.safeParse({ orderId: str(f, 'orderId'), to: str(f, 'to'), ...(note ? { note } : {}) });
  if (!parsed.success) redirect(back('/admin/orders', {}, { ok: false, code: 'invalid_response' }));
  const r = await adminOrderSetStatus(parsed.data.orderId, parsed.data.to, parsed.data.note);
  redirect(back(`/admin/orders/${parsed.data.orderId}`, {}, r.ok ? { ok: true } : r));
}
