// Static review checks for migration drafts (rev2). Dependency-free. Reads files only; never connects to a database.
// Usage: node supabase/review/static-check.mjs [--selftest] [file.sql ...]   (default: all NNNN_*.sql next to this file)
// These are TEXT checks. They prove properties of the source text, not runtime behavior.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase();
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

  // R5 pinned search_path on definers; R16 functions live in private; R17 no dynamic SQL
  let defs = 0;
  for (const fn of fns) {
    if (fn.schema !== 'private') add('R16-functions-in-private', `function outside schema private: ${fn.full}`);
    const definer = /security\s+definer/i.test(fn.header); if (definer) defs++;
    if (!/set\s+search_path\s*=\s*''/i.test(fn.header)) add('R5-pinned-search-path', `${definer ? 'definer' : 'invoker'} function without search_path='': ${fn.full}`);
    if (/\bexecute\b/i.test(fn.body)) add('R17-no-dynamic-sql', `EXECUTE inside function body: ${fn.full}`);
  }

  // R6/R9 grants
  const grantScan = sql.replace(/'(?:[^']|'')*'/g, "''"); // ignore text inside string literals (error messages)
  const grRe = /\bgrant\b([^;]*?)\bto\b([^;]*);/gi;
  while ((m = grRe.exec(grantScan))) {
    const what = norm(m[1]).trim(); const who = m[2].toLowerCase();
    if (/\b(anon|service_role|public)\b/.test(who)) { add('R6-no-grant-to-anon-service-public', `grant ${what} to${who}`); continue; }
    if (!/\bauthenticated\b/.test(who)) continue;
    if (what.startsWith('select on ')) continue;
    if (what === 'usage on schema private') continue;
    if (/^update \(full_name, phone\) on public\.profiles$/.test(what)) continue;
    const ex = /^execute on function (.+)$/.exec(what);
    if (ex) { const names = ex[1].split(',').map((s) => s.trim().replace(/^private\./, '').replace(/\(.*\)$/, '')); if (names.every((n) => EXEC_ALLOW.has(n))) continue; add('R9-execute-allow-list', `unexpected execute grant: ${what}`); continue; }
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
  if (/select\s+\*|\b\w+\.\*/i.test(sql)) add('R11-no-star-select', 'select * or alias.* found');
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
    console.log(bad ? `STATIC CHECK FAIL (${bad})` : 'STATIC CHECK PASS (text checks only; no SQL was executed)');
    process.exitCode = bad ? 1 : 0;
  }
}
