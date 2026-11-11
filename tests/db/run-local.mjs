// Runs the database suites against the LOCAL stack (P2_DB_MODE=local). Still requires P2_DB_TEST_CONFIRM=scratch-only.
// Only usable after Phase B approval has applied the migrations (suite 10 asserts that).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'tests', 'db');
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join('tests', 'db', f));
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=900000', ...files, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, P2_DB_MODE: 'local' },
});
process.exit(r.status ?? 1);
