// DEV-ONLY TEST ACCOUNT CREATOR for the manual walkthrough (docs/MANUAL-TEST-WALKTHROUGH.md, Part 0).
// Creates confirmed e-mail + password users in auth.users / auth.identities of the hosted DEVELOPMENT project (ref semtmllmwhxznxechfsk) so that the owner can sign in to the portal as a customer owner, a customer
// member and as staff candidates. It reuses the pinned target, CA and strict-TLS building blocks of apply-p3.mjs. It never creates organizations, memberships, staff rows or roles (those are done in the portal, as
// the walkthrough says), never touches existing users, and refuses to run if any of the target e-mail addresses already exists.
//
// MODES (exactly one):
//   --inspect              read-only: shows the auth table shapes, whether password hashing is available and which target addresses already exist
//   --dry-run              inserts inside ONE transaction, checks the rows, then ROLLS BACK (nothing persists)
//   --create               inserts and COMMITS (needs --confirm create-test-users:<sha12 of this file>)
// Always: --authorized-read-env-local (reads the single P2_DATABASE_URL line in memory, never printed).
// The generated passwords are written ONLY to a local file in the scratchpad (never printed, never in the repository).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PINS, setSecrets, clean, sha, checkTarget, buildClientConfig, assertTls } from './apply-p3.mjs';

const ROOT = 'D:/99puritywholesale-platform/99puritywholesale';
const SCRATCH = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/cbe1b851-01c2-43b3-85ae-39723a514ceb/scratchpad';
const DOMAIN = 'test.99purity.invalid'; // .invalid can never receive mail and can never collide with a real address
export const ACCOUNTS = [
  { key: 'owner-a', purpose: 'customer owner of Organization A (TEST-A)' },
  { key: 'member-a', purpose: 'customer member of Organization A' },
  { key: 'owner-b', purpose: 'customer owner of Organization B (TEST-B)' },
  { key: 'owner-r', purpose: 'customer owner of the referrer, Organization R (TEST-R)' },
  { key: 'staff-ops', purpose: 'staff candidate: operations' },
  { key: 'staff-finance', purpose: 'staff candidate: finance' },
  { key: 'staff-support', purpose: 'staff candidate: support' },
].map((a) => ({ ...a, email: `${a.key}@${DOMAIN}` }));

const Q = {
  begin: 'begin isolation level read committed', rollback: 'rollback', commit: 'commit',
  cols: "select table_name, column_name, data_type, is_nullable, column_default, is_generated from information_schema.columns where table_schema = 'auth' and table_name in ('users', 'identities') order by table_name, ordinal_position",
  crypt: "select (to_regprocedure('extensions.crypt(text,text)') is not null) as has_crypt, (to_regprocedure('extensions.gen_salt(text,integer)') is not null) as has_salt",
  existing: 'select email from auth.users where lower(email) = any($1::text[])',
  userCount: 'select count(*)::int as n from auth.users',
  insUser: `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
            values ('00000000-0000-0000-0000-000000000000', $1::uuid, 'authenticated', 'authenticated', $2, extensions.crypt($3, extensions.gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')`,
  insIdentity: `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
                values (gen_random_uuid(), $1::uuid, $1::text, jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now())`,
  verify: `select u.email, u.email_confirmed_at is not null as confirmed, u.aud, u.role, (u.encrypted_password like '$2%') as bcrypt, extensions.crypt($2, u.encrypted_password) = u.encrypted_password as pw_ok,
                  exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email' and i.provider_id = u.id::text) as has_identity,
                  exists (select 1 from public.profiles p where p.user_id = u.id) as has_profile,
                  exists (select 1 from public.staff_members s where s.user_id = u.id) as is_staff, exists (select 1 from public.organization_members m where m.user_id = u.id) as is_member
             from auth.users u where u.id = $1::uuid`,
};

export const selfSha = () => sha(readFileSync(fileURLToPath(import.meta.url)));

async function main() {
  const argv = process.argv.slice(2); const flag = (n) => argv.includes(n); const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const modes = ['--inspect', '--dry-run', '--create'].filter(flag);
  if (modes.length !== 1) { console.log('REFUSING: give exactly one of --inspect, --dry-run, --create'); return 2; }
  const mode = modes[0];
  const me = selfSha();
  if (mode === '--create' && opt('--confirm') !== `create-test-users:${me.slice(0, 12)}`) { console.log(`REFUSING: --create needs --confirm create-test-users:${me.slice(0, 12)}`); return 2; }
  let v = process.env.P2_DATABASE_URL ?? '';
  if (!v && flag('--authorized-read-env-local')) { const line = readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); } }
  if (!v) { console.log('STOP: P2_DATABASE_URL not set and --authorized-read-env-local not given'); return 2; }
  const pem = readFileSync(PINS.caFile, 'utf8'); const tg = checkTarget(v, pem, PINS); setSecrets(tg.secrets ?? [v]);
  for (const x of tg.checks) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.n}`);
  if (!tg.ok) { console.log('STOP: target or CA check failed; nothing was executed'); return 3; }
  const pg = createRequire(join(ROOT, 'package.json'))('pg');
  const c = new pg.Client({ ...buildClientConfig(tg), application_name: 'create-test-users' });
  await c.connect(); assertTls(c);
  let rc = 0;
  try {
    const emails = ACCOUNTS.map((a) => a.email);
    const have = (await c.query(Q.existing, [emails])).rows.map((r) => r.email);
    console.log(`INFO  users in auth.users: ${(await c.query(Q.userCount)).rows[0].n}; target addresses that already exist: ${have.length ? have.join(', ') : 'none'}`);
    const hc = (await c.query(Q.crypt)).rows[0];
    console.log(`${hc.has_crypt && hc.has_salt ? 'PASS' : 'FAIL'}  password hashing (extensions.crypt and gen_salt) is available`);
    if (mode === '--inspect') {
      for (const r of (await c.query(Q.cols)).rows) console.log(`COL   auth.${r.table_name}.${r.column_name} ${r.data_type} null=${r.is_nullable} gen=${r.is_generated} default=${r.column_default ? 'yes' : 'no'}`);
      return hc.has_crypt && hc.has_salt ? 0 : 1;
    }
    if (have.length) { console.log('STOP: some target addresses already exist; nothing was changed'); return 4; }
    if (!(hc.has_crypt && hc.has_salt)) { console.log('STOP: password hashing is not available'); return 4; }
    const pw = {}; const ids = {};
    for (const a of ACCOUNTS) { pw[a.email] = randomBytes(18).toString('base64url'); ids[a.email] = randomUUID(); }
    await c.query(Q.begin);
    for (const a of ACCOUNTS) { await c.query(Q.insUser, [ids[a.email], a.email, pw[a.email]]); await c.query(Q.insIdentity, [ids[a.email], a.email]); }
    let ok = true;
    for (const a of ACCOUNTS) {
      const r = (await c.query(Q.verify, [ids[a.email], pw[a.email]])).rows[0];
      const good = r && r.confirmed && r.aud === 'authenticated' && r.role === 'authenticated' && r.bcrypt && r.pw_ok && r.has_identity && r.has_profile && !r.is_staff && !r.is_member;
      console.log(`${good ? 'PASS' : 'FAIL'}  ${a.email}: confirmed, password hash verifies, identity row, empty profile created by the existing trigger, not staff, not a member`);
      ok = ok && good;
    }
    if (mode === '--dry-run' || !ok) {
      await c.query(Q.rollback);
      const after = (await c.query(Q.existing, [emails])).rows.length;
      console.log(`${after === 0 ? 'PASS' : 'FAIL'}  ROLLED BACK: none of the ${ACCOUNTS.length} accounts persisted`);
      return ok && after === 0 ? 0 : 1;
    }
    // THE ONLY COMMIT SITE (create mode, confirmed, every row verified)
    const out = join(SCRATCH, `test-accounts-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    const text = ['99 Purity wholesale TEST accounts (hosted dev project). Keep private; delete when testing is over.', '', ...ACCOUNTS.map((a) => `${a.email}\t${pw[a.email]}\t${a.purpose}`)].join('\n') + '\n';
    writeFileSync(out, text, { flag: 'wx' });
    await c.query(Q.commit);
    const done = (await c.query(Q.existing, [emails])).rows.length;
    console.log(`${done === ACCOUNTS.length ? 'PASS' : 'FAIL'}  COMMITTED: ${done} of ${ACCOUNTS.length} accounts exist; credentials file: ${out}`);
    rc = done === ACCOUNTS.length ? 0 : 5;
  } catch (e) {
    console.log(`ERROR ${clean(e?.code ?? 'ERR')} ${clean(e?.message ?? '').slice(0, 300)}`);
    try { await c.query(Q.rollback); console.log('ROLLBACK issued after the error'); } catch { /* connection closes */ }
    rc = 1;
  } finally { await c.end().catch(() => {}); }
  return rc;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) process.exitCode = await main();
