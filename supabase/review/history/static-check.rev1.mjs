// Static review checks for migration drafts. Dependency-free. Reads files only; never connects to a database.
// Usage: node supabase/review/static-check.mjs [--selftest] [file.sql ...]   (default: all NNNN_*.sql next to this file)
// These are TEXT checks. They prove properties of the source text, not runtime behavior.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const EXEC_ALLOW = new Set(['my_org_ids', 'my_owner_org_ids', 'staff_session_ok', 'has_capability']);
const MFA_COLS = new Set(['id', 'user_id', 'factor_type', 'status', 'created_at']);

export function check(name, raw) {
  const sql = strip(raw); const low = sql.toLowerCase(); const f = [];
  const add = (rule, msg) => f.push(`${rule}: ${msg}`);

  // R1 secret column / R2 iat / R3 super_admin / R4 metadata / R10 embedded credentials
  if (/\bsecret\b/i.test(sql)) add('R1-no-secret-column', 'reference to "secret" in code');
  if (/\biat\b/i.test(sql)) add('R2-no-iat', 'reference to jwt iat');
  if (/super[_-]?admin/i.test(sql)) add('R3-no-super-admin', 'super_admin introduced');
  if (/user_metadata|raw_user_meta_data|raw_app_meta_data|app_metadata/i.test(sql)) add('R4-no-metadata-authorization', 'metadata reference');
  if (/eyJ[A-Za-z0-9_-]{10,}|sb_secret_|sb_publishable_|service_role_key/i.test(sql)) add('R10-no-embedded-credentials', 'credential-like string');

  // R5 every SECURITY DEFINER function pins search_path to ''
  const fnRe = /create\s+(?:or\s+replace\s+)?function\b([\s\S]*?)\bas\s+\$\$/gi; let m; let defs = 0, fns = 0;
  while ((m = fnRe.exec(sql))) {
    fns++; const h = m[1];
    if (!/^\s*private\./i.test(h)) add('R16-functions-in-private', `function outside schema private: ${h.trim().split('(')[0]}`);
    if (/security\s+definer/i.test(h)) { defs++; if (!/set\s+search_path\s*=\s*''/i.test(h)) add('R5-pinned-search-path', `definer function without search_path='': ${h.trim().split('(')[0]}`); }
  }

  // R6/R9 grants
  const grRe = /\bgrant\b([^;]*?)\bto\b([^;]*);/gi;
  while ((m = grRe.exec(sql))) {
    const what = m[1].trim().toLowerCase().replace(/\s+/g, ' '); const who = m[2].toLowerCase();
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

  // R8 RLS enabled on every created table
  const tbRe = /create\s+table\s+([a-z_]+\.[a-z_]+)/gi; let tables = 0;
  while ((m = tbRe.exec(sql))) { tables++; const t = m[1].toLowerCase(); if (!new RegExp(`alter\\s+table\\s+${t.replace('.', '\\.')}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(sql)) add('R8-rls-enabled', `no enable RLS for ${t}`); }

  // R11/R12 mfa_factors usage limited to approved columns, no star selects
  if (/select\s+\*|\b\w+\.\*/i.test(sql)) add('R11-no-star-select', 'select * or alias.* found');
  const fcols = new Set(); const fr = /\bf\.([a-z_]+)/gi; while ((m = fr.exec(sql))) fcols.add(m[1].toLowerCase());
  for (const c of fcols) if (!MFA_COLS.has(c)) add('R12-mfa-approved-columns', `alias f uses column ${c}`);

  // R13 no direct DML-style grants/truncate/drop of audit-like surfaces in this phase
  if (/(^|;)\s*truncate\b/i.test(sql)) add('R13-no-truncate', 'truncate statement');

  return { name, failures: f, stats: { functions: fns, definers: defs, tables, mfaColumns: [...fcols].sort().join(',') } };
}

function selftest() {
  const bad = [
    ['secret column', "create table public.x (a int); alter table public.x enable row level security; select f.secret from auth.mfa_factors f;", 'R1-no-secret-column'],
    ['iat', "select auth.jwt() ->> 'iat';", 'R2-no-iat'],
    ['super_admin', "insert into t values ('super_admin');", 'R3-no-super-admin'],
    ['metadata', "using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')", 'R4-no-metadata-authorization'],
    ['definer without path', "create function private.a() returns int language sql security definer as $$ select 1 $$;", 'R5-pinned-search-path'],
    ['grant to anon', "grant select on public.t to anon;", 'R6-no-grant-to-anon-service-public'],
    ['true policy', "create policy p on public.t for select using (true);", 'R7-no-true-policy'],
    ['no rls', "create table public.nope (a int);", 'R8-rls-enabled'],
    ['star select', "select * from auth.mfa_factors;", 'R11-no-star-select'],
    ['bad column', "select f.phone from auth.mfa_factors f;", 'R12-mfa-approved-columns'],
    ['broad grant', "grant insert on public.t to authenticated;", 'R9-authenticated-grants'],
    ['public fn', "create function public.a() returns int language sql set search_path = '' as $$ select 1 $$;", 'R16-functions-in-private'],
  ];
  let ok = true;
  for (const [label, sql, rule] of bad) { const r = check('selftest', sql); const hit = r.failures.some((x) => x.startsWith(rule)); ok = ok && hit; console.log(`selftest ${label}: ${hit ? 'caught' : 'MISSED'} (${rule})`); }
  const clean = check('selftest', "-- secret in comment is fine, iat too\ncreate function private.a() returns int language sql security definer set search_path = '' as $$ select 1 $$;");
  const cleanOk = clean.failures.length === 0; ok = ok && cleanOk; console.log(`selftest comment-stripping/clean sample: ${cleanOk ? 'ok' : 'FALSE POSITIVE ' + clean.failures.join('|')}`);
  console.log(`SELFTEST ${ok ? 'PASS' : 'FAIL'}`); process.exitCode = ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/').replace(/^([a-z]):/i, (s) => s) || process.argv[1]?.endsWith('static-check.mjs')) {
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
