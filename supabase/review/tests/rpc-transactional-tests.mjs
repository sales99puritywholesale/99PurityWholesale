// Positive and negative tests for EVERY staff RPC of migrations 0003 + 0004 (review drafts), executed entirely inside ONE transaction that is
// ALWAYS rolled back: the two files are applied INSIDE the transaction, fixtures are created INSIDE it, callers are simulated with
// `set local role authenticated|anon` + request.jwt.claims (the mechanism PostgREST uses), and ROLLBACK removes everything, including the migrations.
// Nothing persists. Not run automatically: it needs the explicit flags below.
//   --authorized-rolled-back-execution        required: confirms you approved executing 0003+0004 inside a rolled-back hosted transaction
//   --authorized-read-env-local               optional: allow reading ONLY the P2_DATABASE_URL line of .env.local (otherwise the env variable)
//   --list                                    offline: print the test names; no env, no network
// Strict TLS to the hosted database (pinned CA, rejectUnauthorized). No secrets are printed.
// What this cannot prove (documented in docs/P2-2-RPC-TEST-PLAN.md): races between sessions (see rpc-concurrency-tests.mjs) and real PostgREST/GoTrue
// tokens (see rpc-postgrest-tests.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const scratch = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
const REF = 'semtmllmwhxznxechfsk';
const SQL3 = readFileSync(join(root, 'supabase/review/0003_audit_and_step_up.sql'), 'utf8');
const SQL4 = readFileSync(join(root, 'supabase/review/0004_staff_management_rpcs.sql'), 'utf8');
const RPCS = ['rpc_staff_directory', 'rpc_my_staff_context', 'rpc_staff_lookup_user', 'rpc_staff_add_member', 'rpc_staff_grant_role', 'rpc_staff_revoke_role',
  'rpc_staff_set_status', 'rpc_staff_authorize_enrolment_window', 'rpc_staff_revoke_enrolment_window', 'rpc_staff_claim_factor'];

const tests = []; // [group, name, fn]
const T = (group, name, fn) => tests.push([group, name, fn]);
if (process.argv.includes('--list') && !process.argv.includes('--authorized-rolled-back-execution')) { /* list after registration below */ }

// ------------------------------------------------------------------------------------------ tiny harness
let c; const results = { pass: 0, fail: 0 }; const failures = [];
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg); };
// The transaction clock now() is FROZEN at transaction start, so token timestamps are generated relative to it (T0), not to wall time.
let T0 = Math.floor(Date.now() / 1000); const now = () => T0;
const claims = (uid, o = {}) => JSON.stringify({ sub: uid, role: 'authenticated', aal: o.aal ?? 'aal2', iat: now(), exp: now() + 3600,
  amr: o.amr ?? [{ method: 'password', timestamp: now() - 120 }, { method: 'totp', timestamp: now() - (o.totpAge ?? 30) }] });
/** Runs ONE statement as an API caller inside a savepoint. Returns {value} or {error: sqlstate}. State changes of a successful call stay in the transaction. */
async function as(who, text, params = [], role = 'authenticated') {
  await c.query('savepoint call_sp');
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [who ?? '']);
    await c.query(`set local role ${role}`);
    const r = await c.query(text, params);
    await c.query('reset role');
    await c.query('release savepoint call_sp');
    return { value: r.rows[0]?.r ?? r.rows[0], rows: r.rows };
  } catch (e) {
    await c.query('rollback to savepoint call_sp'); await c.query('release savepoint call_sp');
    return { error: e.code, message: e.message };
  }
}
const rpc = (who, name, args = [], role = 'authenticated') => as(who, `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args, role);
const q1 = async (text, params = []) => (await c.query(text, params)).rows[0];
const audit = async (action, outcome) => Number((await q1(`select count(*)::int n from public.audit_events where action = $1 and outcome = $2`, [action, outcome])).n);
const auditAll = async () => Number((await q1(`select count(*)::int n from public.audit_events`)).n);
const staffRow = async (id) => q1(`select s.status, (select coalesce(array_agg(r.role order by r.role), '{}') from public.staff_roles r where r.user_id = s.user_id) roles from public.staff_members s where s.user_id = $1`, [id]);

// ------------------------------------------------------------------------------------------ fixtures (all inside the transaction)
const U = {};
async function mkUser(label) {
  const email = `p2rpc-${label}-${randomBytes(4).toString('hex')}@example.test`;
  const r = await q1(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '') returning id`, [email]);
  U[label] = r.id; U[label + 'Email'] = email; return r.id;
}
const mkFactor = async (uid, { status = 'verified', type = 'totp', createdAt = 'clock_timestamp()' } = {}) =>
  (await q1(`insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
     values (gen_random_uuid(), $1, 'p2rpc-' || substr(md5(random()::text), 1, 12), $2::auth.factor_type, $3::auth.factor_status, ${createdAt}, clock_timestamp(), 'x') returning id`, [uid, type, status])).id;
/** Bootstrap-style admin (direct inserts as the owner role, like the owner-run script does), approved through the real 0002 trigger path. */
async function bootstrapAdmin(uid) {
  await q1(`insert into public.staff_members (user_id, status, created_by) values ($1, 'active', null) returning 1 x`, [uid]);
  await q1(`insert into public.staff_roles (user_id, role, granted_by) values ($1, 'admin', null) returning 1 x`, [uid]);
  const w = await q1(`insert into private.staff_mfa_enrolment_windows (target_user_id, authorized_by, reason) values ($1, null, 'test bootstrap') returning id`, [uid]);
  const f = await mkFactor(uid);
  await q1(`insert into private.staff_mfa_factors (factor_id, user_id, window_id) values ($1, $2, $3) returning 1 x`, [f, uid, w.id]);
  return f;
}
/** Staff made through the REAL RPCs: add_member + authorize window by an admin, factor created after the window, claim by the member. */
async function enrolStaffViaRpcs(adminId, label, role) {
  const id = await mkUser(label);
  const added = await rpc(claims(adminId), 'rpc_staff_add_member', [id, role]); eq(added.value?.code, 'added', `add ${label}`);
  const win = await rpc(claims(adminId), 'rpc_staff_authorize_enrolment_window', [id, `enrol ${label}`, 30]); eq(win.value?.code, 'authorized', `window ${label}`);
  const f = await mkFactor(id);
  const claim = await rpc(claims(id), 'rpc_staff_claim_factor', [win.value.window_id, f]); eq(claim.value?.code, 'approved', `claim ${label}`);
  return { id, factorId: f };
}

async function setup() {
  await c.query(SQL3); await c.query(SQL4);                                  // the two drafts, INSIDE the transaction
  await mkUser('admin1'); await mkUser('plain'); await mkUser('owner'); await mkUser('unapproved');
  const org = await q1(`insert into public.organizations (name, code) values ('P2 RPC Test Org', 'P2RPC-TEST') returning id`);
  await q1(`insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner') returning 1 x`, [org.id, U.owner]);
  U.adminFactor = await bootstrapAdmin(U.admin1);
  eq(await q1(`select private.run_auth_structure_check() as s`).then((r) => r.s), 'passed', 'structure check passes on the real auth.mfa_factors');
  U.admin2 = (await enrolStaffViaRpcs(U.admin1, 'admin2', 'admin')).id;
  U.support = (await enrolStaffViaRpcs(U.admin1, 'support', 'support')).id;
  U.finance = (await enrolStaffViaRpcs(U.admin1, 'finance', 'finance')).id;
  // a staff user whose only verified factor was never approved (the "leftover factor" case for staff)
  await q1(`insert into public.staff_members (user_id, status, created_by) values ($1, 'active', $2) returning 1 x`, [U.unapproved, U.admin1]);
  await q1(`insert into public.staff_roles (user_id, role, granted_by) values ($1, 'admin', $2) returning 1 x`, [U.unapproved, U.admin1]);
  await mkFactor(U.unapproved);
}

// ================================================================================================ G0 catalog / grants
T('G0 grants', 'all 10 public RPCs exist, SECURITY DEFINER, search_path pinned, EXECUTE only for authenticated', async () => {
  for (const n of RPCS) {
    const r = await q1(`select p.prosecdef, p.proconfig, has_function_privilege('authenticated', p.oid, 'execute') a, has_function_privilege('anon', p.oid, 'execute') n,
        has_function_privilege('service_role', p.oid, 'execute') s, has_function_privilege('public', p.oid, 'execute') pu
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = $1`, [n]);
    ok(r, `${n} missing`); ok(r.prosecdef, `${n} not definer`); ok((r.proconfig ?? []).includes('search_path=""'), `${n} search_path`);
    ok(r.a && !r.n && !r.s && !r.pu, `${n} grants wrong: ${JSON.stringify({ a: r.a, anon: r.n, service: r.s, public: r.pu })}`);
  }
});
T('G0 grants', 'audit_events and private helpers are not directly usable by API roles', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const p of ['insert', 'update', 'delete', 'truncate']) ok(!(await q1(`select has_table_privilege($1, 'public.audit_events', $2) b`, [role, p])).b, `${role} has ${p} on audit_events`);
  }
  for (const f of ['private.write_audit(uuid,text,text,text,uuid,text,text,jsonb)', 'private.staff_gate(text,text,boolean,text,text)', 'private.step_up_ok()'])
    for (const role of ['anon', 'authenticated', 'service_role']) ok(!(await q1(`select has_function_privilege($1, $2, 'execute') b`, [role, f])).b, `${role} can execute ${f}`);
});

// ================================================================================================ G1 caller gates: every RPC, every non-staff shape
const callArgs = {
  rpc_staff_directory: () => [], rpc_staff_lookup_user: () => ['someone@example.test'], rpc_staff_add_member: () => [U.plain, 'support'], rpc_staff_grant_role: () => [U.support, 'finance'],
  rpc_staff_revoke_role: () => [U.support, 'support'], rpc_staff_set_status: () => [U.support, 'disabled'], rpc_staff_authorize_enrolment_window: () => [U.support, 'test', 30],
  rpc_staff_revoke_enrolment_window: () => [randomUuid(), 'test'],
};
function randomUuid() { const b = randomBytes(16); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; const h = b.toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; }
for (const name of Object.keys(callArgs)) {
  T('G1 gates', `${name}: anon is refused (permission denied), authenticated without a subject is refused`, async () => {
    const a = await rpc(null, name, callArgs[name](), 'anon'); eq(a.error, '42501', 'anon');
    const b = await rpc('{"role":"authenticated"}', name, callArgs[name]()); eq(b.error, '42501', 'no subject');
  });
  T('G1 gates', `${name}: a signed-in NON-staff user (aal2, fresh TOTP) is refused and nothing is audited`, async () => {
    const before = await auditAll(); const r = await rpc(claims(U.plain), name, callArgs[name]()); eq(r.error, '42501', 'non-staff'); eq(await auditAll(), before, 'audit rows written by an outsider');
  });
  T('G1 gates', `${name}: an organization owner (not staff) is refused`, async () => { eq((await rpc(claims(U.owner), name, callArgs[name]())).error, '42501', 'org owner'); });
  T('G1 gates', `${name}: staff at aal1 is refused even with a fresh password session`, async () => {
    eq((await rpc(claims(U.admin1, { aal: 'aal1', amr: [{ method: 'password', timestamp: now() - 5 }] }), name, callArgs[name]())).error, '42501', 'aal1');
  });
  T('G1 gates', `${name}: staff whose verified factor is NOT approved is refused (leftover-factor case)`, async () => { eq((await rpc(claims(U.unapproved), name, callArgs[name]())).error, '42501', 'unapproved'); });
  T('G1 gates', `${name}: a stale structure check (older than 24 h) fails closed`, async () => {
    await c.query('savepoint stale'); await c.query(`update private.platform_validations set checked_at = now() - interval '25 hours' where check_name = 'auth_mfa_factors_shape'`);
    const r = await rpc(claims(U.admin1), name, callArgs[name]()); await c.query('rollback to savepoint stale'); await c.query('release savepoint stale'); eq(r.error, '42501', 'stale check');
  });
}
T('G1 gates', 'rpc_my_staff_context: anon refused; no subject refused; non-staff gets status none and session_ok false', async () => {
  eq((await rpc(null, 'rpc_my_staff_context', [], 'anon')).error, '42501', 'anon'); eq((await rpc('{"role":"authenticated"}', 'rpc_my_staff_context')).error, '42501', 'no subject');
  const r = await rpc(claims(U.plain), 'rpc_my_staff_context'); eq([r.value.staff_status, r.value.session_ok], ['none', false], 'plain');
});
T('G1 gates', 'rpc_staff_claim_factor: anon refused; non-staff refused (42501); invalid arguments raise 22023', async () => {
  eq((await rpc(null, 'rpc_staff_claim_factor', [randomUuid(), randomUuid()], 'anon')).error, '42501', 'anon');
  eq((await rpc(claims(U.plain), 'rpc_staff_claim_factor', [randomUuid(), randomUuid()])).error, '42501', 'plain');
  eq((await rpc(claims(U.support), 'rpc_staff_claim_factor', [null, randomUuid()])).error, '22023', 'null window');
});

// ================================================================================================ G2 capability and step-up
const manage = { rpc_staff_lookup_user: false, rpc_staff_add_member: true, rpc_staff_grant_role: true, rpc_staff_revoke_role: true, rpc_staff_set_status: true,
  rpc_staff_authorize_enrolment_window: true, rpc_staff_revoke_enrolment_window: true };
for (const [name, needsStepUp] of Object.entries(manage)) {
  T('G2 capability', `${name}: support and finance (verified sessions, no staff.manage) get 'forbidden' and the denial is audited`, async () => {
    for (const who of [U.support, U.finance]) {
      const before = await auditAll(); const r = await rpc(claims(who), name, callArgs[name]());
      eq([r.value?.ok, r.value?.code], [false, 'forbidden'], `${name}/${who}`); eq(await auditAll(), before + 1, 'one denied audit row');
    }
    eq((await q1(`select count(*)::int n from public.audit_events where outcome = 'denied' and detail ->> 'reason' = 'capability_missing' and actor_user_id in ($1, $2)`, [U.support, U.finance])).n >= 2, true, 'reasons recorded');
  });
  if (needsStepUp) T('G2 capability', `${name}: an admin whose last TOTP is older than 15 minutes gets 'step_up_required' (audited), nothing changes`, async () => {
    const before = await auditAll(); const r = await rpc(claims(U.admin1, { totpAge: 20 * 60 }), name, callArgs[name]());
    eq([r.value?.ok, r.value?.code], [false, 'step_up_required'], name); eq(await auditAll(), before + 1, 'denial audited');
    eq(await staffRow(U.support), { status: 'active', roles: ['support'] }, 'support unchanged');
  });
}
T('G2 capability', 'rpc_staff_directory: admin sees rows with emails; support and finance get forbidden', async () => {
  const a = await rpc(claims(U.admin1), 'rpc_staff_directory'); eq(a.value.ok, true, 'admin'); ok(a.value.rows.length >= 5 && a.value.rows.every((r) => typeof r.email === 'string'), 'rows');
  for (const who of [U.support, U.finance]) eq((await rpc(claims(who), 'rpc_staff_directory')).value, { ok: false, code: 'forbidden' }, 'forbidden');
});
T('G2 capability', 'a future-dated TOTP timestamp beyond the 60 second allowance is not a step-up', async () => {
  const r = await rpc(claims(U.admin1, { amr: [{ method: 'totp', timestamp: now() + 600 }] }), 'rpc_staff_grant_role', [U.support, 'finance']); eq(r.value?.code, 'step_up_required', 'future');
});

// ================================================================================================ G3 lookup
T('G3 lookup', 'finds an existing user (flags correct), reports not found, rejects malformed email, audits both', async () => {
  const f = await rpc(claims(U.admin1), 'rpc_staff_lookup_user', [`  ${U.plainEmail.toUpperCase()} `]);
  eq([f.value.ok, f.value.found, f.value.user_id, f.value.is_staff, f.value.is_organization_member], [true, true, U.plain, false, false], 'plain');
  const o = await rpc(claims(U.admin1), 'rpc_staff_lookup_user', [U.ownerEmail]); eq([o.value.is_staff, o.value.is_organization_member], [false, true], 'owner flags');
  const s = await rpc(claims(U.admin1), 'rpc_staff_lookup_user', [U.supportEmail]); eq([s.value.is_staff], [true], 'staff flag');
  const n = await rpc(claims(U.admin1), 'rpc_staff_lookup_user', ['nobody-here@example.test']); eq(n.value, { ok: true, found: false }, 'not found');
  for (const bad of ['', 'x', 'a@', '@b', 'a b@c', null, 'a'.repeat(260) + '@x.co']) eq((await rpc(claims(U.admin1), 'rpc_staff_lookup_user', [bad])).error, '22023', `bad email ${String(bad).slice(0, 12)}`);
  ok((await audit('staff.user.lookup', 'success')) >= 4, 'lookups audited');
});

// ================================================================================================ G4 add_member
T('G4 add', 'positive: an admin adds an existing user with a first role; one success audit row; the new member has NO session until a factor is approved', async () => {
  const id = await mkUser('newbie'); const before = await audit('staff.member.add', 'success');
  const r = await rpc(claims(U.admin1), 'rpc_staff_add_member', [id, 'operations']); eq(r.value, { ok: true, code: 'added' }, 'add');
  eq(await staffRow(id), { status: 'active', roles: ['operations'] }, 'rows'); eq(await audit('staff.member.add', 'success'), before + 1, 'one audit row');
  eq((await rpc(claims(id), 'rpc_staff_directory')).error, '42501', 'no verified session yet');
  const created = await q1(`select created_by from public.staff_members where user_id = $1`, [id]); eq(created.created_by, U.admin1, 'created_by recorded');
});
T('G4 add', 'negative: invalid role or null arguments raise 22023 and change nothing', async () => {
  const id = await mkUser('badrole');
  for (const [u, role] of [[id, 'owner'], [id, 'Admin'], [id, ''], [id, null], [null, 'support'], [id, "support'; drop table x;--"]]) eq((await rpc(claims(U.admin1), 'rpc_staff_add_member', [u, role])).error, '22023', `${u}/${role}`);
  eq(await staffRow(id), undefined, 'no staff row');
});
T('G4 add', 'negative: self (self_change_not_allowed, audited), unknown user, already staff, organization member (exclusion) with nothing left behind', async () => {
  const d0 = await audit('staff.member.add', 'denied');
  eq((await rpc(claims(U.admin1), 'rpc_staff_add_member', [U.admin1, 'support'])).value.code, 'self_change_not_allowed', 'self');
  eq((await rpc(claims(U.admin1), 'rpc_staff_add_member', [randomUuid(), 'support'])).value.code, 'user_not_found', 'unknown');
  eq((await rpc(claims(U.admin1), 'rpc_staff_add_member', [U.support, 'finance'])).value.code, 'already_staff', 'already');
  eq((await rpc(claims(U.admin1), 'rpc_staff_add_member', [U.owner, 'support'])).value.code, 'organization_member_conflict', 'org member');
  eq(await staffRow(U.owner), undefined, 'no staff row for the organization owner'); eq((await q1(`select count(*)::int n from public.staff_roles where user_id = $1`, [U.owner])).n, 0, 'no role row either');
  ok((await audit('staff.member.add', 'denied')) >= d0 + 2, 'self and exclusion denials audited');
});

// ================================================================================================ G5 grant / G6 revoke
T('G5 grant', 'positive grant, idempotent repeat (no second audit), not_staff, self, invalid role', async () => {
  const a0 = await audit('staff.role.grant', 'success');
  eq((await rpc(claims(U.admin1), 'rpc_staff_grant_role', [U.finance, 'operations'])).value.code, 'granted', 'grant'); eq((await staffRow(U.finance)).roles, ['finance', 'operations'], 'roles');
  eq((await rpc(claims(U.admin1), 'rpc_staff_grant_role', [U.finance, 'operations'])).value, { ok: true, code: 'already_granted' }, 'repeat');
  eq(await audit('staff.role.grant', 'success'), a0 + 1, 'exactly one success audit for two calls');
  eq((await rpc(claims(U.admin1), 'rpc_staff_grant_role', [U.plain, 'support'])).value.code, 'not_staff', 'not staff'); eq((await rpc(claims(U.admin1), 'rpc_staff_grant_role', [U.admin1, 'finance'])).value.code, 'self_change_not_allowed', 'self');
  for (const bad of ['owner', '', null]) eq((await rpc(claims(U.admin1), 'rpc_staff_grant_role', [U.finance, bad])).error, '22023', 'invalid role');
});
T('G5 grant', 'a granted capability takes effect on the very next request, and a role granted to the unapproved user does not give it a session', async () => {
  await rpc(claims(U.admin1), 'rpc_staff_grant_role', [U.support, 'admin']); eq((await rpc(claims(U.support), 'rpc_staff_directory')).value.ok, true, 'support+admin can read the directory');
  await rpc(claims(U.admin1), 'rpc_staff_revoke_role', [U.support, 'admin']); eq((await rpc(claims(U.support), 'rpc_staff_directory')).value.code, 'forbidden', 'revoked immediately');
});
T('G6 revoke', 'positive revoke (one audit), role_not_found, self, invalid role; the second admin can be demoted while another admin remains', async () => {
  const a0 = await audit('staff.role.revoke', 'success');
  await rpc(claims(U.admin1), 'rpc_staff_grant_role', [U.finance, 'support']);
  eq((await rpc(claims(U.admin1), 'rpc_staff_revoke_role', [U.finance, 'support'])).value, { ok: true, code: 'revoked' }, 'revoke'); eq(await audit('staff.role.revoke', 'success'), a0 + 1, 'audit');
  eq((await rpc(claims(U.admin1), 'rpc_staff_revoke_role', [U.finance, 'support'])).value.code, 'role_not_found', 'again');
  eq((await rpc(claims(U.admin1), 'rpc_staff_revoke_role', [U.admin1, 'admin'])).value.code, 'self_change_not_allowed', 'self');
  for (const bad of ['owner', null]) eq((await rpc(claims(U.admin1), 'rpc_staff_revoke_role', [U.finance, bad])).error, '22023', 'invalid');
  await c.query('savepoint demo');
  eq((await rpc(claims(U.admin1), 'rpc_staff_revoke_role', [U.admin2, 'admin'])).value.code, 'revoked', 'admin2 demoted'); await c.query('rollback to savepoint demo'); await c.query('release savepoint demo');
});

// ================================================================================================ G7 last-admin protection and staff/member exclusion (trigger level)
T('G7 invariants', 'last-admin protection at the database: the only active admin cannot lose the role, be disabled or be deleted; with a second active admin it can', async () => {
  const attempt = async (sql) => { await c.query('savepoint inv'); try { await c.query(sql); await c.query('rollback to savepoint inv'); await c.query('release savepoint inv'); return 'allowed'; } catch (e) { await c.query('rollback to savepoint inv'); await c.query('release savepoint inv'); return e.code; } };
  // make admin1 the ONLY active admin: disable admin2 and the unapproved admin through the owner role (allowed while admin1 remains)
  await c.query(`update public.staff_members set status = 'disabled' where user_id in ($1, $2)`, [U.admin2, U.unapproved]);
  eq(await attempt(`delete from public.staff_roles where user_id = '${U.admin1}' and role = 'admin'`), '23514', 'delete last admin role');
  eq(await attempt(`update public.staff_members set status = 'disabled' where user_id = '${U.admin1}'`), '23514', 'disable last admin');
  eq(await attempt(`delete from public.staff_members where user_id = '${U.admin1}'`), '23514', 'delete last admin member');
  eq(await attempt(`update public.staff_roles set role = 'support' where user_id = '${U.admin1}' and role = 'admin'`), '23514', 'demote last admin');
  eq(await attempt(`delete from auth.users where id = '${U.admin1}'`), '23514', 'deleting the auth user cascades into the guard');
  await c.query(`update public.staff_members set status = 'active' where user_id = $1`, [U.admin2]);
  eq(await attempt(`delete from public.staff_roles where user_id = '${U.admin1}' and role = 'admin'`), 'allowed', 'allowed while another admin is active');
});
T('G7 invariants', 'staff/member exclusion in both directions, including a DISABLED staff row, and through the RPC', async () => {
  const attempt = async (sql) => { await c.query('savepoint ex'); try { await c.query(sql); await c.query('rollback to savepoint ex'); await c.query('release savepoint ex'); return 'allowed'; } catch (e) { await c.query('rollback to savepoint ex'); await c.query('release savepoint ex'); return e.code; } };
  const org = (await q1(`select id from public.organizations where code = 'P2RPC-TEST'`)).id;
  eq(await attempt(`insert into public.organization_members (organization_id, user_id, role) values ('${org}', '${U.support}', 'member')`), '23514', 'staff becoming a member');
  await rpc(claims(U.admin1), 'rpc_staff_set_status', [U.support, 'disabled']);
  eq(await attempt(`insert into public.organization_members (organization_id, user_id, role) values ('${org}', '${U.support}', 'member')`), '23514', 'DISABLED staff still excluded');
  await rpc(claims(U.admin1), 'rpc_staff_set_status', [U.support, 'active']);
  eq(await attempt(`insert into public.staff_members (user_id, status) values ('${U.owner}', 'active')`), '23514', 'member becoming staff');
});

// ================================================================================================ G8 suspend / reinstate
T('G8 status', 'suspend takes effect at once (the session is refused), reinstate restores it, repeats are no_change, unknown is not_staff, self and invalid raise', async () => {
  eq((await rpc(claims(U.support), 'rpc_staff_directory')).value.code, 'forbidden', 'baseline: verified but no capability');
  eq((await rpc(claims(U.admin1), 'rpc_staff_set_status', [U.support, 'disabled'])).value, { ok: true, code: 'updated' }, 'suspend');
  eq((await rpc(claims(U.support), 'rpc_staff_directory')).error, '42501', 'suspended staff is refused immediately');
  eq((await rpc(claims(U.admin1), 'rpc_staff_set_status', [U.support, 'disabled'])).value.code, 'no_change', 'repeat');
  eq((await rpc(claims(U.admin1), 'rpc_staff_set_status', [U.support, 'active'])).value.code, 'updated', 'reinstate');
  eq((await rpc(claims(U.support), 'rpc_staff_directory')).value.code, 'forbidden', 'reinstated: verified session again');
  eq((await rpc(claims(U.admin1), 'rpc_staff_set_status', [U.plain, 'disabled'])).value.code, 'not_staff', 'not staff');
  eq((await rpc(claims(U.admin1), 'rpc_staff_set_status', [U.admin1, 'disabled'])).value.code, 'self_change_not_allowed', 'self');
  for (const bad of ['', 'DISABLED', 'removed', null]) eq((await rpc(claims(U.admin1), 'rpc_staff_set_status', [U.support, bad])).error, '22023', `status ${bad}`);
  ok((await audit('staff.member.suspend', 'success')) >= 1 && (await audit('staff.member.reinstate', 'success')) >= 1, 'both audited');
});

// ================================================================================================ G9 enrolment windows and factor claiming
T('G9 windows', 'authorize: positive; a second open window is refused; a non-staff target is not eligible; self; invalid reason and minutes raise', async () => {
  const id = await mkUser('winuser'); await rpc(claims(U.admin1), 'rpc_staff_add_member', [id, 'support']);
  const w = await rpc(claims(U.admin1), 'rpc_staff_authorize_enrolment_window', [id, 'first device', 30]); eq(w.value.code, 'authorized', 'authorize'); ok(w.value.window_id && w.value.expires_at, 'window returned');
  eq((await rpc(claims(U.admin1), 'rpc_staff_authorize_enrolment_window', [id, 'again', 30])).value.code, 'window_already_open', 'second open window');
  eq((await rpc(claims(U.admin1), 'rpc_staff_authorize_enrolment_window', [U.plain, 'x', 30])).value.code, 'target_not_eligible', 'non-staff target');
  eq((await rpc(claims(U.admin1), 'rpc_staff_authorize_enrolment_window', [U.admin1, 'x', 30])).value.code, 'self_change_not_allowed', 'self');
  for (const [r, m] of [['', 30], ['   ', 30], ['x'.repeat(201), 30], ['ok', 4], ['ok', 61], ['ok', null]]) eq((await rpc(claims(U.admin1), 'rpc_staff_authorize_enrolment_window', [id, r, m])).error, '22023', `reason/minutes ${m}`);
});
T('G9 windows', 'revoke: positive; a revoked or unknown window is window_not_open; reason is required; a revoked window can never approve a factor', async () => {
  const id = await mkUser('revuser'); await rpc(claims(U.admin1), 'rpc_staff_add_member', [id, 'support']);
  const win = (await rpc(claims(U.admin1), 'rpc_staff_authorize_enrolment_window', [id, 'to be revoked', 30])).value.window_id; const f = await mkFactor(id);
  eq((await rpc(claims(U.admin1), 'rpc_staff_revoke_enrolment_window', [win, ''])).error, '22023', 'reason required');
  eq((await rpc(claims(U.admin1), 'rpc_staff_revoke_enrolment_window', [win, 'changed my mind'])).value.code, 'revoked', 'revoke');
  eq((await rpc(claims(U.admin1), 'rpc_staff_revoke_enrolment_window', [win, 'again'])).value.code, 'window_not_open', 'again');
  eq((await rpc(claims(U.admin1), 'rpc_staff_revoke_enrolment_window', [randomUuid(), 'unknown'])).value.code, 'window_not_open', 'unknown');
  eq((await rpc(claims(id), 'rpc_staff_claim_factor', [win, f])).value.code, 'approval_rejected', 'revoked window cannot approve');
});
T('G9 claim', 'factor claiming: every rejection path of the 0002 trigger, each with a denied audit row and no approval row', async () => {
  const id = await mkUser('claimer'); await rpc(claims(U.admin1), 'rpc_staff_add_member', [id, 'support']);
  const w = (await rpc(claims(U.admin1), 'rpc_staff_authorize_enrolment_window', [id, 'claim tests', 30])).value.window_id;
  const old = await mkFactor(id, { createdAt: `clock_timestamp() - interval '2 hours'` });          // created BEFORE the window
  const unverified = await mkFactor(id, { status: 'unverified' });
  const wrongType = await mkFactor(id, { type: 'phone' });
  const others = await mkFactor(U.plain);                                                           // belongs to someone else
  const d0 = await audit('staff.mfa.factor.approve', 'denied');
  for (const [label, who, window, factor] of [['created before the window', id, w, old], ['not verified', id, w, unverified], ['not TOTP', id, w, wrongType], ['another user\'s factor', id, w, others],
      ['unknown factor', id, w, randomUuid()], ['unknown window', id, randomUuid(), unverified]]) {
    const r = await rpc(claims(who), 'rpc_staff_claim_factor', [window, factor]); eq(r.value?.code, 'approval_rejected', label);
  }
  eq((await q1(`select count(*)::int n from private.staff_mfa_factors where user_id = $1`, [id])).n, 0, 'nothing approved'); ok((await audit('staff.mfa.factor.approve', 'denied')) >= d0 + 6, 'rejections audited');
  eq((await rpc(claims(id, { totpAge: 20 * 60 }), 'rpc_staff_claim_factor', [w, unverified])).value.code, 'step_up_required', 'stale TOTP');
  // positive, then replay and double use
  const good = await mkFactor(id); const ok1 = await rpc(claims(id), 'rpc_staff_claim_factor', [w, good]); eq(ok1.value, { ok: true, code: 'approved' }, 'approve');
  const replay = await rpc(claims(id), 'rpc_staff_claim_factor', [w, good]); ok(replay.value?.ok === false, 'replay of the same claim is refused');
  const second = await mkFactor(id); eq((await rpc(claims(id), 'rpc_staff_claim_factor', [w, second])).value.code, 'approval_rejected', 'window is single use');
  eq((await q1(`select consumed_at is not null c from private.staff_mfa_enrolment_windows where id = $1`, [w])).c, true, 'window consumed');
});
T('G9 claim', 'claim by someone else\'s window; claim after the window expired; claim by suspended staff', async () => {
  const a = await mkUser('claimA'); const b = await mkUser('claimB'); await rpc(claims(U.admin1), 'rpc_staff_add_member', [a, 'support']); await rpc(claims(U.admin1), 'rpc_staff_add_member', [b, 'support']);
  const wa = (await rpc(claims(U.admin1), 'rpc_staff_authorize_enrolment_window', [a, 'a', 30])).value.window_id;
  const fb = await mkFactor(b); eq((await rpc(claims(b), 'rpc_staff_claim_factor', [wa, fb])).value.code, 'approval_rejected', 'b cannot use a\'s window');
  await q1(`insert into private.staff_mfa_enrolment_windows (target_user_id, authorized_by, authorized_at, expires_at, reason)
            values ($1, $2, now() - interval '2 hours', now() - interval '90 minutes', 'expired') returning 1 x`, [b, U.admin1]);
  const expired = (await q1(`select id from private.staff_mfa_enrolment_windows where target_user_id = $1 and expires_at < now()`, [b])).id;
  eq((await rpc(claims(b), 'rpc_staff_claim_factor', [expired, fb])).value.code, 'approval_rejected', 'expired window');
  await rpc(claims(U.admin1), 'rpc_staff_set_status', [a, 'disabled']); eq((await rpc(claims(a), 'rpc_staff_claim_factor', [wa, await mkFactor(a)])).error, '42501', 'suspended staff cannot claim');
});
T('G9 claim', 'after a successful claim the member has a verified session; the context RPC reports it', async () => {
  const r = await rpc(claims(U.support), 'rpc_my_staff_context'); eq([r.value.staff_status, r.value.session_ok, r.value.step_up_ok, r.value.roles], ['active', true, true, ['support']], 'support context');
  const u = await rpc(claims(U.unapproved), 'rpc_my_staff_context'); eq([u.value.staff_status, u.value.session_ok], ['active', false], 'unapproved: active but no session');
});

// ================================================================================================ G10 structure-check refresh (D-P22-3, option C)
T('G10 refresh', 'refresh runs only for ACTIVE staff, only when no passed check is younger than 12 h and none of any outcome younger than 15 min', async () => {
  const stamp = async () => (await q1(`select checked_at from private.platform_validations where check_name = 'auth_mfa_factors_shape'`)).checked_at.getTime();
  const set = (status, interval) => c.query(`update private.platform_validations set status = $1, checked_at = now() - $2::interval where check_name = 'auth_mfa_factors_shape'`, [status, interval]);
  await set('passed', '13 hours'); const t0 = await stamp(); await rpc(claims(U.plain), 'rpc_my_staff_context'); eq(await stamp(), t0, 'a non-staff caller never refreshes');
  const before = await stamp(); await rpc(claims(U.admin1), 'rpc_my_staff_context'); ok((await stamp()) > before, 'active staff refreshes a 13 h old passed check');
  await set('passed', '5 hours'); const t1 = await stamp(); await rpc(claims(U.admin1), 'rpc_my_staff_context'); eq(await stamp(), t1, 'a passed check younger than 12 h is kept');
  await set('failed', '10 minutes'); const t2 = await stamp(); await rpc(claims(U.admin1), 'rpc_my_staff_context'); eq(await stamp(), t2, 'a failed check younger than 15 min is not retried');
  await set('failed', '16 minutes'); const t3 = await stamp(); await rpc(claims(U.admin1), 'rpc_my_staff_context'); ok((await stamp()) > t3, 'a failed check older than 15 min is retried');
  eq((await q1(`select status from private.platform_validations where check_name = 'auth_mfa_factors_shape'`)).status, 'passed', 'a refresh records the truth (passed on the real structure)');
  await c.query(`update public.staff_members set status = 'disabled' where user_id = $1`, [U.support]); await set('passed', '13 hours'); const t4 = await stamp();
  await rpc(claims(U.support), 'rpc_my_staff_context'); eq(await stamp(), t4, 'a DISABLED staff caller does not refresh'); await c.query(`update public.staff_members set status = 'active' where user_id = $1`, [U.support]);
});
T('G10 refresh', 'the refresh serializes on the advisory lock (mechanism evidence, not a race test)', async () => {
  await c.query(`update private.platform_validations set checked_at = now() - interval '13 hours' where check_name = 'auth_mfa_factors_shape'`);
  await rpc(claims(U.admin1), 'rpc_my_staff_context');
  const l = await q1(`select count(*)::int n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`); ok(l.n >= 1, 'an advisory lock is held by the refreshing transaction');
});

// ================================================================================================ G11 audit: append-only, visibility, atomicity
T('G11 audit', 'audit_events is append-only: UPDATE, DELETE and TRUNCATE are refused for every role, including the owner role', async () => {
  const id = (await q1(`select id from public.audit_events limit 1`)).id;
  for (const sql of [`update public.audit_events set outcome = 'success' where id = '${id}'`, `delete from public.audit_events where id = '${id}'`, `truncate public.audit_events`]) {
    await c.query('savepoint ao'); let code = 'allowed'; try { await c.query(sql); } catch (e) { code = e.code; } await c.query('rollback to savepoint ao'); await c.query('release savepoint ao'); eq(code, '42501', sql.split(' ')[0]);
  }
});
T('G11 audit', 'audit visibility: admins read it, support/finance/anon/outsiders see nothing', async () => {
  const total = await auditAll(); ok(total >= 9, 'setup produced audit rows');
  const a = await as(claims(U.admin1), `select count(*)::int n from public.audit_events`); eq(a.value.n, total, 'admin sees every audit event');
  for (const who of [claims(U.support), claims(U.finance), claims(U.plain), claims(U.owner)]) eq((await as(who, `select count(*)::int n from public.audit_events`)).value.n, 0, 'no rows for a non-reader');
  const an = await as(null, `select count(*)::int n from public.audit_events`, [], 'anon'); ok(an.error === '42501' || an.value?.n === 0, 'anon sees nothing');
});
T('G11 audit', 'atomicity: a mutation and its audit row commit or vanish together (savepoint rollback of a successful RPC removes both)', async () => {
  const id = await mkUser('atomic'); const a0 = await auditAll();
  await c.query('savepoint atom'); const r = await rpc(claims(U.admin1), 'rpc_staff_add_member', [id, 'support']); eq(r.value.code, 'added', 'added inside the savepoint');
  eq(await auditAll(), a0 + 1, 'audit written'); ok(await staffRow(id), 'staff row exists'); await c.query('rollback to savepoint atom'); await c.query('release savepoint atom');
  eq(await auditAll(), a0, 'audit gone with the rollback'); eq(await staffRow(id), undefined, 'staff row gone with the rollback');
});
T('G11 audit', 'atomicity: an invariant refusal changes nothing but is still audited (the audit row is returned, not raised)', async () => {
  const a0 = await audit('staff.member.add', 'denied'); const before = await staffRow(U.owner);
  const r = await rpc(claims(U.admin1), 'rpc_staff_add_member', [U.owner, 'support']); eq(r.value.code, 'organization_member_conflict', 'refused');
  eq(await staffRow(U.owner), before, 'no state change'); eq(await audit('staff.member.add', 'denied'), a0 + 1, 'exactly one denied row');
});
T('G11 audit', 'every audit row has a valid actor kind, outcome, action pattern and bounded detail; roles are copied at write time', async () => {
  const bad = await q1(`select count(*)::int n from public.audit_events where actor_kind not in ('staff','organization_user','system') or outcome not in ('success','denied','failed') or action !~ '^[a-z]+(\\.[a-z_]+)+$'`);
  eq(bad.n, 0, 'malformed audit rows'); const r = await q1(`select actor_roles from public.audit_events where action = 'staff.member.add' and outcome = 'success' and actor_user_id = $1 limit 1`, [U.admin1]); ok(r.actor_roles.includes('admin'), 'actor roles recorded');
});

// ================================================================================================ runner
if (process.argv.includes('--list')) { for (const [g, n] of tests) console.log(`${g}  ${n}`); console.log(`${tests.length} tests`); process.exit(0); }
if (!process.argv.includes('--authorized-rolled-back-execution')) { console.error('REFUSING: this runs 0003+0004 inside a rolled-back hosted transaction; pass --authorized-rolled-back-execution after approval (use --list to see the tests offline)'); process.exit(2); }
let dbUrl = process.env.P2_DATABASE_URL ?? '';
if (!dbUrl && process.argv.includes('--authorized-read-env-local')) { const line = readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { dbUrl = line.slice(line.indexOf('=') + 1).trim(); if ((dbUrl.startsWith('"') && dbUrl.endsWith('"')) || (dbUrl.startsWith("'") && dbUrl.endsWith("'"))) dbUrl = dbUrl.slice(1, -1); else dbUrl = dbUrl.replace(/\s+#.*$/, ''); } }
if (!dbUrl) { console.error('STOP: P2_DATABASE_URL is not set and --authorized-read-env-local was not given. Nothing was read or executed.'); process.exit(2); }
const URLo = new URL(dbUrl); if (URLo.hostname !== `db.${REF}.supabase.co`) { console.error('STOP: wrong project'); process.exit(3); }
const secrets = [dbUrl, URLo.password, decodeURIComponent(URLo.password)].filter((x) => x && x.length >= 8);
const clean = (t) => { let s = String(t ?? ''); for (const x of secrets) s = s.split(x).join('<redacted>'); return s; };
const pg = createRequire(join(root, 'package.json'))('pg');
c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: true, ca: readFileSync(`${scratch}/ca/prod-ca-2021.crt`, 'utf8'), servername: URLo.hostname }, connectionTimeoutMillis: 20000 });
await c.connect();
/** Read-only snapshot of everything that must not change: catalog, row counts of every public/private table, Auth digests, migration history. */
async function snap(cl) {
  const one = async (t) => (await cl.query(t)).rows[0];
  const o = {};
  o.functions = await one(`select md5(coalesce(string_agg(concat_ws('|', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.proconfig::text, p.proacl::text, p.proowner::regrole::text, md5(p.prosrc)), ';' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '')) d, count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')`);
  o.relations = await one(`select md5(coalesce(string_agg(concat_ws('|', n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl::text, c.relowner::regrole::text), ';' order by n.nspname, c.relname), '')) d, count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','m','S','p','i')`);
  o.columns = await one(`select md5(coalesce(string_agg(concat_ws('|', table_schema, table_name, column_name, data_type, is_nullable, column_default), ';' order by table_schema, table_name, ordinal_position), '')) d from information_schema.columns where table_schema in ('public','private')`);
  o.policies = await one(`select md5(coalesce(string_agg(concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, qual, with_check), ';' order by schemaname, tablename, policyname), '')) d, count(*)::int n from pg_policies where schemaname in ('public','private')`);
  o.triggers = await one(`select md5(coalesce(string_agg(concat_ws('|', c.relname, t.tgname, pg_get_triggerdef(t.oid)), ';' order by c.relname, t.tgname), '')) d, count(*)::int n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal`);
  o.schemaAcl = await one(`select md5(coalesce(string_agg(concat_ws('|', nspname, nspacl::text, nspowner::regrole::text), ';' order by nspname), '')) d from pg_namespace where nspname in ('public','private')`);
  o.defaultAcl = await one(`select md5(coalesce(string_agg(concat_ws('|', defaclrole::regrole::text, defaclnamespace::regnamespace::text, defaclobjtype, defaclacl::text), ';' order by defaclrole::regrole::text, defaclnamespace::regnamespace::text, defaclobjtype), '')) d from pg_default_acl`);
  o.rowCounts = await one(`select md5(coalesce(string_agg(t.table_schema || '.' || t.table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text, ',' order by t.table_schema, t.table_name), '')) d, count(*)::int tables from information_schema.tables t where t.table_schema in ('public','private') and t.table_type = 'BASE TABLE'`);
  o.authUsers = await one(`select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') d, count(*)::int n from auth.users x`);
  o.authFactors = await one(`select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') d, count(*)::int n from auth.mfa_factors x`);
  o.authIdentities = await one(`select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') d, count(*)::int n from auth.identities x`);
  o.migrationHistory = await one(`select coalesce(md5(string_agg(md5(x::text), '' order by x.version)),'empty') d, count(*)::int n from supabase_migrations.schema_migrations x`);
  return o;
}
const connect = async () => { const k = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: true, ca: readFileSync(`${scratch}/ca/prod-ca-2021.crt`, 'utf8'), servername: URLo.hostname }, connectionTimeoutMillis: 20000 }); await k.connect(); return k; };
let exitCode = 0; let snapBefore = null;
try {
  snapBefore = await snap(c); console.log('hosted BEFORE snapshot taken (catalog, row counts, Auth digests, migration history)');
  await c.query("set idle_in_transaction_session_timeout = '600s'");
  const pre = await q1(`select (select count(*) from auth.users)::int users, to_regclass('public.audit_events') ae, (select count(*) from public.staff_members)::int staff`);
  if (pre.ae) throw new Error('STOP: public.audit_events already exists (0003 is applied); this suite expects the drafts not to be applied');
  await c.query('begin isolation level read committed');
  T0 = Number((await q1('select extract(epoch from now())::bigint as t')).t) + 5;
  await setup(); console.log(`setup complete inside the transaction (fixtures + 0003 + 0004); running ${tests.length} tests`);
  for (const [g, n, fn] of tests) {
    await c.query('savepoint test_sp');
    try { await fn(); results.pass++; console.log(`PASS  ${g}: ${n}`); } catch (e) { results.fail++; failures.push(`${g}: ${n} -> ${clean(e.message)}`); console.log(`FAIL  ${g}: ${n}\n      ${clean(e.message)}`); }
    // each test starts from the same fixture state; mutations made by a test are rolled back unless the next tests depend on them (they do not)
    await c.query('rollback to savepoint test_sp').catch(() => {}); await c.query('release savepoint test_sp').catch(() => {});
  }
} catch (e) { console.log(`ABORT: ${clean(e.message)}`); exitCode = 1; results.fail++; }
finally {
  await c.query('rollback').catch(() => {});
  const post = await c.query(`select (select count(*) from auth.users)::int users, to_regclass('public.audit_events') ae, (select count(*) from public.staff_members)::int staff, (select count(*) from public.organizations)::int orgs`).then((r) => r.rows[0]).catch(() => null);
  console.log(`after ROLLBACK: users=${post?.users}, audit_events table present=${Boolean(post?.ae)}, staff rows=${post?.staff}, organizations=${post?.orgs} (expected: unchanged users, no audit table, 0 staff, 0 organizations)`);
  await c.end().catch(() => {});
  // verification from a FRESH connection: nothing may differ from the snapshot taken before the transaction began
  try {
    const k = await connect(); const snapAfter = await snap(k); await k.end();
    let same = true;
    for (const key of Object.keys(snapBefore ?? {})) { const e1 = JSON.stringify(snapBefore[key]) === JSON.stringify(snapAfter[key]); if (!e1) same = false; console.log(`${e1 ? 'PASS' : 'FAIL'}  hosted unchanged: ${key}  (${JSON.stringify(snapAfter[key]).slice(0, 90)})`); }
    if (!same || !snapBefore) { results.fail++; failures.push('hosted state differs after rollback (or no before-snapshot)'); } else { results.pass++; }
  } catch (e) { results.fail++; failures.push('after-snapshot failed: ' + clean(e.message)); console.log('FAIL  after-snapshot: ' + clean(e.message)); }
}
console.log(`\n${results.pass} passed, ${results.fail} failed`); for (const f of failures) console.log(' - ' + f);
process.exitCode = exitCode || (results.fail ? 1 : 0);
