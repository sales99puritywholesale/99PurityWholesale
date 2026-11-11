'use server';

import { redirect } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { parseDollarsToCents } from '@/lib/portal/billing/schemas';
import { documentUrl } from '@/lib/portal/onboarding/server';
import {
  adjustSchema, certificatePublishSchema, certificateWithdrawSchema, enrollSchema, payoutSchema, planActiveSchema, planSaveSchema, referralEndSchema, referralLinkSchema, templateSaveSchema, uuid,
} from '@/lib/portal/aftersales/schemas';
import {
  adminCertificatePublish, adminCertificateWithdraw, adminCertificatesList, adminCommissionAdjust, adminCommissionPayout, adminCommissionsAccrue, adminNotificationsScan, adminOutboxDispatch,
  adminPlanSave, adminPlanSetActive, adminReferralEnd, adminReferralEnroll, adminReferralLink, adminTemplateSave,
} from '@/lib/portal/aftersales/server';
import { back } from '@/components/portal/commerce-ui';

/**
 * Staff actions of P9. Each one: (1) page-level gate (verified staff context holds the capability), (2) strict input validation, (3) the RPC, which re-checks the verified staff
 * session and the capability, requires a FRESH step-up for every change that affects money or published documents, and writes the audit row.
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const CERTS = '/admin/inventory/certificates';
const COMMISSIONS = '/admin/commissions';
const NOTIFICATIONS = '/admin/notifications';
const go = (path: string, r: { ok: true } | { ok: false; code: string }, params: Record<string, string> = {}) => redirect(back(path, params, r.ok ? { ok: true } : r));
const bad = (path: string, params: Record<string, string> = {}) => redirect(back(path, params, { ok: false, code: 'invalid_response' }));
const opt = (f: FormData, k: string) => (str(f, k) === '' ? {} : { [k]: str(f, k) });
const orgParam = (org: string): Record<string, string> => (uuid.safeParse(org).success ? { org } : {});

// ---------------------------------------------------------------------------------------------------------------- certificates
export async function publishCertificateAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const params = orgParam(org);
  await requireStaffCapability(CERTS, 'inventory.adjust');
  const file = f.get('file');
  const p = certificatePublishSchema.safeParse({ organizationId: org, title: str(f, 'title'), ...opt(f, 'issuedOn'), ...opt(f, 'lotId'), ...opt(f, 'orderId') });
  if (!p.success) return bad(CERTS, params);
  if (!(file instanceof File) || file.size < 1) return go(CERTS, { ok: false, code: 'document_invalid' }, params);
  const r = await adminCertificatePublish({ organizationId: p.data.organizationId, file, title: p.data.title, issuedOn: p.data.issuedOn, lotId: p.data.lotId, orderId: p.data.orderId });
  return go(CERTS, r.ok ? { ok: true } : r, params);
}

export async function withdrawCertificateAction(f: FormData): Promise<void> {
  const params = orgParam(str(f, 'org').slice(0, 36));
  await requireStaffCapability(CERTS, 'inventory.adjust');
  const p = certificateWithdrawSchema.safeParse({ id: str(f, 'id'), reason: str(f, 'reason') });
  if (!p.success) return bad(CERTS, params);
  return go(CERTS, await adminCertificateWithdraw(p.data.id, p.data.reason), params);
}

/** Opens a staff member's own short-lived (5 minute) download link. The file is looked up through the RPC first, so only a registered certificate can be opened. */
export async function downloadAdminCertificateAction(f: FormData): Promise<void> {
  await requireStaffCapability(CERTS, 'documents.read');
  const id = uuid.safeParse(str(f, 'id'));
  if (!id.success) return bad(CERTS);
  const list = await adminCertificatesList(null);
  const row = list.ok ? list.data.certificates.find((c) => c.id === id.data) : undefined;
  const url = row ? await documentUrl(row.storage_path) : null;
  if (!url) return go(CERTS, { ok: false, code: 'document_not_found' });
  redirect(url);
}

// ---------------------------------------------------------------------------------------------------------------- commissions
export async function savePlanAction(f: FormData): Promise<void> {
  await requireStaffCapability(COMMISSIONS, 'financial.write');
  const pct = Number(str(f, 'ratePercent'));
  const p = planSaveSchema.safeParse({ code: str(f, 'code').toLowerCase(), name: str(f, 'name'), rateBps: Math.round(pct * 100), holdDays: Number(str(f, 'holdDays') || '14') });
  if (!p.success || !Number.isFinite(pct)) return bad(COMMISSIONS);
  return go(COMMISSIONS, await adminPlanSave(p.data));
}

export async function setPlanActiveAction(f: FormData): Promise<void> {
  await requireStaffCapability(COMMISSIONS, 'financial.write');
  const p = planActiveSchema.safeParse({ planId: str(f, 'planId'), active: str(f, 'active') === 'true' });
  if (!p.success) return bad(COMMISSIONS);
  return go(COMMISSIONS, await adminPlanSetActive(p.data.planId, p.data.active));
}

export async function enrollReferrerAction(f: FormData): Promise<void> {
  await requireStaffCapability(COMMISSIONS, 'financial.write');
  const p = enrollSchema.safeParse({ organizationId: str(f, 'organizationId'), planId: str(f, 'planId') });
  if (!p.success) return bad(COMMISSIONS);
  return go(COMMISSIONS, await adminReferralEnroll(p.data.organizationId, p.data.planId));
}

export async function linkReferralAction(f: FormData): Promise<void> {
  await requireStaffCapability(COMMISSIONS, 'financial.write');
  const p = referralLinkSchema.safeParse({ referredOrgId: str(f, 'referredOrgId'), code: str(f, 'code') });
  if (!p.success) return bad(COMMISSIONS);
  return go(COMMISSIONS, await adminReferralLink(p.data.referredOrgId, p.data.code));
}

export async function endReferralAction(f: FormData): Promise<void> {
  await requireStaffCapability(COMMISSIONS, 'financial.write');
  const p = referralEndSchema.safeParse({ id: str(f, 'id'), reason: str(f, 'reason') });
  if (!p.success) return bad(COMMISSIONS);
  return go(COMMISSIONS, await adminReferralEnd(p.data.id, p.data.reason));
}

export async function accrueCommissionsAction(): Promise<void> {
  await requireStaffCapability(COMMISSIONS, 'financial.write');
  return go(COMMISSIONS, await adminCommissionsAccrue());
}

export async function payoutAction(f: FormData): Promise<void> {
  await requireStaffCapability(COMMISSIONS, 'financial.write');
  const cents = parseDollarsToCents(str(f, 'amount'));
  const p = payoutSchema.safeParse({
    organizationId: str(f, 'organizationId'), amountCents: cents ?? 0, method: str(f, 'method'), ...opt(f, 'reference'), paidOn: str(f, 'paidOn'), idempotencyKey: str(f, 'idempotencyKey'),
  });
  if (!p.success) return bad(COMMISSIONS);
  return go(COMMISSIONS, await adminCommissionPayout(p.data));
}

/** A signed adjustment: "-25.00" takes commission away (a correction after an error), "25.00" adds it. The reason is stored on the ledger entry. */
export async function adjustCommissionAction(f: FormData): Promise<void> {
  await requireStaffCapability(COMMISSIONS, 'financial.write');
  const raw = str(f, 'amount');
  const negative = raw.startsWith('-');
  const cents = parseDollarsToCents(negative ? raw.slice(1) : raw);
  const p = adjustSchema.safeParse({ organizationId: str(f, 'organizationId'), amountCents: cents === null ? 0 : negative ? -cents : cents, reason: str(f, 'reason'), idempotencyKey: str(f, 'idempotencyKey') });
  if (!p.success) return bad(COMMISSIONS);
  return go(COMMISSIONS, await adminCommissionAdjust(p.data));
}

// ---------------------------------------------------------------------------------------------------------------- notifications
export async function scanNotificationsAction(): Promise<void> {
  await requireStaffCapability(NOTIFICATIONS, 'financial.write');
  const r = await adminNotificationsScan();
  return go(NOTIFICATIONS, r.ok ? { ok: true } : r);
}

/** Sends due messages. With no e-mail provider connected, nothing is claimed and the page says so. */
export async function dispatchOutboxAction(): Promise<void> {
  await requireStaffCapability(NOTIFICATIONS, 'org.manage');
  const r = await adminOutboxDispatch();
  if (!r.ok) return go(NOTIFICATIONS, r);
  if (r.data.noProvider) return go(NOTIFICATIONS, { ok: false, code: 'no_provider' });
  return go(NOTIFICATIONS, { ok: true });
}

export async function saveTemplateAction(f: FormData): Promise<void> {
  await requireStaffCapability(NOTIFICATIONS, 'flags.write');
  const p = templateSaveSchema.safeParse({ key: str(f, 'key'), subject: str(f, 'subject'), body: String(f.get('body') ?? '').replace(/\r\n/g, '\n').trim() });
  if (!p.success) return bad(NOTIFICATIONS);
  return go(NOTIFICATIONS, await adminTemplateSave(p.data.key, p.data.subject, p.data.body));
}
