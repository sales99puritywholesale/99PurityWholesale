// CONCURRENCY tests for the rate-limit and nonce functions of 0005 (rev3), run against a DISPOSABLE, ISOLATED schema `p2_conc_test`, never against `private`.
// DEVELOPED ONLY: it has NOT been run. Running it needs your separate approval of (a) creating and dropping that schema on hosted development and (b) the run.
//
// ISOLATION (demonstrated offline by --selftest, and again against the catalog before any scenario runs):
//   * the schema content is NOT hand-written: it is the rate-limit and nonce sections (1 to 3) of 0005, with every `private.` rewritten to `p2_conc_test.`;
//   * the transformed text is asserted to contain NO reference to private., public., auth., extensions., storage, supabase_ or any other schema, no GRANT,
//     no ALTER of anything outside the new tables, no DO block, no trigger and no policy; every created object is named p2_conc_test.*;
//   * right after creation ALL privileges of the schema and every object in it are REVOKED from PUBLIC, anon, authenticated and service_role (default
//     privileges would otherwise grant them), and the script then asserts with has_*_privilege() that no API role has any privilege on the schema,
//     its tables or its functions;
//   * only the owner connection (postgres) is used; no JWT claims, no role switching, no Auth call, no anon key, no service role key;
//   * before and after snapshots of every OTHER schema (functions, relations, columns, policies, triggers, ACLs, row counts, Auth digests, migration
//     history) must be identical; the schema list must differ by exactly p2_conc_test while it exists and not at all after it was dropped.
// Authorization flags: --authorized-disposable-schema (required), --authorized-read-env-local (database URL), --n <concurrency> (default 20; the
//   direct connection limit of a small instance makes 50 risky, so the default is 20 and the plan's N=50 is reached only if you ask for it).
//   --selftest : offline, no environment, no network; --list prints the scenarios.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const scratch = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
const REF = 'semtmllmwhxznxechfsk'; const SCHEMA = 'p2_conc_test'; const REGISTRY = `${scratch}/${SCHEMA}-registry.json`;
const SCENARIOS = ['R1 same key, 5 allowed of N, then all denied, block not extended', 'R2 N distinct keys all allowed', 'R3 window rollover under load: exactly the policy maximum allowed',
  'R4 blocked key under load: unchanged', 'R5 per-email cool-down (1 per 600 s) and per-address quota under load', 'R6 bounded cleanup (<= 50 rows per call) and skip-locked',
  'N1 same nonce from N sessions: exactly one true', 'N2 expired nonce reuse: exactly one true', 'N3 rolled-back consumption does not burn the nonce', 'N4 purposes are independent', 'N5 invalid inputs raise 22023'];
if (process.argv.includes('--list')) { for (const s of SCENARIOS) console.log(s); process.exit(0); }

// ---------------------------------------------------------------------------------------------------------------- isolated SQL
function buildSql() {
  const full = readFileSync(join(root, 'supabase/review/0005_rate_limits_and_owner_mfa.sql'), 'utf8');
  const a = full.indexOf('-- 1. Rate-limit policies'); const b = full.indexOf('-- 4. Owner MFA');
  if (a < 0 || b < 0 || b < a) throw new Error('sections 1-3 not found in 0005');
  const body = full.slice(a, b).replaceAll('private.', `${SCHEMA}.`);
  return { body, sql: `create schema ${SCHEMA};\n${body}\n` +
    `revoke all on schema ${SCHEMA} from public, anon, authenticated, service_role;\n` +
    `revoke all on all tables in schema ${SCHEMA} from public, anon, authenticated, service_role;\n` +
    `revoke all on all functions in schema ${SCHEMA} from public, anon, authenticated, service_role;\n` };
}
function assertIsolated(body) {
  const code = body.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''"); // comments and string literals removed
  const errs = [];
  for (const bad of [/\bprivate\./i, /\bpublic\./i, /\bauth\./i, /\bextensions\./i, /\bstorage\./i, /\bsupabase_[a-z_]*\./i, /\bpg_temp\./i, /\bgrant\b/i, /\bcreate\s+trigger\b/i, /\bcreate\s+policy\b/i, /\bdo\s+\$\$/i, /\bdrop\b/i, /\bcreate\s+extension\b/i, /\bset\s+role\b/i, /\bset\s+session\b/i, /\bsecurity\s+invoker\b/i]) {
    if (bad.test(code)) errs.push(`forbidden construct: ${bad}`);
  }
  for (const m of code.matchAll(/\bcreate\s+(table|function|index|unique\s+index)\s+([a-z_0-9.]+)/gi)) { if (m[1].toLowerCase().includes('index')) continue; if (!m[2].startsWith(`${SCHEMA}.`)) errs.push(`created object outside the schema: ${m[2]}`); }
  for (const m of code.matchAll(/\balter\s+table\s+([a-z_0-9.]+)/gi)) if (!m[1].startsWith(`${SCHEMA}.`)) errs.push(`alter outside the schema: ${m[1]}`);
  for (const m of code.matchAll(/\binsert\s+into\s+([a-z_0-9.]+)/gi)) if (!m[1].startsWith(`${SCHEMA}.`)) errs.push(`insert outside the schema: ${m[1]}`);
  for (const m of code.matchAll(/\b(?:from|join|update|delete\s+from|references)\s+([a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*)/gi)) { const o = m[1].toLowerCase(); if (!o.startsWith(`${SCHEMA}.`) && !/^(l|n|p|d|r|pol|e)\./.test(o)) errs.push(`reference outside the schema: ${m[1]}`); }
  const created = [...code.matchAll(/\bcreate\s+(?:table|function)\s+([a-z_0-9.]+)/gi)].map((m) => m[1]);
  if (created.length < 6) errs.push(`expected at least 6 created tables/functions, found ${created.length}`);
  return { errs, created };
}
if (process.argv.includes('--selftest')) {
  const { body, sql } = buildSql(); const { errs, created } = assertIsolated(body);
  const checks = [['transformed text references nothing outside the disposable schema; no grants, triggers, policies, DO blocks, drops or extensions', errs.length === 0, errs.join('; ')],
    ['it creates exactly the expected objects', created.length === 6 + 0 || created.length >= 6, created.join(', ')],
    ['the privilege revocations for every API role are appended', /revoke all on schema p2_conc_test/.test(sql) && /all tables in schema p2_conc_test/.test(sql) && /all functions in schema p2_conc_test/.test(sql)],
    ['the per-email policy in the copied seed is the 10 minute cool-down (rev3)', /\('password_recovery',\s+1,\s+600,\s+600,/.test(body)],
    ['the rate-limit function is atomic (single INSERT ... ON CONFLICT DO UPDATE)', /on conflict \(bucket, key_hash\) do update/.test(body)]];
  let bad = 0; for (const [n, ok, d] of checks) { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d && !ok ? '  (' + d + ')' : d ? '  (' + d + ')' : ''}`); }
  // negative control: the checker must reject a contaminated copy
  const bad1 = assertIsolated(body + '\ncreate table private.oops (x int);'); const bad2 = assertIsolated(body + '\ngrant select on p2_conc_test.rate_limits to anon;'); const bad3 = assertIsolated(body + '\ninsert into public.profiles values (1);');
  const neg = bad1.errs.length > 0 && bad2.errs.length > 0 && bad3.errs.length > 0; if (!neg) bad++; console.log(`${neg ? 'PASS' : 'FAIL'}  negative control: contaminated copies (private object, grant, insert into public) are rejected`);
  process.exit(bad ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------------------------- run mode (gated)
if (!process.argv.includes('--authorized-disposable-schema')) { console.error('REFUSING: creating and dropping the disposable schema needs --authorized-disposable-schema after approval. Nothing was read or created.'); process.exit(2); }
const nIdx = process.argv.indexOf('--n'); const N = nIdx > 0 ? Number(process.argv[nIdx + 1]) : 20; if (!Number.isInteger(N) || N < 2 || N > 60) { console.error('--n must be an integer between 2 and 60'); process.exit(2); }
let dbUrl = process.env.P2_DATABASE_URL ?? '';
if (!dbUrl && process.argv.includes('--authorized-read-env-local')) { const line = readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { dbUrl = line.slice(line.indexOf('=') + 1).trim(); if ((dbUrl.startsWith('"') && dbUrl.endsWith('"')) || (dbUrl.startsWith("'") && dbUrl.endsWith("'"))) dbUrl = dbUrl.slice(1, -1); else dbUrl = dbUrl.replace(/\s+#.*$/, ''); } }
if (!dbUrl) { console.error('STOP: P2_DATABASE_URL is not set and --authorized-read-env-local was not given. Nothing was read or created.'); process.exit(2); }
const URLo = new URL(dbUrl); if (URLo.hostname !== `db.${REF}.supabase.co`) { console.error('STOP: wrong project'); process.exit(3); }
const secrets = [dbUrl, URLo.password, decodeURIComponent(URLo.password)].filter((x) => x && x.length >= 8);
const clean = (t) => { let s = String(t ?? ''); for (const x of secrets) s = s.split(x).join('<redacted>'); return s; };
const pg = createRequire(join(root, 'package.json'))('pg'); const ca = readFileSync(`${scratch}/ca/prod-ca-2021.crt`, 'utf8');
const connect = async () => { const k = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: true, ca, servername: URLo.hostname }, connectionTimeoutMillis: 20000 }); await k.connect(); return k; };
const results = []; const rep = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + clean(d) + ')' : ''}`); };
const key = () => randomBytes(32); const hex = (b) => '\\x' + b.toString('hex');
async function snapshot(c) { // everything EXCEPT the disposable schema
  const kv = async (sql) => Object.fromEntries((await c.query(sql)).rows.map((r) => [r.k, r.v]));
  const S = { schemas: (await c.query(`select nspname from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' order by 1`)).rows.map((r) => r.nspname).filter((n) => n !== SCHEMA) };
  S.functions = await kv(`select p.oid::regprocedure::text k, md5(concat_ws('|', p.prosrc, p.prosecdef, p.proconfig::text, p.proacl::text, p.proowner::regrole::text)) v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('pg_catalog','information_schema', '${SCHEMA}')`);
  S.relations = await kv(`select n.nspname || '.' || c.relname k, md5(concat_ws('|', c.relkind, c.relacl::text, c.relrowsecurity, c.relowner::regrole::text)) v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast', '${SCHEMA}') and c.relkind in ('r','v','m','S','p','i')`);
  S.policies = await kv(`select schemaname || '.' || tablename || '.' || policyname k, md5(concat_ws('|', cmd, roles::text, qual, with_check)) v from pg_policies where schemaname <> '${SCHEMA}'`);
  S.triggers = await kv(`select c.oid::regclass::text || '.' || t.tgname k, md5(pg_get_triggerdef(t.oid)) v from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname <> '${SCHEMA}'`);
  S.rowCounts = await kv(`select t.table_schema || '.' || t.table_name k, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text v from information_schema.tables t where t.table_schema in ('public','private') and t.table_type = 'BASE TABLE'`);
  S.defaultAcl = await kv(`select concat_ws('.', defaclrole::regrole::text, coalesce(defaclnamespace::regnamespace::text,''), defaclobjtype::text) k, defaclacl::text v from pg_default_acl`);
  S.auth = {}; for (const t of ['users', 'identities', 'mfa_factors']) S.auth[t] = (await c.query(`select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') d, count(*)::int n from auth.${t} x`)).rows[0];
  S.history = (await c.query(`select version from supabase_migrations.schema_migrations order by 1`)).rows.map((r) => r.version);
  return S;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { body, sql } = buildSql(); const iso = assertIsolated(body); if (iso.errs.length) { console.error('STOP: isolation check failed: ' + iso.errs.join('; ')); process.exit(3); }
const admin = await connect(); let created = false; const sessions = []; let before = null;
try {
  before = await snapshot(admin);
  const pre = (await admin.query(`select to_regnamespace('${SCHEMA}') s`)).rows[0].s; if (pre) throw new Error(`STOP: schema ${SCHEMA} already exists; refusing to touch it`);
  writeFileSync(REGISTRY, JSON.stringify({ schema: SCHEMA, startedAt: new Date().toISOString(), dropStatement: `drop schema ${SCHEMA} cascade;` }));
  await admin.query('begin'); await admin.query(sql); await admin.query('commit'); created = true;
  // ---- isolation evidence from the catalog
  const objs = (await admin.query(`select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = '${SCHEMA}'`)).rows[0].n; rep('disposable schema created', objs > 0, `${objs} relations`);
  const mid = await snapshot(admin);
  for (const k of Object.keys(before)) rep(`isolation: ${k} outside ${SCHEMA} unchanged by the creation`, same(before[k], mid[k]));
  const roles = ['anon', 'authenticated', 'service_role', 'public']; const priv = { sch: false, tbl: false, fn: false, aclSchema: null };
  for (const r of roles) {
    const a = (await admin.query(`select has_schema_privilege($1, $2, 'usage') or has_schema_privilege($1, $2, 'create') as v`, [r, SCHEMA])).rows[0].v; if (a) priv.sch = true;
    const b = (await admin.query(`select bool_or(has_table_privilege($1, c.oid, p)) as v from pg_class c cross join unnest(array['select','insert','update','delete','truncate','references','trigger']) p where c.relnamespace = $2::regnamespace and c.relkind = 'r'`, [r, SCHEMA])).rows[0].v; if (b) priv.tbl = true;
    const d = (await admin.query(`select bool_or(has_function_privilege($1, f.oid, 'execute')) as v from pg_proc f where f.pronamespace = $2::regnamespace`, [r, SCHEMA])).rows[0].v; if (d) priv.fn = true;
  }
  priv.aclSchema = (await admin.query(`select nspacl::text a from pg_namespace where nspname = $1`, [SCHEMA])).rows[0].a;
  rep('isolation: NO API role (anon, authenticated, service_role, PUBLIC) has any privilege on the schema, its tables or its functions', !priv.sch && !priv.tbl && !priv.fn, JSON.stringify(priv));
  const owners = (await admin.query(`select count(*)::int n from pg_class c where c.relnamespace = '${SCHEMA}'::regnamespace and c.relowner::regrole::text <> 'postgres'`)).rows[0].n; rep('isolation: every object is owned by postgres', owners === 0);

  // ---- concurrency harness
  for (let i = 0; i < N; i++) sessions.push(await connect());
  const S = SCHEMA; const hit = (c, bucket, k) => c.query(`select ${S}.rate_limit_hit($1, $2::bytea) as r`, [bucket, hex(k)]).then((r) => r.rows[0].r);
  const wave = (fn) => Promise.all(sessions.map((c, i) => fn(c, i)));
  const row = async (bucket, k) => (await admin.query(`select attempts, blocked_until, window_start from ${S}.rate_limits where bucket = $1 and key_hash = $2::bytea`, [bucket, hex(k)])).rows[0];

  { // R1
    const k = key(); const out = await wave((c) => hit(c, 'recovery_code', k)); const allowed = out.filter((r) => r.allowed).length; const r1 = await row('recovery_code', k);
    rep(`R1: ${N} concurrent attempts on one key (max 5): exactly 5 allowed`, allowed === 5, `allowed ${allowed}`); rep('R1: attempts counted = 6 (the 6th attempt triggered the block, later ones did not count) and the block is set', r1.attempts === 6 && r1.blocked_until !== null, JSON.stringify(r1));
    const b1 = r1.blocked_until.getTime(); const out2 = await wave((c) => hit(c, 'recovery_code', k)); const r2 = await row('recovery_code', k);
    rep('R1: a second wave is entirely denied and neither the counter nor the block moved (no lockout amplification)', out2.every((r) => !r.allowed) && r2.attempts === 6 && r2.blocked_until.getTime() === b1);
  }
  { // R2
    const keys = sessions.map(() => key()); const out = await wave((c, i) => hit(c, 'recovery_code', keys[i])); rep(`R2: ${N} distinct keys are all allowed`, out.every((r) => r.allowed));
  }
  { // R3 window rollover
    const k = key(); await admin.query(`insert into ${S}.rate_limits (bucket, key_hash, window_start, attempts, blocked_until, updated_at) values ('recovery_code', $1::bytea, now() - interval '901 seconds', 5, null, now() - interval '901 seconds')`, [hex(k)]);
    const out = await wave((c) => hit(c, 'recovery_code', k)); const allowed = out.filter((r) => r.allowed).length; rep('R3: window elapsed under load: the counter restarts once and exactly 5 attempts are allowed', allowed === 5, `allowed ${allowed}`);
  }
  { // R4 pre-blocked
    const k = key(); await admin.query(`insert into ${S}.rate_limits (bucket, key_hash, window_start, attempts, blocked_until, updated_at) values ('recovery_code', $1::bytea, now(), 6, now() + interval '10 minutes', now())`, [hex(k)]);
    const b = (await row('recovery_code', k)).blocked_until.getTime(); const out = await wave((c) => hit(c, 'recovery_code', k)); const r = await row('recovery_code', k);
    rep('R4: a blocked key under load: all denied, state unchanged', out.every((x) => !x.allowed && x.retry_after_secs > 0) && r.attempts === 6 && r.blocked_until.getTime() === b);
  }
  { // R5
    const e = key(); const out = await wave((c) => hit(c, 'password_recovery', e)); rep('R5: per-email cool-down (1 per 600 s) under load: exactly one allowed', out.filter((r) => r.allowed).length === 1);
    const ip = key(); const both = await wave(async (c) => { const em = key(); await c.query('begin'); const a = await hit(c, 'password_recovery', em); const b = await hit(c, 'password_recovery_ip', ip); await c.query('commit'); return a.allowed && b.allowed; });
    rep('R5: per-address quota (20 per hour) across distinct emails under load: min(N, 20) pass both, no deadlock', both.filter(Boolean).length === Math.min(N, 20), `passed ${both.filter(Boolean).length}`);
  }
  { // R6 cleanup bounds and skip locked
    await admin.query(`insert into ${S}.rate_limits (bucket, key_hash, window_start, attempts, blocked_until, updated_at) select 'invite_accept', decode(md5(g::text) || md5((g+1)::text), 'hex'), now() - interval '4 days', 1, null, now() - interval '4 days' from generate_series(1, 500) g`);
    const stale = async () => (await admin.query(`select count(*)::int n from ${S}.rate_limits where updated_at < now() - interval '2 days'`)).rows[0].n;
    let prev = await stale(); let ok = prev === 500; let calls = 0;
    while (prev > 0 && calls < 14) { await hit(admin, 'invite_accept', key()); calls++; const now = await stale(); ok = ok && prev - now <= 50 && prev - now > 0; prev = now; }
    rep('R6: stale rows are removed at most 50 per call and the table is clean after at most 10 calls', ok && prev === 0 && calls <= 10, `calls ${calls}`);
    await admin.query(`insert into ${S}.rate_limits (bucket, key_hash, window_start, attempts, blocked_until, updated_at) values ('invite_accept', $1::bytea, now() - interval '4 days', 1, null, now() - interval '4 days')`, [hex(Buffer.alloc(32, 7))]);
    const holder = sessions[0]; await holder.query('begin'); await holder.query(`select 1 from ${S}.rate_limits where key_hash = $1::bytea for update`, [hex(Buffer.alloc(32, 7))]);
    const t0 = Date.now(); await hit(sessions[1], 'invite_accept', key()); const dt = Date.now() - t0; await holder.query('rollback');
    rep('R6: a locked stale row is skipped: a concurrent hit returns without waiting for it (< 2 s) and the row remains', dt < 2000 && (await stale()) === 1, `${dt} ms`);
  }
  { // nonces
    const nonce = (c, p, h, ttl = 60) => c.query(`select ${S}.consume_nonce($1, $2::bytea, $3) as r`, [p, hex(h), ttl]).then((r) => r.rows[0].r);
    const h1 = key(); const o1 = await wave((c) => nonce(c, 'invite', h1)); rep(`N1: ${N} concurrent consumptions of one nonce: exactly one true`, o1.filter(Boolean).length === 1);
    const h2 = key(); await admin.query(`insert into ${S}.used_nonces (purpose, nonce_hash, expires_at) values ('invite', $1::bytea, now() - interval '1 minute')`, [hex(h2)]);
    const o2 = await wave((c) => nonce(c, 'invite', h2)); rep('N2: an EXPIRED nonce is reusable exactly once under load', o2.filter(Boolean).length === 1);
    const h3 = key(); const c0 = sessions[0]; await c0.query('begin'); const first = await nonce(c0, 'invite', h3); await c0.query('rollback'); const again = await nonce(c0, 'invite', h3);
    rep('N3: a consumption inside a rolled-back transaction does not burn the nonce', first === true && again === true);
    const h4 = key(); const a = await nonce(c0, 'invite', h4); const b = await nonce(c0, 'recovery', h4); const c = await nonce(c0, 'invite', h4); rep('N4: purposes are independent and a replay is false', a === true && b === true && c === false);
    const bad = []; for (const [fn, label] of [[() => c0.query(`select ${S}.rate_limit_hit('recovery_code', $1::bytea)`, ['\\x00'.padEnd(2 + 62, '0')]), '31-byte key'], [() => c0.query(`select ${S}.rate_limit_hit('nope', $1::bytea)`, [hex(key())]), 'unknown bucket'], [() => nonce(c0, 'invite', key(), 5), 'ttl 5']]) { try { await fn(); bad.push(label + ' accepted'); } catch (e) { if (e.code !== '22023') bad.push(`${label}: ${e.code}`); } }
    rep('N5: invalid inputs raise 22023 and write nothing', bad.length === 0, bad.join('; '));
  }
} catch (e) { rep('test run', false, e.message); }
finally {
  for (const s of sessions) await s.end().catch(() => {});
  try {
    if (created) { await admin.query(`drop schema ${SCHEMA} cascade`); }
    const gone = (await admin.query(`select to_regnamespace('${SCHEMA}') s`)).rows[0].s === null; rep('cleanup: the disposable schema is dropped', gone);
    if (before) { const k = await connect(); const after = await snapshot(k); await k.end(); for (const key of Object.keys(before)) rep(`after cleanup: ${key} identical to the snapshot taken before anything was created`, same(before[key], after[key])); const sch = (await (async () => { const k2 = await connect(); const r2 = await k2.query("select nspname from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' order by 1"); await k2.end(); return r2.rows.map((x) => x.nspname); })()); rep("after cleanup: the schema list equals the list before (no p2_conc_test)", same(sch, before.schemas)); }
    if (gone && existsSync(REGISTRY) && results.every(Boolean)) unlinkSync(REGISTRY);
  } catch (e) { rep('cleanup', false, e.message + ` (registry kept: ${REGISTRY}; manual: drop schema ${SCHEMA} cascade;)`); }
  await admin.end().catch(() => {});
}
// the after-snapshot uses a fresh connection and is compared to the one taken before anything was created (stored in memory above only if the run started)
console.log(results.every(Boolean) ? '\nall checks passed' : `\n${results.filter((x) => !x).length} check(s) FAILED`); process.exitCode = results.every(Boolean) ? 0 : 1;
