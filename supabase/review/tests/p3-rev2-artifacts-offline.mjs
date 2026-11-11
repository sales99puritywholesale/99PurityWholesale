// P3 rev2 artifact-set review. OFFLINE ONLY: no database, no network, no environment file. Spawns the harnesses only with --offline-selftest / --print-manifest (both refuse to connect by construction).
// Run: node supabase/review/tests/p3-rev2-artifacts-offline.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const rd = (p) => readFileSync(`${root}/${p}`);
const sha = (b) => createHash('sha256').update(b).digest('hex');
let bad = 0; const t = (n, ok, d = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };

const F = {
  migOrig: 'supabase/review/p3/20261110000100_p3_catalog_pricing_orders.sql', migRev2: 'supabase/review/p3/20261110000100_p3_catalog_pricing_orders.rev2.sql', seed: 'supabase/review/p3/seed-products.sql',
  dryOrig: 'supabase/review/tests/dry-execute-p3.mjs', dryRev2: 'supabase/review/tests/dry-execute-p3.rev2.mjs',
  tOrig: 'supabase/review/tests/p3-workflow-rollback.mjs', tRev2: 'supabase/review/tests/p3-workflow-rollback.rev2.mjs',
  allow: 'docs/P3-TIER-R-ALLOWLIST.txt', allowHist: 'docs/P3-TIER-R-ALLOWLIST.rev1-historical.txt', manifest: 'docs/P3-TIER-R-EXECUTION-MANIFEST.md',
  clock: 'supabase/review/tests/p3-rev2-clock-offline.mjs', trig: 'supabase/review/tests/p3-rev2-trigger-offline.mjs' };
const H = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, sha(rd(p))]));
const txt = (k) => rd(F[k]).toString('utf8');
const PIN = { migOrig: 'bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e', migRev2: 'd5efe7e9753b13c6ccaedf1fb70d31ab3431d967d46764ceb3cb290ce5195beb', seed: '1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164',
  dryOrig: '4060fe9422a434187943f9a87183018abad52a4354f9ec8bde2895bd15aa9338', tOrig: '791879b19189c6a780d3a5253850184a1908a31e1c8f3b6b8025c2f27abaf909',
  tRev2: '924aac9c7aad34f4cd58ac3362d9305998bc68f38f4f594cb4c83aa5ce83909b', dryRev2: 'cb825bdf996049ba3f2af77fe2542d48cd7786a20c2bf51bbed08dd041d28e93',
  allow: 'b70389a710fed399d9be8c1872a1520151e104fdd1739b1cc2dbc89668619617', allowHist: '21c041bd4d9d78e91f9927be05ca7fffc9dfa06ebbdfdd6f908cc49bc613ae45' };
const ALLOW_STATEMENTS_SHA = '0cec85111dd71156f81ec807e659dd410c81f99bc50b391a61afb0e63f507ceb';

// ---------------------------------------------------------------- A. pins
for (const k of Object.keys(PIN)) t(`unchanged/known artifact ${F[k]} has sha256 ${PIN[k].slice(0, 8)}...${PIN[k].slice(-4)}`, H[k] === PIN[k]);
t('rev2 Phase T harness pins the revised migration and the seed', txt('tRev2').includes(`MIGRATION_SHA = '${PIN.migRev2}'`) && txt('tRev2').includes(`SEED_SHA = '${PIN.seed}'`) && txt('tRev2').includes('20261110000100_p3_catalog_pricing_orders.rev2.sql'));
t('rev2 dry-execution harness pins the revised migration and the seed', txt('dryRev2').includes(`MIGRATION_SHA = '${PIN.migRev2}'`) && txt('dryRev2').includes(`SEED_SHA = '${PIN.seed}'`) && txt('dryRev2').includes('20261110000100_p3_catalog_pricing_orders.rev2.sql'));
t('the ORIGINAL dry-execution and Phase T harnesses still pin the ORIGINAL migration', txt('dryOrig').includes(`MIGRATION_SHA = '${PIN.migOrig}'`) && txt('tOrig').includes(`MIGRATION_SHA = '${PIN.migOrig}'`));
t('the two rev2 harnesses are different files with different hashes', H.dryRev2 !== H.tRev2 && H.dryRev2 !== H.dryOrig && H.tRev2 !== H.tOrig);

// ---------------------------------------------------------------- B. the rev2 dry-execution harness weakens no gate
const O = txt('dryOrig').split('\n'); const N = txt('dryRev2').split('\n');
const removed = O.filter((l) => !N.includes(l)); const added = N.filter((l) => !O.includes(l));
const allowedRemoved = [/^\/\/ +--authorized-rolled-back-execution/, /^import \{ readFileSync, appendFileSync \}/, /^const MIGRATION = /, /^const MIGRATION_SHA = /, /^const LOG = /, /^rep\('migration sha256 equals the approved hash'/, /application_name: 'p3-dry-execute'/, /^let tx = null; let before = null/, /^  if \(tx\) \{ try \{ await tx\.query\('rollback'\)/, /^const failed = results\.filter/, /^process\.exitCode = /];
t('every line removed from the original dry harness is a pin, a file name, a label, the rollback line (now also recording that it ran) or the summary line', removed.every((l) => allowedRemoved.some((re) => re.test(l))), `${removed.length} removed`);
t('the rollback statement, the finally block, the fresh connection and the AFTER ROLLBACK comparison loop are all still present and unchanged in the rev2 dry harness', ["await tx.query('rollback')", 'const c1 = await connect(); const after = await snapshot(c1);', "rep(`AFTER ROLLBACK unchanged: ${k}`", "rep('AFTER ROLLBACK: no P3 table, sequence, function, policy, trigger or seed row exists; migration history is the same four versions'"].every((s) => txt('dryRev2').includes(s)));
t('TLS is strict and pinned: rejectUnauthorized true, pinned CA and servername; project ref, host, user, database and port checks unchanged', ['ssl: { rejectUnauthorized: true, ca: pem, servername: U.hostname }', "const REF = 'semtmllmwhxznxechfsk'", "CA_SHA256 = '807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA'", 'm[1] === REF', "U.pathname === '/postgres'"].every((s) => txt('dryRev2').includes(s)) && !/rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/.test(txt('dryRev2')));
t('the single transaction is READ COMMITTED, runs the candidate migration and then the seed on the SAME connection (tx), and commits nowhere', /begin isolation level read committed/.test(txt('dryRev2')) && /await tx\.query\(mig\)/.test(txt('dryRev2')) && /await tx\.query\(seed\)/.test(txt('dryRev2')) && !/\bcommit\b/i.test(txt('dryRev2').split('\n').filter((l) => !/^\s*\/\//.test(l) && !/rep\('neither file contains/.test(l)).join('\n').replace(/commit\|/g, '')));
t('no write to supabase_migrations and no CLI use in the rev2 dry harness (the only mention is the read of the history and the pre-check regex)', !/insert\s+into\s+supabase_migrations|supabase\s+db\s+push/i.test(txt('dryRev2')));
t('the added code is read-only: it only SELECTs from the private function, calls rpc_checkout as a non-member, and writes a NEW timestamped result file with flag wx', added.filter((l) => /tx\.query\(/.test(l)).every((l) => !/\b(insert|update|delete|truncate|drop|create|alter)\b/i.test(l.replace(/\/\/.*$/, ''))) && /flag: 'wx'/.test(txt('dryRev2')));
t('connection mode requires --harness-sha equal to the harness own sha256 (a stricter gate than the original, which had none) and --authorized-rolled-back-execution', /given !== SELF_SHA/.test(txt('dryRev2')) && /needs --authorized-rolled-back-execution/.test(txt('dryRev2')));
t('log and result names are new: rev2 log, timestamped rev2 result; the previous dry-run log name is not used', txt('dryRev2').includes('dry-execute-p3-rev2-log.txt') && txt('dryRev2').includes('dry-execute-p3-rev2-result-') && !/dry-execute-p3-log\.txt/.test(txt('dryRev2')) && txt('tRev2').includes('P3-TIER-R-P0-RESULT.rev2.json') && txt('tRev2').includes('p3-workflow-rollback-rev2-log.txt') && !/P3-TIER-R-P0-RESULT\.json/.test(txt('tRev2')));

// ---------------------------------------------------------------- C. the shipping case lists are identical in the two rev2 harnesses
const block = (s) => { const a = s.indexOf('const REQ = ['); const end = "['shipping object is SQL NULL (omitted)', null]];"; return s.slice(a, s.indexOf(end, a) + end.length); };
const SHIP = { name: 'P3 Test Facility', line1: '1 Test Way', city: 'Testville', region: 'TX', postal: '78701', country: 'US' };
const bT = block(txt('tRev2')); const bD = block(txt('dryRev2'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const listT = new Function('SHIP', `${bT}\nreturn shipCases;`)(SHIP); const listD = new Function('SHIP', `${bD}\nreturn shipCases;`)(SHIP);
t('the shipping case definitions are textually identical in the Phase T harness and the dry-execution harness', norm(bT) === norm(bD) && bT.length > 500);
t('the evaluated case lists (labels and JSON texts) are identical: 37 invalid cases', JSON.stringify(listT) === JSON.stringify(listD) && listT.length === 37 && new Set(listT.map((c) => c[0])).size === 37);

// ---------------------------------------------------------------- D. failure-dependency handling (the real makeKit extracted from the rev2 Phase T harness)
const kitSrc = (() => { const s = txt('tRev2'); const a = s.indexOf('function makeKit('); const e = s.indexOf('\n}\n', a) + 3; return s.slice(a, e); })();
const codeOf = new Function(`return ${/const codeOf = (.*);\n/.exec(txt('tRev2'))[1].replace(/;$/, '')}`)();
const makeKit = new Function(`${kitSrc}\nreturn makeKit;`)();
const log = []; const R = (n, ok, d = '') => log.push({ s: ok ? 'PASS' : 'FAIL', n, d }); const B = (n, why) => log.push({ s: 'BLOCKED', n, d: why }); const S = (n, why) => log.push({ s: 'SKIPPED', n, d: why });
const SECRET = 'jane@example.invalid 1 Test Way Testville TX 78701 SECRET-TOKEN';
const answers = { rpc_admin_variant_set_price: { v: { ok: false, code: 'step_up_required', ship_to: SECRET }, msg: SECRET }, rpc_cart_put_item: { v: { ok: true, code: 'updated' } }, rpc_boom: { e: '42501', msg: SECRET } };
const callF = async (w, rpc) => answers[rpc];
const FOUNDATION = ['T12', 'T14', 'T15', 'T16', 'T17', 'T18', /^T21 exactly 3/]; // exactly as in the harness
// scenario 1: a baseline-price restore fails -> the whole baseline-dependent family is blocked (conservatively, including T16b/T16c which need the first order), everything else runs
const kit = makeKit({ rep: R, blk: B, call: callF, code: codeOf });
await kit.setup('T10-restore', 'ADMIN', 'rpc_admin_variant_set_price', [], 'updated', FOUNDATION); // fails
await kit.setup('T15d', 'A2', 'rpc_cart_put_item', [], 'updated', ['T15d']);                      // succeeds: blocks nothing by itself
const fam = ['T12 ORG_A price of V11 = 13125', 'T12b ORG_B price of V11 = 11000', 'T12c B1 asking for ORG_A', 'T14 put V11 x2', 'T14c V32 -> not_available', 'T15a checkout: order_placed', 'T15b same key', 'T15d new order for A2', 'T15e a floor above', 'T15f ship name missing -> 22023', 'T16 an open cart is repriced', 'T16 placed orders are unchanged', 'T16b direct update refused', 'T16c customer view', 'T17 OPS lists', 'T18 placed...delivered: confirmed', 'T21 exactly 3 checkouts'];
const free = ['T11 a variant without a base price', 'T13 A1 select from public.products -> 42501', 'T19 ADMIN x rpc_admin_catalog_list: pass', 'T19b a staff user cannot become a member', 'T20 cross-org', 'T05b member add -> added', 'T21 the audit table mirrors the returned outcomes', 'T21 audit rows carry no free text'];
for (const n of [...fam, ...free]) kit.ck(n, true);
const st = (n) => log.find((x) => x.n === n)?.s;
t('a failed SETUP is a FAIL record (never a pass); a successful setup is a PASS record', st('SETUP T10-restore: ADMIN rpc_admin_variant_set_price') === 'FAIL' && st('SETUP T15d: A2 rpc_cart_put_item') === 'PASS');
t(`scenario 1: all ${fam.length} dependent checks (T12*, T14*, T15*, T16*, T17, T18, the T21 count check) are BLOCKED, none reported as passed or failed`, fam.every((n) => st(n) === 'BLOCKED'));
t(`scenario 1: all ${free.length} UNRELATED checks (T11, T13, T19, T19b, T20, T05b, T21 mirror and free-text check) still execute and PASS`, free.every((n) => st(n) === 'PASS'));
// scenario 2: a narrow setup (T16 price/rule) fails -> only the two named T16 checks are blocked; T16b/T16c and a missing order O2 block only their own checks
const k2 = makeKit({ rep: R, blk: B, call: callF, code: codeOf }); const n2 = log.length;
await k2.setup('T16', 'ADMIN', 'rpc_boom', [], 'updated', [/^T16 (placed|an open)/]); // SQLSTATE error: only its code is logged
k2.block([/^T18b/, /^T18c/], 'no placed order O2');
for (const n of ['T16 placed orders are unchanged', 'T16 an open cart is repriced', 'T16b direct update refused', 'T16c customer view', 'T17 OPS lists', 'T18 placed...delivered: confirmed', 'T18b placed -> shipped refused', 'T18c placed -> cancelled allowed once']) k2.ck(n, true);
const s2 = (n) => log.slice(n2).find((x) => x.n === n)?.s;
t('scenario 2: a RegExp dependency blocks only the checks it names (T16 placed/open); T16b, T16c and T17 still PASS; kit.block() blocks T18b/T18c by pattern while T18 still PASSES', ['T16 placed orders are unchanged', 'T16 an open cart is repriced', 'T18b placed -> shipped refused', 'T18c placed -> cancelled allowed once'].every((n) => s2(n) === 'BLOCKED') && ['T16b direct update refused', 'T16c customer view', 'T17 OPS lists', 'T18 placed...delivered: confirmed'].every((n) => s2(n) === 'PASS'));
S('T15g order_too_large', 'documented gap'); R('T99 a genuine failure stays a failure', false, 'x');
t('a deliberately failing ordinary check stays FAIL; SKIPPED is its own state', st('T99 a genuine failure stays a failure') === 'FAIL' && st('T15g order_too_large') === 'SKIPPED');
t('PASS, FAIL, BLOCKED and SKIPPED are four distinct states', new Set(log.map((x) => x.s)).size === 4 && st('T15g order_too_large') === 'SKIPPED');
t('a BLOCKED check carries only a fixed reason: "setup <scenario> (<rpc>) returned <code>" or the harness-authored "no placed order O2"', log.filter((x) => x.s === 'BLOCKED').every((x) => /^setup [\w-]+ \(rpc_[a-z_]+\) returned [\w?]+$/.test(x.d) || x.d === 'no placed order O2'));
t('no payload, address, e-mail, token or error message reaches any log entry produced by setup handling', !JSON.stringify(log).includes('SECRET') && !JSON.stringify(log).includes('Test Way') && !JSON.stringify(log).includes('example.invalid') && !JSON.stringify(log).includes('78701'));
const sm = txt('tRev2');
t('the harness summary counts BLOCKED and SKIPPED separately and a BLOCKED check makes the run exit non-zero', /BLOCKED, \$\{skippedN\} SKIPPED/.test(sm) && /\(failed \|\| blockedN\)/.test(sm));

// ---------------------------------------------------------------- E. log hygiene of the harnesses (static)
const logLines = (s) => s.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /\b(ck|rep|note|blk|skip)\(/.test(l) && !/^\s*\/\//.test(l));
const risky = /\.msg\b|emailOf\(|\bSHIP\b|ship_to\b|P2_DATABASE_URL|U\.password|\bjs\b|JSON\.stringify\((s|SHIP)\)/;
for (const k of ['tRev2', 'dryRev2']) {
  // examine only the text from the first ck/rep/note/blk/skip call onwards on each line (the RPC call before it legitimately carries the test payload)
  const raw = txt(k); const hits = logLines(raw).filter(([, l]) => risky.test(l.slice(l.search(/\b(ck|rep|note|blk|skip)\(/)).replace(/(rep|ck)\(`[^`]*`/, '$1(x').replace(/(rep|ck)\('[^']*'/, '$1(x')));
  const msgUses = [...raw.matchAll(/\b(e2?)\.message/g)].filter((m) => !raw.slice(Math.max(0, m.index - 6), m.index).includes('clean('));
  t(`${F[k]}: no log or check detail prints a shipping address, e-mail, URL, credential or raw error message (${hits.length} risky lines, ${msgUses.length} unwrapped error messages)`, hits.length === 0 && msgUses.length === 0, hits.map(([n]) => `line ${n}`).join(', '));
}
t('the Phase T harness logs only an RPC error CODE for setup calls (out.msg is cleaned and never passed to rep/note)', !/rep\([^)]*\.msg/.test(txt('tRev2')) && /msg: clean\(e\.message\)/.test(txt('tRev2')));

// ---------------------------------------------------------------- F. the 116 allow-list statements and the documentation
const manifestOf = (rel) => execFileSync('node', [`${root}/${rel}`, '--print-manifest'], { encoding: 'utf8' }).split('\n').filter((l) => /^(fx|p0|rd|snap|tx|sp|id|neg|rpc)\./.test(l));
const aOrig = manifestOf(F.tOrig); const aRev2 = manifestOf(F.tRev2);
const aDoc = txt('allow').split('\n').filter((l) => /^(fx|p0|rd|snap|tx|sp|id|neg|rpc)\./.test(l));
t('the rev2 Phase T harness has exactly 116 allow-listed statements, identical (id, phase, SQL) to the previous harness', aRev2.length === 116 && JSON.stringify(aOrig) === JSON.stringify(aRev2));
const aHist = txt('allowHist').split('\n').filter((l) => /^(fx|p0|rd|snap|tx|sp|id|neg|rpc)\./.test(l));
t('the allow-list documentation file (revision 2 header) lists the same 116 statements as the harness; its statements-only sha256 is unchanged', aDoc.length === 116 && JSON.stringify(aDoc) === JSON.stringify(aRev2) && sha(aDoc.join('\n') + '\n') === ALLOW_STATEMENTS_SHA && H.allow === PIN.allow);
t('the historical revision 1 allow-list file is preserved byte-for-byte (sha256 21c041bd...ae45) and has the same 116 statements', H.allowHist === PIN.allowHist && JSON.stringify(aHist) === JSON.stringify(aDoc) && sha(aHist.join('\n') + '\n') === ALLOW_STATEMENTS_SHA);
t('the allow-list header identifies the revised harness, migration candidate and seed, and points to the historical file', /^# P3 TIER R ALLOW-LIST - REVISION 2/.test(txt('allow')) && txt('allow').split('\n').slice(0, 8).join('\n').includes(PIN.tRev2) && txt('allow').split('\n').slice(0, 8).join('\n').includes(PIN.migRev2) && txt('allow').includes('P3-TIER-R-ALLOWLIST.rev1-historical.txt') && /harness sha256 924aac9c/.test(txt('allow')));
t('every statement the rev2 Phase T harness sends goes through Q(), which refuses unregistered SQL before sending (only the two hash-pinned files are executed directly)', /async function Q\(/.test(txt('tRev2')) && /STATEMENT NOT ALLOW-LISTED \(refused before sending\)/.test(txt('tRev2')) && (txt('tRev2').match(/\bc\.query\(/g) ?? []).length === 2 && (txt('tRev2').match(/\btx\.query\(/g) ?? []).length === 1);
const selfT = execFileSync('node', [`${root}/${F.tRev2}`, '--offline-selftest'], { encoding: 'utf8' }); const selfD = execFileSync('node', [`${root}/${F.dryRev2}`, '--offline-selftest'], { encoding: 'utf8' });
t('rev2 Phase T harness self-test: 13 passed, 0 FAILED, no connection, no environment read', /offline self-test: 13 passed, 0 FAILED/.test(selfT) && /no environment file was read/.test(selfT));
t('rev2 dry-execution harness self-test passes: pins, LF, no transaction control, P3 draft marker, shipping probes defined; no connection, no environment read', /offline self-test: \d+ passed, 0 FAILED/.test(selfD) && /PASS\s+rev2 shipping probes defined/.test(selfD) && /no environment file was read/.test(selfD));
// the stale documents
const mf = txt('manifest'); const mf0 = mf.slice(mf.indexOf('## 0. REVISION 2'), mf.indexOf('## 1. Rollback harness'));
t('the Execution Manifest section 0 contains every revision 2 pin: migration candidate, seed, Phase T harness, dry harness, allow-list file and its statements-only hash', [PIN.migRev2, PIN.seed, PIN.tRev2, PIN.dryRev2, PIN.allow, ALLOW_STATEMENTS_SHA].every((h) => mf0.includes(h)));
t('the manifest preserves the historical hashes as historical records (fbfe6102, ea42dfbf, bfd391c1, 791879b1, 4060fe94 and the old allow-list 21c041bd) and labels sections 1 and 2 as revision 1 / historical', ['fbfe61023157bb7102e134063d4c0aee557d1fa0b4c3da2f5835a8cc692035eb', 'ea42dfbf', PIN.migOrig, '791879b1', '4060fe94', PIN.allowHist].every((h) => mf.includes(h)) && /## 1\. Rollback harness — REVISION 1 \(historical/.test(mf) && /## 2\. Approved artifacts — REVISION 1 \(historical/.test(mf));
t('the manifest states that no revision 2 artifact has been executed and that earlier approvals do not extend to it; the commands pin the revised harness hashes', /Nothing in revision 2 has been executed/.test(mf0) && /Approvals for earlier runs do not extend to revision 2/.test(mf0) && mf0.includes(`--harness-sha ${PIN.dryRev2}`) && mf0.includes(`--harness-sha ${PIN.tRev2}`) && !/--harness-sha fbfe6102/.test(mf0));
t('the manifest run history is accurate and does not imply earlier runs used revision 2: the P0 pass and the 269/19 Phase T run are attributed to harness fbfe6102 and the ORIGINAL migration', /Harness `fbfe6102…`, P0 run 2[^\n]*passed 42 of 42/.test(mf0) && /Phase T run \(original migration `bfd391c1…`\)[^\n]*269 passed, 19 FAILED/.test(mf0) && /Revision 2 artifacts \(section 0\.1\) \| offline checks only \| none/.test(mf0));

// ---------------------------------------------------------------- G. FINAL SAFETY REVIEW (static checks + tamper tests; every child process is an offline mode)
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const envNoDb = { ...process.env }; delete envNoDb.P2_DATABASE_URL;
const run = (file, args) => spawnSync('node', [file, ...args], { encoding: 'utf8', env: envNoDb, timeout: 60000 });
const tmp = mkdtempSync(`${tmpdir()}/p3rev2-`);
try {
  // G1. tampered inputs: the harnesses stop (exit 3) BEFORE any connection when the migration or the seed differs by one byte
  const tamperedMig = `${tmp}/migration.rev2.sql`.replace(/\\/g, '/'); writeFileSync(tamperedMig, txt('migRev2') + '\n-- one extra byte\n');
  const tamperedSeed = `${tmp}/seed.sql`.replace(/\\/g, '/'); writeFileSync(tamperedSeed, rd(F.seed).toString('utf8') + '\n-- one extra byte\n');
  for (const [label, key] of [['dry-execution harness', 'dryRev2'], ['Phase T harness', 'tRev2']]) {
    const base = txt(key); const migPath = "'supabase/review/p3/20261110000100_p3_catalog_pricing_orders.rev2.sql'"; const seedPath = "'supabase/review/p3/seed-products.sql'";
    const mk = (name, body) => { const f = `${tmp}/${name}`.replace(/\\/g, '/'); writeFileSync(f, body); return f; };
    const withMig = base.replace(`join(root, ${migPath})`, `'${tamperedMig}'`); const withSeed = base.replace(`join(root, ${seedPath})`, `'${tamperedSeed}'`);
    t(`${label}: the tamper test is meaningful (the path substitutions applied)`, withMig !== base && withSeed !== base);
    const r1 = run(mk(`${key}-mig.mjs`, withMig), ['--offline-selftest']); const r2 = run(mk(`${key}-seed.mjs`, withSeed), ['--offline-selftest']);
    t(`${label}: a migration that differs by one byte stops BEFORE any connection (exit 3, FAIL on the migration pin)`, r1.status === 3 && /FAIL\s+migration sha256/.test(r1.stdout) && /nothing was executed/.test(r1.stdout), `exit ${r1.status}`);
    t(`${label}: a seed that differs by one byte stops BEFORE any connection (exit 3, FAIL on the seed pin)`, r2.status === 3 && /FAIL\s+seed sha256/.test(r2.stdout) && /nothing was executed/.test(r2.stdout), `exit ${r2.status}`);
    // a harness file that differs by one byte cannot be run in connection mode with the approved hash
    const approved = PIN[key]; const modified = mk(`${key}-modified.mjs`, base + '\n// one extra byte\n');
    const flagsFor = (h) => (key === 'dryRev2' ? ['--authorized-rolled-back-execution', '--harness-sha', h] : ['--phase', 'p0', '--authorized-rolled-back-execution', '--harness-sha', h]);
    const r3 = run(modified, flagsFor(approved));
    t(`${label}: a modified harness file is refused in connection mode even with the approved hash (exit 2, before any environment read or connection)`, r3.status === 2 && /REFUSING/.test(r3.stdout) && !/BEFORE snapshot|STOP: P2_DATABASE_URL/.test(r3.stdout), `exit ${r3.status}`);
    const r4 = run(`${root}/${F[key]}`, flagsFor('0'.repeat(64)));
    t(`${label}: the genuine file with a wrong --harness-sha is refused (exit 2)`, r4.status === 2 && /REFUSING/.test(r4.stdout), `exit ${r4.status}`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

// G2. statements: nothing outside the allow-list (Phase T) or the original dry-harness statement set (dry run); the added dry-run SQL is SELECT only
const mutLits = (s) => [...s.matchAll(/(['"`])((?:insert\s+into|update\s+public|delete\s+from|truncate\s)[^\n]*?)\1/gi)].map((m) => m[2].replace(/\s+/g, ' ').trim()).sort();
const mutOrig = mutLits(txt('dryOrig')); const mutRev2 = mutLits(txt('dryRev2'));
t(`the set of mutating SQL literals in the rev2 dry harness equals the original dry harness (${mutOrig.length}: the in-transaction idempotency probe, constraint probes that roll back to a savepoint); no mutating statement was added`, mutOrig.length > 0 && JSON.stringify(mutOrig) === JSON.stringify(mutRev2));
const addedSql = [...txt('dryRev2').matchAll(/tx\.query\(`([^`]*)`|tx\.query\('([^']*)'|asRole\('[a-z]+', [^,]+, `([^`]*)`/g)].map((m) => (m[1] ?? m[2] ?? m[3]).trim()).filter((q) => /shop_ship_to_ok|rpc_checkout/.test(q));
t('every SQL text added to the rev2 dry harness is a single SELECT (the private validator or rpc_checkout as a non-member; no data is created)', addedSql.length >= 3 && addedSql.every((q) => /^select\b/i.test(q)) && !addedSql.some((q) => /\b(insert|update|delete|truncate|create|drop|alter|grant|commit)\b/i.test(q)), `${addedSql.length} statements`);
t('the Phase T harness sends SQL only through Q() (116 allow-listed statements), apart from the two hash-pinned files; the rev2 diff adds no SQL registration (statement lines identical, count 116)', aRev2.length === 116 && ((txt('tRev2').match(/\breg\('/g) ?? []).length === (txt('tOrig').match(/\breg\('/g) ?? []).length));

// G3. no external side effect or non-transactional statement can be issued by the migration, the seed or the harnesses
const SQLISH = [['migration candidate', txt('migRev2')], ['seed', txt('seed')], ['dry harness', txt('dryRev2')], ['Phase T harness', txt('tRev2')]];
const FORBID = [/\bcreate\s+index\s+concurrently\b/i, /\balter\s+type\b[^;\n]*\badd\s+value\b/i, /\bvacuum\b/i, /\balter\s+system\b/i, /\bcreate\s+(database|tablespace|extension|subscription|publication)\b/i, /\b(listen|notify)\s+\w/i, /\bpg_notify\b/i, /\bdblink\b/i, /\bnet\.http/i, /\bpg_net\b/i, /\bcopy\b[^;\n]*\b(program|to\s+'|from\s+'|stdout)/i, /\bpg_advisory_lock\s*\(/i, /\bpg_advisory_lock_shared\s*\(/i, /\bdrop\s+(database|role|extension)\b/i, /\bcreate\s+role\b/i, /\binsert\s+into\s+supabase_migrations/i, /supabase\s+db\s+push/i, /\blo_(import|export|create)\b/i, /\bpg_read_file\b|\bpg_ls_dir\b/i, /\bpg_terminate_backend|\bpg_cancel_backend/i, /\bselect\s+pg_sleep\b/i];
for (const [label, s] of SQLISH) {
  const isSql = label === 'migration candidate' || label === 'seed';
  const code = s.split('\n').filter((l) => !/^\s*(--|\/\/)/.test(l)).join('\n').replace(isSql ? /--.*$/gm : /\/\/.*$/gm, '').replace(/(rep|ck|note|blk|skip)\('[^']*'|(rep|ck|note|blk|skip)\(`[^`]*`/g, '$1(');
  const hits = FORBID.filter((re) => re.test(code)).map((re) => String(re).slice(0, 40));
  t(`${label}: no non-transactional statement, notification, external call, session-level lock, extension, role or migration-history write`, hits.length === 0, hits.join(' | '));
}
const seqUse = [...txt('migRev2').matchAll(/\b(nextval|setval|currval)\s*\(\s*'([^']*)'/gi)].map((m) => m[2]);
t('the only sequence the migration touches is the one it creates itself (order_number_seq, dropped with the rollback); no pre-existing sequence is advanced', seqUse.every((x) => /order_number_seq/.test(x)) && /create sequence public\.order_number_seq/i.test(txt('migRev2')), seqUse.join(','));
t('session-level SET is never used: every SET statement in the harnesses is "set local" (the transaction-scoped form)', ['dryRev2', 'tRev2'].every((k) => !/['"`]set (?!local)/i.test(txt(k))));
t('in the dry harness the migration, the seed and every probe run on the single transaction connection tx; the only other connections only SELECT snapshots (before and after)', /tx = await connect\(\); await tx\.query\('begin isolation level read committed'\)/.test(txt('dryRev2')) && (txt('dryRev2').match(/begin isolation level/g) ?? []).length === 1 && !/c0\.query\([^)]*\b(insert|update|delete)\b/i.test(txt('dryRev2')) && !/c1\.query\([^)]*\b(insert|update|delete)\b/i.test(txt('dryRev2')));

// G4. the fresh-connection verification covers P1/P2 state, P3 objects, fixtures, seed rows, sequences and migration history
const keysOf = (s, re) => [...s.matchAll(re)].map((m) => m[1]);
const dryKeys = keysOf(txt('dryRev2'), /^\s*S\.(\w+)\s*=/gm).concat(['auth', 'rowDigests']).filter((v, i, a) => a.indexOf(v) === i);
t('dry harness snapshot covers: version, functions, relations, columns, constraints, policies, triggers, row counts, row digests of P1/P2 tables, schema ACLs, default ACLs, schemas, auth digests, migration history, sequences, advisory locks', ['version', 'functions', 'relations', 'columns', 'constraints', 'policies', 'triggers', 'rowCounts', 'rowDigests', 'schemaAcl', 'defaultAcl', 'schemas', 'auth', 'history', 'sequences', 'advisoryLocks'].every((k) => dryKeys.includes(k)), dryKeys.join(','));
t('dry harness AFTER check: every snapshot key is compared on a fresh connection, and a separate check asserts that no P3 table, sequence (order_number_seq), function, policy, trigger or seed row remains and the history is the same four versions', /for \(const k of Object\.keys\(before\)\)/.test(txt('dryRev2')) && /'order_number_seq'/.test(txt('dryRev2')) && /after\.history\.length === 4/.test(txt('dryRev2')) && /P3_TABLES, 'order_number_seq'/.test(txt('dryRev2')));
t('Phase T harness AFTER check: fresh connection, every snapshot compared, the reserved fixture namespace (users, factors, orgs, profiles, audit) is empty, no P3 object exists and the history is the same four versions', /compareSnapshots\(before, after, 'AFTER ROLLBACK \(fresh connection\)'\)/.test(txt('tRev2')) && /Object\.values\(ns1\)\.every\(\(n\) => n === 0\)/.test(txt('tRev2')) && /after\.history\.length === 4/.test(txt('tRev2')) && /const c1 = await connect\(\)/.test(txt('tRev2')));
t('both harnesses run the fresh-connection verification in a finally block (also after an abort) and issue the rollback before it', ['dryRev2', 'tRev2'].every((k) => /finally \{/.test(txt(k)) && /rollback/.test(txt(k)) && txt(k).indexOf('finally {') < txt(k).indexOf('const c1 = await connect()')));
t('the rollback is explicit and also issued after an error: (dry) tx.query(rollback) in finally; (Phase T) tx.query(rollback) in catch plus S_ROLLBACK on success', /await tx\.query\('rollback'\)/.test(txt('dryRev2')) && /await tx\.query\('rollback'\)/.test(txt('tRev2')) && /Q\(tx, S_ROLLBACK\)/.test(txt('tRev2')));

// G5. credentials and environment access
for (const k of ['dryRev2', 'tRev2']) {
  const s = txt(k); const envFiles = [...s.matchAll(/['"`](\.env[\w.\-]*)['"`]/g)].map((m) => m[1]);
  const envReads = (s.match(/readFileSync\(join\(root, '\.env\.local'\)/g) ?? []).length;
  t(`${F[k]}: the only environment file ever named is .env.local, read once, behind --authorized-read-env-local, and only the P2_DATABASE_URL line is kept`, envReads === 1 && envFiles.every((e) => e === '.env.local') && /flag\('--authorized-read-env-local'\)|process\.argv\.includes\('--authorized-read-env-local'\)/.test(s) && /\^\\s\*\(export\\s\+\)\?P2_DATABASE_URL\\s\*=/.test(s), `${envReads} read, names: ${[...new Set(envFiles)].join(',')}`);
  t(`${F[k]}: the only process.env variable read is P2_DATABASE_URL; the URL, its password and the secrets list are never passed to console.log, note or rep; messages go through clean()`, [...s.matchAll(/process\.env\.(\w+)/g)].every((m) => m[1] === 'P2_DATABASE_URL') && !/(console\.log|note|rep)\([^;]*\b(secrets|U\.password|U\.href|connectionString)\b/.test(s) && /const clean = /.test(s) && /postgres\(ql\)\?:\\\/\\\//.test(s));
  t(`${F[k]}: no TLS weakening: no rejectUnauthorized false, no NODE_TLS_REJECT_UNAUTHORIZED, no sslmode override`, !/rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|sslmode\s*=\s*(disable|allow|prefer|require)\b/.test(s));
}

console.log(bad === 0 ? 'all artifact-set checks pass' : `${bad} FAILED`); process.exit(bad ? 1 : 0);
