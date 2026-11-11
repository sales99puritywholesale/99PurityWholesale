'use server';

import { redirect } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { parseDollarsToCents } from '@/lib/portal/billing/schemas';
import { fundingSetSchema, gateRecordSchema, goLiveSchema, itemReviewSchema, setupInvoicesSchema, stepReviewSchema, uuid } from '@/lib/portal/onboarding/schemas';
import {
  adminAgreementOffer, adminFundingSet, adminGateRecord, adminGoLive, adminLabelReview, adminMappingReview, adminSetupInvoicesCreate, adminStepReview, uploadDocument,
} from '@/lib/portal/onboarding/server';
import { back } from '@/components/portal/commerce-ui';

/**
 * Staff actions of P5. Each one: (1) page-level gate (verified staff context holds the capability), (2) strict input validation, (3) the RPC, which re-checks the verified staff
 * session, the capability and (setup invoices, funding, gates, go-live) a FRESH step-up in the database, enforces the step rules and the compliance gates, and writes the audit row.
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const orgPath = (org: string) => (uuid.safeParse(org).success ? `/admin/fulfillment/${org}` : '/admin/fulfillment');
const result = (path: string, r: { ok: true } | { ok: false; code: string }) => redirect(back(path, {}, r.ok ? { ok: true } : r));
const invalid = (path: string) => redirect(back(path, {}, { ok: false, code: 'invalid_response' }));

export async function offerAgreementAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const path = orgPath(org);
  await requireStaffCapability(path, 'onboarding.review');
  const file = f.get('file');
  if (!uuid.safeParse(org).success || !(file instanceof File) || file.size === 0) return invalid(path);
  const up = await uploadDocument(org, file, 'agreement', 'staff');
  if (!up.ok) return result(path, up);
  return result(path, await adminAgreementOffer(org, up.data.documentId));
}

export async function reviewMappingAction(f: FormData): Promise<void> {
  const path = orgPath(str(f, 'organizationId').slice(0, 36));
  await requireStaffCapability(path, 'onboarding.review');
  const p = itemReviewSchema.safeParse({ id: str(f, 'id'), decision: str(f, 'decision'), ...(str(f, 'reason') ? { reason: str(f, 'reason') } : {}) });
  if (!p.success) return invalid(path);
  return result(path, await adminMappingReview(p.data.id, p.data.decision, p.data.reason));
}

export async function reviewLabelAction(f: FormData): Promise<void> {
  const path = orgPath(str(f, 'organizationId').slice(0, 36));
  await requireStaffCapability(path, 'onboarding.review');
  const p = itemReviewSchema.safeParse({ id: str(f, 'id'), decision: str(f, 'decision'), ...(str(f, 'reason') ? { reason: str(f, 'reason') } : {}) });
  if (!p.success) return invalid(path);
  return result(path, await adminLabelReview(p.data.id, p.data.decision, p.data.reason));
}

export async function reviewStepAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const path = orgPath(org);
  await requireStaffCapability(path, 'onboarding.review');
  const p = stepReviewSchema.safeParse({
    organizationId: org, stepNo: Number(str(f, 'stepNo')), decision: str(f, 'decision'), ...(str(f, 'reason') ? { reason: str(f, 'reason') } : {}),
    ...(str(f, 'instructions') ? { instructions: str(f, 'instructions') } : {}),
  });
  if (!p.success) return invalid(path);
  return result(path, await adminStepReview(org, p.data.stepNo, p.data.decision, p.data.reason, p.data.instructions));
}

export async function createSetupInvoicesAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const path = orgPath(org);
  await requireStaffCapability(path, 'financial.write');
  const setup = str(f, 'setup') === '' ? 0 : parseDollarsToCents(str(f, 'setup'));
  const funding = str(f, 'funding') === '' ? 0 : parseDollarsToCents(str(f, 'funding'));
  const p = setupInvoicesSchema.safeParse({ organizationId: org, setupFeeCents: setup ?? -1, fundingCents: funding ?? -1 });
  if (!p.success) return invalid(path);
  return result(path, await adminSetupInvoicesCreate(org, p.data.setupFeeCents, p.data.fundingCents));
}

export async function setFundingAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const path = orgPath(org);
  await requireStaffCapability(path, 'financial.write');
  const p = fundingSetSchema.safeParse({ organizationId: org, type: str(f, 'type'), ...(str(f, 'reason') ? { reason: str(f, 'reason') } : {}) });
  if (!p.success || (p.data.type !== 'waived' && p.data.type !== 'credit_terms') || !p.data.reason) return invalid(path);
  return result(path, await adminFundingSet(org, p.data.type, p.data.reason));
}

export async function recordGateAction(f: FormData): Promise<void> {
  const path = '/admin/fulfillment/gates';
  await requireStaffCapability(path, 'gates.write');
  const p = gateRecordSchema.safeParse({ code: str(f, 'code'), status: str(f, 'status'), note: str(f, 'note') });
  if (!p.success) return invalid(path);
  return result(path, await adminGateRecord(p.data.code, p.data.status, p.data.note));
}

export async function goLiveAction(f: FormData): Promise<void> {
  const org = str(f, 'organizationId').slice(0, 36);
  const path = orgPath(org);
  await requireStaffCapability(path, 'onboarding.golive');
  const p = goLiveSchema.safeParse({ organizationId: org });
  if (!p.success) return invalid(path);
  return result(path, await adminGoLive(org));
}
