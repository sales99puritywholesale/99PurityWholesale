// P2.1 default-privilege checks (audit follow-up). Proves that objects created by `postgres` (the role that runs the migrations)
// get NO privileges for anon / authenticated / service_role / PUBLIC, independent of the explicit per-object revokes in the migrations.
// Every object created here lives inside BEGIN ... ROLLBACK (helper `tx`) and is verified absent afterwards. Nothing persists.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, one, tx, rnd } from './lib/db.mjs';
import { note } from './lib/report.mjs';

const API = ['anon', 'authenticated', 'service_role'];
const SCHEMAS = ['public', 'private'];
const TABLE_PRIVS = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
const SEQ_PRIVS = ['usage', 'select', 'update'];
const P21_TABLES = [
  'public.profiles', 'public.organizations', 'public.organization_billing', 'public.organization_members',
  'public.organization_invites', 'private.organization_invite_secrets', 'public.staff_members', 'public.staff_roles',
  'public.capabilities', 'public.role_capabilities', 'private.staff_mfa_enrolment_windows', 'private.staff_mfa_factors',
  'private.platform_validations',
];

let c;
before(async () => { c = await connect(); });
after(async () => { await c?.end(); });

describe('default privileges: new objects created by postgres (rollback only)', () => {
  for (const schema of SCHEMAS) {
    it(`${schema}: a new table, sequence and function are owned by postgres and give anon/authenticated/service_role/PUBLIC nothing`, async () => {
      const id = rnd();
      const t = `${schema}.p2_adp_t_${id}`;
      const s = `${schema}.p2_adp_s_${id}`;
      const f = `${schema}.p2_adp_f_${id}`;
      const grantees = [...API, 'public'];
      await tx(c, async () => {
        await c.query(`create table ${t} (id int)`);
        await c.query(`create sequence ${s}`);
        await c.query(`create function ${f}() returns int language sql as 'select 1'`);

        assert.equal((await one(c, `select current_user as u`)).u, 'postgres', 'the migration role under test must be postgres');
        assert.equal((await one(c, `select pg_get_userbyid(relowner) as o from pg_class where oid = $1::regclass`, [t])).o, 'postgres');
        assert.equal((await one(c, `select pg_get_userbyid(relowner) as o from pg_class where oid = $1::regclass`, [s])).o, 'postgres');
        assert.equal((await one(c, `select pg_get_userbyid(proowner) as o from pg_proc where oid = $1::regprocedure`, [`${f}()`])).o, 'postgres');

        const seen = [];
        for (const role of grantees) {
          for (const p of TABLE_PRIVS) if ((await one(c, `select has_table_privilege($1, $2::regclass, $3) as x`, [role, t, p])).x) seen.push(`${role}:table:${p}`);
          for (const p of SEQ_PRIVS) if ((await one(c, `select has_sequence_privilege($1, $2::regclass, $3) as x`, [role, s, p])).x) seen.push(`${role}:sequence:${p}`);
          if ((await one(c, `select has_function_privilege($1, $2::regprocedure, 'execute') as x`, [role, `${f}()`])).x) seen.push(`${role}:function:execute`);
        }
        assert.deepEqual(seen, [], `unintended default privileges on new ${schema} objects`);

        // Control: the probes do detect a grant (otherwise the assertion above could be vacuous).
        await c.query(`grant select on ${t} to anon`);
        await c.query(`grant usage on sequence ${s} to authenticated`);
        await c.query(`grant execute on function ${f}() to service_role`);
        assert.equal((await one(c, `select has_table_privilege('anon', $1::regclass, 'select') as x`, [t])).x, true, 'control: table grant not detected');
        assert.equal((await one(c, `select has_sequence_privilege('authenticated', $1::regclass, 'usage') as x`, [s])).x, true, 'control: sequence grant not detected');
        assert.equal((await one(c, `select has_function_privilege('service_role', $1::regprocedure, 'execute') as x`, [`${f}()`])).x, true, 'control: function grant not detected');
      });
      // Nothing persisted after the rollback.
      const left = await one(c, `select to_regclass($1) as t, to_regclass($2) as s, to_regprocedure($3) as f`, [t, s, `${f}()`]);
      assert.deepEqual(left, { t: null, s: null, f: null }, 'temporary test objects survived the rollback');
    });
  }

  it('sensitivity (rolled back): re-adding a default grant for postgres IS detected by both the object probes and the pg_default_acl query', async () => {
    const id = rnd();
    const t = `public.p2_adp_sens_${id}`;
    await tx(c, async () => {
      await c.query(`alter default privileges for role postgres in schema public grant select on tables to anon`);
      await c.query(`create table ${t} (id int)`);
      assert.equal((await one(c, `select has_table_privilege('anon', $1::regclass, 'select') as x`, [t])).x, true, 'the object probe missed a default grant');
      const r = await c.query(`select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
        cross join lateral aclexplode(d.defaclacl) a
        where d.defaclrole = 'postgres'::regrole and n.nspname = 'public' and d.defaclobjtype = 'r' and pg_get_userbyid(a.grantee) = 'anon'`);
      assert.equal(r.rowCount, 1, 'the pg_default_acl query missed a default grant');
    });
    // the default ACL change was rolled back with the transaction
    const after = await one(c, `select count(*)::int as n from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) a
      where d.defaclrole = 'postgres'::regrole and n.nspname = 'public' and d.defaclobjtype = 'r' and pg_get_userbyid(a.grantee) = 'anon'`);
    assert.equal(after.n, 0, 'the sensitivity change to default privileges was not rolled back');
    assert.equal((await one(c, `select to_regclass($1) as t`, [t])).t, null);
  });

  it('no p2_adp_* object exists in public or private (nothing leaked from earlier runs)', async () => {
    const r = await c.query(`select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public','private') and c.relname like 'p2\\_adp\\_%'
      union all select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private') and p.proname like 'p2\\_adp\\_%'`);
    assert.deepEqual(r.rows, []);
  });
});

describe('pg_default_acl for the migration role', () => {
  it('postgres: no default privilege for anon, authenticated, service_role or PUBLIC on tables, sequences or functions (public, private, global)', async () => {
    const r = await c.query(`
      select coalesce(n.nspname, '(global)') as schema, d.defaclobjtype::text as objtype,
             case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee, a.privilege_type
        from pg_default_acl d
        left join pg_namespace n on n.oid = d.defaclnamespace
        cross join lateral aclexplode(d.defaclacl) a
       where d.defaclrole = 'postgres'::regrole
         and d.defaclobjtype in ('r', 'S', 'f')
         and coalesce(n.nspname, '(global)') in ('public', 'private', '(global)')
         and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role'))
       order by 1, 2, 3, 4`);
    assert.deepEqual(r.rows, [], 'postgres still has default privileges for API roles or PUBLIC');
  });

  it('records the full decoded default-ACL picture for postgres and supabase_admin (evidence only; supabase_admin entries cannot be changed by a migration)', async () => {
    const r = await c.query(`
      select pg_get_userbyid(d.defaclrole) as for_role, coalesce(n.nspname, '(global)') as schema, d.defaclobjtype::text as objtype,
             case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee, a.privilege_type
        from pg_default_acl d
        left join pg_namespace n on n.oid = d.defaclnamespace
        cross join lateral aclexplode(d.defaclacl) a
       where pg_get_userbyid(d.defaclrole) in ('postgres', 'supabase_admin')
       order by 1, 2, 3, 4, 5`);
    const adminApi = r.rows.filter((x) => x.for_role === 'supabase_admin' && ['anon', 'authenticated', 'service_role'].includes(x.grantee));
    note('default ACL entries decoded (postgres, supabase_admin)', r.rows);
    note('supabase_admin default grants to API roles (residual, not covered by migrations)', { count: adminApi.length, schemas: [...new Set(adminApi.map((x) => x.schema))] });
    assert.ok(Array.isArray(r.rows));
  });
});

describe('object ownership', () => {
  it('every relation, sequence and function in public/private is owned by postgres; none is owned by supabase_admin', async () => {
    const rel = await c.query(`select n.nspname, c.relname, c.relkind::text as kind, pg_get_userbyid(c.relowner) as owner
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','f','S') and pg_get_userbyid(c.relowner) <> 'postgres'`);
    assert.deepEqual(rel.rows, [], 'relation in public/private not owned by postgres');
    const fn = await c.query(`select n.nspname, p.proname, pg_get_userbyid(p.proowner) as owner
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private') and pg_get_userbyid(p.proowner) <> 'postgres'`);
    assert.deepEqual(fn.rows, [], 'function in public/private not owned by postgres');
    const sa = await c.query(`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public','private') and pg_get_userbyid(c.relowner) = 'supabase_admin'`);
    assert.equal(sa.rows[0].n, 0);
  });

  it('all 13 P2.1 tables exist and are owned by postgres', async () => {
    for (const t of P21_TABLES) {
      const r = await one(c, `select pg_get_userbyid(c.relowner) as owner from pg_class c where c.oid = to_regclass($1)`, [t]);
      assert.ok(r, `${t} missing`);
      assert.equal(r.owner, 'postgres', `${t} owner`);
    }
  });
});
