import 'server-only';
import { z } from 'zod';
import { createPortalServerClient } from '@/portal/db/server';
import { call, cents, done, type Result } from '../rpc-call';
import { checkUpload } from './files';
import { documentPath, type DocumentKind } from './steps';

/**
 * Typed access to the P5 RPCs (supabase/review/p5/20261111000200_p5_fulfillment_onboarding.sql) and to the private document bucket. Everything runs with the signed-in user's
 * session: the database decides who may do what. Callers must have authenticated the user and, for staff screens, passed requireStaffCapability() first.
 */
const stepStatus = z.enum(['todo', 'in_progress', 'submitted', 'approved', 'rejected']);
const reviewStatus = z.enum(['draft', 'submitted', 'approved', 'rejected']);
const docRef = z.object({ id: z.string().uuid(), file_name: z.string(), storage_path: z.string() });

const stateSchema = z.object({
  started: z.boolean(),
  instance: z.object({ status: z.enum(['in_progress', 'live']), live_at: z.string().nullable() }),
  steps: z.array(z.object({
    step_no: z.number().int().min(1).max(9), key: z.string(), title: z.string(), owner: z.enum(['customer', 'staff']), depends_on: z.array(z.number().int()),
    status: stepStatus, version: z.number().int(), submitted_at: z.string().nullable(), review_reason: z.string().nullable(), review_instructions: z.string().nullable(),
  })),
  mappings: z.array(z.object({
    id: z.string().uuid(), source: z.enum(['catalog', 'private']), variant_id: z.string().uuid().nullable(), product_name: z.string().nullable(), spec: z.string().nullable(),
    internal_sku: z.string(), external_sku: z.string(), units_per_pack: z.number().int(), barcode: z.string().nullable(), weight_grams: z.number().int().nullable(),
    status: reviewStatus, review_reason: z.string().nullable(),
  })),
  labels: z.array(z.object({
    id: z.string().uuid(), sku_mapping_id: z.string().uuid(), template: z.enum(['ml3', 'ml10']), status: reviewStatus, review_reason: z.string().nullable(),
    document_id: z.string().uuid(), file_name: z.string(), storage_path: z.string(),
  })),
  packaging: z.object({
    options: z.array(z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), description: z.string(), fee_cents: cents })),
    selection: z.object({ option_id: z.string().uuid(), notes: z.string().nullable() }).nullable(),
  }),
  store: z.object({ method: z.enum(['api', 'woocommerce', 'shopify', 'manual']), store_url: z.string().nullable(), webhook_url: z.string().nullable(), notes: z.string().nullable(), status: z.enum(['draft', 'submitted', 'verified', 'rejected']), review_reason: z.string().nullable() }).nullable(),
  agreement: z.object({
    status: z.enum(['offered', 'signed']), signer_name: z.string().nullable(), signer_title: z.string().nullable(), signed_at: z.string().nullable(),
    offered_document: docRef, signed_document: docRef.nullable(),
  }).nullable(),
  funding: z.object({
    type: z.enum(['prepay_invoice', 'deposit_invoice', 'credit_terms', 'waived']), amount_cents: cents, status: z.enum(['unmet', 'met', 'waived']), met: z.boolean(),
    invoice_id: z.string().uuid().nullable(), invoice_number: z.string().nullable(), invoice_status: z.string().nullable(),
  }).nullable(),
  setup_invoice: z.object({ invoice_id: z.string().uuid(), invoice_number: z.string(), status: z.string(), total_cents: cents, paid_cents: cents }).nullable(),
  test_order_ready: z.boolean(),
});
export type OnboardingState = z.infer<typeof stateSchema>;

// ---------------------------------------------------------------------------------------------------------------- documents
export type UploadResult = Result<{ documentId: string }>;

/**
 * Stores a file in the private bucket and registers it. The bytes are sniffed (PDF, PNG or JPEG only, at most 10 MB) before upload; the path is `<organization id>/<new document id>.<ext>`
 * and the registering RPC reads the REAL object back from storage, so the stored size and type never come from the caller.
 */
export async function uploadDocument(organizationId: string, file: File, kind: DocumentKind, who: 'customer' | 'staff'): Promise<UploadResult> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chk = checkUpload(file.name, bytes.subarray(0, 16), bytes.byteLength);
    if (!chk.ok) return { ok: false, code: chk.code };
    const documentId = crypto.randomUUID();
    const path = documentPath(organizationId, documentId, chk.contentType);
    const supabase = createPortalServerClient();
    const up = await supabase.storage.from('portal-documents').upload(path, bytes, { contentType: chk.contentType, upsert: false });
    if (up.error) return { ok: false, code: 'unavailable' };
    const reg = who === 'staff'
      ? await call('rpc_admin_document_register', { p_organization_id: organizationId, p_document_id: documentId, p_kind: kind, p_file_name: chk.fileName }, done)
      : await call('rpc_document_register', { p_organization_id: organizationId, p_document_id: documentId, p_kind: kind, p_file_name: chk.fileName }, done);
    return reg.ok ? { ok: true, data: { documentId } } : reg;
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

/** A short-lived (5 minute) download link for a stored document; the storage policies decide whether this user may read it. */
export async function documentUrl(storagePath: string): Promise<string | null> {
  try {
    const supabase = createPortalServerClient();
    const { data, error } = await supabase.storage.from('portal-documents').createSignedUrl(storagePath, 300);
    return error || !data?.signedUrl ? null : data.signedUrl;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------- customer
export const onboardingGet = (organizationId: string) =>
  call('rpc_onboarding_get', { p_organization_id: organizationId }, z.object({ state: stateSchema, can_edit: z.boolean() }));

export type SkuMappingInput = {
  organizationId: string; id?: string; source: 'catalog' | 'private'; variantId?: string; productName?: string; spec?: string; externalSku: string; unitsPerPack: number; barcode?: string; weightGrams?: number;
};
export const skuMappingSave = (m: SkuMappingInput) =>
  call('rpc_sku_mapping_save', {
    p_organization_id: m.organizationId, p_id: m.id ?? null, p_source: m.source, p_variant_id: m.variantId ?? null, p_product_name: m.productName ?? null, p_spec: m.spec ?? null,
    p_external_sku: m.externalSku, p_units_per_pack: m.unitsPerPack, p_barcode: m.barcode ?? null, p_weight_grams: m.weightGrams ?? null,
  }, done);
export const skuMappingDelete = (organizationId: string, id: string) => call('rpc_sku_mapping_delete', { p_organization_id: organizationId, p_id: id }, done);
export const labelDesignAdd = (organizationId: string, skuMappingId: string, template: 'ml3' | 'ml10', documentId: string) =>
  call('rpc_label_design_add', { p_organization_id: organizationId, p_sku_mapping_id: skuMappingId, p_template: template, p_document_id: documentId }, done);
export const packagingSelect = (organizationId: string, optionId: string, notes?: string) =>
  call('rpc_packaging_select', { p_organization_id: organizationId, p_option_id: optionId, p_notes: notes ?? null }, done);
export const storeConnectionSave = (organizationId: string, method: string, storeUrl?: string, webhookUrl?: string, notes?: string) =>
  call('rpc_store_connection_save', { p_organization_id: organizationId, p_method: method, p_store_url: storeUrl ?? null, p_webhook_url: webhookUrl ?? null, p_notes: notes ?? null }, done);
export const agreementAccept = (organizationId: string, signerName: string, signerTitle: string, signedDocumentId?: string) =>
  call('rpc_agreement_accept', { p_organization_id: organizationId, p_signer_name: signerName, p_signer_title: signerTitle, p_signed_document_id: signedDocumentId ?? null }, done);
export const stepSubmit = (organizationId: string, stepNo: number, data: Record<string, unknown>) =>
  call('rpc_onboarding_step_submit', { p_organization_id: organizationId, p_step_no: stepNo, p_data: data }, done);

// ---------------------------------------------------------------------------------------------------------------- admin (staff)
const gate = z.object({ code: z.string(), status: z.enum(['not_recorded', 'recorded', 'revoked']), note: z.string().nullable(), recorded_at: z.string().nullable() });
export type Gate = z.infer<typeof gate>;
const listRow = z.object({
  organization_id: z.string().uuid(), organization_name: z.string(), organization_code: z.string(), started: z.boolean(), status: z.enum(['in_progress', 'live']),
  approved: z.number().int(), submitted_steps: z.array(z.number().int()),
});
export type OnboardingListRow = z.infer<typeof listRow>;
export const adminOnboardingList = () => call('rpc_admin_onboarding_list', {}, z.object({ organizations: z.array(listRow) }));

const adminDetail = z.object({
  organization: z.object({ id: z.string().uuid(), name: z.string(), code: z.string(), payment_terms: z.string() }),
  state: stateSchema,
  gates: z.array(gate),
  submissions: z.array(z.object({ step_no: z.number().int(), version: z.number().int(), data: z.record(z.string(), z.unknown()), submitted_at: z.string() })),
  events: z.array(z.object({ step_no: z.number().int().nullable(), event: z.string(), actor_kind: z.string(), note: z.string().nullable(), at: z.string() })),
});
export type AdminOnboardingDetail = z.infer<typeof adminDetail>;
export const adminOnboardingGet = (organizationId: string) => call('rpc_admin_onboarding_get', { p_organization_id: organizationId }, adminDetail);
export const adminAgreementOffer = (organizationId: string, documentId: string) => call('rpc_admin_agreement_offer', { p_organization_id: organizationId, p_document_id: documentId }, done);
export const adminMappingReview = (id: string, decision: 'approve' | 'reject', reason?: string) => call('rpc_admin_mapping_review', { p_id: id, p_decision: decision, p_reason: reason ?? null }, done);
export const adminLabelReview = (id: string, decision: 'approve' | 'reject', reason?: string) => call('rpc_admin_label_review', { p_id: id, p_decision: decision, p_reason: reason ?? null }, done);
export const adminStepReview = (organizationId: string, stepNo: number, decision: 'approve' | 'reject', reason?: string, instructions?: string) =>
  call('rpc_admin_step_review', { p_organization_id: organizationId, p_step_no: stepNo, p_decision: decision, p_reason: reason ?? null, p_instructions: instructions ?? null }, done);
export const adminSetupInvoicesCreate = (organizationId: string, setupCents: number, fundingCents: number) =>
  call('rpc_admin_setup_invoices_create', { p_organization_id: organizationId, p_setup_cents: setupCents, p_funding_cents: fundingCents }, done);
export const adminFundingSet = (organizationId: string, type: 'waived' | 'credit_terms', reason: string) =>
  call('rpc_admin_funding_set', { p_organization_id: organizationId, p_type: type, p_reason: reason }, done);
export const adminGatesList = () => call('rpc_admin_gates_list', {}, z.object({ gates: z.array(gate) }));
export const adminGateRecord = (code: string, status: 'recorded' | 'revoked', note: string) => call('rpc_admin_gate_record', { p_code: code, p_status: status, p_note: note }, done);
export const adminGoLive = (organizationId: string) => call('rpc_admin_go_live', { p_organization_id: organizationId }, done);

export { ONBOARDING_MESSAGES } from './messages';
