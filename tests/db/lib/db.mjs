// Database helpers for the P2.1 scratch-project harness. Every connection passes the scratch guard first:
// allow-listed host/ref, explicit confirmation, session mode, marker schema present, PostgreSQL major as recorded.
// Fixtures run as the project's `postgres` role and are throwaway; most tests use BEGIN ... ROLLBACK.
// `pg` is a dev dependency that must be approved and installed before this harness can connect.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { MARKER_SCHEMA, sanitize, scratchTarget } from './config.mjs';

const ROLES = new Set(['anon', 'authenticated', 'service_role']);
let tlsWarned = false;

async function loadPg() {
  try {
    const mod = await import('pg');
    return mod.default ?? mod;
  } catch {
    throw new Error('the "pg" package is not installed: it must be approved and installed before the database harness can run');
  }
}

export const iterations = () => {
  const raw = process.env.P2_DB_ITERATIONS ?? '50';
  if (!/^[0-9]{1,4}$/.test(raw)) throw new Error('P2_DB_ITERATIONS must be a whole number');
  const n = Number.parseInt(raw, 10);
  if (n < 1 || n > 1000) throw new Error('P2_DB_ITERATIONS must be between 1 and 1000');
  return n;
};

function sslOptions() {
  const ca = process.env.P2_SCRATCH_CA_FILE;
  if (ca) {
    if (!existsSync(ca)) throw new Error('P2_SCRATCH_CA_FILE does not exist');
    return { ca: readFileSync(ca, 'utf8'), rejectUnauthorized: true };
  }
  if (!tlsWarned) {
    tlsWarned = true;
    console.warn('NOTE: TLS certificate of the scratch database is NOT verified (set P2_SCRATCH_CA_FILE to verify). Scratch project only.');
  }
  return { rejectUnauthorized: false };
}

async function open(url, target) {
  const pg = await loadPg();
  // Local stack: loopback only (enforced by the guard), plain TCP. Hosted: TLS as before.
  const ssl = target.mode === 'local' ? false : sslOptions();
  const client = new pg.Client({ connectionString: url, ssl, application_name: 'p2-db-tests' });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(`could not connect to the ${target.mode === 'local' ? 'local-stack' : 'scratch'} database: ${sanitize(e.message)}`);
  }
  try {
    const { rows } = await client.query(
      `select current_database() as db,
              exists (select 1 from pg_namespace where nspname = $1) as marker,
              exists (select 1 from pg_roles where rolname = 'supabase_admin') as local_stack_role,
              current_setting('server_version_num')::int / 10000 as major,
              current_setting('server_version') as version`, [MARKER_SCHEMA]);
    const r = rows[0];
    if (r.db !== 'postgres') throw new Error('unexpected database name');
    if (target.mode === 'local') {
      if (!r.local_stack_role) throw new Error('role supabase_admin not found: this does not look like the Supabase local stack');
    } else if (!r.marker) throw new Error(`marker schema ${MARKER_SCHEMA} not found: this does not look like the scratch project`);
    if (r.major !== target.expectedMajor) throw new Error(`PostgreSQL major ${r.major} differs from the recorded P2_EXPECTED_PG_MAJOR`);
    client.pid = (await client.query('select pg_backend_pid() as pid')).rows[0].pid;
    client.serverVersion = r.version;
  } catch (e) {
    await client.end().catch(() => {});
    throw new Error(`scratch guard refused the connection: ${sanitize(e.message)}`);
  }
  return client;
}

/** Connects to the approved target only (hosted scratch project, or the local stack when P2_DB_MODE=local). */
export async function connect() {
  const target = scratchTarget();
  return open(target.dbUrl, target);
}

/**
 * Elevated (superuser) connection as supabase_admin. Only the local stack provides it; on a hosted project this returns
 * null and callers must skip (never pass). Same guard as connect().
 */
export async function connectAdmin() {
  const target = scratchTarget();
  if (target.mode !== 'local') return null;
  return open(target.adminDbUrl, target);
}

export const rnd = () => randomBytes(5).toString('hex');

export async function one(c, sql, params = []) {
  const r = await c.query(sql, params);
  return r.rows[0];
}

/** Runs fn inside BEGIN ... ROLLBACK (always). */
export async function tx(c, fn, isolation = null) {
  await c.query(isolation ? `begin isolation level ${isolation}` : 'begin');
  try { return await fn(c); } finally { await c.query('rollback'); }
}

/** Statement attempt inside a transaction; failure does not abort the transaction. */
export async function attempt(c, sql, params = []) {
  await c.query('savepoint att');
  try {
    const r = await c.query(sql, params);
    await c.query('release savepoint att');
    return { ok: true, rows: r.rows, rowCount: r.rowCount };
  } catch (e) {
    await c.query('rollback to savepoint att');
    return { ok: false, code: e.code, message: sanitize(String(e.message).split('\n')[0]) };
  }
}

/** Switch to an API role with JWT claims for the rest of the current transaction. */
export async function asRole(c, role, uid = null, claims = {}) {
  if (!ROLES.has(role)) throw new Error('role not allowed');
  await c.query(`set local role ${role}`);
  const payload = JSON.stringify({ role, ...(uid ? { sub: uid } : {}), ...claims });
  await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [payload, uid ?? '']);
}
export const resetRole = (c) => c.query('reset role');

// ---- fixtures ---------------------------------------------------------------------------------------------------
// Test users carry the email prefix p2test- so the reset procedure can find and remove them.
export async function mkUser(c, tag = 'u') {
  const email = `p2test-${tag}-${rnd()}@example.test`;
  const r = await one(c,
    `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, now(), now())
     returning id`, [email]);
  return r.id;
}

/**
 * A user that can really sign in through GoTrue (for HTTP tests): bcrypt password, confirmed email, an email identity, and
 * the empty-string token columns GoTrue scans as non-null text. No service-role key and no open sign-up are needed.
 * Returns { id, email }. The password is generated per call and returned to the test only.
 */
export async function mkLoginUser(c, tag, password) {
  const email = `p2test-${tag}-${rnd()}@example.test`;
  const r = await one(c,
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1,
        extensions.crypt($2, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '')
     returning id`, [email, password]);
  await c.query(
    `insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1::uuid, jsonb_build_object('sub', ($1::uuid)::text, 'email', $2::text, 'email_verified', true), 'email', ($1::uuid)::text, now(), now(), now())`,
    [r.id, email]);
  return { id: r.id, email };
}

export async function mkOrg(c) {
  const r = await one(c, `insert into public.organizations (name, code) values ($1, $2) returning id`,
    [`P2 Test Org ${rnd()}`, `P2${rnd().toUpperCase()}`]);
  return r.id;
}
export async function mkMember(c, org, user, role = 'member', status = 'active') {
  await c.query(
    `insert into public.organization_members (organization_id, user_id, role, status, removed_at)
     values ($1, $2, $3, $4::text, case when $4::text = 'removed' then now() end)`, [org, user, role, status]);
}
export async function mkStaff(c, user, roles = ['support'], status = 'active') {
  await c.query(`insert into public.staff_members (user_id, status) values ($1, $2)`, [user, status]);
  for (const role of roles) await c.query(`insert into public.staff_roles (user_id, role) values ($1, $2)`, [user, role]);
}
/** Fixture factor row (never touches the secret column). */
export async function mkFactor(c, user, { type = 'totp', status = 'verified', createdAt = null } = {}) {
  const r = await one(c,
    `insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
     values (gen_random_uuid(), $1, $2::auth.factor_type, $3::auth.factor_status, coalesce($4::timestamptz, now()), now())
     returning id`, [user, type, status, createdAt]);
  return r.id;
}
export async function mkWindow(c, target, { authorizedBy = null, authorizedAt = null, expiresAt = null, reason = 'p2 fixture' } = {}) {
  const r = await one(c,
    `insert into private.staff_mfa_enrolment_windows (target_user_id, authorized_by, authorized_at, expires_at, reason)
     values ($1, $2, coalesce($3::timestamptz, now()), coalesce($4::timestamptz, now() + interval '30 minutes'), $5)
     returning id`, [target, authorizedBy, authorizedAt, expiresAt, reason]);
  return r.id;
}
export const claim = (c, factorId, user, windowId) =>
  c.query(`insert into private.staff_mfa_factors (factor_id, user_id, window_id) values ($1, $2, $3)`, [factorId, user, windowId]);

/** A staff user with an approved TOTP factor (window opened at transaction start, factor created inside it). */
export async function mkApprovedStaff(c, roles = ['support']) {
  const user = await mkUser(c, 'staff');
  await mkStaff(c, user, roles);
  const win = await mkWindow(c, user);
  const factor = await mkFactor(c, user);
  await claim(c, factor, user, win);
  return { user, win, factor };
}

/** Deletes all staff except the given users (must include an active admin). One statement; safe because an admin remains. */
export async function isolateStaff(c, keep) {
  await c.query(`delete from public.staff_members where user_id <> all($1::uuid[])`, [keep]);
}

export async function waitForLock(observer, pid, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await observer.query(`select wait_event_type from pg_stat_activity where pid = $1`, [pid]);
    if (r.rows[0]?.wait_event_type === 'Lock') return true;
    await new Promise((res) => setTimeout(res, 10));
  }
  return false;
}

/**
 * Two real connections. stmt1 runs to completion (holding its locks); stmt2 is started and must block (when expectBlock)
 * until connection 1 commits. Returns what committed. Deadlock (40P01) is reported as such.
 */
export async function twoTx(c1, c2, observer, stmt1, stmt2, { expectBlock = true } = {}) {
  const settle = (p) => p.then(() => ({ ok: true }), (e) => ({ ok: false, code: e.code, message: sanitize(String(e.message).split('\n')[0]) }));
  await c1.query('begin'); await c2.query('begin');
  const r1 = await settle(c1.query(stmt1.sql, stmt1.params ?? []));
  const p2 = settle(c2.query(stmt2.sql, stmt2.params ?? []));
  const blocked = r1.ok ? await waitForLock(observer, c2.pid, expectBlock ? 3000 : 150) : false;
  let end1;
  if (r1.ok) end1 = await settle(c1.query('commit')); else { await c1.query('rollback'); end1 = r1; }
  const r2 = await p2;
  let end2;
  if (r2.ok) end2 = await settle(c2.query('commit')); else { await c2.query('rollback'); end2 = r2; }
  return { first: end1, second: end2, blocked, committed: [end1.ok, end2.ok].filter(Boolean).length };
}
