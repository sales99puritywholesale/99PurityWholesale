import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { denyAllContext, parseStaffContext } from '@/lib/portal/permissions/context';
import type { StaffAccessContext } from '@/lib/portal/permissions/evaluate';

// Scenario tests for the P8 server actions with authentication and the staff context mocked. They prove the APPLICATION-side decision only (no RPC is even attempted without the
// right staff context; inputs are validated; the staff lookup rules are applied before anyone becomes staff). The database re-check (capability, step-up, self-change and
// last-administrator rules) is the second layer and is NOT exercised here.
const h = vi.hoisted(() => {
  const ok = async () => ({ ok: true, data: {} });
  return {
    user: { id: 'u1', email: 'u@example.test' } as { id: string; email: string } | null,
    ctx: null as unknown,
    rpc: {
      adminOrgSetStatus: vi.fn(ok), adminOrgSetTerms: vi.fn(ok), adminMemberSet: vi.fn(ok), adminOrgMemberAdd: vi.fn(ok), adminApplicationCreate: vi.fn(ok),
      adminApplicationReview: vi.fn(async (..._a: unknown[]) => ({ ok: true, data: { organization_id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', owner_added: true } })),
      adminSettingSet: vi.fn(ok), adminFeeSave: vi.fn(ok), adminFeeRetire: vi.fn(ok), profileUpdate: vi.fn(ok),
      staffLookup: vi.fn(async (_e: string) => ({ ok: true, data: { found: true, user_id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', email_confirmed: true, is_staff: false, is_organization_member: false } })),
      staffAddMember: vi.fn(ok), staffGrantRole: vi.fn(ok), staffRevokeRole: vi.fn(ok), staffSetStatus: vi.fn(ok),
      staffAuthorizeWindow: vi.fn(async (..._a: unknown[]) => ({ ok: true, data: { window_id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', expires_at: '2026-11-11T13:30:00.000Z' } })),
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
vi.mock('@/lib/portal/admin-ops/server', async (orig) => ({ ...(await orig<object>()), ...h.rpc }));

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
const ADMIN_ONLY = ['admin'];
const MONEY = ['finance', 'admin'];

type Row = { name: string; file: 'ops' | 'staff'; allowed: string[]; form: Record<string, string>; rpc: keyof typeof h.rpc; path: RegExp };
const ACTIONS: Row[] = [
  { name: 'setOrgStatusAction', file: 'ops', allowed: ADMIN_ONLY, form: { organizationId: ORG, status: 'suspended', reason: 'unpaid' }, rpc: 'adminOrgSetStatus', path: /^REDIRECT:\/admin\/organizations\/[0-9a-f-]{36}\?/ },
  { name: 'setOrgTermsAction', file: 'ops', allowed: ADMIN_ONLY, form: { organizationId: ORG, terms: 'net30' }, rpc: 'adminOrgSetTerms', path: /^REDIRECT:\/admin\/organizations\// },
  { name: 'memberSetAction', file: 'ops', allowed: ADMIN_ONLY, form: { organizationId: ORG, userId: ID, action: 'remove' }, rpc: 'adminMemberSet', path: /^REDIRECT:\/admin\/organizations\// },
  { name: 'memberAddAction', file: 'ops', allowed: ADMIN_ONLY, form: { organizationId: ORG, email: 'new@example.com', role: 'member' }, rpc: 'adminOrgMemberAdd', path: /^REDIRECT:\/admin\/organizations\// },
  { name: 'createApplicationAction', file: 'ops', allowed: ADMIN_ONLY, form: { company: 'Acme', contactName: 'A B', contactEmail: 'a@acme.com' }, rpc: 'adminApplicationCreate', path: /^REDIRECT:\/admin\/applications\?/ },
  { name: 'reviewApplicationAction', file: 'ops', allowed: ADMIN_ONLY, form: { id: ID, decision: 'reject', note: 'not a fit' }, rpc: 'adminApplicationReview', path: /^REDIRECT:\/admin\/(applications|organizations)/ },
  { name: 'saveSettingAction', file: 'ops', allowed: ADMIN_ONLY, form: { key: 'payment_instructions', value: 'Zelle pay@example.com' }, rpc: 'adminSettingSet', path: /^REDIRECT:\/admin\/settings\?/ },
  { name: 'saveFeeAction', file: 'ops', allowed: MONEY, form: { code: 'per_order', name: 'Per order', amount: '5.00', unit: 'per_order', effectiveFrom: '2026-11-11' }, rpc: 'adminFeeSave', path: /^REDIRECT:\/admin\/settings\?/ },
  { name: 'retireFeeAction', file: 'ops', allowed: MONEY, form: { code: 'per_order', effectiveTo: '2026-12-31' }, rpc: 'adminFeeRetire', path: /^REDIRECT:\/admin\/settings\?/ },
  { name: 'addStaffAction', file: 'staff', allowed: ADMIN_ONLY, form: { email: 'new@example.com', role: 'support' }, rpc: 'staffAddMember', path: /^REDIRECT:\/admin\/staff\?/ },
  { name: 'grantRoleAction', file: 'staff', allowed: ADMIN_ONLY, form: { userId: ID, role: 'finance' }, rpc: 'staffGrantRole', path: /^REDIRECT:\/admin\/staff\?/ },
  { name: 'revokeRoleAction', file: 'staff', allowed: ADMIN_ONLY, form: { userId: ID, role: 'finance' }, rpc: 'staffRevokeRole', path: /^REDIRECT:\/admin\/staff\?/ },
  { name: 'setStaffStatusAction', file: 'staff', allowed: ADMIN_ONLY, form: { userId: ID, status: 'disabled' }, rpc: 'staffSetStatus', path: /^REDIRECT:\/admin\/staff\?/ },
];
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const load = async (file: 'ops' | 'staff') => (file === 'ops' ? import('@/app/(portal)/admin/ops-actions') : import('@/app/(portal)/admin/staff-actions')) as Promise<Record<string, (f: FormData) => Promise<void>>>;

beforeEach(() => {
  for (const f of Object.values(h.rpc)) f.mockClear();
});

describe('P8 staff actions: the staff context and capability are checked BEFORE any RPC call', () => {
  for (const a of ACTIONS) {
    describe(a.name, () => {
      for (const [label, sc] of Object.entries(SCENARIOS)) {
        const shouldRun = a.allowed.includes(label);
        it(`${label}: ${shouldRun ? 'reaches the RPC' : 'is refused and no RPC is called'}`, async () => {
          h.user = sc.user ? { id: 'u1', email: 'u@example.test' } : null;
          h.ctx = sc.ctx;
          const fn = (await load(a.file))[a.name] as (f: FormData) => Promise<void>;
          let thrown = '';
          try { await fn(fd(a.form)); } catch (e) { thrown = (e as Error).message; }
          if (shouldRun) {
            expect(h.rpc[a.rpc]).toHaveBeenCalledTimes(1);
            expect(thrown).toMatch(a.path);
            expect(thrown).toMatch(/[?&]ok=1/);
          } else {
            expect(h.rpc[a.rpc]).not.toHaveBeenCalled();
            expect(thrown).toMatch(sc.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
          }
        });
      }
    });
  }
  it('every exported action of both files is covered by this matrix', () => {
    const names = (f: string) => [...readFileSync(join(process.cwd(), 'src', 'app', '(portal)', 'admin', f), 'utf8').matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]);
    expect([...names('ops-actions.ts'), ...names('staff-actions.ts')].sort()).toEqual([...ACTIONS.map((a) => a.name), 'openEnrolmentWindowAction'].sort());
  });
  it('invalid input never reaches an RPC', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const o = await load('ops');
    const s = await load('staff');
    const bad: [(f: FormData) => Promise<void>, Record<string, string>][] = [
      [o.setOrgStatusAction!, { organizationId: ORG, status: 'suspended', reason: '' }], [o.setOrgStatusAction!, { organizationId: ORG, status: 'deleted', reason: 'x' }],
      [o.setOrgTermsAction!, { organizationId: ORG, terms: 'net999' }], [o.setOrgTermsAction!, { organizationId: ORG, terms: 'custom', days: 'abc' }],
      [o.memberSetAction!, { organizationId: ORG, userId: ID, action: 'set_role' }], [o.memberSetAction!, { organizationId: ORG, userId: 'x', action: 'remove' }],
      [o.memberAddAction!, { organizationId: ORG, email: 'nope', role: 'owner' }], [o.createApplicationAction!, { company: '', contactName: 'A', contactEmail: 'a@b.co' }],
      [o.reviewApplicationAction!, { id: ID, decision: 'approve' }], [o.reviewApplicationAction!, { id: ID, decision: 'reject' }], [o.saveSettingAction!, { key: 'wallet_enabled', value: 'true' }],
      [o.saveFeeAction!, { code: 'Bad Code', name: 'x', amount: '5', unit: 'per_order', effectiveFrom: '2026-11-11' }], [o.saveFeeAction!, { code: 'ok_code', name: 'x', amount: '-5', unit: 'per_order', effectiveFrom: '2026-11-11' }],
      [o.saveFeeAction!, { code: 'ok_code', name: 'x', amount: '5.123', unit: 'per_order', effectiveFrom: '2026-11-11' }], [o.saveFeeAction!, { code: 'ok_code', name: 'x', amount: '5', unit: 'per_century', effectiveFrom: '2026-11-11' }],
      [o.retireFeeAction!, { code: 'ok_code', effectiveTo: 'tomorrow' }], [s.grantRoleAction!, { userId: ID, role: 'super_admin' }], [s.setStaffStatusAction!, { userId: ID, status: 'deleted' }], [s.addStaffAction!, { email: 'bad', role: 'admin' }],
    ];
    for (const [fn, form] of bad) await expect(fn(fd(form))).rejects.toThrow(/e=invalid_response/);
    for (const f of Object.values(h.rpc)) expect(f).not.toHaveBeenCalled();
  });
  it('sends exact validated values (terms with custom days, a free fee, exact cents)', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const o = await load('ops');
    await expect(o.setOrgTermsAction!(fd({ organizationId: ORG, terms: 'custom', days: '45' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminOrgSetTerms).toHaveBeenCalledWith(ORG, 'net45');
    await expect(o.saveFeeAction!(fd({ code: 'Setup_Fee', name: ' Setup ', amount: '4,000.50', unit: 'flat', effectiveFrom: '2026-11-11', note: 'one time' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminFeeSave).toHaveBeenCalledWith({ code: 'setup_fee', name: 'Setup', amountCents: 400050, unit: 'flat', note: 'one time', effectiveFrom: '2026-11-11' });
    await expect(o.saveFeeAction!(fd({ code: 'free_item', name: 'Free', amount: '0', unit: 'flat', effectiveFrom: '2026-11-11' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.adminFeeSave).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'free_item', amountCents: 0 }));
  });
  it('approving an application opens the new organization, and flags when the owner still has to be added', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const o = await load('ops');
    await expect(o.reviewApplicationAction!(fd({ id: ID, decision: 'approve', orgCode: 'acme-labs', note: 'ok' }))).rejects.toThrow(new RegExp(`^REDIRECT:/admin/organizations/${ID}\\?ok=1$`));
    expect(h.rpc.adminApplicationReview).toHaveBeenCalledWith(ID, 'approve', 'ok', 'ACME-LABS');
    h.rpc.adminApplicationReview.mockResolvedValueOnce({ ok: true, data: { organization_id: ID, owner_added: false } });
    await expect(o.reviewApplicationAction!(fd({ id: ID, decision: 'approve', orgCode: 'ACME-2' }))).rejects.toThrow(/note=owner_pending/);
    h.rpc.adminApplicationReview.mockResolvedValueOnce({ ok: false, code: 'code_taken' } as never);
    await expect(o.reviewApplicationAction!(fd({ id: ID, decision: 'approve', orgCode: 'ACME-3' }))).rejects.toThrow(/\/admin\/applications\?e=code_taken/);
  });
  it('adding staff applies the lookup rules first: unknown, unconfirmed, already staff and organization members are refused without an RPC to add', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const s = await load('staff');
    const cases: [Record<string, unknown>, string][] = [
      [{ found: false }, 'user_not_found'], [{ found: true, user_id: ID, email_confirmed: false, is_staff: false, is_organization_member: false }, 'target_not_eligible'],
      [{ found: true, user_id: ID, email_confirmed: true, is_staff: true, is_organization_member: false }, 'already_staff'], [{ found: true, user_id: ID, email_confirmed: true, is_staff: false, is_organization_member: true }, 'organization_member_conflict'],
    ];
    for (const [data, code] of cases) {
      h.rpc.staffLookup.mockResolvedValueOnce({ ok: true, data } as never);
      await expect(s.addStaffAction!(fd({ email: 'x@example.com', role: 'support' }))).rejects.toThrow(new RegExp(`e=${code}`));
    }
    expect(h.rpc.staffAddMember).not.toHaveBeenCalled();
    await expect(s.addStaffAction!(fd({ email: ' X@Example.com ', role: 'finance' }))).rejects.toThrow(/ok=1/);
    expect(h.rpc.staffLookup).toHaveBeenLastCalledWith('x@example.com');
    expect(h.rpc.staffAddMember).toHaveBeenCalledWith(ID, 'finance');
  });
  it('database refusals are shown as codes (last owner, last administrator, self change)', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const o = await load('ops');
    const s = await load('staff');
    h.rpc.adminMemberSet.mockResolvedValueOnce({ ok: false, code: 'last_owner_protected' } as never);
    await expect(o.memberSetAction!(fd({ organizationId: ORG, userId: ID, action: 'remove' }))).rejects.toThrow(/e=last_owner_protected/);
    h.rpc.staffSetStatus.mockResolvedValueOnce({ ok: false, code: 'last_admin_protected' } as never);
    await expect(s.setStaffStatusAction!(fd({ userId: ID, status: 'disabled' }))).rejects.toThrow(/e=last_admin_protected/);
    h.rpc.staffGrantRole.mockResolvedValueOnce({ ok: false, code: 'self_change_not_allowed' } as never);
    await expect(s.grantRoleAction!(fd({ userId: ID, role: 'admin' }))).rejects.toThrow(/e=self_change_not_allowed/);
  });
});

describe('P8 customer action: profile', () => {
  it('requires a signed-in user and updates only name and phone with validated values', async () => {
    const a = await import('@/app/(portal)/client/account/actions');
    h.user = null;
    await expect(a.updateProfileAction(fd({ fullName: 'Jane', phone: '' }))).rejects.toThrow(/^REDIRECT:\/login/);
    expect(h.rpc.profileUpdate).not.toHaveBeenCalled();
    h.user = { id: 'u1', email: 'u@example.test' };
    await expect(a.updateProfileAction(fd({ org: ORG, fullName: '  Jane Lab ', phone: '+1 (512) 555-0100', email: 'evil@example.com', user_id: ID }))).rejects.toThrow(new RegExp(`^REDIRECT:/client/account\\?org=${ORG}&ok=1$`));
    expect(h.rpc.profileUpdate).toHaveBeenCalledWith('Jane Lab', '+1 (512) 555-0100');
    await expect(a.updateProfileAction(fd({ fullName: 'Jane', phone: 'call me maybe' }))).rejects.toThrow(/e=invalid_response/);
    await expect(a.updateProfileAction(fd({ fullName: 'x'.repeat(201), phone: '' }))).rejects.toThrow(/e=invalid_response/);
    expect(h.rpc.profileUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('P8 staff actions: opening an authenticator setup window', () => {
  const open = async () => (await import('@/app/(portal)/admin/staff-actions')).openEnrolmentWindowAction as unknown as (prev: unknown, f: FormData) => Promise<{ status: string; secret?: string; message?: string; note?: string }>;
  it('is admin only: every other caller is refused before any RPC call', async () => {
    const fn = await open();
    for (const [label, sc] of Object.entries(SCENARIOS)) {
      h.user = sc.user ? { id: 'u1', email: 'u@example.test' } : null;
      h.ctx = sc.ctx;
      h.rpc.staffAuthorizeWindow.mockClear();
      let thrown = '';
      let res: { status: string; secret?: string } | null = null;
      try { res = await fn({ status: 'idle' }, fd({ userId: ID, minutes: '30' })); } catch (e) { thrown = (e as Error).message; }
      if (label === 'admin') {
        expect(h.rpc.staffAuthorizeWindow, label).toHaveBeenCalledWith(ID, 'authenticator setup for a staff member', 30);
        expect(res?.status).toBe('created');
        expect(res?.secret).toBe('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed');
      } else {
        expect(h.rpc.staffAuthorizeWindow, label).not.toHaveBeenCalled();
        expect(thrown, label).toMatch(sc.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
      }
    }
  });
  it('validates the input and shows database refusals as fixed text', async () => {
    h.user = { id: 'u1', email: 'u@example.test' };
    h.ctx = staff(['admin']);
    const fn = await open();
    for (const form of [{ userId: 'x', minutes: '30' }, { userId: ID, minutes: '4' }, { userId: ID, minutes: '61' }, { userId: ID, minutes: 'abc' }]) {
      h.rpc.staffAuthorizeWindow.mockClear();
      expect((await fn({ status: 'idle' }, fd(form))).status).toBe('error');
      expect(h.rpc.staffAuthorizeWindow).not.toHaveBeenCalled();
    }
    h.rpc.staffAuthorizeWindow.mockResolvedValueOnce({ ok: false, code: 'window_already_open' } as never);
    expect((await fn({ status: 'idle' }, fd({ userId: ID, minutes: '30' }))).message).toMatch(/already open/);
    h.rpc.staffAuthorizeWindow.mockResolvedValueOnce({ ok: false, code: 'self_change_not_allowed' } as never);
    expect((await fn({ status: 'idle' }, fd({ userId: ID, minutes: '30' }))).message).toMatch(/cannot change your own/);
  });
});
