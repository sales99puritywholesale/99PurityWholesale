// OFFLINE construction and isolation proof for the planned shadow schemas (p2s_public, p2s_private, p2s_auth) and the two test roles.
// THIS SCRIPT HAS NO DATABASE CODE: it imports no database driver, opens no connection, reads no environment file and no environment variable.
// It reads the five SQL files, applies the declared rewrite rules, classifies EVERY rewrite site, runs the six isolation proofs (with negative controls),
// and can EMIT the exact SQL a future (separately approved) run would execute, with its sha256. Nothing is executed by this script.
//   --selftest        run the construction and every offline proof; exit 1 on any failure
//   --emit <dir>      also write the emitted SQL files and a hash manifest into <dir> (a scratch directory, never the repository migrations)
//   --report          print the rewrite classification table
// Shadow layout (mirrors the real one so the rewrite is a pure, reversible-by-inspection renaming): public -> p2s_public, private -> p2s_private,
// auth -> p2s_auth. Roles: anon -> p2s_anon, authenticated -> p2s_authenticated; service_role has no stand-in (it is mapped to p2s_anon in revoke lists
// and role-literal checks: its BYPASSRLS and default-grant behavior is NOT modeled and is listed as such in the plan).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const FILES = [
  { name: '0001', path: 'supabase/migrations/20261108000001_foundation_identity.sql', sha: null },
  { name: '0002', path: 'supabase/migrations/20261108000002_staff_capabilities.sql', sha: null },
  { name: '0003', path: 'supabase/migrations/20261108000003_audit_and_step_up.sql', sha: null },
  { name: '0004', path: 'supabase/migrations/20261108000004_staff_management_rpcs.sql', sha: null },
  { name: '0005', path: 'supabase/review/0005_rate_limits_and_owner_mfa.sql', sha: '8548e27e7c800d9d38f8bb6dca1dcb11f7755785b1e6fa0f0616120f05443e8d' },
];
const SCHEMA_MAP = { public: 'p2s_public', private: 'p2s_private', auth: 'p2s_auth' };
const ROLE_MAP = { anon: 'p2s_anon', authenticated: 'p2s_authenticated', service_role: 'p2s_anon' };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
// optional: build from another 0005 revision (for example rev4): --0005 <path relative to the repository> --0005-sha <expected sha256>; both are required together
{
  const a = process.argv.slice(2); const i = a.indexOf('--0005'); const j = a.indexOf('--0005-sha');
  if (i >= 0 || j >= 0) { if (i < 0 || j < 0 || !a[i + 1] || !/^[0-9a-f]{64}$/.test(a[j + 1] ?? '')) { console.log('--0005 <path> and --0005-sha <64 hex> are required together'); process.exit(2); } FILES[4] = { name: '0005', path: a[i + 1], sha: a[j + 1] }; }
}

// ------------------------------------------------------------------------------------------------ scanner (comments, strings, dollar bodies, code)
export function scan(text, depth = 0) {
  const out = []; let i = 0; let buf = ''; const flush = (type = 'code') => { if (buf) { out.push({ type, text: buf, depth }); buf = ''; } };
  while (i < text.length) {
    const c = text[i]; const two = text.slice(i, i + 2);
    if (two === '--') { flush(); let j = text.indexOf('\n', i); if (j < 0) j = text.length; out.push({ type: 'comment', text: text.slice(i, j), depth }); i = j; continue; }
    if (two === '/*') { flush(); let j = text.indexOf('*/', i + 2); j = j < 0 ? text.length : j + 2; out.push({ type: 'comment', text: text.slice(i, j), depth }); i = j; continue; }
    if (c === "'") { flush(); let j = i + 1; for (;;) { if (j >= text.length) break; if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue; } if (text[j] === "'") { j++; break; } j++; } out.push({ type: 'string', text: text.slice(i, j), depth }); i = j; continue; }
    if (c === '"') { flush(); let j = text.indexOf('"', i + 1); j = j < 0 ? text.length : j + 1; out.push({ type: 'quoted', text: text.slice(i, j), depth }); i = j; continue; }
    if (c === '$') { const m = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(text.slice(i)); if (m) { const tag = m[0]; const end = text.indexOf(tag, i + tag.length); if (end >= 0) { flush(); out.push({ type: 'delim', text: tag, depth }); out.push(...scan(text.slice(i + tag.length, end), depth + 1)); out.push({ type: 'delim', text: tag, depth }); i = end + tag.length; continue; } } }
    buf += c; i++;
  }
  flush(); return out;
}
/** Splits scanned segments into top-level statements (semicolon at depth 0 in code). Each statement = list of segments. */
export function statements(segs) {
  const res = []; let cur = [];
  for (const s of segs) {
    if (s.type === 'code' && s.depth === 0 && s.text.includes(';')) {
      const parts = s.text.split(';');
      for (let k = 0; k < parts.length; k++) { if (parts[k]) cur.push({ ...s, text: parts[k] }); if (k < parts.length - 1) { cur.push({ type: 'code', text: ';', depth: 0 }); res.push(cur); cur = []; } }
    } else cur.push(s);
  }
  if (cur.length) res.push(cur); return res;
}
const stmtText = (st) => st.map((s) => s.text).join('');
const stmtCode = (st) => st.filter((s) => s.type === 'code').map((s) => s.text).join(' ').replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim();

// ------------------------------------------------------------------------------------------------ transformation with classification
function newStats() { return { qualified: { code: 0, string: 0, comment: 0 }, schemaWord: 0, schemaLiteral: 0, roleToken: 0, roleLiteral: 0, publicRoleKept: 0, lockNs: [], messageKept: [], excluded: [] }; }
const QUAL = /\b(public|private|auth)\.(?=[A-Za-z_"])/g;
const SCHEMA_WORD = /\bschema\s+(if\s+not\s+exists\s+)?(private|public|auth)\b/gi;
const ROLE_TOKEN = /\b(anon|authenticated|service_role)\b/g;
export function transformSegments(segs, stats) {
  let prevCode = ''; const out = [];
  for (const s of segs) {
    let t = s.text;
    if (s.type === 'comment') {
      t = t.replace(QUAL, (m, n) => { stats.qualified.comment++; return SCHEMA_MAP[n] + '.'; });
    } else if (s.type === 'string') {
      const inner = t.slice(1, -1);
      const roleCtx = /has_[a-z_]+_privilege\(\s*$/.test(prevCode);
      if (/^(public|private|auth)$/.test(inner) && !roleCtx) { stats.schemaLiteral++; t = `'${SCHEMA_MAP[inner]}'`; }
      else if (/^(public)$/.test(inner) && roleCtx) { stats.publicRoleKept++; }
      else if (/^(anon|authenticated|service_role)$/.test(inner) && roleCtx) { stats.roleLiteral++; t = `'${ROLE_MAP[inner]}'`; }
      else if (/^(m1|p2):/.test(inner)) { stats.lockNs.push(inner); t = `'p2s:${inner}'`; }
      else {
        let n = 0; t = t.replace(QUAL, (m, nm) => { n++; return SCHEMA_MAP[nm] + '.'; }); stats.qualified.string += n;
        if (/\b(anon|authenticated|service_role)\b/.test(inner)) stats.messageKept.push(inner.slice(0, 70));
      }
    } else if (s.type === 'code') {
      t = t.replace(QUAL, (m, n) => { stats.qualified.code++; return SCHEMA_MAP[n] + '.'; });
      t = t.replace(SCHEMA_WORD, (m, ine, n) => { stats.schemaWord++; return m.replace(new RegExp(`\\b${n}\\b`, 'i'), SCHEMA_MAP[n.toLowerCase()]); });
      t = t.replace(ROLE_TOKEN, (m, r) => { stats.roleToken++; return ROLE_MAP[r]; });
      if (t.trim()) prevCode = t.replace(/\s+/g, ' ').trim().slice(-80);
    }
    out.push({ ...s, text: t });
  }
  return out;
}
export function transformFile(text, stats) {
  const sts = statements(scan(text)); const kept = [];
  for (const st of sts) {
    const code = stmtCode(st);
    if (/^alter default privileges\b/i.test(code)) { stats.excluded.push(code.slice(0, 110)); continue; }
    kept.push(transformSegments(st, stats));
  }
  return kept.map(stmtText).join('') + '\n';
}
/** The same transformation for a text fragment (a pg_get_functiondef() output at run time): used by the run-time forward-equivalence check. */
export const transformFragment = (text) => stmtText(transformSegments(scan(text), newStats()));

// ------------------------------------------------------------------------------------------------ harness SQL (stand-ins, roles, grants, cleanup)
export const ROLES_SQL = `-- two dedicated test roles: no login, no superuser, no BYPASSRLS, no database-wide privilege, no inheritance, no connection
create role p2s_anon nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit connection limit 0;
create role p2s_authenticated nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit connection limit 0;
grant p2s_anon to current_user with inherit false, set true;
grant p2s_authenticated to current_user with inherit false, set true;
`;
export const STANDIN_SQL = `-- shadow schemas and the stand-ins for the platform objects the migrations depend on. NOTHING here refers to the real auth schema.
create schema p2s_public;
create schema p2s_auth;
create type p2s_auth.factor_type as enum ('totp', 'phone', 'webauthn');
create type p2s_auth.factor_status as enum ('unverified', 'verified');
create table p2s_auth.users (
  id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb, raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table p2s_auth.mfa_factors (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references p2s_auth.users (id) on delete cascade, friendly_name text,
  factor_type p2s_auth.factor_type not null, status p2s_auth.factor_status not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  secret text, phone text, last_challenged_at timestamptz, web_authn_credential jsonb, web_authn_aaguid uuid,
  constraint mfa_factors_user_friendly_name_unique unique (user_id, friendly_name));
create function p2s_auth.uid() returns uuid language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function p2s_auth.jwt() returns jsonb language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
-- the same explicit privileges the platform gives these roles on the objects the migrations rely on (usage on the schemas, execute on the two claim readers)
revoke all on schema p2s_public, p2s_auth from public;
revoke all on all tables in schema p2s_auth from public;
revoke all on all functions in schema p2s_auth from public;
grant usage on schema p2s_public, p2s_auth to p2s_anon, p2s_authenticated;
grant execute on function p2s_auth.uid(), p2s_auth.jwt() to p2s_anon, p2s_authenticated;
`;
export const POST_SQL = `-- after the migrations: no API-like privilege may remain anywhere except what the migrations granted explicitly; verified from the catalog by the run
revoke all on all sequences in schema p2s_public, p2s_private, p2s_auth from public;
`;
export const CLEANUP_SQL = `-- complete cleanup (one transaction in the run); verification queries are in the plan (section on cleanup proof)
drop schema if exists p2s_public cascade;
drop schema if exists p2s_private cascade;
drop schema if exists p2s_auth cascade;
drop owned by p2s_anon, p2s_authenticated;
drop role if exists p2s_anon;
drop role if exists p2s_authenticated;
`;

// ------------------------------------------------------------------------------------------------ the six proofs
const REAL_SCHEMA_REF = /\b(public|private|auth|extensions|storage|realtime|vault|graphql|graphql_public|net|pgsodium|cron|pgbouncer|supabase_[a-z_]+)\.(?=[A-Za-z_"])/;
export function proofs(emitted, harness) {
  const results = []; const rep = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });
  const allSql = [...emitted.map((e) => e.sql), harness.roles, harness.standin, harness.post, harness.cleanup];
  const allSegs = allSql.map((s) => { const segs = scan(s); let tail = ''; for (const g of segs) { if (g.type === 'string') g.prev = tail; if (g.type === 'code' && g.text.trim()) tail = g.text.replace(/\s+/g, ' ').trim().slice(-80); } return segs; });
  const codeOnly = (segs) => segs.filter((s) => s.type === 'code').map((s) => s.text).join(' ');
  // P1 schema qualification
  const residual = []; const unresolved = new Map(); const cteNames = new Set();
  const REF = /\b(from|join|update|into|references|truncate(?:\s+table)?|alter\s+table(?:\s+only)?|create\s+table|create\s+unique\s+index\s+\w+\s+on|create\s+index\s+\w+\s+on)\s+(?:only\s+)?([A-Za-z_][A-Za-z_0-9.]*|\()/gi;
  // reviewed allowance: catalog tables, set-returning builtins, PL/pgSQL variables and records, keywords that follow FROM/UPDATE/TRUNCATE/INTO in the files (ON of trigger
  // definitions, SET of upserts, SKIP of SKIP LOCKED, THEN/OR/TO), the PUBLIC pseudo-role and the two test roles in REVOKE lists, and the records pol and r.
  // rev5 added two more reviewed keywords: LOOP (the PL/pgSQL "for w in select ... for update loop": the row-lock clause FOR UPDATE directly before the loop body is read as UPDATE <word>)
  // and LATERAL (the join modifier in "left join lateral (subquery)"). Neither can be a relation name in these files (every created relation is p2s_* and checked by P7).
  // rev6 added AND: "x is distinct from 'unknown' and y ..." leaves "from and" once the string literal is removed from the scanned code (the same class as the already allowed THEN, OR and TO after a literal);
  // AND is a reserved word and can never name a relation.
  const OKUN = /^(pg_[a-z_]+|information_schema\.[a-z_]+|unnest|generate_series|jsonb_array_elements|jsonb_each|jsonb_build_object|v_[a-z_0-9]+|p_[a-z_0-9]+|new|old|\(|distinct|the|only|on|then|or|and|to|set|skip|loop|lateral|public|p2s_anon|p2s_authenticated|pol|r)$/i;
  for (const segs of allSegs) {
    for (const s of segs) {
      if (REAL_SCHEMA_REF.test(s.text) && s.type !== 'delim') residual.push(s.text.slice(0, 60));
      if (s.type === 'string' && /^'(private|auth)'$/.test(s.text)) residual.push(`schema-name literal left: ${s.text}`);
      if (s.type === 'string' && s.text === "'public'" && !/has_[a-z_]+_privilege\(\s*$/.test(s.prev ?? '')) residual.push("schema-name literal left: 'public' outside a role position");
    }
    const code = codeOnly(segs);
    for (const m of code.matchAll(/\bwith\s+([A-Za-z_][A-Za-z_0-9]*)\s+as\s*\(/gi)) cteNames.add(m[1].toLowerCase());
    // dotted names are judged by the real-schema qualifier scan above (alias.column and old/new.column are not schema references)
    for (const m of code.matchAll(REF)) { const id = m[2]; if (id.includes('.')) continue; if (!OKUN.test(id) && !cteNames.has(id.toLowerCase())) unresolved.set(id.toLowerCase(), (unresolved.get(id.toLowerCase()) ?? 0) + 1); }
  }
  rep('P1', 'schema qualification: no real-schema qualifier and no schema-name literal remains; every dotted reference after FROM/JOIN/UPDATE/INTO/REFERENCES/ALTER TABLE/CREATE TABLE/INDEX ON resolves to p2s_*, pg_catalog or information_schema', residual.length === 0, residual.slice(0, 5).join(' | '));
  rep('P1b', 'schema qualification: every UNQUALIFIED name after those keywords is in the reviewed allowance (catalog tables pg_*, set-returning builtins, PL/pgSQL variables, subqueries)', unresolved.size === 0, [...unresolved].map(([k, v]) => `${k}x${v}`).join(', '));
  // P2 stand-in isolation
  const st = scan(harness.standin); const stCode = codeOnly(st); const stDots = [...stCode.matchAll(/\b([a-z_0-9]+)\.(?=[A-Za-z_"])/g)].map((m) => m[1]);
  rep('P2', 'auth stand-in isolation: the stand-ins reference only p2s_* and pg_catalog (no real auth, public, private or extensions object); their function bodies call only current_setting, nullif, coalesce and casts', stDots.every((d) => /^(p2s_public|p2s_private|p2s_auth|pg_catalog)$/.test(d)) && !REAL_SCHEMA_REF.test(harness.standin) && st.filter((s) => s.depth > 0 && s.type === 'code').every((s) => !/\b(select|from|insert|update|delete)\b.*\b(from|join)\b/i.test(s.text)), stDots.filter((d) => !/^p2s_/.test(d)).join(','));
  // P3 role restrictions
  const r = harness.roles; const creates = [...r.matchAll(/create role (\w+)([^;]*);/gi)];
  const attrsOk = creates.length === 2 && creates.every((m) => /^p2s_(anon|authenticated)$/.test(m[1]) && /\bnologin\b/i.test(m[2]) && /\bnosuperuser\b/i.test(m[2]) && /\bnobypassrls\b/i.test(m[2]) && /\bnocreatedb\b/i.test(m[2]) && /\bnocreaterole\b/i.test(m[2]) && /\bnoreplication\b/i.test(m[2]) && /\bnoinherit\b/i.test(m[2]) && /connection limit 0/i.test(m[2]));
  const members = [...r.matchAll(/grant (\w+) to ([^;]+);/gi)];
  rep('P3', 'role restrictions: exactly two roles, each NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT with CONNECTION LIMIT 0; the only membership grants are these two roles to the current user (set true, inherit false)', attrsOk && members.length === 2 && members.every((m) => /^p2s_(anon|authenticated)$/.test(m[1]) && /^current_user with inherit false, set true$/i.test(m[2].trim())), '');
  // grants: every GRANT/REVOKE in the whole output targets only p2s_* objects and roles in {public, p2s_anon, p2s_authenticated}
  const grantProblems = []; const grantList = [];
  for (const sql of [...emitted.map((e) => e.sql), harness.standin, harness.post]) {
    for (const stt of statements(scan(sql))) {
      const code = stmtCode(stt); const m = /^(grant|revoke)\s+(.+?)\s+on\s+(.+?)\s+(to|from)\s+(.+)$/i.exec(code); if (!m) { if (/^(grant|revoke)\b/i.test(code)) grantProblems.push(`unparsed: ${code.slice(0, 80)}`); continue; }
      const objs = m[3]; const roles = m[5].split(',').map((x) => x.trim());
      if (/\bdatabase\b|\ball schemas\b|\bsuperuser\b|\bwith grant option\b/i.test(objs + m[5])) grantProblems.push(`forbidden form: ${code.slice(0, 80)}`);
      for (const o of objs.matchAll(/(?:table|function|schema|sequence|tables in schema|functions in schema|sequences in schema)?\s*([a-z_0-9]+)(?:\.[a-z_0-9]+)?/gi)) { void o; }
      if (!/\b(p2s_(public|private|auth))\b/.test(objs)) grantProblems.push(`target outside the shadow: ${objs.slice(0, 60)}`);
      if (REAL_SCHEMA_REF.test(objs)) grantProblems.push(`real schema in grant target: ${objs.slice(0, 60)}`);
      for (const ro of roles) if (!/^(public|p2s_anon|p2s_authenticated)$/i.test(ro)) grantProblems.push(`role outside the set: ${ro}`);
      if (m[1].toLowerCase() === 'grant') grantList.push(`${m[2]} ON ${objs.slice(0, 60)} TO ${roles.join(',')}`);
    }
  }
  rep('P3b', 'role restrictions: every GRANT and REVOKE in the emitted SQL targets only p2s_* objects and only the roles PUBLIC, p2s_anon, p2s_authenticated (no database-wide, no all-schemas, no grant option, no membership other than the two above)', grantProblems.length === 0, grantProblems.slice(0, 4).join(' | '));
  // P4 no cross-schema access
  const cross = []; for (const segs of allSegs) for (const s of segs) { if (s.type === 'delim') continue; for (const m of s.text.matchAll(new RegExp(REAL_SCHEMA_REF.source, 'g'))) cross.push(m[0]); }
  const publicWord = []; for (const segs of allSegs) for (const s of segs) if (s.type === 'code') for (const m of s.text.matchAll(/\bpublic\b/gi)) { const ctx = s.text.slice(Math.max(0, m.index - 12), m.index + 10); if (!/(from|to)\s+public\b/i.test(ctx) && !/on schema p2s/i.test(ctx)) publicWord.push(ctx.replace(/\s+/g, ' ')); }
  rep('P4', 'no cross-schema access: zero occurrences (in code, strings and comments) of a qualifier of public, private, auth, extensions, storage, realtime, vault, graphql, net, cron or supabase_*; the word public occurs in code only as the PUBLIC pseudo-role of GRANT/REVOKE', cross.length === 0 && publicWord.length === 0, [...cross, ...publicWord].slice(0, 4).join(' | '));
  // P5 default privileges
  const adp = allSql.filter((s) => /alter\s+default\s+privileges/i.test(codeOnly(scan(s)))).length;
  rep('P5', 'no default-privilege change: no ALTER DEFAULT PRIVILEGES statement remains in the emitted SQL (the 7 of 0001 are excluded and counted); the run additionally compares pg_default_acl before, during and after', adp === 0, `statements containing it: ${adp}`);
  // P6 cleanup
  const cl = harness.cleanup; const clStm = statements(scan(cl)).map(stmtCode).filter(Boolean);
  rep('P6', 'cleanup: the cleanup SQL drops exactly the three shadow schemas (cascade), owned objects of the two roles, and the two roles, and names nothing else', clStm.length === 6 && clStm.every((c) => /^(drop schema if exists p2s_(public|private|auth) cascade|drop owned by p2s_anon, p2s_authenticated|drop role if exists p2s_(anon|authenticated))$/i.test(c)), `${clStm.length} statements`);
  // P8 advisory-lock namespace: advisory locks live in a DATABASE-WIDE key space shared with the live functions; every literal key prefix must carry the p2s: namespace
  const lockLeft = []; const lockSeen = []; for (const segs of allSegs) for (const g of segs) if (g.type === 'string') { const inner = g.text.slice(1, -1); if (/^(m1|p2):/.test(inner)) lockLeft.push(inner); if (/^p2s:/.test(inner)) lockSeen.push(inner); }
  const lockCalls = emitted.map((e) => scan(e.sql)).flat().filter((g) => g.type === 'code' && /hashtextextended\s*\(\s*$/.test(g.text.replace(/\s+/g, ' '))).length;
  rep('P8', 'advisory-lock namespace: every literal advisory-lock key prefix (m1:, p2:) is rewritten to p2s:..., so the shadow functions cannot take or wait on the live functions\' lock keys; per-user lock keys hash the id of a shadow user that does not exist in the live database', lockLeft.length === 0 && lockSeen.length > 0, `left: ${lockLeft.slice(0, 3).join(',')}; namespaced literal sites: ${lockSeen.length}`);
  // creation inventory: everything created is in p2s_* (or is a role)
  const stray = []; for (const sql of allSql) for (const stt of statements(scan(sql))) { const c = stmtCode(stt); const m = /^create\s+(?:or\s+replace\s+)?(?:unique\s+)?(table|function|type|view|sequence|schema(?:\s+if not exists)?|index\s+\w+\s+on|trigger\s+\w+\s+(?:before|after)[^;]*?\bon)\s+(?:if not exists\s+)?([a-z_0-9.]+)/i.exec(c); if (m && /^(table|function|type|view|sequence)$/i.test(m[1]) && !/^p2s_/.test(m[2])) stray.push(m[2]); if (m && /^schema/i.test(m[1]) && !/^p2s_/.test(m[2])) stray.push(m[2]); }
  rep('P7', 'creation inventory: every table, function, type, view, sequence and schema created by the emitted SQL is named p2s_* (roles are the only non-schema objects)', stray.length === 0, stray.slice(0, 4).join(','));
  return { results, grantList };
}

// ------------------------------------------------------------------------------------------------ build
export function build() {
  const manifest = readFileSync(join(root, 'supabase/migration-hashes.txt'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  const emitted = []; const checks = []; const classification = [];
  for (const f of FILES) {
    const bytes = readFileSync(join(root, f.path)); const h = sha256(bytes);
    const expected = f.sha ?? manifest.find(([, n]) => f.path.endsWith(n))?.[0];
    checks.push([`source hash ${f.name}`, h === expected, h.slice(0, 16) + '…']);
    const stats = newStats(); const sql = transformFile(bytes.toString('utf8'), stats);
    emitted.push({ name: f.name, sql, sha: sha256(Buffer.from(sql)), stats, srcSha: h });
    classification.push({ file: f.name, ...stats });
  }
  const harness = { roles: ROLES_SQL, standin: STANDIN_SQL, post: POST_SQL, cleanup: CLEANUP_SQL };
  return { emitted, harness, checks, classification };
}

// ------------------------------------------------------------------------------------------------ main
const args = process.argv.slice(2);
if (args.includes('--selftest') || args.includes('--emit') || args.includes('--report')) {
  const { emitted, harness, checks, classification } = build(); let bad = 0;
  const rep = (ok, n, d = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };
  for (const [n, ok, d] of checks) rep(ok, n, d);
  if (args.includes('--report') || args.includes('--selftest')) {
    console.log('\nrewrite classification (every site is counted; "message strings kept" are listed, never rewritten):');
    for (const c of classification) console.log(`  ${c.file}: qualified identifiers code ${c.qualified.code} / string ${c.qualified.string} / comment ${c.qualified.comment}; schema words ${c.schemaWord}; schema-name literals ${c.schemaLiteral}; role tokens ${c.roleToken}; role literals in has_*_privilege ${c.roleLiteral}; PUBLIC role literals kept ${c.publicRoleKept}; advisory-lock literals namespaced ${c.lockNs.length}; message strings kept ${c.messageKept.length}; EXCLUDED statements ${c.excluded.length}`);
    for (const c of classification) for (const m of c.messageKept) console.log(`     [${c.file}] kept message: ${m}`);
    for (const c of classification) for (const m of c.lockNs) console.log(`     [${c.file}] advisory-lock literal namespaced: ${m}`);
    for (const c of classification) for (const e of c.excluded) console.log(`     [${c.file}] excluded: ${e}`);
  }
  rep(classification.find((c) => c.file === '0001').excluded.length === 7 && classification.filter((c) => c.file !== '0001').every((c) => c.excluded.length === 0), 'exactly the 7 ALTER DEFAULT PRIVILEGES statements of 0001 are excluded, none elsewhere');
  const { results, grantList } = proofs(emitted, harness);
  console.log('\nisolation proofs (offline):'); for (const r of results) rep(r.ok, `${r.id} ${r.name}`, r.detail);
  console.log(`\nexplicit grants that the emitted SQL gives to the test roles (after rewrite): ${grantList.length}`); for (const g of grantList) console.log('   ' + g);
  // determinism and idempotence
  const again = build(); rep(again.emitted.every((e, i) => e.sha === emitted[i].sha), 'the construction is deterministic (same bytes on a second build)');
  rep(emitted.every((e) => transformFile(e.sql, newStats()).trimEnd() === e.sql.trimEnd()), 'the rewrite is idempotent (transforming the output changes nothing: no residual real-schema or role token)');
  // negative controls: the proofs must reject contaminated builds
  const baselineFail = new Set(results.filter((x) => !x.ok).map((x) => x.id));
  rep(baselineFail.size === 0, 'baseline: every offline proof passes on the unmodified construction (required for the negative controls to mean anything)', [...baselineFail].join(','));
  const nc = (label, mut, expect) => { const em = emitted.map((e) => ({ ...e })); const hn = { ...harness }; mut(em, hn); const r2 = proofs(em, hn).results; const newly = r2.filter((x) => !x.ok && !baselineFail.has(x.id)).map((x) => x.id); rep(newly.length > 0 && (!expect || newly.includes(expect)), `negative control rejected: ${label}`, `newly failing: ${newly.join(',') || 'NONE'}${expect ? ' (expected ' + expect + ')' : ''}`); };
  nc('a query against public.profiles', (em) => { em[0].sql += '\nselect 1 from public.profiles;\n'; }, 'P1');
  nc('a reference to auth.users', (em) => { em[1].sql += '\nselect 1 from auth.users;\n'; }, 'P4');
  nc('a schema-name literal left unrewritten', (em) => { em[3].sql += "\nselect 1 where 'x' in ('private');\n"; }, 'P1');
  nc('a grant to the real anon role', (em) => { em[4].sql += '\ngrant select on p2s_public.audit_events to anon;\n'; }, 'P3b');
  nc('a grant on a real object', (em) => { em[2].sql += '\ngrant select on table profiles to p2s_authenticated;\n'; }, 'P3b');
  nc('an alter default privileges statement', (em) => { em[0].sql += '\nalter default privileges for role postgres revoke all on tables from p2s_anon;\n'; }, 'P5');
  nc('a superuser test role', (_, h) => { h.roles = h.roles.replace('nosuperuser', 'superuser'); }, 'P3');
  nc('a bypassrls test role', (_, h) => { h.roles = h.roles.replace(/nobypassrls/g, 'bypassrls'); }, 'P3');
  nc('a role membership grant to another role', (_, h) => { h.roles += '\ngrant p2s_anon to postgres_other;\n'; }, 'P3');
  nc('an extra object outside the shadow', (em) => { em[2].sql += '\ncreate table leak_table (x int);\n'; }, 'P7');
  nc('a cleanup that drops something else', (_, h) => { h.cleanup += '\ndrop schema public cascade;\n'; }, 'P6');
  nc('an advisory-lock literal left in the live key space', (em) => { em[3].sql += "\nselect pg_advisory_xact_lock(hashtextextended('m1:last_admin', 0));\n"; }, 'P8');
  nc('an unqualified table reference', (em) => { em[3].sql += '\nselect 1 from profiles;\n'; }, 'P1b');
  if (args.includes('--emit')) {
    const dir = args[args.indexOf('--emit') + 1]; if (!dir || dir.startsWith('--')) { console.log('--emit needs a directory'); process.exit(2); }
    if (/supabase[\\/]+(migrations|review)/i.test(dir.replace(/\\/g, '/'))) { console.log('refusing: the emit directory must not be inside supabase/migrations or supabase/review'); process.exit(2); }
    mkdirSync(dir, { recursive: true }); const lines = [];
    const put = (n, sql) => { writeFileSync(join(dir, n), sql); lines.push(`${sha256(Buffer.from(sql))}  ${n}`); };
    put('00-roles.sql', harness.roles); put('01-standins.sql', harness.standin);
    emitted.forEach((e, i) => put(`1${i}-${e.name}.sql`, e.sql)); put('90-post.sql', harness.post); put('99-cleanup.sql', harness.cleanup);
    writeFileSync(join(dir, 'SHA256SUMS.txt'), lines.join('\n') + '\n'); console.log(`\nemitted ${lines.length} files to ${dir} (NOT executed); manifest:`); for (const l of lines) console.log('   ' + l);
  }
  console.log(bad ? `\n${bad} check(s) FAILED` : '\nall offline checks passed'); process.exit(bad ? 1 : 0);
} else { console.log('usage: node shadow-construct.mjs --selftest | --report | --emit <dir>'); }
