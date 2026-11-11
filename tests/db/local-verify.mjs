// Phase A verification of the LOCAL stack. Read-only: SELECTs and GETs only; applies nothing; prints no secrets or keys.
//   P2_DB_MODE=local P2_DB_TEST_CONFIRM=scratch-only node tests/db/local-verify.mjs
import { connect } from './lib/db.mjs';
import { scratchTarget } from './lib/config.mjs';

const rows = [];
const report = (name, ok, detail = '') => { rows.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

// P2_VERIFY_PHASE=B switches the two migration-state checks to their post-apply form (default: Phase A, pre-apply).
const PHASE_B = process.env.P2_VERIFY_PHASE === 'B';
if (process.env.P2_DB_MODE !== 'local') { console.error('refusing: P2_DB_MODE=local is required'); process.exitCode = 2; throw new Error('P2_DB_MODE=local is required'); }
const T = scratchTarget();
const c = await connect(); // guard: loopback only, supabase_admin role present, PG major equals the recorded one
try {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const v = (await q(`show server_version`))[0].server_version;
  report('PostgreSQL major equals the recorded 17 (development project: 17.11)', c.serverVersion.startsWith('17.'), `server ${v}`);
  report('connected as postgres (not superuser expected locally)', (await q(`select current_user as u`))[0].u === 'postgres');
  report('auth schema: users and mfa_factors exist', (await q(`select to_regclass('auth.users') is not null a, to_regclass('auth.mfa_factors') is not null b`)).every((r) => r.a && r.b));
  report('roles anon, authenticated, service_role, supabase_auth_admin exist',
    Number((await q(`select count(*) n from pg_roles where rolname in ('anon','authenticated','service_role','supabase_auth_admin')`))[0].n) === 4);
  report('auth.factor_type / factor_status enums exist', Number((await q(`select count(*) n from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='auth' and t.typname in ('factor_type','factor_status')`))[0].n) === 2);
  const mig = (await q(`select to_regclass('supabase_migrations.schema_migrations') is not null as has`))[0].has;
  const applied = mig ? Number((await q(`select count(*) n from supabase_migrations.schema_migrations`))[0].n) : 0;
  const objects = (await q(`select to_regclass('public.organizations') is not null as org, exists (select 1 from pg_namespace where nspname='private') as priv`))[0];
  if (PHASE_B) {
    // Phase B state (after the approved apply): exactly the two reviewed migrations and their objects.
    report('[Phase B] exactly 2 project migrations recorded', applied === 2, `history table ${mig ? 'present' : 'absent'}, rows ${applied}`);
    report('[Phase B] P2.1 objects exist (public.organizations, schema private)', objects.org && objects.priv);
  } else {
    // Phase A pre-apply checks: valid ONLY before the migrations are applied. They are expected to FAIL after Phase B.
    report('[Phase A pre-apply] NO project migrations applied (migration history empty or absent)', applied === 0, `history table ${mig ? 'present' : 'absent'}, rows ${applied}`);
    report('[Phase A pre-apply] NO P2.1 objects exist (public.organizations, schema private)', !objects.org && !objects.priv);
  }
  report('isolation default is read committed', (await q(`show default_transaction_isolation`))[0].default_transaction_isolation === 'read committed');
} finally { await c.end(); }

const h = { apikey: T.anonKey, authorization: `Bearer ${T.anonKey}` };
const get = async (path, extra = {}) => { try { const r = await fetch(`${T.apiUrl}${path}`, { headers: { ...h, ...extra, connection: 'close' }, signal: AbortSignal.timeout(15000) }); return { status: r.status, body: await r.text() }; } catch (e) { return { status: 0, body: String(e.cause?.code ?? e.code ?? 'network') }; } };
const auth = await get('/auth/v1/health');
report('Auth (GoTrue) health through the gateway', auth.status === 200, `HTTP ${auth.status}`);
const settings = await get('/auth/v1/settings');
let s = null; try { s = JSON.parse(settings.body); } catch { /* not JSON */ }
report('Auth settings: email sign-up disabled', Boolean(s) && s.disable_signup === true, s ? `disable_signup=${s.disable_signup}` : `HTTP ${settings.status}`);
const rest = await get('/rest/v1/');
report('PostgREST reachable through the gateway with the anon key', rest.status === 200, `HTTP ${rest.status}`);
const priv = await get('/rest/v1/', { 'Accept-Profile': 'private' });
report('schema private is NOT exposed (Accept-Profile: private is refused)', priv.status >= 400 && priv.status < 500, `HTTP ${priv.status}`);
const pub = await get('/rest/v1/', { 'Accept-Profile': 'public' });
report('schema public is exposed', pub.status === 200, `HTTP ${pub.status}`);
const mfa = await get('/auth/v1/factors');
report('TOTP MFA endpoint exists (unauthenticated call is rejected, not 404)', mfa.status !== 404 && mfa.status !== 0, `HTTP ${mfa.status}`);

const failed = rows.filter((x) => !x).length;
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall Phase A checks passed');
// Graceful end: no process.exit() (it raced with closing fetch sockets and crashed libuv on Windows). Set the exit code and
// let the event loop drain; the database client was already closed in the finally block above.
process.exitCode = failed ? 1 : 0;
