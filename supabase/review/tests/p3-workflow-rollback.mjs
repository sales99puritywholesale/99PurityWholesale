// P3 TIER R WORKFLOW VALIDATION HARNESS (rollback-only; NEVER RUN by its author; needs a separate, explicit approval that names its sha256).
// Target: the hosted development project (ref semtmllmwhxznxechfsk) ONLY. No Docker, no local database, no other project. No persistent write of any kind.
//
// TWO SEPARATE PHASES, two separate approvals:
//   --phase p0   Probe P0. Read-only catalog inspection, then ONE rolled-back transaction with exactly two fixture inserts (one auth.users row, one auth.mfa_factors row), then a
//                fresh-connection verification. Writes P0-RESULT.json to the scratch directory. If anything fails: STOP (exit 4); nothing else is attempted.
//   --phase t    Tier R tests T01 to T21. REFUSES to start unless P0-RESULT.json exists with pass = true for THIS harness hash, and --approval-ref <text> is given.
// Flags required to connect: --authorized-rolled-back-execution  --authorized-read-env-local (the P2_DATABASE_URL line only, in memory, never printed)  --harness-sha <64 hex>
// (the sha256 of this very file as named in the approval; the harness computes its own hash and refuses on any difference).
//   --offline-selftest   no network, no environment read: checks the pinned artifacts, the allow-list and the scenario tables
//   --print-manifest     no network: prints the exact allow-list (id, phase, normalized SQL) and the expected-trigger table
//
// EVERY statement sent to PostgreSQL must be, byte for byte after whitespace normalization, an entry of the ALLOW list below (Q() refuses anything else BEFORE sending it).
// The migration and the seed are the only multi-statement texts; they are executed only if their sha256 equals the approved hash. There is no COMMIT anywhere: the transaction is
// ended by ROLLBACK in a finally block (also on error), and a fresh connection then proves nothing persisted.
//
// WHAT THESE TESTS ARE (and are not):
//   [SIM-JWT]  the identity of every RPC call is SIMULATED: request.jwt.claims is set on the transaction and the role is switched to authenticated/anon. This exercises the database
//              authorization (auth.uid(), the aal claim, the amr step-up timestamp, staff_session_ok, staff_gate) given those claims. It is NOT proof that GoTrue issues such tokens
//              and NOT proof of real MFA authentication. The TOTP factor rows are fixtures inserted through the real 0002 guard, not enrolled authenticators.
//   [SINGLE-SESSION] everything runs on ONE connection in ONE transaction. This is NOT a test of concurrency and proves nothing about concurrent correctness.
//   [REAL-GOTRUE] none. [REAL-CONCURRENCY] none. Both are deferred until an isolated test environment is explicitly approved.
import { createHash, X509Certificate, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const scratch = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
const SELF = fileURLToPath(import.meta.url);
const MIGRATION = join(root, 'supabase/review/p3/20261110000100_p3_catalog_pricing_orders.sql');
const SEED = join(root, 'supabase/review/p3/seed-products.sql');
const MIGRATION_SHA = 'bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e';
const SEED_SHA = '1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164';
const REF = 'semtmllmwhxznxechfsk'; const CA_FILE = `${scratch}/ca/prod-ca-2021.crt`; const CA_SHA256 = '807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA';
const P0_RESULT = `${scratch}/P3-TIER-R-P0-RESULT.json`;
const LOG = `${scratch}/p3-workflow-rollback-log.txt`;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const PHASE = opt('--phase');
const OFFLINE = flag('--offline-selftest'); const PRINT = flag('--print-manifest');
const results = []; const note = (s) => { console.log(s); try { appendFileSync(LOG, s + '\n'); } catch { /* best effort */ } };
const rep = (n, ok, d = '') => { results.push({ n, ok }); note(`${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const SELF_SHA = sha(readFileSync(SELF));

// ------------------------------------------------------------------------------------------------------------------------------------------------ allow-list
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const ALLOW = new Map(); // normalized sql -> { id, phase }  (phase: 'p0' | 't' | 'both')
const reg = (id, phase, sql) => { const k = norm(sql); if (ALLOW.has(k)) throw new Error(`duplicate allow-list entry ${id}`); ALLOW.set(k, { id, phase }); return sql; };
let sqlLog = [];
async function Q(c, sql, params = []) {
  const k = norm(sql); const a = ALLOW.get(k);
  if (!a) throw new Error(`STATEMENT NOT ALLOW-LISTED (refused before sending): ${k.slice(0, 120)}`);
  if (a.phase !== 'both' && a.phase !== PHASE) throw new Error(`STATEMENT ${a.id} is not allowed in phase ${PHASE}`);
  sqlLog.push(a.id);
  return c.query(sql, params);
}

// --- transaction control and identity switching (both phases)
const S_BEGIN = reg('tx.begin', 'both', 'begin isolation level read committed');
const S_T1 = reg('tx.timeout.idle', 'both', "set local idle_in_transaction_session_timeout = '120s'");
const S_T2 = reg('tx.timeout.statement', 'both', "set local statement_timeout = '60s'");
const S_T3 = reg('tx.timeout.lock', 'both', "set local lock_timeout = '10s'");
const S_ROLLBACK = reg('tx.rollback', 'both', 'rollback');
const S_SP = reg('sp.create', 'both', 'savepoint s'); const S_SPR = reg('sp.rollback', 'both', 'rollback to savepoint s'); const S_SPX = reg('sp.release', 'both', 'release savepoint s');
const S_CLAIMS = reg('id.claims', 't', "select set_config('request.jwt.claims', $1, true)");
const S_ROLE_AUTH = reg('id.role.authenticated', 't', 'set local role authenticated'); const S_ROLE_ANON = reg('id.role.anon', 't', 'set local role anon'); const S_RESET = reg('id.role.reset', 't', 'reset role');

// --- read-only snapshot (both phases): the same coverage as the P3 dry execution, plus audit and auth digests
const SNAP = {
  version: reg('snap.version', 'both', 'select version() as v, current_setting($$server_version$$) as sv, current_setting($$server_version_num$$) as svn'),
  functions: reg('snap.functions', 'both', "select p.oid::regprocedure::text k, md5(concat_ws('|', p.prosrc, p.prosecdef, p.proconfig::text, p.proacl::text, p.proowner::regrole::text, p.provolatile)) v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')"),
  relations: reg('snap.relations', 'both', "select n.nspname || '.' || c.relname k, md5(concat_ws('|', c.relkind, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.relowner::regrole::text)) v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','m','S','p','i')"),
  columns: reg('snap.columns', 'both', "select table_schema || '.' || table_name || '.' || column_name k, md5(concat_ws('|', data_type, is_nullable, column_default)) v from information_schema.columns where table_schema in ('public','private')"),
  constraints: reg('snap.constraints', 'both', "select c.conrelid::regclass::text || '.' || c.conname k, md5(pg_get_constraintdef(c.oid)) v from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('public','private')"),
  policies: reg('snap.policies', 'both', "select schemaname || '.' || tablename || '.' || policyname k, md5(concat_ws('|', cmd, roles::text, qual, with_check)) v from pg_policies where schemaname in ('public','private')"),
  triggers: reg('snap.triggers', 'both', "select c.oid::regclass::text || '.' || t.tgname k, md5(pg_get_triggerdef(t.oid)) v from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private','auth') and not t.tgisinternal"),
  rowCounts: reg('snap.rowcounts', 'both', "select t.table_schema || '.' || t.table_name k, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text v from information_schema.tables t where t.table_schema in ('public','private') and t.table_type = 'BASE TABLE'"),
  schemaAcl: reg('snap.schemaacl', 'both', "select nspname k, concat_ws('|', nspacl::text, nspowner::regrole::text) v from pg_namespace where nspname in ('public','private','auth')"),
  defaultAcl: reg('snap.defaultacl', 'both', "select concat_ws('.', defaclrole::regrole::text, coalesce(defaclnamespace::regnamespace::text,''), defaclobjtype::text) k, defaclacl::text v from pg_default_acl"),
  schemas: reg('snap.schemas', 'both', "select nspname from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' order by 1"),
  history: reg('snap.history', 'both', 'select version, name from supabase_migrations.schema_migrations order by version'),
  sequences: reg('snap.sequences', 'both', "select schemaname || '.' || sequencename k, concat_ws('|', last_value::text, start_value::text) v from pg_sequences where schemaname in ('public','private')"),
  advisory: reg('snap.advisory', 'both', "select count(*)::int n from pg_locks where locktype = 'advisory'"),
};
const DIGEST_TABLES = ['public.capabilities', 'public.role_capabilities', 'private.platform_validations', 'public.staff_members', 'public.staff_roles', 'public.organizations', 'public.organization_members', 'public.audit_events', 'public.profiles', 'public.organization_invites', 'public.organization_billing', 'private.staff_mfa_enrolment_windows', 'private.staff_mfa_factors', 'auth.users', 'auth.identities', 'auth.mfa_factors', 'auth.sessions', 'auth.refresh_tokens'];
const DIGEST = Object.fromEntries(DIGEST_TABLES.map((t) => [t, reg(`snap.digest.${t}`, 'both', `select coalesce(md5(string_agg(md5(x::text), '' order by md5(x::text))),'empty') d, count(*)::int n from ${t} x`)]));
const S_AUTHCOUNTS = reg('snap.authcounts', 'both', "select (select count(*)::int from auth.users) users, (select count(*)::int from auth.identities) identities, (select count(*)::int from auth.mfa_factors) factors, (select count(*)::int from public.staff_members) staff, (select count(*)::int from public.staff_roles) roles, (select count(*)::int from public.organizations) orgs, (select count(*)::int from public.organization_members) members, (select count(*)::int from public.audit_events) audit, (select count(*)::int from public.profiles) profiles");

// --- P0 read-only inspection (phase p0 only)
const P0R = {
  env: reg('p0.env', 'p0', "select version() as v, current_user as cu, session_user as su, (select rolsuper from pg_roles where rolname = current_user) as is_super, (select rolbypassrls from pg_roles where rolname = current_user) as bypass_rls, pg_is_in_recovery() as in_recovery"),
  priv: reg('p0.priv', 'p0', "select has_table_privilege(current_user, 'auth.users', 'insert') as users_insert, has_table_privilege(current_user, 'auth.mfa_factors', 'insert') as factors_insert, has_table_privilege(current_user, 'public.profiles', 'select') as profiles_select, has_schema_privilege(current_user, 'auth', 'usage') as auth_usage"),
  cols: reg('p0.columns', 'p0', "select table_name, column_name, udt_name, is_nullable, column_default from information_schema.columns where table_schema = 'auth' and table_name in ('users', 'mfa_factors') order by table_name, ordinal_position"),
  enums: reg('p0.enums', 'p0', "select t.typname, e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'auth' and t.typname in ('factor_type', 'factor_status') order by t.typname, e.enumsortorder"),
  triggers: reg('p0.triggers', 'p0', "select c.oid::regclass::text as tbl, t.tgname, t.tgenabled, p.oid::regprocedure::text as fn, pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid where not t.tgisinternal and c.oid = any(array['auth.users'::regclass, 'auth.mfa_factors'::regclass, 'public.profiles'::regclass]) order by 1, 2"),
  rules: reg('p0.rules', 'p0', "select schemaname, tablename, rulename from pg_rules where (schemaname, tablename) in (('auth','users'), ('auth','mfa_factors'), ('public','profiles'))"),
  policies: reg('p0.policies', 'p0', "select schemaname, tablename, policyname from pg_policies where (schemaname, tablename) in (('auth','users'), ('auth','mfa_factors'), ('public','profiles'))"),
  rls: reg('p0.rls', 'p0', "select c.oid::regclass::text as tbl, c.relrowsecurity as rls, c.relforcerowsecurity as forced, c.relowner::regrole::text as owner from pg_class c where c.oid = any(array['auth.users'::regclass, 'auth.mfa_factors'::regclass, 'public.profiles'::regclass])"),
  pubs: reg('p0.publications', 'p0', "select pubname, schemaname, tablename from pg_publication_tables where (schemaname, tablename) in (('auth','users'), ('auth','mfa_factors'), ('public','profiles'))"),
  fks: reg('p0.fks', 'p0', "select conname, confrelid::regclass::text as ref from pg_constraint where conrelid = 'auth.mfa_factors'::regclass and contype = 'f'"),
  evt: reg('p0.eventtriggers', 'p0', 'select evtname, evtevent from pg_event_trigger order by 1'),
  ns: reg('p0.namespace', 'both', "select (select count(*)::int from auth.users where id::text like 'b3000000-0000-4000-8000-%' or email like 'p3test-%@example.invalid') as users, (select count(*)::int from auth.mfa_factors where user_id::text like 'b3000000-0000-4000-8000-%') as factors, (select count(*)::int from public.organizations where code like 'P3T-%') as orgs, (select count(*)::int from public.profiles where user_id::text like 'b3000000-0000-4000-8000-%') as profiles, (select count(*)::int from public.audit_events where actor_user_id::text like 'b3000000-0000-4000-8000-%') as audit"),
};
// --- P0 write statements: EXACTLY TWO fixture inserts, both rolled back (phase p0 only)
const P0W = {
  user: reg('p0.insert.auth.users', 'p0', "insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values ($1::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now(), now())"),
  factor: reg('fx.insert.auth.mfa_factors', 'both', "insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at) values ($1::uuid, $2::uuid, 'totp'::auth.factor_type, 'verified'::auth.factor_status, now(), now())"),
  profile: reg('p0.read.profile', 'p0', 'select count(*)::int as n from public.profiles where user_id = $1::uuid'),
  factorRow: reg('p0.read.factor', 'p0', 'select id::text as id, factor_type::text as t, status::text as s from auth.mfa_factors where id = $1::uuid'),
  userRow: reg('p0.read.user', 'p0', 'select id::text as id, email from auth.users where id = $1::uuid'),
};
// the triggers P0 EXPECTS on the three tables (names and functions); anything else is an unexpected side effect and stops P0
const EXPECTED_TRIGGERS = [{ tbl: 'auth.users', name: 'on_auth_user_created', fn: 'private.handle_new_user()' }, { tbl: 'public.profiles', name: 'profiles_touch', fn: 'private.touch_updated_at()' }];
// The p0.triggers query returns regclass/regprocedure text, which omits the schema of anything on the search_path (public.profiles -> "profiles"). The schema-qualified table and function are therefore parsed from pg_get_triggerdef (always qualified); a definition that does not parse is treated as unexpected (fail closed).
export const trigParse = (t) => { const m = /^CREATE (?:CONSTRAINT )?TRIGGER \S+ .* ON ([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*) .*EXECUTE (?:FUNCTION|PROCEDURE) ([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\(([^)]*)\)$/s.exec(String(t.def ?? '')); return m ? { tbl: `${m[1]}.${m[2]}`, fn: `${m[3]}.${m[4]}(${m[5]})` } : null; };
export const trigMatches = (t) => { const p = trigParse(t); return p !== null && EXPECTED_TRIGGERS.some((e) => e.tbl === p.tbl && e.name === t.tgname && e.fn === p.fn); };

// --- tier R fixture and test statements (phase t only)
const FX = {
  user: reg('fx.insert.auth.users', 't', "insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, banned_until, deleted_at, created_at, updated_at) values ($1::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3::timestamptz, $4::timestamptz, $5::timestamptz, now(), now())"),
  staff: reg('fx.insert.staff_members', 't', 'insert into public.staff_members (user_id, status) values ($1::uuid, $2)'),
  role: reg('fx.insert.staff_roles', 't', 'insert into public.staff_roles (user_id, role) values ($1::uuid, $2)'),
  window: reg('fx.insert.staff_window', 't', "insert into private.staff_mfa_enrolment_windows (target_user_id, authorized_by, authorized_at, expires_at, reason) values ($1::uuid, null, now(), now() + interval '30 minutes', 'p3 workflow fixture') returning id::text as id"),
  factor: P0W.factor, // the SAME statement as in P0 (one allow-list entry, phases p0 and t)
  claim: reg('fx.insert.staff_mfa_factors', 't', 'insert into private.staff_mfa_factors (factor_id, user_id, window_id) values ($1::uuid, $2::uuid, $3::uuid)'),
  org: reg('fx.insert.organizations', 't', 'insert into public.organizations (id, name, code, status) values ($1::uuid, $2, $3, $4)'),
  member: reg('fx.insert.organization_members', 't', 'insert into public.organization_members (organization_id, user_id, role, status, removed_at) values ($1::uuid, $2::uuid, $3, $4, $5::timestamptz)'),
  structure: reg('fx.structure_check', 't', 'select private.run_auth_structure_check() as r'),
  variant: reg('rd.variant', 't', 'select id::text as id from public.product_variants where sku = $1'),
  product: reg('rd.product', 't', 'select id::text as id from public.products where slug = $1'),
  audit: reg('rd.audit', 't', "select action, outcome, actor_kind, organization_id::text as org, subject_type, detail::text as detail from public.audit_events where actor_user_id::text like 'b3000000-0000-4000-8000-%' order by occurred_at, id"),
  auditGroup: reg('rd.audit.group', 't', "select action, outcome, count(*)::int as n from public.audit_events where actor_user_id::text like 'b3000000-0000-4000-8000-%' group by action, outcome order by 1, 2"),
  orderRow: reg('rd.order', 't', 'select id::text as id, status, subtotal_cents::text as subtotal, total_cents::text as total, idempotency_key::text as ikey from public.orders where id = $1::uuid'),
  orderCount: reg('rd.order.count', 't', "select count(*)::int as n from public.orders where placed_by::text like 'b3000000-0000-4000-8000-%'"),
  items: reg('rd.order.items', 't', 'select sku, quantity, base_price_cents, floor_cents, unit_price_cents, line_total_cents::text as line, pricing::text as pricing from public.order_items where order_id = $1::uuid order by sku'),
  events: reg('rd.order.events', 't', 'select to_status from public.order_events where order_id = $1::uuid order by created_at, id'),
  cartCount: reg('rd.cart.count', 't', 'select (select count(*)::int from public.carts) as carts, (select count(*)::int from public.cart_items) as items'),
  catalogCount: reg('rd.catalog.count', 't', 'select (select count(*)::int from public.products) as p, (select count(*)::int from public.product_variants) as v'),
  members: reg('rd.members', 't', 'select role, status from public.organization_members where organization_id = $1::uuid and user_id = $2::uuid'),
  priceRow: reg('rd.price', 't', 'select base_price_cents, min_price_cents from public.product_variants where id = $1::uuid'),
  ruleCount: reg('rd.rules.count', 't', 'select count(*)::int as n from public.markup_rules where organization_id = $1::uuid'),
  // negative direct statements (each must FAIL; each runs inside a savepoint on objects that exist only inside this transaction)
  badItemUpdate: reg('neg.update.order_items', 't', 'update public.order_items set quantity = 1 where order_id = $1::uuid'),
  badOrderDelete: reg('neg.delete.orders', 't', 'delete from public.orders where id = $1::uuid'),
  badEventTruncate: reg('neg.truncate.order_events', 't', 'truncate public.order_events'),
  badOrderTotal: reg('neg.update.orders.total', 't', 'update public.orders set total_cents = 1 where id = $1::uuid'),
  badOrderStatus: reg('neg.update.orders.status', 't', "update public.orders set status = 'delivered' where id = $1::uuid"),
  tableRead: Object.fromEntries(['products', 'product_variants', 'organization_products', 'markup_rules', 'carts', 'cart_items', 'orders', 'order_items', 'order_events'].map((t) => [t, reg(`neg.select.${t}`, 't', `select count(*)::int as r from public.${t}`)])),
};
// --- the 19 RPCs (exact signatures; one allow-list entry each)
const RPCS = {
  rpc_catalog_list: ['uuid'], rpc_cart_get: ['uuid'], rpc_cart_put_item: ['uuid', 'uuid', 'integer'], rpc_cart_empty: ['uuid'], rpc_checkout: ['uuid', 'jsonb', 'text', 'uuid'], rpc_orders_list: ['uuid', 'integer'], rpc_order_get: ['uuid', 'uuid'],
  rpc_admin_orgs_list: [], rpc_admin_org_create: ['text', 'text', 'text'], rpc_admin_org_member_add: ['uuid', 'text', 'text'], rpc_admin_catalog_list: [], rpc_admin_variant_set_price: ['uuid', 'integer', 'integer'], rpc_admin_product_set_status: ['uuid', 'text'],
  rpc_admin_org_catalog_get: ['uuid'], rpc_admin_org_product_set: ['uuid', 'uuid', 'boolean', 'boolean'], rpc_admin_markup_rule_set: ['uuid', 'text', 'uuid', 'text', 'bigint', 'bigint', 'bigint', 'bigint', 'bigint', 'boolean'],
  rpc_admin_orders_list: ['text', 'integer'], rpc_admin_order_get: ['uuid'], rpc_admin_order_set_status: ['uuid', 'text', 'text'],
};
const RPC_SQL = Object.fromEntries(Object.entries(RPCS).map(([n, a]) => [n, reg(`rpc.${n}`, 't', `select public.${n}(${a.map((t, i) => `$${i + 1}::${t}`).join(', ')}) as r`)]));
const MIG = { id: 'file.migration' }; const SEEDF = { id: 'file.seed' };

// ------------------------------------------------------------------------------------------------------------------------------------------------ fixtures (exact data)
const NS = 'b3000000-0000-4000-8000-';
const id = (s) => `${NS}${s.padStart(12, '0')}`;
const U = { ADMIN: id('1'), ADMIN_NOSTEP: id('2'), OPS: id('3'), SUPPORT: id('4'), FINANCE: id('5'), STAFF_AAL1: id('6'), STAFF_DISABLED: id('7'), STAFF_NOROLE: id('8'),
  A1: id('11'), A2: id('12'), B1: id('21'), C1: id('31'), NONE: id('41'), REMOVED: id('51'), BANNED: id('61'), DELETED: id('62'), UNCONF: id('63'), P0USER: id('f0'), P0FACTOR: id('f1') };
const ORG = { A: id('a1'), B: id('b1'), C: id('c1') };
const ORG_CODE = { A: 'P3T-A', B: 'P3T-B', C: 'P3T-C' };
const STAFF_FIXTURES = [['ADMIN', 'admin', true], ['ADMIN_NOSTEP', 'admin', true], ['OPS', 'operations', true], ['SUPPORT', 'support', true], ['FINANCE', 'finance', true], ['STAFF_AAL1', 'admin', true], ['STAFF_NOROLE', null, true]];
const SKU = { V11: '5-AMINO-1MQ-5MGX10', V12: '5-AMINO-1MQ-10MGX10', V21: 'ADAMAX-5MGX10', V22: 'ADAMAX-10MGX10', V31: 'AOD9604-5MGX10', V32: 'AOD9604-10MGX10', V41: 'ADIPOTIDE-FTTP-2MGX10' };
const SLUG = { PR1: '5-amino-1mq', PR2: 'adamax', PR3: 'aod9604', PR4: 'adipotide-fttp' };
const PRICES = { V11: [10000, 11000], V12: [18000, 15000], V21: [333, 100], V22: [335, 100], V31: [20000, 5000], V32: [null, 5000] };
const EXPECT_A = { V11: 13125, V12: 23625, V21: 377, V22: 380, V31: 26250 }; const EXPECT_B = { V11: 10500, V12: 18500, V31: 20500 };
const SHIP = { name: 'P3 Test Facility', line1: '1 Test Way', city: 'Testville', region: 'TX', postal: '78701', country: 'US' };
const K1 = id('c01'); const K2 = id('c02'); const K3 = id('c03');
// Clock semantics: private.step_up_ok() compares the amr timestamp with now(), which PostgreSQL FREEZES at transaction start. Claims are therefore built from the client clock read ONCE immediately before BEGIN (TX_EPOCH), never from the running wall clock, so a claim's age relative to now() is the same for the whole run. A "fresh" TOTP claim is placed FRESH_BACK seconds before that instant, the centre of the accepted window (now()-15min, now()+1min], so client/server clock skew from 10 minutes behind to 6 minutes ahead is tolerated. ADMIN_NOSTEP is 20 minutes before it (expired).
let TX_EPOCH = null; const FRESH_BACK = 5 * 60;
const claimsFor = (who, now = TX_EPOCH ?? Math.floor(Date.now() / 1000)) => {
  if (who === 'ANON') return null;
  const staff = ['ADMIN', 'ADMIN_NOSTEP', 'OPS', 'SUPPORT', 'FINANCE', 'STAFF_AAL1', 'STAFF_DISABLED', 'STAFF_NOROLE'].includes(who);
  if (!staff) return { sub: U[who], role: 'authenticated', aal: 'aal1', amr: [{ method: 'password', timestamp: now }] };
  return { sub: U[who], role: 'authenticated', aal: who === 'STAFF_AAL1' ? 'aal1' : 'aal2', amr: [{ method: 'totp', timestamp: who === 'ADMIN_NOSTEP' ? now - 20 * 60 : now - FRESH_BACK }] };
};
const AUDIT_ACTION = { rpc_admin_variant_set_price: 'staff.variant.price.set', rpc_admin_markup_rule_set: 'staff.markup_rule.set', rpc_admin_org_product_set: 'staff.org.product.set', rpc_admin_product_set_status: 'staff.product.status.set',
  rpc_admin_org_create: 'staff.org.create', rpc_admin_org_member_add: 'staff.org.member.add', rpc_admin_order_set_status: 'staff.order.status.set', rpc_admin_orgs_list: 'staff.org.list', rpc_admin_catalog_list: 'staff.catalog.list',
  rpc_admin_org_catalog_get: 'staff.org.catalog.get', rpc_admin_orders_list: 'staff.orders.list', rpc_admin_order_get: 'staff.order.get' };
const MUTATING_STAFF = new Set(['rpc_admin_variant_set_price', 'rpc_admin_markup_rule_set', 'rpc_admin_org_product_set', 'rpc_admin_product_set_status', 'rpc_admin_org_create', 'rpc_admin_org_member_add', 'rpc_admin_order_set_status']);
// the authorization grid: gate result expected per (identity, group); 'pass' = the gate lets the call through (the RPC then answers with its own code)
const GROUP = { manage: ['rpc_admin_catalog_list', 'rpc_admin_org_catalog_get', 'rpc_admin_product_set_status', 'rpc_admin_org_product_set'], price: ['rpc_admin_variant_set_price', 'rpc_admin_markup_rule_set', 'rpc_admin_org_create'],
  member: ['rpc_admin_org_member_add'], read: ['rpc_admin_orders_list', 'rpc_admin_order_get', 'rpc_admin_orgs_list'], status: ['rpc_admin_order_set_status'] };
const GRID = { ADMIN: { manage: 'pass', price: 'pass', member: 'pass', read: 'pass', status: 'pass' }, ADMIN_NOSTEP: { manage: 'pass', price: 'step_up_required', member: 'step_up_required', read: 'pass', status: 'pass' },
  OPS: { manage: 'forbidden', price: 'forbidden', member: 'forbidden', read: 'pass', status: 'pass' }, SUPPORT: { manage: 'forbidden', price: 'forbidden', member: 'forbidden', read: 'pass', status: 'forbidden' },
  FINANCE: { manage: 'forbidden', price: 'forbidden', member: 'forbidden', read: 'pass', status: 'forbidden' } };
for (const w of ['STAFF_AAL1', 'STAFF_DISABLED', 'STAFF_NOROLE', 'A1', 'ANON']) GRID[w] = Object.fromEntries(Object.keys(GROUP).map((g) => [g, '42501']));

// ------------------------------------------------------------------------------------------------------------------------------------------------ offline self-test and manifest printing
const mig = readFileSync(MIGRATION); const seed = readFileSync(SEED);
rep('migration sha256 equals the approved hash', sha(mig) === MIGRATION_SHA, sha(mig).slice(0, 16) + '…');
rep('seed sha256 equals the approved hash', sha(seed) === SEED_SHA, sha(seed).slice(0, 16) + '…');
rep('the allow-list contains no COMMIT or END statement, no DDL statement (create, alter, drop) and no write to the migration history', ![...ALLOW.keys()].some((k) => /^(commit|end|create|alter|drop)/i.test(k)) && ![...ALLOW.keys()].some((k) => /^(insert|update|delete|truncate)/i.test(k) && /supabase_migrations/i.test(k)));
rep('every mutating allow-list entry targets a fixture table, an RPC, or is a negative statement that must fail', [...ALLOW.entries()].filter(([k]) => /^(insert|update|delete|truncate)/i.test(k)).every(([k, a]) => /^(p0\.insert|fx\.insert|neg\.)/.test(a.id)), `${[...ALLOW.entries()].filter(([k]) => /^(insert|update|delete|truncate)/i.test(k)).length} mutating statements`);
rep('the P0 phase can send exactly two mutating statements (one insert into auth.users, one insert into auth.mfa_factors) and no update, delete or truncate', [...ALLOW.entries()].filter(([k, a]) => (a.phase === 'p0' || a.phase === 'both') && /^(insert|update|delete|truncate)/i.test(k)).map(([, a]) => a.id).sort().join() === 'fx.insert.auth.mfa_factors,p0.insert.auth.users');
rep('19 RPC statements registered and every customer/staff scenario target is among them', Object.keys(RPC_SQL).length === 19 && Object.values(GROUP).flat().every((n) => n in RPC_SQL));
rep('every fixture id is inside the reserved namespace', [...Object.values(U), ...Object.values(ORG), K1, K2, K3].every((x) => x.startsWith(NS) && /^[0-9a-f-]{36}$/.test(x)));
if (PRINT) {
  console.log(`harness sha256 ${SELF_SHA}\nALLOW-LIST (${ALLOW.size} statements)`);
  for (const [k, a] of ALLOW) console.log(`${a.id}\t${a.phase}\t${k}`);
  console.log('EXPECTED TRIGGERS (P0 stops on any other trigger on auth.users, auth.mfa_factors, public.profiles):'); for (const t of EXPECTED_TRIGGERS) console.log(`${t.tbl}\t${t.name}\t${t.fn}`);
  process.exit(0);
}
if (results.some((r) => r.ok === false)) { note('STOP: pre-checks failed; nothing was executed'); process.exit(3); }
if (OFFLINE) { note(`offline self-test: ${results.filter((r) => r.ok).length} passed, ${results.filter((r) => r.ok === false).length} FAILED (harness sha256 ${SELF_SHA}; no connection was made, no environment file was read)`); process.exit(0); }

// ------------------------------------------------------------------------------------------------------------------------------------------------ gates before any connection
if (PHASE !== 'p0' && PHASE !== 't') { console.log('REFUSING: --phase p0 or --phase t is required'); process.exit(2); }
if (!flag('--authorized-rolled-back-execution')) { console.log('REFUSING: needs --authorized-rolled-back-execution'); process.exit(2); }
if (opt('--harness-sha') !== SELF_SHA) { console.log('REFUSING: --harness-sha must equal the sha256 of this harness (named in the approval)'); process.exit(2); }
if (PHASE === 't') {
  if (!opt('--approval-ref') || opt('--approval-ref').length < 4) { console.log('REFUSING: phase t needs --approval-ref (the reference of the separate approval given after P0)'); process.exit(2); }
  let p0; try { p0 = JSON.parse(readFileSync(P0_RESULT, 'utf8')); } catch { console.log('REFUSING: P0 has not produced a result file'); process.exit(2); }
  if (!(p0.pass === true && p0.harnessSha === SELF_SHA && p0.migrationSha === MIGRATION_SHA && p0.ref === REF)) { console.log('REFUSING: the P0 result is not a pass for this harness, migration and project'); process.exit(2); }
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ credentials (the P2 mechanism) and connection
let v = process.env.P2_DATABASE_URL ?? '';
if (!v && flag('--authorized-read-env-local')) { const line = readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, ''); } }
if (!v) { console.log('STOP: P2_DATABASE_URL not set and --authorized-read-env-local not given'); process.exit(2); }
let URLO; try { URLO = new URL(v); } catch { console.log('STOP: the database URL is not parseable'); process.exit(2); }
const secrets = [v, URLO.password, decodeURIComponent(URLO.password)].filter((x) => x && x.length >= 4);
const clean = (t) => { let s = String(t ?? ''); for (const x of secrets) s = s.split(x).join('<redacted>'); return s.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://<redacted>'); };
const hm = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(URLO.hostname);
rep('URL host is db.<ref>.supabase.co and the project ref equals the approved ref', Boolean(hm) && hm[1] === REF, hm?.[1] ?? URLO.hostname);
rep('URL user postgres, database postgres, port 5432', decodeURIComponent(URLO.username) === 'postgres' && URLO.pathname === '/postgres' && (URLO.port || '5432') === '5432');
const pem = readFileSync(CA_FILE, 'utf8'); rep('pinned CA fingerprint matches the recorded Supabase Root 2021 CA', new X509Certificate(pem).fingerprint256.replace(/:/g, '') === CA_SHA256);
if (results.some((r) => r.ok === false)) { note('STOP: identity or CA check failed'); process.exit(3); }
const pg = createRequire(join(root, 'package.json'))('pg');
const connect = async () => { const k = new pg.Client({ connectionString: v, ssl: { rejectUnauthorized: true, ca: pem, servername: URLO.hostname }, application_name: `p3-workflow-${PHASE}`, connectionTimeoutMillis: 20000 }); await k.connect(); return k; };

async function snapshot(c) {
  const kv = async (s) => Object.fromEntries((await Q(c, s)).rows.map((r) => [r.k, r.v])); const S = {};
  S.version = (await Q(c, SNAP.version)).rows[0];
  for (const k of ['functions', 'relations', 'columns', 'constraints', 'policies', 'triggers', 'rowCounts', 'schemaAcl', 'defaultAcl', 'sequences']) S[k] = await kv(SNAP[k]);
  S.digests = {}; for (const t of DIGEST_TABLES) S.digests[t] = (await Q(c, DIGEST[t])).rows[0];
  S.schemas = (await Q(c, SNAP.schemas)).rows.map((r) => r.nspname); S.history = (await Q(c, SNAP.history)).rows.map((r) => `${r.version}:${r.name}`); S.advisory = (await Q(c, SNAP.advisory)).rows[0].n; S.counts = (await Q(c, S_AUTHCOUNTS)).rows[0];
  return S;
}
const diff = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return { added: kb.filter((k) => !(k in a)).sort(), removed: ka.filter((k) => !(k in b)).sort(), changed: ka.filter((k) => k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort() }; };
function compareSnapshots(before, after, label) {
  for (const k of Object.keys(before)) {
    const b = before[k], a = after[k]; const isMap = b && typeof b === 'object' && !Array.isArray(b);
    const same = isMap ? (() => { const d = diff(b, a); return !d.added.length && !d.removed.length && !d.changed.length; })() : JSON.stringify(b) === JSON.stringify(a);
    rep(`${label}: ${k} identical to before`, same, same ? '' : JSON.stringify(isMap ? diff(b, a) : { before: b, after: a }).slice(0, 400));
  }
}
const lineOf = (text, pos) => { const upto = text.slice(0, Math.max(0, pos - 1)); const n = upto.split('\n').length; return `line ${n}: ${clean(text.split('\n')[n - 1]?.trim().slice(0, 140) ?? '')}`; };

// ------------------------------------------------------------------------------------------------------------------------------------------------ run
let tx = null; let before = null; let exitCode = 0; let finished = false;
try {
  const c0 = await connect(); before = await snapshot(c0);
  note(`BEFORE snapshot (fresh connection) in phase ${PHASE}. ${before.version.v}`); note(`server_version ${before.version.sv} (${before.version.svn}); harness sha256 ${SELF_SHA}`);
  rep('PRE-STATE: migration history is exactly the four applied versions', JSON.stringify(before.history) === JSON.stringify(['20261108000001:foundation_identity', '20261108000002:staff_capabilities', '20261108000003:audit_and_step_up', '20261108000004:staff_management_rpcs']));
  rep('PRE-STATE: no P3 table exists', !['products', 'product_variants', 'organization_products', 'markup_rules', 'carts', 'cart_items', 'orders', 'order_items', 'order_events'].some((t) => `public.${t}` in before.relations));
  const ns0 = (await Q(c0, P0R.ns)).rows[0];
  rep('PRE-STATE: nothing in the database uses the reserved test namespace', Object.values(ns0).every((n) => n === 0), JSON.stringify(ns0));
  const counts0 = (await Q(c0, S_AUTHCOUNTS)).rows[0]; note(`pre-existing counts: ${JSON.stringify(counts0)}`);
  if (results.some((r) => r.ok === false)) throw new Error('pre-state check failed; nothing executed');

  if (PHASE === 'p0') {
    // ---- P0 step 1: read-only inspection; any surprise stops before a single write
    const r = async (k) => (await Q(c0, P0R[k])).rows;
    const env = (await r('env'))[0]; const priv = (await r('priv'))[0];
    note(`P0 connection role: ${env.cu} (session ${env.su}); superuser ${env.is_super}; bypassrls ${env.bypass_rls}; in recovery ${env.in_recovery}`);
    rep('P0: the connection is a primary (not in recovery)', env.in_recovery === false);
    rep('P0: the connection role may INSERT into auth.users and auth.mfa_factors and use the auth schema', priv.users_insert && priv.factors_insert && priv.auth_usage, JSON.stringify(priv));
    const enums = await r('enums'); const labels = (t) => enums.filter((e) => e.typname === t).map((e) => e.enumlabel);
    rep('P0: auth.factor_type has totp and auth.factor_status has verified (the casts of the fixture insert are valid)', labels('factor_type').includes('totp') && labels('factor_status').includes('verified'), JSON.stringify({ type: labels('factor_type'), status: labels('factor_status') }));
    const cols = await r('cols'); const has = (t, c) => cols.some((x) => x.table_name === t && x.column_name === c);
    rep('P0: the columns the two inserts use exist (auth.users: id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at; auth.mfa_factors: id, user_id, factor_type, status, created_at, updated_at)', ['id', 'instance_id', 'aud', 'role', 'email', 'email_confirmed_at', 'created_at', 'updated_at'].every((c) => has('users', c)) && ['id', 'user_id', 'factor_type', 'status', 'created_at', 'updated_at'].every((c) => has('mfa_factors', c)));
    const required = cols.filter((x) => x.is_nullable === 'NO' && x.column_default === null && !((x.table_name === 'users' && ['id', 'instance_id', 'aud', 'role', 'email', 'email_confirmed_at', 'created_at', 'updated_at'].includes(x.column_name)) || (x.table_name === 'mfa_factors' && ['id', 'user_id', 'factor_type', 'status', 'created_at', 'updated_at'].includes(x.column_name))));
    rep('P0: no other NOT NULL column without a default exists on either table (the minimal inserts cannot fail on a constraint)', required.length === 0, required.map((x) => `${x.table_name}.${x.column_name}`).join(','));
    const trg = await r('triggers');
    note(`P0 triggers on auth.users, auth.mfa_factors, public.profiles: ${JSON.stringify(trg.map((t) => `${t.tbl}.${t.tgname}[${t.tgenabled}] -> ${t.fn}`))}`);
    const unexpected = trg.filter((t) => !trigMatches(t));
    rep('P0: no trigger other than the expected ones exists on auth.users, auth.mfa_factors or public.profiles (any other trigger is an unreviewed side effect: STOP)', unexpected.length === 0, unexpected.map((t) => `${t.tbl}.${t.tgname} -> ${t.fn}`).join('; '));
    rep('P0: the expected trigger on auth.users (on_auth_user_created -> private.handle_new_user) is present and enabled', trg.some((t) => trigParse(t)?.tbl === 'auth.users' && t.tgname === 'on_auth_user_created' && t.tgenabled === 'O'));
    const rules = await r('rules'); rep('P0: no rewrite rule on the three tables', rules.length === 0, JSON.stringify(rules));
    const pubs = await r('pubs'); rep('P0: none of the three tables is in a publication (nothing can be replicated; a rolled-back change is never emitted anyway)', pubs.length === 0, JSON.stringify(pubs));
    note(`P0 info: policies ${JSON.stringify(await r('policies'))}; rls ${JSON.stringify(await r('rls'))}; fks of auth.mfa_factors ${JSON.stringify(await r('fks'))}; event triggers ${JSON.stringify(await r('evt'))}`);
    await c0.end();
    if (results.some((x) => x.ok === false)) throw new Error('P0 inspection failed: STOP before any write');

    // ---- P0 step 2: exactly two fixture inserts inside ONE rolled-back transaction
    tx = await connect(); await Q(tx, S_BEGIN); await Q(tx, S_T1); await Q(tx, S_T2); await Q(tx, S_T3);
    const email = `p3test-p0-${randomBytes(4).toString('hex')}@example.invalid`;
    await Q(tx, P0W.user, [U.P0USER, email]);
    const prof = (await Q(tx, P0W.profile, [U.P0USER])).rows[0].n;
    rep('P0 (in transaction): the auth.users insert succeeded and the on_auth_user_created trigger created exactly one public.profiles row (the only indirect effect)', prof === 1, `profiles ${prof}`);
    await Q(tx, P0W.factor, [U.P0FACTOR, U.P0USER]);
    const fr = (await Q(tx, P0W.factorRow, [U.P0FACTOR])).rows[0];
    rep('P0 (in transaction): the auth.mfa_factors insert succeeded and reads back as a verified totp factor of the probe user', fr?.t === 'totp' && fr?.s === 'verified', JSON.stringify(fr));
    const inTx = (await Q(tx, S_AUTHCOUNTS)).rows[0];
    rep('P0 (in transaction): counts changed by exactly +1 user, +1 factor, +1 profile; identities, staff, roles, organizations, members and audit unchanged', inTx.users === counts0.users + 1 && inTx.factors === counts0.factors + 1 && inTx.profiles === counts0.profiles + 1 && ['identities', 'staff', 'roles', 'orgs', 'members', 'audit'].every((k) => inTx[k] === counts0[k]), JSON.stringify(inTx));
    await Q(tx, S_ROLLBACK); finished = true; tx.end().catch(() => {}); tx = null; note('ROLLBACK issued (P0)');
  } else {
    await c0.end();
    tx = await connect(); TX_EPOCH = Math.floor(Date.now() / 1000); await Q(tx, S_BEGIN); await Q(tx, S_T1); await Q(tx, S_T2); await Q(tx, S_T3);
    note('PHASE T: transaction open (READ COMMITTED, rollback-only). Tests are SINGLE-SESSION and use SIMULATED JWT claims; they are not concurrency tests and not real MFA authentication.');
    await runTierR(tx);
    await Q(tx, S_ROLLBACK); finished = true; tx.end().catch(() => {}); tx = null; note('ROLLBACK issued (T)');
  }
} catch (e) {
  note(`ABORT: ${clean(e.message)}`); exitCode = 1; results.push({ n: 'abort', ok: false });
  if (tx) { try { await tx.query('rollback'); note('ROLLBACK issued (after error)'); } catch (e2) { note(`rollback error: ${clean(e2.message)}`); } await tx.end().catch(() => {}); tx = null; }
} finally {
  try {
    const c1 = await connect(); const after = await snapshot(c1);
    const ns1 = (await Q(c1, P0R.ns)).rows[0]; await c1.end();
    if (before) {
      compareSnapshots(before, after, 'AFTER ROLLBACK (fresh connection)');
      rep('AFTER ROLLBACK: no P3 object, no fixture row and no reserved-namespace row exists; migration history is the same four versions', Object.values(ns1).every((n) => n === 0) && !['products', 'orders', 'order_items', 'markup_rules'].some((t) => `public.${t}` in after.relations) && after.history.length === 4, JSON.stringify(ns1));
    }
  } catch (e) { rep('after-snapshot', false, clean(e.message)); }
}
const failed = results.filter((r) => r.ok === false).length;
if (PHASE === 'p0') { try { writeFileSync(P0_RESULT, JSON.stringify({ phase: 'p0', pass: failed === 0 && exitCode === 0 && finished, harnessSha: SELF_SHA, migrationSha: MIGRATION_SHA, ref: REF, at: new Date().toISOString(), failures: failed })); } catch { /* best effort */ } }
note(`p3-workflow-rollback phase ${PHASE}: ${results.filter((r) => r.ok === true).length} passed, ${failed} FAILED`);
process.exitCode = exitCode || (failed ? (PHASE === 'p0' ? 4 : 1) : 0);

// ================================================================================================================================================ PHASE T
async function runTierR(c) {
  const RUN = randomBytes(4).toString('hex'); const emailOf = (tag) => `p3test-${tag.toLowerCase()}-${RUN}@example.invalid`;
  const ledger = {}; const bump = (a, o) => { ledger[`${a}|${o}`] = (ledger[`${a}|${o}`] ?? 0) + 1; };
  const code = (x) => x.e ?? (x.v && typeof x.v === 'object' ? (x.v.code ?? (x.v.ok ? 'ok' : '?')) : '?');
  // identity-switched call inside a savepoint; the expected audit ledger is derived from the answer and compared with the audit table at the end
  async function call(who, rpc, params = []) {
    await Q(c, S_SP); let out;
    try {
      const cl = claimsFor(who);
      await Q(c, S_CLAIMS, [JSON.stringify(cl ?? {})]);
      await Q(c, who === 'ANON' ? S_ROLE_ANON : S_ROLE_AUTH);
      const r = await Q(c, RPC_SQL[rpc], params); out = { v: r.rows[0]?.r };
      await Q(c, S_RESET); await Q(c, S_SPX);
    } catch (e) { await Q(c, S_SPR); await Q(c, S_SPX); out = { e: e.code ?? 'ERR', msg: clean(e.message) }; }
    const k = code(out);
    if (AUDIT_ACTION[rpc]) {
      if (k === 'forbidden' || k === 'step_up_required') bump(AUDIT_ACTION[rpc], 'denied');
      else if (out.v?.ok && MUTATING_STAFF.has(rpc) && k !== 'already_member') bump(AUDIT_ACTION[rpc], 'success');
      else if (rpc === 'rpc_admin_order_set_status' && k === 'invalid_transition') bump(AUDIT_ACTION[rpc], 'denied');
    }
    if (rpc === 'rpc_checkout' && out.v?.ok && out.v.replay === false) bump('order.place', 'success');
    return out;
  }
  const direct = async (who, sqlStr, params = []) => { await Q(c, S_SP); try { await Q(c, S_CLAIMS, [JSON.stringify(claimsFor(who) ?? {})]); await Q(c, who === 'ANON' ? S_ROLE_ANON : S_ROLE_AUTH); const r = await Q(c, sqlStr, params); await Q(c, S_RESET); await Q(c, S_SPX); return { v: r.rows[0] }; } catch (e) { await Q(c, S_SPR); await Q(c, S_SPX); return { e: e.code ?? 'ERR' }; } };
  const ownerNeg = async (sqlStr, params = []) => { await Q(c, S_SP); try { await Q(c, sqlStr, params); await Q(c, S_SPR); await Q(c, S_SPX); return 'ALLOWED'; } catch (e) { await Q(c, S_SPR); await Q(c, S_SPX); return e.code ?? 'ERR'; } };
  const ck = (name, ok, d = '') => rep(name, Boolean(ok), d);
  const idOf = async (s, k) => (await Q(c, s, [k])).rows[0]?.id;

  // ---- F1 fixtures: users, staff (through the REAL 0002 guards), organizations, memberships  [SIM-JWT fixtures; no real authenticator exists]
  const mkUser = (key, { confirmed = true, banned = null, deleted = null } = {}) => Q(c, FX.user, [U[key], emailOf(key), confirmed ? new Date().toISOString() : null, banned, deleted]);
  for (const [key, role] of STAFF_FIXTURES.map((f) => [f[0], f[1]])) {
    await mkUser(key); await Q(c, FX.staff, [U[key], 'active']); if (role) await Q(c, FX.role, [U[key], role]);
    const w = (await Q(c, FX.window, [U[key]])).rows[0].id; const fid = id(`f${U[key].slice(-3)}`);
    await Q(c, FX.factor, [fid, U[key]]); await Q(c, FX.claim, [fid, U[key], w]);
  }
  await mkUser('STAFF_DISABLED'); await Q(c, FX.staff, [U.STAFF_DISABLED, 'disabled']); await Q(c, FX.role, [U.STAFF_DISABLED, 'admin']);
  for (const key of ['A1', 'A2', 'B1', 'C1', 'NONE', 'REMOVED']) await mkUser(key);
  await mkUser('BANNED', { banned: new Date(Date.now() + 86400000).toISOString() }); await mkUser('DELETED', { deleted: new Date().toISOString() }); await mkUser('UNCONF', { confirmed: false });
  await Q(c, FX.org, [ORG.A, 'P3 Test Org A', ORG_CODE.A, 'active']); await Q(c, FX.org, [ORG.B, 'P3 Test Org B', ORG_CODE.B, 'active']); await Q(c, FX.org, [ORG.C, 'P3 Test Org C', ORG_CODE.C, 'suspended']);
  await Q(c, FX.member, [ORG.A, U.A1, 'owner', 'active', null]); await Q(c, FX.member, [ORG.A, U.A2, 'member', 'active', null]); await Q(c, FX.member, [ORG.B, U.B1, 'owner', 'active', null]);
  await Q(c, FX.member, [ORG.C, U.C1, 'member', 'active', null]); await Q(c, FX.member, [ORG.A, U.REMOVED, 'member', 'removed', new Date().toISOString()]);
  const sc = (await Q(c, FX.structure)).rows[0].r; ck('F1: the structure check passes inside the transaction (required by the staff session predicate)', sc === 'passed', String(sc));

  // ---- F0: the approved migration and seed, executed inside this transaction
  const runFile = async (buf, want, label) => { if (sha(buf) !== want) throw new Error(`${label} hash mismatch`); try { await c.query(buf.toString('utf8')); return true; } catch (e) { rep(`${label} execution`, false, `${clean(e.message)} [${e.code ?? ''}] ${e.position ? lineOf(buf.toString('utf8'), Number(e.position)) : ''}`); return false; } };
  if (!(await runFile(mig, MIGRATION_SHA, 'migration')) || !(await runFile(seed, SEED_SHA, 'seed'))) throw new Error('migration or seed failed: STOP');
  const cc = (await Q(c, FX.catalogCount)).rows[0]; ck('F0: P3 migration and seed executed (153 products, 221 variants)', cc.p === 153 && cc.v === 221, JSON.stringify(cc));
  const V = {}; for (const [k, s] of Object.entries(SKU)) V[k] = await idOf(FX.variant, s); const P = {}; for (const [k, s] of Object.entries(SLUG)) P[k] = await idOf(FX.product, s);
  ck('F2: all fixture variants and products resolved from the seed', Object.values(V).every(Boolean) && Object.values(P).every(Boolean));

  // ---- 4.1 identity and membership (T01-T05c)  [SIM-JWT]
  let r = await call('A1', 'rpc_catalog_list', [ORG.A]); ck('T01 member of A sees an empty catalog before anything is published', r.v?.ok && r.v.items.length === 0);
  for (const who of ['NONE', 'REMOVED']) for (const rpc of ['rpc_catalog_list', 'rpc_cart_get']) { r = await call(who, rpc, [ORG.A]); ck(`T02/T03 ${who} ${rpc} on ORG_A -> organization_not_found`, code(r) === 'organization_not_found', code(r)); }
  r = await call('NONE', 'rpc_orders_list', [ORG.A, 10]); ck('T02 NONE rpc_orders_list on ORG_A -> organization_not_found', code(r) === 'organization_not_found');
  r = await call('C1', 'rpc_catalog_list', [ORG.C]); ck('T04 member of a suspended organization -> organization_not_found', code(r) === 'organization_not_found', code(r));
  r = await call('ANON', 'rpc_catalog_list', [ORG.A]); ck('T05 anon -> 42501', code(r) === '42501', code(r));
  await Q(c, S_SP); await Q(c, S_CLAIMS, [JSON.stringify({})]); await Q(c, S_ROLE_AUTH); let nosub; try { nosub = (await Q(c, RPC_SQL.rpc_catalog_list, [ORG.A])).rows[0]?.r; } catch (e) { nosub = { e: e.code }; } await Q(c, S_SPR); await Q(c, S_SPX);
  ck('T05 authenticated role with no subject -> 42501 (authentication required)', nosub?.e === '42501', JSON.stringify(nosub));

  // ---- 4.2 admin setup (T06-T11)  [SIM-JWT staff session: aal2 + fresh TOTP amr]
  r = await call('ADMIN', 'rpc_admin_catalog_list'); ck('T06 admin catalog list: 153 products, every base and floor NULL', r.v?.ok && r.v.products.length === 153 && r.v.products.every((p) => p.variants.every((x) => x.base_price_cents === null && x.min_price_cents === null)));
  for (const [k, [b, f]] of Object.entries(PRICES)) { r = await call('ADMIN', 'rpc_admin_variant_set_price', [V[k], b, f]); ck(`T07 set price ${k} ${b}/${f}`, code(r) === 'updated', code(r)); }
  for (const args of [[V.V11, 0, 100], [V.V11, 100, 100000001]]) { r = await call('ADMIN', 'rpc_admin_variant_set_price', args); ck(`T07b invalid price ${args[1]}/${args[2]} -> 22023`, code(r) === '22023', code(r)); }
  r = await call('ADMIN', 'rpc_admin_variant_set_price', [id('dead'), 100, 100]); ck('T07b unknown variant -> variant_not_found', code(r) === 'variant_not_found', code(r));
  r = await call('ADMIN', 'rpc_admin_org_product_set', [ORG.A, P.PR4, true, true]); ck('T08 publishing an unpriced product -> product_not_priced', code(r) === 'product_not_priced', code(r));
  for (const [o, p] of [['A', 'PR1'], ['A', 'PR2'], ['A', 'PR3'], ['B', 'PR1'], ['B', 'PR3']]) { r = await call('ADMIN', 'rpc_admin_org_product_set', [ORG[o], P[p], true, true]); ck(`T08b publish ${p} for ORG_${o}`, code(r) === 'updated', code(r)); }
  const rule = (o, kind, prod, type, val, a = null, b = null, cc2 = null, d = null) => call('ADMIN', 'rpc_admin_markup_rule_set', [ORG[o], kind, prod, type, val, a, b, cc2, d, true]);
  for (const [lbl, res] of [['A org default 25%', await rule('A', 'organization', null, 'percent', 250000)], ['A rep default 5%', await rule('A', 'representative', null, 'percent', 50000)], ['A org PR2 10% with rep bounds 2-3%', await rule('A', 'organization', P.PR2, 'percent', 100000, 20000, 30000)], ['B org default fixed $5', await rule('B', 'organization', null, 'fixed', 50000)]]) ck(`T09 rule ${lbl}`, code(res) === 'updated', code(res));
  const upd = await rule('A', 'organization', null, 'percent', 250000); ck('T09b the same scope updates in place (no duplicate row)', code(upd) === 'updated' && (await Q(c, FX.ruleCount, [ORG.A])).rows[0].n === 3);
  for (const [lbl, res, want] of [['percent above 1000', await rule('A', 'organization', null, 'percent', 10000001), '22023'], ['representative rule with bounds', await rule('A', 'representative', P.PR1, 'percent', 10000, 1, 2), '22023'], ['min above max', await rule('A', 'organization', P.PR1, 'percent', 10000, 30000, 20000), '22023'], ['unknown product', await rule('A', 'organization', id('dead'), 'percent', 10000), 'product_not_found']]) ck(`T09b ${lbl} -> ${want}`, code(res) === want, code(res));
  // T10 floor enforcement, T11 clearing a base price
  r = await call('ADMIN', 'rpc_admin_variant_set_price', [V.V12, 18000, 30000]); let cat = await call('A1', 'rpc_catalog_list', [ORG.A]);
  const unit = (res, sku) => res.v?.items?.flatMap((p) => p.variants).find((x) => x.sku === sku)?.unit_cents;
  ck('T10 a raised floor wins: V12 for ORG_A costs 30000', unit(cat, SKU.V12) === 30000, String(unit(cat, SKU.V12)));
  await call('ADMIN', 'rpc_admin_variant_set_price', [V.V12, 18000, 15000]);
  await call('ADMIN', 'rpc_admin_variant_set_price', [V.V11, null, 11000]); cat = await call('A1', 'rpc_catalog_list', [ORG.A]); r = await call('A1', 'rpc_cart_put_item', [ORG.A, V.V11, 1]);
  ck('T11 a variant without a base price disappears from the catalog and cannot be added to a cart', unit(cat, SKU.V11) === undefined && code(r) === 'not_available', `${unit(cat, SKU.V11)}/${code(r)}`);
  await call('ADMIN', 'rpc_admin_variant_set_price', [V.V11, 10000, 11000]);

  // ---- 4.3 shop visibility and tenant isolation (T12-T13)
  cat = await call('A1', 'rpc_catalog_list', [ORG.A]);
  for (const [k, e] of Object.entries(EXPECT_A)) ck(`T12 ORG_A price of ${k} = ${e}`, unit(cat, SKU[k]) === e, String(unit(cat, SKU[k])));
  ck('T12 V32 (no base) and the unpriced PR4 are absent; no cost field appears anywhere in the JSON', unit(cat, SKU.V32) === undefined && !JSON.stringify(cat.v).match(/base_price|min_price|floor|markup|org_amount|pricing/));
  const catB = await call('B1', 'rpc_catalog_list', [ORG.B]); for (const [k, e] of Object.entries(EXPECT_B)) ck(`T12b ORG_B price of ${k} = ${e}`, unit(catB, SKU[k]) === e, String(unit(catB, SKU[k])));
  ck('T12b PR2 is not published for ORG_B', unit(catB, SKU.V21) === undefined);
  r = await call('B1', 'rpc_catalog_list', [ORG.A]); ck('T12c B1 asking for ORG_A -> organization_not_found', code(r) === 'organization_not_found');
  for (const t of Object.keys(FX.tableRead)) for (const who of ['A1', 'ANON']) { const d = await direct(who, FX.tableRead[t]); ck(`T13 ${who} select from public.${t} -> 42501`, d.e === '42501', d.e ?? 'allowed'); }

  // ---- 4.4 cart (T14)
  for (const [k, q] of [['V11', 2], ['V21', 10], ['V31', 1]]) { r = await call('A1', 'rpc_cart_put_item', [ORG.A, V[k], q]); ck(`T14 put ${k} x${q}`, code(r) === 'updated', code(r)); }
  r = await call('A1', 'rpc_cart_get', [ORG.A]); const line = (res, sku) => res.v?.lines?.find((l) => l.sku === sku);
  ck('T14 cart lines are priced by the database: 13125 x2, 377 x10, 26250 x1', line(r, SKU.V11)?.line_cents === 26250 && line(r, SKU.V21)?.line_cents === 3770 && line(r, SKU.V31)?.line_cents === 26250 && r.v.lines.every((l) => l.purchasable));
  await call('A1', 'rpc_cart_put_item', [ORG.A, V.V11, 5]); await call('A1', 'rpc_cart_put_item', [ORG.A, V.V11, 0]); r = await call('A1', 'rpc_cart_get', [ORG.A]); ck('T14b a quantity change and a removal work', !line(r, SKU.V11) && r.v.lines.length === 2);
  await call('A1', 'rpc_cart_put_item', [ORG.A, V.V11, 2]);
  for (const [lbl, rr, want] of [['V32 (no base)', await call('A1', 'rpc_cart_put_item', [ORG.A, V.V32, 1]), 'not_available'], ['unpriced PR4 variant', await call('A1', 'rpc_cart_put_item', [ORG.A, await idOf(FX.variant, SKU.V41), 1]), 'not_available'], ['quantity 10001', await call('A1', 'rpc_cart_put_item', [ORG.A, V.V11, 10001]), '22023'], ['quantity -1', await call('A1', 'rpc_cart_put_item', [ORG.A, V.V11, -1]), '22023'], ['an ORG_B-only assignment is not purchasable for ORG_A? (V12 is published for both: control)', await call('B1', 'rpc_cart_put_item', [ORG.B, V.V21, 1]), 'not_available']]) ck(`T14c ${lbl} -> ${want}`, code(rr) === want, code(rr));
  r = await call('A2', 'rpc_cart_get', [ORG.A]); ck('T14d another member of the organization has an empty cart (carts are per organization and user)', r.v?.ok && r.v.lines.length === 0);
  const cartBefore = (await Q(c, FX.cartCount)).rows[0];

  // ---- 4.5 checkout, idempotency, snapshot (T15-T16)
  r = await call('A1', 'rpc_checkout', [ORG.A, JSON.stringify(SHIP), null, K1]); const O1 = r.v?.order_id;
  ck('T15a checkout: order_placed, replay false, total 56270', code(r) === 'order_placed' && r.v.replay === false && r.v.total_cents === 56270 && /^ORD-\d{8}$/.test(r.v.order_number), JSON.stringify(r.v));
  const o1 = (await Q(c, FX.orderRow, [O1])).rows[0]; const it1 = (await Q(c, FX.items, [O1])).rows; const ev1 = (await Q(c, FX.events, [O1])).rows.map((x) => x.to_status);
  ck('T15a database state: one placed order (subtotal = total = 56270, key K1), 3 items with snapshots, one placed event, empty cart', o1?.status === 'placed' && o1.total === '56270' && o1.subtotal === '56270' && o1.ikey === K1 && it1.length === 3 && ev1.join() === 'placed' && (await Q(c, FX.cartCount)).rows[0].items === cartBefore.items - 3);
  const p11 = JSON.parse(it1.find((x) => x.sku === SKU.V11).pricing);
  ck('T15a snapshot of V11: base 10000, org 2500, org price 12500, rep 625, raw 13125, unit 13125, no clamp, no floor', p11.base === 10000 && p11.org_amount === 2500 && p11.org_price === 12500 && p11.rep_amount === 625 && p11.raw === 13125 && p11.unit === 13125 && p11.rep_clamped === false && p11.floor_applied === false, JSON.stringify(p11));
  const p21 = JSON.parse(it1.find((x) => x.sku === SKU.V21).pricing); ck('T15a snapshot of V21: representative 5% clamped to 3% (amount 11)', p21.rep_clamped === true && p21.rep_amount === 11 && p21.unit === 377, JSON.stringify(p21));
  r = await call('A1', 'rpc_checkout', [ORG.A, JSON.stringify(SHIP), null, K1]); ck('T15b the same key returns the SAME order (replay true) and creates nothing more', code(r) === 'order_placed' && r.v.replay === true && r.v.order_id === O1 && (await Q(c, FX.orderCount)).rows[0].n === 1 && (await Q(c, FX.items, [O1])).rows.length === 3);
  r = await call('A1', 'rpc_checkout', [ORG.A, JSON.stringify(SHIP), null, K2]); ck('T15c a new key with an empty cart -> cart_empty', code(r) === 'cart_empty', code(r));
  await call('A2', 'rpc_cart_put_item', [ORG.A, V.V31, 1]); r = await call('A2', 'rpc_checkout', [ORG.A, JSON.stringify(SHIP), null, K1]); ck('T15d the key is unique per (organization, user): another member with the same key gets a NEW order', code(r) === 'order_placed' && r.v.replay === false && r.v.order_id !== O1 && (await Q(c, FX.orderCount)).rows[0].n === 2);
  await call('ADMIN', 'rpc_admin_variant_set_price', [V.V12, 18000, 30000]); await call('A1', 'rpc_cart_put_item', [ORG.A, V.V12, 1]); r = await call('A1', 'rpc_checkout', [ORG.A, JSON.stringify(SHIP), null, K3]);
  const it3 = (await Q(c, FX.items, [r.v?.order_id])).rows; const p12 = JSON.parse(it3[0]?.pricing ?? '{}'); ck('T15e a floor above the marked-up price is applied and recorded (raw 23625, unit 30000, floor_applied)', p12.raw === 23625 && p12.unit === 30000 && p12.floor_applied === true, JSON.stringify(p12));
  await call('ADMIN', 'rpc_admin_variant_set_price', [V.V12, 18000, 15000]);
  await call('A1', 'rpc_cart_put_item', [ORG.A, V.V11, 1]);
  const bad = [[{ ...SHIP, city: undefined }, null, K2], [{ ...SHIP, country: 'usa' }, null, K2], [{ ...SHIP, extra: 'x' }, null, K2], [SHIP, 'x'.repeat(501), K2], [SHIP, null, null]];
  for (const [i, [s, n, k]] of bad.entries()) { r = await call('A1', 'rpc_checkout', [ORG.A, JSON.stringify(s), n, k]); ck(`T15f invalid checkout input #${i + 1} -> 22023`, code(r) === '22023', code(r)); }
  const ordersNow = (await Q(c, FX.orderCount)).rows[0].n;
  // T16 future-only pricing
  await call('ADMIN', 'rpc_admin_variant_set_price', [V.V11, 12000, 11000]); await rule('A', 'organization', null, 'percent', 400000);
  r = await call('ADMIN', 'rpc_admin_order_get', [O1]); const a1 = r.v?.items?.find((x) => x.sku === SKU.V11);
  ck('T16 placed orders are unchanged by later price and rule changes (V11 still 13125, total 56270, same breakdown)', a1?.unit_price_cents === 13125 && r.v.order.total_cents === 56270 && a1.pricing.org_amount === 2500, JSON.stringify(a1?.unit_price_cents));
  r = await call('A1', 'rpc_cart_get', [ORG.A]); ck('T16 an open cart is repriced with the new rules (V11: 12000 + 40% = 16800 + 5% = 17640)', line(r, SKU.V11)?.unit_cents === 17640, String(line(r, SKU.V11)?.unit_cents));
  for (const [lbl, st, p] of [['update an order item', FX.badItemUpdate, [O1]], ['delete an order', FX.badOrderDelete, [O1]], ['truncate order events', FX.badEventTruncate, []], ['rewrite an order total', FX.badOrderTotal, [O1]], ['jump a status to delivered', FX.badOrderStatus, [O1]]]) { const e = await ownerNeg(st, p); ck(`T16b direct ${lbl} is refused by the database`, e !== 'ALLOWED', e); }
  const view = await call('A1', 'rpc_order_get', [ORG.A, O1]); ck('T16c the customer view of an order shows unit and line prices only (no base, floor or breakdown)', view.v?.ok && view.v.items.length === 3 && !JSON.stringify(view.v).match(/base|floor|pricing|markup/));
  ck('T15g order_too_large cannot be exercised without 100 variants at the price cap: NOT RUN in this harness (listed as a gap)', true);

  // ---- 4.6 admin orders (T17-T18)
  for (const who of ['ADMIN', 'OPS', 'SUPPORT', 'FINANCE']) { r = await call(who, 'rpc_admin_orders_list', [null, 100]); ck(`T17 ${who} lists the orders (at least the 3 fixtures, with organization names)`, r.v?.ok && r.v.orders.length >= 3 && r.v.orders.every((o) => o.organization_code), code(r)); }
  r = await call('ADMIN', 'rpc_admin_orders_list', ['paid', 100]); ck('T17 an invalid status filter -> 22023', code(r) === '22023', code(r));
  r = await call('OPS', 'rpc_admin_order_get', [O1]); ck('T17b staff order detail carries base, floor and the full breakdown', r.v?.ok && r.v.items.every((x) => x.base_price_cents > 0 && x.pricing && typeof x.pricing.unit === 'number'));
  for (const [to, want] of [['confirmed', 'updated'], ['processing', 'updated'], ['shipped', 'updated'], ['delivered', 'updated']]) { r = await call('OPS', 'rpc_admin_order_set_status', [O1, to, 'p3 test']); ck(`T18 placed...delivered: ${to}`, code(r) === want, code(r)); }
  ck('T18 the history shows placed, confirmed, processing, shipped, delivered', (await Q(c, FX.events, [O1])).rows.map((x) => x.to_status).join() === 'placed,confirmed,processing,shipped,delivered');
  const O2 = (await call('A1', 'rpc_orders_list', [ORG.A, 10])).v.orders.find((o) => o.status === 'placed')?.order_id;
  for (const [to, want] of [['shipped', 'invalid_transition'], ['delivered', 'invalid_transition']]) { r = await call('OPS', 'rpc_admin_order_set_status', [O2, to, null]); ck(`T18b placed -> ${to} refused`, code(r) === want, code(r)); }
  r = await call('OPS', 'rpc_admin_order_set_status', [O1, 'cancelled', null]); ck('T18b delivered -> cancelled refused', code(r) === 'invalid_transition', code(r));
  r = await call('OPS', 'rpc_admin_order_set_status', [O2, 'cancelled', null]); const r2 = await call('OPS', 'rpc_admin_order_set_status', [O2, 'confirmed', null]); ck('T18c placed -> cancelled allowed once, then final', code(r) === 'updated' && code(r2) === 'invalid_transition');

  // ---- 4.1b membership RPC (T05b/T05c)
  r = await call('ADMIN', 'rpc_admin_org_member_add', [ORG.B, emailOf('NONE'), 'member']); ck('T05b member add -> added', code(r) === 'added', code(r));
  r = await call('ADMIN', 'rpc_admin_org_member_add', [ORG.B, emailOf('NONE'), 'member']); ck('T05b again -> already_member (no audit row)', code(r) === 'already_member', code(r));
  r = await call('ADMIN', 'rpc_admin_org_member_add', [ORG.B, emailOf('NONE'), 'owner']); ck('T05b member -> owner is a role_changed', code(r) === 'role_changed', code(r));
  r = await call('ADMIN', 'rpc_admin_org_member_add', [ORG.B, emailOf('NONE'), 'member']); ck('T05c an owner is never silently demoted -> owner_downgrade_not_allowed', code(r) === 'owner_downgrade_not_allowed', code(r));
  for (const key of ['BANNED', 'DELETED', 'UNCONF']) { r = await call('ADMIN', 'rpc_admin_org_member_add', [ORG.A, emailOf(key), 'member']); ck(`T05c ${key} target -> user_not_found`, code(r) === 'user_not_found', code(r)); }
  r = await call('ADMIN', 'rpc_admin_org_member_add', [ORG.A, emailOf('OPS'), 'member']); ck('T05c a staff account cannot become an organization member -> member_not_allowed', code(r) === 'member_not_allowed', code(r));
  r = await call('ADMIN', 'rpc_admin_org_member_add', [ORG.C, emailOf('A2'), 'member']); ck('T05c a suspended organization -> organization_not_found', code(r) === 'organization_not_found', code(r));

  // ---- 4.8 cross-organization attempts (T20)
  r = await call('B1', 'rpc_order_get', [ORG.B, O1]); ck('T20 an ORG_A order id asked through ORG_B -> order_not_found', code(r) === 'order_not_found', code(r));
  r = await call('B1', 'rpc_order_get', [ORG.A, O1]); ck('T20b ORG_A id as a non-member -> organization_not_found', code(r) === 'organization_not_found', code(r));
  r = await call('B1', 'rpc_orders_list', [ORG.B, 50]); ck('T20c ORG_B lists no order of ORG_A', r.v?.ok && r.v.orders.length === 0);
  for (const [rpc, args] of [['rpc_cart_put_item', [ORG.B, V.V11, 1]], ['rpc_cart_get', [ORG.B]], ['rpc_checkout', [ORG.B, JSON.stringify(SHIP), null, K2]]]) { r = await call('A1', rpc, args); ck(`T20d A1 ${rpc} on ORG_B -> organization_not_found`, code(r) === 'organization_not_found', code(r)); }
  r = await call('A1', 'rpc_cart_get', [ORG.C]); ck('T20e A1 on a foreign suspended organization -> organization_not_found', code(r) === 'organization_not_found');
  r = await call('A1', 'rpc_admin_orders_list', [null, 10]); ck('T20f a customer calling an admin RPC -> 42501', code(r) === '42501', code(r));

  // ---- 4.7 the authorization grid (T19)  [SIM-JWT]
  const SAFE = { rpc_admin_catalog_list: [], rpc_admin_org_catalog_get: [ORG.A], rpc_admin_product_set_status: [P.PR1, 'active'], rpc_admin_org_product_set: [ORG.A, P.PR1, true, true], rpc_admin_variant_set_price: [V.V11, 12000, 11000],
    rpc_admin_markup_rule_set: [ORG.A, 'organization', null, 'percent', 400000, null, null, null, null, true], rpc_admin_org_create: ['Grid Org', 'P3T-G', 'prepay'], rpc_admin_org_member_add: [ORG.A, emailOf('A2'), 'member'],
    rpc_admin_orders_list: [null, 10], rpc_admin_order_get: [O1], rpc_admin_orgs_list: [], rpc_admin_order_set_status: [O1, 'cancelled', null] };
  for (const who of Object.keys(GRID)) for (const [g, rpcs] of Object.entries(GROUP)) for (const rpc of rpcs) {
    const rr = await call(who, rpc, rpc === 'rpc_admin_org_create' ? ['Grid Org', `P3T-G${who.slice(0, 3)}`.slice(0, 12), 'prepay'] : SAFE[rpc]); const want = GRID[who][g]; const got = code(rr);
    ck(`T19 ${who} x ${rpc}: ${want}`, want === 'pass' ? !['forbidden', 'step_up_required', '42501'].includes(got) : got === want, got);
  }
  r = await call('ADMIN', 'rpc_admin_org_member_add', [ORG.A, emailOf('OPS'), 'member']); ck('T19b a staff user cannot become a member (0002 guard)', code(r) === 'member_not_allowed', code(r));

  // ---- 4.9 audit (T21)
  r = await call('A1', 'rpc_cart_put_item', [ORG.A, V.V21, 3]); await call('A1', 'rpc_cart_get', [ORG.A]); await call('A1', 'rpc_catalog_list', [ORG.A]);
  const rows = (await Q(c, FX.audit)).rows; const grp = (await Q(c, FX.auditGroup)).rows; const actual = Object.fromEntries(grp.map((g) => [`${g.action}|${g.outcome}`, g.n]));
  const keys = new Set([...Object.keys(actual), ...Object.keys(ledger)]); const mism = [...keys].filter((k) => (actual[k] ?? 0) !== (ledger[k] ?? 0)).map((k) => `${k}: audit ${actual[k] ?? 0}, expected ${ledger[k] ?? 0}`);
  ck('T21 the audit table mirrors the returned outcomes exactly (every mutation and every gate refusal one row, nothing else)', mism.length === 0, mism.join('; '));
  ck('T21 exactly 3 checkouts (O1, A2, K3) wrote exactly 3 order.place rows; no cart or catalog action wrote any row', actual['order.place|success'] === 3 && ![...Object.keys(actual)].some((k) => /cart|catalog\.list/.test(k) && !/staff\./.test(k)));
  ck('T21 audit rows carry no free text: no detail contains a note, an address, an email or a reason', rows.every((x) => !/p3 test|Test Way|example\.invalid|Testville/i.test(x.detail ?? '')));
  ck('T21 actor kinds are staff or organization_user only; organization-scoped actions carry the organization id', rows.every((x) => ['staff', 'organization_user'].includes(x.actor_kind)) && rows.filter((x) => x.action === 'order.place').every((x) => x.org === ORG.A));
  note(`TESTS NOT COVERED BY THIS HARNESS: T14e (101 lines), T15g (order_too_large) need 100+ priced variants at the cap; real GoTrue/MFA, PostgREST and ALL concurrency tests (T15x D1-D7) are deferred to an approved isolated environment. ${sqlLog.length} allow-listed statements were sent.`);
}
