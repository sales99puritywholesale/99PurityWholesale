import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_CODES,
  PROTECTED_ACTIONS,
  ROLE_CAPABILITIES,
  STAFF_ROLES,
  STEP_UP_ACTIONS,
  STEP_UP_CLOCK_SKEW_SECONDS,
  STEP_UP_MAX_AGE_SECONDS,
  canSeeAdminNavItem,
  capabilitiesForRoles,
  evaluateAdminAccess,
  evaluateAnyCapability,
  evaluateCapability,
  evaluateStaffAction,
  filterAdminNav,
  isCapabilityCode,
  isProtectedActionId,
  isStaffRole,
  isStepUpFresh,
  roleHasCapability,
  stepUpAgeSeconds,
  type CapabilityCode,
  type ProtectedActionId,
  type StaffAccessContext,
  type StaffRole,
} from '@/lib/portal/permissions';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

function ctx(overrides: Partial<StaffAccessContext> = {}): StaffAccessContext {
  return { authenticated: true, staffStatus: 'active', roles: ['admin'], dbSessionOk: true, totpVerifiedAt: ago(60), now: NOW, ...overrides };
}
const asRole = (role: string, overrides: Partial<StaffAccessContext> = {}) => ctx({ roles: [role], ...overrides });

// ---- source of truth: the approved migration seed ---------------------------------------------------------------------------
function parseSeed() {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20261108000002_staff_capabilities.sql'), 'utf8');
  // Descriptions may contain ';', so the blocks end at the closing ");" of the last tuple, not at the first semicolon.
  const capsBlock = /insert into public\.capabilities \(code, description\) values([\s\S]*?)\);\s*\n\s*insert into public\.role_capabilities/i.exec(sql)?.[1] ?? '';
  const caps = [...capsBlock.matchAll(/\(\s*'([a-z.]+)'\s*,/g)].map((m) => m[1] as string);
  const mapBlock = /insert into public\.role_capabilities \(role, capability_code\) values([\s\S]*?\));\s*\n/i.exec(sql)?.[1] ?? '';
  const pairs = [...mapBlock.matchAll(/\(\s*'([a-z]+)'\s*,\s*'([a-z.]+)'\s*\)/g)].map((m) => [m[1] as string, m[2] as string] as const);
  const byRole: Record<string, string[]> = { admin: [...caps] }; // "select 'admin', c.code from public.capabilities c"
  for (const [role, cap] of pairs) (byRole[role] ??= []).push(cap);
  // Additive capabilities introduced by LATER migrations (0005 review draft rev3): same two statements, parsed from the file.
  const later = readFileSync(join(process.cwd(), 'supabase', 'review', '0005_rate_limits_and_owner_mfa.sql'), 'utf8');
  const laterCapsBlock = /insert into public\.capabilities \(code, description\) values([\s\S]*?)\);\s*\n\s*insert into public\.role_capabilities/i.exec(later)?.[1] ?? '';
  const laterCaps = [...laterCapsBlock.matchAll(/\(\s*'([a-z.]+)'\s*,/g)].map((m) => m[1] as string);
  const laterMapBlock = /insert into public\.role_capabilities \(role, capability_code\) values([\s\S]*?\));\s*\n/i.exec(later)?.[1] ?? '';
  const laterPairs = [...laterMapBlock.matchAll(/\(\s*'([a-z]+)'\s*,\s*'([a-z.]+)'\s*\)/g)].map((m) => [m[1] as string, m[2] as string] as const);
  for (const c of laterCaps) caps.push(c);
  for (const [role, cap] of laterPairs) (byRole[role] ??= []).push(cap); // admin gets the new capability explicitly (it is not "select all" in 0005)
  return { caps, byRole };
}

describe('TypeScript mirror equals the approved database seed (migration 20261108000002)', () => {
  const seed = parseSeed();
  it('has the same 28 capability codes, in the same set (27 from 0002 plus owner.mfa.authorize from the 0005 draft)', () => {
    expect(seed.caps).toHaveLength(28);
    expect([...CAPABILITY_CODES].sort()).toEqual([...seed.caps].sort());
  });
  it('has the same role mapping: admin 28, finance 8, operations 7, support 8', () => {
    for (const role of STAFF_ROLES) expect([...ROLE_CAPABILITIES[role]].sort()).toEqual([...(seed.byRole[role] ?? [])].sort());
    expect(STAFF_ROLES.map((r) => ROLE_CAPABILITIES[r].length)).toEqual([28, 8, 7, 8]);
  });
  it('has exactly the four approved roles and no super-admin', () => {
    expect([...STAFF_ROLES]).toEqual(['admin', 'finance', 'operations', 'support']);
    expect(Object.keys(seed.byRole).sort()).toEqual([...STAFF_ROLES].sort());
    for (const r of STAFF_ROLES) expect(r).not.toMatch(/super/i);
  });
});

describe('role and capability helpers', () => {
  it('validates roles and capability codes strictly', () => {
    for (const r of STAFF_ROLES) expect(isStaffRole(r)).toBe(true);
    for (const bad of ['Admin', 'ADMIN', 'super_admin', 'root', '', ' admin', 'admin ', null, undefined, 1, {}, ['admin']]) expect(isStaffRole(bad)).toBe(false);
    expect(isCapabilityCode('staff.manage')).toBe(true);
    for (const bad of ['staff.*', 'STAFF.MANAGE', '*', 'staff', '', null, undefined]) expect(isCapabilityCode(bad)).toBe(false);
  });
  it('maps unknown role strings to nothing', () => {
    expect(capabilitiesForRoles(['super_admin', 'Admin', '', 'root']).size).toBe(0);
    expect(capabilitiesForRoles(['finance', 'nonsense']).size).toBe(8);
    expect(capabilitiesForRoles(['support', 'operations']).size).toBe(new Set([...ROLE_CAPABILITIES.support, ...ROLE_CAPABILITIES.operations]).size);
  });
  it('roleHasCapability matches the mapping', () => {
    expect(roleHasCapability('admin', 'flags.write')).toBe(true);
    expect(roleHasCapability('support', 'flags.write')).toBe(false);
    expect(roleHasCapability('hacker', 'org.read')).toBe(false);
  });
});

describe('capability matrix: every role against every capability (permitted and denied)', () => {
  for (const role of STAFF_ROLES) {
    it(`${role}: allowed exactly for its ${ROLE_CAPABILITIES[role].length} capabilities, denied for the rest`, () => {
      for (const cap of CAPABILITY_CODES) {
        const d = evaluateCapability(asRole(role), cap);
        const expected = ROLE_CAPABILITIES[role].includes(cap);
        expect(d.allowed, `${role} ${cap}`).toBe(expected);
        if (!expected) expect(d).toEqual({ allowed: false, reason: 'capability-missing' });
      }
    });
  }
  it('combines the capabilities of several roles by union only', () => {
    const d = evaluateCapability(ctx({ roles: ['support', 'finance'] }), 'org.billing.read');
    expect(d.allowed).toBe(true);
    expect(evaluateCapability(ctx({ roles: ['support', 'finance'] }), 'staff.manage').allowed).toBe(false);
  });
});

describe('default-deny session gate', () => {
  const cases: [string, Partial<StaffAccessContext>, string][] = [
    ['unauthenticated', { authenticated: false }, 'unauthenticated'],
    ['no staff row', { staffStatus: 'none' }, 'not-staff'],
    ['disabled staff', { staffStatus: 'disabled' }, 'staff-disabled'],
    ['no roles', { roles: [] }, 'no-valid-role'],
    ['only unknown roles', { roles: ['super_admin', 'Admin', 'root'] }, 'no-valid-role'],
    ['database did not confirm the staff session (aal1, unapproved factor, stale validation)', { dbSessionOk: false }, 'staff-session-not-verified'],
  ];
  for (const [label, override, reason] of cases) {
    it(`denies: ${label}`, () => {
      expect(evaluateCapability(ctx(override), 'org.read')).toEqual({ allowed: false, reason });
      expect(evaluateAnyCapability(ctx(override), ['org.read'])).toEqual({ allowed: false, reason });
      expect(evaluateAdminAccess(ctx(override))).toEqual({ allowed: false, reason });
      expect(evaluateStaffAction(ctx(override), 'staff.list')).toEqual({ allowed: false, reason });
    });
  }
  it('an admin role string does not help a disabled, unverified or unauthenticated user (privilege escalation attempts)', () => {
    expect(evaluateStaffAction(ctx({ staffStatus: 'disabled', roles: ['admin'] }), 'staff.role.grant').allowed).toBe(false);
    expect(evaluateStaffAction(ctx({ dbSessionOk: false, roles: ['admin'] }), 'staff.role.grant').allowed).toBe(false);
    expect(evaluateStaffAction(ctx({ authenticated: false, roles: ['admin'] }), 'staff.role.grant').allowed).toBe(false);
    expect(evaluateStaffAction(ctx({ roles: ['Admin'] }), 'staff.role.grant').allowed).toBe(false);
    expect(evaluateStaffAction(ctx({ roles: ['support', 'admin\u0000'] }), 'staff.role.grant').allowed).toBe(false);
  });
  it('an empty any-of list never allows', () => {
    expect(evaluateAnyCapability(ctx(), []).allowed).toBe(false);
  });
});

describe('step-up (fresh TOTP within 15 minutes)', () => {
  it('uses a 15 minute window', () => expect(STEP_UP_MAX_AGE_SECONDS).toBe(900));
  it('is fresh at the boundary and stale just after', () => {
    expect(isStepUpFresh(ago(0), NOW)).toBe(true);
    expect(isStepUpFresh(ago(899), NOW)).toBe(true);
    expect(isStepUpFresh(ago(900), NOW)).toBe(true);
    expect(isStepUpFresh(ago(901), NOW)).toBe(false);
  });
  it('treats missing, far-future and invalid timestamps as not fresh (fail closed)', () => {
    expect(isStepUpFresh(null, NOW)).toBe(false);
    expect(isStepUpFresh(new Date(NOW.getTime() + 61_000), NOW)).toBe(false);
    expect(isStepUpFresh(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(false);
    expect(isStepUpFresh(new Date('invalid'), NOW)).toBe(false);
    expect(stepUpAgeSeconds(null, NOW)).toBeNull();
    expect(stepUpAgeSeconds(ago(30), NOW)).toBe(30);
  });
  it('allows the same 60 second clock skew as the database (private.step_up_ok)', () => {
    expect(STEP_UP_CLOCK_SKEW_SECONDS).toBe(60);
    expect(isStepUpFresh(new Date(NOW.getTime() + 60_000), NOW)).toBe(true);
    expect(isStepUpFresh(new Date(NOW.getTime() + 1_000), NOW)).toBe(true);
    expect(stepUpAgeSeconds(new Date(NOW.getTime() + 30_000), NOW)).toBe(0);
  });
  it('blocks every step-up staff action without a fresh verification, and allows it with one', () => {
    for (const id of STEP_UP_ACTIONS) {
      const action = PROTECTED_ACTIONS[id as ProtectedActionId];
      if (action.actor !== 'staff') continue;
      const role = STAFF_ROLES.find((r) => ROLE_CAPABILITIES[r].includes(action.capability)) as StaffRole;
      expect(evaluateStaffAction(asRole(role, { totpVerifiedAt: null }), id), id).toEqual({ allowed: false, reason: 'step-up-required' });
      expect(evaluateStaffAction(asRole(role, { totpVerifiedAt: ago(3600) }), id), id).toEqual({ allowed: false, reason: 'step-up-required' });
      expect(evaluateStaffAction(asRole(role, { totpVerifiedAt: ago(30) }), id).allowed, id).toBe(true);
    }
  });
  it('checks the capability before the step-up (a missing capability is never reported as a step-up problem)', () => {
    expect(evaluateStaffAction(asRole('support', { totpVerifiedAt: null }), 'staff.role.grant')).toEqual({ allowed: false, reason: 'capability-missing' });
  });
  it('does not require step-up for read-only actions', () => {
    expect(evaluateStaffAction(asRole('admin', { totpVerifiedAt: null }), 'staff.list').allowed).toBe(true);
    expect(evaluateStaffAction(asRole('support', { totpVerifiedAt: null }), 'org.members.view').allowed).toBe(true);
  });
});

describe('role-specific permitted and denied actions', () => {
  const fresh = { totpVerifiedAt: ago(10) };
  it('admin may manage staff; no other role may', () => {
    for (const id of ['staff.member.add', 'staff.role.grant', 'staff.role.revoke', 'staff.member.suspend', 'staff.member.reinstate', 'staff.mfa.window.authorize'] as const) {
      expect(evaluateStaffAction(asRole('admin', fresh), id).allowed, `admin ${id}`).toBe(true);
      for (const role of ['finance', 'operations', 'support'] as const) expect(evaluateStaffAction(asRole(role, fresh), id).allowed, `${role} ${id}`).toBe(false);
    }
  });
  it('support: reads members and invites but cannot read billing, change organizations or touch staff', () => {
    expect(evaluateStaffAction(asRole('support'), 'org.members.view').allowed).toBe(true);
    expect(evaluateStaffAction(asRole('support'), 'org.invites.view').allowed).toBe(true);
    expect(evaluateStaffAction(asRole('support', fresh), 'org.billing.view').allowed).toBe(false);
    expect(evaluateStaffAction(asRole('support', fresh), 'org.status.change').allowed).toBe(false);
    expect(evaluateStaffAction(asRole('support'), 'staff.list').allowed).toBe(false);
    expect(evaluateStaffAction(asRole('support'), 'audit.view').allowed).toBe(false);
  });
  it('finance: billing and financial actions only; no staff, no member administration', () => {
    expect(evaluateStaffAction(asRole('finance'), 'org.billing.view').allowed).toBe(true);
    expect(evaluateStaffAction(asRole('finance', fresh), 'payments.confirm').allowed).toBe(true);
    expect(evaluateStaffAction(asRole('finance', fresh), 'financial.write').allowed).toBe(true);
    expect(evaluateStaffAction(asRole('finance', fresh), 'org.members.manage').allowed).toBe(false);
    expect(evaluateStaffAction(asRole('finance', fresh), 'staff.role.grant').allowed).toBe(false);
  });
  it('operations: fulfillment and onboarding review; no financial or staff actions', () => {
    expect(evaluateStaffAction(asRole('operations'), 'org.onboarding.review').allowed).toBe(true);
    expect(evaluateStaffAction(asRole('operations', fresh), 'payments.confirm').allowed).toBe(false);
    expect(evaluateStaffAction(asRole('operations', fresh), 'staff.member.suspend').allowed).toBe(false);
  });
  it('audit log is readable only by admin', () => {
    expect(evaluateStaffAction(asRole('admin'), 'audit.view').allowed).toBe(true);
    for (const role of ['finance', 'operations', 'support'] as const) expect(evaluateStaffAction(asRole(role), 'audit.view').allowed).toBe(false);
  });
});

describe('action registry invariants', () => {
  const ids = Object.keys(PROTECTED_ACTIONS) as ProtectedActionId[];
  it('rejects unknown actions and prototype keys', () => {
    for (const bad of ['', 'nope', 'staff.*', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(isProtectedActionId(bad), bad).toBe(false);
      expect(evaluateStaffAction(ctx(), bad)).toEqual({ allowed: false, reason: 'unknown-action' });
    }
  });
  it('every staff action names a real capability', () => {
    for (const id of ids) {
      const a = PROTECTED_ACTIONS[id];
      if (a.actor === 'staff') expect(CAPABILITY_CODES.includes(a.capability as CapabilityCode), id).toBe(true);
    }
  });
  it('the staff evaluator never allows owner or member actions', () => {
    for (const id of ids) {
      const a = PROTECTED_ACTIONS[id];
      if (a.actor !== 'staff') expect(evaluateStaffAction(asRole('admin', { totpVerifiedAt: ago(1) }), id), id).toEqual({ allowed: false, reason: 'wrong-actor-type' });
    }
  });
  it('every step-up action is audited, and every action has a description', () => {
    for (const id of ids) {
      const a = PROTECTED_ACTIONS[id];
      expect(a.description.length, id).toBeGreaterThan(5);
      if (a.stepUp) expect(a.audit, `${id} requires step-up so it must be audited`).toBe(true);
    }
  });
  it('the documented step-up classes all require step-up', () => {
    const required: ProtectedActionId[] = [
      'staff.role.grant', 'staff.role.revoke', 'staff.member.suspend', 'staff.member.reinstate', 'staff.mfa.window.authorize', 'staff.mfa.factor.remove',
      'mfa.factor.remove', 'mfa.recovery.generate', 'org.ownership.transfer', 'org.owner.remove', 'org.member.remove', 'org.invite.create.owner',
      'payments.confirm', 'payments.reconcile', 'financial.write', 'flags.change', 'gates.change', 'documents.delete', 'org.status.change',
    ];
    for (const id of required) expect(PROTECTED_ACTIONS[id].stepUp, id).toBe(true);
  });
  it('plain reads do not require step-up', () => {
    for (const id of ['staff.list', 'org.view', 'org.members.view', 'audit.view', 'org.invites.view'] as const) expect(PROTECTED_ACTIONS[id].stepUp, id).toBe(false);
  });
});

describe('admin navigation visibility (cosmetic; default deny)', () => {
  const items = ['overview', 'applications', 'organizations', 'customers', 'products', 'pricing', 'orders', 'invoices', 'fulfillment', 'inventory', 'integrations', 'commissions', 'notifications', 'reports', 'settings', 'staff', 'audit'].map((key) => ({ key }));
  const keys = (c: StaffAccessContext) => filterAdminNav(c, items).map((i) => i.key);
  it('hides everything from non-staff and unverified sessions', () => {
    expect(keys(ctx({ staffStatus: 'none' }))).toEqual([]);
    expect(keys(ctx({ dbSessionOk: false }))).toEqual([]);
    expect(keys(ctx({ authenticated: false }))).toEqual([]);
    expect(keys(ctx({ staffStatus: 'disabled' }))).toEqual([]);
  });
  it('shows support only what its capabilities allow', () => {
    expect(keys(asRole('support'))).toEqual(['overview', 'applications', 'organizations', 'customers', 'orders', 'notifications', 'reports', 'settings']);
  });
  it('shows admin staff and audit plus every mapped module; unmapped modules stay hidden even for admin', () => {
    const k = keys(asRole('admin'));
    expect(k).toEqual(expect.arrayContaining(['overview', 'applications', 'organizations', 'customers', 'products', 'pricing', 'orders', 'invoices', 'fulfillment', 'inventory', 'integrations', 'commissions', 'notifications', 'reports', 'settings', 'staff', 'audit']));
    expect(filterAdminNav(asRole('admin'), [{ key: 'not_a_module' }])).toEqual([]);
  });
  it('P9: commissions are for finance and admin only; reports and notifications are open to every role (each report and action is gated again by the database)', () => {
    expect(keys(asRole('finance'))).toContain('commissions');
    for (const role of ['operations', 'support'] as const) expect(keys(asRole(role)), role).not.toContain('commissions');
    for (const role of ['finance', 'operations', 'support'] as const) {
      expect(keys(asRole(role)), role).toContain('reports');
      expect(keys(asRole(role)), role).toContain('notifications');
    }
  });
  it('P3: products and pricing are admin only; every staff role may read orders', () => {
    for (const role of ['finance', 'operations', 'support'] as const) {
      expect(keys(asRole(role))).not.toContain('products');
      expect(keys(asRole(role))).not.toContain('pricing');
      expect(keys(asRole(role))).toContain('orders');
    }
  });
  it('does not expose staff or audit to finance, operations or support', () => {
    for (const role of ['finance', 'operations', 'support'] as const) {
      expect(keys(asRole(role))).not.toContain('staff');
      expect(keys(asRole(role))).not.toContain('audit');
    }
  });
  it('ignores prototype keys', () => {
    for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) expect(canSeeAdminNavItem(asRole('admin'), bad)).toBe(false);
  });
});
