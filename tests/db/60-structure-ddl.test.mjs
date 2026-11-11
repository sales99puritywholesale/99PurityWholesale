// T4: destructive DDL on auth.mfa_factors, ONLY on the disposable LOCAL stack (P2_DB_MODE=local), ONLY inside transactions that
// are rolled back, ONLY through the elevated supabase_admin connection. connectAdmin() returns null on a hosted project, in
// which case every test here is skipped with a reason (never passed). Ported from the frozen ci/m1-validation branch.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectAdmin, connect, tx, attempt, one, mkUser, mkStaff, mkWindow, mkFactor, claim } from './lib/db.mjs';
import { note } from './lib/report.mjs';

let admin; let c;
before(async () => { admin = await connectAdmin(); c = await connect(); note('t4_admin_available', Boolean(admin)); });
after(async () => { await admin?.end(); await c?.end(); });

const check = async (conn) => {
  const s = (await one(conn, `select private.run_auth_structure_check() as s`)).s;
  const row = await one(conn, `select status, sqlstate, other_column_count, type_checks_passed, enum_labels_ok from private.platform_validations where check_name = 'auth_mfa_factors_shape'`);
  return { s, ...row };
};
const mutate = (name, ddl, expected) => it(name, async (t) => {
  if (!admin) return t.skip('hosted project: no supabase_admin, destructive DDL cannot be performed');
  let skipReason = null;
  await tx(admin, async () => {
    const d = await attempt(admin, ddl);
    if (!d.ok) { note(`${name}: DDL not permitted`, { code: d.code, message: d.message }); skipReason = `DDL refused (${d.code}); inconclusive, not a pass`; return; }
    const r = await check(admin);
    note(`${name}: check result`, r);
    assert.equal(r.s, expected, `${name}: expected a ${expected} check, got ${r.s} (sqlstate ${r.sqlstate})`);
  });
  // the structure must be intact again after the rollback
  await tx(c, async () => assert.equal((await check(c)).s, 'passed', 'structure check must pass again after rollback'));
  if (skipReason) t.skip(skipReason);
});

describe('T-AV-2..6, T-AV-11: structure check detects drift (rolled-back DDL, disposable local stack only)', () => {
  mutate('T-AV-2 rename an expected column', `alter table auth.mfa_factors rename column user_id to user_id_x`, 'failed');
  mutate('T-AV-3 rename an enum label (verified)', `alter type auth.factor_status rename value 'verified' to 'verified_x'`, 'failed');
  mutate('T-AV-4 retype created_at to text', `alter table auth.mfa_factors alter column created_at type text using created_at::text`, 'failed');
  mutate('T-AV-5 add an unrelated column: still passes, other_column_count grows (informational)', `alter table auth.mfa_factors add column p2_extra text`, 'passed');
  // T-AV-6: NOT TESTABLE on the Supabase stack (decision 2026-11-09). Revoking the direct grant leaves `postgres` able to read
  // auth.mfa_factors because it inherits SELECT through membership in pg_read_all_data (and has rolbypassrls). The structure
  // check asks whether the definer owner can actually read the table, so it correctly stays 'passed'. Role memberships and
  // grants are NOT changed to force the scenario. Registered as skipped; never reported as passed.
  it('T-AV-6 revoke SELECT on the table from the definer owner', { skip: 'NOT TESTABLE locally: postgres inherits SELECT via pg_read_all_data, so the revoke cannot make the owner unable to read (docs/P2-1-LOCAL-STACK.md section 8)' }, () => {});
  mutate('T-AV-11 drop the table', `drop table auth.mfa_factors cascade`, 'failed');
});

describe('T-V5B-3/4 fail-closed lifecycle with unknown factor data (rolled back)', () => {
  it('a user whose approved factor is no longer TOTP is denied (rolled back; inconclusive if the row cannot be altered)', async (t) => {
    if (!admin) return t.skip('hosted project: no supabase_admin');
    await tx(admin, async () => {
      const u = await mkUser(admin, 'v5b'); await mkStaff(admin, u, ['support']);
      const w = await mkWindow(admin, u); const f = await mkFactor(admin, u); await claim(admin, f, u, w);
      await admin.query(`select private.run_auth_structure_check()`);
      await admin.query(`set local role authenticated`);
      await admin.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify({ role: 'authenticated', sub: u, aal: 'aal2' }), u]);
      assert.equal((await one(admin, `select private.staff_session_ok() as x`)).x, true, 'baseline approved');
      await admin.query('reset role');
      const d = await attempt(admin, `update auth.mfa_factors set factor_type = 'webauthn' where id = $1`, [f]);
      if (!d.ok) return t.skip(`could not alter row (${d.code}); inconclusive`);
      await admin.query(`set local role authenticated`);
      assert.equal((await one(admin, `select private.staff_session_ok() as x`)).x, false, 'approval of a factor that is no longer TOTP must not keep the session open');
    });
  });
});
