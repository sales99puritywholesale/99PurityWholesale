// Controls the P2.1 Supabase LOCAL stack (Docker Desktop). Prints no secrets, connection strings or keys.
//   node tests/db/local-stack.mjs start    Phase A: starts db + auth + rest from a STAGING workdir that has NO migrations,
//                                          so starting services can never apply the project migrations.
//   node tests/db/local-stack.mjs stop     stops the stack (volumes are kept)
//   node tests/db/local-stack.mjs status   reports whether the stack is running (no keys)
//   node tests/db/local-stack.mjs env      writes the git-ignored .env.local-stack from the running stack (keys never printed)
//   (Phase A checks: node tests/db/local-verify.mjs)
//   node tests/db/local-stack.mjs apply    PHASE B ONLY: `supabase db reset --local` with the reviewed migrations. Refuses unless
//                                          P2_LOCAL_APPLY_APPROVED=phase-b is set, which is done only after explicit approval.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const staging = resolve(root, '..', '..', 'tmp', 'p2-local-stack'); // D:\tmp\p2-local-stack when run from D:\99puritywholesale-platform\99puritywholesale
const cli = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'supabase.cmd' : 'supabase');
const PG_MAJOR = '17';
const action = process.argv[2];

function sb(args, { workdir } = {}) {
  const full = [...args, ...(workdir ? ['--workdir', workdir] : [])];
  const r = spawnSync(cli, full, { encoding: 'utf8', shell: process.platform === 'win32', cwd: root, env: { ...process.env, SUPABASE_INTERNAL_NO_UPDATE_CHECK: '1' } });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
// The CLI output can include keys; never print it raw. Only whitelisted summaries are shown.
const clean = (s) => s.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '<jwt>').replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, '<key>').replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://<redacted>');

function stageWorkdir() {
  const dir = join(staging, 'supabase');
  mkdirSync(join(dir, 'migrations'), { recursive: true });
  for (const f of readdirSync(join(dir, 'migrations'))) rmSync(join(dir, 'migrations', f)); // staging must have no migrations
  copyFileSync(join(root, 'supabase', 'config.toml'), join(dir, 'config.toml'));
  if (readdirSync(join(dir, 'migrations')).length !== 0) throw new Error('staging migrations directory is not empty');
  return staging;
}

function statusJson(workdir) {
  const r = sb(['status', '-o', 'json'], { workdir });
  if (r.code !== 0) return null;
  const start = r.out.indexOf('{');
  try { return JSON.parse(r.out.slice(start, r.out.lastIndexOf('}') + 1)); } catch { return null; }
}

switch (action) {
  case 'start': {
    const wd = stageWorkdir();
    console.log('staging workdir prepared (no migrations); starting db, auth and rest only...');
    const r = sb(['start', '-x', 'mailpit,imgproxy,studio,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta'], { workdir: wd });
    console.log(clean(r.out).split('\n').slice(-25).join('\n'));
    process.exit(r.code);
    break;
  }
  case 'stop': {
    const r = sb(['stop'], { workdir: stageWorkdir() });
    console.log(clean(r.out).split('\n').slice(-10).join('\n'));
    process.exit(r.code);
    break;
  }
  case 'status': {
    const s = statusJson(stageWorkdir());
    console.log(s ? 'local stack: running' : 'local stack: not running');
    process.exit(s ? 0 : 1);
    break;
  }
  case 'env': {
    const s = statusJson(stageWorkdir());
    if (!s) { console.error('local stack is not running'); process.exit(1); }
    const anon = s.ANON_KEY ?? s.PUBLISHABLE_KEY;
    const lines = [`P2_LOCAL_DB_URL=${s.DB_URL}`, `P2_LOCAL_API_URL=${s.API_URL}`, `P2_LOCAL_ANON_KEY=${anon}`, `P2_EXPECTED_PG_MAJOR=${PG_MAJOR}`];
    if (lines.some((l) => l.endsWith('=undefined') || l.endsWith('='))) { console.error('status output is missing expected fields'); process.exit(1); }
    writeFileSync(join(root, '.env.local-stack'), `# Written by tests/db/local-stack.mjs env. Git-ignored. Local disposable stack only; no service-role key is stored.\n${lines.join('\n')}\n`, { mode: 0o600 });
    console.log('wrote .env.local-stack with keys: P2_LOCAL_DB_URL, P2_LOCAL_API_URL, P2_LOCAL_ANON_KEY, P2_EXPECTED_PG_MAJOR (values not shown)');
    break;
  }
  case 'apply': {
    if (process.env.P2_LOCAL_APPLY_APPROVED !== 'phase-b') {
      console.error('refusing: applying the P2.1 migrations to the local stack is Phase B and needs explicit approval (P2_LOCAL_APPLY_APPROVED=phase-b)');
      process.exit(2);
    }
    const r = sb(['db', 'reset', '--local', '--yes'], { workdir: root });
    console.log(clean(r.out).split('\n').slice(-30).join('\n'));
    process.exit(r.code);
    break;
  }
  default:
    console.error('usage: node tests/db/local-stack.mjs <start|stop|status|env|apply>');
    process.exit(2);
}
