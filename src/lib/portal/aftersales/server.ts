import 'server-only';
import { z } from 'zod';
import { createPortalServerClient } from '@/portal/db/server';
import { call, cents, done, type Result } from '../rpc-call';
import { checkUpload } from '../onboarding/files';
import { documentPath } from '../onboarding/steps';
import { reportDef, type ReportKey } from './model';
import { dispatchOutbox, getEmailAdapter, type DispatchSummary } from './sender';

/**
 * Typed access to the P9 RPCs (supabase/review/p9/20261111000600_p9_aftersales.sql). Everything runs with the signed-in user's session: the database decides who may do what.
 * Staff screens must pass requireStaffCapability() first (defence in depth: every RPC re-checks). No service-role key is used anywhere.
 */
const iso = z.string();
const signed = z.number().int();

// ---------------------------------------------------------------------------------------------------------------- certificates
const certRow = z.object({
  id: z.string().uuid(), title: z.string(), issued_on: z.string().nullable(), status: z.enum(['published', 'withdrawn']), lot_number: z.string().nullable(), product_name: z.string().nullable(),
  order_number: z.string().nullable(), file_name: z.string(), storage_path: z.string().nullable(), created_at: iso,
});
export type CertificateRow = z.infer<typeof certRow>;
export const certificatesList = (organizationId: string) => call('rpc_certificates_list', { p_organization_id: organizationId }, z.object({ certificates: z.array(certRow) }));

const adminCertRow = z.object({
  id: z.string().uuid(), organization_id: z.string().uuid(), organization_name: z.string(), title: z.string(), issued_on: z.string().nullable(), status: z.enum(['published', 'withdrawn']),
  lot_number: z.string().nullable(), order_number: z.string().nullable(), file_name: z.string(), storage_path: z.string(), withdraw_reason: z.string().nullable(), created_at: iso,
});
export type AdminCertificateRow = z.infer<typeof adminCertRow>;
export const adminCertificatesList = (organizationId: string | null) => call('rpc_admin_certificates_list', { p_organization_id: organizationId }, z.object({ certificates: z.array(adminCertRow) }));
export const adminCertificateTargets = (organizationId: string) =>
  call('rpc_admin_certificate_targets', { p_organization_id: organizationId }, z.object({
    lots: z.array(z.object({ id: z.string().uuid(), lot_number: z.string(), product_name: z.string().nullable(), expires_on: z.string().nullable() })),
    orders: z.array(z.object({ id: z.string().uuid(), order_number: z.string(), status: z.string() })),
  }));
export const adminCertificateWithdraw = (id: string, reason: string) => call('rpc_admin_certificate_withdraw', { p_id: id, p_reason: reason }, done);

/**
 * Stores a certificate file in the private bucket and publishes it in one database call. The bytes are sniffed (PDF, PNG or JPEG only, at most 10 MB) before upload; the path is
 * `<organization id>/<new document id>.<ext>` and the RPC reads the REAL object back from storage, so the stored size and type never come from the caller.
 */
export async function adminCertificatePublish(i: { organizationId: string; file: File; title: string; issuedOn?: string; lotId?: string; orderId?: string }): Promise<Result<{ id: string }>> {
  try {
    const bytes = new Uint8Array(await i.file.arrayBuffer());
    const chk = checkUpload(i.file.name, bytes.subarray(0, 16), bytes.byteLength);
    if (!chk.ok) return { ok: false, code: chk.code };
    const documentId = crypto.randomUUID();
    const supabase = createPortalServerClient();
    const up = await supabase.storage.from('portal-documents').upload(documentPath(i.organizationId, documentId, chk.contentType), bytes, { contentType: chk.contentType, upsert: false });
    if (up.error) return { ok: false, code: 'unavailable' };
    return call('rpc_admin_certificate_publish', {
      p_organization_id: i.organizationId, p_document_id: documentId, p_file_name: chk.fileName, p_lot_id: i.lotId ?? null, p_order_id: i.orderId ?? null, p_title: i.title, p_issued_on: i.issuedOn ?? null,
    }, z.object({ id: z.string().uuid() }));
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

// ---------------------------------------------------------------------------------------------------------------- commissions (customer)
const entryRow = z.object({
  id: z.string().uuid(), entry_type: z.enum(['accrual', 'adjustment', 'payout']), amount_cents: signed, base_cents: z.number().int().nullable(), rate_bps: z.number().int().nullable(),
  available_at: iso.nullable(), created_at: iso, reason: z.string().nullable(), referral: z.string().nullable(),
});
export type CommissionEntryRow = z.infer<typeof entryRow>;
const enrolled = z.object({
  enrolled: z.literal(true), code: z.string(), code_active: z.boolean(), plan_name: z.string(), rate_bps: z.number().int(), hold_days: z.number().int(), pending_cents: signed, available_cents: signed, paid_out_cents: cents,
  referrals: z.array(z.object({ label: z.string(), status: z.enum(['active', 'ended']), started_on: z.string() })), entries: z.array(entryRow),
});
export const commissionsGet = (organizationId: string) => call('rpc_commissions_get', { p_organization_id: organizationId }, z.union([enrolled, z.object({ enrolled: z.literal(false) })]));

// ---------------------------------------------------------------------------------------------------------------- commissions (admin)
const planRow = z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), rate_bps: z.number().int(), hold_days: z.number().int(), active: z.boolean() });
export type PlanRow = z.infer<typeof planRow>;
const codeRow = z.object({
  id: z.string().uuid(), organization_id: z.string().uuid(), organization_name: z.string(), code: z.string(), plan_code: z.string(), active: z.boolean(), referred_count: z.number().int(),
  pending_cents: signed, available_cents: signed, paid_out_cents: cents,
});
export type ReferralCodeRow = z.infer<typeof codeRow>;
export const adminCommissionOverview = () =>
  call('rpc_admin_commission_overview', {}, z.object({
    plans: z.array(planRow), codes: z.array(codeRow),
    referrals: z.array(z.object({ id: z.string().uuid(), referrer_name: z.string(), referred_name: z.string(), status: z.enum(['active', 'ended']), started_on: z.string() })),
    payouts: z.array(z.object({ id: z.string().uuid(), organization_name: z.string(), amount_cents: cents, method: z.string(), reference: z.string().nullable(), paid_on: z.string() })),
  }));
export const adminPlanSave = (i: { code: string; name: string; rateBps: number; holdDays: number }) => call('rpc_admin_commission_plan_save', { p_code: i.code, p_name: i.name, p_rate_bps: i.rateBps, p_hold_days: i.holdDays }, done);
export const adminPlanSetActive = (planId: string, active: boolean) => call('rpc_admin_commission_plan_set_active', { p_plan_id: planId, p_active: active }, done);
export const adminReferralEnroll = (organizationId: string, planId: string) => call('rpc_admin_referral_code_enroll', { p_organization_id: organizationId, p_plan_id: planId }, done);
export const adminReferralLink = (referredOrgId: string, code: string) => call('rpc_admin_referral_link', { p_referred_org_id: referredOrgId, p_code: code }, done);
export const adminReferralEnd = (id: string, reason: string) => call('rpc_admin_referral_end', { p_id: id, p_reason: reason }, done);
export const adminCommissionsAccrue = () => call('rpc_admin_commissions_accrue', {}, z.object({ accrued: z.number().int() }));
export const adminCommissionPayout = (i: { organizationId: string; amountCents: number; method: string; reference?: string; paidOn: string; idempotencyKey: string }) =>
  call('rpc_admin_commission_payout', { p_organization_id: i.organizationId, p_amount_cents: i.amountCents, p_method: i.method, p_reference: i.reference ?? null, p_paid_on: i.paidOn, p_idempotency_key: i.idempotencyKey }, done);
export const adminCommissionAdjust = (i: { organizationId: string; amountCents: number; reason: string; idempotencyKey: string }) =>
  call('rpc_admin_commission_adjust', { p_organization_id: i.organizationId, p_amount_cents: i.amountCents, p_reason: i.reason, p_idempotency_key: i.idempotencyKey }, done);

// ---------------------------------------------------------------------------------------------------------------- notifications
const prefRow = z.object({ category: z.enum(['certificates', 'commissions', 'fulfillment']), enabled: z.boolean() });
export type PrefRow = z.infer<typeof prefRow>;
export const notificationPrefsGet = () => call('rpc_notification_prefs_get', {}, z.object({ preferences: z.array(prefRow) }));
export const notificationPrefSet = (category: string, enabled: boolean) => call('rpc_notification_pref_set', { p_category: category, p_enabled: enabled }, done);

const templateRow = z.object({ key: z.string(), category: z.string(), subject: z.string(), body: z.string(), variables: z.array(z.string()), updated_at: iso });
export type TemplateRow = z.infer<typeof templateRow>;
export const adminTemplatesList = () => call('rpc_admin_templates_list', {}, z.object({ templates: z.array(templateRow) }));
export const adminTemplateSave = (key: string, subject: string, body: string) => call('rpc_admin_template_save', { p_key: key, p_subject: subject, p_body: body }, done);
export const adminNotificationsScan = () => call('rpc_admin_notifications_scan', {}, z.object({ queued: z.number().int() }));
const outboxRow = z.object({
  id: z.string().uuid(), template_key: z.string(), recipient_email: z.string(), organization_name: z.string(), subject: z.string(), status: z.enum(['queued', 'sending', 'sent', 'failed']),
  attempts: z.number().int(), last_error: z.string().nullable(), created_at: iso, sent_at: iso.nullable(),
});
export type OutboxRow = z.infer<typeof outboxRow>;
export const adminOutboxList = (status: string | null) => call('rpc_admin_outbox_list', { p_status: status }, z.object({ counts: z.record(z.string(), z.number().int()), messages: z.array(outboxRow) }));

const claimed = z.object({ messages: z.array(z.object({ id: z.string().uuid(), to: z.string(), subject: z.string(), body: z.string() })) });

/**
 * Sends the due messages through the configured provider. With no provider connected (the case today) nothing is claimed and nothing changes: the messages stay queued and the caller
 * is told so. Each result is written back one by one, so a crash between two sends leaves at most one message to be re-claimed after the 10 minute window.
 */
export async function adminOutboxDispatch(): Promise<Result<DispatchSummary & { noProvider: boolean }>> {
  const adapter = getEmailAdapter();
  if (!adapter) return { ok: true, data: { claimed: 0, sent: 0, unsent: 0, recordFailures: 0, noProvider: true } };
  let claimFailure: string | null = null;
  const summary = await dispatchOutbox(
    adapter,
    async () => {
      const r = await call('rpc_admin_outbox_claim', { p_limit: 20 }, claimed);
      if (!r.ok) { claimFailure = r.code; return null; }
      return r.data.messages;
    },
    async (id, result) => (await call('rpc_admin_outbox_record', { p_id: id, p_success: result.ok, p_error: result.ok ? null : result.error, p_provider_ref: result.ok ? result.providerRef ?? null : null }, done)).ok,
  );
  return claimFailure ? { ok: false, code: claimFailure } : { ok: true, data: { ...summary, noProvider: false } };
}

// ---------------------------------------------------------------------------------------------------------------- reports
export type ReportRows = { report: ReportKey; from: string; to: string; truncated: boolean; rows: Record<string, unknown>[] };
export async function adminReport(report: ReportKey, from: string | null, to: string | null): Promise<Result<ReportRows>> {
  if (!reportDef(report)) return { ok: false, code: 'invalid_response' };
  return call('rpc_admin_report', { p_report: report, p_from: from, p_to: to }, z.object({
    report: z.enum(['sales', 'receivables', 'inventory', 'commissions']), from: z.string(), to: z.string(), truncated: z.boolean(), rows: z.array(z.record(z.string(), z.unknown())),
  }));
}
