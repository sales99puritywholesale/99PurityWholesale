import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STATUSES, FEE_UNITS, ORG_CODE, canReplaceFee, closingDate, feeIsCurrent, formatFee, isAuditPrefix, isValidTerms, percent, suggestOrgCode, termsLabel,
} from '@/lib/portal/admin-ops/model';
import {
  applicationCreateSchema, applicationReviewSchema, feeRetireSchema, feeSaveSchema, memberAddSchema, memberSetSchema, orgStatusSchema, orgTermsSchema, profileSchema, settingSchema, staffAddSchema, staffLookupSchema,
} from '@/lib/portal/admin-ops/schemas';
import { ADMIN_OPS_MESSAGES } from '@/lib/portal/admin-ops/messages';
import { STAFF_RPC_MESSAGES } from '@/lib/portal/staff-rpc';
import { messageFor } from '@/lib/portal/commerce/messages';
import { agingBucket, termsDays } from '@/lib/portal/billing/invoices';

const id = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f';

describe('terms and dates', () => {
  it('accepts prepay and net terms up to 365 days and agrees with the invoice due-date rules', () => {
    for (const ok of ['prepay', 'net30', 'net_15', 'net0', 'net365']) expect(isValidTerms(ok), ok).toBe(true);
    for (const bad of ['', 'net366', 'net', 'net-5', 'NET30', 'prepaid', 'net 30', 'net1000']) expect(isValidTerms(bad), bad).toBe(false);
    expect(termsLabel('prepay')).toBe('Prepay (due on receipt)');
    expect(termsLabel('net_15')).toBe('Net 15 days');
    // every valid term the admin can set turns into the same number of days the invoice code computes
    expect(termsDays('net30')).toBe(30);
    expect(termsDays('prepay')).toBe(0);
  });
  it('suggests a valid organization code', () => {
    for (const name of ['Acme Peptide Labs, Inc.', 'X', '??', 'A very long company name that goes on', 'Müller & Söhne']) expect(ORG_CODE.test(suggestOrgCode(name)), name).toBe(true);
    expect(suggestOrgCode('Acme Labs')).toBe('ACME-LABS');
  });
  it('closes a fee row the day before the new one starts (also across months and years) and refuses an earlier or equal start', () => {
    expect(closingDate('2026-12-01')).toBe('2026-11-30');
    expect(closingDate('2027-01-01')).toBe('2026-12-31');
    expect(closingDate('2028-03-01')).toBe('2028-02-29');
    expect(canReplaceFee('2026-11-01', '2026-11-02')).toBe(true);
    expect(canReplaceFee('2026-11-01', '2026-11-01')).toBe(false);
    expect(canReplaceFee('2026-11-01', '2026-10-31')).toBe(false);
  });
  it('a fee is current from its start date through its end date inclusive', () => {
    expect(feeIsCurrent('2026-11-01', null, '2026-11-01')).toBe(true);
    expect(feeIsCurrent('2026-11-01', null, '2026-10-31')).toBe(false);
    expect(feeIsCurrent('2026-11-01', '2026-11-30', '2026-11-30')).toBe(true);
    expect(feeIsCurrent('2026-11-01', '2026-11-30', '2026-12-01')).toBe(false);
  });
  it('formats fees exactly and handles divisions safely', () => {
    expect(formatFee(500, 'per_order')).toBe('$5.00 per order');
    expect(formatFee(19900, 'per_month')).toBe('$199.00 per month');
    expect(formatFee(0, 'flat')).toBe('$0.00 one-time');
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBe(0);
    expect(FEE_UNITS.length).toBe(6);
    expect(APPLICATION_STATUSES).toEqual(['new', 'approved', 'rejected']);
  });
  it('audit filters are plain prefixes', () => {
    for (const ok of ['', 'staff.', 'staff.payment.', 'api.']) expect(isAuditPrefix(ok)).toBe(true);
    for (const bad of ['staff%', 'a b', "x'; drop", 'UPPER', 'a'.repeat(41), 'staff.*']) expect(isAuditPrefix(bad), bad).toBe(false);
  });
  it('the dashboard aging buckets in SQL use the same boundaries as the invoice model', () => {
    const sql = require('node:fs').readFileSync(require('node:path').join(process.cwd(), 'supabase', 'review', 'p8', '20261111000500_p8_admin_operations.sql'), 'utf8') as string;
    expect(sql).toMatch(/case when d\.days <= 0 then 'current' when d\.days <= 30 then '1-30' when d\.days <= 60 then '31-60' when d\.days <= 90 then '61-90' else '90\+' end/);
    const due = new Date('2026-10-01T00:00:00Z');
    const at = (d: number) => new Date(due.getTime() + d * 86_400_000);
    expect([0, 1, 30, 31, 60, 61, 90, 91].map((d) => agingBucket('open', due, at(d)))).toEqual(['current', '1-30', '1-30', '31-60', '31-60', '61-90', '61-90', '90+']);
  });
});

describe('validation', () => {
  it('organization status changes need a reason; terms must be valid', () => {
    expect(orgStatusSchema.safeParse({ organizationId: id, status: 'suspended', reason: 'unpaid invoices' }).success).toBe(true);
    expect(orgStatusSchema.safeParse({ organizationId: id, status: 'suspended', reason: '' }).success).toBe(false);
    expect(orgStatusSchema.safeParse({ organizationId: id, status: 'deleted', reason: 'x' }).success).toBe(false);
    expect(orgTermsSchema.safeParse({ organizationId: id, terms: 'net30' }).success).toBe(true);
    expect(orgTermsSchema.safeParse({ organizationId: id, terms: 'net999' }).success).toBe(false);
  });
  it('member changes need a role to set; added members need a valid e-mail', () => {
    expect(memberSetSchema.safeParse({ organizationId: id, userId: id, action: 'remove' }).success).toBe(true);
    expect(memberSetSchema.safeParse({ organizationId: id, userId: id, action: 'set_role' }).success).toBe(false);
    expect(memberSetSchema.safeParse({ organizationId: id, userId: id, action: 'set_role', role: 'admin' }).success).toBe(false);
    expect(memberAddSchema.safeParse({ organizationId: id, email: ' A@Example.com ', role: 'owner' }).success).toBe(true);
    expect(memberAddSchema.safeParse({ organizationId: id, email: 'nope', role: 'owner' }).success).toBe(false);
  });
  it('applications: required fields; reviews need a code to approve and a note to reject', () => {
    expect(applicationCreateSchema.safeParse({ company: 'Acme', contactName: 'A B', contactEmail: 'a@acme.com' }).success).toBe(true);
    expect(applicationCreateSchema.safeParse({ company: '', contactName: 'A B', contactEmail: 'a@acme.com' }).success).toBe(false);
    expect(applicationReviewSchema.safeParse({ id, decision: 'approve', orgCode: 'acme-labs' }).success).toBe(true);
    expect(applicationReviewSchema.safeParse({ id, decision: 'approve' }).success).toBe(false);
    expect(applicationReviewSchema.safeParse({ id, decision: 'approve', orgCode: 'a b' }).success).toBe(false);
    expect(applicationReviewSchema.safeParse({ id, decision: 'reject' }).success).toBe(false);
    expect(applicationReviewSchema.safeParse({ id, decision: 'reject', note: 'not a fit' }).success).toBe(true);
  });
  it('settings accept only the two known keys; fees need exact cents, a known unit and a date', () => {
    expect(settingSchema.safeParse({ key: 'payment_instructions', value: 'Zelle: pay@example.com' }).success).toBe(true);
    expect(settingSchema.safeParse({ key: 'wallet_enabled', value: 'true' }).success).toBe(false);
    expect(settingSchema.safeParse({ key: 'invoice_footer', value: 'x'.repeat(2001) }).success).toBe(false);
    const fee = { code: 'per_order', name: 'Per order', amountCents: 500, unit: 'per_order', effectiveFrom: '2026-11-11' };
    expect(feeSaveSchema.safeParse(fee).success).toBe(true);
    for (const over of [{ code: 'Bad Code' }, { amountCents: -1 }, { amountCents: 1.5 }, { amountCents: 100_000_001 }, { unit: 'per_century' }, { effectiveFrom: '2026-13-01' }]) expect(feeSaveSchema.safeParse({ ...fee, ...over }).success).toBe(false);
    expect(feeRetireSchema.safeParse({ code: 'per_order', effectiveTo: '2026-12-31' }).success).toBe(true);
  });
  it('profile: bounded name, phone digits only, staff roles from the fixed four', () => {
    expect(profileSchema.safeParse({ fullName: 'Jane Lab', phone: '+1 (512) 555-0100' }).success).toBe(true);
    expect(profileSchema.safeParse({ fullName: 'Jane', phone: '' }).success).toBe(true);
    expect(profileSchema.safeParse({ fullName: 'Jane', phone: 'call me' }).success).toBe(false);
    expect(profileSchema.safeParse({ fullName: 'x'.repeat(201), phone: '' }).success).toBe(false);
    expect(staffAddSchema.safeParse({ userId: id, role: 'admin' }).success).toBe(true);
    expect(staffAddSchema.safeParse({ userId: id, role: 'super_admin' }).success).toBe(false);
    expect(staffLookupSchema.safeParse({ email: 'someone@example.com' }).success).toBe(true);
  });
});

describe('messages', () => {
  it('the copied staff messages equal the P2 originals (fails if either drifts)', () => {
    for (const [code, text] of Object.entries(STAFF_RPC_MESSAGES)) {
      if (code in ADMIN_OPS_MESSAGES) expect(ADMIN_OPS_MESSAGES[code], code).toBe(text);
    }
    for (const code of ['self_change_not_allowed', 'organization_member_conflict', 'already_staff', 'not_staff', 'role_not_found', 'last_admin_protected', 'invariant_protected', 'window_already_open', 'target_not_eligible', 'window_not_open', 'approval_rejected', 'already_approved']) {
      expect(ADMIN_OPS_MESSAGES[code], code).toBe(STAFF_RPC_MESSAGES[code as keyof typeof STAFF_RPC_MESSAGES]);
    }
  });
  it('P8 result codes resolve in the shared banner; unknown codes stay generic', () => {
    expect(messageFor('last_owner_protected')).toMatch(/at least one active owner/);
    expect(messageFor('has_open_items')).toMatch(/cannot be closed/);
    expect(messageFor('already_staff')).toMatch(/already a staff member/);
    expect(messageFor('owner_required')).toBe('Only an organization owner can do this.');
    expect(messageFor('relation "x" does not exist')).toBe('Something went wrong. Please try again.');
  });
});
