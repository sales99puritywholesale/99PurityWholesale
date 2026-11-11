// P3 PERSISTENT APPLY HARNESS (prepared offline; NEVER RUN against a database yet). Applies the promoted P3 migration, the seed and the migration-history entry to the hosted development project
// (ref semtmllmwhxznxechfsk) in ONE READ COMMITTED transaction, verifies everything before commit, and COMMITS only in an explicitly confirmed commit mode. Otherwise it ROLLS BACK ("rehearsal").
// This is NOT the rollback dry-run harness: the COMMIT path is new and has never executed on a real database. Offline tests exercise its logic against a scripted fake database only.
//
// MODES (mutually exclusive; both flags together are refused):
//   rehearsal  --authorized-rolled-back-execution   migration + seed + history row + full verification, then ROLLBACK, then fresh-connection proof that nothing persisted
//   commit     --authorized-persistent-apply --approval-ref <ref> --commit-confirm p3-apply:<migration sha 12>:<seed sha 12>:<this file's sha 12>
// Always required to connect: --harness-sha <this file's sha256>  and credentials via --authorized-read-env-local (the single P2_DATABASE_URL line, in memory) or P2_DATABASE_URL in the process environment.
// Offline: --offline-selftest (no network, no environment read).
//
// SAFETY MODEL (each item is covered by an offline test unless marked "hosted only"):
//  * every artifact is hash-pinned and verified BEFORE any environment read or connection; the promoted migration must be byte-identical to the reviewed candidate and must not be the original defective draft;
//  * the target (host ref, user, database, port) and the pinned CA are verified; TLS is always strict (rejectUnauthorized true); the client is built from URL COMPONENTS, never from the connection string (the pg driver lets a
//    connection string override ssl: sslmode=disable/no-verify/require), a URL with any SSL parameter is refused, and every session is checked to be TLS with a verified peer; a connection or TLS failure stops the run, nothing is retried or downgraded;
//  * every statement goes through send(): an allow-list of exact SQL texts (plus the two pinned files) is enforced BEFORE sending; there is exactly one site that can send COMMIT, and it is reached only in commit mode after every
//    in-transaction check passed; there is no retry anywhere; DDL, seed and history row share ONE transaction (all or nothing);
//  * pre-state gates (history schema, exactly the four known versions, no P3 object) run on a fresh connection and AGAIN inside the transaction after an advisory lock (duplicate or racing execution is refused);
//  * the verification is READ-ONLY (no probe writes anything; the seed idempotency probe of the dry run, which updates rows, is deliberately NOT part of this harness);
//  * an ambiguous COMMIT (error after COMMIT was sent) is never retried or "repaired": a fresh connection reports which state the database is in and the run exits non-zero;
//  * after commit, a fresh connection repeats the full verification; if it fails nothing is cleaned up automatically (exit 5: a human decides).
// RISKS SPECIFIC TO THE COMMIT PATH (not present in the rollback harness) are listed in docs/P3-PERSISTENT-APPLY-HARNESS.md.
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync, readdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = 'D:/99puritywholesale-platform/99puritywholesale';
const SCRATCH = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
export const PINS = {
  ref: 'semtmllmwhxznxechfsk',
  caFile: `${SCRATCH}/ca/prod-ca-2021.crt`, caSha256: '807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA',
  migrationFile: 'supabase/migrations/20261110000100_p3_catalog_pricing_orders.sql', migrationName: '20261110000100_p3_catalog_pricing_orders.sql',
  migrationSha: 'd5efe7e9753b13c6ccaedf1fb70d31ab3431d967d46764ceb3cb290ce5195beb',
  draftFile: 'supabase/review/p3/20261110000100_p3_catalog_pricing_orders.rev2.sql',
  originalFile: 'supabase/review/p3/20261110000100_p3_catalog_pricing_orders.sql', originalSha: 'bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e',
  seedFile: 'supabase/review/p3/seed-products.sql', seedSha: '1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164',
  hashesFile: 'supabase/migration-hashes.txt', hashesSha: '89d3b7142ab4e31b931ea70f70ad19e9393f128a2c92541bc33dfad5cd8d2380',
  tierRManifestFile: 'docs/P3-TIER-R-EXECUTION-MANIFEST.md', tierRManifestSha: '725e769c2a0c145b1d96f1fbe76591dd4c3c6c388ae0c25c408eb0b57429fb90',
  priorMigrations: {
    '20261108000001_foundation_identity.sql': '28e2cebf55e07679b71c7bbb7453517e3cde8c1b420e4eab9088ef98b544011e',
    '20261108000002_staff_capabilities.sql': '852f13efef9754b1882ec17ef2e3ab2833c66143233af21c396abc20b28823ee',
    '20261108000003_audit_and_step_up.sql': 'e1aa9d15696913e25f5916ccc036b9c5f44d668dba95922dea87c5ac36e5fa60',
    '20261108000004_staff_management_rpcs.sql': '8a6a5003d46ecd0daa1f5149566ac452076f637a9ed38a9da5125273551fc12b',
  },
  priorHistory: [['20261108000001', 'foundation_identity'], ['20261108000002', 'staff_capabilities'], ['20261108000003', 'audit_and_step_up'], ['20261108000004', 'staff_management_rpcs']],
  newVersion: '20261110000100', newName: 'p3_catalog_pricing_orders',
};
export const EXIT = { OK: 0, FAILED_ROLLED_BACK: 1, REFUSED_PRECHECK: 2, REFUSED_CONNECT: 3, REFUSED_STATE: 4, COMMITTED_BUT_UNVERIFIED: 5, COMMIT_AMBIGUOUS: 6, INCONSISTENT: 7 };

export const sha = (b) => createHash('sha256').update(b).digest('hex');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const eqSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// ------------------------------------------------------------------------------------------------------------------------------------------------ reporting and redaction
let SECRETS = [];
export const setSecrets = (list) => { SECRETS = list.filter((x) => typeof x === 'string' && x.length >= 4); };
export const clean = (t) => { let s = String(t ?? ''); for (const x of SECRETS) s = s.split(x).join('<redacted>'); return s.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://<redacted>'); };
export function makeReporter(note) {
  const results = [];
  const rep = (n, ok, d = '') => { results.push({ n, ok }); note(`${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + clean(d) + ')' : ''}`); return ok; };
  return { results, rep, note, failed: () => results.filter((r) => r.ok === false).length };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ the SQL allow-list (every statement the harness may send)
export const P3_TABLES = ['products', 'product_variants', 'organization_products', 'markup_rules', 'carts', 'cart_items', 'orders', 'order_items', 'order_events'];
export const P3_PUBLIC_FN = ['rpc_catalog_list', 'rpc_cart_get', 'rpc_cart_put_item', 'rpc_cart_empty', 'rpc_checkout', 'rpc_orders_list', 'rpc_order_get', 'rpc_admin_orgs_list', 'rpc_admin_org_create', 'rpc_admin_org_member_add',
  'rpc_admin_catalog_list', 'rpc_admin_variant_set_price', 'rpc_admin_product_set_status', 'rpc_admin_org_catalog_get', 'rpc_admin_org_product_set', 'rpc_admin_markup_rule_set', 'rpc_admin_orders_list', 'rpc_admin_order_get', 'rpc_admin_order_set_status'];
export const P3_PRIVATE_FN = ['shop_markup_amount', 'shop_compose', 'shop_price_breakdown', 'shop_order_transition_ok', 'shop_ship_to_ok', 'shop_org_ok', 'guard_shop_orders', 'guard_shop_append_only'];
const DIGEST_TABLES = ['public.capabilities', 'public.role_capabilities', 'private.platform_validations', 'public.staff_members', 'public.staff_roles', 'public.organizations', 'public.organization_members', 'public.audit_events', 'public.profiles', 'public.organization_invites', 'public.organization_billing'];
const AUTH_TABLES = ['users', 'identities', 'mfa_factors'];
const O = "'00000000-0000-4000-8000-000000000001'::uuid";
const KEY_CC = "'00000000-0000-4000-8000-0000000000cc'::uuid";

export const SQL = {
  // transaction control
  begin: 'begin isolation level read committed', tl_idle: "set local idle_in_transaction_session_timeout = '600s'", tl_stmt: "set local statement_timeout = '120s'", tl_lock: "set local lock_timeout = '10s'",
  advisory: "select pg_advisory_xact_lock(hashtextextended('p3-persistent-apply', 0))",
  commit: 'commit', rollback: 'rollback', sp: 'savepoint r', spr: 'rollback to savepoint r', spx: 'release savepoint r',
  claims: "select set_config('request.jwt.claims', $1, true)", roleAuth: 'set local role authenticated', roleAnon: 'set local role anon', roleReset: 'reset role',
  // migration history
  histCols: "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'supabase_migrations' and table_name = 'schema_migrations' order by ordinal_position",
  histRowsNoStmt: 'select version, name, null::int as nstmt from supabase_migrations.schema_migrations order by version',
  histRowsStmt: 'select version, name, case when statements is null then null else cardinality(statements) end as nstmt from supabase_migrations.schema_migrations order by version',
  histInsert2: 'insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)',
  histInsert3: 'insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3::text[])',
  // presence of P3 objects (parameterised: [P3_TABLES + order_number_seq], P3_PUBLIC_FN, P3_PRIVATE_FN)
  presentRel: `select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any($1::text[])`,
  presentFn: `select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname = any($1::text[])) or (n.nspname = 'private' and p.proname = any($2::text[]))`,
  presentPol: `select count(*)::int n from pg_policies where tablename = any($1::text[])`,
  // snapshot (the statements of the proven dry-run harness, verbatim)
  sVersion: 'select version() as v, current_setting($$server_version$$) as sv, current_setting($$server_version_num$$) as svn',
  sFunctions: `select p.oid::regprocedure::text k, md5(concat_ws('|', p.prosrc, p.prosecdef, p.proconfig::text, p.proacl::text, p.proowner::regrole::text, p.provolatile)) v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')`,
  sRelations: `select n.nspname || '.' || c.relname k, md5(concat_ws('|', c.relkind, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.relowner::regrole::text)) v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','m','S','p','i')`,
  sColumns: `select table_schema || '.' || table_name || '.' || column_name k, md5(concat_ws('|', data_type, is_nullable, column_default)) v from information_schema.columns where table_schema in ('public','private')`,
  sConstraints: `select c.conrelid::regclass::text || '.' || c.conname k, md5(pg_get_constraintdef(c.oid)) v from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('public','private')`,
  sPolicies: `select schemaname || '.' || tablename || '.' || policyname k, md5(concat_ws('|', cmd, roles::text, qual, with_check)) v from pg_policies where schemaname in ('public','private')`,
  sTriggers: `select c.oid::regclass::text || '.' || t.tgname k, md5(pg_get_triggerdef(t.oid)) v from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and not t.tgisinternal`,
  sRowCounts: `select t.table_schema || '.' || t.table_name k, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text v from information_schema.tables t where t.table_schema in ('public','private') and t.table_type = 'BASE TABLE'`,
  sSchemaAcl: `select nspname k, concat_ws('|', nspacl::text, nspowner::regrole::text) v from pg_namespace where nspname in ('public','private','auth')`,
  sDefaultAcl: `select concat_ws('.', defaclrole::regrole::text, coalesce(defaclnamespace::regnamespace::text,''), defaclobjtype::text) k, defaclacl::text v from pg_default_acl`,
  sSchemas: `select nspname from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' order by 1`,
  sHistory: 'select version, name from supabase_migrations.schema_migrations order by version',
  sSequences: `select schemaname || '.' || sequencename k, concat_ws('|', last_value::text, start_value::text) v from pg_sequences where schemaname in ('public','private')`,
  sAdvisory: `select count(*)::int n from pg_locks where locktype = 'advisory'`,
  // read-only property checks (proven dry-run statements)
  tableProps: `select c.relname t, c.relrowsecurity rls, c.relowner::regrole::text o, c.relacl::text acl, ${['anon', 'authenticated', 'service_role', 'public'].flatMap((r) => ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'].map((p) => `has_table_privilege('${r}', c.oid, '${p}') as ${r}_${p}`)).join(', ')} from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any($1::text[]) and c.relkind = 'r'`,
  fnProps: `select n.nspname s, p.proname f, p.prosecdef d, p.proconfig cfg, p.proowner::regrole::text o, has_function_privilege('anon', p.oid, 'execute') an, has_function_privilege('authenticated', p.oid, 'execute') au, has_function_privilege('service_role', p.oid, 'execute') sr, has_function_privilege('public', p.oid, 'execute') pu from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname = any($1::text[])) or (n.nspname = 'private' and p.proname = any($2::text[]))`,
  trigEnabled: `select count(*)::int n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any($1::text[]) and not t.tgisinternal and t.tgenabled = 'O'`,
  seedCounts: `select (select count(*)::int from public.products) p, (select count(*)::int from public.product_variants) v, (select count(*)::int from public.product_variants where base_price_cents is not null or min_price_cents is not null) priced, (select count(*)::int from public.products where description is null) nodesc, (select count(distinct sku)::int from public.product_variants) skus, (select count(*)::int from public.products where status <> 'active' or content_managed_by <> 'seed') odd`,
  seedWording: `select count(*)::int n from public.products where description ~* 'anti-?aging|buy |online|purity|clinical|treat|weight|muscle|guarantee|wholesale'`,
  noDataCreated: `select (select count(*)::int from public.carts) + (select count(*)::int from public.cart_items) + (select count(*)::int from public.orders) + (select count(*)::int from public.order_items) + (select count(*)::int from public.order_events) + (select count(*)::int from public.markup_rules) + (select count(*)::int from public.organization_products) n`,
  seqProps: `select count(*)::int n from pg_sequences where schemaname = 'public' and sequencename = 'order_number_seq' and last_value is null`,
  pricingNull: `select private.shop_compose(10000, null, null, null, null, null, null, null, null, null) is null a, private.shop_compose(null, 1000, null, null, null, null, null, null, null, null) is null b, private.shop_compose(100000000, 1000, 'percent', 10000000, null, null, null, null, null, null) is null c`,
  pricingBreakdown: `select private.shop_price_breakdown('00000000-0000-4000-8000-0000000000aa'::uuid, '00000000-0000-4000-8000-0000000000bb'::uuid, 10000, 1000) ->> 'unit' as u`,
  transitions: `select private.shop_order_transition_ok('placed','confirmed') a, private.shop_order_transition_ok('shipped','cancelled') b, private.shop_order_transition_ok('processing','cancelled') c`,
  shipDirect: 'select private.shop_ship_to_ok($1::jsonb) as r',
  shipRpc: `select public.rpc_checkout(${O}, $1::jsonb, null, ${KEY_CC}) as r`,
  probeCatalog: `select public.rpc_catalog_list(${O}) as r`,
  probeCheckout: `select public.rpc_checkout(${O}, '{"name":"a","line1":"b","city":"c","region":"d","postal":"1","country":"US"}'::jsonb, null, ${KEY_CC}) as r`,
  probeTableAuth: 'select count(*)::int as r from public.products', probeTableAnon: 'select count(*)::int as r from public.orders',
};
export const PRICING_VECTORS = [['10000,1000,null,null,null,null,null,null,null,null', '10000'], ["10000,1000,'percent',250000,'percent',50000,null,null,null,null", '13125'], ["333,100,'percent',100000,'percent',100000,null,null,null,null", '403'],
  ["10000,1000,'percent',100000,'percent',900000,20000,50000,null,null", '11550'], ["10000,1000,'fixed',50000,'fixed',100,null,null,20000,30000", '10700'], ["10000,15000,'percent',250000,null,null,null,null,null,null", '15000']];
for (const [a] of PRICING_VECTORS) SQL[`vec:${a}`] = `select private.shop_compose(${a}) ->> 'unit' as u`;
const STAFF_PROBES = [['rpc_admin_catalog_list', ''], ['rpc_admin_orgs_list', ''], ['rpc_admin_orders_list', ''], ['rpc_admin_variant_set_price', `${O}, 100, 100`], ['rpc_admin_org_member_add', `${O}, 'a@example.test', 'member'`], ['rpc_admin_order_set_status', `${O}, 'confirmed', null`]];
for (const [f, a] of STAFF_PROBES) SQL[`staff:${f}`] = `select public.${f}(${a}) as r`;
const ANON_PROBES = [['rpc_catalog_list', O], ['rpc_cart_get', O], ['rpc_checkout', `${O}, '{}'::jsonb, null, ${O}`], ['rpc_admin_catalog_list', '']];
// an anon probe whose SQL text equals an existing probe reuses that statement id (the allow-list holds each distinct text once)
const anonId = (f) => { const text = `select public.${f}(${ANON_PROBES.find(([x]) => x === f)[1]}) as r`; return Object.entries(SQL).find(([, t]) => t === text)?.[0] ?? `anon:${f}`; };
for (const [f] of ANON_PROBES) { const id = anonId(f); if (!(id in SQL)) SQL[id] = `select public.${f}(${ANON_PROBES.find(([x]) => x === f)[1]}) as r`; }
for (const t of DIGEST_TABLES) SQL[`digest:${t}`] = `select coalesce(md5(string_agg(md5(x::text), '' order by md5(x::text))),'empty') d, count(*)::int n from ${t} x`;
for (const t of AUTH_TABLES) SQL[`auth:${t}`] = `select coalesce(md5(string_agg(md5(x::text), '' order by x.id)),'empty') d, count(*)::int n from auth.${t} x`;
export const ALLOWED = new Map(Object.entries(SQL).map(([id, text]) => [norm(text), id]));
if (ALLOWED.size !== Object.keys(SQL).length) throw new Error('duplicate SQL text in the allow-list');

/** One sender per run: refuses any text that is not in the allow-list or one of the two pinned files, BEFORE sending. */
export function makeSender(mig, seed, log = []) {
  return function send(c, text, params) {
    let id;
    if (text === mig) id = 'FILE:migration'; else if (text === seed) id = 'FILE:seed';
    else { id = ALLOWED.get(norm(text)); if (!id) throw new Error('STATEMENT NOT ALLOW-LISTED (refused before sending)'); }
    log.push(id);
    return c.query(text, params);
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ offline artifact verification (before any environment read or connection)
export function verifyArtifacts({ root = ROOT, pins = PINS } = {}) {
  const out = []; const t = (n, ok, d = '') => out.push({ n, ok: Boolean(ok), d });
  const read = (rel) => { try { return readFileSync(join(root, rel)); } catch { return null; } };
  const mig = read(pins.migrationFile); const draft = read(pins.draftFile); const orig = read(pins.originalFile); const seed = read(pins.seedFile); const hashes = read(pins.hashesFile); const tr = read(pins.tierRManifestFile);
  t('promoted migration sha256 equals the pinned hash', mig && sha(mig) === pins.migrationSha, mig ? sha(mig).slice(0, 12) : 'missing');
  t('promoted migration is byte-identical to the reviewed revision 2 candidate', mig && draft && mig.equals(draft) && sha(draft) === pins.migrationSha);
  t('the promoted migration is NOT the original defective draft (the original is preserved with its own hash)', mig && orig && sha(orig) === pins.originalSha && sha(mig) !== pins.originalSha && !mig.equals(orig));
  t('seed sha256 equals the pinned hash', seed && sha(seed) === pins.seedSha, seed ? sha(seed).slice(0, 12) : 'missing');
  t('supabase/migration-hashes.txt equals the pinned hash', hashes && sha(hashes) === pins.hashesSha, hashes ? sha(hashes).slice(0, 12) : 'missing');
  t('the Tier R execution manifest equals the pinned hash', tr && sha(tr) === pins.tierRManifestSha, tr ? sha(tr).slice(0, 12) : 'missing');
  let listed = null; try { listed = Object.fromEntries(hashes.toString('utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)).map(([h, n]) => [n, h])); } catch { /* handled below */ }
  const want = { ...pins.priorMigrations, [pins.migrationName]: pins.migrationSha };
  t('migration-hashes.txt lists exactly the four applied migrations and the promoted P3 migration with the pinned hashes', listed && JSON.stringify(Object.entries(listed).sort()) === JSON.stringify(Object.entries(want).sort()));
  let dir = null; try { dir = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort(); } catch { /* handled below */ }
  t('supabase/migrations holds exactly those five files, in filename order', dir && JSON.stringify(dir) === JSON.stringify(Object.keys(want).sort()), dir ? `${dir.length} files` : 'unreadable');
  t('each of the four applied migrations still has its recorded hash', Object.entries(pins.priorMigrations).every(([n, h]) => { const b = read(`supabase/migrations/${n}`); return b && sha(b) === h; }));
  const strip = (s) => s.replace(/--[^\n]*/g, '');
  t('migration and seed are LF only', mig && seed && !mig.includes(13) && !seed.includes(13));
  t('neither file contains transaction control (begin, commit, rollback, savepoint) or touches supabase_migrations', mig && seed && ![mig, seed].some((b) => /\b(begin|commit|rollback|savepoint)\s*;|supabase_migrations/i.test(strip(b.toString('utf8')).replace(/\bbegin\b(?=\s*\n)/gi, ''))));
  return { ok: out.every((x) => x.ok), checks: out, mig: mig ?? null, seed: seed ?? null };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ target verification (pure)
export function checkTarget(urlString, caPem, pins = PINS) {
  const out = []; const t = (n, ok) => out.push({ n, ok: Boolean(ok) });
  let U = null; try { U = new URL(urlString); } catch { /* handled */ }
  t('the database URL is parseable', U);
  if (!U) return { ok: false, checks: out, secrets: [] };
  const m = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(U.hostname);
  t('URL host is db.<ref>.supabase.co and the project ref equals the approved ref', m && m[1] === pins.ref);
  t('URL user postgres, database postgres, port 5432', decodeURIComponent(U.username) === 'postgres' && U.pathname === '/postgres' && (U.port || '5432') === '5432');
  // The pg driver lets a connection string OVERRIDE the explicit ssl option (sslmode=disable -> ssl false, no-verify -> rejectUnauthorized false, require -> {} which drops the pinned CA). The client is therefore built from
  // the parsed COMPONENTS only (buildClientConfig never passes the connection string), and a URL that carries any SSL-related parameter is refused outright.
  const sslParams = [...U.searchParams.keys()].filter((k) => /^(ssl|uselibpq|sslmode)/i.test(k));
  t('the URL carries no SSL-related query parameter (a parameter such as sslmode could weaken TLS)', sslParams.length === 0);
  let fp = null; try { fp = new X509Certificate(caPem).fingerprint256.replace(/:/g, ''); } catch { /* handled */ }
  t('pinned CA fingerprint matches the recorded Supabase Root 2021 CA', fp === pins.caSha256);
  const ok = out.every((x) => x.ok);
  const conn = { host: U.hostname, port: Number(U.port || 5432), user: safeDecode(U.username), password: safeDecode(U.password), database: safeDecode(U.pathname.replace(/^\//, '')) };
  return { ok, checks: out, secrets: [urlString, U.password, safeDecode(U.password)], ssl: { rejectUnauthorized: true, ca: caPem, servername: U.hostname }, conn };
}
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
/** The ONLY way the harness builds a client configuration: components and the strict ssl object; never a connection string (which could override ssl). */
export function buildClientConfig(tg) {
  return { host: tg.conn.host, port: tg.conn.port, user: tg.conn.user, password: tg.conn.password, database: tg.conn.database, ssl: tg.ssl, application_name: 'p3-apply', connectionTimeoutMillis: 20000, query_timeout: 300000 };
}
/** After connecting, the session must really be TLS with a verified peer (defence in depth: independent of how the configuration was merged). */
export function assertTls(client) {
  const st = client?.connection?.stream;
  if (!st || st.encrypted !== true || st.authorized !== true) { const e = new Error('TLS not verified'); e.code = 'TLS_NOT_VERIFIED'; throw e; }
}
export const expectedConfirm = (harnessSha, pins = PINS) => `p3-apply:${pins.migrationSha.slice(0, 12)}:${pins.seedSha.slice(0, 12)}:${harnessSha.slice(0, 12)}`;

// ------------------------------------------------------------------------------------------------------------------------------------------------ history plan
export function historyPlan(cols, rows = []) {
  const names = cols.map((c) => c.column_name);
  if (!names.includes('version') || !names.includes('name')) return { ok: false, reason: 'history table lacks the version/name columns' };
  const other = cols.filter((c) => !['version', 'name', 'statements'].includes(c.column_name));
  const unfillable = other.filter((c) => c.is_nullable === 'NO' && c.column_default === null);
  if (unfillable.length) return { ok: false, reason: `history table has required column(s) the harness cannot fill: ${unfillable.map((c) => c.column_name).join(',')}` };
  const stmt = cols.find((c) => c.column_name === 'statements');
  if (!stmt) return { ok: true, variant: 'histInsert2', hasStatements: false };
  const used = rows.some((r) => r.nstmt !== null && r.nstmt !== undefined && Number(r.nstmt) > 0);
  const optional = stmt.is_nullable === 'YES' || stmt.column_default !== null;
  return !used && optional ? { ok: true, variant: 'histInsert2', hasStatements: true } : { ok: true, variant: 'histInsert3', hasStatements: true };
}
const histRowsEqual = (rows, pairs) => JSON.stringify(rows.map((r) => [String(r.version), String(r.name)])) === JSON.stringify(pairs);

// ------------------------------------------------------------------------------------------------------------------------------------------------ snapshot and diff
export async function snapshot(c, send) {
  const kv = async (id) => Object.fromEntries((await send(c, SQL[id])).rows.map((r) => [r.k, r.v]));
  const one = async (id) => (await send(c, SQL[id])).rows[0];
  const S = {};
  S.version = await one('sVersion'); S.functions = await kv('sFunctions'); S.relations = await kv('sRelations'); S.columns = await kv('sColumns'); S.constraints = await kv('sConstraints');
  S.policies = await kv('sPolicies'); S.triggers = await kv('sTriggers'); S.rowCounts = await kv('sRowCounts');
  S.rowDigests = {}; for (const t of DIGEST_TABLES) S.rowDigests[t] = await one(`digest:${t}`);
  S.schemaAcl = await kv('sSchemaAcl'); S.defaultAcl = await kv('sDefaultAcl');
  S.schemas = (await send(c, SQL.sSchemas)).rows.map((r) => r.nspname);
  S.auth = {}; for (const t of AUTH_TABLES) S.auth[t] = await one(`auth:${t}`);
  S.history = (await send(c, SQL.sHistory)).rows.map((r) => `${r.version}:${r.name}`);
  S.sequences = await kv('sSequences'); S.advisoryLocks = (await one('sAdvisory')).n;
  return S;
}
export const diff = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return { added: kb.filter((k) => !(k in a)).sort(), removed: ka.filter((k) => !(k in b)).sort(), changed: ka.filter((k) => k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort() }; };
const noChange = (d) => d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;
const EXPECT_HISTORY = [...PINS.priorHistory.map(([v, n]) => `${v}:${n}`), `${PINS.newVersion}:${PINS.newName}`];

/** READ-ONLY verification of the applied state. phase 'in-tx' (inside the open transaction, probes use savepoints) or 'post-commit' (fresh connection: probes run in their own transaction that is rolled back). */
export async function verifyApplied(c, send, before, rep, phase, hist) {
  const now = await snapshot(c, send); const d = (k) => diff(before[k], now[k]);
  rep(`${phase}: relations added are exactly the 9 P3 tables, their indexes and the order sequence; nothing removed or changed`, d('relations').removed.length === 0 && d('relations').changed.length === 0 && P3_TABLES.every((t) => `public.${t}` in now.relations) && d('relations').added.filter((k) => !/_pkey$|_key$|_idx$|_seq$/.test(k)).length === 9, `${d('relations').added.length} added`);
  rep(`${phase}: functions added are exactly the 19 public RPCs and the 8 private helpers; nothing removed or changed`, d('functions').removed.length === 0 && d('functions').changed.length === 0 && d('functions').added.length === 27, `${d('functions').added.length} added`);
  rep(`${phase}: no existing policy changed or removed and none added; 10 triggers added; no existing trigger changed`, noChange(d('policies')) && d('triggers').removed.length === 0 && d('triggers').changed.length === 0 && d('triggers').added.length === 10);
  rep(`${phase}: no existing column or constraint of P1/P2 changed`, ['columns', 'constraints'].every((k) => d(k).removed.length === 0 && d(k).changed.length === 0));
  rep(`${phase}: existing table row counts unchanged (only the 9 P3 tables are new)`, d('rowCounts').removed.length === 0 && d('rowCounts').changed.length === 0 && d('rowCounts').added.length === 9);
  rep(`${phase}: default privileges, schema ACLs and the schema list unchanged`, JSON.stringify(before.defaultAcl) === JSON.stringify(now.defaultAcl) && JSON.stringify(before.schemaAcl) === JSON.stringify(now.schemaAcl) && JSON.stringify(before.schemas) === JSON.stringify(now.schemas));
  rep(`${phase}: migration history is the four applied versions plus exactly the P3 entry`, JSON.stringify(now.history) === JSON.stringify(EXPECT_HISTORY), now.history.join(','));
  for (const k of Object.keys(before.rowDigests)) rep(`${phase}: unrelated data unchanged: ${k}`, JSON.stringify(before.rowDigests[k]) === JSON.stringify(now.rowDigests[k]));
  for (const k of AUTH_TABLES) rep(`${phase}: auth.${k} untouched`, JSON.stringify(before.auth[k]) === JSON.stringify(now.auth[k]));
  const sq = d('sequences'); rep(`${phase}: no existing sequence changed; the only new sequence is public.order_number_seq`, sq.removed.length === 0 && sq.changed.length === 0 && JSON.stringify(sq.added) === JSON.stringify(['public.order_number_seq']));
  rep(`${phase}: order_number_seq exists and has never been used`, (await send(c, SQL.seqProps)).rows[0].n === 1);
  const tb = (await send(c, SQL.tableProps, [P3_TABLES])).rows;
  rep(`${phase}: the 9 P3 tables: RLS enabled, owner postgres, ACL only the owner, no privilege for anon, authenticated, service_role or PUBLIC`, tb.length === 9 && tb.every((r) => r.rls && r.o === 'postgres' && /^\{postgres=arwdDxtm?\/postgres\}$/.test(r.acl) && !Object.entries(r).some(([k, v]) => /^(anon|authenticated|service_role|public)_/.test(k) && v === true)));
  rep(`${phase}: no RLS policy exists on the P3 tables (default deny, RPC-only access)`, (await send(c, SQL.presentPol, [P3_TABLES])).rows[0].n === 0);
  const fr = (await send(c, SQL.fnProps, [P3_PUBLIC_FN, P3_PRIVATE_FN])).rows; const bad = [];
  for (const r of fr) { if (r.o !== 'postgres') bad.push(`${r.f} owner`); if (!(r.cfg ?? []).some((x) => x.replace(/[\s"']/g, '').toLowerCase() === 'search_path=')) bad.push(`${r.f} search_path`); if (r.an || r.sr || r.pu) bad.push(`${r.f} anon/service_role/PUBLIC`); if (r.s === 'public' && !(r.au && r.d)) bad.push(`${r.f} not definer or not granted to authenticated`); if (r.s === 'private' && r.au) bad.push(`${r.f} private executable by authenticated`); }
  rep(`${phase}: 27 functions: owner postgres, search_path pinned, no anon/service_role/PUBLIC execute; the 19 RPCs are SECURITY DEFINER and granted to authenticated only; private helpers are not`, fr.length === 27 && bad.length === 0, bad.join('; ') || '27 checked');
  rep(`${phase}: the 10 P3 triggers exist and are enabled`, (await send(c, SQL.trigEnabled, [P3_TABLES])).rows[0].n === 10);
  const got = []; for (const [a, e] of PRICING_VECTORS) got.push([(await send(c, SQL[`vec:${a}`])).rows[0].u, e]);
  rep(`${phase}: PostgreSQL computes the Aspen pricing vectors`, got.every(([g, e]) => g === e), got.map(([g, e]) => `${g}/${e}`).join(' '));
  const pn = (await send(c, SQL.pricingNull)).rows[0]; rep(`${phase}: pricing refuses a variant without base or floor and above the cap`, pn.a === true && pn.b === true && pn.c === true);
  rep(`${phase}: shop_price_breakdown with no rules returns the base price`, (await send(c, SQL.pricingBreakdown)).rows[0].u === '10000');
  const tr = (await send(c, SQL.transitions)).rows[0]; rep(`${phase}: order lifecycle transitions match`, tr.a === true && tr.b === false && tr.c === true);
  const sc = (await send(c, SQL.seedCounts)).rows[0]; rep(`${phase}: seed result is 153 products, 221 variants, 221 distinct SKUs, no price set anywhere, all active and seed-managed`, sc.p === 153 && sc.v === 221 && sc.skus === 221 && sc.priced === 0 && sc.odd === 0, JSON.stringify(sc));
  rep(`${phase}: no marketing or health wording in any stored description`, (await send(c, SQL.seedWording)).rows[0].n === 0);
  rep(`${phase}: no cart, order, order item, order event, markup rule or organization assignment exists`, (await send(c, SQL.noDataCreated)).rows[0].n === 0);
  // behavioural probes (read-only: refused or empty answers; a savepoint isolates each)
  const own = phase !== 'in-tx'; if (own) await send(c, SQL.begin);
  const asRole = async (role, claims, id, params = []) => { await send(c, SQL.sp); try { await send(c, SQL.claims, [JSON.stringify(claims)]); await send(c, role === 'anon' ? SQL.roleAnon : SQL.roleAuth); const r = await send(c, SQL[id], params); await send(c, SQL.roleReset); await send(c, SQL.spx); return { v: r.rows[0]?.r }; } catch (e) { await send(c, SQL.spr); await send(c, SQL.spx); return { e: e.code }; } };
  const fake = { sub: '00000000-0000-4000-8000-0000000000aa', role: 'authenticated', aal: 'aal2', amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }] };
  try {
    const nm = await asRole('authenticated', fake, 'probeCatalog'); const nmc = await asRole('authenticated', fake, 'probeCheckout');
    rep(`${phase}: authenticated non-member: catalog and checkout answer organization_not_found (no data, no order)`, nm.v?.code === 'organization_not_found' && nmc.v?.code === 'organization_not_found');
    const sr = []; for (const [f] of STAFF_PROBES) { const r = await asRole('authenticated', fake, `staff:${f}`); if (r.e !== '42501') sr.push(f); }
    rep(`${phase}: admin RPCs refuse a non-staff authenticated caller with 42501`, sr.length === 0, sr.join(', '));
    const ar = []; for (const [f] of ANON_PROBES) { const r = await asRole('anon', {}, anonId(f)); if (r.e !== '42501') ar.push(f); }
    rep(`${phase}: anon is refused (42501) on customer and admin RPCs`, ar.length === 0, ar.join(', '));
    const da = await asRole('authenticated', fake, 'probeTableAuth'); const dn = await asRole('anon', {}, 'probeTableAnon');
    rep(`${phase}: direct table access is denied to authenticated and anon (42501)`, da.e === '42501' && dn.e === '42501');
    const shipBad = [], shipRpc = [];
    for (const [lbl, js] of hist.shipCases) { const r = (await send(c, SQL.shipDirect, [js])).rows[0].r; if (r !== false) shipBad.push(lbl); const q = await asRole('authenticated', fake, 'shipRpc', [js]); if (q.e !== '22023') shipRpc.push(lbl); }
    rep(`${phase}: shop_ship_to_ok returns an explicit FALSE and rpc_checkout answers 22023 for all ${hist.shipCases.length} invalid shipping inputs`, shipBad.length === 0 && shipRpc.length === 0, [...shipBad, ...shipRpc].join('; ') || `${hist.shipCases.length} checked`);
    const vb = []; for (const [lbl, js] of hist.validShip) { if ((await send(c, SQL.shipDirect, [js])).rows[0].r !== true) vb.push(lbl); }
    rep(`${phase}: shop_ship_to_ok returns TRUE for the valid addresses`, vb.length === 0, vb.join('; ') || `${hist.validShip.length} checked`);
  } finally { if (own) await send(c, SQL.rollback); }
  // the probes must have written nothing
  const after = await snapshot(c, send);
  rep(`${phase}: the probes wrote nothing (every P1/P2 row digest, auth digest and the P3 row counts are unchanged by them)`, JSON.stringify(after.rowDigests) === JSON.stringify(now.rowDigests) && JSON.stringify(after.auth) === JSON.stringify(now.auth) && JSON.stringify(after.rowCounts) === JSON.stringify(now.rowCounts));
  if (own) rep(`${phase}: advisory lock state is clean (no advisory lock held)`, after.advisoryLocks === before.advisoryLocks, `${after.advisoryLocks}/${before.advisoryLocks}`);
  return now;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ the shipping cases (identical to the Phase T and dry-run harnesses)
export function shippingCases() {
  const SHIP = { name: 'P3 Test Facility', line1: '1 Test Way', city: 'Testville', region: 'TX', postal: '78701', country: 'US' };
  const REQ = ['name', 'line1', 'city', 'region', 'postal', 'country']; const sh = (o) => JSON.stringify({ ...SHIP, ...o }); const without = (k) => JSON.stringify(Object.fromEntries(Object.entries(SHIP).filter(([x]) => x !== k)));
  const shipCases = [
    ...REQ.map((k) => [`${k} missing`, without(k)]), ...REQ.map((k) => [`${k} = JSON null`, sh({ [k]: null })]), ...REQ.filter((k) => k !== 'country').map((k) => [`${k} = empty string`, sh({ [k]: '' })]),
    ['name = whitespace only', sh({ name: '   ' })], ['country = empty string', sh({ country: '' })],
    ['name = number', sh({ name: 123 })], ['line1 = boolean', sh({ line1: true })], ['city = array', sh({ city: ['x'] })], ['region = object', sh({ region: { a: 1 } })], ['postal = number', sh({ postal: 12345 })], ['country = number', sh({ country: 1 })],
    ['country lower case', sh({ country: 'us' })], ['country 3 letters', sh({ country: 'USA' })], ['line2 = JSON null', sh({ line2: null })], ['line2 = number', sh({ line2: 5 })], ['line2 over 160 characters', sh({ line2: 'x'.repeat(161) })], ['unknown key', sh({ extra: 'x' })],
    ['empty object', '{}'], ['shipping object is JSON null', 'null'], ['shipping object is an array', '[]'], ['shipping object is a string', '"x"'], ['shipping object is a number', '5'],
    ['shipping object is SQL NULL (omitted)', null]];
  const validShip = [['complete address', JSON.stringify(SHIP)], ['complete address with line2', sh({ line2: 'Suite 2' })], ['line2 of exactly 160 characters', sh({ line2: 'x'.repeat(160) })]];
  return { shipCases, validShip };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ the run
/** o: { mode: 'rehearse'|'commit', connect, mig (string), seed (string), reporter, confirm, expectedConfirm, sqlLog?, handleSignals? }.  Returns { outcome, exitCode, committed, persisted }. */
export async function runApply(o) {
  const { rep, note } = o.reporter; const send = makeSender(o.mig, o.seed, o.sqlLog ?? []); const hist = shippingCases();
  const out = { outcome: null, exitCode: EXIT.FAILED_ROLLED_BACK, committed: false, persisted: null, commitError: null };
  if (o.mode !== 'rehearse' && o.mode !== 'commit') { out.outcome = 'refused_bad_mode'; out.exitCode = EXIT.REFUSED_PRECHECK; return out; }
  if (o.mode === 'commit' && (!o.confirm || o.confirm !== o.expectedConfirm)) { rep('commit mode needs the exact --commit-confirm string', false); out.outcome = 'refused_commit_confirmation'; out.exitCode = EXIT.REFUSED_PRECHECK; return out; }
  let before = null; let tx = null; let txOpen = false; let commitSent = false; let plan = null; let gatesOk = false; let verified = false;
  const sig = () => { if (txOpen && !commitSent && tx) { try { tx.end(); } catch { /* the server rolls back an abandoned transaction */ } } process.exit(130); };
  if (o.handleSignals) { process.once('SIGINT', sig); process.once('SIGTERM', sig); }
  const stateGates = async (c, label) => {
    const cols = (await send(c, SQL.histCols)).rows; const p0 = historyPlan(cols, []);
    const rows = (await send(c, p0.hasStatements ? SQL.histRowsStmt : SQL.histRowsNoStmt)).rows; plan = historyPlan(cols, rows);
    rep(`${label}: migration history table has the expected shape and the harness can fill it (${plan.variant ?? 'n/a'})`, plan.ok, plan.reason ?? '');
    if (!plan.ok) return 'refused_history_schema';
    if (rows.some((r) => String(r.version) === PINS.newVersion)) { rep(`${label}: the P3 migration version is NOT already applied`, false, 'duplicate execution refused'); return 'refused_already_applied'; }
    rep(`${label}: migration history is exactly the four applied versions and names`, histRowsEqual(rows, PINS.priorHistory), rows.map((r) => `${r.version}:${r.name}`).join(','));
    if (!histRowsEqual(rows, PINS.priorHistory)) return 'refused_history_mismatch';
    const rel = (await send(c, SQL.presentRel, [[...P3_TABLES, 'order_number_seq']])).rows[0].n; const fn = (await send(c, SQL.presentFn, [P3_PUBLIC_FN, P3_PRIVATE_FN])).rows[0].n; const pol = (await send(c, SQL.presentPol, [P3_TABLES])).rows[0].n;
    rep(`${label}: no P3 table, sequence, function or policy exists`, rel === 0 && fn === 0 && pol === 0, `tables ${rel}, functions ${fn}, policies ${pol}`);
    return rel === 0 && fn === 0 && pol === 0 ? null : 'refused_p3_objects_exist';
  };
  try {
    // ---- 1. pre-state on a fresh connection
    let c0; try { c0 = await o.connect(); } catch (e) { rep('connection with strict TLS and the pinned CA', false, `error code ${e?.code ?? 'ERR'}`); out.outcome = 'refused_connect'; out.exitCode = EXIT.REFUSED_CONNECT; return out; }
    try { const refusal = await stateGates(c0, 'PRE-STATE'); if (refusal) { out.outcome = refusal; out.exitCode = EXIT.REFUSED_STATE; return out; } before = await snapshot(c0, send); gatesOk = true; note('BEFORE snapshot taken (fresh connection)'); }
    finally { await c0.end().catch(() => {}); }
    // ---- 2. the transaction
    tx = await o.connect(); await send(tx, SQL.begin); txOpen = true; await send(tx, SQL.tl_idle); await send(tx, SQL.tl_stmt); await send(tx, SQL.tl_lock);
    await send(tx, SQL.advisory);
    const refusal = await stateGates(tx, 'IN-TX RE-CHECK');
    if (refusal) { await send(tx, SQL.rollback); txOpen = false; out.outcome = refusal.replace('refused_', 'refused_in_tx_'); out.exitCode = EXIT.REFUSED_STATE; }
    else {
      note('transaction open (READ COMMITTED); executing the migration, then the seed, then the history entry');
      await send(tx, o.mig); rep('MIGRATION executed in PostgreSQL (its own self-check DO block passed)', true);
      await send(tx, o.seed); rep('SEED executed in PostgreSQL', true);
      if (plan.variant === 'histInsert3') await send(tx, SQL.histInsert3, [PINS.newVersion, PINS.newName, [o.mig]]); else await send(tx, SQL.histInsert2, [PINS.newVersion, PINS.newName]);
      rep('migration history entry inserted', true, `${PINS.newVersion} ${PINS.newName} (${plan.variant})`);
      const failBefore = o.reporter.failed();
      await verifyApplied(tx, send, before, rep, 'in-tx', hist);
      verified = o.reporter.failed() === failBefore;
      if (!verified) { await send(tx, SQL.rollback); txOpen = false; rep('in-transaction verification failed: ROLLBACK issued, nothing committed', null); out.outcome = 'rolled_back_verification_failed'; out.exitCode = EXIT.FAILED_ROLLED_BACK; }
      else if (o.mode === 'rehearse') { await send(tx, SQL.rollback); txOpen = false; rep('REHEARSAL: every in-transaction check passed; ROLLBACK issued (nothing committed)', null); out.outcome = 'rehearsal_rolled_back'; out.exitCode = EXIT.OK; }
      else {
        // THE ONLY COMMIT SITE: commit mode, confirmed, every in-transaction check passed. No retry.
        note('COMMIT sent'); commitSent = true;
        try { await send(tx, SQL.commit); out.committed = true; txOpen = false; } catch (e) { out.commitError = e?.code ?? 'ERR'; txOpen = false; }
      }
    }
  } catch (e) {
    note(`ERROR during the transaction: ${clean(e?.code ?? 'ERR')}`);
    if (txOpen && !commitSent && tx) { try { await send(tx, SQL.rollback); note('ROLLBACK issued (after error)'); } catch { note('rollback after error failed (the server aborts an abandoned transaction)'); } txOpen = false; }
    out.outcome = out.outcome ?? 'rolled_back_error'; out.exitCode = commitSent ? EXIT.COMMIT_AMBIGUOUS : EXIT.FAILED_ROLLED_BACK;
  } finally {
    if (tx) await tx.end().catch(() => {});
    if (o.handleSignals) { process.removeListener('SIGINT', sig); process.removeListener('SIGTERM', sig); }
  }
  if (!gatesOk || !before) return out;
  // ---- 3. fresh-connection verification of whatever state the database is now in
  let c1 = null;
  try {
    c1 = await o.connect();
    const hrows = (await send(c1, SQL.sHistory)).rows; const persisted = hrows.some((r) => String(r.version) === PINS.newVersion); out.persisted = persisted;
    if (out.committed || (commitSent && persisted)) {
      if (!out.committed) { out.commitError = out.commitError ?? 'ERR'; }
      const f0 = o.reporter.failed(); await verifyApplied(c1, send, before, rep, 'post-commit', hist);
      const ok = o.reporter.failed() === f0;
      if (out.committed) { out.outcome = ok ? 'committed_verified' : 'committed_verification_failed'; out.exitCode = ok ? EXIT.OK : EXIT.COMMITTED_BUT_UNVERIFIED; if (!ok) note('COMMITTED but post-commit verification FAILED: nothing is cleaned up automatically; a human decides'); }
      else { out.outcome = ok ? 'commit_error_but_persisted_verified' : 'commit_error_but_persisted_unverified'; out.exitCode = EXIT.COMMIT_AMBIGUOUS; note('the COMMIT reported an error but the state IS persisted'); }
    } else {
      const after = await snapshot(c1, send); const fa0 = o.reporter.failed();
      for (const k of Object.keys(before)) { const isMap = before[k] && typeof before[k] === 'object' && !Array.isArray(before[k]); const dd = isMap ? diff(before[k], after[k]) : null; const same = isMap ? noChange(dd) : JSON.stringify(before[k]) === JSON.stringify(after[k]); rep(`AFTER (fresh connection) unchanged: ${k}`, same, dd && !same ? `added ${JSON.stringify(dd.added.slice(0, 5))} removed ${JSON.stringify(dd.removed.slice(0, 5))} changed ${JSON.stringify(dd.changed.slice(0, 5))}` : ''); }
      const rel = (await send(c1, SQL.presentRel, [[...P3_TABLES, 'order_number_seq']])).rows[0].n; const fn = (await send(c1, SQL.presentFn, [P3_PUBLIC_FN, P3_PRIVATE_FN])).rows[0].n;
      const clean0 = rel === 0 && fn === 0 && !persisted && after.history.length === 4;
      rep('AFTER (fresh connection): no P3 object and no history entry persisted', clean0, `tables ${rel}, functions ${fn}`);
      // a failed comparison above (any of the 16 keys) is as serious as a persisted object: the run must NOT report success
      const afterOk = clean0 && o.reporter.failed() === fa0;
      if (commitSent) { out.outcome = 'commit_error_not_persisted_verified_clean'; out.exitCode = afterOk ? EXIT.COMMIT_AMBIGUOUS : EXIT.INCONSISTENT; if (!afterOk) out.outcome = 'commit_error_not_persisted_but_state_differs'; }
      else if (!afterOk) { out.outcome = 'rollback_not_verified_clean'; out.exitCode = EXIT.INCONSISTENT; note('the fresh-connection comparison after the rollback is NOT identical: investigate before any further step'); }
    }
  } catch (e) { rep('fresh-connection verification', false, `error code ${e?.code ?? 'ERR'}`); out.exitCode = commitSent || out.committed ? EXIT.COMMITTED_BUT_UNVERIFIED : EXIT.INCONSISTENT; out.outcome = (out.outcome ?? 'unknown') + '+fresh_verification_failed'; }
  finally { if (c1) await c1.end().catch(() => {}); }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ CLI
function cliMain() {
  const argv = process.argv.slice(2); const flag = (n) => argv.includes(n); const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const LOG = `${SCRATCH}/apply-p3-log.txt`; const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const RESULT = (mode) => `${SCRATCH}/p3-persistent-apply-result-${mode}-${stamp}.json`;
  const note = (s) => { console.log(s); try { appendFileSync(LOG, s + '\n'); } catch { /* best effort */ } };
  const reporter = makeReporter(note); const { rep } = reporter;
  const selfSha = sha(readFileSync(fileURLToPath(import.meta.url)));
  const OFFLINE = flag('--offline-selftest');
  const commit = flag('--authorized-persistent-apply'); const rehearse = flag('--authorized-rolled-back-execution');
  if (!OFFLINE) {
    if (commit && rehearse) { console.log('REFUSING: --authorized-persistent-apply and --authorized-rolled-back-execution are mutually exclusive'); return 2; }
    if (!commit && !rehearse) { console.log('REFUSING: needs --authorized-rolled-back-execution (rehearsal) or --authorized-persistent-apply (commit), or --offline-selftest'); return 2; }
    if (opt('--harness-sha') !== selfSha) { console.log('REFUSING: --harness-sha must equal the sha256 of this harness file (the approved harness)'); return 2; }
    if (commit && (!opt('--approval-ref') || opt('--approval-ref').length < 4)) { console.log('REFUSING: commit mode needs --approval-ref'); return 2; }
  }
  const art = verifyArtifacts(); for (const x of art.checks) rep(x.n, x.ok, x.d);
  rep('this harness file has a recorded sha256 (printed for the approval)', true, selfSha);
  if (!art.ok) { note('STOP: artifact verification failed; nothing was executed'); return 3; }
  if (OFFLINE) { note(`offline self-test: ${reporter.results.filter((r) => r.ok).length} passed, ${reporter.failed()} FAILED (no connection was made, no environment file was read)`); return reporter.failed() ? 1 : 0; }
  const mode = commit ? 'commit' : 'rehearse'; const confirm = opt('--commit-confirm'); const exp = expectedConfirm(selfSha);
  if (commit && confirm !== exp) { rep('commit mode needs the exact --commit-confirm string', false); note('STOP: commit confirmation missing or wrong; nothing was executed'); return 2; }
  // credentials: the process environment, or (behind the explicit flag) the single P2_DATABASE_URL line of the local file, in memory
  let v = process.env.P2_DATABASE_URL ?? '';
  if (!v && flag('--authorized-read-env-local')) { const line = readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, ''); } }
  if (!v) { console.log('STOP: P2_DATABASE_URL not set and --authorized-read-env-local not given'); return 2; }
  const pem = readFileSync(PINS.caFile, 'utf8'); const tg = checkTarget(v, pem); setSecrets(tg.secrets ?? [v]);
  for (const x of tg.checks) rep(x.n, x.ok);
  if (!tg.ok) { note('STOP: target or CA check failed; nothing was executed'); return 3; }
  const pg = createRequire(join(ROOT, 'package.json'))('pg');
  const connect = async () => { const k = new pg.Client(buildClientConfig(tg)); await k.connect(); try { assertTls(k); } catch (e) { await k.end().catch(() => {}); throw e; } return k; };
  return { run: async () => {
    const res = await runApply({ mode, connect, mig: art.mig.toString('utf8'), seed: art.seed.toString('utf8'), reporter, confirm, expectedConfirm: exp, handleSignals: true });
    note(`p3 persistent apply (${mode}): ${reporter.results.filter((r) => r.ok === true).length} passed, ${reporter.failed()} FAILED; outcome ${res.outcome}; committed ${res.committed}; exit ${res.exitCode}`);
    try { writeFileSync(RESULT(mode), JSON.stringify({ harness: 'apply-p3.mjs', mode, harnessSha: selfSha, migrationSha: PINS.migrationSha, seedSha: PINS.seedSha, migrationHashesSha: PINS.hashesSha, tierRManifestSha: PINS.tierRManifestSha, ref: PINS.ref, outcome: res.outcome, committed: res.committed, persisted: res.persisted, commitError: res.commitError, failures: reporter.failed(), exitCode: res.exitCode, at: new Date().toISOString() }), { flag: 'wx' }); note('result file written (new file)'); } catch { note('result file could not be written (an existing file is never overwritten)'); }
    return res.exitCode;
  } };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const r = cliMain();
  if (typeof r === 'number') process.exitCode = r; else if (r?.run) process.exitCode = await r.run();
}
