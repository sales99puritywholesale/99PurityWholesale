// P2.1 suite 6: real GoTrue tokens through PostgREST on the hosted SCRATCH project. No service-role key is used anywhere:
// test users are created by SQL (bcrypt password + email identity) and sign in with the public key like any browser would.
// If GoTrue rejects the SQL-created users, enable sign-ups on the SCRATCH project only and report it; do not weaken the tests.
// This file never prints tokens, TOTP seeds or response bodies (errors carry the HTTP status and error code only).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { scratchTarget } from './lib/config.mjs';
import { connect, one, mkLoginUser, mkOrg, mkMember, mkStaff, mkWindow, rnd } from './lib/db.mjs';
import { totp, nextStep } from './lib/totp.mjs';
import { note } from './lib/report.mjs';

let T; let db;
const PASSWORD = `P2-${rnd()}-Aa1!x`;              // generated per run, never stored or printed

async function http(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${T.apiUrl}${path}`, {
    method,
    headers: { apikey: T.anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, ok: res.ok };
}
const fail = (what, r) => `${what}: HTTP ${r.status} ${r.json?.error_code ?? r.json?.code ?? ''}`;
const decode = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const claimsSummary = (jwt) => {
  const c = decode(jwt);
  const now = Math.floor(Date.now() / 1000);
  return {
    aal: c.aal, has_session_id: Boolean(c.session_id), keys: Object.keys(c).sort(),
    amr: (c.amr ?? []).map((a) => ({ method: a.method, age_s: typeof a.timestamp === 'number' ? now - a.timestamp : null, extra_keys: Object.keys(a).filter((k) => !['method', 'timestamp'].includes(k)) })),
  };
};

async function loginUser(tag) {
  const u = await mkLoginUser(db, tag, PASSWORD);
  const r = await http('POST', '/auth/v1/token?grant_type=password', { body: { email: u.email, password: PASSWORD } });
  assert.ok(r.ok && r.json?.access_token, fail('sign-in of a fixture user', r));
  return { ...u, token: r.json.access_token };
}
async function enrolAndVerify(token, label) {
  const e = await http('POST', '/auth/v1/factors', { token, body: { factor_type: 'totp', friendly_name: `p2-${label}-${rnd()}` } });
  assert.ok(e.ok && e.json?.id && e.json?.totp?.secret, fail('enrol', e));
  const secret = e.json.totp.secret;                 // memory only
  const verify = async () => {
    const ch = await http('POST', `/auth/v1/factors/${e.json.id}/challenge`, { token });
    assert.ok(ch.ok && ch.json?.id, fail('challenge', ch));
    return http('POST', `/auth/v1/factors/${e.json.id}/verify`, { token, body: { challenge_id: ch.json.id, code: totp(secret) } });
  };
  let v = await verify();
  if (!v.ok) { await nextStep(); v = await verify(); }
  assert.ok(v.ok && v.json?.access_token, fail('verify', v));
  return { token: v.json.access_token, factorId: e.json.id, secret };
}
const rest = (path, token, opts = {}) => http(opts.method ?? 'GET', `/rest/v1/${path}`, { token, body: opts.body, headers: opts.headers });

before(async () => { T = scratchTarget(); db = await connect(); });
after(async () => {
  try { await db?.query(`drop function if exists public.p2_probe_isolation()`); } catch { /* ignore */ }
  await db?.end();
});

describe('PostgREST with real tokens: tenant isolation and write denial (T-0001-3..8, T-ISO-1)', () => {
  let u1; let u2; let orgA;
  before(async () => {
    u1 = await loginUser('c1'); u2 = await loginUser('c2');
    orgA = await mkOrg(db); await mkMember(db, orgA, u1.id, 'owner'); await mkMember(db, orgA, u2.id, 'member');
    await db.query(`insert into public.organization_billing (organization_id) values ($1)`, [orgA]);
  });

  it('the signup trigger created an empty profile for the fixture users (trigger fires on auth.users insert)', async () => {
    const p = await one(db, `select full_name from public.profiles where user_id = $1`, [u1.id]);
    assert.ok(p, 'profile missing');
  });

  it('a password sign-in token is aal1 (evidence for the staff tests)', () => {
    const cs = claimsSummary(u1.token); note('claims after password sign-in', cs);
    assert.equal(cs.aal, 'aal1');
  });

  it('customers read only their own data; writes are denied and database state is unchanged', async () => {
    const mine = await rest('organizations?select=id', u2.token);
    assert.equal(mine.status, 200); assert.equal(mine.json.length, 1, 'a member should see exactly one organization');
    assert.deepEqual((await rest('organization_billing?select=organization_id', u2.token)).json, [], 'a plain member must not see billing');
    assert.equal((await rest('organization_billing?select=organization_id', u1.token)).json.length, 1, 'an owner sees billing');
    assert.equal((await rest('profiles?select=user_id', u2.token)).json.length, 1);
    for (const [method, path, body] of [
      ['POST', 'organizations', { name: 'x', code: 'HTTP999' }], ['DELETE', 'organization_members?role=eq.member', undefined],
      ['PATCH', 'organizations?name=neq.zzz-none', { name: 'x' }], ['POST', 'staff_members', { user_id: u2.id }],
      ['POST', 'organization_members', { organization_id: orgA, user_id: u2.id, role: 'owner' }],
      ['PATCH', 'organization_members?role=eq.member', { role: 'owner' }],
    ]) {
      const r = await rest(path, u1.token, { method, body });
      assert.ok(r.status >= 400, `${method} ${path.split('?')[0]} should be rejected, got ${r.status}`);
    }
    assert.equal(Number((await one(db, `select count(*) n from public.organization_members where organization_id = $1`, [orgA])).n), 2);
    assert.equal((await one(db, `select role from public.organization_members where user_id = $1 and organization_id = $2`, [u2.id, orgA])).role, 'member', 'member role changed');
    const patch = await rest(`profiles?user_id=eq.${u1.id}`, u1.token, { method: 'PATCH', body: { phone: '555' }, headers: { Prefer: 'return=representation' } });
    assert.equal(patch.status, 200); assert.equal(patch.json.length, 1);
    const other = await rest(`profiles?user_id=eq.${u2.id}`, u1.token, { method: 'PATCH', body: { phone: '666' }, headers: { Prefer: 'return=representation' } });
    assert.deepEqual(other.json, [], 'updating another user\'s profile must affect nothing');
  });

  it('a user in another organization sees none of this organization', async () => {
    const outsider = await loginUser('out');
    const orgB = await mkOrg(db); await mkMember(db, orgB, outsider.id, 'owner');
    const seen = await rest('organizations?select=id', outsider.token);
    assert.equal(seen.json.length, 1, 'outsider should see only their own organization');
    assert.deepEqual((await rest(`organization_members?organization_id=eq.${orgA}&select=user_id`, outsider.token)).json, []);
    assert.deepEqual((await rest(`organization_billing?organization_id=eq.${orgA}&select=organization_id`, outsider.token)).json, []);
  });

  it('removed members lose access immediately', async () => {
    const m = await loginUser('rm');
    await mkMember(db, orgA, m.id, 'member');
    assert.equal((await rest('organizations?select=id', m.token)).json.length, 1);
    await db.query(`update public.organization_members set status = 'removed', removed_at = now() where organization_id = $1 and user_id = $2`, [orgA, m.id]);
    assert.deepEqual((await rest('organizations?select=id', m.token)).json, []);
  });

  it('anon is denied; the private schema is not exposed to the Data API', async () => {
    const a = await rest('organizations?select=id', null);
    assert.ok(a.status === 401 || a.status === 403, `anon read -> ${a.status}`);
    const p = await http('GET', '/rest/v1/platform_validations?select=*', { token: u1.token, headers: { 'Accept-Profile': 'private' } });
    assert.ok(p.status >= 400, `private schema reachable (${p.status})`);
  });

  it('T-ISO-1: PostgREST requests run at READ COMMITTED', async () => {
    await db.query(`create or replace function public.p2_probe_isolation() returns text language sql stable as $$ select current_setting('transaction_isolation') $$`);
    await db.query(`grant execute on function public.p2_probe_isolation() to authenticated`);
    await db.query(`notify pgrst, 'reload schema'`);
    let r;
    for (let i = 0; i < 20; i++) { r = await http('POST', '/rest/v1/rpc/p2_probe_isolation', { token: u1.token, body: {} }); if (r.status === 200) break; await new Promise((res) => setTimeout(res, 500)); }
    assert.equal(r.status, 200, 'probe function not reachable via PostgREST');
    assert.equal(r.json, 'read committed', 'T-ISO-1');
    note('isolation_seen_via_postgrest', { user: r.json });
  });
});

describe('staff session end to end with a real TOTP factor (V6 evidence, T-FB real path)', () => {
  it('unapproved verified factor: denied; after the table-level claim: staff read works; a second verified factor closes it again', async () => {
    const u = await loginUser('staff');
    await mkStaff(db, u.id, ['support']);
    const win = await mkWindow(db, u.id);
    // Isolation: the structure-check result is ONE global row (check_name is the primary key) that other suites expect to be
    // absent on a fresh database (T-0002-denied-at-install, T-AV-7). Remember what was there before and put it back afterwards,
    // even when this test fails part way. Only the exact row this test wrote is removed (matched by name AND its checked_at).
    const CHECK = 'auth_mfa_factors_shape';
    // timestamps travel as TEXT: a JS Date would drop the microseconds and the exact-row match below would hit nothing
    const prior = (await db.query(`select *, checked_at::text as checked_at_txt from private.platform_validations where check_name = $1`, [CHECK])).rows[0] ?? null;
    let ours = null;
    try {
      await db.query(`select private.run_auth_structure_check()`);    // fresh passed check (committed)
      ours = (await db.query(`select checked_at::text as t from private.platform_validations where check_name = $1`, [CHECK])).rows[0]?.t ?? null;
      const seen = {};

      const first = await enrolAndVerify(u.token, 'one');
      seen.after_first_verify = claimsSummary(first.token);
      assert.equal(seen.after_first_verify.aal, 'aal2');

      let orgs = await rest('organizations?select=id', first.token);
      assert.deepEqual(orgs.json, [], 'an unapproved factor must not open the staff session');

      await db.query(`insert into private.staff_mfa_factors (factor_id, user_id, window_id) values ($1, $2, $3)`, [first.factorId, u.id, win]);
      orgs = await rest('organizations?select=id', first.token);
      assert.equal(orgs.status, 200);
      assert.ok(Array.isArray(orgs.json), 'organizations read should succeed for approved staff');
      note('staff read after approval (row count only)', { rows: orgs.json.length });
      assert.deepEqual((await rest('organizations?select=id', u.token)).json ?? [], [], 'the original aal1 token must not read as staff');

      const e2 = await http('POST', '/auth/v1/factors', { token: first.token, body: { factor_type: 'totp', friendly_name: `p2-two-${rnd()}` } });
      assert.ok(e2.ok && e2.json?.id, fail('second enrol', e2));
      seen.after_second_enrol_token_unchanged = claimsSummary(first.token);
      await nextStep();
      const ch2 = await http('POST', `/auth/v1/factors/${e2.json.id}/challenge`, { token: first.token });
      const v2 = await http('POST', `/auth/v1/factors/${e2.json.id}/verify`, { token: first.token, body: { challenge_id: ch2.json.id, code: totp(e2.json.totp.secret) } });
      assert.ok(v2.ok && v2.json?.access_token, fail('second verify', v2));
      seen.after_second_verify = claimsSummary(v2.json.access_token);
      assert.deepEqual((await rest('organizations?select=id', v2.json.access_token)).json, [], 'a second verified unapproved factor must deny staff');
      seen.L1_amr_entries_carry_factor_id = seen.after_second_verify.amr.some((a) => a.extra_keys.length > 0);
      note('V6 evidence (claims allow-listed; ages in seconds)', seen);
    } finally {
      if (ours) {
        if (!prior) {
          const del = await db.query(`delete from private.platform_validations where check_name = $1 and checked_at::text = $2`, [CHECK, ours]);
          assert.equal(del.rowCount, 1, 'cleanup must remove exactly the validation row this test created');
        } else {
          await db.query(`update private.platform_validations set status=$2, checked_at=$3::timestamptz, sqlstate=$4, expected_columns=$5, present_expected_columns=$6,
              other_column_count=$7, type_checks_passed=$8, enum_labels_ok=$9, server_version=$10 where check_name=$1 and checked_at::text=$11`,
            [CHECK, prior.status, prior.checked_at_txt, prior.sqlstate, prior.expected_columns, prior.present_expected_columns,
              prior.other_column_count, prior.type_checks_passed, prior.enum_labels_ok, prior.server_version, ours]);
        }
      }
    }
  });
});
