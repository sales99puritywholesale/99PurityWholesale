// Applies supabase/migrations/*.sql, in filename order, to the approved SCRATCH project only. Each file runs in its own
// transaction and is recorded (with its sha256 and the server version) in p2_scratch_marker.applied, so tests can prove that
// what was tested is exactly what is in the repository. Refuses to run unless the scratch guard passes (see lib/config.mjs).
//   P2_DB_TEST_CONFIRM=scratch-only node tests/db/apply-migrations.mjs
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from './lib/db.mjs';
import { sanitize } from './lib/config.mjs';

if (process.env.P2_DB_MODE === 'local') { console.error('this script is for the hosted scratch project; the local stack uses `npm run db:local:apply` (Phase B, needs approval)'); process.exit(2); }
const dir = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) { console.error('no migrations found'); process.exit(1); }

const c = await connect();
let failed = false;
try {
  await c.query(`create table if not exists p2_scratch_marker.applied (
    file text primary key, sha256 text not null, applied_at timestamptz not null default now(), server_version text not null)`);
  const done = new Map((await c.query('select file, sha256 from p2_scratch_marker.applied')).rows.map((r) => [r.file, r.sha256]));
  const dirty = (await c.query(`select to_regclass('public.organizations') is not null as has_org`)).rows[0].has_org;
  if (done.size === 0 && dirty) throw new Error('the scratch project already has objects from an unrecorded run: run `npm run db:reset:scratch` first');

  for (const file of files) {
    const text = readFileSync(join(dir, file));
    const sha = createHash('sha256').update(text).digest('hex');
    if (done.has(file)) {
      if (done.get(file) !== sha) throw new Error(`${file} changed after it was applied: reset the scratch project and re-apply`);
      console.log(`skip    ${file} (already applied, hash matches)`);
      continue;
    }
    await c.query('begin');
    try {
      await c.query(text.toString('utf8'));
      await c.query('insert into p2_scratch_marker.applied (file, sha256, server_version) values ($1, $2, $3)', [file, sha, c.serverVersion]);
      await c.query('commit');
      console.log(`applied ${file}  sha256=${sha.slice(0, 16)}...  server ${c.serverVersion}`);
    } catch (e) {
      await c.query('rollback').catch(() => {});
      const where = e.where ? `\n  where: ${sanitize(String(e.where).split('\n')[0])}` : '';
      const pos = e.position ? `\n  position: ${e.position}` : '';
      console.error(`FAILED  ${file}: [${e.code ?? '?'}] ${sanitize(String(e.message).split('\n')[0])}${where}${pos}`);
      failed = true;
      break;
    }
  }
} catch (e) {
  console.error(`apply refused: ${sanitize(e.message)}`);
  failed = true;
} finally {
  await c.end().catch(() => {});
}
process.exit(failed ? 1 : 0);
