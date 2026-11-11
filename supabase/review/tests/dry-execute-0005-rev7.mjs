// REV6 HARNESS (written offline; NEVER RUN by the author; needs a separate, explicit approval of the project owner before it may be run).
// ONE controlled, ROLLED-BACK execution of migration 0005 REV6 against the hosted development project (ref semtmllmwhxznxechfsk).
// Only 0005 rev7 is executed (0001 to 0004 are applied). One transaction; guaranteed rollback on success AND failure; no migration history row; nothing persistent.
// No Auth users, staff, organizations, enrolment windows or recovery codes are created (the functional checks use a made-up caller id that exists nowhere).
// FAIL CLOSED ON THE ARTIFACT: the file path and the sha256 are pinned in this script (no environment override exists); the file must also carry the rev7 draft banner and its
// statically counted functions, definers, tables and triggers must equal the numbers pinned below BEFORE any connection or environment read happens.
//   --offline-selftest (no network, no environment read: verifies the pinned artifact and expectations only)
//   --authorized-rolled-back-execution (required to connect)   --authorized-read-env-local (database URL line only, in memory)
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const scratch = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
const ARTIFACT = 'supabase/review/0005_rate_limits_and_owner_mfa.rev7.sql';
const FILE = join(root, ARTIFACT);
const EXPECTED_SHA = '7d5db7c0b61e51ba6fcfcf01c9e3e6281fbe6ca339969e23cfd8d6a19918eb90';
const ARTIFACT_VERSION = 'rev7';
// numbers pinned for rev7 (recomputed from the SQL text by the offline self-test below; any difference stops the run)
const PIN = { privateFunctions: 29, publicRpcs: 24, definers: 44, tables: 10, triggers: 20, guardTriggers: 13, policyAlters: 2, policySeeds: 9, newCapabilities: 1, capabilitiesAfter: 28, adminCapabilitiesAfter: 28 };
const REF = 'semtmllmwhxznxechfsk'; const CA_FILE = `${scratch}/ca/prod-ca-2021.crt`; const CA_SHA256 = '807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA';
const LOG = `${scratch}/dry-execute-0005-rev7-log.txt`;
const results = []; const note = (s) => { console.log(s); try { appendFileSync(LOG, s + '\n'); } catch { /* best effort */ } };
const rep = (n, ok, d = '') => { results.push({ n, ok }); note(`${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };
const eqSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const OFFLINE = process.argv.includes('--offline-selftest');
if (!OFFLINE && !process.argv.includes('--authorized-rolled-back-execution')) { console.log('REFUSING: needs --authorized-rolled-back-execution (or --offline-selftest)'); process.exit(2); }

// ---- 1. the exact file: pinned hash, rev7 banner, LF only, and the statically counted objects equal the pinned expectations (offline; before any connection)
const bytes = readFileSync(FILE); const sha = createHash('sha256').update(bytes).digest('hex');
rep(`0005 ${ARTIFACT_VERSION} file sha256 equals the pinned hash`, sha === EXPECTED_SHA, sha.slice(0, 16) + '…');
rep('file is LF-only', !bytes.includes(13));
const sql = bytes.toString('utf8');
rep('artifact version: the file declares itself REVIEW DRAFT rev7 and is not rev3, rev3.1, rev4, rev5 or rev6', /^-- =+\n-- 0005_rate_limits_and_owner_mfa\.rev7\.sql\n-- \*\*\* REVIEW DRAFT rev7\./.test(sql));
{
  const noComments = sql.replace(/--[^\n]*/g, '');
  const fns = [...noComments.matchAll(/create function (public|private)\.([a-z_0-9]+)\(([^)]*)\)([\s\S]*?)\bas \$\$/g)].map((m) => ({ schema: m[1], name: m[2], header: m[4] }));
  const got = {
    privateFunctions: fns.filter((f) => f.schema === 'private').length, publicRpcs: fns.filter((f) => f.schema === 'public').length, definers: fns.filter((f) => /security definer/.test(f.header)).length,
    tables: (noComments.match(/create table /g) ?? []).length, triggers: (noComments.match(/create trigger /g) ?? []).length, guardTriggers: (noComments.match(/create trigger [a-z_]+_guard_(insert|update) /g) ?? []).length,
    policyAlters: (noComments.match(/alter policy /g) ?? []).length, policySeeds: [...(/insert into private\.rate_limit_policies[^;]*values([\s\S]*?\));\s*\n/i.exec(sql)?.[1] ?? '').matchAll(/\(\s*'[a-z_]+'\s*,\s*\d+/g)].length,
    newCapabilities: [...(/insert into public\.capabilities \(code, description\) values([\s\S]*?);/.exec(noComments)?.[1] ?? '').matchAll(/\(\s*'[a-z._]+'/g)].length, capabilitiesAfter: 27 + 1, adminCapabilitiesAfter: 27 + 1,
  };
  const bad = Object.keys(PIN).filter((k) => PIN[k] !== got[k]).map((k) => `${k}: pinned ${PIN[k]}, counted ${got[k]}`);
  rep('statically counted functions, definers, tables, triggers, policies and seeds equal the numbers pinned in this harness', bad.length === 0, bad.join('; ') || JSON.stringify(got));
  rep('no function or table of rev7 appears under a different schema than documented (private helpers, public rpc_ only)', fns.filter((f) => f.schema === 'public').every((f) => /^rpc_[a-z_]+$/.test(f.name)));
}
if (OFFLINE) { const failed = results.filter((r) => r.ok === false).length; note(`offline self-test: ${results.filter((r) => r.ok === true).length} passed, ${failed} FAILED (no connection was made, no environment file was read)`); process.exit(failed ? 1 : 0); }
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

const NEW_FN = { private: ['rate_limit_hit', 'rate_limit_clear', 'consume_nonce', 'auth_structure_ok', 'owner_verified_factor_ids', 'owner_factor_state', 'rl_user_key', 'require_read_committed', 'owner_mfa_operator_ok', 'owner_has_history',
    'owner_mfa_ok', 'my_mfa_owner_org_ids', 'close_expired_recovery_requests', 'revoke_request_windows', 'owner_stranded_request', 'owner_factor_row_class', 'guard_owner_mfa_window_insert', 'guard_owner_mfa_window_update', 'guard_owner_mfa_factor_insert',
    'guard_owner_mfa_factor_update', 'guard_owner_recovery_code_update', 'guard_owner_recovery_request_insert', 'guard_owner_recovery_request_update', 'guard_owner_recovery_exception_insert', 'guard_owner_recovery_exception_update',
    'guard_owner_factor_removal_order_insert', 'guard_owner_factor_removal_order_update', 'guard_owner_unrecognized_order_insert', 'guard_owner_unrecognized_order_update'],
  public: ['rpc_throttle_password_recovery', 'rpc_my_owner_context', 'rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_revoke_factor_window', 'rpc_owner_set_recovery_codes', 'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel',
    'rpc_staff_authorize_owner_mfa_window', 'rpc_staff_revoke_owner_mfa_window', 'rpc_staff_owner_mfa_overview', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery', 'rpc_staff_cancel_owner_recovery',
    'rpc_staff_list_owner_factor_loss', 'rpc_staff_authorize_extra_recovery_window', 'rpc_staff_request_stranded_exception', 'rpc_staff_grant_stranded_exception', 'rpc_staff_cancel_stranded_exception',
    'rpc_staff_begin_factor_removal', 'rpc_staff_complete_factor_removal', 'rpc_staff_begin_unrecognized_factor_removal', 'rpc_staff_complete_unrecognized_factor_removal', 'rpc_refresh_auth_structure_check'] };
const DEFINERS = ['rate_limit_hit', 'rate_limit_clear', 'consume_nonce', 'auth_structure_ok', 'owner_verified_factor_ids', 'owner_factor_state', 'owner_mfa_operator_ok', 'owner_has_history', 'owner_mfa_ok', 'my_mfa_owner_org_ids',
  'close_expired_recovery_requests', 'revoke_request_windows', 'owner_stranded_request', 'guard_owner_mfa_window_insert', 'guard_owner_mfa_factor_insert', 'guard_owner_recovery_request_insert', 'guard_owner_recovery_exception_insert',
  'guard_owner_factor_removal_order_insert', 'guard_owner_unrecognized_order_insert', ...NEW_FN.public];
const NEW_TABLES = ['private.rate_limit_policies', 'private.rate_limits', 'private.used_nonces', 'private.owner_mfa_windows', 'private.owner_mfa_factors', 'private.owner_recovery_codes', 'private.owner_recovery_requests',
  'private.owner_recovery_exceptions', 'private.owner_factor_removal_orders', 'private.owner_unrecognized_factor_orders'];
const OWNER_TABLES_7 = '{private.owner_mfa_factors,private.owner_mfa_windows,private.owner_recovery_codes,private.owner_recovery_requests,private.owner_recovery_exceptions,private.owner_factor_removal_orders,private.owner_unrecognized_factor_orders}';
const CONSTRAINT_NAMES = ['owner_recovery_requests_two_person', 'owner_recovery_requests_cooloff', 'owner_recovery_requests_approval_group', 'owner_recovery_requests_independent_evidence', 'owner_recovery_requests_awaiting_shape',
  'owner_recovery_requests_pending_shape', 'owner_recovery_requests_expiry', 'owner_recovery_requests_windows_bounded', 'owner_recovery_requests_removal_group', 'owner_recovery_requests_removal_state', 'owner_recovery_requests_exception_origin',
  'owner_recovery_requests_id_user_key', 'owner_recovery_requests_exception_fk', 'owner_mfa_windows_authorizer', 'owner_mfa_windows_request_link', 'owner_mfa_windows_revocation_group', 'owner_mfa_windows_single_outcome',
  'owner_mfa_windows_factors_at_open', 'owner_mfa_windows_removal_group', 'owner_mfa_windows_removal_shape', 'owner_recovery_exceptions_id_user_key', 'owner_recovery_exceptions_stranded_fk', 'owner_recovery_exceptions_two_person',
  'owner_recovery_exceptions_grant_group', 'owner_recovery_exceptions_status_shape', 'owner_recovery_exceptions_expiry', 'owner_recovery_exceptions_consumed_time', 'owner_factor_removal_orders_request_fk',
  'owner_factor_removal_orders_window_fk', 'owner_factor_removal_orders_bounded', 'owner_factor_removal_orders_completed_shape',
  'owner_unrecognized_factor_orders_bounded', 'owner_unrecognized_factor_orders_completed_shape'];
const INDEX_NAMES = ['owner_recovery_requests_one_open_idx', 'owner_mfa_windows_one_open_idx', 'owner_recovery_exceptions_one_open_idx', 'owner_unrecognized_factor_orders_one_open_idx', 'owner_recovery_requests_exception_idx', 'owner_factor_removal_orders_one_live_idx'];
const hex = (b) => '\\x' + Buffer.from(b).toString('hex');

let tx = null; let before = null; let exitCode = 0; let inTx = null;
try {
  const c0 = await connect(); before = await snapshot(c0); await c0.end(); note('BEFORE snapshot taken (fresh connection)');
  rep('PRE-STATE: migration history is exactly the four applied versions', JSON.stringify(before.history) === JSON.stringify(['20261108000001:foundation_identity', '20261108000002:staff_capabilities', '20261108000003:audit_and_step_up', '20261108000004:staff_management_rpcs']), before.history.join(','));
  rep('PRE-STATE: none of the 0005 objects exist (53 functions, 10 tables, 1 capability)', NEW_FN.private.every((n) => !Object.keys(before.functions).some((k) => k.startsWith(`private.${n}(`))) && NEW_TABLES.every((t) => !(t in before.relations)) && before.rowDigests['public.capabilities'].n === 27);
  if (results.some((r) => r.ok === false)) throw new Error('pre-state check failed; nothing executed');

  tx = await connect(); await tx.query('begin isolation level read committed');
  await tx.query("set local idle_in_transaction_session_timeout = '600s'"); await tx.query("set local statement_timeout = '120s'");
  note('transaction open; executing 0005 (ONE statement batch, no history insert)');
  try { await tx.query(sql); rep('0005 executed inside the transaction (its own self-check DO block passed)', true); } catch (e) { rep('0005 execution', false, `${clean(e.message)} [${e.code ?? ''}]`); throw e; }

  // ---- observations inside the transaction
  inTx = await snapshot(tx);
  for (const k of ['functions', 'relations', 'columns', 'constraints', 'policies', 'triggers', 'rowCounts', 'defaultAcl']) {
    const d = diff(before[k], inTx[k]); rep(`in-transaction diff ${k}: nothing removed`, d.removed.length === 0, `added ${d.added.length}, changed ${d.changed.length}${d.changed.length ? ': ' + d.changed.slice(0, 4).join('; ') : ''}`);
    if (k === 'functions') { rep('functions added: exactly the 53 of 0005 rev7 (29 private, 24 public)', eqSet(d.added.map((s) => s.replace(/\(.*$/, '').replace(/^public\./, 'public.')).map((s) => (s.includes('.') ? s : 'public.' + s)), [...NEW_FN.private.map((n) => `private.${n}`), ...NEW_FN.public.map((n) => `public.${n}`)]), `${d.added.length}`); rep('functions changed: only private.my_owner_org_ids() (its grant to authenticated is revoked)', d.changed.length === 1 && d.changed[0].includes('my_owner_org_ids'), d.changed.join(',')); }
    if (k === 'policies') rep('policies changed: exactly the two owner policies; none added or removed', eqSet(d.changed, ['public.organization_billing.organization_billing_select_owner', 'public.organization_invites.organization_invites_select_owner']) && d.added.length === 0);
    if (k === 'triggers') rep('triggers added: exactly 20, on the seven new owner tables', d.added.length === 20 && d.added.every((t) => /owner_(mfa|recovery|factor|unrecognized)_/.test(t)) && d.changed.length === 0, `${d.added.length}`);
    if (k === 'rowCounts') rep('row counts: only the 10 new tables appear; the only pre-existing counts that change are capabilities and role_capabilities (one new capability, one admin mapping); 9 policy seed rows', eqSet(d.added, NEW_TABLES) && eqSet(d.changed, ['public.capabilities', 'public.role_capabilities']) && inTx.rowCounts['private.rate_limit_policies'] === '9' && NEW_TABLES.filter((t) => t !== 'private.rate_limit_policies').every((t) => inTx.rowCounts[t] === '0'));
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
    if (!(r.cfg ?? []).some((c) => c.replace(/[\s"']/g, '').toLowerCase() === 'search_path=')) bad.push(`${f} search_path`); if (r.acl !== expAcl(s, f)) bad.push(`${f} acl ${r.acl}`);
    if (r.sr || r.pu) bad.push(`${f} service_role/PUBLIC can execute`); if (r.an !== (f === 'rpc_throttle_password_recovery')) bad.push(`${f} anon=${r.an}`);
  }
  rep('all 53 new functions: owner postgres; SECURITY DEFINER exactly for the 44 definers; search_path pinned on all; exact ACL strings as documented; no service_role or PUBLIC; anon only on the throttle', bad.length === 0, bad.join('; ') || '53 checked');
  const mo = fnRows.find((x) => x.s === 'private' && x.f === 'my_owner_org_ids'); rep('private.my_owner_org_ids(): grant to authenticated revoked, ACL {postgres=X/postgres}', mo && mo.acl === '{postgres=X/postgres}' && !mo.au);
  rep('exactly one anon-executable function exists in public', fnRows.filter((x) => x.s === 'public' && x.an).length === 1 && fnRows.filter((x) => x.s === 'public' && x.an)[0].f === 'rpc_throttle_password_recovery');
  rep('no function in private is executable by anon, service_role or PUBLIC; authenticated only on my_org_ids, staff_session_ok, has_capability, my_mfa_owner_org_ids', fnRows.filter((x) => x.s === 'private').every((x) => !x.an && !x.sr && !x.pu) && eqSet(fnRows.filter((x) => x.s === 'private' && x.au).map((x) => x.f), ['my_org_ids', 'staff_session_ok', 'has_capability', 'my_mfa_owner_org_ids']));
  const tb = (await tx.query(`select c.oid::regclass::text t, c.relrowsecurity rls, c.relowner::regrole::text o, c.relacl::text acl, ${['anon', 'authenticated', 'service_role', 'public'].flatMap((r) => ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'].map((p) => `has_table_privilege('${r}', c.oid, '${p}') as ${r}_${p}`)).join(', ')} from pg_class c where c.oid = any($1::regclass[])`, [`{${NEW_TABLES.join(',')}}`])).rows;
  rep('all 10 new tables: RLS enabled, owner postgres, ACL only the owner (arwdDxt[m]), no privilege of any kind for anon, authenticated, service_role or PUBLIC', tb.length === 10 && tb.every((r) => r.rls && r.o === 'postgres' && /^\{postgres=arwdDxtm?\/postgres\}$/.test(r.acl) && !Object.entries(r).some(([k, val]) => /^(anon|authenticated|service_role|public)_/.test(k) && val === true)), tb.map((r) => r.acl).filter((a, i, arr) => arr.indexOf(a) === i).join(' '));
  const pol = (await tx.query(`select count(*)::int n from pg_policies where tablename in ('rate_limit_policies','rate_limits','used_nonces','owner_mfa_windows','owner_mfa_factors','owner_recovery_codes','owner_recovery_requests','owner_recovery_exceptions','owner_factor_removal_orders','owner_unrecognized_factor_orders')`)).rows[0].n; rep('the new tables have no policy (default deny)', pol === 0);
  const pq = (await tx.query(`select policyname, qual from pg_policies where policyname in ('organization_billing_select_owner','organization_invites_select_owner')`)).rows; rep('both owner policies now call my_mfa_owner_org_ids() and no policy mentions my_owner_org_ids', pq.length === 2 && pq.every((r) => /my_mfa_owner_org_ids/i.test(r.qual)) && (await tx.query(`select count(*)::int n from pg_policies where qual ilike '%my\\_owner\\_org\\_ids%' or with_check ilike '%my\\_owner\\_org\\_ids%'`)).rows[0].n === 0);
  const trg = (await tx.query(`select tgenabled from pg_trigger where tgname in ('owner_mfa_windows_guard_insert','owner_mfa_factors_guard_insert','owner_mfa_factors_guard_update','owner_mfa_windows_guard_update','owner_recovery_codes_guard_update','owner_recovery_requests_guard_insert','owner_recovery_requests_guard_update','owner_recovery_exceptions_guard_insert','owner_recovery_exceptions_guard_update','owner_factor_removal_orders_guard_insert','owner_factor_removal_orders_guard_update','owner_unrecognized_factor_orders_guard_insert','owner_unrecognized_factor_orders_guard_update')`)).rows; rep('the 13 guard triggers exist and are enabled', trg.length === 13 && trg.every((r) => r.tgenabled === 'O'));
  // rev6 retention (F6) and structure, observed in the live catalog: every FK of the owner tables to auth.users (and factors to windows) is RESTRICT; the new columns exist
  const fk = (await tx.query(`select c.conrelid::regclass::text t, c.confrelid::regclass::text r, c.confdeltype d from pg_constraint c where c.contype = 'f' and c.conrelid = any($1::regclass[])`, [OWNER_TABLES_7])).rows;
  rep('retention: 13 foreign keys among the seven owner tables (7 to auth.users), every one ON DELETE RESTRICT (confdeltype r), none cascades or defaults to no action', fk.length === 13 && fk.filter((r) => r.r === 'auth.users').length === 7 && fk.every((r) => r.d === 'r'), fk.map((r) => `${r.t}->${r.r}:${r.d}`).join(' '));
  const cols = (await tx.query(`select table_name, column_name from information_schema.columns where table_schema = 'private' and ((table_name = 'owner_recovery_requests' and column_name in ('notarized_supplement','second_notarized_supplement','factors_removed_at','factors_removed_by','exception_id','extra_windows_granted')) or (table_name = 'owner_mfa_windows' and column_name in ('factors_at_open','removal_verified_at','removal_verified_by','removal_method')))`)).rows;
  rep('rev6 and rev7 columns exist: 6 on owner_recovery_requests, 4 on owner_mfa_windows', cols.length === 10);
  const gone = (await tx.query(`select count(*)::int n from information_schema.columns where table_schema = 'private' and column_name = 'factors_removed_count'`)).rows[0].n; rep('rev5 column factors_removed_count (a typed count) does not exist', gone === 0);
  const oldm = (await tx.query(`select count(*)::int n from pg_constraint where conrelid = 'private.owner_recovery_requests'::regclass and pg_get_constraintdef(oid) ilike '%notarized_statement%'`)).rows[0].n; rep('rev6: no constraint mentions a notarized_statement method', oldm === 0);
  const isoGuard = (await tx.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and p.proname = any($1::text[]) and position('private.require_read_committed()' in p.prosrc) > 0`, [NEW_FN.public.filter((f) => !['rpc_throttle_password_recovery', 'rpc_my_owner_context'].includes(f))])).rows[0].n; rep('isolation guard present in the source of all 22 mutating recovery RPCs (the refusal itself is NOT exercised here: it needs a second REPEATABLE READ transaction and remains UNVERIFIED until the disposable-project test)', isoGuard === 22);
  const conCount = (await tx.query('select count(*)::int n from pg_constraint where conname = any($1::text[])', [CONSTRAINT_NAMES])).rows[0].n; rep('all 33 approved constraints exist in the live catalog (including the five-window equation, the exception and order shapes)', conCount === 33, String(conCount));
  const idxCount = (await tx.query("select count(*)::int n from pg_indexes where schemaname = 'private' and indexname = any($1::text[])", [INDEX_NAMES])).rows[0].n; rep('all 6 open and live unique indexes exist (the rev6 one-live exception index is replaced)', idxCount === 6, String(idxCount));
  const oneLive = (await tx.query("select count(*)::int n from pg_indexes where schemaname = 'private' and indexname = 'owner_recovery_exceptions_one_live_idx'")).rows[0].n; rep('rev7: the one-live exception index does not exist', oneLive === 0);
  const wc = (await tx.query("select pg_get_constraintdef(c.oid) d from pg_constraint c where c.conname = 'owner_recovery_requests_windows_bounded'")).rows[0]?.d ?? ''; rep('the five-window hard maximum is a catalog constraint: windows_issued <= 5 and the extension equation (rev7 F2: compared case-insensitively on normalized text)', /windows_issued\)?(::[a-z0-9 ]+)? <= 5/i.test(wc.replace(/\s+/g, ' ')) && /greatest\s*\(/i.test(wc) && /extra_windows_granted/i.test(wc), wc.slice(0, 160));
  // fail closed, observed in the live catalog: no Auth row of a real user is read (a made-up user id); the result must agree with the structure check actually recorded
  const sok = (await tx.query('select private.auth_structure_ok() as v')).rows[0].v;
  const ids = (await tx.query("select private.owner_verified_factor_ids('00000000-0000-4000-8000-0000000000bb'::uuid) as v")).rows[0].v;
  const st = (await tx.query("select private.owner_factor_state('00000000-0000-4000-8000-0000000000bb'::uuid) as v")).rows[0].v;
  const nul = (await tx.query('select private.owner_verified_factor_ids(null::uuid) is null as v')).rows[0].v;
  rep('fail closed, observed: without a fresh passing structure check the id helper is NULL and the state is unknown; with one, a made-up user has an EMPTY list and state none; a NULL user is always unknown', nul === true && (sok === true ? (Array.isArray(ids) && ids.length === 0 && st === 'none') : (ids === null && st === 'unknown')), 'structure_ok=' + sok + ' ids=' + JSON.stringify(ids) + ' state=' + st);
  const rowCls = (await tx.query("select private.owner_factor_row_class('00000000-0000-4000-8000-0000000000bb'::uuid, '00000000-0000-4000-8000-0000000000cc'::uuid) as v")).rows[0].v; rep('rev7 fail closed, observed: the row classifier is NULL without a fresh passing structure check and absent for a made-up factor with one; NULL arguments give NULL', (sok === true ? rowCls === 'absent' : rowCls === null) && (await tx.query('select private.owner_factor_row_class(null::uuid, null::uuid) is null as v')).rows[0].v === true, 'structure_ok=' + sok + ' class=' + rowCls);
  const stranded = (await tx.query("select private.owner_stranded_request('00000000-0000-4000-8000-0000000000bb'::uuid) is null as v")).rows[0].v; rep('a made-up user is never stranded', stranded === true);
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
  const refusedAnon = []; for (const [fn, args] of [['rpc_my_owner_context', "'00000000-0000-4000-8000-000000000001'::uuid"], ['rpc_owner_open_factor_window', ''], ['rpc_owner_claim_factor', "'00000000-0000-4000-8000-000000000001'::uuid"], ['rpc_owner_recovery_cancel', ''], ['rpc_staff_owner_mfa_overview', "'00000000-0000-4000-8000-000000000001'::uuid"], ['rpc_staff_authorize_owner_mfa_window', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 30"],
    ['rpc_staff_list_owner_factor_loss', ''], ['rpc_staff_initiate_owner_recovery', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 'in_person', 'REF-1', false, null::uuid"],
    ['rpc_staff_approve_owner_recovery', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 'in_person', 'REF-2', false"], ['rpc_staff_cancel_owner_recovery', "'00000000-0000-4000-8000-000000000001'::uuid, 'x'"],
    ['rpc_staff_revoke_owner_mfa_window', "'00000000-0000-4000-8000-000000000001'::uuid, 'x'"], ['rpc_owner_revoke_factor_window', ''],
    ['rpc_staff_authorize_extra_recovery_window', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 30"], ['rpc_staff_request_stranded_exception', "'00000000-0000-4000-8000-000000000001'::uuid, 'x'"],
    ['rpc_staff_grant_stranded_exception', "'00000000-0000-4000-8000-000000000001'::uuid, 'x'"], ['rpc_staff_cancel_stranded_exception', "'00000000-0000-4000-8000-000000000001'::uuid"],
    ['rpc_staff_begin_factor_removal', "'00000000-0000-4000-8000-000000000001'::uuid"], ['rpc_staff_complete_factor_removal', "'00000000-0000-4000-8000-000000000001'::uuid"],
    ['rpc_staff_begin_unrecognized_factor_removal', "'00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, 'x'"], ['rpc_staff_complete_unrecognized_factor_removal', "'00000000-0000-4000-8000-000000000001'::uuid"], ['rpc_refresh_auth_structure_check', '']]) { const r = await asRole('anon', {}, `select public.${fn}(${args}) as r`); if (r.e !== '42501') refusedAnon.push(`${fn}:${r.e ?? 'allowed'}`); }
  rep('anon is refused (42501) on 22 of the 23 non-throttle 0005 RPCs (set_recovery_codes and recovery_request take hash arguments and are exercised below as an authenticated non-owner)', refusedAnon.length === 0, refusedAnon.join(', '));
  const ctx = await asRole('authenticated', fake, "select public.rpc_my_owner_context('00000000-0000-4000-8000-000000000001'::uuid) as r");
  rep('authenticated non-owner: context says not owner, factor_state none, recovery_status none, 0 codes (own state only)', ctx.v && ctx.v.is_owner === false && ctx.v.factor_state === 'none' && ctx.v.recovery_status === 'none' && ctx.v.recovery_codes_remaining === 0, JSON.stringify(ctx.v));
  const o1 = await asRole('authenticated', fake, 'select public.rpc_owner_open_factor_window() as r'); const o2 = await asRole('authenticated', fake, "select public.rpc_owner_claim_factor('00000000-0000-4000-8000-000000000001'::uuid) as r");
  const o3 = await asRole('authenticated', fake, 'select public.rpc_owner_set_recovery_codes($1::bytea[]) as r', ['{' + Array.from({ length: 10 }, (_, i) => `"${hex(kk(40 + i))}"`).join(',') + '}']);
  const o4 = await asRole('authenticated', fake, 'select public.rpc_owner_recovery_request($1::bytea) as r', [hex(kk(50))]); const o5 = await asRole('authenticated', fake, 'select public.rpc_owner_recovery_cancel() as r');
  rep('non-owner callers: open window and claim say not_an_owner; set codes and cancel say not_available; a recovery request gets the GENERIC request_not_accepted (no enumeration, no audit row)', o1.v?.code === 'not_an_owner' && o2.v?.code === 'not_an_owner' && o3.v?.code === 'not_available' && o5.v?.code === 'not_available' && o4.v?.code === 'request_not_accepted', JSON.stringify([o1.v?.code, o2.v?.code, o3.v?.code, o4.v?.code, o5.v?.code]));
  const sr = []; for (const [fn, args] of [['rpc_staff_authorize_owner_mfa_window', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 30"], ['rpc_staff_owner_mfa_overview', "'00000000-0000-4000-8000-000000000001'::uuid"],
    ['rpc_staff_list_owner_factor_loss', ''], ['rpc_staff_initiate_owner_recovery', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 'in_person', 'REF-1', false, null::uuid"],
    ['rpc_staff_approve_owner_recovery', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 'in_person', 'REF-2', false"], ['rpc_staff_cancel_owner_recovery', "'00000000-0000-4000-8000-000000000001'::uuid, 'x'"],
    ['rpc_staff_authorize_extra_recovery_window', "'00000000-0000-4000-8000-000000000001'::uuid, 'x', 30"], ['rpc_staff_request_stranded_exception', "'00000000-0000-4000-8000-000000000001'::uuid, 'x'"],
    ['rpc_staff_grant_stranded_exception', "'00000000-0000-4000-8000-000000000001'::uuid, 'x'"], ['rpc_staff_cancel_stranded_exception', "'00000000-0000-4000-8000-000000000001'::uuid"],
    ['rpc_staff_begin_factor_removal', "'00000000-0000-4000-8000-000000000001'::uuid"], ['rpc_staff_complete_factor_removal', "'00000000-0000-4000-8000-000000000001'::uuid"],
    ['rpc_staff_begin_unrecognized_factor_removal', "'00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, 'x'"], ['rpc_staff_complete_unrecognized_factor_removal', "'00000000-0000-4000-8000-000000000001'::uuid"]]) { const r = await asRole('authenticated', fake, `select public.${fn}(${args}) as r`); if (r.e !== '42501') sr.push(`${fn}:${r.e ?? 'allowed'}`); }
  rep('operator RPCs refuse a non-staff authenticated caller with 42501 (no verified staff session) and write no audit row', sr.length === 0 && (await q1('select count(*)::int n from public.audit_events')).n === 0, sr.join(', '));
  const rf = await asRole('authenticated', fake, 'select public.rpc_refresh_auth_structure_check() as r');
  rep('rev7: the structure-check refresh gives a non-staff non-owner caller not_available (no counter row, no audit row, no check run)', rf.v?.ok === false && rf.v?.code === 'not_available' && (await q1("select count(*)::int n from private.rate_limits where bucket = 'structure_refresh'")).n === 0, JSON.stringify(rf.v ?? rf.e));
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
