'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { profileSchema } from '@/lib/portal/admin-ops/schemas';
import { profileUpdate } from '@/lib/portal/admin-ops/server';
import { prefSchema } from '@/lib/portal/aftersales/schemas';
import { notificationPrefSet } from '@/lib/portal/aftersales/server';
import { back } from '@/components/portal/commerce-ui';

/** Updates the signed-in user's OWN name and phone number (the RPC only ever touches the caller's profile). The e-mail address is not editable here. */
export async function updateProfileAction(f: FormData): Promise<void> {
  const org = String(f.get('org') ?? '').trim().slice(0, 36);
  await requireUser('/client/account');
  const p = profileSchema.safeParse({ fullName: String(f.get('fullName') ?? '').trim(), phone: String(f.get('phone') ?? '').trim() });
  const params: Record<string, string> = /^[0-9a-f-]{36}$/.test(org) ? { org } : {};
  if (!p.success) redirect(back('/client/account', params, { ok: false, code: 'invalid_response' }));
  const r = await profileUpdate(p.data.fullName, p.data.phone);
  redirect(back('/client/account', params, r.ok ? { ok: true } : r));
}

/** Turns one OPTIONAL e-mail category on or off for the signed-in user. Billing messages are mandatory and have no switch. */
export async function setNotificationPrefAction(f: FormData): Promise<void> {
  const org = String(f.get('org') ?? '').trim().slice(0, 36);
  await requireUser('/client/account');
  const p = prefSchema.safeParse({ category: String(f.get('category') ?? '').trim(), enabled: String(f.get('enabled') ?? '') === 'true' });
  const params: Record<string, string> = /^[0-9a-f-]{36}$/.test(org) ? { org } : {};
  if (!p.success) redirect(back('/client/account', params, { ok: false, code: 'invalid_response' }));
  const r = await notificationPrefSet(p.data.category, p.data.enabled);
  redirect(back('/client/account', params, r.ok ? { ok: true } : r));
}
