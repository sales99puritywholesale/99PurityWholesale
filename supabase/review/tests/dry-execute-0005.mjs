// ONE controlled, ROLLED-BACK execution of migration 0005 rev3 against the hosted development project (ref semtmllmwhxznxechfsk).
// Only 0005 is executed (0001 to 0004 are applied). One transaction; guaranteed rollback on success AND failure; no migration history row; nothing persistent.
// No Auth users, staff, organizations, enrolment windows or recovery codes are created (the functional checks use a made-up caller id that exists nowhere).
//   --authorized-rolled-back-execution (required)   --authorized-read-env-local (database URL line only, in memory)
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const scratch = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
const FILE = process.env.P2_DRY_FILE || join(root, 'supabase/review/0005_rate_limits_and_owner_mfa.sql');
const EXPECTED_SHA = process.env.P2_DRY_EXPECTED_SHA || '8548e27e7c800d9d38f8bb6dca1dcb11f7755785b1e6fa0f0616120f05443e8d';
const REF = 'semtmllmwhxznxechfsk'; const CA_FILE = `${scratch}/ca/prod-ca-2021.crt`; const CA_SHA256 = '807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA';
const LOG = `${scratch}/dry-execute-0005-log.txt`;
const results = []; const note = (s) => { console.log(s); try { appendFileSync(LOG, s + '\n'); } catch { /* best effort */ } };
const rep = (n, ok, d = '') => { results.push({ n, ok }); note(`${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };
const eqSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
if (!process.argv.includes('--authorized-rolled-back-execution')) { console.log('REFUSING: needs --authorized-rolled-back-execution'); process.exit(2); }

// ---- 1. the exact file
const bytes = readFileSync(FILE); const sha = createHash('sha256').update(bytes).digest('hex');
rep('0005 file sha256 equals the approved hash', sha === EXPECTED_SHA, sha.slice(0, 16) + '…');
rep('file is LF-only', !bytes.includes(13));
const sql = bytes.toString('utf8');
// ---- 2. static guard: the file must contain no transaction control and nothing that cannot run inside a transaction
const code = sql.replace(/\$\$[\s\S]*?\$\$/g, '$$$$').replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");
const forbidden = [/\bcommit\b/i, /\brollback\b/i, /\bbegin\b/i, /\bend\s+transaction\b/i, /\bsavepoint\b/i, /\bvacuum\b/i, /\bcreate\s+(unique\s+)?index\s+concurrently\b/i, /\bcreate\s+extension\b/i, /\balter\s+system\b/i, /\bcreate\s+database\b/i, /\bset\s+session\b/i, /\bset\s+role\b/i];
const hit = forbidden.filter((r) => r.test(code)).map(String);
rep('static guard: no transaction control, VACUUM, CONCURRENTLY, extension, system or session statement outside function bodies', hit.length === 0, hit.join(' '));
rep('static guard: the file never touches supabase_migrations (no migration history row can be written)', !/supabase_migrations/i.test(code));
if (results.some((r) => r.ok === false)) { note('STOP: pre-checks failed; nothing was executed'); process.exit(3); }

// ---- credentials, TLS
let v = process.env.P2_DATABASE_URL ?? '';
if (!v && process.argv.includes('--authorized-read-env-local')) { const line = readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, ''); } }
if (!v) { console.log('STOP: P2_DATABASE_URL not set and --authorized-read-env-local not given'); process.exit(2); }
const U = new URL(v); const secrets = [v, U.password, decodeURIComponent(U.password)].filter((x) => x && x.length >= 4);
const clean = (t) => { let s = String(t ?? ''); for (const x of secrets) s = s.split(x).join('<redacted>'); return s.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://<redacted>'); };
const m = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(U.hostname);
rep('URL host is db.<ref>.supabase.co and the project ref equals the expected ref', Boolean(m) && m[1] === REF, m?.[1] ?? U.hostname);
rep('URL user postgres, database postgres, port 5432', decodeURIComponent(U.username) === 'postgres' && U.pathname === '/postgres' && (U.port || '5432') === '5432');
const pem = readFileSync(CA_FILE, 'utf8'); rep('pinned CA fingerprint matches the recorded Supabase Root 2021 CA', new X509Certificate(pem).fingerprint256.replace(/:/g, '') === CA_SHA256);
if (results.some((r) => r.ok === false)) { note('STOP: identity or CA check failed'); process.exit(3); }
const pg = createRequire(join(root, 'package.json'))('pg');
const connect = async () => { const k = new pg.Client({ connectionString: v, ssl: { rejectUnauthorized: true, ca: pem, servername: U.hostname }, application_name: 'p2-dry-execute-0005', connectionTimeoutMillis: 20000 }); await k.connect(); return k; };

// ---- snapshot
async function snapshot(c) {
  const kv = async (q) => Object.fromEntries((await c.query(q)).rows.map((r) => [r.k, r.v]));
  const one = async (q) => (await c.query(q)).rows[0]; const S = {};
  S.functions = await kv(`select p.oid::regprocedure::text k, md5(concat_ws('|', p.prosrc, p.prosecdef, p.proconfig::text, p.proacl::text, p.proowner::regrole::text, p.provolatile)) v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')`);
  S.relations = await kv(`select n.nspname || '.' || c.relname k, md5(concat_ws('|', c.relkind, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.relowner::regrole::text)) v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','m','S','p','i')`);
  S.columns = await kv(`select table_schema || '.' || table_name || '.' || column_name k, md5(concat_ws('|', data_type, is_nullable, column_default)) v from information_schema.columns where table_schema in ('public','private')`);
  S.constraints = await kv(`select c.conrelid::regclass::text || '.' || c.conname k, md5(pg_get_constraintdef(c.oid)) v from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('public','private')`);
  S.policies = await kv(`select schemaname || '.' || tablename || '.' || policyname k, md5(concat_ws('|', cmd, roles::text, qual, with_check)) v from pg_policies where schemaname in ('public','private')`);
  S.triggers = await kv(`select c.oid::regclass::text || '.' || t.tgname k, md5(pg_get_triggerdef(t.oid)) v from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal`);
  S.rowCounts = await kv(`select t.table_schema || '.' || t.table_name k, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text v from information_schema.tables t where t.table_schema in ('public','private') and t.table_type = 'BASE TABLE'`);
  S.rowDigests = {}; for (const t of ['public.capabilities', 'public.role_capabilities', 'private.platform_validations', 'public.staff_members', 'public.staff_roles', 'public.organizations', 'public.organization_members']) S.rowDigests[t] = (await one(`select coalesce(md5(string_agg(md5(x::text), '' order by md5(x::text))),'empty') d, count(*)::int n from ${t} x`));
  S.schemaAcl = await kv(`select nspname k, concat_ws('|', nspacl::text, nspowner::regrole::text) v from pg_namespace where nspname in ('public','private','auth')`);
  S.defaultAcl = await kv(`select concat_ws('.', defaclrole::regrole::text, coalesce(defaclnamespace::regnamespace::text,''), defaclobjtype::text) k, defaclacl::text v from pg_default_acl`);
  S.schemas = (await c.query(`select nspname from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' order by 1`)).rows.map((r) => r.nspname);
  S.auth = {}; for (const t of ['users', 'identities', 'mfa_factors']) S.auth[t] = await one(`select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') d, count(*)::int n from auth.${t} x`);
  S.history = (await c.query(`select version, name from supabase_migrations.schema_migrations order by version`)).rows.map((r) => `${r.version}:${r.name}`);
  return S;
}
const diff = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return { added: kb.filter((k) => !(k in a)).sort(), removed: ka.filter((k) => !(k in b)).sort(), changed: ka.filter((k) => k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort() }; };

const NEW_FN = { private: ['rate_limit_hit', 'rate_limit_clear', 'consume_nonce', 'owner_factor_state', 'rl_user_key', 'owner_mfa_ok', 'my_mfa_owner_org_ids', 'guard_owner_mfa_window_insert', 'guard_owner_mfa_window_update', 'guard_owner_mfa_factor_insert', 'guard_owner_mfa_factor_update', 'guard_owner_recovery_code_update', 'guard_owner_recovery_request_update'],
  public: ['rpc_throttle_password_recovery', 'rpc_my_owner_context', 'rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_set_recovery_codes', 'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel', 'rpc_staff_authorize_owner_mfa_window', 'rpc_staff_owner_mfa_overview'] };
const DEFINERS = ['rate_limit_hit', 'rate_limit_clear', 'consume_nonce', 'owner_factor_state', 'owner_mfa_ok', 'my_mfa_owner_org_ids', 'guard_owner_mfa_window_insert', 'guard_owner_mfa_factor_insert', ...NEW_FN.public];
const NEW_TABLES = ['private.rate_limit_policies', 'private.rate_limits', 'private.used_nonces', 'private.owner_mfa_windows', 'private.owner_mfa_factors', 'private.owner_recovery_codes', 'private.owner_recovery_requests'];
const hex = (b) => '\\x' + Buffer.from(b).toString('hex');

let tx = null; let before = null; let exitCode = 0; let inTx = null;
try {
  const c0 = await connect(); before = await snapshot(c0); await c0.end(); note('BEFORE snapshot taken (fresh connection)');
  rep('PRE-STATE: migration history is exactly the four applied versions', JSON.stringify(before.history) === JSON.stringify(['20261108000001:foundation_identity', '20261108000002:staff_capabilities', '20261108000003:audit_and_step_up', '20261108000004:staff_management_rpcs']), before.history.join(','));
  rep('PRE-STATE: none of the 0005 objects exist (22 functions, 7 tables, 1 capability)', NEW_FN.private.every((n) => !Object.keys(before.functions).some((k) => k.startsWith(`private.${n}(`))) && NEW_TABLES.every((t) => !(t in before.relations)) && before.rowDigests['public.capabilities'].n === 27);
  if (results.some((r) => r.ok === false)) throw new Error('pre-state check failed; nothing executed');

  tx = await connect(); await tx.query('begin isolation level read committed');
  await tx.query("set local idle_in_transaction_session_timeout = '600s'"); await tx.query("set local statement_timeout = '120s'");
  note('transaction open; executing 0005 (ONE statement batch, no history insert)');
  try { await tx.query(sql); rep('0005 executed inside the transaction (its own self-check DO block passed)', true); } catch (e) { rep('0005 execution', false, `${clean(e.message)} [${e.code ?? ''}]`); throw e; }

  // ---- observations inside the transaction
  inTx = await snapshot(tx);
  for (const k of ['functions', 'relations', 'columns', 'constraints', 'policies', 'triggers', 'rowCounts', 'defaultAcl']) {
    const d = diff(before[k], inTx[k]); rep(`in-transaction diff ${k}: nothing removed`, d.removed.length === 0, `added ${d.added.length}, changed ${d.changed.length}${d.changed.length ? ': ' + d.changed.slice(0, 4).join('; ') : ''}`);
    if (k === 'functions') { rep('functions added: exactly the 22 of 0005', eqSet(d.added.map((s) => s.replace(/\(.*$/, '').replace(/^public\./, 'public.')).map((s) => (s.includes('.') ? s : 'public.' + s)), [...NEW_FN.private.map((n) => `private.${n}`), ...NEW_FN.public.map((n) => `public.${n}`)]), `${d.added.length}`); rep('functions changed: only private.my_owner_org_ids() (its grant to authenticated is revoked)', d.changed.length === 1 && d.changed[0].includes('my_owner_org_ids'), d.changed.join(',')); }
    if (k === 'policies') rep('policies changed: exactly the two owner policies; none added or removed', eqSet(d.changed, ['public.organization_billing.organization_billing_select_owner', 'public.organization_invites.organization_invites_select_owner']) && d.added.length === 0);
    if (k === 'triggers') rep('triggers added: exactly 10, on the four new owner tables', d.added.length === 10 && d.added.every((t) => /owner_(mfa|recovery)_/.test(t)) && d.changed.length === 0, `${d.added.length}`);
    if (k === 'rowCounts') rep('row counts: only the 7 new tables appear; the only pre-existing counts that change are capabilities and role_capabilities (one new capability, one admin mapping)', eqSet(d.added, NEW_TABLES) && eqSet(d.changed, ['public.capabilities', 'public.role_capabilities']) && inTx.rowCounts['private.rate_limit_policies'] === '6' && NEW_TABLES.filter((t) => t !== 'private.rate_limit_policies').every((t) => inTx.rowCounts[t] === '0'));
    if (k === 'defaultAcl') rep('default privileges unchanged', d.added.length === 0 && d.changed.length === 0);
  }
  rep('capabilities: 28 rows, admin 28 role rows, owner.mfa.authorize held by admin only; other roles unchanged', inTx.rowDigests['public.capabilities'].n === 28 && (await tx.query(`select (select count(*)::int from public.role_capabilities where role='admin') a, (select count(*)::int from public.role_capabilities where role='finance') f, (select count(*)::int from public.role_capabilities where role='operations') o, (select count(*)::int from public.role_capabilities where role='support') s, (select count(*)::int from public.role_capabilities where capability_code='owner.mfa.authorize') n, (select count(*)::int from public.role_capabilities where capability_code='owner.mfa.authorize' and role='admin') na`)).rows.map((r) => `${r.a},${r.f},${r.o},${r.s},${r.n},${r.na}`)[0] === '28,8,7,8,1,1');
  for (const t of ['private.platform_validations', 'public.staff_members', 'public.staff_roles', 'public.organizations', 'public.organization_members']) rep(`unrelated data unchanged in the transaction: ${t}`, JSON.stringify(before.rowDigests[t]) === JSON.stringify(inTx.rowDigests[t]));
  for (const t of ['users', 'identities', 'mfa_factors']) rep(`auth.${t} untouched in the transaction`, JSON.stringify(before.auth[t]) === JSON.stringify(inTx.auth[t]));

  // function properties, grants, ownership
  const fnRows = (await tx.query(`select n.nspname s, p.proname f, p.prosecdef d, p.proconfig cfg, p.proowner::regrole::text o, p.proacl::text acl, has_function_privilege('anon', p.oid, 'execute') an, has_function_privilege('authenticated', p.oid, 'execute') au, has_function_privilege('service_role', p.oid, 'execute') sr, has_function_privilege('public', p.oid, 'execute') pu from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')`)).rows;
  const bad = []; const expAcl = (s, f) => { if (s === 'private') return f === 'my_mfa_owner_org_ids' ? '{postgres=X/postgres,authenticated=X/postgres}' : '{postgres=X/postgres}'; return f === 'rpc_throttle_password_recovery' ? '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}' : '{postgres=X/postgres,authenticated=X/postgres}'; };
  for (const s of ['private', 'public']) for (const f of NEW_FN[s]) {
    const r = fnRows.find((x) => x.s === s && x.f === f); if (!r) { bad.push(`${s}.${f} missing`); continue; }
    if (r.o !== 'postgres') bad.push(`${f} owner ${r.o}`); if (r.d !== DEFINERS.includes(f)) bad.push(`${f} secdef=${r.d}`);
    if (!(r.cfg ?? []).includes('search_path=""')) bad.push(`${f} search_path`); if (r.acl !== expAcl(s, f)) bad.push(`${f} acl ${r.acl}`);
    if (r.sr || r.pu) bad.push(`${f} service_role/PUBLIC can execute`); if (r.an !== (f === 'rpc_throttle_password_recovery')) bad.push(`${f} anon=${r.an}`);
  }
  rep('all 22 new functions: owner postgres; SECURITY DEFINER exactly for the 17 definers; search_path pinned on all; exact ACL strings as documented; no service_role or PUBLIC; anon only on the throttle', bad.length === 0, bad.join('; ') || '22 checked');
  const mo = fnRows.find((x) => x.s === 'private' && x.f === 'my_owner_org_ids'); rep('private.my_owner_org_ids(): grant to authenticated revoked, ACL {postgres=X/postgres}', mo && mo.acl === '{postgres=X/postgres}' && !mo.au);
  rep('exactly one anon-executable function exists in public', fnRows.filter((x) => x.s === 'public' && x.an).length === 1 && fnRows.filter((x) => x.s === 'public' && x.an)[0].f === 'rpc_throttle_password_recovery');
  rep('no function in private is executable by anon, service_role or PUBLIC; authenticated only on my_org_ids, staff_session_ok, has_capability, my_mfa_owner_org_ids', fnRows.filter((x) => x.s === 'private').every((x) => !x.an && !x.sr && !x.pu) && eqSet(fnRows.filter((x) => x.s === 'private' && x.au).map((x) => x.f), ['my_org_ids', 'staff_session_ok', 'has_capability', 'my_mfa_owner_org_ids']));
  const tb = (await tx.query(`select c.oid::regclass::text t, c.relrowsecurity rls, c.relowner::regrole::text o, c.relacl::text acl, ${['anon', 'authenticated', 'service_role', 'public'].flatMap((r) => ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'].map((p) => `has_table_privilege('${r}', c.oid, '${p}') as ${r}_${p}`)).join(', ')} from pg_class c where c.oid = any($1::regclass[])`, [`{${NEW_TABLES.join(',')}}`])).rows;
  rep('all 7 new tables: RLS enabled, owner postgres, ACL only the owner (arwdDxt[m]), no privilege of any kind for anon, authenticated, service_role or PUBLIC', tb.length === 7 && tb.every((r) => r.rls && r.o === 'postgres' && /^\{postgres=arwdDxtm?\/postgres\}$/.test(r.acl) && !Object.entries(r).some(([k, val]) => /^(anon|authenticated|service_role|public)_/.test(k) && val === true)), tb.map((r) => r.acl).filter((a, i, arr) => arr.indexOf(a) === i).join(' '));
  const pol = (await tx.query(`select count(*)::int n from pg_policies where tablename in ('rate_limit_policies','rate_limits','used_nonces','owner_mfa_windows','owner_mfa_factors','owner_recovery_codes','owner_recovery_requests')`)).rows[0].n; rep('the new tables have no policy (default deny)', pol === 0);
  const pq = (await tx.query(`select policyname, qual from pg_policies where policyname in ('organization_billing_select_owner','organization_invites_select_owner')`)).rows; rep('both owner policies now call my_mfa_owner_org_ids() and no policy mentions my_owner_org_ids', pq.length === 2 && pq.every((r) => /my_mfa_owner_org_ids/.test(r.qual)) && (await tx.query(`select count(*)::int n from pg_policies where qual like '%my_owner_org_ids%' or with_check like '%my_owner_org_ids%'`)).rows[0].n === 0);
  const trg = (await tx.query(`select tgenabled from pg_trigger where tgname in ('owner_mfa_windows_guard_insert','owner_mfa_factors_guard_insert','owner_mfa_factors_guard_update','owner_mfa_windows_guard_update','owner_recovery_codes_guard_update','owner_recovery_requests_guard_update')`)).rows; rep('the 6 guard triggers exist and are enabled', trg.length === 6 && trg.every((r) => r.tgenabled === 'O'));
  const defs = (await tx.query(`select p.proname, pg_get_functiondef(p.oid) d from (select f.oid, f.proname from pg_proc f join pg_namespace n on n.oid = f.pronamespace where n.nspname = 'private' and f.prokind = 'f' and f.proname in ('owner_mfa_ok','my_mfa_owner_org_ids','step_up_ok','last_totp_at','staff_session_ok','mfa_check_ok','has_capability','staff_gate') offset 0) p`)).rows;
  rep('recovery independence (observed in the live catalog): the 8 decision functions contain no reference to recovery', defs.length === 8 && defs.every((r) => !/recover/i.test(r.d)), `${defs.length} functions read`);
  rep('no function of 0005 writes to the auth schema (observed from live definitions)', (await tx.query(`select p.proname, pg_get_functiondef(p.oid) d from (select f.oid, f.proname from pg_proc f join pg_namespace n on n.oid = f.pronamespace where n.nspname in ('public','private') and f.prokind = 'f' and (f.proname like 'rpc_owner_%' or f.proname like 'rpc_staff_%owner%' or f.proname like 'owner_%' or f.proname like 'guard_owner_%' or f.proname = 'rl_user_key' or f.proname = 'rpc_throttle_password_recovery') offset 0) p`)).rows.every((r) => !/(insert\s+into|update|delete\s+from)\s+auth\./i.test(r.d)));

  // ---- functional observations (all rolled back; made-up caller; no Auth user, staff, organization, window or recovery code is created)
  const q1 = async (t, p = []) => (await tx.query(t, p)).rows[0];
  const hit = async (b, k) => (await q1('select private.rate_limit_hit($1, $2::bytea) as r', [b, hex(k)])).r;
  const kk = (n) => Buffer.alloc(32, n);
  const pw = [await hit('password_recovery', kk(1)), await hit('password_recovery', kk(1)), await hit('password_recovery', kk(1))];
  rep('per-email cool-down: 1st allowed, 2nd denied with a retry hint, 3rd denied', pw[0].allowed === true && pw[1].allowed === false && pw[1].retry_after_secs > 0 && pw[1].retry_after_secs <= 600 && pw[2].allowed === false, JSON.stringify(pw.map((x) => [x.allowed, x.retry_after_secs])));
  const rc = []; for (let i = 0; i < 7; i++) rc.push((await hit('recovery_code', kk(2))).allowed);
  rep('recovery_code bucket: 5 allowed then denied', JSON.stringify(rc) === JSON.stringify([true, true, true, true, true, false, false]));
  const ra = await q1(`select attempts, blocked_until is not null b from private.rate_limits where bucket='recovery_code' and key_hash=$1::bytea`, [hex(kk(2))]); rep('blocked key: counter stopped at 6 (no amplification) and the block is set', ra.attempts === 6 && ra.b === true);
  const nn = []; for (const n of [1, 1]) nn.push((await q1('select private.consume_nonce($1, $2::bytea, 60) as r', ['invite', hex(kk(3))])).r);
  await tx.query(`insert into private.used_nonces (purpose, nonce_hash, expires_at) values ('invite', $1::bytea, now() - interval '1 minute')`, [hex(kk(4))]); nn.push((await q1('select private.consume_nonce($1, $2::bytea, 60) as r', ['invite', hex(kk(4))])).r);
  rep('nonce: first use true, replay false, an expired nonce reusable once', JSON.stringify(nn) === JSON.stringify([true, false, true]));
  let e1 = null; try { await tx.query('savepoint s1'); await tx.query('select private.rate_limit_hit($1, $2::bytea)', ['recovery_code', '\\x0102']); } catch (e) { e1 = e.code; await tx.query('rollback to savepoint s1'); } rep('a malformed key raises 22023', e1 === '22023');
  const asRole = async (role, claims, text, params = []) => { await tx.query('savepoint r'); try { await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]); await tx.query(`set local role ${role}`); const r = await tx.query(text, params); await tx.query('reset role'); await tx.query('release savepoint r'); return { v: r.rows[0]?.r }; } catch (e) { await tx.query('rollback to savepoint r'); await tx.query('release savepoint r'); return { e: e.code }; } };
  const fake = { sub: '00000000-0000-4000-8000-0000000000aa', role: 'authenticated', aal: 'aal2', amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }] };
  const t1 = await asRole('anon', {}, 'select public.rpc_throttle_password_recovery($1::bytea, $2::bytea) as r', [hex(kk(10)), hex(kk(11))]);
  const t2 = await asRole('anon', {}, 'select public.rpc_throttle_password_recovery($1::bytea, $2::bytea) as r', [hex(kk(10)), hex(kk(12))]);
  const t3 = await asRole('anon', {}, 'select public.rpc_throttle_password_recovery($1::bytea, $2::bytea) as r', [hex(kk(13)), hex(kk(14))]);
  rep('anon throttle: the same email hash is allowed once then denied; an unrelated email hash is allowed; same JSON shape in every case (no enumeration signal)', t1.v?.allowed === true && t2.v?.allowed === false && t3.v?.allowed === true && [t1, t2, t3].every((t) => eqSet(Object.keys(t.v ?? {}), ['allowed', 'retry_after_secs'])), JSON.stringify([t1.v, t2.v, t3.v]));
  const refusedAnon = []; for (const [fn, args] of [['rpc_my_owner_context', "'00000000-0000-4000-8000-000000000001'::uuid"], ['rpc_owner_open_factor_window', ''], ['rpc_owner_claim_factor', "'00000000-0000-4000-8000-000000000001'::uuid"], ['rpc_owner_recovery_cancel', ''], ['rpc_staff_owner_mfa_overview', "'00000000-0000-4000-8000-000000000001'::uuid"], ['rpc_staff_authorize_owner_mfa_window', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 30"]]) { const r = await asRole('anon', {}, `select public.${fn}(${args}) as r`); if (r.e !== '42501') refusedAnon.push(`${fn}:${r.e ?? 'allowed'}`); }
  rep('anon is refused (42501) on every other 0005 RPC', refusedAnon.length === 0, refusedAnon.join(', '));
  const ctx = await asRole('authenticated', fake, "select public.rpc_my_owner_context('00000000-0000-4000-8000-000000000001'::uuid) as r");
  rep('authenticated non-owner: context says not owner, factor_state none, recovery_status none, 0 codes (own state only)', ctx.v && ctx.v.is_owner === false && ctx.v.factor_state === 'none' && ctx.v.recovery_status === 'none' && ctx.v.recovery_codes_remaining === 0, JSON.stringify(ctx.v));
  const o1 = await asRole('authenticated', fake, 'select public.rpc_owner_open_factor_window() as r'); const o2 = await asRole('authenticated', fake, "select public.rpc_owner_claim_factor('00000000-0000-4000-8000-000000000001'::uuid) as r");
  const o3 = await asRole('authenticated', fake, 'select public.rpc_owner_set_recovery_codes($1::bytea[]) as r', ['{' + Array.from({ length: 10 }, (_, i) => `"${hex(kk(40 + i))}"`).join(',') + '}']);
  const o4 = await asRole('authenticated', fake, 'select public.rpc_owner_recovery_request($1::bytea) as r', [hex(kk(50))]); const o5 = await asRole('authenticated', fake, 'select public.rpc_owner_recovery_cancel() as r');
  rep('non-owner callers: open window and claim say not_an_owner; set codes and cancel say not_available; a recovery request gets the GENERIC request_not_accepted (no enumeration, no audit row)', o1.v?.code === 'not_an_owner' && o2.v?.code === 'not_an_owner' && o3.v?.code === 'not_available' && o5.v?.code === 'not_available' && o4.v?.code === 'request_not_accepted', JSON.stringify([o1.v?.code, o2.v?.code, o3.v?.code, o4.v?.code, o5.v?.code]));
  const sr = []; for (const [fn, args] of [['rpc_staff_authorize_owner_mfa_window', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 30"], ['rpc_staff_owner_mfa_overview', "'00000000-0000-4000-8000-000000000001'::uuid"]]) { const r = await asRole('authenticated', fake, `select public.${fn}(${args}) as r`); if (r.e !== '42501') sr.push(`${fn}:${r.e ?? 'allowed'}`); }
  rep('operator RPCs refuse a non-staff authenticated caller with 42501 (no verified staff session) and write no audit row', sr.length === 0 && (await q1('select count(*)::int n from public.audit_events')).n === 0, sr.join(', '));
  const rl = await q1(`select count(*)::int n from private.owner_recovery_requests`); const rc2 = await q1(`select count(*)::int n from private.owner_recovery_codes`); const wn = await q1(`select count(*)::int n from private.owner_mfa_windows`); const fa = await q1(`select count(*)::int n from private.owner_mfa_factors`);
  rep('no recovery code, recovery request, enrolment window or approved factor was created by any functional check', rl.n === 0 && rc2.n === 0 && wn.n === 0 && fa.n === 0);
} catch (e) { note(`ABORT: ${clean(e.message)}`); exitCode = 1; results.push({ n: 'abort', ok: false }); }
finally {
  if (tx) { try { await tx.query('rollback'); note('ROLLBACK issued'); } catch (e) { note(`rollback error: ${clean(e.message)}`); } await tx.end().catch(() => {}); }
  // ---- after: a fresh connection, compared with the snapshot taken before the transaction began
  try {
    const c1 = await connect(); const after = await snapshot(c1); await c1.end();
    for (const k of Object.keys(before ?? {})) rep(`AFTER ROLLBACK unchanged: ${k}`, JSON.stringify(before[k]) === JSON.stringify(after[k]), k === 'history' ? after[k].length + ' versions' : '');
    rep('AFTER ROLLBACK: schema list unchanged, no 0005 object exists, 27 capabilities, supabase_migrations has no new row', JSON.stringify(before.schemas) === JSON.stringify(after.schemas) && !Object.keys(after.relations).some((r) => NEW_TABLES.includes(r)) && after.rowDigests['public.capabilities'].n === 27 && after.history.length === 4);
  } catch (e) { rep('after-snapshot', false, clean(e.message)); }
}
const failed = results.filter((r) => r.ok === false).length; note(`dry-execute 0005: ${results.filter((r) => r.ok === true).length} passed, ${failed} FAILED`);
process.exitCode = exitCode || (failed ? 1 : 0);
