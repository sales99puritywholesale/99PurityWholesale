// Static SQL validation: the text-pattern checker's self-test, then every migration. NOT a parser and NOT a proof.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const checker = join('supabase', 'review', 'static-check.mjs');
const migrations = readdirSync(join('supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => join('supabase', 'migrations', f));
let failed = false;
for (const args of [['--selftest'], migrations]) {
  try {
    process.stdout.write(execFileSync('node', [checker, ...args], { encoding: 'utf8' }));
  } catch (e) {
    process.stdout.write(String(e.stdout ?? ''));
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
