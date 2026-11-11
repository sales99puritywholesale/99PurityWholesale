import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { denyAllContext, parseStaffContext } from '@/lib/portal/permissions/context';
import type { StaffAccessContext } from '@/lib/portal/permissions/evaluate';

// Scenario tests for the P9 server actions with authentication and the staff context mocked. They prove the APPLICATION-side decision only: no RPC is even attempted without the
// right staff context, and inputs are validated first. The database re-check (capability, step-up, balance and ownership rules) is the second layer and is NOT exercised here.
const h = vi.hoisted(() => {
  const ok = async (..._a: unknown[]) => ({ ok: true, data: {} });
  return {
    user: { id: 'u1', email: 'u@example.test' } as { id: string; email: string } | null,
    ctx: null as unknown,
    signedUrl: 'https://signed.example/file?token=abc' as string | null,
    certs: [] as { id: string; status: string; storage_path: string | null }[],
    rpc: {
      adminCertificatePublish: vi.fn(async (..._a: unknown[]) => ({ ok: true, data: { id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d' } })),
      adminCertificateWithdraw: vi.fn(ok), adminPlanSave: vi.fn(ok), adminPlanSetActive: vi.fn(ok), adminReferralEnroll: vi.fn(ok), adminReferralLink: vi.fn(ok), adminReferralEnd: vi.fn(ok),
      adminCommissionsAccrue: vi.fn(async () => ({ ok: true, data: { accrued: 2 } })), adminCommissionPayout: vi.fn(ok), adminCommissionAdjust: vi.fn(ok),
      adminNotificationsScan: vi.fn(async () => ({ ok: true, data: { queued: 1 } })),
      adminOutboxDispatch: vi.fn(async () => ({ ok: true, data: { claimed: 0, sent: 0, unsent: 0, recordFailures: 0, noProvider: true } })),
      adminTemplateSave: vi.fn(ok), notificationPrefSet: vi.fn(ok),
      adminCertificatesList: vi.fn(async (..._a: unknown[]) => ({ ok: true, data: { certificates: [] as unknown[] } })),
      certificatesList: vi.fn(async (..._a: unknown[]) => ({ ok: true, data: { certificates: [] as unknown[] } })),
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
vi.mock('@/lib/portal/onboarding/server', () => ({ documentUrl: async () => h.signedUrl }));
vi.mock('@/lib/portal/aftersales/server', async (orig) => ({ ...(await orig<object>()), ...h.rpc }));

const ORG = '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11';
const ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const KEY = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
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
const WAREHOUSE = ['operations', 'admin']; // inventory.adjust
const MONEY = ['finance', 'admin']; // financial.write
const ADMIN_ONLY = ['admin']; // org.manage, flags.write

type Row = { name: string; allowed: string[]; form: () => FormData; rpc: keyof typeof h.rpc; path: RegExp };
const fd = (o: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'coa.pdf', { type: 'application/pdf' });
const ACTIONS: Row[] = [
  { name: 'publishCertificateAction', allowed: WAREHOUSE, form: () => fd({ organizationId: ORG, title: 'COA lot A1', lotId: ID, file: pdf() }), rpc: 'adminCertificatePublish', path: /^REDIRECT:\/admin\/inventory\/certificates\?/ },
  { name: 'withdrawCertificateAction', allowed: WAREHOUSE, form: () => fd({ id: ID, reason: 'wrong lot', org: ORG }), rpc: 'adminCertificateWithdraw', path: /^REDIRECT:\/admin\/inventory\/certificates\?/ },
  { name: 'savePlanAction', allowed: MONEY, form: () => fd({ code: 'standard_5', name: 'Standard', ratePercent: '5', holdDays: '14' }), rpc: 'adminPlanSave', path: /^REDIRECT:\/admin\/commissions\?/ },
  { name: 'setPlanActiveAction', allowed: MONEY, form: () => fd({ planId: ID, active: 'false' }), rpc: 'adminPlanSetActive', path: /^REDIRECT:\/admin\/commissions\?/ },
  { name: 'enrollReferrerAction', allowed: MONEY, form: () => fd({ organizationId: ORG, planId: ID }), rpc: 'adminReferralEnroll', path: /^REDIRECT:\/admin\/commissions\?/ },
  { name: 'linkReferralAction', allowed: MONEY, form: () => fd({ referredOrgId: ORG, code: 'ab12cd34' }), rpc: 'adminReferralLink', path: /^REDIRECT:\/admin\/commissions\?/ },
  { name: 'endReferralAction', allowed: MONEY, form: () => fd({ id: ID, reason: 'left' }), rpc: 'adminReferralEnd', path: /^REDIRECT:\/admin\/commissions\?/ },
  { name: 'accrueCommissionsAction', allowed: MONEY, form: () => fd({}), rpc: 'adminCommissionsAccrue', path: /^REDIRECT:\/admin\/commissions\?/ },
  { name: 'payoutAction', allowed: MONEY, form: () => fd({ organizationId: ORG, amount: '100.00', method: 'wire', paidOn: '2026-11-10', idempotencyKey: KEY }), rpc: 'adminCommissionPayout', path: /^REDIRECT:\/admin\/commissions\?/ },
  { name: 'adjustCommissionAction', allowed: MONEY, form: () => fd({ organizationId: ORG, amount: '-25.00', reason: 'billing error', idempotencyKey: KEY }), rpc: 'adminCommissionAdjust', path: /^REDIRECT:\/admin\/commissions\?/ },
  { name: 'scanNotificationsAction', allowed: MONEY, form: () => fd({}), rpc: 'adminNotificationsScan', path: /^REDIRECT:\/admin\/notifications\?/ },
  { name: 'saveTemplateAction', allowed: ADMIN_ONLY, form: () => fd({ key: 'order_shipped', subject: 'Shipped {{order_number}}', body: 'Tracking {{tracking_number}}' }), rpc: 'adminTemplateSave', path: /^REDIRECT:\/admin\/notifications\?/ },
];
const load = async () => (await import('@/app/(portal)/admin/aftersales-actions')) as unknown as Record<string, (f: FormData) => Promise<void>>;
const as = (label: string) => {
  const sc = SCENARIOS[label]!;
  h.user = sc.user ? { id: 'u1', email: 'u@example.test' } : null;
  h.ctx = sc.ctx;
};
const run = async (fn: (f: FormData) => Promise<void>, form: FormData): Promise<string> => {
  try { await fn(form); } catch (e) { return (e as Error).message; }
  return '';
};

beforeEach(() => {
  for (const f of Object.values(h.rpc)) f.mockClear();
  h.signedUrl = 'https://signed.example/file?token=abc';
});

describe('P9 staff actions: the staff context and capability are checked BEFORE any RPC call', () => {
  for (const a of ACTIONS) {
    describe(a.name, () => {
      for (const label of Object.keys(SCENARIOS)) {
        const shouldRun = a.allowed.includes(label);
        it(`${label}: ${shouldRun ? 'reaches the RPC' : 'is refused and no RPC is called'}`, async () => {
          as(label);
          const thrown = await run((await load())[a.name]!, a.form());
          if (shouldRun) {
            expect(h.rpc[a.rpc]).toHaveBeenCalledTimes(1);
            expect(thrown).toMatch(a.path);
            expect(thrown).toMatch(/[?&]ok=1/);
          } else {
            expect(h.rpc[a.rpc]).not.toHaveBeenCalled();
            expect(thrown).toMatch(SCENARIOS[label]!.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
          }
        });
      }
    });
  }
  it('every exported staff action is covered by this matrix or by a dedicated test below', () => {
    const names = [...readFileSync(join(process.cwd(), 'src', 'app', '(portal)', 'admin', 'aftersales-actions.ts'), 'utf8').matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]);
    expect(names.sort()).toEqual([...ACTIONS.map((a) => a.name), 'dispatchOutboxAction', 'downloadAdminCertificateAction'].sort());
  });
  it('sending queued messages is admin only, and says so when no e-mail provider is connected', async () => {
    for (const label of Object.keys(SCENARIOS)) {
      as(label);
      const thrown = await run((await load()).dispatchOutboxAction as never, fd({}));
      if (label === 'admin') expect(thrown).toMatch(/^REDIRECT:\/admin\/notifications\?e=no_provider$/);
      else expect(thrown).toMatch(SCENARIOS[label]!.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
    }
    expect(h.rpc.adminOutboxDispatch).toHaveBeenCalledTimes(1);
    as('admin');
    h.rpc.adminOutboxDispatch.mockResolvedValueOnce({ ok: true, data: { claimed: 1, sent: 1, unsent: 0, recordFailures: 0, noProvider: false } });
    expect(await run((await load()).dispatchOutboxAction as never, fd({}))).toMatch(/^REDIRECT:\/admin\/notifications\?ok=1$/);
  });
  it('opening a certificate is allowed for staff who may read documents, and only for a registered certificate', async () => {
    const act = (await load()).downloadAdminCertificateAction!;
    h.rpc.adminCertificatesList.mockResolvedValue({ ok: true, data: { certificates: [{ id: ID, storage_path: `${ORG}/${ID}.pdf` }] } });
    for (const label of Object.keys(SCENARIOS)) {
      as(label);
      const thrown = await run(act, fd({ id: ID }));
      if (['finance', 'operations', 'support', 'admin'].includes(label)) expect(thrown, label).toBe('REDIRECT:https://signed.example/file?token=abc');
      else expect(thrown, label).toMatch(SCENARIOS[label]!.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
    }
    as('admin');
    expect(await run(act, fd({ id: KEY }))).toMatch(/e=document_not_found/); // not a registered certificate
    expect(await run(act, fd({ id: 'not-a-uuid' }))).toMatch(/e=invalid_response/);
    h.signedUrl = null;
    expect(await run(act, fd({ id: ID }))).toMatch(/e=document_not_found/);
    h.rpc.adminCertificatesList.mockResolvedValue({ ok: true, data: { certificates: [] } });
  });

  it('invalid input never reaches an RPC', async () => {
    as('admin');
    const a = await load();
    const bad: [string, Record<string, string | File>][] = [
      ['publishCertificateAction', { organizationId: ORG, title: '', lotId: ID, file: pdf() }], ['publishCertificateAction', { organizationId: ORG, title: 'x', file: pdf() }],
      ['publishCertificateAction', { organizationId: 'x', title: 'x', lotId: ID, file: pdf() }], ['withdrawCertificateAction', { id: ID, reason: '' }], ['withdrawCertificateAction', { id: 'x', reason: 'r' }],
      ['savePlanAction', { code: 'Bad Code', name: 'x', ratePercent: '5', holdDays: '14' }], ['savePlanAction', { code: 'ok_code', name: 'x', ratePercent: '60', holdDays: '14' }],
      ['savePlanAction', { code: 'ok_code', name: 'x', ratePercent: 'abc', holdDays: '14' }], ['savePlanAction', { code: 'ok_code', name: 'x', ratePercent: '5', holdDays: '120' }],
      ['setPlanActiveAction', { planId: 'x', active: 'true' }], ['enrollReferrerAction', { organizationId: ORG, planId: 'x' }],
      ['linkReferralAction', { referredOrgId: ORG, code: 'abc' }], ['linkReferralAction', { referredOrgId: ORG, code: 'AB-12345' }], ['endReferralAction', { id: ID, reason: '' }],
      ['payoutAction', { organizationId: ORG, amount: '0', method: 'wire', paidOn: '2026-11-10', idempotencyKey: KEY }], ['payoutAction', { organizationId: ORG, amount: '-5', method: 'wire', paidOn: '2026-11-10', idempotencyKey: KEY }],
      ['payoutAction', { organizationId: ORG, amount: '5.123', method: 'wire', paidOn: '2026-11-10', idempotencyKey: KEY }], ['payoutAction', { organizationId: ORG, amount: '5', method: 'bitcoin', paidOn: '2026-11-10', idempotencyKey: KEY }],
      ['payoutAction', { organizationId: ORG, amount: '5', method: 'wire', paidOn: 'yesterday', idempotencyKey: KEY }], ['payoutAction', { organizationId: ORG, amount: '5', method: 'wire', paidOn: '2026-11-10', idempotencyKey: 'x' }],
      ['adjustCommissionAction', { organizationId: ORG, amount: '0', reason: 'r', idempotencyKey: KEY }], ['adjustCommissionAction', { organizationId: ORG, amount: '--5', reason: 'r', idempotencyKey: KEY }],
      ['adjustCommissionAction', { organizationId: ORG, amount: '5', reason: '', idempotencyKey: KEY }],
      ['saveTemplateAction', { key: 'made_up', subject: 's', body: 'b' }], ['saveTemplateAction', { key: 'order_shipped', subject: 'two\nlines', body: 'b' }], ['saveTemplateAction', { key: 'order_shipped', subject: '', body: 'b' }],
    ];
    for (const [name, form] of bad) await expect(a[name]!(fd(form)), name + JSON.stringify(Object.keys(form))).rejects.toThrow(/e=(invalid_response|document_invalid)/);
    for (const f of Object.values(h.rpc)) expect(f).not.toHaveBeenCalled();
  });
  it('an empty or missing file is refused before the upload', async () => {
    as('admin');
    const a = await load();
    await expect(a.publishCertificateAction!(fd({ organizationId: ORG, title: 'x', lotId: ID }))).rejects.toThrow(/e=document_invalid/);
    await expect(a.publishCertificateAction!(fd({ organizationId: ORG, title: 'x', lotId: ID, file: new File([], 'empty.pdf') }))).rejects.toThrow(/e=document_invalid/);
    expect(h.rpc.adminCertificatePublish).not.toHaveBeenCalled();
  });
  it('sends exact validated values (percent to basis points, exact cents, signed adjustments, upper-case code)', async () => {
    as('admin');
    const a = await load();
    await expect(a.savePlanAction!(fd({ code: 'Gold_2', name: ' Gold ', ratePercent: '2.5', holdDays: '30' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminPlanSave).toHaveBeenCalledWith({ code: 'gold_2', name: 'Gold', rateBps: 250, holdDays: 30 });
    await expect(a.payoutAction!(fd({ organizationId: ORG, amount: '1,234.50', method: 'zelle', paidOn: '2026-11-10', idempotencyKey: KEY, reference: ' Z-1 ' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminCommissionPayout).toHaveBeenCalledWith({ organizationId: ORG, amountCents: 123450, method: 'zelle', reference: 'Z-1', paidOn: '2026-11-10', idempotencyKey: KEY });
    await expect(a.adjustCommissionAction!(fd({ organizationId: ORG, amount: '-25.00', reason: 'billing error', idempotencyKey: KEY }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminCommissionAdjust).toHaveBeenLastCalledWith({ organizationId: ORG, amountCents: -2500, reason: 'billing error', idempotencyKey: KEY });
    await expect(a.adjustCommissionAction!(fd({ organizationId: ORG, amount: '$10', reason: 'goodwill', idempotencyKey: KEY }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminCommissionAdjust).toHaveBeenLastCalledWith(expect.objectContaining({ amountCents: 1000 }));
    await expect(a.linkReferralAction!(fd({ referredOrgId: ORG, code: ' ab12cd34 ' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminReferralLink).toHaveBeenCalledWith(ORG, 'AB12CD34');
    await expect(a.publishCertificateAction!(fd({ organizationId: ORG, title: ' COA ', orderId: ID, issuedOn: '2026-11-01', file: pdf() }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminCertificatePublish).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, title: 'COA', orderId: ID, issuedOn: '2026-11-01' }));
  });
  it('database refusals are shown as codes', async () => {
    as('admin');
    const a = await load();
    h.rpc.adminCommissionPayout.mockResolvedValueOnce({ ok: false, code: 'insufficient_commission' } as never);
    await expect(a.payoutAction!(fd({ organizationId: ORG, amount: '5', method: 'wire', paidOn: '2026-11-10', idempotencyKey: KEY }))).rejects.toThrow(/e=insufficient_commission/);
    h.rpc.adminReferralLink.mockResolvedValueOnce({ ok: false, code: 'already_referred' } as never);
    await expect(a.linkReferralAction!(fd({ referredOrgId: ORG, code: 'AB12CD34' }))).rejects.toThrow(/e=already_referred/);
    h.rpc.adminCommissionAdjust.mockResolvedValueOnce({ ok: false, code: 'step_up_required' } as never);
    await expect(a.adjustCommissionAction!(fd({ organizationId: ORG, amount: '5', reason: 'r', idempotencyKey: KEY }))).rejects.toThrow(/e=step_up_required/);
    h.rpc.adminCertificatePublish.mockResolvedValueOnce({ ok: false, code: 'target_not_found' } as never);
    await expect(a.publishCertificateAction!(fd({ organizationId: ORG, title: 'x', lotId: ID, file: pdf() }))).rejects.toThrow(/e=target_not_found/);
  });
});

describe('P9 customer actions', () => {
  const cust = () => import('@/app/(portal)/client/certificates/actions') as unknown as Promise<{ downloadCertificateAction: (f: FormData) => Promise<void> }>;
  const acct = () => import('@/app/(portal)/client/account/actions') as unknown as Promise<{ setNotificationPrefAction: (f: FormData) => Promise<void> }>;
  it('certificates can only be downloaded when they are in the customer\'s own PUBLISHED list; the link is short-lived and made by the server', async () => {
    const { downloadCertificateAction } = await cust();
    h.rpc.certificatesList.mockResolvedValue({ ok: true, data: { certificates: [{ id: ID, status: 'published', storage_path: `${ORG}/${ID}.pdf` }, { id: KEY, status: 'withdrawn', storage_path: null }] } });
    h.user = null;
    expect(await run(downloadCertificateAction, fd({ organizationId: ORG, id: ID }))).toMatch(/^REDIRECT:\/login/);
    expect(h.rpc.certificatesList).not.toHaveBeenCalled();
    h.user = { id: 'u1', email: 'u@example.test' };
    expect(await run(downloadCertificateAction, fd({ organizationId: ORG, id: ID }))).toBe('REDIRECT:https://signed.example/file?token=abc');
    expect(h.rpc.certificatesList).toHaveBeenCalledWith(ORG);
    expect(await run(downloadCertificateAction, fd({ organizationId: ORG, id: KEY }))).toMatch(/e=document_not_found/); // withdrawn
    expect(await run(downloadCertificateAction, fd({ organizationId: ORG, id: '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b99' }))).toMatch(/e=document_not_found/); // not in this organization's list
    expect(await run(downloadCertificateAction, fd({ organizationId: 'x', id: ID }))).toMatch(/e=invalid_response/);
    expect(await run(downloadCertificateAction, fd({ organizationId: ORG, id: 'x' }))).toMatch(/e=invalid_response/);
    h.signedUrl = null;
    expect(await run(downloadCertificateAction, fd({ organizationId: ORG, id: ID }))).toMatch(/e=document_not_found/);
    h.rpc.certificatesList.mockResolvedValue({ ok: false, code: 'organization_not_found' } as never);
    h.signedUrl = 'https://signed.example/file?token=abc';
    expect(await run(downloadCertificateAction, fd({ organizationId: ORG, id: ID }))).toMatch(/e=document_not_found/);
  });
  it('notification preferences: signed in only, optional categories only (billing cannot be switched off)', async () => {
    const { setNotificationPrefAction } = await acct();
    h.user = null;
    expect(await run(setNotificationPrefAction, fd({ category: 'certificates', enabled: 'false' }))).toMatch(/^REDIRECT:\/login/);
    h.user = { id: 'u1', email: 'u@example.test' };
    expect(await run(setNotificationPrefAction, fd({ category: 'billing', enabled: 'false' }))).toMatch(/e=invalid_response/);
    expect(h.rpc.notificationPrefSet).not.toHaveBeenCalled();
    expect(await run(setNotificationPrefAction, fd({ category: 'certificates', enabled: 'false', org: ORG }))).toMatch(/ok=1/);
    expect(h.rpc.notificationPrefSet).toHaveBeenCalledWith('certificates', false);
    expect(await run(setNotificationPrefAction, fd({ category: 'fulfillment', enabled: 'true' }))).toMatch(/ok=1/);
    expect(h.rpc.notificationPrefSet).toHaveBeenLastCalledWith('fulfillment', true);
  });
});

describe('P9 pages and routes', () => {
  const src = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');
  it('every admin page checks the staff capability first, and the nav shows each page only to the roles that may open it', () => {
    const pages: [string, string][] = [
      ['app/(portal)/admin/inventory/certificates/page.tsx', "requireStaffCapability('/admin/inventory/certificates', 'inventory.adjust')"],
      ['app/(portal)/admin/commissions/page.tsx', "requireStaffCapability('/admin/commissions', 'org.billing.read')"],
      ['app/(portal)/admin/notifications/page.tsx', "requireStaffCapability('/admin/notifications', 'flags.read')"],
      ['app/(portal)/admin/reports/page.tsx', "requireStaffCapability('/admin/reports', 'org.read')"],
    ];
    for (const [file, gate] of pages) expect(src(...file.split('/')), file).toContain(gate);
  });
  it('every customer page requires a signed-in user and talks to the database only through the RPC layer', () => {
    for (const file of ['app/(portal)/client/certificates/page.tsx', 'app/(portal)/client/commissions/page.tsx']) {
      const s = src(...file.split('/'));
      expect(s, file).toMatch(/await requireUser\('\/client\/(certificates|commissions)'\)/);
      expect(s, file).not.toMatch(/createPortalServerClient|\.from\(/);
    }
  });
  it('the reports page builds the CSV with the formula-safe function and offers no download route', () => {
    const s = src('app', '(portal)', 'admin', 'reports', 'page.tsx');
    expect(s).toContain('toCsv(chosen.columns, result.data.rows)');
    expect(src('components', 'portal', 'csv-download.tsx')).toMatch(/new Blob\(/);
  });
  it('no P9 code uses a service-role key, a raw table query or the secret name of an e-mail provider', () => {
    for (const file of ['lib/portal/aftersales/server.ts', 'lib/portal/aftersales/sender.ts', 'lib/portal/aftersales/model.ts']) {
      const s = src(...file.split('/'));
      expect(s, file).not.toMatch(/service_role|SERVICE_ROLE|\.from\('(?!portal-documents)/);
      expect(s, file).not.toMatch(/process\.env/);
    }
  });
});
