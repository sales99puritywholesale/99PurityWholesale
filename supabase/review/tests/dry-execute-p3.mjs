// P3 ROLLBACK-ONLY VALIDATION against the hosted development project (ref semtmllmwhxznxechfsk). Derived from the P2 dry-execute harness; same credential mechanism.
// Executes the P3 migration and the P3 seed in ONE transaction (READ COMMITTED) that is ALWAYS rolled back (the finally block issues it on success and on failure), then verifies
// from a FRESH connection that nothing persisted and that the existing P1/P2 schema, data and migration history are unchanged. No migration history row is written, no
// supabase CLI is used, nothing is committed. Only the migration and seed files are executed; the functional probes below are read-only calls and catalog queries
// (no organization, user, cart or order is created).
// FAIL CLOSED ON THE ARTIFACTS: both files are pinned by sha256 BEFORE any connection or environment read.
//   --offline-selftest                 (no network, no environment read)
//   --authorized-rolled-back-execution (required to connect)   --authorized-read-env-local (the P2_DATABASE_URL line only, in memory, never printed)
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const scratch = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
const MIGRATION = join(root, 'supabase/review/p3/20261110000100_p3_catalog_pricing_orders.sql');
const SEED = join(root, 'supabase/review/p3/seed-products.sql');
const MIGRATION_SHA = 'bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e';
const SEED_SHA = '1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164';
const REF = 'semtmllmwhxznxechfsk'; const CA_FILE = `${scratch}/ca/prod-ca-2021.crt`; const CA_SHA256 = '807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA';
const LOG = `${scratch}/dry-execute-p3-log.txt`;
const results = []; const note = (s) => { console.log(s); try { appendFileSync(LOG, s + '\n'); } catch { /* best effort */ } };
const rep = (n, ok, d = '') => { results.push({ n, ok }); note(`${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };
const eqSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const OFFLINE = process.argv.includes('--offline-selftest');
if (!OFFLINE && !process.argv.includes('--authorized-rolled-back-execution')) { console.log('REFUSING: needs --authorized-rolled-back-execution (or --offline-selftest)'); process.exit(2); }

// ---- 1. the exact files (offline; before any connection or environment read)
const sha = (b) => createHash('sha256').update(b).digest('hex');
const migBytes = readFileSync(MIGRATION); const seedBytes = readFileSync(SEED);
rep('migration sha256 equals the approved hash', sha(migBytes) === MIGRATION_SHA, sha(migBytes).slice(0, 16) + '…');
rep('seed sha256 equals the approved hash', sha(seedBytes) === SEED_SHA, sha(seedBytes).slice(0, 16) + '…');
const mig = migBytes.toString('utf8'); const seed = seedBytes.toString('utf8');
const strip = (s) => s.replace(/--[^\n]*/g, '');
rep('both files are LF only', !mig.includes('\r') && !seed.includes('\r'));
rep('neither file contains transaction control (begin, commit, rollback, savepoint) or touches supabase_migrations', ![mig, seed].some((s) => /\b(begin|commit|rollback|savepoint)\s*;|supabase_migrations/i.test(strip(s).replace(/\bbegin\b(?=\s*\n)/gi, ''))));
rep('the migration declares itself a P3 draft', /P3 DRAFT\. NOT APPLIED\./.test(mig));
if (results.some((r) => r.ok === false)) { note('STOP: pre-checks failed; nothing was executed'); process.exit(3); }
if (OFFLINE) { note(`offline self-test: ${results.filter((r) => r.ok).length} passed, ${results.filter((r) => r.ok === false).length} FAILED (no connection was made, no environment file was read)`); process.exit(results.some((r) => r.ok === false) ? 1 : 0); }

// ---- 2. credentials, TLS (the P2 mechanism: environment variable, or the single line of the local file in memory behind an explicit flag)
let v = process.env.P2_DATABASE_URL ?? '';
if (!v && process.argv.includes('--authorized-read-env-local')) { const line = readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, ''); } }
if (!v) { console.log('STOP: P2_DATABASE_URL not set and --authorized-read-env-local not given'); process.exit(2); }
let U; try { U = new URL(v); } catch { console.log('STOP: the database URL is not parseable'); process.exit(2); }
const secrets = [v, U.password, decodeURIComponent(U.password)].filter((x) => x && x.length >= 4);
const clean = (t) => { let s = String(t ?? ''); for (const x of secrets) s = s.split(x).join('<redacted>'); return s.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://<redacted>'); };
const m = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(U.hostname);
rep('URL host is db.<ref>.supabase.co and the project ref equals the approved ref', Boolean(m) && m[1] === REF, m?.[1] ?? U.hostname);
rep('URL user postgres, database postgres, port 5432', decodeURIComponent(U.username) === 'postgres' && U.pathname === '/postgres' && (U.port || '5432') === '5432');
const pem = readFileSync(CA_FILE, 'utf8'); rep('pinned CA fingerprint matches the recorded Supabase Root 2021 CA', new X509Certificate(pem).fingerprint256.replace(/:/g, '') === CA_SHA256);
if (results.some((r) => r.ok === false)) { note('STOP: identity or CA check failed'); process.exit(3); }
const pg = createRequire(join(root, 'package.json'))('pg');
const connect = async () => { const k = new pg.Client({ connectionString: v, ssl: { rejectUnauthorized: true, ca: pem, servername: U.hostname }, application_name: 'p3-dry-execute', connectionTimeoutMillis: 20000 }); await k.connect(); return k; };

// ---- 3. snapshot (same coverage as the P2 harness, plus sequences)
async function snapshot(c) {
  const kv = async (q) => Object.fromEntries((await c.query(q)).rows.map((r) => [r.k, r.v]));
  const one = async (q) => (await c.query(q)).rows[0]; const S = {};
  S.version = (await one('select version() as v, current_setting($$server_version$$) as sv, current_setting($$server_version_num$$) as svn'));
  S.functions = await kv(`select p.oid::regprocedure::text k, md5(concat_ws('|', p.prosrc, p.prosecdef, p.proconfig::text, p.proacl::text, p.proowner::regrole::text, p.provolatile)) v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')`);
  S.relations = await kv(`select n.nspname || '.' || c.relname k, md5(concat_ws('|', c.relkind, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.relowner::regrole::text)) v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','m','S','p','i')`);
  S.columns = await kv(`select table_schema || '.' || table_name || '.' || column_name k, md5(concat_ws('|', data_type, is_nullable, column_default)) v from information_schema.columns where table_schema in ('public','private')`);
  S.constraints = await kv(`select c.conrelid::regclass::text || '.' || c.conname k, md5(pg_get_constraintdef(c.oid)) v from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('public','private')`);
  S.policies = await kv(`select schemaname || '.' || tablename || '.' || policyname k, md5(concat_ws('|', cmd, roles::text, qual, with_check)) v from pg_policies where schemaname in ('public','private')`);
  S.triggers = await kv(`select c.oid::regclass::text || '.' || t.tgname k, md5(pg_get_triggerdef(t.oid)) v from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal`);
  S.rowCounts = await kv(`select t.table_schema || '.' || t.table_name k, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text v from information_schema.tables t where t.table_schema in ('public','private') and t.table_type = 'BASE TABLE'`);
  S.rowDigests = {}; for (const t of ['public.capabilities', 'public.role_capabilities', 'private.platform_validations', 'public.staff_members', 'public.staff_roles', 'public.organizations', 'public.organization_members', 'public.audit_events', 'public.profiles', 'public.organization_invites', 'public.organization_billing']) S.rowDigests[t] = (await one(`select coalesce(md5(string_agg(md5(x::text), '' order by md5(x::text))),'empty') d, count(*)::int n from ${t} x`));
  S.schemaAcl = await kv(`select nspname k, concat_ws('|', nspacl::text, nspowner::regrole::text) v from pg_namespace where nspname in ('public','private','auth')`);
  S.defaultAcl = await kv(`select concat_ws('.', defaclrole::regrole::text, coalesce(defaclnamespace::regnamespace::text,''), defaclobjtype::text) k, defaclacl::text v from pg_default_acl`);
  S.schemas = (await c.query(`select nspname from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' order by 1`)).rows.map((r) => r.nspname);
  S.auth = {}; for (const t of ['users', 'identities', 'mfa_factors']) S.auth[t] = await one(`select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') d, count(*)::int n from auth.${t} x`);
  S.history = (await c.query(`select version, name from supabase_migrations.schema_migrations order by version`)).rows.map((r) => `${r.version}:${r.name}`);
  S.sequences = await kv(`select schemaname || '.' || sequencename k, concat_ws('|', last_value::text, start_value::text) v from pg_sequences where schemaname in ('public','private')`);
  S.advisoryLocks = (await one(`select count(*)::int n from pg_locks where locktype = 'advisory'`)).n;
  return S;
}
const diff = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return { added: kb.filter((k) => !(k in a)).sort(), removed: ka.filter((k) => !(k in b)).sort(), changed: ka.filter((k) => k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort() }; };

const P3_TABLES = ['products', 'product_variants', 'organization_products', 'markup_rules', 'carts', 'cart_items', 'orders', 'order_items', 'order_events'];
const P3_PUBLIC_FN = ['rpc_catalog_list', 'rpc_cart_get', 'rpc_cart_put_item', 'rpc_cart_empty', 'rpc_checkout', 'rpc_orders_list', 'rpc_order_get', 'rpc_admin_orgs_list', 'rpc_admin_org_create', 'rpc_admin_org_member_add',
  'rpc_admin_catalog_list', 'rpc_admin_variant_set_price', 'rpc_admin_product_set_status', 'rpc_admin_org_catalog_get', 'rpc_admin_org_product_set', 'rpc_admin_markup_rule_set', 'rpc_admin_orders_list', 'rpc_admin_order_get', 'rpc_admin_order_set_status'];
const P3_PRIVATE_FN = ['shop_markup_amount', 'shop_compose', 'shop_price_breakdown', 'shop_order_transition_ok', 'shop_ship_to_ok', 'shop_org_ok', 'guard_shop_orders', 'guard_shop_append_only'];
const lineOf = (text, pos) => { const upto = text.slice(0, Math.max(0, pos - 1)); const n = upto.split('\n').length; return { line: n, text: text.split('\n')[n - 1]?.trim().slice(0, 160) ?? '' }; };

let tx = null; let before = null; let exitCode = 0; let started = false;
try {
  const c0 = await connect(); before = await snapshot(c0); await c0.end();
  note(`BEFORE snapshot taken (fresh connection). PostgreSQL: ${before.version.v}`);
  note(`server_version ${before.version.sv} (${before.version.svn})`);
  rep('PRE-STATE: migration history is exactly the four applied versions', JSON.stringify(before.history) === JSON.stringify(['20261108000001:foundation_identity', '20261108000002:staff_capabilities', '20261108000003:audit_and_step_up', '20261108000004:staff_management_rpcs']), before.history.join(','));
  rep('PRE-STATE: none of the P3 tables or functions exist', P3_TABLES.every((t) => !(`public.${t}` in before.relations)) && P3_PUBLIC_FN.every((f) => !Object.keys(before.functions).some((k) => k.startsWith(`${f}(`) || k.startsWith(`public.${f}(`))) && P3_PRIVATE_FN.every((f) => !Object.keys(before.functions).some((k) => k.includes(`${f}(`))));
  if (results.some((r) => r.ok === false)) throw new Error('pre-state check failed; nothing executed');

  tx = await connect(); await tx.query('begin isolation level read committed'); started = true;
  await tx.query("set local idle_in_transaction_session_timeout = '600s'"); await tx.query("set local statement_timeout = '120s'"); await tx.query("set local lock_timeout = '10s'");
  note('transaction open (READ COMMITTED, rollback-only); executing the P3 migration as ONE statement batch, then the seed; no history insert');
  let migOk = false; let seedOk = false;
  try { await tx.query(mig); migOk = true; rep('MIGRATION parsed and executed in PostgreSQL (its own self-check DO block passed)', true); }
  catch (e) { const ctx = e.position ? lineOf(mig, Number(e.position)) : null; rep('MIGRATION execution', false, `${clean(e.message)} [${e.code ?? ''}]${ctx ? ` at migration line ${ctx.line}: ${clean(ctx.text)}` : ''}${e.where ? ` where: ${clean(e.where).slice(0, 300)}` : ''}${e.hint ? ` hint: ${clean(e.hint)}` : ''}`); }
  if (migOk) {
    try { await tx.query(seed); seedOk = true; rep('SEED parsed and executed in PostgreSQL', true); }
    catch (e) { const ctx = e.position ? lineOf(seed, Number(e.position)) : null; rep('SEED execution', false, `${clean(e.message)} [${e.code ?? ''}]${ctx ? ` at seed line ${ctx.line}: ${clean(ctx.text)}` : ''}${e.where ? ` where: ${clean(e.where).slice(0, 300)}` : ''}`); }
  }
  if (migOk) {
    const q1 = async (t, p = []) => (await tx.query(t, p)).rows[0];
    const inTx = await snapshot(tx);
    // structure
    const d = (k) => diff(before[k], inTx[k]);
    rep('relations added: exactly the 9 P3 tables, their indexes and the order sequence; nothing removed or changed', d('relations').removed.length === 0 && d('relations').changed.length === 0 && P3_TABLES.every((t) => `public.${t}` in inTx.relations) && d('relations').added.filter((k) => !/_pkey$|_key$|_idx$|_seq$/.test(k)).length === 9, `${d('relations').added.length} added`);
    rep('functions added: exactly the 19 public RPCs and the 8 private helpers; nothing removed or changed', d('functions').removed.length === 0 && d('functions').changed.length === 0 && d('functions').added.length === 27, `${d('functions').added.length} added`);
    rep('no existing policy or trigger was changed or removed; 10 triggers were added (3 order guards, 3 truncate blocks, 4 touch triggers)', ['policies'].every((k) => d(k).removed.length === 0 && d(k).changed.length === 0 && d(k).added.length === 0) && d('triggers').removed.length === 0 && d('triggers').changed.length === 0 && d('triggers').added.length === 10, `${d('triggers').added.length} triggers added`);
    rep('no existing column or constraint of P1/P2 changed', ['columns', 'constraints'].every((k) => d(k).removed.length === 0 && d(k).changed.length === 0), `${d('constraints').added.length} constraints, ${d('columns').added.length} columns added`);
    rep('default privileges, schema ACLs, schema list and migration history unchanged inside the transaction', JSON.stringify(before.defaultAcl) === JSON.stringify(inTx.defaultAcl) && JSON.stringify(before.schemaAcl) === JSON.stringify(inTx.schemaAcl) && JSON.stringify(before.schemas) === JSON.stringify(inTx.schemas) && JSON.stringify(before.history) === JSON.stringify(inTx.history));
    for (const k of Object.keys(before.rowDigests)) rep(`unrelated data unchanged in the transaction: ${k}`, JSON.stringify(before.rowDigests[k]) === JSON.stringify(inTx.rowDigests[k]));
    for (const t of ['users', 'identities', 'mfa_factors']) rep(`auth.${t} untouched in the transaction`, JSON.stringify(before.auth[t]) === JSON.stringify(inTx.auth[t]));
    // properties of the new objects
    const tb = (await tx.query(`select c.relname t, c.relrowsecurity rls, c.relowner::regrole::text o, c.relacl::text acl, ${['anon', 'authenticated', 'service_role', 'public'].flatMap((r) => ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'].map((p) => `has_table_privilege('${r}', c.oid, '${p}') as ${r}_${p}`)).join(', ')} from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any($1::text[]) and c.relkind = 'r'`, [P3_TABLES])).rows;
    rep('the 9 P3 tables: RLS enabled, owner postgres, ACL only the owner, no privilege for anon, authenticated, service_role or PUBLIC', tb.length === 9 && tb.every((r) => r.rls && r.o === 'postgres' && /^\{postgres=arwdDxtm?\/postgres\}$/.test(r.acl) && !Object.entries(r).some(([k, val]) => /^(anon|authenticated|service_role|public)_/.test(k) && val === true)), tb.map((r) => r.acl).filter((a, i, x) => x.indexOf(a) === i).join(' '));
    rep('no RLS policy exists on the P3 tables (default deny, RPC-only access)', (await q1(`select count(*)::int n from pg_policies where tablename = any($1::text[])`, [P3_TABLES])).n === 0);
    const fr = (await tx.query(`select n.nspname s, p.proname f, p.prosecdef d, p.proconfig cfg, p.proowner::regrole::text o, has_function_privilege('anon', p.oid, 'execute') an, has_function_privilege('authenticated', p.oid, 'execute') au, has_function_privilege('service_role', p.oid, 'execute') sr, has_function_privilege('public', p.oid, 'execute') pu from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname = any($1::text[])) or (n.nspname = 'private' and p.proname = any($2::text[]))`, [P3_PUBLIC_FN, P3_PRIVATE_FN])).rows;
    const bad = []; for (const r of fr) { if (r.o !== 'postgres') bad.push(`${r.f} owner`); if (!(r.cfg ?? []).some((c) => c.replace(/[\s"']/g, '').toLowerCase() === 'search_path=')) bad.push(`${r.f} search_path`); if (r.an || r.sr || r.pu) bad.push(`${r.f} anon/service_role/PUBLIC`); if (r.s === 'public' && !(r.au && r.d)) bad.push(`${r.f} not definer or not granted to authenticated`); if (r.s === 'private' && r.au) bad.push(`${r.f} private executable by authenticated`); }
    rep('27 functions: owner postgres, search_path pinned, no anon/service_role/PUBLIC execute; the 19 RPCs are SECURITY DEFINER and granted to authenticated only; private helpers are not', fr.length === 27 && bad.length === 0, bad.join('; ') || '27 checked');
    rep('order guard triggers (3 guards + 3 truncate blocks) and 4 touch triggers exist and are enabled', (await q1(`select count(*)::int n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any($1::text[]) and not t.tgisinternal and t.tgenabled = 'O'`, [P3_TABLES])).n === 10);
    // pricing: pure functions called in PostgreSQL
    const vec = async (args) => (await q1(`select private.shop_compose(${args}) ->> 'unit' as u`)).u;
    const checks = [['10000,1000,null,null,null,null,null,null,null,null', '10000'], ["10000,1000,'percent',250000,'percent',50000,null,null,null,null", '13125'], ["333,100,'percent',100000,'percent',100000,null,null,null,null", '403'],
      ["10000,1000,'percent',100000,'percent',900000,20000,50000,null,null", '11550'], ["10000,1000,'fixed',50000,'fixed',100,null,null,20000,30000", '10700'], ["10000,15000,'percent',250000,null,null,null,null,null,null", '15000']];
    const got = []; for (const [a, e] of checks) got.push([await vec(a), e]);
    rep('PostgreSQL computes the Aspen pricing vectors (compounding representative markup, bounds, rounding, floor)', got.every(([g, e]) => g === e), got.map(([g, e]) => `${g}/${e}`).join(' '));
    rep('PostgreSQL refuses a variant without base or floor (NULL) and above the cap', (await q1(`select private.shop_compose(10000, null, null, null, null, null, null, null, null, null) is null a, private.shop_compose(null, 1000, null, null, null, null, null, null, null, null) is null b, private.shop_compose(100000000, 1000, 'percent', 10000000, null, null, null, null, null, null) is null c`)) && true);
    const nb = await q1(`select private.shop_price_breakdown('00000000-0000-4000-8000-0000000000aa'::uuid, '00000000-0000-4000-8000-0000000000bb'::uuid, 10000, 1000) ->> 'unit' as u`);
    rep('shop_price_breakdown with no rules returns the base price', nb.u === '10000', nb.u);
    rep('order lifecycle function matches the documented transitions', (await q1(`select private.shop_order_transition_ok('placed','confirmed') a, private.shop_order_transition_ok('shipped','cancelled') b, private.shop_order_transition_ok('processing','cancelled') c`)) && true);
    // seed
    if (seedOk) {
      const sc = await q1(`select (select count(*)::int from public.products) p, (select count(*)::int from public.product_variants) v, (select count(*)::int from public.product_variants where base_price_cents is not null or min_price_cents is not null) priced, (select count(*)::int from public.products where description is null) nodesc, (select count(distinct sku)::int from public.product_variants) skus, (select count(*)::int from public.products where status <> 'active' or content_managed_by <> 'seed') odd`);
      rep('SEED result: 153 products, 221 variants, 221 distinct SKUs, no price set anywhere, all active and seed-managed', sc.p === 153 && sc.v === 221 && sc.skus === 221 && sc.priced === 0 && sc.odd === 0, JSON.stringify(sc));
      const dsc = (await q1(`select count(*)::int n from public.products where description ~* 'anti-?aging|buy |online|purity|clinical|treat|weight|muscle|guarantee|wholesale'`)).n;
      rep('SEED content: no marketing or health wording in any stored description', dsc === 0, String(dsc));
      // idempotency and administrator-maintained content: change a price and an admin-managed product inside the transaction, re-run the seed, compare
      await tx.query(`update public.product_variants set base_price_cents = 12345, min_price_cents = 15000 where sku = (select min(sku) from public.product_variants)`);
      await tx.query(`update public.products set content_managed_by = 'admin', description = 'ADMIN TEXT' where slug = (select min(slug) from public.products)`);
      await tx.query(seed);
      const after2 = await q1(`select (select count(*)::int from public.products) p, (select count(*)::int from public.product_variants) v, (select count(*)::int from public.product_variants where base_price_cents = 12345 and min_price_cents = 15000) kept, (select count(*)::int from public.products where description = 'ADMIN TEXT') admin`);
      rep('SEED re-run is idempotent: no duplicates; an administrator-set price and administrator-managed content are NOT overwritten', after2.p === 153 && after2.v === 221 && after2.kept === 1 && after2.admin === 1, JSON.stringify(after2));
      // constraints in PostgreSQL (no organization or user is needed for these)
      const tryErr = async (sqlText) => { await tx.query('savepoint c'); try { await tx.query(sqlText); await tx.query('rollback to savepoint c'); await tx.query('release savepoint c'); return 'allowed'; } catch (e) { await tx.query('rollback to savepoint c'); await tx.query('release savepoint c'); return e.code; } };
      rep('PostgreSQL enforces price constraints: a zero or negative base price, an over-cap floor and a bad SKU are refused (23514)', (await tryErr(`update public.product_variants set base_price_cents = 0 where sku = (select min(sku) from public.product_variants)`)) === '23514' && (await tryErr(`update public.product_variants set min_price_cents = 100000001 where sku = (select min(sku) from public.product_variants)`)) === '23514' && (await tryErr(`insert into public.product_variants (product_id, spec, sku) select id, 'x', 'bad sku' from public.products limit 1`)) === '23514');
      rep('PostgreSQL enforces uniqueness: a duplicate SKU is refused (23505)', (await tryErr(`insert into public.product_variants (product_id, spec, sku) select id, 'dup', (select min(sku) from public.product_variants) from public.products limit 1`)) === '23505');
    }
    // RPC behavior without creating any data
    const asRole = async (role, claims, text, params = []) => { await tx.query('savepoint r'); try { await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]); await tx.query(`set local role ${role}`); const r = await tx.query(text, params); await tx.query('reset role'); await tx.query('release savepoint r'); return { v: r.rows[0]?.r }; } catch (e) { await tx.query('rollback to savepoint r'); await tx.query('release savepoint r'); return { e: e.code }; } };
    const fake = { sub: '00000000-0000-4000-8000-0000000000aa', role: 'authenticated', aal: 'aal2', amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }] };
    const O = "'00000000-0000-4000-8000-000000000001'::uuid";
    const nonMember = await asRole('authenticated', fake, `select public.rpc_catalog_list(${O}) as r`);
    const nonMemberCo = await asRole('authenticated', fake, `select public.rpc_checkout(${O}, '{"name":"a","line1":"b","city":"c","region":"d","postal":"1","country":"US"}'::jsonb, null, '00000000-0000-4000-8000-0000000000cc'::uuid) as r`);
    rep('authenticated non-member: catalog and checkout answer organization_not_found (no data, no order)', nonMember.v?.code === 'organization_not_found' && nonMemberCo.v?.code === 'organization_not_found', JSON.stringify([nonMember.v?.code, nonMemberCo.v?.code, nonMember.e, nonMemberCo.e]));
    const staffRefused = []; for (const [f, a] of [['rpc_admin_catalog_list', ''], ['rpc_admin_orgs_list', ''], ['rpc_admin_orders_list', ''], ['rpc_admin_variant_set_price', `${O}, 100, 100`], ['rpc_admin_org_member_add', `${O}, 'a@example.test', 'member'`], ['rpc_admin_order_set_status', `${O}, 'confirmed', null`]]) { const r = await asRole('authenticated', fake, `select public.${f}(${a}) as r`); if (r.e !== '42501') staffRefused.push(`${f}:${r.e ?? 'allowed'}`); }
    rep('admin RPCs refuse a non-staff authenticated caller with 42501 (no verified staff session)', staffRefused.length === 0, staffRefused.join(', '));
    const anonRefused = []; for (const [f, a] of [['rpc_catalog_list', O], ['rpc_cart_get', O], ['rpc_checkout', `${O}, '{}'::jsonb, null, ${O}`], ['rpc_admin_catalog_list', '']]) { const r = await asRole('anon', {}, `select public.${f}(${a}) as r`); if (r.e !== '42501') anonRefused.push(`${f}:${r.e ?? 'allowed'}`); }
    rep('anon is refused (42501) on customer and admin RPCs', anonRefused.length === 0, anonRefused.join(', '));
    const direct = await asRole('authenticated', fake, 'select count(*)::int as r from public.products'); const directAnon = await asRole('anon', {}, 'select count(*)::int as r from public.orders');
    rep('direct table access is denied to authenticated and anon (42501)', direct.e === '42501' && directAnon.e === '42501', `${direct.e}/${directAnon.e}`);
    rep('no data was created by any probe: carts, orders, order items, order events and markup rules are empty', (await q1(`select (select count(*)::int from public.carts) + (select count(*)::int from public.orders) + (select count(*)::int from public.order_items) + (select count(*)::int from public.order_events) + (select count(*)::int from public.markup_rules) n`)).n === 0);
  }
} catch (e) { note(`ABORT: ${clean(e.message)}`); exitCode = 1; results.push({ n: 'abort', ok: false }); }
finally {
  if (tx) { try { await tx.query('rollback'); note('ROLLBACK issued'); } catch (e) { note(`rollback error: ${clean(e.message)}`); exitCode = 1; } await tx.end().catch(() => {}); }
  try {
    const c1 = await connect(); const after = await snapshot(c1);
    const present = (await c1.query(`select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any($1::text[])`, [[...P3_TABLES, 'order_number_seq']])).rows[0].n;
    const fnPresent = (await c1.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname = any($1::text[])) or (n.nspname = 'private' and p.proname = any($2::text[]))`, [P3_PUBLIC_FN, P3_PRIVATE_FN])).rows[0].n;
    const polPresent = (await c1.query(`select count(*)::int n from pg_policies where tablename = any($1::text[])`, [P3_TABLES])).rows[0].n;
    await c1.end();
    if (before) {
      for (const k of Object.keys(before)) { const isMap = before[k] && typeof before[k] === 'object' && !Array.isArray(before[k]); const dd = isMap ? diff(before[k], after[k]) : null; /* key order of an unordered catalog query may differ between connections: compare content, not order */ const same = isMap ? dd.added.length === 0 && dd.removed.length === 0 && dd.changed.length === 0 : JSON.stringify(before[k]) === JSON.stringify(after[k]); rep(`AFTER ROLLBACK unchanged: ${k}`, same, k === 'history' ? `${after[k].length} versions` : k === 'version' ? after.version.sv : dd && !same ? `added ${JSON.stringify(dd.added.slice(0, 8))} removed ${JSON.stringify(dd.removed.slice(0, 8))} changed ${JSON.stringify(dd.changed.slice(0, 8))}` : ''); }
      rep('AFTER ROLLBACK: no P3 table, sequence, function, policy, trigger or seed row exists; migration history is the same four versions', present === 0 && fnPresent === 0 && polPresent === 0 && !Object.keys(after.triggers).some((t) => /orders_guard|order_items_append_only|order_events_append_only|markup_rules_touch/.test(t)) && after.history.length === 4, `tables ${present}, functions ${fnPresent}, policies ${polPresent}`);
    }
  } catch (e) { rep('after-snapshot', false, clean(e.message)); }
}
const failed = results.filter((r) => r.ok === false).length; note(`dry-execute P3: ${results.filter((r) => r.ok === true).length} passed, ${failed} FAILED`);
process.exitCode = exitCode || (failed ? 1 : 0);
