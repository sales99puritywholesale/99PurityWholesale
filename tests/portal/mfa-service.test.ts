import { describe, expect, it, vi } from 'vitest';
import {
  CODE_PATTERN, assuranceState, cancelEnrolment, claimFactor, confirmEnrolment, loginDestination, mapMfaError, mfaMessage, normalizeCode, removeSoleVerifiedFactor, startEnrolment, verifyChallenge,
  type AuthErr, type MfaApi,
} from '@/lib/portal/mfa/service';
import { decideRoute } from '@/lib/portal/route-policy';
import { isPortalMfaPath } from '@/lib/portal/paths';

type Factor = { id: string; type: string; status: string };
const QR = 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const SECRET = 'JBSWY3DPEHPK3PXP-SHOULD-NEVER-APPEAR';

/** A fake MfaApi with a programmable factor list and answers; records every call. */
function fake(o: { factors?: Factor[]; current?: 'aal1' | 'aal2' | null; next?: 'aal1' | 'aal2' | null; enrol?: { id: string; qrCode: string } | { error: AuthErr }; challenge?: { challengeId: string } | { error: AuthErr }; verify?: AuthErr; unenroll?: AuthErr; listError?: AuthErr; aalError?: AuthErr } = {}) {
  const calls: string[] = [];
  const api: MfaApi = {
    async listFactors() { calls.push('list'); return { factors: o.factors ?? [], error: o.listError ?? null }; },
    async enrollTotp() { calls.push('enroll'); return o.enrol ?? { id: 'f-new', qrCode: QR }; },
    async challenge(id) { calls.push(`challenge:${id}`); return o.challenge ?? { challengeId: 'c-1' }; },
    async verify(p) { calls.push(`verify:${p.factorId}:${p.challengeId}:${p.code}`); return { error: o.verify ?? null }; },
    async unenroll(id) { calls.push(`unenroll:${id}`); return { error: o.unenroll ?? null }; },
    async aal() { calls.push('aal'); return { current: o.current === undefined ? 'aal1' : o.current, next: o.next === undefined ? 'aal1' : o.next, error: o.aalError ?? null }; },
  };
  return { api, calls };
}

describe('error mapping', () => {
  it('maps provider errors to fixed codes; provider messages are never used', () => {
    expect(mapMfaError({ code: 'mfa_verification_failed', message: 'x' })).toBe('invalid_code');
    expect(mapMfaError({ code: 'mfa_challenge_expired' })).toBe('expired');
    expect(mapMfaError({ status: 429 })).toBe('rate_limited');
    expect(mapMfaError({ code: 'over_request_rate_limit' })).toBe('rate_limited');
    expect(mapMfaError({ code: 'mfa_factor_not_found' })).toBe('no_factor');
    expect(mapMfaError({ code: 'something_unknown', message: SECRET })).toBe('failed');
    expect(mapMfaError(null)).toBe('failed');
  });
  it('every code has fixed user copy that mentions no provider detail', () => {
    for (const c of ['invalid_code', 'expired', 'rate_limited', 'no_factor', 'not_allowed', 'failed', 'step_up_required', 'approval_rejected', 'already_approved']) expect(mfaMessage(c).length).toBeGreaterThan(10);
    expect(mfaMessage('nope')).toBe(mfaMessage('failed'));
  });
  it('a code is exactly six digits (spaces tolerated)', () => {
    expect(CODE_PATTERN.test(normalizeCode('123 456'))).toBe(true);
    for (const bad of ['12345', '1234567', 'abcdef', '12 34 5a', '', null, undefined]) expect(CODE_PATTERN.test(normalizeCode(bad))).toBe(false);
  });
});

describe('assurance state', () => {
  it('distinguishes satisfied (aal2), needs_challenge (verified factor, aal1), no_factor and unknown', async () => {
    expect(await assuranceState(fake({ current: 'aal2', next: 'aal2' }).api)).toBe('satisfied');
    expect(await assuranceState(fake({ current: 'aal1', next: 'aal2' }).api)).toBe('needs_challenge');
    expect(await assuranceState(fake({ current: 'aal1', next: 'aal1' }).api)).toBe('no_factor');
    expect(await assuranceState(fake({ aalError: { code: 'x' } }).api)).toBe('unknown');
    expect(await assuranceState(fake({ current: null, next: null }).api)).toBe('unknown');
  });
});

describe('TOTP enrolment', () => {
  it('returns the factor id and the QR code image and nothing else (the secret never crosses the service boundary)', async () => {
    const { api } = fake({ enrol: { id: 'f-1', qrCode: QR } });
    const r = await startEnrolment(api, { issuer: '99 Purity Wholesale', nowMs: 0 });
    expect(r).toEqual({ ok: true, factorId: 'f-1', qrCode: QR }); expect(JSON.stringify(r)).not.toContain(SECRET);
  });
  it('removes abandoned UNVERIFIED totp factors first and never touches a verified one', async () => {
    const { api, calls } = fake({ factors: [{ id: 'old-unverified', type: 'totp', status: 'unverified' }, { id: 'verified-1', type: 'totp', status: 'verified' }, { id: 'phone-1', type: 'phone', status: 'unverified' }] });
    await startEnrolment(api, { issuer: 'x', nowMs: 0 });
    expect(calls).toContain('unenroll:old-unverified'); expect(calls).not.toContain('unenroll:verified-1'); expect(calls).not.toContain('unenroll:phone-1');
  });
  it('refuses anything that is not an SVG data URI image, and maps enrol errors', async () => {
    expect(await startEnrolment(fake({ enrol: { id: 'f', qrCode: 'https://evil.example/qr.svg' } }).api, { issuer: 'x', nowMs: 0 })).toEqual({ ok: false, code: 'failed' });
    expect(await startEnrolment(fake({ enrol: { error: { code: 'over_request_rate_limit' } } }).api, { issuer: 'x', nowMs: 0 })).toEqual({ ok: false, code: 'rate_limited' });
    expect(await startEnrolment(fake({ listError: { code: 'x' } }).api, { issuer: 'x', nowMs: 0 })).toEqual({ ok: false, code: 'failed' });
  });
  it('confirms the first code: challenge then verify on an UNVERIFIED totp factor of the user only', async () => {
    const f = fake({ factors: [{ id: 'f-1', type: 'totp', status: 'unverified' }] });
    expect(await confirmEnrolment(f.api, 'f-1', '123 456')).toEqual({ ok: true }); expect(f.calls).toEqual(['list', 'challenge:f-1', 'verify:f-1:c-1:123456']);
    const other = fake({ factors: [{ id: 'f-1', type: 'totp', status: 'unverified' }] });
    expect(await confirmEnrolment(other.api, 'somebody-elses-factor', '123456')).toEqual({ ok: false, code: 'not_allowed' }); expect(other.calls).toEqual(['list']);
    const verified = fake({ factors: [{ id: 'f-1', type: 'totp', status: 'verified' }] });
    expect(await confirmEnrolment(verified.api, 'f-1', '123456')).toEqual({ ok: false, code: 'not_allowed' });
  });
  it('rejects a malformed code before any provider call, and handles invalid and expired codes', async () => {
    const f = fake({ factors: [{ id: 'f-1', type: 'totp', status: 'unverified' }] });
    expect(await confirmEnrolment(f.api, 'f-1', '12ab56')).toEqual({ ok: false, code: 'invalid_code' }); expect(f.calls).toEqual(['list']);
    expect(await confirmEnrolment(fake({ factors: [{ id: 'f-1', type: 'totp', status: 'unverified' }], verify: { code: 'mfa_verification_failed' } }).api, 'f-1', '123456')).toEqual({ ok: false, code: 'invalid_code' });
    expect(await confirmEnrolment(fake({ factors: [{ id: 'f-1', type: 'totp', status: 'unverified' }], verify: { code: 'mfa_challenge_expired' } }).api, 'f-1', '123456')).toEqual({ ok: false, code: 'expired' });
    expect(await confirmEnrolment(fake({ factors: [{ id: 'f-1', type: 'totp', status: 'unverified' }], challenge: { error: { status: 429 } } }).api, 'f-1', '123456')).toEqual({ ok: false, code: 'rate_limited' });
  });
  it('cancellation removes only an unverified totp factor; a verified factor can never be removed through it', async () => {
    const a = fake({ factors: [{ id: 'f-1', type: 'totp', status: 'unverified' }] }); expect(await cancelEnrolment(a.api, 'f-1')).toEqual({ ok: true }); expect(a.calls).toContain('unenroll:f-1');
    const b = fake({ factors: [{ id: 'f-1', type: 'totp', status: 'verified' }] }); expect(await cancelEnrolment(b.api, 'f-1')).toEqual({ ok: false, code: 'not_allowed' }); expect(b.calls).not.toContain('unenroll:f-1');
    const c = fake({ factors: [] }); expect(await cancelEnrolment(c.api, 'ghost')).toEqual({ ok: false, code: 'not_allowed' });
    expect(await cancelEnrolment(fake({ factors: [{ id: 'f-1', type: 'totp', status: 'unverified' }], unenroll: { code: 'x' } }).api, 'f-1')).toEqual({ ok: false, code: 'failed' });
  });
});

describe('TOTP challenge', () => {
  it('verifies against the verified totp factor', async () => {
    const f = fake({ factors: [{ id: 'unv', type: 'totp', status: 'unverified' }, { id: 'ver', type: 'totp', status: 'verified' }] });
    expect(await verifyChallenge(f.api, '654321')).toEqual({ ok: true }); expect(f.calls).toEqual(['list', 'challenge:ver', 'verify:ver:c-1:654321']);
  });
  it('no verified factor, invalid code, expired code and rate limit are distinct, clear outcomes', async () => {
    expect(await verifyChallenge(fake({ factors: [{ id: 'unv', type: 'totp', status: 'unverified' }] }).api, '123456')).toEqual({ ok: false, code: 'no_factor' });
    const ok = [{ id: 'ver', type: 'totp', status: 'verified' }];
    expect(await verifyChallenge(fake({ factors: ok }).api, 'abc')).toEqual({ ok: false, code: 'invalid_code' });
    expect(await verifyChallenge(fake({ factors: ok, verify: { code: 'mfa_verification_failed' } }).api, '123456')).toEqual({ ok: false, code: 'invalid_code' });
    expect(await verifyChallenge(fake({ factors: ok, verify: { code: 'mfa_challenge_expired' } }).api, '123456')).toEqual({ ok: false, code: 'expired' });
    expect(await verifyChallenge(fake({ factors: ok, verify: { status: 429 } }).api, '123456')).toEqual({ ok: false, code: 'rate_limited' });
  });
});

describe('where a user goes after the password step', () => {
  it('customers without a factor continue unchanged', async () => {
    expect(await loginDestination({ api: fake({ current: 'aal1', next: 'aal1' }).api, staffStatus: 'none', next: '/client/shop' })).toBe('/client/shop');
  });
  it('a verified factor means the challenge; an ACTIVE staff member with no factor goes to setup; a disabled staff member does not', async () => {
    expect(await loginDestination({ api: fake({ current: 'aal1', next: 'aal2' }).api, staffStatus: 'active', next: '/admin' })).toBe('/login/mfa?next=%2Fadmin');
    expect(await loginDestination({ api: fake({ current: 'aal1', next: 'aal1' }).api, staffStatus: 'active', next: '/admin' })).toBe('/login/mfa/setup?next=%2Fadmin');
    expect(await loginDestination({ api: fake({ current: 'aal1', next: 'aal1' }).api, staffStatus: 'disabled', next: '/admin' })).toBe('/admin');
    expect(await loginDestination({ api: fake({ current: 'aal2', next: 'aal2' }).api, staffStatus: 'active', next: '/admin' })).toBe('/admin');
  });
  it('an unknown assurance state never sends a user into a flow (fail to the requested page; the page still enforces access)', async () => {
    expect(await loginDestination({ api: fake({ aalError: { code: 'x' } }).api, staffStatus: 'active', next: '/admin' })).toBe('/admin');
  });
});

describe('staff factor approval (rpc_staff_claim_factor)', () => {
  const rpc = (data: unknown, error: unknown = null) => vi.fn(async () => ({ data, error }));
  it('calls the RPC with the window and factor ids only and maps the answers', async () => {
    const fn = rpc({ ok: true, code: 'approved' }); expect(await claimFactor(fn, 'w-1', 'f-1')).toEqual({ ok: true }); expect(fn).toHaveBeenCalledWith('rpc_staff_claim_factor', { p_window_id: 'w-1', p_factor_id: 'f-1' });
    expect(await claimFactor(rpc({ ok: false, code: 'step_up_required' }), 'w', 'f')).toEqual({ ok: false, code: 'step_up_required' });
    expect(await claimFactor(rpc({ ok: false, code: 'approval_rejected' }), 'w', 'f')).toEqual({ ok: false, code: 'approval_rejected' });
    expect(await claimFactor(rpc({ ok: false, code: 'already_approved' }), 'w', 'f')).toEqual({ ok: false, code: 'already_approved' });
    expect(await claimFactor(rpc({ ok: false, code: 'weird' }), 'w', 'f')).toEqual({ ok: false, code: 'failed' });
    expect(await claimFactor(rpc(null, { message: 'boom' }), 'w', 'f')).toEqual({ ok: false, code: 'failed' });
    expect(await claimFactor(rpc('not an object'), 'w', 'f')).toEqual({ ok: false, code: 'failed' });
  });
});

describe('route policy for the MFA pages', () => {
  const base = { portalEnabled: true, authConfigured: true };
  it('/login/mfa and /login/mfa/setup need a session (aal1 is enough) and nothing else', () => {
    for (const pathname of ['/login/mfa', '/login/mfa/setup']) {
      expect(isPortalMfaPath(pathname)).toBe(true);
      expect(decideRoute({ ...base, pathname, authenticated: true })).toEqual({ type: 'allow' });
      expect(decideRoute({ ...base, pathname, authenticated: false, search: '?next=%2Fadmin' })).toEqual({ type: 'login', next: `${pathname}?next=%2Fadmin` });
      expect(decideRoute({ ...base, pathname, portalEnabled: false, authenticated: true })).toEqual({ type: 'not-found' });
    }
  });
  it('other /login sub-paths stay unknown (not found) and the sign-in page is unchanged', () => {
    expect(decideRoute({ ...base, pathname: '/login/other', authenticated: true })).toEqual({ type: 'not-found' });
    expect(decideRoute({ ...base, pathname: '/login', authenticated: false })).toEqual({ type: 'allow' });
    expect(decideRoute({ ...base, pathname: '/login', authenticated: true })).toEqual({ type: 'redirect', to: '/client' });
    expect(isPortalMfaPath('/login/mfa/x')).toBe(false);
  });
});

describe('start over (an authenticator that was verified before the setup window opened)', () => {
  it('removes the only verified authenticator and leftover unverified ones', async () => {
    const a = fake({ factors: [{ id: 'f-1', type: 'totp', status: 'verified' }, { id: 'f-2', type: 'totp', status: 'unverified' }] });
    expect(await removeSoleVerifiedFactor(a.api)).toEqual({ ok: true });
    expect(a.calls).toEqual(['list', 'unenroll:f-1', 'unenroll:f-2']);
  });
  it('refuses when there is no verified authenticator or more than one (ask an administrator), and removes nothing', async () => {
    for (const factors of [[], [{ id: 'f-1', type: 'totp', status: 'unverified' }], [{ id: 'f-1', type: 'totp', status: 'verified' }, { id: 'f-2', type: 'totp', status: 'verified' }]]) {
      const a = fake({ factors });
      expect(await removeSoleVerifiedFactor(a.api)).toEqual({ ok: false, code: 'not_allowed' });
      expect(a.calls.some((c) => c.startsWith('unenroll'))).toBe(false);
    }
  });
  it('ignores non-totp factors and reports provider failures as fixed codes', async () => {
    const a = fake({ factors: [{ id: 'p-1', type: 'phone', status: 'verified' }, { id: 'f-1', type: 'totp', status: 'verified' }] });
    expect(await removeSoleVerifiedFactor(a.api)).toEqual({ ok: true });
    expect(a.calls).not.toContain('unenroll:p-1');
    expect(await removeSoleVerifiedFactor(fake({ factors: [{ id: 'f-1', type: 'totp', status: 'verified' }], unenroll: { code: 'x', message: 'secret provider text' } }).api)).toEqual({ ok: false, code: 'failed' });
    expect(await removeSoleVerifiedFactor(fake({ listError: { status: 429 } }).api)).toEqual({ ok: false, code: 'rate_limited' });
  });
});
