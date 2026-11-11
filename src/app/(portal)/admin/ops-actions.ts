'use server';

import { redirect } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { parseDollarsToCents } from '@/lib/portal/billing/schemas';
import { applicationCreateSchema, applicationReviewSchema, feeRetireSchema, feeSaveSchema, memberAddSchema, memberSetSchema, orgStatusSchema, orgTermsSchema, settingSchema, uuid } from '@/lib/portal/admin-ops/schemas';
import {
  adminApplicationCreate, adminApplicationReview, adminFeeRetire, adminFeeSave, adminMemberSet, adminOrgMemberAdd, adminOrgSetStatus, adminOrgSetTerms, adminSettingSet,
} from '@/lib/portal/admin-ops/server';
import { back } from '@/components/portal/commerce-ui';

/**
 * Staff actions of P8. Each one: (1) page-level gate (verified staff context holds the capability), (2) strict input validation, (3) the RPC, which re-checks the verified staff
 * session and the capability, requires a FRESH step-up for every change that affects access or money, and writes the audit row.
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const orgPath = (org: string) => (uuid.safeParse(org).success ? `/admin/organizations/${org}` : '/admin/organizations');
const go = (path: string, r: { ok: true } | { ok: false; code: string }) => redirect(back(path, {}, r.ok ? { ok: true } : r));
const bad = (path: string) => redirect(back(path, {}, { ok: false, code: 'invalid_response' }));
const opt = (f: FormData, k: string) => (str(f, k) === '' ? {} : { [k]: str(f, k) });

export async function setOrgStatusAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const path = orgPath(org);
  await requireStaffCapability(path, 'org.manage');
  const p = orgStatusSchema.safeParse({ organizationId: org, status: str(f, 'status'), reason: str(f, 'reason') });
  if (!p.success) return bad(path);
  return go(path, await adminOrgSetStatus(org, p.data.status, p.data.reason));
}

export async function setOrgTermsAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const path = orgPath(org);
  await requireStaffCapability(path, 'org.manage');
  const terms = str(f, 'terms') === 'custom' ? `net${str(f, 'days')}` : str(f, 'terms');
  const p = orgTermsSchema.safeParse({ organizationId: org, terms });
  if (!p.success) return bad(path);
  return go(path, await adminOrgSetTerms(org, p.data.terms));
}

export async function memberSetAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const path = orgPath(org);
  await requireStaffCapability(path, 'members.manage');
  const p = memberSetSchema.safeParse({ organizationId: org, userId: str(f, 'userId'), action: str(f, 'action'), ...(str(f, 'role') ? { role: str(f, 'role') } : {}) });
  if (!p.success) return bad(path);
  return go(path, await adminMemberSet(org, p.data.userId, p.data.action, p.data.role));
}

export async function memberAddAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const path = orgPath(org);
  await requireStaffCapability(path, 'members.manage');
  const p = memberAddSchema.safeParse({ organizationId: org, email: str(f, 'email'), role: str(f, 'role') });
  if (!p.success) return bad(path);
  return go(path, await adminOrgMemberAdd(org, p.data.email, p.data.role));
}

export async function createApplicationAction(f: FormData): Promise<void> {
  const path = '/admin/applications';
  await requireStaffCapability(path, 'applications.review');
  const p = applicationCreateSchema.safeParse({ company: str(f, 'company'), contactName: str(f, 'contactName'), contactEmail: str(f, 'contactEmail'), ...opt(f, 'phone'), ...opt(f, 'website'), ...opt(f, 'message') });
  if (!p.success) return bad(path);
  return go(path, await adminApplicationCreate(p.data));
}

export async function reviewApplicationAction(f: FormData): Promise<void> {
  const path = '/admin/applications';
  await requireStaffCapability(path, 'applications.review');
  const p = applicationReviewSchema.safeParse({ id: str(f, 'id'), decision: str(f, 'decision'), ...(str(f, 'note') ? { note: str(f, 'note') } : {}), ...(str(f, 'orgCode') ? { orgCode: str(f, 'orgCode') } : {}) });
  if (!p.success) return bad(path);
  const r = await adminApplicationReview(p.data.id, p.data.decision, p.data.note, p.data.orgCode);
  if (r.ok && r.data.organization_id) redirect(back(`/admin/organizations/${r.data.organization_id}`, r.data.owner_added ? {} : { note: 'owner_pending' }, { ok: true }));
  return go(path, r.ok ? { ok: true } : r);
}

export async function saveSettingAction(f: FormData): Promise<void> {
  const path = '/admin/settings';
  await requireStaffCapability(path, 'flags.write');
  const p = settingSchema.safeParse({ key: str(f, 'key'), value: String(f.get('value') ?? '') });
  if (!p.success) return bad(path);
  return go(path, await adminSettingSet(p.data.key, p.data.value));
}

export async function saveFeeAction(f: FormData): Promise<void> {
  const path = '/admin/settings';
  await requireStaffCapability(path, 'financial.write');
  const raw = str(f, 'amount');
  const cents = /^0(\.0{1,2})?$/.test(raw) ? 0 : parseDollarsToCents(raw); // a free fee (0) is allowed; anything else must be an exact amount with at most two decimals
  const p = feeSaveSchema.safeParse({ code: str(f, 'code').toLowerCase(), name: str(f, 'name'), amountCents: cents ?? -1, unit: str(f, 'unit'), ...opt(f, 'note'), effectiveFrom: str(f, 'effectiveFrom') });
  if (!p.success) return bad(path);
  return go(path, await adminFeeSave(p.data));
}

export async function retireFeeAction(f: FormData): Promise<void> {
  const path = '/admin/settings';
  await requireStaffCapability(path, 'financial.write');
  const p = feeRetireSchema.safeParse({ code: str(f, 'code'), effectiveTo: str(f, 'effectiveTo') });
  if (!p.success) return bad(path);
  return go(path, await adminFeeRetire(p.data.code, p.data.effectiveTo));
}
