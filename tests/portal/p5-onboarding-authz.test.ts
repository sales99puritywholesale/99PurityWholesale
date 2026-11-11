import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { denyAllContext, parseStaffContext } from '@/lib/portal/permissions/context';
import type { StaffAccessContext } from '@/lib/portal/permissions/evaluate';

// Scenario tests for the P5 server actions with authentication and the staff context mocked. They prove the APPLICATION-side decision only (no RPC is even attempted without
// the right staff context; the customer actions send only validated data and never a step status). The database re-check is the second layer and is NOT exercised here.
const h = vi.hoisted(() => {
  const ok = async () => ({ ok: true, data: {} });
  return {
    user: { id: 'u1', email: 'u@example.test' } as { id: string; email: string } | null,
    ctx: null as unknown,
    rpc: {
      adminAgreementOffer: vi.fn(ok), adminFundingSet: vi.fn(ok), adminGateRecord: vi.fn(ok), adminGoLive: vi.fn(ok), adminLabelReview: vi.fn(ok), adminMappingReview: vi.fn(ok),
      adminSetupInvoicesCreate: vi.fn(ok), adminStepReview: vi.fn(ok),
      uploadDocument: vi.fn(async () => ({ ok: true, data: { documentId: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d' } })),
      agreementAccept: vi.fn(ok), labelDesignAdd: vi.fn(ok), packagingSelect: vi.fn(ok), skuMappingDelete: vi.fn(ok), skuMappingSave: vi.fn(async (_m: unknown) => ({ ok: true, data: {} })),
      stepSubmit: vi.fn(async (_o: string, _n: number, _d: unknown) => ({ ok: true, data: {} })), storeConnectionSave: vi.fn(ok),
    },
  };
});

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/portal/auth', () => ({
  requireUser: async (next: string) => {
    if (!h.user) throw new Error(`REDIRECT:/login?next=${next}`);
    return h.user;
  },
}));
vi.mock('@/components/portal/commerce-ui', () => ({
  back: (path: string, params: Record<string, string>, outcome: { ok: boolean; code?: string }) => {
    const q = new URLSearchParams(params);
    if (outcome.ok) q.set('ok', '1');
    else q.set('e', String(outcome.code));
    return `${path}?${q.toString()}`;
  },
}));
vi.mock('@/lib/portal/staff-access', () => ({ getStaffAccessContext: async () => h.ctx }));
vi.mock('@/lib/portal/onboarding/server', async (orig) => ({ ...(await orig<object>()), ...h.rpc }));

const ORG = '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11';
const ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const now = new Date('2026-11-10T12:00:00Z');
const staff = (roles: string[], over: Partial<{ staff_status: string; session_ok: boolean }> = {}): StaffAccessContext =>
  parseStaffContext({ staff_status: 'active', roles, session_ok: true, step_up_ok: true, last_totp_epoch: Math.floor(now.getTime() / 1000), ...over }, true, now);

const SCENARIOS: Record<string, { user: boolean; ctx: StaffAccessContext }> = {
  unauthenticated: { user: false, ctx: denyAllContext(false, now) },
  'normal customer (not staff)': { user: true, ctx: parseStaffContext({ staff_status: 'none', roles: [], session_ok: false, step_up_ok: false }, true, now) },
  'inactive (disabled) staff': { user: true, ctx: staff(['admin'], { staff_status: 'disabled' }) },
  'staff with an unverified session': { user: true, ctx: staff(['admin'], { session_ok: false }) },
  'staff with an unknown role': { user: true, ctx: staff(['superuser']) },
  support: { user: true, ctx: staff(['support']) },
  operations: { user: true, ctx: staff(['operations']) },
  finance: { user: true, ctx: staff(['finance']) },
  admin: { user: true, ctx: staff(['admin']) },
};
const REVIEWERS = ['operations', 'admin']; // onboarding.review
const MONEY = ['finance', 'admin']; // financial.write
const ADMIN_ONLY = ['admin']; // gates.write, onboarding.golive

const ACTIONS: { name: string; allowed: string[]; form: Record<string, string>; rpc: keyof typeof h.rpc }[] = [
  { name: 'reviewMappingAction', allowed: REVIEWERS, form: { organizationId: ORG, id: ID, decision: 'approve' }, rpc: 'adminMappingReview' },
  { name: 'reviewLabelAction', allowed: REVIEWERS, form: { organizationId: ORG, id: ID, decision: 'reject', reason: 'blurry' }, rpc: 'adminLabelReview' },
  { name: 'reviewStepAction', allowed: REVIEWERS, form: { organizationId: ORG, stepNo: '1', decision: 'approve' }, rpc: 'adminStepReview' },
  { name: 'createSetupInvoicesAction', allowed: MONEY, form: { organizationId: ORG, setup: '4000.00', funding: '1000.00' }, rpc: 'adminSetupInvoicesCreate' },
  { name: 'setFundingAction', allowed: MONEY, form: { organizationId: ORG, type: 'waived', reason: 'founding partner' }, rpc: 'adminFundingSet' },
  { name: 'recordGateAction', allowed: ADMIN_ONLY, form: { code: 'G2', status: 'recorded', note: 'counsel letter 2026-11-01' }, rpc: 'adminGateRecord' },
  { name: 'goLiveAction', allowed: ADMIN_ONLY, form: { organizationId: ORG }, rpc: 'adminGoLive' },
];
const fd = (o: Record<string, string>, file?: File) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  if (file) f.set('file', file);
  return f;
};
const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'agreement.pdf', { type: 'application/pdf' });

beforeEach(() => {
  for (const f of Object.values(h.rpc)) f.mockClear();
});

describe('P5 staff actions: the staff context and capability are checked BEFORE any RPC call', () => {
  for (const a of [...ACTIONS, { name: 'offerAgreementAction', allowed: REVIEWERS, form: { organizationId: ORG }, rpc: 'adminAgreementOffer' as const }]) {
    describe(a.name, () => {
      for (const [label, sc] of Object.entries(SCENARIOS)) {
        const shouldRun = a.allowed.includes(label);
        it(`${label}: ${shouldRun ? 'reaches the RPC' : 'is refused and no RPC is called'}`, async () => {
          h.user = sc.user ? { id: 'u1', email: 'u@example.test' } : null;
          h.ctx = sc.ctx;
          const actions = await import('@/app/(portal)/admin/onboarding-actions');
          const fn = (actions as unknown as Record<string, (f: FormData) => Promise<void>>)[a.name] as (f: FormData) => Promise<void>;
          let thrown = '';
          try {
            await fn(fd(a.form, a.name === 'offerAgreementAction' ? pdf() : undefined));
          } catch (e) {
            thrown = (e as Error).message;
          }
          if (shouldRun) {
            expect(h.rpc[a.rpc]).toHaveBeenCalledTimes(1);
            expect(thrown).toMatch(/^REDIRECT:\/admin\/fulfillment.*[?&]ok=1/);
          } else {
            expect(h.rpc[a.rpc]).not.toHaveBeenCalled();
            expect(thrown).toMatch(sc.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
          }
        });
      }
    });
  }
  it('every exported staff action is covered by this matrix', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', '(portal)', 'admin', 'onboarding-actions.ts'), 'utf8');
    expect([...src.matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]).sort()).toEqual([...ACTIONS.map((a) => a.name), 'offerAgreementAction'].sort());
  });
  it('invalid input never reaches an RPC (reject without a reason, bad step, bad amounts, bad gate, waiver without a reason)', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const a = await import('@/app/(portal)/admin/onboarding-actions');
    const bad: [(f: FormData) => Promise<void>, Record<string, string>][] = [
      [a.reviewStepAction, { organizationId: ORG, stepNo: '1', decision: 'reject' }],
      [a.reviewStepAction, { organizationId: ORG, stepNo: '10', decision: 'approve' }],
      [a.reviewStepAction, { organizationId: ORG, stepNo: '1', decision: 'maybe' }],
      [a.reviewMappingAction, { organizationId: ORG, id: ID, decision: 'reject' }],
      [a.reviewLabelAction, { organizationId: ORG, id: 'nope', decision: 'approve' }],
      [a.createSetupInvoicesAction, { organizationId: ORG, setup: '0', funding: '0' }],
      [a.createSetupInvoicesAction, { organizationId: ORG, setup: 'abc', funding: '10' }],
      [a.createSetupInvoicesAction, { organizationId: ORG, setup: '10.123', funding: '' }],
      [a.setFundingAction, { organizationId: ORG, type: 'waived' }],
      [a.setFundingAction, { organizationId: ORG, type: 'prepay_invoice', reason: 'x' }],
      [a.recordGateAction, { code: 'G9', status: 'recorded', note: 'x' }],
      [a.recordGateAction, { code: 'G2', status: 'recorded', note: '' }],
      [a.goLiveAction, { organizationId: 'not-a-uuid' }],
    ];
    for (const [fn, form] of bad) await expect(fn(fd(form))).rejects.toThrow(/e=invalid_response/);
    for (const f of Object.values(h.rpc)) expect(f).not.toHaveBeenCalled();
  });
  it('setup amounts become exact integer cents', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['finance']);
    const a = await import('@/app/(portal)/admin/onboarding-actions');
    await expect(a.createSetupInvoicesAction(fd({ organizationId: ORG, setup: '$4,000.50', funding: '1000' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminSetupInvoicesCreate).toHaveBeenCalledWith(ORG, 400050, 100000);
  });
  it('an agreement upload without a file is refused before any upload', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['operations']);
    const a = await import('@/app/(portal)/admin/onboarding-actions');
    await expect(a.offerAgreementAction(fd({ organizationId: ORG }))).rejects.toThrow(/e=invalid_response/);
    expect(h.rpc.uploadDocument).not.toHaveBeenCalled();
    expect(h.rpc.adminAgreementOffer).not.toHaveBeenCalled();
  });
});

describe('P5 customer actions (fulfillment setup)', () => {
  const sku = { organizationId: ORG, source: 'catalog', variantId: ID, externalSku: 'ACME-1', unitsPerPack: '10' };
  it('every action requires a signed-in user and calls nothing otherwise', async () => {
    h.user = null;
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    for (const [fn, form] of [[a.saveSkuAction, sku], [a.submitStepAction, { organizationId: ORG, stepNo: '1' }], [a.selectPackagingAction, { organizationId: ORG, optionId: ID }], [a.deleteSkuAction, { organizationId: ORG, id: ID }]] as const) {
      await expect(fn(fd(form))).rejects.toThrow(/^REDIRECT:\/login/);
    }
    for (const f of Object.values(h.rpc)) expect(f).not.toHaveBeenCalled();
  });
  it('saves a product with exact validated values and no status', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    await expect(a.saveSkuAction(fd({ ...sku, barcode: '012345678905', status: 'approved' }))).rejects.toThrow(/ok=1/);
    const sent = h.rpc.skuMappingSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toEqual({ organizationId: ORG, source: 'catalog', variantId: ID, externalSku: 'ACME-1', unitsPerPack: 10, barcode: '012345678905' });
    expect(Object.keys(sent)).not.toContain('status');
  });
  it('rejects invalid products without calling the RPC (private without a name, SKU with spaces, zero units)', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    for (const over of [{ source: 'private', variantId: '' }, { externalSku: 'bad sku' }, { unitsPerPack: '0' }, { unitsPerPack: 'x' }, { source: 'weird' }]) {
      await expect(a.saveSkuAction(fd({ ...sku, ...over }))).rejects.toThrow(/e=invalid_response/);
    }
    expect(h.rpc.skuMappingSave).not.toHaveBeenCalled();
  });
  it('only steps 1 to 5, 7 and 8 can be submitted, and no status is ever sent', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    for (const n of ['6', '9', '0', '10', 'x']) await expect(a.submitStepAction(fd({ organizationId: ORG, stepNo: n, status: 'approved' }))).rejects.toThrow(/e=invalid_response/);
    expect(h.rpc.stepSubmit).not.toHaveBeenCalled();
    await expect(a.submitStepAction(fd({ organizationId: ORG, stepNo: '3', status: 'approved' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.stepSubmit).toHaveBeenCalledWith(ORG, 3, {});
  });
  it('step 7 needs the acknowledgement; step 8 builds the validated launch data', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    await expect(a.submitStepAction(fd({ organizationId: ORG, stepNo: '7' }))).rejects.toThrow(/e=invalid_response/);
    await expect(a.submitStepAction(fd({ organizationId: ORG, stepNo: '7', acknowledge: 'on' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.stepSubmit).toHaveBeenLastCalledWith(ORG, 7, { acknowledge: true });
    const launch = { organizationId: ORG, stepNo: '8', contactName: 'A', contactEmail: 'a@example.com', escalationName: 'B', escalationEmail: 'b@example.com', raName: 'W', raLine1: '1 St', raCity: 'X', raRegion: 'TX', raPostal: '78701', raCountry: 'us', cAccurate: 'on', cLabels: 'on', cTerms: 'on' };
    await expect(a.submitStepAction(fd({ ...launch, cTerms: '' }))).rejects.toThrow(/e=invalid_response/);
    await expect(a.submitStepAction(fd(launch))).rejects.toThrow(/ok=1/);
    const sent = h.rpc.stepSubmit.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['confirmations', 'contacts', 'escalation', 'returnAddress']);
    expect((sent.returnAddress as { country: string }).country).toBe('US');
  });
  it('label upload needs a file, a template and a product, then attaches the stored document', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    await expect(a.uploadLabelAction(fd({ organizationId: ORG, skuMappingId: ID, template: 'ml3' }))).rejects.toThrow(/e=invalid_response/);
    await expect(a.uploadLabelAction(fd({ organizationId: ORG, skuMappingId: ID, template: 'xl' }, pdf()))).rejects.toThrow(/e=invalid_response/);
    expect(h.rpc.uploadDocument).not.toHaveBeenCalled();
    await expect(a.uploadLabelAction(fd({ organizationId: ORG, skuMappingId: ID, template: 'ml3' }, pdf()))).rejects.toThrow(/ok=1/);
    expect(h.rpc.uploadDocument).toHaveBeenCalledTimes(1);
    expect(h.rpc.labelDesignAdd).toHaveBeenCalledWith(ORG, ID, 'ml3', ID);
  });
  it('a failed upload stops the action and shows the code', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.rpc.uploadDocument.mockResolvedValueOnce({ ok: false, code: 'document_invalid' } as never);
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    await expect(a.uploadLabelAction(fd({ organizationId: ORG, skuMappingId: ID, template: 'ml3' }, pdf()))).rejects.toThrow(/e=document_invalid/);
    expect(h.rpc.labelDesignAdd).not.toHaveBeenCalled();
  });
  it('the agreement needs an explicit accept, a name and a title', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    await expect(a.acceptAgreementAction(fd({ organizationId: ORG, signerName: 'A B', signerTitle: 'CEO' }))).rejects.toThrow(/e=invalid_response/);
    await expect(a.acceptAgreementAction(fd({ organizationId: ORG, signerName: '', signerTitle: 'CEO', accept: 'on' }))).rejects.toThrow(/e=invalid_response/);
    expect(h.rpc.agreementAccept).not.toHaveBeenCalled();
    await expect(a.acceptAgreementAction(fd({ organizationId: ORG, signerName: 'A B', signerTitle: 'CEO', accept: 'on' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.agreementAccept).toHaveBeenCalledWith(ORG, 'A B', 'CEO', undefined);
  });
  it('store connections accept https only', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    await expect(a.saveStoreAction(fd({ organizationId: ORG, method: 'api', storeUrl: 'http://shop.example.com' }))).rejects.toThrow(/e=invalid_response/);
    await expect(a.saveStoreAction(fd({ organizationId: ORG, method: 'api', storeUrl: 'https://shop.example.com' }))).rejects.toThrow(/ok=1/);
  });
  it('shows the database result code (for example owner_required) without echoing anything else', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.rpc.stepSubmit.mockResolvedValueOnce({ ok: false, code: 'owner_required' } as never);
    const a = await import('@/app/(portal)/client/fulfillment/setup/actions');
    await expect(a.submitStepAction(fd({ organizationId: ORG, stepNo: '1' }))).rejects.toThrow(/e=owner_required/);
  });
});
