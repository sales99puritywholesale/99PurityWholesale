// Unit tests for the scratch-connection guard and the migration change-control check. Pure logic: no database, no network,
// no dependency beyond Node. These run without any scratch project.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIRM_VALUE, CONFIG_READ_TOKENS, configReadAuthorized, parseLocalFile, parseLocalStackFile, sanitize, scratchTarget, validateLocalConfig, validateScratchConfig } from './lib/config.mjs';

const REF = 'abcdefghij0123456789';
const DEV = 'zzzzzzzzzz9999999999';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256' })}.${b64({ role, iss: 'supabase' })}.sig-not-verified`;
const good = () => ({
  P2_SCRATCH_PROJECT_REF: REF,
  P2_SCRATCH_DB_URL: `postgresql://postgres.${REF}:pw-not-real@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  P2_SCRATCH_API_URL: `https://${REF}.supabase.co`,
  P2_SCRATCH_ANON_KEY: jwt('anon'),
  P2_EXPECTED_PG_MAJOR: '17',
});
const ENV = { P2_DB_TEST_CONFIRM: CONFIRM_VALUE };
const codes = (raw, env = ENV) => validateScratchConfig(raw, env).errors.map((e) => e.split(':')[0]);

describe('scratch guard: accepts only the approved target', () => {
  it('accepts a complete, consistent scratch configuration', () => {
    const r = validateScratchConfig(good(), ENV);
    assert.equal(r.ok, true);
    assert.equal(r.target.ref, REF);
    assert.equal(r.target.expectedMajor, 17);
  });
  it('accepts the direct connection host form too', () => {
    const raw = { ...good(), P2_SCRATCH_DB_URL: `postgresql://postgres:pw-not-real@db.${REF}.supabase.co:5432/postgres` };
    assert.equal(validateScratchConfig(raw, ENV).ok, true);
  });
  it('accepts a publishable-format key', () => {
    assert.equal(validateScratchConfig({ ...good(), P2_SCRATCH_ANON_KEY: 'sb_publishable_abcdefghijklmnop' }, ENV).ok, true);
  });
});

describe('scratch guard: refuses everything else (fail closed)', () => {
  it('requires the explicit run-time confirmation', () => {
    assert.deepEqual(codes(good(), {}), ['confirmation-missing']);
    assert.deepEqual(codes(good(), { P2_DB_TEST_CONFIRM: 'yes' }), ['confirmation-missing']);
  });
  it('refuses a missing or malformed project ref', () => {
    assert.ok(codes({ ...good(), P2_SCRATCH_PROJECT_REF: '' }).includes('project-ref-invalid'));
    assert.ok(codes({ ...good(), P2_SCRATCH_PROJECT_REF: 'SHORT' }).includes('project-ref-invalid'));
  });
  it('refuses any ref on the forbidden list (the dev project)', () => {
    const raw = {
      ...good(),
      P2_SCRATCH_PROJECT_REF: DEV,
      P2_SCRATCH_DB_URL: `postgresql://postgres.${DEV}:pw-not-real@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
      P2_SCRATCH_API_URL: `https://${DEV}.supabase.co`,
      P2_FORBIDDEN_PROJECT_REFS: `${DEV}, other0000000000000000`,
    };
    assert.ok(codes(raw).includes('project-ref-forbidden'));
  });
  it('refuses a database host that does not belong to the configured project', () => {
    const other = { ...good(), P2_SCRATCH_DB_URL: `postgresql://postgres.${DEV}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres` };
    assert.ok(codes(other).includes('db-host-not-allowed'));
    for (const host of ['localhost', '127.0.0.1', 'db.example.com', `db.${DEV}.supabase.co`, `${REF}.supabase.co`, 'aws-0.pooler.supabase.com.evil.example']) {
      const raw = { ...good(), P2_SCRATCH_DB_URL: `postgresql://postgres:pw@${host}:5432/postgres` };
      assert.ok(codes(raw).includes('db-host-not-allowed'), host);
    }
  });
  it('refuses a pooler user that names a different project', () => {
    const raw = { ...good(), P2_SCRATCH_DB_URL: `postgresql://postgres.${DEV}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres` };
    assert.ok(codes(raw).includes('db-host-not-allowed'));
  });
  it('requires session mode (port 5432), a password, the postgres database and TLS', () => {
    const url = (s) => ({ ...good(), P2_SCRATCH_DB_URL: s });
    assert.ok(codes(url(`postgresql://postgres.${REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`)).includes('db-port-must-be-5432-session-mode'));
    assert.ok(codes(url(`postgresql://postgres.${REF}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`)).includes('db-url-no-password'));
    assert.ok(codes(url(`postgresql://postgres.${REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/other`)).includes('db-name-not-postgres'));
    assert.ok(codes(url(`postgresql://postgres.${REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=disable`)).includes('db-ssl-disabled'));
    assert.ok(codes(url('not a url')).includes('db-url-invalid'));
    assert.ok(codes(url(`mysql://postgres.${REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`)).includes('db-url-protocol'));
  });
  it('refuses an API URL that is not https://<ref>.supabase.co', () => {
    for (const u of ['http://' + REF + '.supabase.co', `https://${DEV}.supabase.co`, 'https://localhost:54321', `https://${REF}.supabase.co/rest/v1`, `https://u:p@${REF}.supabase.co`, '']) {
      assert.ok(codes({ ...good(), P2_SCRATCH_API_URL: u }).some((c) => c.startsWith('api-')), u);
    }
  });
  it('refuses a service-role JWT or secret key as the public key, and unknown key shapes', () => {
    assert.ok(codes({ ...good(), P2_SCRATCH_ANON_KEY: jwt('service_role') }).includes('service-key-refused'));
    assert.ok(codes({ ...good(), P2_SCRATCH_ANON_KEY: 'sb_secret_abcdefghijklmnopqrstu' }).includes('service-key-refused'));
    assert.ok(codes({ ...good(), P2_SCRATCH_ANON_KEY: jwt('authenticated') }).includes('anon-key-not-recognised'));
    assert.ok(codes({ ...good(), P2_SCRATCH_ANON_KEY: 'x' }).includes('anon-key-missing'));
  });
  it('requires an explicit, sane PostgreSQL major version (no default)', () => {
    for (const v of ['', undefined, 'abc', '17.1', '12', '99', ' 17x']) assert.ok(codes({ ...good(), P2_EXPECTED_PG_MAJOR: v }).includes('expected-pg-major-invalid'), String(v));
  });
  it('never puts a configuration value in an error', () => {
    const raw = { ...good(), P2_SCRATCH_DB_URL: 'postgresql://postgres:very-secret-pw@db.example.com:5432/postgres', P2_SCRATCH_ANON_KEY: jwt('service_role') };
    const text = JSON.stringify(validateScratchConfig(raw, ENV));
    for (const secret of ['very-secret-pw', 'db.example.com', 'service_role', 'sig-not-verified']) assert.ok(!text.includes(secret), secret);
  });
});

describe('local-stack guard (P2_DB_MODE=local): loopback only', () => {
  const lgood = () => ({
    P2_LOCAL_DB_URL: 'postgresql://postgres:pw-not-real@127.0.0.1:54322/postgres',
    P2_LOCAL_API_URL: 'http://127.0.0.1:54321',
    P2_LOCAL_ANON_KEY: jwt('anon'),
    P2_EXPECTED_PG_MAJOR: '17',
  });
  const LENV = { P2_DB_TEST_CONFIRM: CONFIRM_VALUE, P2_DB_MODE: 'local' };
  const lcodes = (raw, env = LENV) => validateLocalConfig(raw, env).errors.map((e) => e.split(':')[0]);
  it('accepts the default local stack and derives the supabase_admin URL on the same host and port', () => {
    const r = validateLocalConfig(lgood(), LENV);
    assert.equal(r.ok, true);
    assert.equal(r.target.mode, 'local');
    assert.equal(r.target.expectedMajor, 17);
    const a = new URL(r.target.adminDbUrl);
    assert.equal(a.username, 'supabase_admin');
    assert.equal(a.hostname, '127.0.0.1');
    assert.equal(a.port, '54322');
    assert.equal(validateLocalConfig({ ...lgood(), P2_LOCAL_DB_URL: 'postgresql://postgres:pw@localhost:54322/postgres', P2_LOCAL_API_URL: 'http://localhost:54321' }, LENV).ok, true);
  });
  it('requires confirmation and explicit local mode', () => {
    assert.ok(lcodes(lgood(), { P2_DB_MODE: 'local' }).includes('confirmation-missing'));
    assert.ok(lcodes(lgood(), { P2_DB_TEST_CONFIRM: CONFIRM_VALUE }).includes('mode-not-local'));
  });
  it('refuses any non-loopback database host (hosted dev project, pooler, private ranges, lookalikes)', () => {
    for (const host of ['db.abcdefghij0123456789.supabase.co', 'aws-0-us-east-1.pooler.supabase.com', '10.0.0.5', '0.0.0.0', '127.0.0.1.evil.example', 'localhost.evil.example', '[::1]']) {
      assert.ok(lcodes({ ...lgood(), P2_LOCAL_DB_URL: `postgresql://postgres:pw@${host}:54322/postgres` }).includes('db-host-not-loopback'), host);
    }
  });
  it('refuses another port, user, database or a missing password', () => {
    const url = (s) => ({ ...lgood(), P2_LOCAL_DB_URL: s });
    assert.ok(lcodes(url('postgresql://postgres:pw@127.0.0.1:5432/postgres')).includes('db-port-not-local-stack'));
    assert.ok(lcodes(url('postgresql://postgres:pw@127.0.0.1/postgres')).includes('db-port-not-local-stack'));
    assert.ok(lcodes(url('postgresql://supabase_admin:pw@127.0.0.1:54322/postgres')).includes('db-user-not-postgres'));
    assert.ok(lcodes(url('postgresql://postgres@127.0.0.1:54322/postgres')).includes('db-url-no-password'));
    assert.ok(lcodes(url('postgresql://postgres:pw@127.0.0.1:54322/other')).includes('db-name-not-postgres'));
    assert.ok(lcodes(url('not a url')).includes('db-url-invalid'));
  });
  it('refuses an API URL that is not the local gateway', () => {
    for (const u of ['https://abcdefghij0123456789.supabase.co', 'http://127.0.0.1:54322', 'http://127.0.0.1', 'http://example.com:54321', 'http://127.0.0.1:54321/rest/v1', '']) {
      assert.ok(lcodes({ ...lgood(), P2_LOCAL_API_URL: u }).some((c) => c.startsWith('api-')), u);
    }
  });
  it('refuses a service-role key and requires a recognised anon key and an explicit PG major', () => {
    assert.ok(lcodes({ ...lgood(), P2_LOCAL_ANON_KEY: jwt('service_role') }).includes('service-key-refused'));
    assert.ok(lcodes({ ...lgood(), P2_LOCAL_ANON_KEY: 'sb_secret_abcdefghijklmnopqrstu' }).includes('service-key-refused'));
    assert.ok(lcodes({ ...lgood(), P2_LOCAL_ANON_KEY: jwt('authenticated') }).includes('anon-key-not-recognised'));
    assert.ok(lcodes({ ...lgood(), P2_EXPECTED_PG_MAJOR: undefined }).includes('expected-pg-major-invalid'));
  });
  it('never puts a value in an error', () => {
    const text = JSON.stringify(validateLocalConfig({ ...lgood(), P2_LOCAL_DB_URL: 'postgresql://postgres:very-secret-pw@db.example.com:54322/postgres', P2_LOCAL_ANON_KEY: jwt('service_role') }, LENV));
    for (const secret of ['very-secret-pw', 'db.example.com', 'service_role', 'sig-not-verified']) assert.ok(!text.includes(secret), secret);
  });
  it('parses only the known local keys', () => {
    assert.deepEqual(parseLocalStackFile('# c\nP2_LOCAL_API_URL="http://127.0.0.1:54321"\nP2_SCRATCH_ANON_KEY=x\nOTHER=1\n'), { P2_LOCAL_API_URL: 'http://127.0.0.1:54321' });
  });
});

describe('local file parsing and redaction', () => {
  it('reads only the known keys and strips quotes and comments', () => {
    const parsed = parseLocalFile(`# c\nP2_SCRATCH_PROJECT_REF="${REF}"\nUNRELATED_SECRET=abc\nP2_EXPECTED_PG_MAJOR=17 \n\n`);
    assert.deepEqual(parsed, { P2_SCRATCH_PROJECT_REF: REF, P2_EXPECTED_PG_MAJOR: '17' });
  });
  it('sanitize removes connection strings and JWTs', () => {
    const out = sanitize(`failed postgresql://postgres.x:hunter2@host:5432/postgres and ${jwt('anon')}`);
    assert.ok(!out.includes('hunter2'));
    assert.ok(!/eyJ/.test(out));
  });
});

describe('migration change control', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const manifest = readFileSync(join(process.cwd(), 'supabase', 'migration-hashes.txt'), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  it('every migration file is listed in the manifest with a matching sha256, and nothing else is present', () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    assert.deepEqual(files, manifest.map(([, name]) => name).sort());
    for (const [hash, name] of manifest) {
      const sha = createHash('sha256').update(readFileSync(join(dir, name))).digest('hex');
      assert.equal(sha, hash, `${name} differs from the reviewed hash: a migration changed without updating supabase/migration-hashes.txt`);
    }
  });
  it('migrations are byte-identical to the reviewed drafts until a reviewed change says otherwise', () => {
    const draft = (n) => readFileSync(join(process.cwd(), 'supabase', 'review', n));
    assert.ok(readFileSync(join(dir, '20261108000001_foundation_identity.sql')).equals(draft('0001_foundation_identity.sql')));
    assert.ok(readFileSync(join(dir, '20261108000002_staff_capabilities.sql')).equals(draft('0002_staff_capabilities.sql')));
  });
  it('the promoted P3 migration is byte-identical to the reviewed revision 2 candidate and is NOT the original (defective) review draft', () => {
    const promoted = readFileSync(join(dir, '20261110000100_p3_catalog_pricing_orders.sql'));
    assert.ok(promoted.equals(readFileSync(join(process.cwd(), 'supabase', 'review', 'p3', '20261110000100_p3_catalog_pricing_orders.rev2.sql'))));
    assert.equal(createHash('sha256').update(promoted).digest('hex'), 'd5efe7e9753b13c6ccaedf1fb70d31ab3431d967d46764ceb3cb290ce5195beb');
    assert.notEqual(createHash('sha256').update(readFileSync(join(process.cwd(), 'supabase', 'review', 'p3', '20261110000100_p3_catalog_pricing_orders.sql'))).digest('hex'), createHash('sha256').update(promoted).digest('hex'));
  });
  it('migrations are applied in filename order and use LF line endings', () => {
    for (const [, name] of manifest) assert.ok(!readFileSync(join(dir, name)).includes(13), `${name} contains CR bytes`);
    const names = manifest.map(([, n]) => n);
    assert.deepEqual(names, [...names].sort());
  });
});

describe('explicit authorization for reading the harness config files (.env.scratch.local, .env.local-stack)', () => {
  it('is denied by default and for unknown kinds, including prototype names', () => {
    for (const k of ['scratch-local', 'local-stack', '', 'other', '__proto__', 'constructor', 'toString']) assert.equal(configReadAuthorized(k, [], {}), false, k);
  });
  it('is granted per file by the command-line flag or by P2_AUTHORIZED_CONFIG_READS, and one grant does not cover the other file', () => {
    assert.equal(configReadAuthorized('scratch-local', [CONFIG_READ_TOKENS['scratch-local']], {}), true);
    assert.equal(configReadAuthorized('local-stack', [CONFIG_READ_TOKENS['scratch-local']], {}), false);
    assert.equal(configReadAuthorized('local-stack', [], { P2_AUTHORIZED_CONFIG_READS: 'local-stack' }), true);
    assert.equal(configReadAuthorized('scratch-local', [], { P2_AUTHORIZED_CONFIG_READS: ' local-stack , x ' }), false);
    assert.equal(configReadAuthorized('scratch-local', [], { P2_AUTHORIZED_CONFIG_READS: 'scratch-local,local-stack' }), true);
    assert.equal(configReadAuthorized('scratch-local', [], { P2_AUTHORIZED_CONFIG_READS: 'scratch-localx' }), false);
  });
  it('scratchTarget refuses before opening any file when nothing is authorized', { skip: configReadAuthorized('scratch-local') || configReadAuthorized('local-stack') || process.env.P2_DB_MODE ? 'authorization or mode present in this environment' : false }, () => {
    assert.throws(() => scratchTarget(), /config read refused: reading \.env\.scratch\.local needs explicit authorization/);
  });
  it('sanitize does not open the config files without authorization (it still scrubs URLs and JWTs)', () => {
    const out = sanitize('x postgresql://u:p@h/db y eyJabcdefghijk.abcdefgh.sig');
    assert.ok(out.includes('postgresql://<redacted>') && out.includes('<jwt>'));
  });
});
