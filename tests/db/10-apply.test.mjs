// P2.1 suite 1: the migrations as applied to the hosted SCRATCH project; catalogue and grant assertions (read-only, no data
// written except inside rolled-back transactions). Test ids refer to docs/M1-MIGRATIONS-0001-0002-REVIEW.md.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, one, tx, attempt, mkUser } from './lib/db.mjs';
import { note } from './lib/report.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scratchTarget, isLocal } from './lib/config.mjs';

const TABLES = [
  'public.profiles', 'public.organizations', 'public.organization_billing', 'public.organization_members',
  'public.organization_invites', 'private.organization_invite_secrets', 'public.staff_members', 'public.staff_roles',
  'public.capabilities', 'public.role_capabilities', 'private.staff_mfa_enrolment_windows', 'private.staff_mfa_factors',
  'private.platform_validations',
];
const DEFINERS = [
  'my_org_ids', 'my_owner_org_ids', 'handle_new_user', 'guard_organization_members', 'check_last_owner',
  'run_auth_structure_check', 'mfa_check_ok', 'staff_session_ok', 'has_capability', 'guard_staff_not_member',
  'guard_member_not_staff', 'guard_last_admin_lock', 'check_last_admin', 'guard_enrolment_window_insert',
  'guard_staff_mfa_factor_insert',
];
const AUTH_EXEC = ['my_org_ids', 'my_owner_org_ids', 'staff_session_ok', 'has_capability'];

let c;
before(async () => { c = await connect(); });
after(async () => { await c?.end(); });

describe('P2.1 apply and catalogue', () => {
  it('T-0001-1/T-0002-1: both migrations were applied and match the repository files', async () => {
    const manifest = readFileSync(join(process.cwd(), 'supabase', 'migration-hashes.txt'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
    // the files in the repository are the reviewed ones (byte for byte), in either mode
    for (const [hash, name] of manifest) {
      const sha = createHash('sha256').update(readFileSync(join(process.cwd(), 'supabase', 'migrations', name))).digest('hex');
      assert.equal(sha, hash, `${name}: repository file differs from the reviewed hash`);
    }
    if (isLocal()) {
      // Local stack: the Supabase CLI recorded what it applied (version + name; statements are split by the CLI, so a
      // whole-file hash is not recoverable from the database; the repository files above are the byte-exact reference).
      const r = await c.query(`select version, name from supabase_migrations.schema_migrations order by version`);
      const want = manifest.map(([, n]) => { const m = /^(\d+)_(.+)\.sql$/.exec(n); return { version: m[1], name: m[2] }; })
        .sort((a, b) => a.version.localeCompare(b.version));
      assert.deepEqual(r.rows, want, 'applied migration list differs from supabase/migrations');
    } else {
      const r = await c.query(`select file, sha256 from p2_scratch_marker.applied order by file`);
      assert.deepEqual(r.rows.map((x) => x.file), manifest.map(([, n]) => n).sort(), 'applied migration list differs from supabase/migrations');
      for (const row of r.rows) {
        const sha = createHash('sha256').update(readFileSync(join(process.cwd(), 'supabase', 'migrations', row.file))).digest('hex');
        assert.equal(row.sha256, sha, `${row.file}: scratch has a different version than the repository`);
      }
    }
    for (const t of TABLES) assert.ok((await one(c, `select to_regclass($1) as r`, [t])).r, `${t} missing`);
  });

  it('PostgreSQL major version of the scratch project equals the recorded P2_EXPECTED_PG_MAJOR (never assumed)', async () => {
    const want = scratchTarget().expectedMajor;
    const num = Number((await one(c, `show server_version_num`)).server_version_num);
    const got = Math.floor(num / 10000);
    note('engine_major', { recorded: want, actual: got, server_version: c.serverVersion });
    assert.equal(got, want, `scratch project runs PostgreSQL ${got}, recorded ${want}`);
  });

  it('records engine versions (evidence for the hosted comparison at G6)', async () => {
    note('server_version', (await one(c, `show server_version`)).server_version);
    note('version()', (await one(c, `select version() as v`)).v);
    const cls = await one(c, `select rolname from pg_roles where rolname = current_user`);
    note('connected_as', cls.rolname);
    const sup = await one(c, `select rolsuper from pg_roles where rolname = current_user`);
    note('postgres_role_is_superuser', sup.rolsuper);
    assert.ok(true);
  });

  it('RLS is enabled on every table', async () => {
    for (const t of TABLES) assert.equal((await one(c, `select relrowsecurity as r from pg_class where oid = $1::regclass`, [t])).r, true, t);
  });

  it('T-DEF-1: every function in schema private has a pinned search_path', async () => {
    const r = await c.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and not coalesce((select bool_or(x like 'search_path=%') from unnest(p.proconfig) x), false)`);
    assert.deepEqual(r.rows, []);
  });

  it('T-DEF-2: the SECURITY DEFINER inventory is exactly the reviewed set, owned by postgres (D-3, provisional)', async () => {
    const r = await c.query(`select p.proname, pg_get_userbyid(p.proowner) as owner from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.prosecdef order by 1`);
    assert.deepEqual(r.rows.map((x) => x.proname), [...DEFINERS].sort());
    note('definer_owners', [...new Set(r.rows.map((x) => x.owner))]);
    assert.ok(r.rows.every((x) => x.owner === 'postgres'), 'definer owner is not postgres');
  });

  it('T-DEF-3: only four private functions are executable by authenticated; none by anon, service_role or PUBLIC', async () => {
    const r = await c.query(`select p.proname,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('service_role', p.oid, 'execute') as svc,
        has_function_privilege('public', p.oid, 'execute') as pub,
        has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'`);
    for (const f of r.rows) {
      assert.equal(f.anon || f.svc || f.pub, false, `${f.proname} executable by anon/service_role/PUBLIC`);
      assert.equal(f.auth, AUTH_EXEC.includes(f.proname), `${f.proname} authenticated execute mismatch`);
    }
  });

  it('T-0001/T-0002 grants: anon and service_role have no privilege on any application table; authenticated only SELECT (plus 2 profile columns)', async () => {
    for (const t of TABLES) {
      for (const p of ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) {
        assert.equal((await one(c, `select has_table_privilege('anon', $1, $2) as x`, [t, p])).x, false, `anon ${p} ${t}`);
        assert.equal((await one(c, `select has_table_privilege('service_role', $1, $2) as x`, [t, p])).x, false, `service_role ${p} ${t}`);
        if (p !== 'select') assert.equal((await one(c, `select has_table_privilege('authenticated', $1, $2) as x`, [t, p])).x, false, `authenticated ${p} ${t}`);
      }
    }
    for (const t of ['private.organization_invite_secrets', 'private.staff_mfa_enrolment_windows', 'private.staff_mfa_factors', 'private.platform_validations']) {
      assert.equal((await one(c, `select has_table_privilege('authenticated', $1, 'select') as x`, [t])).x, false, t);
    }
    for (const col of ['user_id', 'created_at', 'updated_at'])
      assert.equal((await one(c, `select has_column_privilege('authenticated', 'public.profiles', $1, 'update') as x`, [col])).x, false, col);
    for (const col of ['full_name', 'phone'])
      assert.equal((await one(c, `select has_column_privilege('authenticated', 'public.profiles', $1, 'update') as x`, [col])).x, true, col);
  });

  it('T-0002-seeds: capability catalogue and role mapping counts', async () => {
    const n = async (sql) => Number((await one(c, sql)).n);
    assert.equal(await n(`select count(*) n from public.capabilities`), 27);
    for (const [role, k] of [['admin', 27], ['finance', 8], ['operations', 7], ['support', 8]])
      assert.equal(await n(`select count(*) n from public.role_capabilities where role = '${role}'`), k, role);
    assert.equal(await n(`select count(*) n from public.staff_roles where role not in ('admin','finance','operations','support')`), 0);
  });

  it('T-0002-denied-at-install: no validation row exists until the structure check is run deliberately', async () => {
    // Uses a rolled-back transaction so global state is untouched; other suites rely on a fresh stack too.
    const n = Number((await one(c, `select count(*) n from private.platform_validations`)).n);
    assert.equal(n, 0, 'validation row present before any deliberate check');
  });

  it('T-AV-1: the structure check passes on the real auth schema (types, enum labels, probe)', async () => {
    await tx(c, async () => {
      const r = await one(c, `select private.run_auth_structure_check() as s`);
      const row = await one(c, `select * from private.platform_validations where check_name = 'auth_mfa_factors_shape'`);
      note('auth_structure_check', { status: r.s, sqlstate: row.sqlstate, present: row.present_expected_columns, other_column_count: row.other_column_count,
        type_checks_passed: row.type_checks_passed, enum_labels_ok: row.enum_labels_ok, server_version: row.server_version });
      assert.equal(r.s, 'passed', `structure check failed (sqlstate ${row.sqlstate})`);
      assert.equal(row.type_checks_passed, 5);
      assert.equal(row.enum_labels_ok, true);
    });
  });

  it('T-V5B-1/2: approved columns readable by the definer owner; real column list recorded (names only)', async () => {
    const ok = await attempt0(`select id, user_id, factor_type::text, status::text, created_at from auth.mfa_factors limit 0`);
    assert.equal(ok.ok, true, `postgres cannot read approved columns (${ok.code})`);
    const cols = await c.query(`select column_name, data_type from information_schema.columns where table_schema='auth' and table_name='mfa_factors' order by ordinal_position`);
    note('auth.mfa_factors columns (names/types only)', cols.rows);
  });

  it('T-V5B-6: anon and authenticated cannot read auth.mfa_factors', async () => {
    for (const r of ['anon', 'authenticated'])
      assert.equal((await one(c, `select has_table_privilege($1, 'auth.mfa_factors', 'select') as x`, [r])).x, false, r);
    note('service_role_select_on_auth.mfa_factors', (await one(c, `select has_table_privilege('service_role', 'auth.mfa_factors', 'select') as x`)).x);
  });

  it('T-0001-9: the signup trigger fires for supabase_auth_admin-style inserts and creates an empty profile', async () => {
    await tx(c, async () => {
      const u = await mkUser(c);
      const p = await one(c, `select full_name, phone from public.profiles where user_id = $1`, [u]);
      assert.ok(p, 'profile row missing');
      assert.equal(p.full_name, null);
    });
  });

  it('T-ISO-3 (catalogue part): no role or database sets default_transaction_isolation above read committed', async () => {
    const r = await c.query(`select coalesce(r.rolname, '(all roles)') as role, coalesce(d.datname, '(all dbs)') as db, s.setconfig
      from pg_db_role_setting s left join pg_roles r on r.oid = s.setrole left join pg_database d on d.oid = s.setdatabase`);
    note('pg_db_role_setting', r.rows);
    const bad = r.rows.filter((x) => (x.setconfig ?? []).some((k) => /^default_transaction_isolation=(?!read committed)/i.test(k)));
    assert.deepEqual(bad, []);
    note('instance default_transaction_isolation', (await one(c, `show default_transaction_isolation`)).default_transaction_isolation);
  });

  async function attempt0(sql) {
    await c.query('begin');
    try { return await attempt(c, sql); } finally { await c.query('rollback'); }
  }
});
