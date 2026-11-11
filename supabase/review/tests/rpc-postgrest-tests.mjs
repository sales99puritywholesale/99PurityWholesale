// REAL-TOKEN tests of the staff RPC surface through PostgREST with sessions issued by Supabase Auth (GoTrue). Needs migrations 0003+0004 to be APPLIED
// on the hosted dev project (it refuses otherwise). Creates no staff records, no organizations, no MFA windows: only DISPOSABLE Auth users that are
// removed at the end. What it proves that the transactional suite cannot: the HTTP status mapping, the anon key, real JWTs (aal1, and aal2 reached with an
// UNAPPROVED factor), schema exposure (private is not reachable) and that error bodies do not leak internals.
//   --authorized-read-env-local               allow reading ONLY the P2_DATABASE_URL line of .env.local (else the environment variable)
//   --authorized-read-anon-key-from-env-local allow reading ONLY the NEXT_PUBLIC_SUPABASE_ANON_KEY line of .env.local (else the environment variable)
//   --list                                    offline: print the checks
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const scratch = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
const REF = 'semtmllmwhxznxechfsk'; const API = `https://${REF}.supabase.co`;
const REGISTRY = `${scratch}/postgrest-rpc-test-registry.json`; const EMAIL_RE = /^p2test-postgrest-[0-9a-f]{10}@example\.test$/;
const RPCS = { rpc_staff_directory: {}, rpc_my_staff_context: {}, rpc_staff_lookup_user: { p_email: 'x@example.test' }, rpc_staff_add_member: { p_user_id: '00000000-0000-4000-8000-000000000001', p_role: 'support' },
  rpc_staff_grant_role: { p_user_id: '00000000-0000-4000-8000-000000000001', p_role: 'support' }, rpc_staff_revoke_role: { p_user_id: '00000000-0000-4000-8000-000000000001', p_role: 'support' },
  rpc_staff_set_status: { p_user_id: '00000000-0000-4000-8000-000000000001', p_status: 'disabled' },
  rpc_staff_authorize_enrolment_window: { p_target_user_id: '00000000-0000-4000-8000-000000000001', p_reason: 'x', p_minutes: 30 },
  rpc_staff_revoke_enrolment_window: { p_window_id: '00000000-0000-4000-8000-000000000001', p_reason: 'x' },
  rpc_staff_claim_factor: { p_window_id: '00000000-0000-4000-8000-000000000001', p_factor_id: '00000000-0000-4000-8000-000000000002' } };
if (process.argv.includes('--list')) { for (const n of Object.keys(RPCS)) console.log(`${n}: anon, authenticated aal1, authenticated aal2 (unapproved factor)`); console.log('plus: private schema not exposed, audit_events not readable/writable by anon or non-readers, no service-role path'); process.exit(0); }

const envLine = (name) => { const line = readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/).find((l) => new RegExp(`^\\s*(export\\s+)?${name}\\s*=`).test(l)); if (!line) return ''; let v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, ''); return v; };
const dbUrl = process.env.P2_DATABASE_URL || (process.argv.includes('--authorized-read-env-local') ? envLine('P2_DATABASE_URL') : '');
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || (process.argv.includes('--authorized-read-anon-key-from-env-local') ? envLine('NEXT_PUBLIC_SUPABASE_ANON_KEY') : '');
if (!dbUrl || !anon) { console.log('STOP: P2_DATABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be in the environment, or the explicit --authorized-read-* flags given. Nothing was read or created.'); process.exit(2); }
const U = new URL(dbUrl); if (U.hostname !== `db.${REF}.supabase.co`) { console.log('STOP: wrong project'); process.exit(3); }
const secrets = [dbUrl, U.password, decodeURIComponent(U.password), anon].filter((x) => x && x.length >= 8);
const clean = (t) => { let s = String(t ?? ''); for (const x of secrets) s = s.split(x).join('<redacted>'); return s.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '<jwt>'); };
const { totp, nextStep } = await import(pathToFileURL(`${root}/tests/db/lib/totp.mjs`).href);
const pg = createRequire(join(root, 'package.json'))('pg');
const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: true, ca: readFileSync(`${scratch}/ca/prod-ca-2021.crt`, 'utf8'), servername: U.hostname }, connectionTimeoutMillis: 20000 }); await db.connect();
const results = []; const rep = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + clean(d) + ')' : ''}`); };

const have = (await db.query(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = any($1)`, [Object.keys(RPCS)])).rows[0].n;
if (have !== Object.keys(RPCS).length) { console.log(`STOP: ${have}/10 staff RPCs exist: migrations 0003+0004 are not applied; these tests need them. Nothing was created.`); await db.end(); process.exit(2); }
const staffBefore = (await db.query(`select (select count(*) from public.staff_members)::int s, (select count(*) from public.organizations)::int o`)).rows[0];
// integrity snapshot: every pre-existing Auth user, identity and factor, plus every table a staff RPC could touch
const INTEGRITY = `select (select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') from auth.users x) users_d, (select count(*)::int from auth.users) users_n,
  (select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') from auth.mfa_factors x) factors_d, (select count(*)::int from auth.mfa_factors) factors_n,
  (select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') from auth.identities x) ident_d,
  (select count(*)::int from public.audit_events) audit_n, (select count(*)::int from public.staff_members) staff_n, (select count(*)::int from public.staff_roles) roles_n,
  (select count(*)::int from private.staff_mfa_enrolment_windows) win_n, (select count(*)::int from private.staff_mfa_factors) appr_n, (select count(*)::int from public.organizations) org_n,
  (select coalesce(md5(string_agg(md5(x::text), '' order by x.check_name)),'empty') from private.platform_validations x) pv_d, (select count(*)::int from supabase_migrations.schema_migrations) hist_n`;
const integrityBefore = (await db.query(INTEGRITY)).rows[0];

async function http(path, { method = 'POST', token = anon, body, headers = {} } = {}) {
  const r = await fetch(`${API}${path}`, { method, headers: { apikey: anon, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  let text = ''; try { text = await r.text(); } catch { /* empty */ } let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}
const gotrue = (path, o = {}) => http(`/auth/v1${path}`, { ...o, token: o.token ?? anon });
const claimsOf = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return {}; } };
const LEAK = /select |insert |from public\.|private\.|search_path|stack|pg_|postgres(?:ql)?:\/\/|auth\.users/i;

let acc = null;
try {
  const email = `p2test-postgrest-${randomBytes(5).toString('hex')}@example.test`; const password = randomBytes(18).toString('base64url') + 'aA1!';
  const ins = await db.query(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, extensions.crypt($2, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '') returning id`, [email, password]);
  acc = { id: ins.rows[0].id, email }; writeFileSync(REGISTRY, JSON.stringify(acc));
  await db.query(`insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) values (gen_random_uuid(), $1::uuid, jsonb_build_object('sub', ($1::uuid)::text, 'email', $2::text, 'email_verified', true), 'email', ($1::uuid)::text, now(), now(), now())`, [acc.id, email]);
  const s1 = await gotrue('/token?grant_type=password', { body: { email, password } }); const aal1 = s1.json.access_token; rep('disposable user signs in: token is aal1', claimsOf(aal1).aal === 'aal1');
  const f = await gotrue('/factors', { token: aal1, body: { factor_type: 'totp', friendly_name: 'p2-postgrest' } }); const ch = await gotrue(`/factors/${f.json.id}/challenge`, { token: aal1, body: {} });
  const v = await gotrue(`/factors/${f.json.id}/verify`, { token: aal1, body: { challenge_id: ch.json.id, code: totp(f.json.totp.secret) } }); const aal2 = v.json.access_token;
  rep('the same user reaches aal2 with a factor that NO staff window approved', claimsOf(aal2).aal === 'aal2');
  for (const [name, args] of Object.entries(RPCS)) {
    const a = await http(`/rest/v1/rpc/${name}`, { body: args }); rep(`${name}: anon key only is refused`, [401, 403].includes(a.status) && !LEAK.test(a.text), `HTTP ${a.status} ${clean(a.json?.code ?? '')}`);
    const ctx = name === 'rpc_my_staff_context'; const okB = ctx ? (b) => b.status === 200 && b.json?.staff_status === 'none' && b.json?.session_ok === false : (b) => b.status === 403;
    const b = await http(`/rest/v1/rpc/${name}`, { token: aal1, body: args }); rep(`${name}: authenticated aal1 non-staff is ${ctx ? 'told staff_status none, session_ok false (own-state read, no refusal by design)' : 'refused (403)'}`, okB(b) && !LEAK.test(b.text), `HTTP ${b.status} ${clean(b.json?.code ?? '')}`);
    const c2 = await http(`/rest/v1/rpc/${name}`, { token: aal2, body: args }); rep(`${name}: aal2 reached with an UNAPPROVED factor, non-staff, is ${ctx ? 'told staff_status none, session_ok false' : 'refused (403)'}`, okB(c2) && !LEAK.test(c2.text), `HTTP ${c2.status} ${clean(c2.json?.code ?? '')}`);
  }
  const cases = [
    ['private schema is not exposed', await http('/rest/v1/rate_limits?select=*', { method: 'GET', token: aal2, headers: { 'accept-profile': 'private' } }), [404, 406]],
    ['private function is not callable as an RPC', await http('/rest/v1/rpc/staff_session_ok', { token: aal2, body: {} }), [404]],
    ['write_audit is not callable as an RPC', await http('/rest/v1/rpc/write_audit', { token: aal2, body: {} }), [404]],
    ['audit_events: anon cannot read', await http('/rest/v1/audit_events?select=*', { method: 'GET' }), [401, 403, 404]],
    ['audit_events: a non-reader gets no rows', await http('/rest/v1/audit_events?select=*', { method: 'GET', token: aal2 }), [200]],
    ['audit_events: insert is refused', await http('/rest/v1/audit_events', { token: aal2, body: { action: 'x.y', actor_kind: 'staff', outcome: 'success' } }), [401, 403, 404]],
    ['audit_events: delete is refused', await http('/rest/v1/audit_events?id=not.is.null', { method: 'DELETE', token: aal2 }), [401, 403, 404]],
    ['staff_members: insert is refused', await http('/rest/v1/staff_members', { token: aal2, body: { user_id: acc.id, status: 'active' } }), [401, 403, 404]],
    ['staff_roles: insert is refused', await http('/rest/v1/staff_roles', { token: aal2, body: { user_id: acc.id, role: 'admin' } }), [401, 403, 404]],
  ];
  for (const [label, r, ok] of cases) { const body = r.text.replace(/"hint":"Grant the required privileges[^"]*"/g, '').replace(/permission denied for (table|function|schema) [a-z_]+/gi, ''); const leak = LEAK.test(body); rep(label, ok.includes(r.status) && !leak, `HTTP ${r.status}${leak ? ' LEAK-PATTERN in body: ' + clean(r.text).slice(0, 160) : ''}`); }
  const aud = cases[4][1]; rep('audit_events: the non-reader body is an empty list', Array.isArray(aud.json) && aud.json.length === 0);
  const sm = await http('/rest/v1/staff_members?select=*', { method: 'GET', token: aal2 }); rep('staff_members: a non-staff user reads no rows', sm.status === 200 && Array.isArray(sm.json) && sm.json.length === 0, `HTTP ${sm.status}`);
} catch (e) { rep('test run', false, e.message); }
finally {
  try {
    if (acc && EMAIL_RE.test(acc.email)) { await db.query(`delete from auth.users where id = $1::uuid and email = $2`, [acc.id, acc.email]); const left = (await db.query(`select (select count(*) from auth.users where id = $1::uuid)::int u, (select count(*) from auth.mfa_factors where user_id = $1::uuid)::int f`, [acc.id])).rows[0]; rep('cleanup: the disposable user and its factor are gone', left.u === 0 && left.f === 0); }
    if (existsSync(REGISTRY)) unlinkSync(REGISTRY);
    const after = (await db.query(`select (select count(*) from public.staff_members)::int s, (select count(*) from public.organizations)::int o`)).rows[0]; rep('no staff members or organizations were created', after.s === staffBefore.s && after.o === staffBefore.o);
    const ia = (await db.query(INTEGRITY)).rows[0];
    rep('ALL original Auth users, identities and MFA factors are identical to before (digests and counts)', ia.users_d === integrityBefore.users_d && ia.users_n === integrityBefore.users_n && ia.factors_d === integrityBefore.factors_d && ia.factors_n === integrityBefore.factors_n && ia.ident_d === integrityBefore.ident_d, `users ${integrityBefore.users_n}->${ia.users_n}, factors ${integrityBefore.factors_n}->${ia.factors_n}`);
    rep('audit behavior: refused outsider calls wrote NO audit rows (audit_events count unchanged)', ia.audit_n === integrityBefore.audit_n, `${integrityBefore.audit_n}->${ia.audit_n}`);
    rep('no staff role, enrolment window, approved factor or organization appeared; structure-check record and migration history unchanged', ia.staff_n === integrityBefore.staff_n && ia.roles_n === integrityBefore.roles_n && ia.win_n === integrityBefore.win_n && ia.appr_n === integrityBefore.appr_n && ia.org_n === integrityBefore.org_n && ia.pv_d === integrityBefore.pv_d && ia.hist_n === integrityBefore.hist_n);
  } catch (e) { rep('cleanup', false, e.message + ' (registry kept)'); }
  await db.end().catch(() => {});
}
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed'); process.exitCode = failed ? 1 : 0;
