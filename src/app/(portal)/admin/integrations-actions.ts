'use server';

import { redirect } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminRevokeKeySchema } from '@/lib/portal/integrations/schemas';
import { adminApiKeyRevoke, adminWorkerTokenCreate, newWorkerToken } from '@/lib/portal/integrations/server';
import { messageFor } from '@/lib/portal/commerce/messages';
import { back } from '@/components/portal/commerce-ui';
import type { SecretState } from '@/components/portal/one-time-secret';

/** Staff actions of the integration platform: revoke any key (org.manage) and register a new delivery worker credential (flags.write plus a fresh step-up, checked by the database). */
const PATH = '/admin/integrations';

export async function adminRevokeKeyAction(f: FormData): Promise<void> {
  await requireStaffCapability(PATH, 'org.manage');
  const p = adminRevokeKeySchema.safeParse({ id: String(f.get('id') ?? '').trim() });
  if (!p.success) redirect(back(PATH, {}, { ok: false, code: 'invalid_response' }));
  const r = await adminApiKeyRevoke(p.data.id);
  redirect(back(PATH, {}, r.ok ? { ok: true } : r));
}

export async function createWorkerTokenAction(_prev: SecretState): Promise<SecretState> {
  await requireStaffCapability(PATH, 'flags.write');
  const { token, hash } = newWorkerToken();
  const r = await adminWorkerTokenCreate(hash);
  return r.ok
    ? { status: 'created', secret: token, note: 'Set this value as INTEGRATION_WORKER_TOKEN in the deployment environment (next to CRON_SECRET). It is shown only once; creating a new token revokes the previous one.' }
    : { status: 'error', message: messageFor(r.code) };
}
