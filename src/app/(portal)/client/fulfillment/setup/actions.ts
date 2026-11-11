'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import {
  acknowledgeSchema, agreementAcceptSchema, labelDesignSchema, launchSubmissionSchema, packagingSelectSchema, skuMappingSchema, storeConnectionSchema, uuid,
} from '@/lib/portal/onboarding/schemas';
import { agreementAccept, labelDesignAdd, packagingSelect, skuMappingDelete, skuMappingSave, stepSubmit, storeConnectionSave, uploadDocument } from '@/lib/portal/onboarding/server';
import { back } from '@/components/portal/commerce-ui';

/**
 * Customer actions of the fulfillment setup. Each one: (1) signed-in user, (2) strict validation, (3) the RPC, which re-checks that the caller is an OWNER of the
 * organization, that the step is unlocked and that every precondition holds, then writes the audit row. No step status, review result or price is ever accepted from the browser.
 */
const PATH = '/client/fulfillment/setup';
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const optStr = (f: FormData, k: string) => (str(f, k) === '' ? undefined : str(f, k));
const numOrUndef = (f: FormData, k: string) => (str(f, k) === '' ? undefined : Number(str(f, k)));
const orgOf = (f: FormData) => str(f, 'organizationId').slice(0, 36);
const bad = (org: string) => redirect(back(PATH, { org }, { ok: false, code: 'invalid_response' }));
const done = (org: string, r: { ok: true } | { ok: false; code: string }) => redirect(back(PATH, { org }, r.ok ? { ok: true } : r));

export async function saveSkuAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const p = skuMappingSchema.safeParse({
    organizationId: org, source: str(f, 'source'), ...(optStr(f, 'variantId') ? { variantId: str(f, 'variantId') } : {}), ...(optStr(f, 'productName') ? { productName: str(f, 'productName') } : {}),
    ...(optStr(f, 'spec') ? { spec: str(f, 'spec') } : {}), externalSku: str(f, 'externalSku'), unitsPerPack: numOrUndef(f, 'unitsPerPack') ?? 0,
    ...(optStr(f, 'barcode') ? { barcode: str(f, 'barcode') } : {}), ...(numOrUndef(f, 'weightGrams') !== undefined ? { weightGrams: numOrUndef(f, 'weightGrams') } : {}),
  });
  if (!p.success) return bad(org);
  return done(org, await skuMappingSave(p.data));
}

export async function deleteSkuAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const id = uuid.safeParse(str(f, 'id'));
  if (!id.success || !uuid.safeParse(org).success) return bad(org);
  return done(org, await skuMappingDelete(org, id.data));
}

/** Uploads label artwork (PDF, PNG or JPEG up to 10 MB; the file bytes are checked) and attaches it to a product mapping. */
export async function uploadLabelAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const file = f.get('file');
  const p = labelDesignSchema.omit({ documentId: true }).safeParse({ organizationId: org, skuMappingId: str(f, 'skuMappingId'), template: str(f, 'template') });
  if (!p.success || !(file instanceof File) || file.size === 0) return bad(org);
  const up = await uploadDocument(org, file, 'label_artwork', 'customer');
  if (!up.ok) return done(org, up);
  return done(org, await labelDesignAdd(org, p.data.skuMappingId, p.data.template, up.data.documentId));
}

export async function selectPackagingAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const p = packagingSelectSchema.safeParse({ organizationId: org, optionId: str(f, 'optionId'), ...(optStr(f, 'notes') ? { notes: str(f, 'notes') } : {}) });
  if (!p.success) return bad(org);
  return done(org, await packagingSelect(org, p.data.optionId, p.data.notes));
}

export async function saveStoreAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const p = storeConnectionSchema.safeParse({
    organizationId: org, method: str(f, 'method'), ...(optStr(f, 'storeUrl') ? { storeUrl: str(f, 'storeUrl') } : {}), ...(optStr(f, 'webhookUrl') ? { webhookUrl: str(f, 'webhookUrl') } : {}),
    ...(optStr(f, 'notes') ? { notes: str(f, 'notes') } : {}),
  });
  if (!p.success) return bad(org);
  return done(org, await storeConnectionSave(org, p.data.method, p.data.storeUrl, p.data.webhookUrl, p.data.notes));
}

/** Signing: a typed name and title, an explicit accept, and optionally an uploaded signed copy. Staff verify it when they approve step 6. */
export async function acceptAgreementAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const p = agreementAcceptSchema.omit({ signedDocumentId: true }).safeParse({ organizationId: org, signerName: str(f, 'signerName'), signerTitle: str(f, 'signerTitle'), accept: f.get('accept') === 'on' });
  if (!p.success) return bad(org);
  let signedId: string | undefined;
  const file = f.get('file');
  if (file instanceof File && file.size > 0) {
    const up = await uploadDocument(org, file, 'agreement_signed', 'customer');
    if (!up.ok) return done(org, up);
    signedId = up.data.documentId;
  }
  return done(org, await agreementAccept(org, p.data.signerName, p.data.signerTitle, signedId));
}

/** Submits step 1 to 5, 7 or 8 for review. Step 7 carries an acknowledgement; step 8 carries the launch details; the others carry nothing. */
export async function submitStepAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const stepNo = Number(str(f, 'stepNo'));
  if (!uuid.safeParse(org).success || !Number.isInteger(stepNo) || ![1, 2, 3, 4, 5, 7, 8].includes(stepNo)) return bad(org);
  let data: Record<string, unknown> = {};
  if (stepNo === 7) {
    if (!acknowledgeSchema.safeParse({ organizationId: org, acknowledge: f.get('acknowledge') === 'on' }).success) return bad(org);
    data = { acknowledge: true };
  }
  if (stepNo === 8) {
    const contact = (p: string) => ({ name: str(f, `${p}Name`), email: str(f, `${p}Email`), ...(optStr(f, `${p}Phone`) ? { phone: str(f, `${p}Phone`) } : {}) });
    const parsed = launchSubmissionSchema.safeParse({
      organizationId: org, contacts: [contact('contact')], escalation: contact('escalation'),
      returnAddress: { name: str(f, 'raName'), line1: str(f, 'raLine1'), ...(optStr(f, 'raLine2') ? { line2: str(f, 'raLine2') } : {}), city: str(f, 'raCity'), region: str(f, 'raRegion'), postal: str(f, 'raPostal'), country: str(f, 'raCountry').toUpperCase() },
      confirmations: { accurate: f.get('cAccurate') === 'on', labelsApproved: f.get('cLabels') === 'on', terms: f.get('cTerms') === 'on' },
    });
    if (!parsed.success) return bad(org);
    const { organizationId: _o, ...rest } = parsed.data;
    void _o;
    data = rest;
  }
  return done(org, await stepSubmit(org, stepNo, data));
}

