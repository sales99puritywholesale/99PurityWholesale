import { describe, expect, it } from 'vitest';
import { denyAllContext, evaluateAdminAccess, evaluateStaffAction, parseStaffContext } from '@/lib/portal/permissions';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const epoch = (secondsAgo: number) => Math.floor(NOW.getTime() / 1000) - secondsAgo;
const good = { staff_status: 'active', roles: ['admin'], session_ok: true, step_up_ok: true, last_totp_epoch: epoch(60) };

describe('parseStaffContext (answer of public.rpc_my_staff_context)', () => {
  it('builds the context from a valid payload', () => {
    const c = parseStaffContext(good, true, NOW);
    expect(c).toMatchObject({ authenticated: true, staffStatus: 'active', roles: ['admin'], dbSessionOk: true });
    expect(c.totpVerifiedAt?.getTime()).toBe(epoch(60) * 1000);
    expect(evaluateStaffAction(c, 'staff.role.grant').allowed).toBe(true);
  });
  it('is deny-all for an unauthenticated request whatever the payload says', () => {
    const c = parseStaffContext(good, false, NOW);
    expect(c).toEqual(denyAllContext(false, NOW));
    expect(evaluateAdminAccess(c).allowed).toBe(false);
  });
  it('is deny-all for malformed, extended or hostile payloads', () => {
    const bad: unknown[] = [
      null, undefined, 'admin', 42, [], {},
      { ...good, extra: 'x' },                       // strict: unknown keys rejected
      { ...good, staff_status: 'ADMIN' },
      { ...good, staff_status: 'super_admin' },
      { ...good, roles: 'admin' },
      { ...good, roles: [1] },
      { ...good, roles: Array.from({ length: 17 }, () => 'admin') },
      { ...good, roles: ['a'.repeat(41)] },
      { ...good, session_ok: 'true' },
      { ...good, session_ok: 1 },
      { ...good, step_up_ok: null },
      { ...good, last_totp_epoch: '1731240000' },
      { ...good, last_totp_epoch: -1 },
      { ...good, last_totp_epoch: 1.5 },
    ];
    for (const payload of bad) {
      const c = parseStaffContext(payload, true, NOW);
      expect(c.staffStatus, JSON.stringify(payload)).toBe('none');
      expect(evaluateAdminAccess(c).allowed, JSON.stringify(payload)).toBe(false);
    }
  });
  it('a payload that says the staff session is not verified denies even an admin role', () => {
    const c = parseStaffContext({ ...good, session_ok: false }, true, NOW);
    expect(evaluateStaffAction(c, 'staff.list')).toEqual({ allowed: false, reason: 'staff-session-not-verified' });
  });
  it('a disabled staff member is denied', () => {
    const c = parseStaffContext({ ...good, staff_status: 'disabled' }, true, NOW);
    expect(evaluateStaffAction(c, 'staff.list')).toEqual({ allowed: false, reason: 'staff-disabled' });
  });
  it('without a TOTP time there is no step-up, even if the payload claims step_up_ok', () => {
    const c = parseStaffContext({ ...good, last_totp_epoch: null }, true, NOW);
    expect(c.totpVerifiedAt).toBeNull();
    expect(evaluateStaffAction(c, 'staff.role.grant')).toEqual({ allowed: false, reason: 'step-up-required' });
    const missing = parseStaffContext({ staff_status: 'active', roles: ['admin'], session_ok: true, step_up_ok: true }, true, NOW);
    expect(evaluateStaffAction(missing, 'staff.role.grant')).toEqual({ allowed: false, reason: 'step-up-required' });
  });
  it('a stale TOTP time requires a new step-up', () => {
    const c = parseStaffContext({ ...good, last_totp_epoch: epoch(3600) }, true, NOW);
    expect(evaluateStaffAction(c, 'staff.role.grant')).toEqual({ allowed: false, reason: 'step-up-required' });
  });
  it('unknown role strings in a valid payload grant nothing', () => {
    const c = parseStaffContext({ ...good, roles: ['super_admin', 'Admin'] }, true, NOW);
    expect(evaluateAdminAccess(c)).toEqual({ allowed: false, reason: 'no-valid-role' });
  });
});
