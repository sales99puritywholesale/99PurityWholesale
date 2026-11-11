// TEXT-PATTERN GUARDRAIL for migration drafts (rev2.1). It is NOT a SQL parser, NOT a proof of correctness and NOT a
// database test. Dependency-free; reads files only; never connects to a database.
// It does NOT validate (among other things): that the SQL parses; policy expression logic; trigger firing order,
// cascade behavior, locking or concurrency; isolation levels in practice; FK action semantics; that function
// bodies are logically correct (it only looks for required words/shapes); that approved-column limits hold for
// aliases other than `f` or for constructs such as to_jsonb(row) / row_to_json(row) that read a row without
// naming its columns; default-privilege effects at runtime. Passing means 'no listed pattern found', nothing more.
// Usage: node supabase/review/static-check.mjs [--selftest] [file.sql ...]   (default: all NNNN_*.sql next to this file)
// These are text-pattern checks only.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase();
// P6: the ONLY functions the anon role may execute (key-authenticated integration RPCs); see the R6 exemption in check() and tests/portal/integrations-sql.test.ts
const ANON_RPC_ALLOW = new Set(['rpc_api_order_create', 'rpc_api_order_get', 'rpc_api_orders_list', 'rpc_worker_claim_deliveries', 'rpc_worker_record_result']);
// R11 exemption pin (see the comment at its use): the reviewed P3 migration and its four reviewed star statements, matched after norm().
const REVIEWED_STAR_FILE_SHA256 = 'd5efe7e9753b13c6ccaedf1fb70d31ab3431d967d46764ceb3cb290ce5195beb';
const REVIEWED_STAR_FRAGMENTS = [
  'from (select * from public.orders x where x.organization_id = p_organization_id order by x.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) o',
  'select * into o from public.orders x where x.id = p_order_id and x.organization_id = p_organization_id;',
  'from (select * from public.orders x where p_status is null or x.status = p_status order by x.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) o',
  'select x.*, g.name as org_name, g.code as org_code into o from public.orders x join public.organizations g on g.id = x.organization_id where x.id = p_order_id;',
].map(norm);
const EXEC_ALLOW = new Set(['my_org_ids', 'my_owner_org_ids', 'staff_session_ok', 'has_capability']);
const MFA_COLS = new Set(['id', 'user_id', 'factor_type', 'status', 'created_at']);
const MFA_READERS = new Set(['run_auth_structure_check', 'mfa_check_ok', 'guard_staff_mfa_factor_insert']);
const ISOLATION_FNS = new Set(['guard_organization_members', 'guard_staff_not_member', 'guard_member_not_staff', 'guard_last_admin_lock']);
const TRUNCATE_PROTECTED = ['public.organization_members', 'public.staff_members', 'public.staff_roles'];
const AFTER_CHECKED = ['public.organization_members', 'public.staff_members', 'public.staff_roles'];

function parseFunctions(sql) {
  const re = /create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_]+)\s*\(([^)]*)\)([\s\S]*?)\bas\s+\$\$([\s\S]*?)\$\$/gi;
  const out = []; let m;
  while ((m = re.exec(sql))) out.push({ full: m[1], name: m[1].split('.')[1], schema: m[1].split('.')[0], header: `${m[1]}(${m[2]})${m[3]}`, body: m[4], span: [m.index, re.lastIndex] });
  return out;
}

export function check(name, raw) {
  const sql = strip(raw); const f = []; let m;
  const add = (rule, msg) => f.push(`${rule}: ${msg}`);
  const fns = parseFunctions(sql);
  const nsql = norm(sql);

  // R1 secret column / R2 iat / R3 super_admin / R4 metadata / R10 embedded credentials
  if (/\bsecret\b/i.test(sql)) add('R1-no-secret-column', 'reference to "secret" in code');
  if (/\biat\b/i.test(sql)) add('R2-no-iat', 'reference to jwt iat');
  if (/super[_-]?admin/i.test(sql)) add('R3-no-super-admin', 'super_admin introduced');
  if (/user_metadata|raw_user_meta_data|raw_app_meta_data|app_metadata/i.test(sql)) add('R4-no-metadata-authorization', 'metadata reference');
  if (/eyJ[A-Za-z0-9_-]{10,}|sb_secret_|sb_publishable_|service_role_key/i.test(sql)) add('R10-no-embedded-credentials', 'credential-like string');

  // R5 pinned search_path on definers; R16 functions live in private (the ONLY exception is the approved RPC surface: public.rpc_<name>, which static-check-p22.mjs gates strictly: definer, pinned path, audit, grants); R17 no dynamic SQL
  let defs = 0;
  for (const fn of fns) {
    if (fn.schema !== 'private' && !(fn.schema === 'public' && /^rpc_[a-z0-9_]+$/.test(fn.name))) add('R16-functions-in-private', `function outside schema private: ${fn.full}`);
    const definer = /security\s+definer/i.test(fn.header); if (definer) defs++;
    if (!/set\s+search_path\s*=\s*''/i.test(fn.header)) add('R5-pinned-search-path', `${definer ? 'definer' : 'invoker'} function without search_path='': ${fn.full}`);
    if (/\bexecute\b/i.test(fn.body)) add('R17-no-dynamic-sql', `EXECUTE inside function body: ${fn.full}`);
  }

  // R6/R9 grants
  const grantScan = sql.replace(/'(?:[^']|'')*'/g, "''"); // ignore text inside string literals (error messages)
  const grRe = /\bgrant\b([^;]*?)\bto\b([^;]*);/gi;
  while ((m = grRe.exec(grantScan))) {
    const what = norm(m[1]).trim(); const who = m[2].toLowerCase();
    if (/\b(anon|service_role|public)\b/.test(who)) {
      // P6 exemption, pinned by NAME: the key-authenticated integration RPCs are the only functions anon may execute (the credential is the API key or worker token, checked
      // inside each function). Only 'anon' (never public or service_role), only "execute on function public.<name>(...)" for names on ANON_RPC_ALLOW.
      const exA = /^execute on function (.+)$/.exec(what);
      if (exA && who.replace(/[\s,]/g, '') === 'anon') {
        const itemsA = [...exA[1].matchAll(/\bpublic\.([a-z0-9_]+)\s*\([^)]*\)/g)];
        const leftoverA = exA[1].replace(/\bpublic\.[a-z0-9_]+\s*\([^)]*\)/g, '').replace(/[\s,]/g, '');
        if (itemsA.length > 0 && leftoverA === '' && itemsA.every(([, n]) => ANON_RPC_ALLOW.has(n))) continue;
      }
      add('R6-no-grant-to-anon-service-public', `grant ${what} to${who}`); continue;
    }
    if (!/\bauthenticated\b/.test(who)) continue;
    if (what.startsWith('select on ')) continue;
    if (what === 'usage on schema private') continue;
    if (/^update \(full_name, phone\) on public\.profiles$/.test(what)) continue;
    const ex = /^execute on function (.+)$/.exec(what);
    if (ex) {
      // each item is schema.name(args); private functions must be on the allow-list, public ones must be the approved RPC surface (public.rpc_*), which
      // static-check-p22.mjs gates strictly (definer, pinned path, audit, exact grants). Anything unparseable is refused.
      const items = [...ex[1].matchAll(/\b(private|public)\.([a-z0-9_]+)\s*\([^)]*\)/g)];
      const leftover = ex[1].replace(/\b(private|public)\.[a-z0-9_]+\s*\([^)]*\)/g, '').replace(/[\s,]/g, '');
      if (items.length > 0 && leftover === '' && items.every(([, sch, n]) => (sch === 'private' ? EXEC_ALLOW.has(n) : /^rpc_[a-z0-9_]+$/.test(n)))) continue;
      add('R9-execute-allow-list', `unexpected execute grant: ${what}`); continue;
    }
    add('R9-authenticated-grants', `unexpected grant to authenticated: ${what}`);
  }

  // R7 permissive true policies
  if (/(using|with\s+check)\s*\(\s*true\s*\)/i.test(sql)) add('R7-no-true-policy', 'using/with check (true)');

  // R8 RLS on every created table; R14 revoke all from the four API roles on every created table
  const tbRe = /create\s+table\s+([a-z_]+\.[a-z_]+)/gi; const tables = [];
  while ((m = tbRe.exec(sql))) tables.push(m[1].toLowerCase());
  for (const t of tables) {
    const e = t.replace('.', '\\.');
    if (!new RegExp(`alter\\s+table\\s+${e}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(sql)) add('R8-rls-enabled', `no enable RLS for ${t}`);
    if (!new RegExp(`revoke\\s+all\\s+on\\s+table[^;]*\\b${e}\\b[^;]*from[^;]*\\banon\\b[^;]*\\bservice_role\\b`, 'i').test(sql)) add('R14-revoke-all-on-every-table', `no revoke-all for ${t}`);
  }

  // R11/R12 mfa_factors: no star selects; alias f limited to approved columns
  // P3 exemption (reviewed, deliberately narrow): exactly FOUR reviewed statements of exactly ONE reviewed file may use a star, because they read the whole public.orders row into a record variable (orders has no secret columns).
  // The exemption applies only if the file's sha256 equals REVIEWED_STAR_FILE_SHA256 AND the exact normalised statement text occurs exactly once; any other star (another table, another file, another place in the same file,
  // an edited statement, or ANY change to the file, which changes its hash) is still reported. Updating the reviewed migration therefore requires updating this pin in the same reviewed change.
  let starText = nsql;
  if (createHash('sha256').update(raw).digest('hex') === REVIEWED_STAR_FILE_SHA256) {
    for (const frag of REVIEWED_STAR_FRAGMENTS) { const i = starText.indexOf(frag); if (i >= 0 && starText.indexOf(frag, i + 1) < 0) starText = starText.slice(0, i) + ' ' + starText.slice(i + frag.length); }
  }
  if (/select\s+\*|\b\w+\.\*/i.test(starText)) add('R11-no-star-select', 'select * or alias.* found');
  const fcols = new Set(); const fr = /\bf\.([a-z_]+)/gi; while ((m = fr.exec(sql))) fcols.add(m[1].toLowerCase());
  for (const c of fcols) if (!MFA_COLS.has(c)) add('R12-mfa-approved-columns', `alias f uses column ${c}`);

  // R25 auth.mfa_factors referenced only inside the three approved functions
  for (const fn of fns) if (/mfa_factors/i.test(fn.body) && /auth\.mfa_factors/i.test(fn.body) && !MFA_READERS.has(fn.name)) add('R25-mfa-readers', `function ${fn.full} reads auth.mfa_factors but is not an approved reader`);
  let outside = sql; for (const fn of [...fns].reverse()) outside = outside.slice(0, fn.span[0]) + outside.slice(fn.span[1]);
  if (/auth\.mfa_factors/i.test(outside)) add('R25-mfa-readers', 'auth.mfa_factors referenced outside an approved function');

  // R13 no TRUNCATE statements
  if (/(^|;)\s*truncate\b/i.test(sql)) add('R13-no-truncate', 'truncate statement');

  // R18 guard functions that count across rows assert READ COMMITTED
  for (const fn of fns) if (ISOLATION_FNS.has(fn.name) && !/transaction_isolation/i.test(fn.body)) add('R18-read-committed-guard', `${fn.full} does not assert READ COMMITTED`);

  // R19 mfa factor approval trigger uses clock_timestamp and locks the window row
  for (const fn of fns) if (/guard_staff_mfa_factor_insert/.test(fn.name)) {
    if (!/clock_timestamp\s*\(\)/i.test(fn.body)) add('R19-clock-timestamp', `${fn.full} must use clock_timestamp() for window expiry`);
    if (!/for\s+update/i.test(fn.body)) add('R19-lock-window', `${fn.full} must lock the window row FOR UPDATE`);
    for (const need of ['revoked', 'consumed', 'verified', "'totp'"]) if (!new RegExp(need, 'i').test(fn.body)) add('R19-approval-conditions', `${fn.full} lacks a check for ${need}`);
  }

  // R20 fail-closed functions
  for (const fn of fns) {
    if (fn.name === 'mfa_check_ok') {
      if (!/exception\s+when\s+others\s+then\s+return\s+false/i.test(fn.body)) add('R20-fail-closed', 'mfa_check_ok lacks "exception when others then return false"');
      if (!/checked_at\s*<=\s*now\(\)/i.test(fn.body) || !/interval\s+'24 hours'/i.test(fn.body)) add('R21-validation-freshness', 'mfa_check_ok must reject stale (24 h) and future-dated validation records');
      if (!/status\s+is\s+null/i.test(fn.body) || !/factor_type\s+is\s+null/i.test(fn.body)) add('R20-fail-closed', 'mfa_check_ok must treat NULL status/factor_type as unreadable');
    }
    if (fn.name === 'run_auth_structure_check') {
      if (!/exception\s+when\s+others/i.test(fn.body) || !/'failed'/.test(fn.body)) add('R20-fail-closed', 'run_auth_structure_check must record failure on any exception');
      for (const need of ['data_type', 'pg_enum', 'enumlabel', 'uuid', 'timestamp with time zone']) if (!new RegExp(need, 'i').test(fn.body)) add('R22-structure-types', `run_auth_structure_check does not verify ${need}`);
    }
  }
  if (/create\s+table\s+private\.platform_validations/i.test(sql) && !/platform_validations_passed_consistent/i.test(sql)) add('R21-validation-freshness', 'platform_validations lacks the passed-consistency constraint');

  // R23 truncate protection and AFTER final-state checks for tables defined in this file
  for (const t of TRUNCATE_PROTECTED) if (tables.includes(t) && !new RegExp(`before\\s+truncate\\s+on\\s+${t.replace('.', '\\.')}`, 'i').test(sql)) add('R23-truncate-blocked', `no BEFORE TRUNCATE trigger on ${t}`);
  for (const t of AFTER_CHECKED) if (tables.includes(t) && t !== 'public.organization_members' ? !new RegExp(`after\\s+update\\s+or\\s+delete\\s+on\\s+${t.replace('.', '\\.')}`, 'i').test(sql) : (tables.includes(t) && !new RegExp(`after\\s+update\\s+or\\s+delete\\s+on\\s+${t.replace('.', '\\.')}`, 'i').test(sql))) add('R24-after-final-state-check', `no AFTER UPDATE OR DELETE trigger on ${t}`);

  // R26 factor approval binding constraints (when the table is defined here)
  if (tables.includes('private.staff_mfa_factors')) {
    if (!/unique\s*\(\s*window_id\s*\)/i.test(sql)) add('R26-factor-binding', 'staff_mfa_factors lacks unique (window_id)');
    if (!/foreign\s+key\s*\(\s*window_id\s*,\s*user_id\s*\)\s*references\s+private\.staff_mfa_enrolment_windows\s*\(\s*id\s*,\s*target_user_id\s*\)/i.test(sql)) add('R26-factor-binding', 'staff_mfa_factors lacks composite FK (window_id, user_id) -> windows (id, target_user_id)');
    if (!/guard_staff_mfa_factor_update/i.test(sql) || !/guard_enrolment_window_update/i.test(sql)) add('R26-factor-binding', 'missing immutability triggers for approvals/windows');
  }

  // R27 staff/member exclusion covers INSERT and UPDATE on both sides; staff identity immutable
  if (tables.includes('public.staff_members')) {
    if (!/before\s+insert\s+or\s+update\s+on\s+public\.staff_members/i.test(sql)) add('R27-exclusion-coverage', 'staff-side exclusion trigger must be BEFORE INSERT OR UPDATE');
    if (!/before\s+insert\s+or\s+update\s+on\s+public\.organization_members/i.test(sql)) add('R27-exclusion-coverage', 'member-side exclusion trigger must be BEFORE INSERT OR UPDATE');
    const g = fns.find((x) => x.name === 'guard_staff_not_member');
    if (g && !/user_id\s*<>\s*old\.user_id/i.test(g.body)) add('R27-exclusion-coverage', 'staff_members.user_id immutability missing');
    for (const x of ['guard_staff_not_member', 'guard_member_not_staff']) { const fx = fns.find((y) => y.name === x); if (fx && !/pg_advisory_xact_lock/i.test(fx.body)) add('R27-exclusion-coverage', `${x} lacks the per-user advisory lock`); }
  }

  // R28 last-admin: lock before change, marker for AFTER check
  const la = fns.find((x) => x.name === 'guard_last_admin_lock');
  if (la && (!/pg_advisory_xact_lock/i.test(la.body) || !/set_config\s*\(\s*'m1\.admin_shrink'/i.test(la.body))) add('R28-last-admin', 'guard_last_admin_lock must take the advisory lock and set the m1.admin_shrink marker');
  const lc = fns.find((x) => x.name === 'check_last_admin');
  if (lc && !/m1\.admin_shrink/i.test(lc.body)) add('R28-last-admin', 'check_last_admin must read the m1.admin_shrink marker');

  return { name, failures: f, stats: { functions: fns.length, definers: defs, tables: tables.length, mfaColumns: [...fcols].sort().join(',') } };
}

function selftest() {
  const okFn = "create function private.a() returns int language sql security definer set search_path = '' as $$ select 1 $$;";
  const bad = [
    ['secret column', "select f.secret from auth.mfa_factors f;", 'R1-no-secret-column'],
    ['iat', "select auth.jwt() ->> 'iat';", 'R2-no-iat'],
    ['super_admin', "insert into t values ('super_admin');", 'R3-no-super-admin'],
    ['metadata', "using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')", 'R4-no-metadata-authorization'],
    ['invoker without path', "create function private.a() returns int language sql as $$ select 1 $$;", 'R5-pinned-search-path'],
    ['definer without path', "create function private.a() returns int language sql security definer as $$ select 1 $$;", 'R5-pinned-search-path'],
    ['grant to anon', "grant select on public.t to anon;", 'R6-no-grant-to-anon-service-public'],
    ['true policy', "create policy p on public.t for select using (true);", 'R7-no-true-policy'],
    ['no rls', "create table public.nope (a int);", 'R8-rls-enabled'],
    ['broad grant', "grant insert on public.t to authenticated;", 'R9-authenticated-grants'],
    ['star select', "select * from auth.mfa_factors;", 'R11-no-star-select'],
    ['bad column', "select f.phone from auth.mfa_factors f;", 'R12-mfa-approved-columns'],
    ['truncate stmt', "truncate public.x;", 'R13-no-truncate'],
    ['no revoke-all', "create table public.t (a int); alter table public.t enable row level security;", 'R14-revoke-all-on-every-table'],
    ['public non-rpc fn named like an rpc prefix inside the name', "create function public.helper_rpc_x() returns int language sql set search_path = '' as $$ select 1 $$;", 'R16-functions-in-private'],
    ['public fn', "create function public.a() returns int language sql set search_path = '' as $$ select 1 $$;", 'R16-functions-in-private'],
    ['dynamic sql', "create function private.a() returns int language plpgsql security definer set search_path = '' as $$ begin execute 'select 1'; return 1; end $$;", 'R17-no-dynamic-sql'],
    ['no isolation assert', "create function private.guard_last_admin_lock() returns trigger language plpgsql security definer set search_path = '' as $$ begin return new; end $$;", 'R18-read-committed-guard'],
    ['approval without clock', "create function private.guard_staff_mfa_factor_insert() returns trigger language plpgsql security definer set search_path = '' as $$ begin perform now(); return new; end $$;", 'R19-clock-timestamp'],
    ['mfa_check_ok not fail closed', "create function private.mfa_check_ok() returns boolean language plpgsql security definer set search_path = '' as $$ begin return true; end $$;", 'R20-fail-closed'],
    ['no freshness', "create function private.mfa_check_ok() returns boolean language plpgsql security definer set search_path = '' as $$ begin return true; exception when others then return false; end $$;", 'R21-validation-freshness'],
    ['structure types missing', "create function private.run_auth_structure_check() returns text language plpgsql security definer set search_path = '' as $$ begin begin null; exception when others then null; end; return 'failed'; end $$;", 'R22-structure-types'],
    ['no truncate block', "create table public.staff_members (a int); alter table public.staff_members enable row level security; revoke all on table public.staff_members from public, anon, authenticated, service_role;", 'R23-truncate-blocked'],
    ['no after check', "create table public.staff_roles (a int); alter table public.staff_roles enable row level security; revoke all on table public.staff_roles from public, anon, authenticated, service_role;", 'R24-after-final-state-check'],
    ['non-reader reads mfa', "create function private.other() returns int language sql security definer set search_path = '' as $$ select count(*) from auth.mfa_factors f $$;", 'R25-mfa-readers'],
    ['factor binding missing', "create table private.staff_mfa_factors (factor_id uuid, user_id uuid, window_id uuid); alter table private.staff_mfa_factors enable row level security; revoke all on table private.staff_mfa_factors from public, anon, authenticated, service_role;", 'R26-factor-binding'],
    ['exclusion insert only', "create table public.staff_members (a int); alter table public.staff_members enable row level security; revoke all on table public.staff_members from public, anon, authenticated, service_role; create trigger t before insert on public.staff_members for each row execute function private.x();", 'R27-exclusion-coverage'],
    ['last admin w/o marker', "create function private.guard_last_admin_lock() returns trigger language plpgsql security definer set search_path = '' as $$ begin if current_setting('transaction_isolation') <> 'read committed' then return null; end if; return new; end $$;", 'R28-last-admin'],
  ];
  let ok = true;
  for (const [label, sql, rule] of bad) { const r = check('selftest', sql); const hit = r.failures.some((x) => x.startsWith(rule)); ok = ok && hit; console.log(`selftest ${label}: ${hit ? 'caught' : 'MISSED'} (${rule})`); }
  // R11 exemption: ONLY the four reviewed statements of the reviewed P3 file (matched by sha256 and exact text); every other star is caught
  for (const [label, s] of [
    ['star from public.orders in an unreviewed file', 'select * from public.orders x where x.id = 1;'], ['star into record from public.orders in an unreviewed file', 'select * into o from public.orders x where x.id = 1;'],
    ['alias star bound to public.orders in an unreviewed file', 'select x.*, g.name as n into o from public.orders x join public.organizations g on g.id = x.organization_id;'],
    ['star from another table', 'select * from public.products;'], ['star from auth.mfa_factors', 'select * from auth.mfa_factors;'], ['alias star bound to another table', 'select x.* from public.orders y join public.products x on true;'],
    ['the reviewed statement text alone (no reviewed file hash)', REVIEWED_STAR_FRAGMENTS[1]],
  ]) { const hit = check('selftest', s).failures.some((x) => x.startsWith('R11')); ok = ok && hit; console.log(`selftest R11 exemption - ${label}: ${hit ? 'caught' : 'MISSED'}`); }
  const p3 = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '20261110000100_p3_catalog_pricing_orders.sql');
  if (existsSync(p3)) {
    const raw = readFileSync(p3, 'utf8'); const r11 = (txt) => check('selftest', txt).failures.some((x) => x.startsWith('R11'));
    const checks = [
      ['the reviewed file (4 reviewed star statements) is accepted', !r11(raw)],
      ['the reviewed file plus ONE extra star select on public.orders is caught (hash differs)', r11(raw + '\nselect * from public.orders;\n')],
      ['the reviewed file plus one star on another table is caught', r11(raw + '\nselect * from public.products;\n')],
      ['one reviewed statement edited (an extra star column list change) is caught', r11(raw.replace('select * into o from public.orders x where x.id = p_order_id and x.organization_id', 'select * into o from public.orders x where x.id = p_order_id or x.organization_id'))],
      ['a reviewed statement duplicated elsewhere in the file is caught', r11(raw + '\n' + REVIEWED_STAR_FRAGMENTS[1] + '\n')],
      ['a one-byte change anywhere in the reviewed file withdraws the exemption', r11(raw + ' ')],
    ];
    for (const [label, pass] of checks) { ok = ok && pass; console.log(`selftest R11 exemption (reviewed file) - ${label}: ${pass ? 'ok' : 'WRONG'}`); }
  } else console.log('selftest R11 exemption (reviewed file): skipped (promoted migration not present)');
  const strSample = check('selftest', `${okFn} select 'unexpected EXECUTE grant to authenticated in schema private';`);
  const strOk = !strSample.failures.some((x) => x.startsWith('R9') || x.startsWith('R6')); ok = ok && strOk; console.log(`selftest grant text inside a string literal ignored: ${strOk ? 'ok' : 'FALSE POSITIVE'}`);
  const clean = check('selftest', `-- secret and iat in a comment are fine\n${okFn}`);
  const cleanOk = clean.failures.length === 0; ok = ok && cleanOk; console.log(`selftest comment-stripping/clean sample: ${cleanOk ? 'ok' : 'FALSE POSITIVE ' + clean.failures.join('|')}`);
  console.log(`SELFTEST ${ok ? 'PASS' : 'FAIL'} (${bad.length} violation samples + 1 clean sample)`); process.exitCode = ok ? 0 : 1;
}

if (process.argv[1]?.endsWith('static-check.mjs')) {
  if (process.argv.includes('--selftest')) selftest();
  else {
    const dir = dirname(fileURLToPath(import.meta.url));
    let files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    if (!files.length) files = readdirSync(dir).filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort().map((x) => join(dir, x));
    let bad = 0;
    for (const file of files) {
      const r = check(file.split(/[\\/]/).pop(), readFileSync(file, 'utf8'));
      console.log(`${r.name}: ${r.failures.length ? 'FAIL' : 'PASS'}  (functions=${r.stats.functions}, definers=${r.stats.definers}, tables=${r.stats.tables}, mfa columns referenced=[${r.stats.mfaColumns || 'none'}])`);
      for (const x of r.failures) console.log('  - ' + x);
      bad += r.failures.length;
    }
    console.log(bad ? `STATIC CHECK FAIL (${bad})` : 'STATIC CHECK PASS (text-pattern guardrail only: no SQL was parsed or executed; not a proof of correctness)');
    process.exitCode = bad ? 1 : 0;
  }
}
