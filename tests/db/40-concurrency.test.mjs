// Real two-connection races (scratch project only). Each iteration builds committed fixtures,
// runs one statement to completion in connection 1 (holding its locks), starts the conflicting statement in
// connection 2, proves connection 2 is waiting on a lock, then commits connection 1.
// Failure conditions: deadlock (40P01), any SQLSTATE other than the expected guard error, wrong number of commits,
// or a broken invariant. The stack is disposable; committed leftovers are harmless because staff tests re-isolate.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  connect, one, twoTx, mkUser, mkOrg, mkMember, mkStaff, mkWindow, mkFactor, isolateStaff,
} from './lib/db.mjs';
import { iterations } from './lib/db.mjs';
import { note } from './lib/report.mjs';

let c1; let c2; let obs; let N;
before(async () => { c1 = await connect(); c2 = await connect(); obs = await connect(); N = iterations(); note('concurrency_iterations', N); });
after(async () => { await c1?.end(); await c2?.end(); await obs?.end(); });

const CHECK = '23514';
const stats = {};
const bump = (k, v) => { stats[k] = (stats[k] ?? 0) + (v ? 1 : 0); };

function verdict(name, res, { expectBlock = true, oneWinner = true } = {}) {
  const codes = [res.first, res.second].filter((r) => !r.ok).map((r) => r.code);
  assert.ok(!codes.includes('40P01'), `${name}: DEADLOCK`);
  for (const code of codes) assert.equal(code, CHECK, `${name}: unexpected SQLSTATE ${code}`);
  if (oneWinner) assert.equal(res.committed, 1, `${name}: expected exactly one commit, got ${res.committed}`);
  if (expectBlock) assert.equal(res.blocked, true, `${name}: second statement never waited on a lock (serialization not proven)`);
  bump(`${name}:blocked`, res.blocked);
}

async function adminPair() {
  const a = await mkUser(c1, 'ra'); const b = await mkUser(c1, 'rb');
  await mkStaff(c1, a, ['admin']); await mkStaff(c1, b, ['admin']);
  await isolateStaff(c1, [a, b]);
  return [a, b];
}
const remaining = async () => Number((await one(c1, `select count(distinct r.user_id) n from public.staff_roles r join public.staff_members s on s.user_id = r.user_id where r.role = 'admin' and s.status = 'active'`)).n);

describe('last admin: two connections shrinking the admin set (T-LA-1..5)', () => {
  const cases = {
    'T-LA-1 role deletes': (a, b) => [{ sql: `delete from public.staff_roles where user_id = $1 and role = 'admin'`, params: [b] }, { sql: `delete from public.staff_roles where user_id = $1 and role = 'admin'`, params: [a] }],
    'T-LA-2 role demotions': (a, b) => [{ sql: `update public.staff_roles set role = 'finance' where user_id = $1 and role = 'admin'`, params: [b] }, { sql: `update public.staff_roles set role = 'finance' where user_id = $1 and role = 'admin'`, params: [a] }],
    'T-LA-3 disables': (a, b) => [{ sql: `update public.staff_members set status = 'disabled' where user_id = $1`, params: [b] }, { sql: `update public.staff_members set status = 'disabled' where user_id = $1`, params: [a] }],
    'T-LA-4 auth user deletes (cascade)': (a, b) => [{ sql: `delete from auth.users where id = $1`, params: [b] }, { sql: `delete from auth.users where id = $1`, params: [a] }],
    'T-LA-5 mixed (delete role vs disable)': (a, b) => [{ sql: `delete from public.staff_roles where user_id = $1 and role = 'admin'`, params: [b] }, { sql: `update public.staff_members set status = 'disabled' where user_id = $1`, params: [a] }],
  };
  for (const [name, build] of Object.entries(cases)) {
    it(`${name}: exactly one commits, at least one admin remains, no deadlock (${'N'} iterations)`, async () => {
      for (let i = 0; i < N; i++) {
        const [a, b] = await adminPair();
        const [s1, s2] = build(a, b);
        const res = await twoTx(c1, c2, obs, s1, s2);
        verdict(name, res);
        assert.ok((await remaining()) >= 1, `${name}: no admin remains (iteration ${i})`);
      }
    });
  }

  it('T-LA-7: three admins, two concurrent removals: both may commit, exactly one admin remains', async () => {
    for (let i = 0; i < N; i++) {
      const ids = [];
      for (let k = 0; k < 3; k++) { const u = await mkUser(c1, 'r3'); await mkStaff(c1, u, ['admin']); ids.push(u); }
      await isolateStaff(c1, ids);
      const res = await twoTx(c1, c2, obs,
        { sql: `delete from public.staff_roles where user_id = $1 and role = 'admin'`, params: [ids[0]] },
        { sql: `delete from public.staff_roles where user_id = $1 and role = 'admin'`, params: [ids[1]] });
      verdict('T-LA-7', res, { oneWinner: false });
      assert.equal(res.committed, 2, 'both removals must commit when a third admin remains');
      assert.equal(await remaining(), 1);
    }
  });
});

describe('last owner: two connections (T-LA-11)', () => {
  const cases = {
    'T-LA-11 cross-demote': (org, a, b) => [{ sql: `update public.organization_members set role = 'member' where organization_id = $1 and user_id = $2`, params: [org, b] }, { sql: `update public.organization_members set role = 'member' where organization_id = $1 and user_id = $2`, params: [org, a] }],
    'T-LA-11 cross-remove': (org, a, b) => [{ sql: `delete from public.organization_members where organization_id = $1 and user_id = $2`, params: [org, b] }, { sql: `delete from public.organization_members where organization_id = $1 and user_id = $2`, params: [org, a] }],
    'T-LA-11 auth user deletes (cascade)': (org, a, b) => [{ sql: `delete from auth.users where id = $1`, params: [b] }, { sql: `delete from auth.users where id = $1`, params: [a] }],
  };
  for (const [name, build] of Object.entries(cases)) {
    it(`${name}: exactly one commits, an owner remains`, async () => {
      for (let i = 0; i < N; i++) {
        const org = await mkOrg(c1); const a = await mkUser(c1, 'oa'); const b = await mkUser(c1, 'ob');
        await mkMember(c1, org, a, 'owner'); await mkMember(c1, org, b, 'owner');
        const [s1, s2] = build(org, a, b);
        const res = await twoTx(c1, c2, obs, s1, s2);
        verdict(name, res);
        const left = Number((await one(c1, `select count(*) n from public.organization_members where organization_id = $1 and role = 'owner' and status = 'active'`, [org])).n);
        assert.ok(left >= 1, `${name}: no owner remains`);
      }
    });
  }
});

describe('staff/member exclusion (T-EX-1..3, T-EX-8)', () => {
  it('T-EX-1: staff insert vs member insert for one user, both orderings: exactly one commits', async () => {
    for (let i = 0; i < N; i++) {
      const org = await mkOrg(c1); const owner = await mkUser(c1, 'o'); await mkMember(c1, org, owner, 'owner');
      const u = await mkUser(c1, 'x');
      const staff = { sql: `insert into public.staff_members (user_id) values ($1)`, params: [u] };
      const member = { sql: `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'member')`, params: [org, u] };
      const res = await twoTx(c1, c2, obs, i % 2 ? staff : member, i % 2 ? member : staff);
      verdict('T-EX-1', res);
      const both = Number((await one(c1, `select count(*) n from public.staff_members s join public.organization_members m on m.user_id = s.user_id and m.status = 'active' where s.user_id = $1`, [u])).n);
      assert.equal(both, 0, 'user is both staff and active member');
    }
  });

  it('T-EX-3: member removed->active vs staff insert, both orderings: exactly one commits', async () => {
    for (let i = 0; i < N; i++) {
      const org = await mkOrg(c1); const owner = await mkUser(c1, 'o'); await mkMember(c1, org, owner, 'owner');
      const u = await mkUser(c1, 'x'); await mkMember(c1, org, u, 'member', 'removed');
      const staff = { sql: `insert into public.staff_members (user_id) values ($1)`, params: [u] };
      const react = { sql: `update public.organization_members set status = 'active', removed_at = null where organization_id = $1 and user_id = $2`, params: [org, u] };
      const res = await twoTx(c1, c2, obs, i % 2 ? staff : react, i % 2 ? react : staff);
      verdict('T-EX-3', res);
    }
  });

  it('T-EX-8: mixed loop, zero deadlocks, invariant "nobody is both staff and active member" holds after every iteration', async () => {
    for (let i = 0; i < N; i++) {
      const org = await mkOrg(c1); const owner = await mkUser(c1, 'o'); await mkMember(c1, org, owner, 'owner');
      const u = await mkUser(c1, 'x');
      const res = await twoTx(c1, c2, obs,
        { sql: `insert into public.staff_members (user_id) values ($1)`, params: [u] },
        { sql: `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'member')`, params: [org, u] });
      verdict('T-EX-8', res);
      const bad = Number((await one(c1, `select count(*) n from public.staff_members s join public.organization_members m on m.user_id = s.user_id and m.status = 'active'`)).n);
      assert.equal(bad, 0, 'invariant broken');
    }
  });
});

describe('T-WT-8: revoke vs claim race on one window, both orderings', () => {
  it('T-WT-8: exactly one terminal outcome; a consumed window always has its approval', async () => {
    for (let i = 0; i < N; i++) {
      const t = await mkUser(c1, 'wt'); await mkStaff(c1, t, ['support']);
      const w = await mkWindow(c1, t); const f = await mkFactor(c1, t);
      const claim = { sql: `insert into private.staff_mfa_factors (factor_id, user_id, window_id) values ($1, $2, $3)`, params: [f, t, w] };
      const revoke = { sql: `update private.staff_mfa_enrolment_windows set revoked_at = now(), revoke_reason = 'race' where id = $1`, params: [w] };
      // The second statement may or may not need to wait (revoke first leaves the claim reading a committed state).
      const res = await twoTx(c1, c2, obs, i % 2 ? claim : revoke, i % 2 ? revoke : claim, { expectBlock: false });
      verdict('T-WT-8', res, { expectBlock: false });
      const row = await one(c1, `select consumed_at, revoked_at, exists (select 1 from private.staff_mfa_factors a where a.window_id = w.id) as approved
                                  from private.staff_mfa_enrolment_windows w where id = $1`, [w]);
      assert.equal(Boolean(row.consumed_at) !== Boolean(row.revoked_at), true, 'not exactly one terminal state');
      if (row.consumed_at) assert.equal(row.approved, true, 'consumed without approval');
    }
  });
});

after(() => note('concurrency_blocked_counts', stats));
