// Enrolment windows and approved factors at table level (T-FB, T-FP, T-WT, T-SN, T-LC-7, T-AV-7 positives).
// All BEGIN ... ROLLBACK on one connection. Factors are fixtures; GoTrue-created factors are covered in 50-auth-http.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  connect, tx, attempt, asRole, resetRole, one,
  mkUser, mkStaff, mkWindow, mkFactor, claim, isolateStaff,
} from './lib/db.mjs';
import { note } from './lib/report.mjs';

let c;
before(async () => { c = await connect(); });
after(async () => { await c?.end(); });

const CHECK = '23514';
const CHECKS = ['23514', '23503']; // trigger (23514) fires first; the composite FK (23503) is the backstop
const n = async (sql, p = []) => Number((await one(c, `select count(*) n from (${sql}) q`, p)).n);
const doClaim = (f, u, w) => attempt(c, `insert into private.staff_mfa_factors (factor_id, user_id, window_id) values ($1, $2, $3)`, [f, u, w]);

async function target(roles = ['support']) {
  const u = await mkUser(c, 'target'); await mkStaff(c, u, roles); return u;
}

describe('T-FB / T-FP: approval gate', () => {
  it('T-FP-2/T-FP-9a: a verified TOTP created at the instant the window opens is accepted and consumes the window', () => tx(c, async () => {
    const u = await target(); const w = await mkWindow(c, u); const f = await mkFactor(c, u);
    const r = await doClaim(f, u, w);
    assert.equal(r.ok, true, `${r.code} ${r.message}`);
    assert.notEqual((await one(c, `select consumed_at from private.staff_mfa_enrolment_windows where id = $1`, [w])).consumed_at, null);
  }));

  it('T-FB: rejects unknown window, unknown factor, other user\'s factor, other user\'s window', () => tx(c, async () => {
    const u = await target(); const v = await target(); const w = await mkWindow(c, u); const fu = await mkFactor(c, u); const fv = await mkFactor(c, v);
    assert.equal((await doClaim(fu, u, '00000000-0000-4000-8000-000000000001')).code, CHECK, 'unknown window');
    assert.equal((await doClaim('00000000-0000-4000-8000-000000000002', u, w)).code, CHECK, 'unknown factor');
    assert.equal((await doClaim(fv, u, w)).code, CHECK, 'factor of another user');
    assert.ok(CHECKS.includes((await doClaim(fu, v, w)).code), 'window of another user');
  }));

  it('T-FB/T-FP: rejects unverified, phone and webauthn factors, and a factor created before the window (T-FP-1/4/5)', () => tx(c, async () => {
    const u = await target(); const w = await mkWindow(c, u);
    assert.equal((await doClaim(await mkFactor(c, u, { status: 'unverified' }), u, w)).code, CHECK, 'unverified');
    assert.equal((await doClaim(await mkFactor(c, u, { type: 'phone' }), u, w)).code, CHECK, 'phone');
    assert.equal((await doClaim(await mkFactor(c, u, { type: 'webauthn' }), u, w)).code, CHECK, 'webauthn');
    assert.equal((await doClaim(await mkFactor(c, u, { createdAt: new Date(Date.now() - 3600_000).toISOString() }), u, w)).code, CHECK, 'pre-existing factor');
  }));

  it('T-FB/T-FP-3/6: expired and not-yet-open windows reject; revoked and consumed windows reject; T-FP-8 second factor rejected', () => tx(c, async () => {
    const u = await target();
    const expired = await mkWindow(c, u, { authorizedAt: new Date(Date.now() - 7200_000).toISOString(), expiresAt: new Date(Date.now() - 5400_000).toISOString() });
    assert.equal((await doClaim(await mkFactor(c, u), u, expired)).code, CHECK, 'expired');
    await c.query(`update private.staff_mfa_enrolment_windows set revoked_at = now() where id = $1`, [expired]);
    const future = await mkWindow(c, u, { authorizedAt: new Date(Date.now() + 3600_000).toISOString(), expiresAt: new Date(Date.now() + 5400_000).toISOString() });
    assert.equal((await doClaim(await mkFactor(c, u), u, future)).code, CHECK, 'not yet open');
    await c.query(`update private.staff_mfa_enrolment_windows set revoked_at = now() where id = $1`, [future]);
    const w = await mkWindow(c, u);
    assert.equal((await doClaim(await mkFactor(c, u), u, w)).ok, true, 'first factor');
    assert.equal((await doClaim(await mkFactor(c, u), u, w)).code, CHECK, 'second factor / consumed window');
    const u2 = await target(); const r = await mkWindow(c, u2); await c.query(`update private.staff_mfa_enrolment_windows set revoked_at = now() where id = $1`, [r]);
    assert.equal((await doClaim(await mkFactor(c, u2), u2, r)).code, CHECK, 'revoked');
  }));

  it('T-FB: windows need an active staff target and an active admin authorizer, never the target itself; one open window per target', () => tx(c, async () => {
    const dis = await mkUser(c, 'dis'); await mkStaff(c, dis, ['support'], 'disabled');
    assert.equal((await attempt(c, `insert into private.staff_mfa_enrolment_windows (target_user_id, reason) values ($1, 'x')`, [dis])).code, CHECK, 'disabled target');
    const notStaff = await mkUser(c, 'ns');
    assert.equal((await attempt(c, `insert into private.staff_mfa_enrolment_windows (target_user_id, reason) values ($1, 'x')`, [notStaff])).code, CHECK, 'non-staff target');
    const t = await target(); const sup = await target(['support']);
    assert.equal((await attempt(c, `insert into private.staff_mfa_enrolment_windows (target_user_id, authorized_by, reason) values ($1, $2, 'x')`, [t, sup])).code, CHECK, 'authorizer not admin');
    const ad = await mkUser(c, 'adm'); await mkStaff(c, ad, ['admin']);
    assert.equal((await attempt(c, `insert into private.staff_mfa_enrolment_windows (target_user_id, authorized_by, reason) values ($1, $1, 'x')`, [ad])).code, CHECK, 'self-authorization');
    await mkWindow(c, t, { authorizedBy: ad });
    assert.equal((await attempt(c, `insert into private.staff_mfa_enrolment_windows (target_user_id, reason) values ($1, 'again')`, [t])).code, '23505', 'second open window');
  }));

  it('T-FB: approvals are immutable', () => tx(c, async () => {
    const u = await target(); const w = await mkWindow(c, u); const f = await mkFactor(c, u); await claim(c, f, u, w);
    assert.equal((await attempt(c, `update private.staff_mfa_factors set approved_at = now() where factor_id = $1`, [f])).code, CHECK);
  }));
});

describe('mfa_check_ok / staff_session_ok behavior with approvals', () => {
  const session = async (u, claims = { aal: 'aal2' }) => { await resetRole(c); await asRole(c, 'authenticated', u, claims); return (await one(c, `select private.staff_session_ok() as x`)).x; };

  it('approved TOTP passes; an extra verified unapproved factor of any type denies; unverified extras do not', () => tx(c, async () => {
    const u = await target(); const w = await mkWindow(c, u); const f = await mkFactor(c, u); await claim(c, f, u, w);
    await c.query(`select private.run_auth_structure_check()`);
    assert.equal(await session(u), true);
    assert.equal(await session(u, { aal: 'aal1' }), false);
    await resetRole(c); await mkFactor(c, u, { status: 'unverified' });
    assert.equal(await session(u), true, 'unverified extra factor must not deny');
    await resetRole(c); await mkFactor(c, u, { type: 'webauthn' });
    assert.equal(await session(u), false, 'verified unapproved webauthn must deny');
  }));

  it('T-LC-7: an orphan approval (factor removed from auth) grants nothing', () => tx(c, async () => {
    const u = await target(); const w = await mkWindow(c, u); const f = await mkFactor(c, u); await claim(c, f, u, w);
    await c.query(`select private.run_auth_structure_check()`);
    assert.equal(await session(u), true);
    await resetRole(c); await c.query(`delete from auth.mfa_factors where id = $1`, [f]);
    assert.equal(await session(u), false);
  }));

  it('a user with a verified TOTP but no approval is denied (staff without claim)', () => tx(c, async () => {
    const u = await target(); await mkFactor(c, u);
    await c.query(`select private.run_auth_structure_check()`);
    assert.equal(await session(u), false);
  }));
});

describe('T-WT / T-SN: window transitions', () => {
  it('T-WT-1: every immutable column rejects direct UPDATE', () => tx(c, async () => {
    const u = await target(); const other = await target(); const ad = await mkUser(c, 'adm'); await mkStaff(c, ad, ['admin']);
    const w = await mkWindow(c, u, { authorizedBy: ad });
    for (const [col, val] of [
      ['id', 'gen_random_uuid()'], ['target_user_id', `'${other}'::uuid`], ['authorized_at', `now() - interval '1 minute'`],
      ['expires_at', `now() + interval '40 minutes'`], ['reason', `'changed'`], ['authorized_by', `'${other}'::uuid`],
    ]) {
      const r = await attempt(c, `update private.staff_mfa_enrolment_windows set ${col} = ${val} where id = $1`, [w]);
      assert.equal(r.code, CHECK, `${col}: ${r.code} ${r.message}`);
    }
  }));

  it('T-WT-2..6: consumed/revoked windows cannot be un-done, re-done or crossed', () => tx(c, async () => {
    const u = await target(); const f = await mkFactor(c, u); const w = await mkWindow(c, u); await claim(c, f, u, w);
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set consumed_at = null where id = $1`, [w])).code, CHECK, 'un-consume');
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set revoked_at = now() where id = $1`, [w])).code, CHECK, 'revoke a consumed window');
    const u2 = await target(); const w2 = await mkWindow(c, u2);
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set revoked_at = now(), revoke_reason = 'r' where id = $1`, [w2])).ok, true, 'first revoke');
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set revoked_at = now() + interval '1 second' where id = $1`, [w2])).code, CHECK, 'revoke twice (change revoked_at)');
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set revoke_reason = 'other' where id = $1`, [w2])).code, CHECK, 'change reason after revoke');
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set consumed_at = now() where id = $1`, [w2])).code, CHECK, 'consume a revoked window (CHECK)');
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set revoked_at = null where id = $1`, [w2])).code, CHECK, 'un-revoke');
  }));

  it('T-WT-9: no window is consumed without an approval', () => tx(c, async () => {
    const u = await target(); const f = await mkFactor(c, u); const w = await mkWindow(c, u); await claim(c, f, u, w);
    assert.equal(await n(`select 1 from private.staff_mfa_enrolment_windows w where consumed_at is not null and not exists (select 1 from private.staff_mfa_factors a where a.window_id = w.id)`), 0);
  }));

  it('T-SN-3..8: attribution columns may only become NULL; the NULL exception is bounded (D-18 gaps recorded)', () => tx(c, async () => {
    const u = await target(); const other = await mkUser(c, 'o'); const ad = await mkUser(c, 'adm'); await mkStaff(c, ad, ['admin']);
    const w = await mkWindow(c, u, { authorizedBy: ad });
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set authorized_by = $2 where id = $1`, [w, other])).code, CHECK, 'to another user');
    for (const set of [`id = gen_random_uuid()`, `target_user_id = '${other}'::uuid`, `authorized_at = now() - interval '1 minute'`, `expires_at = now() + interval '40 minutes'`, `reason = 'changed'`]) {
      assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set authorized_by = null, ${set} where id = $1`, [w])).code, CHECK, `NULL together with ${set}`);
    }
    // T-SN-8: legal transition plus NULL-ing in one UPDATE succeeds (recorded as accepted)
    const t8 = await attempt(c, `update private.staff_mfa_enrolment_windows set revoked_at = now(), revoke_reason = 'r', authorized_by = null where id = $1`, [w]);
    assert.equal(t8.ok, true, `${t8.code} ${t8.message}`);
    // T-SN-5/6 on the revoked window
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set revoked_by = null, revoked_at = now() + interval '1 second' where id = $1`, [w])).code, CHECK, 'revoked_by NULL with revoked_at change');
    assert.equal((await attempt(c, `update private.staff_mfa_enrolment_windows set revoked_by = $2 where id = $1`, [w, other])).code, CHECK, 'revoked_by to another user');
    // T-SN-7 known limitation: direct owner-level NULL-ing of authorized_by succeeds today
    const u2 = await target(); const w2 = await mkWindow(c, u2, { authorizedBy: ad });
    const t7 = await attempt(c, `update private.staff_mfa_enrolment_windows set authorized_by = null where id = $1`, [w2]);
    note('T-SN-7 direct NULL-ing of authorized_by (known gap D-18c)', { accepted: t7.ok });
    assert.equal(t7.ok, true, 'T-SN-7 documents CURRENT behavior; a change here means D-18 hardening landed');
  }));

  it('T-SN-9: the five frozen columns are NOT NULL', async () => {
    const r = await c.query(`select attname, attnotnull from pg_attribute where attrelid = 'private.staff_mfa_enrolment_windows'::regclass and attname in ('id','target_user_id','authorized_at','expires_at','reason')`);
    assert.equal(r.rows.length, 5);
    assert.ok(r.rows.every((x) => x.attnotnull), 'a frozen column is nullable: the <> comparison in the update guard would be unsafe');
  });

  it('T-LC-5: deleting a window cascades its approval (isolated; sole-admin state not required)', () => tx(c, async () => {
    const u = await target(); const f = await mkFactor(c, u); const w = await mkWindow(c, u); await claim(c, f, u, w);
    await c.query(`delete from private.staff_mfa_enrolment_windows where id = $1`, [w]);
    assert.equal(await n(`select 1 from private.staff_mfa_factors where window_id = $1`, [w]), 0);
    void isolateStaff;
  }));
});
