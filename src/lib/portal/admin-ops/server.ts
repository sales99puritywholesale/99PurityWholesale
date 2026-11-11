import 'server-only';
import { z } from 'zod';
import { call, cents, done } from '../rpc-call';

/**
 * Typed access to the P8 RPCs (supabase/review/p8/20261111000500_p8_admin_operations.sql) and to the P2 staff-management RPCs (migration 0004, applied). Everything runs with the
 * signed-in user's session: the database decides who may do what. Staff screens must pass requireStaffCapability() first (defence in depth: every RPC re-checks).
 */
const iso = z.string();
const orgStatus = z.enum(['active', 'suspended', 'closed']);

// ---------------------------------------------------------------------------------------------------------------- customer
export const paymentInstructions = () => call('rpc_payment_instructions', {}, z.object({ payment_instructions: z.string(), invoice_footer: z.string() }));
const feeRow = z.object({ code: z.string(), name: z.string(), amount_cents: cents, unit: z.enum(['flat', 'per_order', 'per_unit', 'per_box', 'per_pallet', 'per_month']), note: z.string().nullable(), effective_from: z.string() });
export type FeeRow = z.infer<typeof feeRow>;
export const feeScheduleCurrent = () => call('rpc_fee_schedule_current', {}, z.object({ fees: z.array(feeRow) }));
const memberRow = z.object({ role: z.enum(['owner', 'member']), name: z.string().nullable(), email: z.string().nullable(), joined: iso, is_me: z.boolean() });
export type OrgMemberRow = z.infer<typeof memberRow>;
export const orgMembersList = (organizationId: string) => call('rpc_org_members_list', { p_organization_id: organizationId }, z.object({ can_see_email: z.boolean(), members: z.array(memberRow) }));
export const profileGet = () => call('rpc_profile_get', {}, z.object({ email: z.string().nullable(), full_name: z.string().nullable(), phone: z.string().nullable() }));
export const profileUpdate = (fullName: string, phone: string) => call('rpc_profile_update', { p_full_name: fullName, p_phone: phone }, done);

// ---------------------------------------------------------------------------------------------------------------- admin: dashboard
const bucket = z.object({ count: z.number().int(), cents });
const statusCounts = z.record(z.string(), z.number().int());
const finance = z.object({
  invoiced_30d_cents: cents, collected_30d_cents: cents, outstanding_cents: cents, outstanding_count: z.number().int(), overdue_cents: cents, overdue_count: z.number().int(),
  pending_payments_count: z.number().int(), pending_payments_cents: cents, aging: z.record(z.string(), bucket),
  top_balances: z.array(z.object({ organization_name: z.string(), organization_code: z.string(), outstanding_cents: cents })),
});
export type FinanceKpis = z.infer<typeof finance>;
export const adminDashboard = () =>
  call('rpc_admin_dashboard', {}, z.object({
    can_see_finance: z.boolean(), finance: finance.nullable(),
    orders: z.object({ today: z.number().int(), last_7_days: z.number().int(), by_status: statusCounts }),
    fulfillment: z.object({ by_status: statusCounts, open_exceptions: z.number().int(), open_receipts: z.number().int(), onboarding_waiting: z.number().int(), webhook_failed_24h: z.number().int() }),
    organizations: z.object({ active: z.number().int(), suspended: z.number().int(), live: z.number().int() }),
    applications_new: z.number().int().nullable(),
  }));
export type AdminDashboard = Extract<Awaited<ReturnType<typeof adminDashboard>>, { ok: true }>['data'];

// ---------------------------------------------------------------------------------------------------------------- admin: organizations, applications, customers
const orgRow = z.object({ id: z.string().uuid(), name: z.string(), code: z.string(), status: orgStatus, payment_terms: z.string(), created_at: iso, members: z.number().int(), onboarding: z.string().nullable(), outstanding_cents: cents.nullable() });
export type OrgOverviewRow = z.infer<typeof orgRow>;
export const adminOrgsOverview = () => call('rpc_admin_orgs_overview', {}, z.object({ can_see_finance: z.boolean(), organizations: z.array(orgRow) }));
const detail = z.object({
  can_see_finance: z.boolean(), can_see_people: z.boolean(),
  organization: z.object({ id: z.string().uuid(), name: z.string(), code: z.string(), status: orgStatus, payment_terms: z.string(), created_at: iso }),
  members: z.array(z.object({ user_id: z.string().uuid(), role: z.enum(['owner', 'member']), status: z.enum(['active', 'removed']), joined: iso, email: z.string().nullable(), name: z.string().nullable() })),
  onboarding: z.object({ status: z.string(), approved: z.number().int() }).nullable(),
  orders: z.object({ count: z.number().int(), last_at: iso.nullable() }),
  fulfillment_open: z.number().int(),
  invoices: z.object({ outstanding_cents: cents, open_count: z.number().int() }).nullable(),
});
export type OrgDetail = z.infer<typeof detail>;
export const adminOrgDetail = (organizationId: string) => call('rpc_admin_org_detail', { p_organization_id: organizationId }, detail);
export const adminOrgSetStatus = (organizationId: string, status: string, reason: string) => call('rpc_admin_org_set_status', { p_organization_id: organizationId, p_status: status, p_reason: reason }, done);
export const adminOrgSetTerms = (organizationId: string, terms: string) => call('rpc_admin_org_set_terms', { p_organization_id: organizationId, p_terms: terms }, done);
export const adminMemberSet = (organizationId: string, userId: string, action: 'remove' | 'set_role', role?: string) =>
  call('rpc_admin_member_set', { p_organization_id: organizationId, p_user_id: userId, p_action: action, p_role: role ?? null }, done);
// existing since P3
export const adminOrgMemberAdd = (organizationId: string, email: string, role: 'owner' | 'member') => call('rpc_admin_org_member_add', { p_organization_id: organizationId, p_email: email, p_role: role }, done);

const appRow = z.object({
  id: z.string().uuid(), company_name: z.string(), status: z.enum(['new', 'approved', 'rejected']), created_at: iso, reviewed_at: iso.nullable(), review_note: z.string().nullable(), organization_id: z.string().uuid().nullable(),
  contact_name: z.string().nullable(), contact_email: z.string().nullable(), phone: z.string().nullable(), website: z.string().nullable(), message: z.string().nullable(),
});
export type ApplicationRow = z.infer<typeof appRow>;
export const adminApplicationsList = (status: string | null) => call('rpc_admin_applications_list', { p_status: status }, z.object({ can_see_contact: z.boolean(), applications: z.array(appRow) }));
export const adminApplicationCreate = (i: { company: string; contactName: string; contactEmail: string; phone?: string; website?: string; message?: string }) =>
  call('rpc_admin_application_create', { p_company: i.company, p_contact_name: i.contactName, p_contact_email: i.contactEmail, p_phone: i.phone ?? null, p_website: i.website ?? null, p_message: i.message ?? null }, done);
export const adminApplicationReview = (id: string, decision: 'approve' | 'reject', note?: string, orgCode?: string) =>
  call('rpc_admin_application_review', { p_id: id, p_decision: decision, p_note: note ?? null, p_org_code: orgCode ?? null }, z.object({ organization_id: z.string().uuid().optional(), owner_added: z.boolean().optional() }));

const customerRow = z.object({
  user_id: z.string().uuid(), email: z.string().nullable(), name: z.string().nullable(), phone: z.string().nullable(), organization_id: z.string().uuid(), organization_name: z.string(), organization_code: z.string(),
  role: z.enum(['owner', 'member']), joined: iso,
});
export type CustomerRow = z.infer<typeof customerRow>;
export const adminCustomersList = (query: string | null) => call('rpc_admin_customers_list', { p_query: query }, z.object({ can_see_phone: z.boolean(), customers: z.array(customerRow) }));

// ---------------------------------------------------------------------------------------------------------------- admin: audit, settings, fees
const auditRow = z.object({
  id: z.string().uuid(), occurred_at: iso, actor_kind: z.string(), actor_roles: z.array(z.string()), action: z.string(), outcome: z.string(), organization_name: z.string().nullable(),
  subject_type: z.string().nullable(), subject_id: z.string().nullable(), detail: z.record(z.string(), z.unknown()),
});
export type AuditRow = z.infer<typeof auditRow>;
export const adminAuditList = (prefix: string | null, organizationId: string | null) => call('rpc_admin_audit_list', { p_action_prefix: prefix, p_organization_id: organizationId, p_limit: 150 }, z.object({ events: z.array(auditRow) }));
export const adminSettingsGet = () => call('rpc_admin_settings_get', {}, z.object({ settings: z.record(z.string(), z.string()), flags: z.record(z.string(), z.boolean()), gates: z.record(z.string(), z.string()) }));
export const adminSettingSet = (key: string, value: string) => call('rpc_admin_setting_set', { p_key: key, p_value: value }, done);
const adminFee = z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), amount_cents: cents, unit: z.enum(['flat', 'per_order', 'per_unit', 'per_box', 'per_pallet', 'per_month']), note: z.string().nullable(), effective_from: z.string(), effective_to: z.string().nullable() });
export type AdminFee = z.infer<typeof adminFee>;
export const adminFeeList = () => call('rpc_admin_fee_list', {}, z.object({ fees: z.array(adminFee) }));
export const adminFeeSave = (i: { code: string; name: string; amountCents: number; unit: string; note?: string; effectiveFrom: string }) =>
  call('rpc_admin_fee_save', { p_code: i.code, p_name: i.name, p_amount_cents: i.amountCents, p_unit: i.unit, p_note: i.note ?? null, p_effective_from: i.effectiveFrom }, done);
export const adminFeeRetire = (code: string, effectiveTo: string) => call('rpc_admin_fee_retire', { p_code: code, p_effective_to: effectiveTo }, done);

// ---------------------------------------------------------------------------------------------------------------- admin: staff (P2 functions, applied)
const staffRow = z.object({ user_id: z.string().uuid(), email: z.string().nullable(), status: z.enum(['active', 'disabled']), created_at: iso, roles: z.array(z.string()) });
export type StaffRow = z.infer<typeof staffRow>;
export const staffDirectory = () => call('rpc_staff_directory', {}, z.object({ rows: z.array(staffRow) }));
export const staffLookup = (email: string) =>
  call('rpc_staff_lookup_user', { p_email: email }, z.object({ found: z.boolean(), user_id: z.string().uuid().optional(), email_confirmed: z.boolean().optional(), is_staff: z.boolean().optional(), is_organization_member: z.boolean().optional() }));
export const staffAddMember = (userId: string, role: string) => call('rpc_staff_add_member', { p_user_id: userId, p_role: role }, done);
export const staffGrantRole = (userId: string, role: string) => call('rpc_staff_grant_role', { p_user_id: userId, p_role: role }, done);
export const staffRevokeRole = (userId: string, role: string) => call('rpc_staff_revoke_role', { p_user_id: userId, p_role: role }, done);
/** Opens a short time window (5 to 60 minutes) in which the named staff member may set up and get approval for their authenticator. The returned window id is the one-time authorization code the staff member types at sign-in. */
export const staffAuthorizeWindow = (userId: string, reason: string, minutes: number) =>
  call('rpc_staff_authorize_enrolment_window', { p_target_user_id: userId, p_reason: reason, p_minutes: minutes }, z.object({ window_id: z.string().uuid(), expires_at: z.string() }));
export const staffSetStatus = (userId: string, status: 'active' | 'disabled') => call('rpc_staff_set_status', { p_user_id: userId, p_status: status }, done);
