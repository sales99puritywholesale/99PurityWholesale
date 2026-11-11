import { describe, expect, it } from 'vitest';
import {
  STEP_DEFS, approvedCount, canReview, canSubmit, documentOk, documentPath, fundingMet, missingGates, nextCustomerStep, stepLabel, viewOf, type StepStatus,
} from '@/lib/portal/onboarding/steps';
import { acknowledgeSchema, agreementAcceptSchema, fundingSetSchema, itemReviewSchema, launchSubmissionSchema, skuMappingSchema, stepReviewSchema, storeConnectionSchema } from '@/lib/portal/onboarding/schemas';
import { messageFor } from '@/lib/portal/commerce/messages';

const id = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f';
const st = (o: Record<number, StepStatus>): Record<number, StepStatus> => o;
const ALL_APPROVED = st({ 1: 'approved', 2: 'approved', 3: 'approved', 4: 'approved', 5: 'approved', 6: 'approved', 7: 'approved', 8: 'approved' });

describe('P5 step engine model', () => {
  it('has nine steps, numbered 1 to 9, with the observed owners (6 and 9 are staff-owned)', () => {
    expect(STEP_DEFS.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(STEP_DEFS.filter((s) => s.owner === 'staff').map((s) => s.no)).toEqual([6, 9]);
  });
  it('prerequisites only point at earlier steps (no cycles)', () => {
    for (const s of STEP_DEFS) for (const d of s.dependsOn) expect(d).toBeLessThan(s.no);
  });
  it('a step is locked until every prerequisite is approved', () => {
    expect(viewOf(1, st({}))).toBe('todo');
    expect(viewOf(2, st({}))).toBe('locked');
    expect(viewOf(2, st({ 1: 'submitted' }))).toBe('locked');
    expect(viewOf(2, st({ 1: 'approved' }))).toBe('todo');
    expect(viewOf(5, st({ 1: 'approved' }))).toBe('locked');
    expect(viewOf(5, st({ 1: 'approved', 4: 'approved' }))).toBe('todo');
    expect(viewOf(8, st({ 1: 'approved', 2: 'approved', 3: 'approved', 4: 'approved', 5: 'approved', 6: 'approved' }))).toBe('locked');
    expect(viewOf(8, st({ 1: 'approved', 2: 'approved', 3: 'approved', 4: 'approved', 5: 'approved', 6: 'approved', 7: 'approved' }))).toBe('todo');
  });
  it('an approved or submitted step keeps its status even if a prerequisite is later reopened', () => {
    expect(viewOf(2, st({ 1: 'todo', 2: 'approved' }))).toBe('approved');
    expect(viewOf(2, st({ 1: 'todo', 2: 'submitted' }))).toBe('submitted');
  });
  it('counts approved steps and finds the next customer step', () => {
    expect(approvedCount(st({ 1: 'approved', 2: 'approved', 3: 'submitted' }))).toBe(2);
    expect(nextCustomerStep(st({}))?.no).toBe(1);
    expect(nextCustomerStep(st({ 1: 'approved' }))?.no).toBe(2);
    expect(nextCustomerStep(st({ 1: 'approved', 2: 'submitted', 3: 'submitted', 4: 'submitted' }))).toBeNull();
    expect(nextCustomerStep(st({ 1: 'approved', 2: 'rejected' }))?.no).toBe(2);
  });
  it('the customer can submit only unlocked customer-owned steps that are open or rejected', () => {
    expect(canSubmit(1, st({}))).toBe(true);
    expect(canSubmit(2, st({}))).toBe(false); // locked
    expect(canSubmit(1, st({ 1: 'submitted' }))).toBe(false);
    expect(canSubmit(1, st({ 1: 'approved' }))).toBe(false);
    expect(canSubmit(1, st({ 1: 'rejected' }))).toBe(true);
    expect(canSubmit(6, ALL_APPROVED)).toBe(false); // staff-owned
    expect(canSubmit(9, ALL_APPROVED)).toBe(false);
  });
  it('staff review submitted customer steps and decide the staff-owned steps when they are unlocked', () => {
    expect(canReview(1, st({ 1: 'submitted' }))).toBe(true);
    expect(canReview(1, st({}))).toBe(false);
    expect(canReview(6, st({ 1: 'approved', 2: 'approved', 3: 'approved' }))).toBe(true);
    expect(canReview(6, st({ 1: 'approved' }))).toBe(false);
    expect(canReview(6, st({ 1: 'approved', 2: 'approved', 3: 'approved', 6: 'approved' }))).toBe(false);
    expect(canReview(9, ALL_APPROVED)).toBe(true);
  });
  it('labels staff-owned steps as waiting on 99 Purity', () => {
    expect(stepLabel(STEP_DEFS[5]!, 'todo')).toBe('Waiting on 99 Purity');
    expect(stepLabel(STEP_DEFS[0]!, 'todo')).toBe('Your step');
    expect(stepLabel(STEP_DEFS[0]!, 'rejected')).toBe('Needs changes');
  });
  it('step 2 needs gate G2 and step 9 needs G1, G2, G4, G5 and G6 (never G3)', () => {
    expect(missingGates(2, new Set())).toEqual(['G2']);
    expect(missingGates(2, new Set(['G2']))).toEqual([]);
    expect(missingGates(9, new Set(['G1', 'G2']))).toEqual(['G4', 'G5', 'G6']);
    expect(missingGates(9, new Set(['G1', 'G2', 'G4', 'G5', 'G6']))).toEqual([]);
    expect(missingGates(1, new Set())).toEqual([]);
  });
  it('funding is met only by a paid invoice, approved credit terms or a staff waiver, never by a customer claim', () => {
    expect(fundingMet('prepay_invoice', 'unmet', false)).toBe(false);
    expect(fundingMet('prepay_invoice', 'unmet', true)).toBe(true);
    expect(fundingMet('deposit_invoice', 'met', false)).toBe(false); // status text alone does not meet an invoice-based requirement
    expect(fundingMet('credit_terms', 'met', false)).toBe(true);
    expect(fundingMet('credit_terms', 'unmet', false)).toBe(false);
    expect(fundingMet('waived', 'waived', false)).toBe(true);
    expect(fundingMet('waived', 'unmet', true)).toBe(false);
  });
  it('documents: only PDF, PNG and JPEG up to 10 MB; the path starts with the organization id', () => {
    expect(documentOk('application/pdf', 1)).toBe(true);
    expect(documentOk('image/png', 10 * 1024 * 1024)).toBe(true);
    expect(documentOk('image/png', 10 * 1024 * 1024 + 1)).toBe(false);
    expect(documentOk('text/html', 100)).toBe(false);
    expect(documentOk('image/svg+xml', 100)).toBe(false);
    expect(documentOk('application/pdf', 0)).toBe(false);
    expect(documentPath(id, id, 'application/pdf')).toBe(`${id}/${id}.pdf`);
  });
});

describe('P5 validation', () => {
  const base = { organizationId: id, externalSku: 'ACME-001', unitsPerPack: 10 };
  it('SKU mapping: a catalog product needs a variant, a private product needs a name and no variant', () => {
    expect(skuMappingSchema.safeParse({ ...base, source: 'catalog', variantId: id }).success).toBe(true);
    expect(skuMappingSchema.safeParse({ ...base, source: 'catalog' }).success).toBe(false);
    expect(skuMappingSchema.safeParse({ ...base, source: 'private', productName: 'My peptide' }).success).toBe(true);
    expect(skuMappingSchema.safeParse({ ...base, source: 'private' }).success).toBe(false);
    expect(skuMappingSchema.safeParse({ ...base, source: 'private', productName: 'x', variantId: id }).success).toBe(false);
  });
  it('SKU mapping: bounds on SKU, units, barcode and weight; unknown fields refused', () => {
    const ok = { ...base, source: 'private', productName: 'x' };
    expect(skuMappingSchema.safeParse({ ...ok, externalSku: 'bad sku!' }).success).toBe(false);
    expect(skuMappingSchema.safeParse({ ...ok, externalSku: '' }).success).toBe(false);
    expect(skuMappingSchema.safeParse({ ...ok, unitsPerPack: 0 }).success).toBe(false);
    expect(skuMappingSchema.safeParse({ ...ok, unitsPerPack: 10001 }).success).toBe(false);
    expect(skuMappingSchema.safeParse({ ...ok, barcode: '12345' }).success).toBe(false);
    expect(skuMappingSchema.safeParse({ ...ok, barcode: '012345678905' }).success).toBe(true);
    expect(skuMappingSchema.safeParse({ ...ok, status: 'approved' }).success).toBe(false);
  });
  it('store connection: https only, and a store URL unless manual', () => {
    const ok = { organizationId: id, method: 'api', storeUrl: 'https://shop.example.com' };
    expect(storeConnectionSchema.safeParse(ok).success).toBe(true);
    expect(storeConnectionSchema.safeParse({ ...ok, storeUrl: 'http://shop.example.com' }).success).toBe(false);
    expect(storeConnectionSchema.safeParse({ organizationId: id, method: 'api' }).success).toBe(false);
    expect(storeConnectionSchema.safeParse({ organizationId: id, method: 'manual' }).success).toBe(true);
    expect(storeConnectionSchema.safeParse({ ...ok, webhookUrl: 'javascript:alert(1)' }).success).toBe(false);
  });
  it('agreement acceptance must be an explicit accept with a name and title', () => {
    expect(agreementAcceptSchema.safeParse({ organizationId: id, signerName: 'A B', signerTitle: 'CEO', accept: true }).success).toBe(true);
    expect(agreementAcceptSchema.safeParse({ organizationId: id, signerName: 'A B', signerTitle: 'CEO', accept: false }).success).toBe(false);
    expect(agreementAcceptSchema.safeParse({ organizationId: id, signerName: '', signerTitle: 'CEO', accept: true }).success).toBe(false);
  });
  it('launch submission needs a contact, an escalation contact, a return address and all confirmations', () => {
    const c = { name: 'A', email: 'a@example.com' };
    const ok = { organizationId: id, contacts: [c], escalation: c, returnAddress: { name: 'W', line1: '1 St', city: 'X', region: 'TX', postal: '78701', country: 'US' }, confirmations: { accurate: true, labelsApproved: true, terms: true } };
    expect(launchSubmissionSchema.safeParse(ok).success).toBe(true);
    expect(launchSubmissionSchema.safeParse({ ...ok, contacts: [] }).success).toBe(false);
    expect(launchSubmissionSchema.safeParse({ ...ok, confirmations: { ...ok.confirmations, terms: false } }).success).toBe(false);
    expect(launchSubmissionSchema.safeParse({ ...ok, returnAddress: { ...ok.returnAddress, country: 'usa' } }).success).toBe(false);
  });
  it('rejections need a reason; approvals do not', () => {
    expect(stepReviewSchema.safeParse({ organizationId: id, stepNo: 1, decision: 'approve' }).success).toBe(true);
    expect(stepReviewSchema.safeParse({ organizationId: id, stepNo: 1, decision: 'reject' }).success).toBe(false);
    expect(stepReviewSchema.safeParse({ organizationId: id, stepNo: 1, decision: 'reject', reason: 'blurry' }).success).toBe(true);
    expect(stepReviewSchema.safeParse({ organizationId: id, stepNo: 10, decision: 'approve' }).success).toBe(false);
    expect(itemReviewSchema.safeParse({ id, decision: 'reject' }).success).toBe(false);
    expect(fundingSetSchema.safeParse({ organizationId: id, type: 'waived' }).success).toBe(false);
    expect(fundingSetSchema.safeParse({ organizationId: id, type: 'waived', reason: 'founding partner' }).success).toBe(true);
    expect(fundingSetSchema.safeParse({ organizationId: id, type: 'prepay_invoice' }).success).toBe(true);
    expect(acknowledgeSchema.safeParse({ organizationId: id, acknowledge: false }).success).toBe(false);
  });
  it('result codes map to fixed copy and unknown codes to a generic message', () => {
    expect(messageFor('step_locked')).toMatch(/earlier steps/);
    expect(messageFor('gate_required')).toMatch(/compliance gate/);
    expect(messageFor('exceeds_balance')).toMatch(/remaining balance/); // billing codes still resolve
    expect(messageFor('relation "x" does not exist')).toBe('Something went wrong. Please try again.');
  });
});
