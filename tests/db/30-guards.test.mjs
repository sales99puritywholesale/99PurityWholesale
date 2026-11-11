// Guard triggers, cascades and isolation refusals on a single connection. Rolled back unless stated otherwise.
// Staff tests call isolateStaff() inside their transaction so that global admin counts are deterministic.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  connect, connectAdmin, tx, attempt, asRole, resetRole, one,
  mkUser, mkOrg, mkMember, mkStaff, mkWindow, mkFactor, claim, mkApprovedStaff, isolateStaff,
} from './lib/db.mjs';
import { note } from './lib/report.mjs';

let c; let admin;
before(async () => { c = await connect(); admin = await connectAdmin(); note('supabase_admin_available', Boolean(admin)); });
after(async () => { await c?.end(); await admin?.end(); });

const n = async (sql, p = []) => Number((await one(c, `select count(*) n from (${sql}) q`, p)).n);
const CHECK = '23514';

async function orgWith(owners = 1, members = 0) {
  const org = await mkOrg(c); const o = []; const m = [];
  for (let i = 0; i < owners; i++) { const u = await mkUser(c, 'owner'); await mkMember(c, org, u, 'owner'); o.push(u); }
  for (let i = 0; i < members; i++) { const u = await mkUser(c, 'member'); await mkMember(c, org, u, 'member'); m.push(u); }
  return { org, o, m };
}
async function admins(k = 2) {
  const ids = [];
  for (let i = 0; i < k; i++) { const u = await mkUser(c, 'admin'); await mkStaff(c, u, ['admin']); ids.push(u); }
  await isolateStaff(c, ids);
  return ids;
}

describe('last owner (0001) - non-concurrent parts of T-LA-11', () => {
  it('the only active owner cannot be demoted, removed, deleted, or cascade-deleted with the auth user', () => tx(c, async () => {
    const { org, o } = await orgWith(1, 1);
    for (const sql of [
      `update public.organization_members set role = 'member' where organization_id = $1 and user_id = $2`,
      `update public.organization_members set status = 'removed', removed_at = now() where organization_id = $1 and user_id = $2`,
      `delete from public.organization_members where organization_id = $1 and user_id = $2`,
    ]) { const r = await attempt(c, sql, [org, o[0]]); assert.equal(r.code, CHECK, sql); }
    const r = await attempt(c, `delete from auth.users where id = $1`, [o[0]]);
    assert.equal(r.code, CHECK, 'cascade deletion of the last owner must fail');
    assert.equal(await n(`select 1 from public.organization_members where organization_id = $1 and role = 'owner' and status = 'active'`, [org]), 1);
  }));

  it('one statement demoting all owners fails and changes nothing; demoting one of two succeeds', () => tx(c, async () => {
    const { org } = await orgWith(2);
    const bad = await attempt(c, `update public.organization_members set role = 'member' where organization_id = $1`, [org]);
    assert.equal(bad.code, CHECK);
    assert.equal(await n(`select 1 from public.organization_members where organization_id = $1 and role = 'owner'`, [org]), 2);
    const ok = await attempt(c, `update public.organization_members set role = 'member' where id = (select id from public.organization_members where organization_id = $1 limit 1)`, [org]);
    assert.equal(ok.ok, true);
  }));

  it('closing the organization first allows removing its last owner; org identity is immutable', () => tx(c, async () => {
    const { org, o } = await orgWith(1);
    assert.equal((await attempt(c, `update public.organizations set code = 'NEWCODE99' where id = $1`, [org])).code, CHECK);
    await c.query(`update public.organizations set status = 'closed' where id = $1`, [org]);
    const r = await attempt(c, `update public.organization_members set status = 'removed', removed_at = now() where organization_id = $1 and user_id = $2`, [org, o[0]]);
    assert.equal(r.ok, true);
  }));
});

describe('last admin (0002) - non-concurrent parts of T-LA-6/8/12', () => {
  it('T-LA-6: single statements removing, disabling or deleting every admin fail and change nothing', () => tx(c, async () => {
    const [a, b] = await admins(2);
    for (const sql of [
      `delete from public.staff_roles where role = 'admin'`,
      `update public.staff_members set status = 'disabled'`,
      `update public.staff_roles set role = 'finance' where role = 'admin'`,
      `delete from public.staff_members`,
    ]) { const r = await attempt(c, sql); assert.equal(r.code, CHECK, sql); }
    assert.equal(await n(`select 1 from public.staff_roles where role = 'admin' and user_id = any($1)`, [[a, b]]), 2);
    assert.equal(await n(`select 1 from public.staff_members where status = 'active' and user_id = any($1)`, [[a, b]]), 2);
  }));

  it('T-LA-8: removing a disabled admin\'s role while another active admin exists succeeds', () => tx(c, async () => {
    const [a] = await admins(1);
    const d = await mkUser(c, 'disabled'); await mkStaff(c, d, ['admin'], 'disabled');
    const r = await attempt(c, `delete from public.staff_roles where user_id = $1 and role = 'admin'`, [d]);
    assert.equal(r.ok, true);
    assert.equal(await n(`select 1 from public.staff_roles where user_id = $1`, [a]), 1);
  }));

  it('T-LA-12: the txn-local marker does not break unrelated statements, and does not let a later shrink pass', () => tx(c, async () => {
    const [a, b] = await admins(2);
    assert.equal((await attempt(c, `delete from public.staff_roles where user_id = $1 and role = 'admin'`, [b])).ok, true, 'legal shrink');
    const s = await mkUser(c, 'support'); await mkStaff(c, s, ['support']);
    assert.equal((await attempt(c, `delete from public.staff_roles where user_id = $1`, [s])).ok, true, 'unrelated delete after marker');
    assert.equal((await attempt(c, `delete from public.staff_roles where user_id = $1 and role = 'admin'`, [a])).code, CHECK, 'later shrink to zero still fails');
    note('marker_visible_in_same_txn', (await one(c, `select current_setting('m1.admin_shrink', true) as v`)).v);
  }));

  it('T-LA-9: TRUNCATE is refused by the guard trigger on the three protected tables', () => tx(c, async () => {
    for (const sql of ['truncate public.organization_members', 'truncate public.staff_roles', 'truncate public.staff_members cascade']) {
      const r = await attempt(c, sql);
      note(`truncate-result: ${sql}`, { code: r.code, message: r.message });
      assert.equal(r.code, '42501', `${sql} -> ${r.code} ${r.message}`);
    }
  }));
});

describe('isolation refusals (T-LA-10, T-EX-7, D-13 engine part) - committed fixtures', () => {
  let fx;
  before(async () => {
    const { org, o } = await orgWith(2);
    const A = await mkUser(c, 'iso-admin'); const B = await mkUser(c, 'iso-admin'); // committed (autocommit)
    await mkStaff(c, A, ['admin']); await mkStaff(c, B, ['admin']);
    fx = { org, o, A, B };
  });
  for (const level of ['repeatable read', 'serializable']) {
    it(`T-LA-10/T-EX-7: guards fail closed with 25000 at ${level}`, async () => {
      const ops = [
        [`update public.organization_members set role = 'member' where organization_id = $1 and user_id = $2`, () => [fx.org, fx.o[0]]],
        [`delete from public.organization_members where organization_id = $1 and user_id = $2`, () => [fx.org, fx.o[1]]],
        [`delete from public.staff_roles where user_id = $1 and role = 'admin'`, () => [fx.B]],
        [`update public.staff_members set status = 'disabled' where user_id = $1`, () => [fx.B]],
      ];
      for (const [sql, p] of ops) {
        await tx(c, async () => { const r = await attempt(c, sql, p()); assert.equal(r.code, '25000', `${sql} @ ${level} -> ${r.code}`); }, level);
      }
      await tx(c, async () => {
        const u = await mkUser(c, 'iso'); const r = await attempt(c, `insert into public.staff_members (user_id) values ($1)`, [u]);
        assert.equal(r.code, '25000', 'staff insert');
      }, level);
      await tx(c, async () => {
        const org = await mkOrg(c); const u = await mkUser(c, 'iso');
        const r = await attempt(c, `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'member')`, [org, u]);
        assert.equal(r.code, '25000', 'member insert');
      }, level);
    });
  }
});

describe('staff/member exclusion - non-concurrent parts (T-EX-3..6)', () => {
  it('T-EX-6: an active membership insert for an existing staff user (active or disabled) is rejected; the reverse too', () => tx(c, async () => {
    const org = await mkOrg(c);
    for (const st of ['active', 'disabled']) {
      const u = await mkUser(c, 'staff'); await mkStaff(c, u, ['support'], st);
      assert.equal((await attempt(c, `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'member')`, [org, u])).code, CHECK, st);
    }
    const m = await mkUser(c, 'member'); await mkMember(c, org, m, 'member');
    assert.equal((await attempt(c, `insert into public.staff_members (user_id) values ($1)`, [m])).code, CHECK, 'staff insert for active member');
  }));

  it('T-EX-3 (sequential): a removed membership does not block staff; reactivating it afterwards is rejected', () => tx(c, async () => {
    const org = await mkOrg(c); const owner = await mkUser(c, 'owner'); await mkMember(c, org, owner, 'owner');
    const u = await mkUser(c, 'x'); await mkMember(c, org, u, 'member', 'removed');
    assert.equal((await attempt(c, `insert into public.staff_members (user_id) values ($1)`, [u])).ok, true);
    const r = await attempt(c, `update public.organization_members set status = 'active', removed_at = null where organization_id = $1 and user_id = $2`, [org, u]);
    assert.equal(r.code, CHECK);
  }));

  it('T-EX-4: staff_members.user_id cannot be changed', () => tx(c, async () => {
    const u = await mkUser(c, 's'); const v = await mkUser(c, 's'); await mkStaff(c, u, ['support']);
    assert.equal((await attempt(c, `update public.staff_members set user_id = $2 where user_id = $1`, [u, v])).code, CHECK);
  }));

  it('T-EX-5: updating a staff row for a user that also has an active membership is rejected (needs supabase_admin to build the state)', async (t) => {
    if (!admin) return t.skip('hosted project: no supabase_admin/superuser, so the state cannot be built without bypassing the guards');
    await tx(admin, async () => {
      const org = await mkOrg(admin); const o = await mkUser(admin, 'o'); await mkMember(admin, org, o, 'owner');
      const u = await mkUser(admin, 'both'); await admin.query(`set local session_replication_role = replica`);
      await admin.query(`insert into public.staff_members (user_id) values ($1)`, [u]);
      await admin.query(`insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'member')`, [org, u]);
      await admin.query(`set local session_replication_role = origin`);
      assert.equal((await attempt(admin, `update public.staff_members set status = 'disabled' where user_id = $1`, [u])).code, CHECK);
    });
  });
});

describe('cascade scenarios A (T-CS-A1..A5, T-LC-1/5/6)', () => {
  it('A1/A2: a non-admin staff member with approval and windows is removed cleanly by direct DELETE and by deleting the auth user', async () => {
    for (const via of ['direct', 'auth']) {
      await tx(c, async () => {
        const s = await mkApprovedStaff(c, ['support']);
        const r = via === 'direct'
          ? await attempt(c, `delete from public.staff_members where user_id = $1`, [s.user])
          : await attempt(c, `delete from auth.users where id = $1`, [s.user]);
        assert.equal(r.ok, true, `${via}: ${r.code} ${r.message}`);
        for (const sql of [`select 1 from public.staff_roles where user_id = $1`, `select 1 from private.staff_mfa_enrolment_windows where target_user_id = $1`, `select 1 from private.staff_mfa_factors where user_id = $1`])
          assert.equal(await n(sql, [s.user]), 0, `${via}: leftover rows`);
      });
    }
  });

  it('A3/B4/T-LC-6: the last active admin cannot be removed by direct DELETE or by deleting the auth user; nothing changes', () => tx(c, async () => {
    const [a] = await admins(1);
    assert.equal((await attempt(c, `delete from public.staff_members where user_id = $1`, [a])).code, CHECK);
    assert.equal((await attempt(c, `delete from auth.users where id = $1`, [a])).code, CHECK);
    assert.equal(await n(`select 1 from public.staff_members where user_id = $1`, [a]), 1);
    assert.equal(await n(`select 1 from public.staff_roles where user_id = $1`, [a]), 1);
    assert.equal(await n(`select 1 from auth.users where id = $1`, [a]), 1);
  }));

  it('A4: an admin can be deleted (auth user) while another active admin exists', () => tx(c, async () => {
    const [a, b] = await admins(2);
    const r = await attempt(c, `delete from auth.users where id = $1`, [b]);
    assert.equal(r.ok, true, `${r.code} ${r.message}`);
    assert.equal(await n(`select 1 from public.staff_members where user_id = $1 and status = 'active'`, [a]), 1);
  }));

  it('A5/T-LC-4: deleting a window at owner level cascades its approval and the staff user is then denied', () => tx(c, async () => {
    const s = await mkApprovedStaff(c, ['support']);
    await c.query(`select private.run_auth_structure_check()`);
    const ok = async () => { await resetRole(c); await asRole(c, 'authenticated', s.user, { aal: 'aal2' }); return (await one(c, `select private.staff_session_ok() as x`)).x; };
    assert.equal(await ok(), true, 'approved staff must pass before deletion');
    await resetRole(c);
    await c.query(`delete from private.staff_mfa_enrolment_windows where id = $1`, [s.win]);
    assert.equal(await n(`select 1 from private.staff_mfa_factors where user_id = $1`, [s.user]), 0, 'approval must cascade');
    assert.equal(await ok(), false, 'user must be denied after the approval is gone');
  }));
});

describe('cascade scenarios B: attribution SET NULL (T-CS-B1..B3, T-SN-1/2, T-LC-2) ', () => {
  it('B1/B2/T-SN-1: deleting the authorizer NULLs authorized_by, created_by, granted_by; every other column is unchanged', () => tx(c, async () => {
    const [a, b] = await admins(2);
    const t = await mkUser(c, 'target'); await mkStaff(c, t, ['support']);
    await c.query(`update public.staff_members set created_by = $2 where user_id = $1`, [t, a]);
    await c.query(`update public.staff_roles set granted_by = $2 where user_id = $1`, [t, a]);
    const w1 = await mkWindow(c, t, { authorizedBy: a });
    const snap = async () => (await one(c, `select to_jsonb(w) - 'authorized_by' as j from private.staff_mfa_enrolment_windows w where id = $1`, [w1])).j;
    const before = await snap();
    const r = await attempt(c, `delete from auth.users where id = $1`, [a]);
    assert.equal(r.ok, true, `${r.code} ${r.message}`);
    assert.equal((await one(c, `select authorized_by from private.staff_mfa_enrolment_windows where id = $1`, [w1])).authorized_by, null);
    assert.deepEqual(await snap(), before, 'other window columns must be byte-identical');
    assert.equal((await one(c, `select created_by from public.staff_members where user_id = $1`, [t])).created_by, null);
    assert.equal((await one(c, `select granted_by from public.staff_roles where user_id = $1`, [t])).granted_by, null);
    void b;
  }));

  it('T-SN-2: deleting the revoker NULLs revoked_by only; revoked_at and revoke_reason stay', () => tx(c, async () => {
    const [a, b] = await admins(2);
    const t = await mkUser(c, 'target'); await mkStaff(c, t, ['support']);
    const w = await mkWindow(c, t, { authorizedBy: a });
    await c.query(`update private.staff_mfa_enrolment_windows set revoked_at = now(), revoked_by = $2, revoke_reason = 'ci' where id = $1`, [w, b]);
    const snap = async () => (await one(c, `select to_jsonb(x) - 'revoked_by' as j from private.staff_mfa_enrolment_windows x where id = $1`, [w])).j;
    const before = await snap();
    const r = await attempt(c, `delete from auth.users where id = $1`, [b]);
    assert.equal(r.ok, true, `${r.code} ${r.message}`);
    assert.equal((await one(c, `select revoked_by from private.staff_mfa_enrolment_windows where id = $1`, [w])).revoked_by, null);
    assert.deepEqual(await snap(), before);
  }));

  describe('B3 at REPEATABLE READ (committed fixtures)', () => {
    let fx;
    before(async () => {
      const A = await mkUser(c, 'b3a'); await mkStaff(c, A, ['admin']);
      const B = await mkUser(c, 'b3b'); await mkStaff(c, B, ['admin']);
      const T = await mkUser(c, 'b3t'); await mkStaff(c, T, ['support']);
      await mkWindow(c, T, { authorizedBy: A });
      fx = { A, B, T };
    });
    it('deleting the authorizer through the cascade fails closed (25000) at REPEATABLE READ', () =>
      tx(c, async () => {
        const r = await attempt(c, `delete from auth.users where id = $1`, [fx.A]);
        assert.equal(r.code, '25000', `${r.code} ${r.message}`);
      }, 'repeatable read'));
  });
});
