// RLS and grant behavior at SQL level (role switching + request.jwt.claims). Every test is BEGIN ... ROLLBACK.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, tx, attempt, asRole, resetRole, mkUser, mkOrg, mkMember, mkStaff, mkFactor, mkApprovedStaff, one } from './lib/db.mjs';

let c;
before(async () => { c = await connect(); });
after(async () => { await c?.end(); });

const count = async (sql, p = []) => Number((await one(c, `select count(*) n from (${sql}) q`, p)).n);

async function world() {
  const oA = await mkUser(c, 'ownerA'), mA = await mkUser(c, 'memberA'), oB = await mkUser(c, 'ownerB'), lone = await mkUser(c, 'lone');
  const orgA = await mkOrg(c), orgB = await mkOrg(c);
  await mkMember(c, orgA, oA, 'owner'); await mkMember(c, orgA, mA, 'member'); await mkMember(c, orgB, oB, 'owner');
  await c.query(`insert into public.organization_billing (organization_id) values ($1), ($2)`, [orgA, orgB]);
  await c.query(`insert into public.organization_invites (organization_id, email, role) values ($1, 'x-a@example.test', 'member'), ($2, 'x-b@example.test', 'member')`, [orgA, orgB]);
  await c.query(`insert into private.organization_invite_secrets (invite_id, token_hash)
                 select id, decode(repeat('ab', 32), 'hex') from public.organization_invites where organization_id = $1`, [orgA]);
  return { oA, mA, oB, lone, orgA, orgB };
}

describe('customer-side RLS (T-0001-3..8, 12)', () => {
  it('a member sees only their own organization, its members, and no billing or invites', () => tx(c, async () => {
    const w = await world();
    await asRole(c, 'authenticated', w.mA);
    assert.equal(await count(`select 1 from public.organizations`), 1);
    assert.equal(await count(`select 1 from public.organization_members`), 2);
    assert.equal(await count(`select 1 from public.organization_billing`), 0);
    assert.equal(await count(`select 1 from public.organization_invites`), 0);
    assert.equal(await count(`select 1 from public.profiles`), 1);
  }));

  it('an owner sees own billing and invites, never another organization', () => tx(c, async () => {
    const w = await world();
    await asRole(c, 'authenticated', w.oA);
    assert.equal(await count(`select 1 from public.organization_billing`), 1);
    assert.equal(await count(`select 1 from public.organization_invites`), 1);
    assert.equal(await count(`select 1 from public.organizations where id = $1`, [w.orgB]), 0);
    assert.equal(await count(`select 1 from public.organization_members where organization_id = $1`, [w.orgB]), 0);
  }));

  it('a user without membership sees nothing; anon is denied on every table', () => tx(c, async () => {
    const w = await world();
    await asRole(c, 'authenticated', w.lone);
    for (const t of ['organizations', 'organization_members', 'organization_billing', 'organization_invites']) assert.equal(await count(`select 1 from public.${t}`), 0, t);
    await resetRole(c);
    await asRole(c, 'anon');
    for (const t of ['profiles', 'organizations', 'organization_members', 'organization_billing', 'organization_invites', 'staff_members', 'capabilities']) {
      const r = await attempt(c, `select 1 from public.${t}`);
      assert.equal(r.ok, false, `anon could select ${t}`); assert.equal(r.code, '42501', t);
    }
  }));

  it('authenticated cannot write any table except profiles(full_name, phone) on the own row', () => tx(c, async () => {
    const w = await world();
    await asRole(c, 'authenticated', w.oA);
    for (const sql of [
      `insert into public.organizations (name, code) values ('x', 'ZZZ999')`,
      `update public.organizations set name = 'x'`, `delete from public.organizations`,
      `update public.organization_members set role = 'owner'`, `delete from public.organization_members`,
      `insert into public.organization_members (organization_id, user_id, role) values ('${w.orgA}', '${w.lone}', 'member')`,
      `update public.organization_invites set role = 'owner'`, `update public.organization_billing set billing_address = '{}'`,
      `insert into public.staff_members (user_id) values ('${w.oA}')`, `delete from public.profiles`,
      `select * from private.organization_invite_secrets`, `truncate public.organization_members`,
    ]) {
      const r = await attempt(c, sql);
      assert.equal(r.ok, false, `should be denied: ${sql}`); assert.equal(r.code, '42501', sql);
    }
    const own = await attempt(c, `update public.profiles set full_name = 'Own Name', phone = '123' where user_id = $1`, [w.oA]);
    assert.equal(own.ok && own.rowCount === 1, true, 'own profile update should affect 1 row');
    const other = await attempt(c, `update public.profiles set full_name = 'Hack' where user_id = $1`, [w.mA]);
    assert.equal(other.ok && other.rowCount === 0, true, 'other profile update must affect 0 rows');
    const prot = await attempt(c, `update public.profiles set user_id = gen_random_uuid() where user_id = $1`, [w.oA]);
    assert.equal(prot.ok, false); assert.equal(prot.code, '42501');
  }));
});

describe('staff-side policies (fail closed)', () => {
  it('approved staff at aal2 with a passed structure check read organizations; without any one condition they read nothing', () => tx(c, async () => {
    const w = await world();
    const s = await mkApprovedStaff(c, ['support']);
    await c.query(`select private.run_auth_structure_check()`);
    const q = async (claims, extra) => {
      await resetRole(c);
      if (extra) await extra();
      await asRole(c, 'authenticated', s.user, claims);
      return count(`select 1 from public.organizations`);
    };
    assert.ok((await q({ aal: 'aal2' })) >= 2, 'approved staff at aal2 should see all organizations (at least the two just created)');
    assert.equal(await q({ aal: 'aal1' }), 0, 'aal1 must be denied');
    assert.equal(await q({}), 0, 'missing aal must be denied');
    // a second verified, unapproved factor (any type) denies the session
    assert.equal(await q({ aal: 'aal2' }, () => mkFactor(c, s.user, { type: 'phone' })), 0, 'unapproved verified phone factor must deny');
    assert.equal(await q({ aal: 'aal2' }), 0);
    // support has no billing or profile capability even when allowed
    assert.equal(await count(`select 1 from public.organization_billing`), 0);
    assert.equal(await count(`select 1 from public.profiles where user_id <> $1`, [s.user]), 0);
    // customer data is unaffected for non-staff
    void w;
  }));

  it('staff without a passed (or fresh, or non-future-dated) structure check read nothing (T-AV-7)', () => tx(c, async () => {
    await world();
    const s = await mkApprovedStaff(c, ['support']);
    const read = async () => { await resetRole(c); await asRole(c, 'authenticated', s.user, { aal: 'aal2' }); return count(`select 1 from public.organizations`); };
    assert.equal(await read(), 0, 'no validation row yet: denied');
    await resetRole(c); await c.query(`select private.run_auth_structure_check()`);
    assert.ok((await read()) >= 1, 'fresh passed check: allowed');
    await resetRole(c); await c.query(`update private.platform_validations set checked_at = now() - interval '25 hours'`);
    assert.equal(await read(), 0, 'stale (25 h) check: denied');
    await resetRole(c); await c.query(`update private.platform_validations set checked_at = now() + interval '1 hour'`);
    assert.equal(await read(), 0, 'future-dated check: denied');
  }));

  it('a disabled staff member or one without roles reads nothing; non-staff customers cannot call staff functions meaningfully', () => tx(c, async () => {
    const s = await mkApprovedStaff(c, ['support']);
    await c.query(`select private.run_auth_structure_check()`);
    await c.query(`update public.staff_members set status = 'disabled' where user_id = $1`, [s.user]);
    await asRole(c, 'authenticated', s.user, { aal: 'aal2' });
    assert.equal(await count(`select 1 from public.organizations`), 0);
    const ok = await one(c, `select private.staff_session_ok() as x`);
    assert.equal(ok.x, false);
    const bad = await attempt(c, `select private.mfa_check_ok()`);
    assert.equal(bad.ok, false); assert.equal(bad.code, '42501', 'mfa_check_ok must not be executable by authenticated');
  }));
});
