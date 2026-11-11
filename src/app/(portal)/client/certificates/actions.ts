'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { orgIdSchema, uuid } from '@/lib/portal/aftersales/schemas';
import { certificatesList } from '@/lib/portal/aftersales/server';
import { documentUrl } from '@/lib/portal/onboarding/server';
import { back } from '@/components/portal/commerce-ui';

const PATH = '/client/certificates';

/**
 * Opens a short-lived (5 minute) download link for one certificate. The certificate is looked up through the customer RPC first (it only returns this user's organization's PUBLISHED
 * certificates), so a made-up id or another organization's file can never be opened; the storage policies check the organization again.
 */
export async function downloadCertificateAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = String(f.get('organizationId') ?? '').trim().slice(0, 36);
  const o = orgIdSchema.safeParse({ organizationId: org });
  const id = uuid.safeParse(String(f.get('id') ?? '').trim());
  if (!o.success || !id.success) redirect(back(PATH, {}, { ok: false, code: 'invalid_response' }));
  const list = await certificatesList(o.data.organizationId);
  const row = list.ok ? list.data.certificates.find((c) => c.id === id.data && c.status === 'published') : undefined;
  const url = row?.storage_path ? await documentUrl(row.storage_path) : null;
  if (!url) redirect(back(PATH, { org }, { ok: false, code: 'document_not_found' }));
  redirect(url);
}
