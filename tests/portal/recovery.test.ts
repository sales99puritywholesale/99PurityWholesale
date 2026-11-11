import { describe, expect, it } from 'vitest';
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  recoveryHashesEqual,
} from '@/lib/portal/recovery/codes';
import {
  RECOVERY_LOCK_MINUTES,
  RECOVERY_MAX_FAILURES,
  RECOVERY_PENDING_MINUTES,
  allowedActions,
  initialContext,
  transition,
  type RecoveryContext,
  type RecoveryEvent,
  type RecoveryStateKind,
} from '@/lib/portal/recovery/state';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const USER = '22222222-2222-4222-8222-222222222222';

describe('recovery codes', () => {
  it('generates 10 distinct codes of 80 bits in XXXX-XXXX-XXXX-XXXX form', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  });
  it('maps 10 random bytes onto 16 base32 characters without bias', () => {
    expect(generateRecoveryCode(() => Buffer.alloc(10, 0))).toBe('0000-0000-0000-0000');
    expect(generateRecoveryCode(() => Buffer.alloc(10, 0xff))).toBe('ZZZZ-ZZZZ-ZZZZ-ZZZZ');
    // Independent packing of the 5-bit groups 1..16 into 10 bytes (big endian): the alphabet maps 1-9 to digits and 10-16 to A-G.
    const pack = (groups: number[]) => {
      let bits = 0n;
      for (const g of groups) bits = (bits << 5n) | BigInt(g);
      return Buffer.from(bits.toString(16).padStart(20, '0'), 'hex');
    };
    expect(generateRecoveryCode(() => pack(Array.from({ length: 16 }, (_, i) => i + 1)))).toBe('1234-5678-9ABC-DEFG');
    // groups 17..31 and 0 hit the rest of the alphabet (H J K M N P Q R S T V W X Y Z)
    expect(generateRecoveryCode(() => pack([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 0]))).toBe('HJKM-NPQR-STVW-XYZ0');
  });
  it('refuses a broken random source', () => {
    expect(() => generateRecoveryCode(() => Buffer.alloc(9))).toThrow();
    expect(() => generateRecoveryCodes(3, () => Buffer.alloc(10, 7))).toThrow(); // constant output cannot produce distinct codes
    for (const n of [0, -1, 21, 1.5, NaN]) expect(() => generateRecoveryCodes(n)).toThrow();
  });
  it('normalizes user input and rejects everything else', () => {
    expect(normalizeRecoveryCode('abcd-efgh-jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS');
    expect(normalizeRecoveryCode(' ABCD EFGH JKMN PQRS ')).toBe('ABCDEFGHJKMNPQRS');
    expect(normalizeRecoveryCode('o0il-1111-2222-3333')).toBe('0011-1111-2222-3333'.replace(/-/g, ''));
    for (const bad of ['', 'short', 'ABCD-EFGH-JKMN-PQRSX', 'ABCD-EFGH-JKMN-PQR!', 'UUUU-UUUU-UUUU-UUUU', null, undefined, 123, 'A'.repeat(100)]) {
      expect(normalizeRecoveryCode(bad), String(bad)).toBeNull();
    }
  });
  it('hashes are 64 hex characters, deterministic, and bound to the user', () => {
    const code = 'ABCDEFGHJKMNPQRS';
    const h = hashRecoveryCode(USER, code);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode(USER, code)).toBe(h);
    expect(hashRecoveryCode(USER.toUpperCase(), code)).toBe(h);
    expect(hashRecoveryCode('33333333-3333-4333-8333-333333333333', code)).not.toBe(h);
    expect(hashRecoveryCode(USER, 'ABCDEFGHJKMNPQRT')).not.toBe(h);
    expect(h).not.toContain(code.toLowerCase());
    expect(() => hashRecoveryCode('not-a-uuid', code)).toThrow();
    expect(() => hashRecoveryCode(USER, 'lowercase-or-invalid')).toThrow();
  });
  it('compares stored hashes in constant time and rejects malformed input', () => {
    const a = hashRecoveryCode(USER, 'ABCDEFGHJKMNPQRS');
    expect(recoveryHashesEqual(a, a)).toBe(true);
    expect(recoveryHashesEqual(a, hashRecoveryCode(USER, 'ABCDEFGHJKMNPQRT'))).toBe(false);
    for (const bad of ['', 'zz', a.slice(1), a + '0', a.toUpperCase().replace(/[A-F]/g, 'G')]) expect(recoveryHashesEqual(a, bad), bad).toBe(false);
  });
});

function run(start: RecoveryContext, steps: [RecoveryEvent, Date][]): RecoveryContext {
  let ctx = start;
  for (const [event, when] of steps) {
    const r = transition(ctx, event, when);
    if (!r.ok) throw new Error(`step ${event} failed: ${r.reason}`);
    ctx = r.ctx;
  }
  return ctx;
}

describe('recovery state machine (organization users)', () => {
  it('the happy path goes through a verified replacement factor and ends with new codes to issue', () => {
    const end = run(initialContext(true), [['device_lost', at(0)], ['code_accepted', at(1)], ['replacement_verified', at(5)], ['old_factor_removed', at(6)]]);
    expect(end).toMatchObject({ state: 'mfa_active', failedAttempts: 0, pendingSince: null, issueNewCodes: true });
  });
  it('a user without MFA enrols into mfa_active', () => {
    expect(run(initialContext(false), [['enrol_verified', at(0)]]).state).toBe('mfa_active');
  });
  it('sensitive actions are allowed ONLY in mfa_active (no recovery state permits a step-up action)', () => {
    const states: RecoveryStateKind[] = ['no_mfa', 'mfa_active', 'recovery_requested', 'recovery_pending', 'factor_replaced', 'locked'];
    for (const s of states) expect(allowedActions(s).includes('sensitive_actions'), s).toBe(s === 'mfa_active');
    expect(allowedActions('recovery_pending')).toEqual(['enrol_replacement_factor']);
    expect(allowedActions('locked')).toEqual([]);
  });
  it('there is no shortcut from a lost device to an active factor', () => {
    const lost = run(initialContext(true), [['device_lost', at(0)]]);
    for (const ev of ['enrol_verified', 'replacement_verified', 'old_factor_removed', 'device_lost'] as const) expect(transition(lost, ev, at(1)).ok, ev).toBe(false);
    const pending = run(lost, [['code_accepted', at(1)]]);
    for (const ev of ['enrol_verified', 'old_factor_removed', 'code_accepted', 'device_lost', 'code_rejected'] as const) expect(transition(pending, ev, at(2)).ok, ev).toBe(false);
    const replaced = run(pending, [['replacement_verified', at(2)]]);
    for (const ev of ['code_accepted', 'enrol_verified', 'device_lost', 'replacement_verified'] as const) expect(transition(replaced, ev, at(3)).ok, ev).toBe(false);
  });
  it('an active user cannot enter recovery states with a code alone', () => {
    const active = initialContext(true);
    for (const ev of ['code_accepted', 'code_rejected', 'replacement_verified', 'old_factor_removed', 'enrol_verified'] as const) expect(transition(active, ev, at(0)).ok, ev).toBe(false);
  });
  it('the restricted recovery session expires after 30 minutes and the used code stays consumed', () => {
    const pending = run(initialContext(true), [['device_lost', at(0)], ['code_accepted', at(0)]]);
    expect(transition(pending, 'replacement_verified', at(RECOVERY_PENDING_MINUTES)).ok).toBe(true); // boundary: still allowed
    const late = transition(pending, 'replacement_verified', at(RECOVERY_PENDING_MINUTES + 1));
    expect(late.ok).toBe(false); // expired back to recovery_requested, so the event is invalid there
    const ticked = transition(pending, 'tick', at(RECOVERY_PENDING_MINUTES + 1));
    expect(ticked.ok && ticked.ctx.state).toBe('recovery_requested');
    expect(ticked.ok && ticked.ctx.pendingSince).toBeNull();
  });
  it(`locks for ${RECOVERY_LOCK_MINUTES} minutes after ${RECOVERY_MAX_FAILURES} wrong codes, then returns to recovery_requested`, () => {
    let ctx = run(initialContext(true), [['device_lost', at(0)]]);
    for (let i = 1; i < RECOVERY_MAX_FAILURES; i++) {
      const r = transition(ctx, 'code_rejected', at(i));
      expect(r.ok && r.ctx.state).toBe('recovery_requested');
      if (r.ok) ctx = r.ctx;
    }
    const locked = transition(ctx, 'code_rejected', at(10));
    expect(locked.ok && locked.ctx.state).toBe('locked');
    if (!locked.ok) throw new Error('expected lock');
    expect(transition(locked.ctx, 'code_accepted', at(11))).toEqual({ ok: false, reason: 'locked' }); // even a right code is refused while locked
    expect(transition(locked.ctx, 'code_accepted', at(10 + RECOVERY_LOCK_MINUTES - 1))).toEqual({ ok: false, reason: 'locked' });
    const after = transition(locked.ctx, 'code_accepted', at(10 + RECOVERY_LOCK_MINUTES));
    expect(after.ok && after.ctx.state).toBe('recovery_pending');
  });
  it('a successful code resets the failure counter', () => {
    let ctx = run(initialContext(true), [['device_lost', at(0)], ['code_rejected', at(1)], ['code_rejected', at(2)]]);
    expect(ctx.failedAttempts).toBe(2);
    ctx = run(ctx, [['code_accepted', at(3)]]);
    expect(ctx.failedAttempts).toBe(0);
  });
  it('completion requires the replacement to be verified before the old factor is removed, and issues new codes', () => {
    const pending = run(initialContext(true), [['device_lost', at(0)], ['code_accepted', at(1)]]);
    expect(transition(pending, 'old_factor_removed', at(2)).ok).toBe(false);
    const done = run(pending, [['replacement_verified', at(3)], ['old_factor_removed', at(4)]]);
    expect(done.issueNewCodes).toBe(true);
    // the flag is cleared when the next recovery starts
    expect(run(done, [['device_lost', at(10)]]).issueNewCodes).toBe(false);
  });
  it('is immutable: transition never mutates its input', () => {
    const start = initialContext(true);
    const frozen = Object.freeze({ ...start });
    transition(frozen, 'device_lost', at(0));
    expect(frozen).toEqual(start);
  });
});
