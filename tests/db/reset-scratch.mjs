// Resets the approved SCRATCH project (see reset-scratch.sql). Requires --yes and passes the scratch guard first.
//   P2_DB_TEST_CONFIRM=scratch-only node tests/db/reset-scratch.mjs --yes
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './lib/db.mjs';
import { sanitize } from './lib/config.mjs';

if (process.env.P2_DB_MODE === 'local') { console.error('this script is for the hosted scratch project; the local stack is reset by `npm run db:local:apply` (Phase B)'); process.exit(2); }
if (!process.argv.includes('--yes')) { console.error('refusing: pass --yes to reset the scratch project'); process.exit(1); }
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'reset-scratch.sql'), 'utf8');
const c = await connect();
let failed = false;
try {
  await c.query('begin');
  await c.query(`create table if not exists p2_scratch_marker.applied (
    file text primary key, sha256 text not null, applied_at timestamptz not null default now(), server_version text not null)`);
  await c.query(sql);
  await c.query('commit');
  console.log(`scratch project reset (server ${c.serverVersion}); re-apply with: npm run db:apply:scratch`);
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error(`reset failed: [${e.code ?? '?'}] ${sanitize(String(e.message).split('\n')[0])}`);
  failed = true;
} finally {
  await c.end().catch(() => {});
}
process.exit(failed ? 1 : 0);
