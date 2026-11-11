// Connection guard for the P2.1 database test harness. The harness may ONLY talk to the approved hosted SCRATCH project.
// Everything here is fail closed and never prints a value: errors are short codes, never the offending string.
//
// Local, git-ignored configuration: .env.scratch.local (matched by the existing ".env*.local" rule in .gitignore).
// Names (values are never read by anything except this loader):
//   P2_SCRATCH_PROJECT_REF   the 20-character project reference of the SCRATCH project
//   P2_SCRATCH_DB_URL        SESSION-mode connection string (port 5432), which carries the database password
//   P2_SCRATCH_API_URL       https://<ref>.supabase.co
//   P2_SCRATCH_ANON_KEY      the public (anon/publishable) key; a service-role/secret key is refused
//   P2_EXPECTED_PG_MAJOR     the PostgreSQL major version recorded for the scratch project (required, never defaulted)
//   P2_FORBIDDEN_PROJECT_REFS (optional) comma-separated project refs that must never be targeted (put the dev ref here)
// Run-time confirmation (environment, not file):  P2_DB_TEST_CONFIRM=scratch-only
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONFIRM_VALUE = 'scratch-only';
export const MARKER_SCHEMA = 'p2_scratch_marker';
const LOCAL_FILE = join(process.cwd(), '.env.scratch.local');
const REF = /^[a-z0-9]{20}$/;

/** Minimal KEY=VALUE parser. Returns only the known keys; the file content is never logged or exposed. */
export function parseLocalFile(text) {
  const wanted = new Set(['P2_SCRATCH_PROJECT_REF', 'P2_SCRATCH_DB_URL', 'P2_SCRATCH_API_URL', 'P2_SCRATCH_ANON_KEY', 'P2_EXPECTED_PG_MAJOR', 'P2_FORBIDDEN_PROJECT_REFS']);
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    if (!wanted.has(key)) continue;
    let value = t.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function jwtRole(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const p = JSON.parse(json);
    return p && typeof p === 'object' ? p.role ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Pure validation. `raw` = values from the local file, `env` = process environment (only the confirmation is read).
 * Returns { ok, errors: string[] (codes only), target?: { ref, dbUrl, apiUrl, anonKey, expectedMajor } }.
 */
export function validateScratchConfig(raw, env = {}) {
  const errors = [];
  const bad = (code) => errors.push(code);

  if (env.P2_DB_TEST_CONFIRM !== CONFIRM_VALUE) bad('confirmation-missing: set P2_DB_TEST_CONFIRM=scratch-only for this run');
  const ref = raw.P2_SCRATCH_PROJECT_REF ?? '';
  if (!REF.test(ref)) bad('project-ref-invalid');
  const forbidden = (raw.P2_FORBIDDEN_PROJECT_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (REF.test(ref) && forbidden.includes(ref)) bad('project-ref-forbidden');

  let db = null;
  try { db = new URL(raw.P2_SCRATCH_DB_URL ?? ''); } catch { bad('db-url-invalid'); }
  if (db) {
    if (!['postgres:', 'postgresql:'].includes(db.protocol)) bad('db-url-protocol');
    const direct = db.hostname === `db.${ref}.supabase.co` && decodeURIComponent(db.username) === 'postgres';
    const pooled = db.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(db.username) === `postgres.${ref}`;
    if (!REF.test(ref) || !(direct || pooled)) bad('db-host-not-allowed');
    if ((db.port || '5432') !== '5432') bad('db-port-must-be-5432-session-mode');
    if (!db.password) bad('db-url-no-password');
    if (db.pathname.replace('/', '') !== 'postgres') bad('db-name-not-postgres');
    if (db.searchParams.has('sslmode') && db.searchParams.get('sslmode') === 'disable') bad('db-ssl-disabled');
  }

  let api = null;
  try { api = new URL(raw.P2_SCRATCH_API_URL ?? ''); } catch { bad('api-url-invalid'); }
  if (api && !(api.protocol === 'https:' && api.hostname === `${ref}.supabase.co` && api.pathname === '/' && !api.username)) bad('api-host-not-allowed');

  const key = raw.P2_SCRATCH_ANON_KEY ?? '';
  if (key.length < 20) bad('anon-key-missing');
  else if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') bad('service-key-refused');
  else if (!key.startsWith('sb_publishable_') && jwtRole(key) !== 'anon') bad('anon-key-not-recognised');

  const major = Number.parseInt(raw.P2_EXPECTED_PG_MAJOR ?? '', 10);
  if (!Number.isInteger(major) || major < 13 || major > 19 || String(major) !== (raw.P2_EXPECTED_PG_MAJOR ?? '').trim()) bad('expected-pg-major-invalid');

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], target: { ref, dbUrl: String(raw.P2_SCRATCH_DB_URL), apiUrl: api.origin, anonKey: key, expectedMajor: major } };
}

// ---- LOCAL mode: Docker Desktop + Supabase local stack (P2_DB_MODE=local) ----------------------------------------------------
// Git-ignored file .env.local-stack (written by `npm run db:local:env`, values never printed). Names:
//   P2_LOCAL_DB_URL      postgresql://postgres:<pw>@127.0.0.1:54322/postgres   (loopback only)
//   P2_LOCAL_API_URL     http://127.0.0.1:54321
//   P2_LOCAL_ANON_KEY    the local anon/publishable key; service-role/secret keys are refused
//   P2_EXPECTED_PG_MAJOR 17 (the development project's major; recorded, never defaulted)
// The elevated supabase_admin connection reuses the same loopback host/port and password (derived in code, never stored).
export const LOCAL_ENV_FILE = '.env.local-stack';
export const LOCAL_DB_PORT = '54322';
export const LOCAL_API_PORT = '54321';
const LOOPBACK = new Set(['127.0.0.1', 'localhost']);
const LOCAL_KEYS = ['P2_LOCAL_DB_URL', 'P2_LOCAL_API_URL', 'P2_LOCAL_ANON_KEY', 'P2_EXPECTED_PG_MAJOR'];

export const parseLocalStackFile = (text) => {
  const wanted = new Set(LOCAL_KEYS);
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    if (!wanted.has(key)) continue;
    let value = t.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
};

/** Pure validation of the local-stack configuration. Same contract as validateScratchConfig (codes only). */
export function validateLocalConfig(raw, env = {}) {
  const errors = [];
  const bad = (code) => errors.push(code);
  if (env.P2_DB_TEST_CONFIRM !== CONFIRM_VALUE) bad('confirmation-missing: set P2_DB_TEST_CONFIRM=scratch-only for this run');
  if (env.P2_DB_MODE !== 'local') bad('mode-not-local');

  let db = null;
  try { db = new URL(raw.P2_LOCAL_DB_URL ?? ''); } catch { bad('db-url-invalid'); }
  if (db) {
    if (!['postgres:', 'postgresql:'].includes(db.protocol)) bad('db-url-protocol');
    if (!LOOPBACK.has(db.hostname)) bad('db-host-not-loopback');
    if ((db.port || '5432') !== LOCAL_DB_PORT) bad('db-port-not-local-stack');
    if (decodeURIComponent(db.username) !== 'postgres') bad('db-user-not-postgres');
    if (!db.password) bad('db-url-no-password');
    if (db.pathname.replace('/', '') !== 'postgres') bad('db-name-not-postgres');
  }

  let api = null;
  try { api = new URL(raw.P2_LOCAL_API_URL ?? ''); } catch { bad('api-url-invalid'); }
  if (api && !(api.protocol === 'http:' && LOOPBACK.has(api.hostname) && api.port === LOCAL_API_PORT && api.pathname === '/' && !api.username)) bad('api-host-not-allowed');

  const key = raw.P2_LOCAL_ANON_KEY ?? '';
  if (key.length < 20) bad('anon-key-missing');
  else if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') bad('service-key-refused');
  else if (!key.startsWith('sb_publishable_') && jwtRole(key) !== 'anon') bad('anon-key-not-recognised');

  const major = Number.parseInt(raw.P2_EXPECTED_PG_MAJOR ?? '', 10);
  if (!Number.isInteger(major) || major < 13 || major > 19 || String(major) !== (raw.P2_EXPECTED_PG_MAJOR ?? '').trim()) bad('expected-pg-major-invalid');

  if (errors.length) return { ok: false, errors };
  const adminUrl = new URL(db.href);
  adminUrl.username = 'supabase_admin';
  return { ok: true, errors: [], target: { mode: 'local', ref: null, dbUrl: String(raw.P2_LOCAL_DB_URL), adminDbUrl: adminUrl.href, apiUrl: api.origin, anonKey: key, expectedMajor: major } };
}

/**
 * EXPLICIT AUTHORIZATION for reading the harness configuration files. Nothing in this harness reads .env.scratch.local or .env.local-stack
 * unless the operator authorizes that specific file for this run, in ONE of two ways:
 *   - the command-line flag --authorized-read-env-scratch-local / --authorized-read-env-local-stack (direct `node` runs), or
 *   - the environment variable P2_AUTHORIZED_CONFIG_READS containing the token `scratch-local` and/or `local-stack` (comma separated).
 *     This is the way for `node --test`, whose child processes do not receive the command-line flags.
 * Without authorization the file is not opened (not even to redact secrets from messages: nothing was loaded, so there is nothing to redact).
 */
export const CONFIG_READ_TOKENS = Object.freeze({ 'scratch-local': '--authorized-read-env-scratch-local', 'local-stack': '--authorized-read-env-local-stack' });
export function configReadAuthorized(kind, argv = process.argv, env = process.env) {
  if (!Object.hasOwn(CONFIG_READ_TOKENS, kind)) return false;
  if (argv.includes(CONFIG_READ_TOKENS[kind])) return true;
  return String(env.P2_AUTHORIZED_CONFIG_READS ?? '').split(',').map((t) => t.trim()).includes(kind);
}
function requireConfigRead(kind, fileLabel) {
  if (!configReadAuthorized(kind)) {
    throw new Error(`config read refused: reading ${fileLabel} needs explicit authorization (${CONFIG_READ_TOKENS[kind]} or P2_AUTHORIZED_CONFIG_READS=${kind}); the file was not opened`);
  }
}

let cached = null;
/**
 * Loads and validates the configuration once. P2_DB_MODE=local selects the Docker/Supabase local stack (loopback only);
 * unset selects the hosted scratch project. Any other value is refused. Throws an Error whose message contains codes only.
 */
export function scratchTarget() {
  if (cached) return cached;
  const mode = process.env.P2_DB_MODE;
  if (mode === 'local') {
    requireConfigRead('local-stack', LOCAL_ENV_FILE);
    const file = join(process.cwd(), LOCAL_ENV_FILE);
    if (!existsSync(file)) throw new Error('local guard: .env.local-stack not found (run: npm run db:local:env, after the stack is up)');
    const result = validateLocalConfig(parseLocalStackFile(readFileSync(file, 'utf8')), process.env);
    if (!result.ok) throw new Error(`local guard refused to run: ${result.errors.join('; ')}`);
    cached = result.target;
    return cached;
  }
  if (mode !== undefined && mode !== '') throw new Error('guard: P2_DB_MODE must be unset (hosted scratch) or "local"');
  requireConfigRead('scratch-local', '.env.scratch.local');
  if (!existsSync(LOCAL_FILE)) throw new Error('scratch guard: .env.scratch.local not found (see tests/db/scratch.env.example)');
  const result = validateScratchConfig(parseLocalFile(readFileSync(LOCAL_FILE, 'utf8')), process.env);
  if (!result.ok) throw new Error(`scratch guard refused to run: ${result.errors.join('; ')}`);
  cached = { mode: 'hosted', ...result.target };
  return cached;
}

export const isLocal = () => scratchTarget().mode === 'local';

/** Removes anything that looks like a credential or the connection target from a message before it is shown. */
export function sanitize(message) {
  let s = String(message ?? '');
  try {
    if (configReadAuthorized('scratch-local') && existsSync(LOCAL_FILE)) {
      for (const v of Object.values(parseLocalFile(readFileSync(LOCAL_FILE, 'utf8')))) if (v && v.length >= 6) s = s.split(v).join('<redacted>');
    }
    const lf = join(process.cwd(), LOCAL_ENV_FILE);
    if (configReadAuthorized('local-stack') && existsSync(lf)) {
      for (const v of Object.values(parseLocalStackFile(readFileSync(lf, 'utf8')))) if (v && v.length >= 6) s = s.split(v).join('<redacted>');
    }
  } catch { /* nothing to redact */ }
  return s.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://<redacted>').replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '<jwt>');
}
