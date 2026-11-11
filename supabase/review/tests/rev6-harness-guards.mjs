// OFFLINE guard tests for supabase/review/tests/dry-execute-0005-rev6.mjs. Nothing here connects to a database or reads an environment file. It makes broken COPIES of the harness in a
// scratch directory and requires each to stop (exit 1 in the offline self-test, exit 3 when started with the execution flag) BEFORE the credential step; it also asserts, from the source
// text, that the harness reads the environment file only behind its explicit flag, has no environment override of the artifact, and ends every path with a rollback.
// Usage: node supabase/review/tests/rev6-harness-guards.mjs [scratchDir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const harness = join(root, 'supabase', 'review', 'tests', 'dry-execute-0005-rev6.mjs');
const text = readFileSync(harness, 'utf8');
const dir = resolve(process.argv[2] ?? join(tmpdir(), 'p2-rev6-harness-guards'));
mkdirSync(dir, { recursive: true });
let failed = 0;
const check = (label, ok, d = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${d ? '  (' + d + ')' : ''}`); };
const once = (from, to) => { if (!text.includes(from)) throw new Error(`pattern not found: ${from.slice(0, 50)}`); return text.replace(from, to); };
const run = (file, args) => { const env = { ...process.env }; delete env.P2_DATABASE_URL; const r = spawnSync(process.execPath, [file, ...args], { cwd: root, env, encoding: 'utf8', timeout: 30000 }); return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }; };

// static properties of the harness source
check('no environment override of the artifact path, hash or version (no process.env in the artifact lines)', !/process\.env\.P2_DRY_(FILE|EXPECTED_SHA)/.test(text) && /const EXPECTED_SHA = '[0-9a-f]{64}'/.test(text));
check('the environment file is read only inside the --authorized-read-env-local branch (exactly one occurrence, on that line)', (text.match(/\.env\.local/g) ?? []).length === 1 && text.split('\n').filter((l) => l.includes('.env.local')).every((l) => l.includes("--authorized-read-env-local")));
check('the offline self-test exits before the connection code and before any environment access', text.indexOf('if (OFFLINE)') < text.indexOf('process.env.P2_DATABASE_URL') && text.indexOf('if (OFFLINE)') < text.indexOf("require('pg')") + 1e9);
check('a refusal without the execution flag happens before the artifact is read', text.indexOf("REFUSING: needs --authorized-rolled-back-execution") < text.indexOf('readFileSync(FILE)'));
check('every transaction path ends in ROLLBACK (the finally block issues it; no COMMIT statement exists outside the forbidden-pattern list)', /await tx\.query\('rollback'\)/.test(text) && !/query\('commit'\)/i.test(text));
check('the run is read-pinned to the expected project ref and strict TLS with the pinned CA', /rejectUnauthorized: true/.test(text) && /const REF = 'semtmllmwhxznxechfsk'/.test(text) && /CA_SHA256/.test(text));

// broken copies
const cases = [
  ['a wrong pinned hash', () => once(/const EXPECTED_SHA = '[0-9a-f]{64}'/.exec(text)[0], `const EXPECTED_SHA = '${'0'.repeat(64)}'`)],
  ['a wrong pinned function count', () => once('privateFunctions: 26', 'privateFunctions: 18')],
  ['a wrong pinned trigger count', () => once('triggers: 17,', 'triggers: 16,')],
  ['an artifact of another version (rev5 path)', () => once("'supabase/review/0005_rate_limits_and_owner_mfa.rev6.sql'", "'supabase/review/0005_rate_limits_and_owner_mfa.rev5.sql'")],
  ['an artifact of another version (rev4 path)', () => once("'supabase/review/0005_rate_limits_and_owner_mfa.rev6.sql'", "'supabase/review/0005_rate_limits_and_owner_mfa.rev4.sql'")],
  ['an artifact of another version (rev3.1 path)', () => once("'supabase/review/0005_rate_limits_and_owner_mfa.rev6.sql'", "'supabase/review/0005_rate_limits_and_owner_mfa.sql'")],
];
for (const [label, make] of cases) {
  const f = join(dir, `broken-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.mjs`);
  writeFileSync(f, make());
  const off = run(f, ['--offline-selftest']);
  check(`${label}: the offline self-test fails`, off.code === 1, `exit ${off.code}`);
  const ex = run(f, ['--authorized-rolled-back-execution']);
  check(`${label}: with the execution flag it STOPS (exit 3) before any credential step`, ex.code === 3 && /STOP: pre-checks failed/.test(ex.out) && !/P2_DATABASE_URL/.test(ex.out), `exit ${ex.code}`);
}
const good = run(harness, ['--offline-selftest']);
check('the real harness passes its offline self-test', good.code === 0, `exit ${good.code}`);
const nofl = run(harness, []);
check('the real harness refuses to start without the execution flag (exit 2)', nofl.code === 2 && /REFUSING/.test(nofl.out), `exit ${nofl.code}`);
console.log(failed ? `HARNESS GUARDS FAILED (${failed})` : 'HARNESS GUARDS PASS (offline only: nothing connected, no environment file read, the harness was never run against a database)');
process.exit(failed ? 1 : 0);
