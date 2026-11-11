// CHAIN APPLY HARNESS (P5 to P9). Executes the five new migrations, IN ORDER, in ONE READ COMMITTED transaction against the hosted development project (ref semtmllmwhxznxechfsk), writes their migration-history
// rows, verifies everything read-only, and then ROLLS BACK ("rehearsal") or, only in an explicitly confirmed commit mode, COMMITS. It reuses the proven building blocks of apply-p3.mjs (target and CA pinning, strict TLS
// from URL components, redaction, history-table handling, snapshot/diff).
//
// MODES (mutually exclusive):
//   rehearsal  --authorized-rolled-back-execution [--source draft|promoted]   run the chain + history rows + verification, then ROLLBACK, then a fresh-connection proof that nothing persisted
//   commit     --authorized-persistent-apply --approval-ref <ref> --commit-confirm chain-apply:<chain sha 12>:<this file's sha 12>   (always uses the PROMOTED files, which must be byte-identical to the drafts)
// Always required to connect: --harness-sha <this file's sha256> and credentials via --authorized-read-env-local (the single P2_DATABASE_URL line, read in memory, never printed) or P2_DATABASE_URL in the environment.
//
// SAFETY MODEL: strict TLS with the pinned CA; every statement goes through send() (exact-text allow-list plus the five migration files) BEFORE it is sent; exactly one site can send COMMIT; no retry anywhere; the verification
// is READ-ONLY; pre-state gates run on a fresh connection and again inside the transaction after an advisory lock; an ambiguous COMMIT is never retried or repaired. A failing migration aborts the transaction (nothing persists).
import { readFileSync, appendFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PINS as P3, EXIT, sha, setSecrets, clean, makeReporter, SQL as SQL3, checkTarget, buildClientConfig, assertTls, historyPlan, snapshot, diff } from './apply-p3.mjs';

const ROOT = 'D:/99puritywholesale-platform/99puritywholesale';
const SCRATCH = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/cbe1b851-01c2-43b3-85ae-39723a514ceb/scratchpad';
const norm = (s) => s.replace(/\s+/g, ' ').trim();

export const CHAIN = [
  { n: 'p5', version: '20261111000200', name: 'p5_fulfillment_onboarding', file: '20261111000200_p5_fulfillment_onboarding.sql', draft: 'supabase/review/p5/20261111000200_p5_fulfillment_onboarding.sql' },
  { n: 'p6', version: '20261111000300', name: 'p6_api_integrations', file: '20261111000300_p6_api_integrations.sql', draft: 'supabase/review/p6/20261111000300_p6_api_integrations.sql' },
  { n: 'p7', version: '20261111000400', name: 'p7_inventory_warehouse', file: '20261111000400_p7_inventory_warehouse.sql', draft: 'supabase/review/p7/20261111000400_p7_inventory_warehouse.sql' },
  { n: 'p8', version: '20261111000500', name: 'p8_admin_operations', file: '20261111000500_p8_admin_operations.sql', draft: 'supabase/review/p8/20261111000500_p8_admin_operations.sql' },
  { n: 'p9', version: '20261111000600', name: 'p9_aftersales', file: '20261111000600_p9_aftersales.sql', draft: 'supabase/review/p9/20261111000600_p9_aftersales.sql' },
];
const P4 = { version: '20261111000100', name: 'p4_invoices_payments_wallet', file: '20261111000100_p4_invoices_payments_wallet.sql', sha: '97941a128db8d932c40d94d3c9a04599afa2a3d8ca37b6c0bf5eeeecdc9fcbe6' };
export const PINS = {
  ref: P3.ref, caFile: P3.caFile, caSha256: P3.caSha256,
  priorMigrations: { ...P3.priorMigrations, [P3.migrationName]: P3.migrationSha, [P4.file]: P4.sha },
  priorHistory: [...P3.priorHistory, [P3.newVersion, P3.newName], [P4.version, P4.name]],
  hashesFile: 'supabase/migration-hashes.txt',
};
export { EXIT, sha };

// Names that must not exist before the chain (a sample of each migration's tables): the chain refuses to run on a database that already has any of them.
export const NEW_TABLES = ['documents', 'onboarding_instances', 'sku_mappings', 'api_keys', 'webhook_endpoints', 'warehouses', 'inventory_movements', 'organization_applications', 'fee_schedules', 'certificates', 'commission_entries', 'email_outbox'];
export const ANON_FIVE = ['rpc_api_order_create', 'rpc_api_order_get', 'rpc_api_orders_list', 'rpc_worker_claim_deliveries', 'rpc_worker_record_result'];

const GENERIC = ['claims', 'roleAuth', 'roleAnon', 'roleReset', 'begin', 'tl_idle', 'tl_stmt', 'tl_lock', 'commit', 'rollback', 'sp', 'spr', 'spx', 'histCols', 'histRowsNoStmt', 'histRowsStmt', 'histInsert2', 'histInsert3', 'presentRel',
  'sVersion', 'sFunctions', 'sRelations', 'sColumns', 'sConstraints', 'sPolicies', 'sTriggers', 'sRowCounts', 'sSchemaAcl', 'sDefaultAcl', 'sSchemas', 'sHistory', 'sSequences', 'sAdvisory'];
export const SQL = {};
for (const k of GENERIC) { if (!(k in SQL3)) throw new Error(`apply-chain: expected statement ${k} in apply-p3`); SQL[k] = SQL3[k]; }
for (const [k, v] of Object.entries(SQL3)) if (k.startsWith('digest:') || k.startsWith('auth:')) SQL[k] = v;
Object.assign(SQL, {
  advisory: "select pg_advisory_xact_lock(hashtextextended('chain-p5-p9-apply', 0))",
  anonFns: "select coalesce(array_agg(p.proname::text order by p.proname), '{}') as names from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')",
  noRlsTables: "select coalesce(array_agg(c.relname::text order by c.relname), '{}') as names from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity",
  apiPrivTables: `select coalesce(array_agg(c.relname::text order by c.relname), '{}') as names from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = any($1::text[])
                    and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger') or has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate, references, trigger') or has_table_privilege('service_role', c.oid, 'select, insert, update, delete, truncate, references, trigger'))`,
  openDefiners: `select coalesce(array_agg(p.proname::text order by p.proname), '{}') as names from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'rpc\\_%'
                   and (not p.prosecdef or not exists (select 1 from unnest(p.proconfig) c where regexp_replace(c, '[\\s"'']', '', 'g') ~* '^search_path=$') or has_function_privilege('service_role', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))`,
  privateExec: `select coalesce(array_agg(p.proname::text order by p.proname), '{}') as names from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`,
  newFnCount: "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'rpc\\_%'",
  unvalidated: "select coalesce(array_agg(conname::text order by conname), '{}') as names from pg_constraint where not convalidated",
  bucketRow: "select count(*)::int as n from storage.buckets b where b.id = 'portal-documents' and b.public = false and b.file_size_limit = 10485760",
  storagePolicies: "select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'portal\\_documents\\_%'",
});
export const ALLOWED = new Map(Object.entries(SQL).map(([id, text]) => [norm(text), id]));
if (ALLOWED.size !== Object.keys(SQL).length) throw new Error('duplicate SQL text in the allow-list');

export function makeSender(migs, log = []) {
  const files = new Map(migs.map((m) => [m.text, `FILE:${m.n}`]));
  return function send(c, text, params) {
    let id = files.get(text);
    if (!id) { id = ALLOWED.get(norm(text)); if (!id) throw new Error('STATEMENT NOT ALLOW-LISTED (refused before sending)'); }
    log.push(id);
    return c.query(text, params);
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ artifacts
const strip = (s) => s.replace(/--[^\n]*/g, '');
export function loadChain({ root = ROOT, source = 'draft' } = {}) {
  const out = []; const t = (n, ok, d = '') => out.push({ n, ok: Boolean(ok), d });
  const read = (rel) => { try { return readFileSync(join(root, rel)); } catch { return null; } };
  const migs = [];
  for (const m of CHAIN) {
    const draft = read(m.draft); const promoted = read(`supabase/migrations/${m.file}`); const buf = source === 'promoted' ? promoted : draft;
    t(`${m.n}: the ${source} file exists`, buf, m.file);
    if (!buf) continue;
    const text = buf.toString('utf8');
    t(`${m.n}: LF only, no transaction control, does not touch supabase_migrations`, !buf.includes(13) && !/\b(commit|rollback|savepoint)\s*;|\bbegin\s*;|\bbegin\s+(transaction|work)\b|supabase_migrations/i.test(strip(text)));
    if (source === 'promoted') t(`${m.n}: promoted file is byte-identical to the reviewed draft`, draft && buf.equals(draft));
    migs.push({ ...m, text, sha: sha(buf) });
  }
  const chainSha = sha(migs.map((m) => `${m.file}:${m.sha}`).join('\n'));
  if (source === 'promoted') {
    const hashes = read(PINS.hashesFile); let listed = null;
    try { listed = Object.fromEntries(hashes.toString('utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)).map(([h, n]) => [n, h])); } catch { /* handled below */ }
    const want = { ...PINS.priorMigrations, ...Object.fromEntries(migs.map((m) => [m.file, m.sha])) };
    t('migration-hashes.txt lists exactly the applied migrations and the five promoted ones with the right hashes', listed && JSON.stringify(Object.entries(listed).sort()) === JSON.stringify(Object.entries(want).sort()));
    let dir = null; try { dir = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort(); } catch { /* handled below */ }
    t('supabase/migrations holds exactly the eleven files', dir && JSON.stringify(dir) === JSON.stringify(Object.keys(want).sort()));
    t('each applied migration still has its recorded hash', Object.entries(PINS.priorMigrations).every(([n, h]) => { const b = read(`supabase/migrations/${n}`); return b && sha(b) === h; }));
  }
  return { ok: out.every((x) => x.ok) && migs.length === CHAIN.length, checks: out, migs, chainSha };
}
export const expectedConfirm = (chainSha, harnessSha) => `chain-apply:${chainSha.slice(0, 12)}:${harnessSha.slice(0, 12)}`;

// ------------------------------------------------------------------------------------------------------------------------------------------------ the run
const noChange = (d) => d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;
const EXPECT_HISTORY = [...PINS.priorHistory.map(([v, n]) => `${v}:${n}`), ...CHAIN.map((m) => `${m.version}:${m.name}`)];
const histRowsEqual = (rows, pairs) => JSON.stringify(rows.map((r) => [String(r.version), String(r.name)])) === JSON.stringify(pairs);
const lineOf = (text, pos) => (Number.isInteger(Number(pos)) && Number(pos) > 0 ? text.slice(0, Number(pos) - 1).split('\n').length : null);

export async function verifyChain(c, send, before, rep, phase) {
  const now = await snapshot(c, send); const d = (k) => diff(before[k], now[k]);
  const fa = d('functions');
  rep(`${phase}: no function was removed`, fa.removed.length === 0, fa.removed.join(', '));
  rep(`${phase}: functions added / changed (for review)`, true, `${fa.added.length} added, ${fa.changed.length} changed: ${fa.changed.map((k) => k.replace(/^public\./, '')).join(', ')}`);
  const rel = d('relations'); rep(`${phase}: no relation was removed`, rel.removed.length === 0, rel.removed.join(', '));
  rep(`${phase}: relations added / changed (for review)`, true, `${rel.added.length} added, ${rel.changed.length} changed: ${rel.changed.join(', ')}`);
  rep(`${phase}: no existing column or constraint was removed`, ['columns', 'constraints'].every((k) => d(k).removed.length === 0), ['columns', 'constraints'].map((k) => d(k).removed.join(',')).join(' | '));
  rep(`${phase}: existing columns / constraints changed (for review)`, true, `columns ${d('columns').changed.join(', ') || 'none'}; constraints ${d('constraints').changed.join(', ') || 'none'}`);
  rep(`${phase}: no existing policy or trigger was removed`, d('policies').removed.length === 0 && d('triggers').removed.length === 0 && d('policies').changed.length === 0);
  rep(`${phase}: default privileges, schema ACLs and the schema list unchanged`, JSON.stringify(before.defaultAcl) === JSON.stringify(now.defaultAcl) && JSON.stringify(before.schemaAcl) === JSON.stringify(now.schemaAcl) && JSON.stringify(before.schemas) === JSON.stringify(now.schemas));
  rep(`${phase}: migration history is the six applied versions plus exactly the five new entries, in order`, JSON.stringify(now.history) === JSON.stringify(EXPECT_HISTORY), now.history.join(','));
  for (const k of Object.keys(before.rowDigests)) rep(`${phase}: unrelated data unchanged: ${k}`, JSON.stringify(before.rowDigests[k]) === JSON.stringify(now.rowDigests[k]));
  for (const k of Object.keys(before.auth)) rep(`${phase}: auth.${k} untouched`, JSON.stringify(before.auth[k]) === JSON.stringify(now.auth[k]));
  const rc = d('rowCounts'); rep(`${phase}: existing table row counts unchanged (new tables may be seeded)`, rc.removed.length === 0 && rc.changed.length === 0, `${rc.changed.join(', ')}`);
  const anon = (await send(c, SQL.anonFns)).rows[0].names;
  rep(`${phase}: the anon-executable public functions are exactly the five key-authenticated RPCs`, JSON.stringify(anon) === JSON.stringify([...ANON_FIVE].sort()), anon.join(','));
  const noRls = (await send(c, SQL.noRlsTables)).rows[0].names; rep(`${phase}: every public table has RLS enabled`, noRls.length === 0, noRls.join(','));
  const added = Object.keys(now.relations).filter((k) => k.startsWith('public.') && !(k in before.relations)).map((k) => k.slice(7));
  const apiPriv = (await send(c, SQL.apiPrivTables, [added])).rows[0].names; rep(`${phase}: none of the ${added.length} relations added by the chain grants any privilege to anon, authenticated or service_role`, apiPriv.length === 0, apiPriv.join(','));
  const open = (await send(c, SQL.openDefiners)).rows[0].names; rep(`${phase}: every public rpc_ function is SECURITY DEFINER with a pinned search_path and no service_role/PUBLIC execute`, open.length === 0, open.join(','));
  const priv = (await send(c, SQL.privateExec)).rows[0].names; const HELPERS = ['has_capability', 'my_org_ids', 'my_owner_org_ids', 'staff_session_ok'];
  rep(`${phase}: the only private functions executable by authenticated are the four helpers that storage policies and RLS must call (has_capability, my_org_ids, my_owner_org_ids, staff_session_ok); none by anon`, priv.every((x) => HELPERS.includes(x)), priv.join(','));
  rep(`${phase}: the private documents bucket exists (not public, 10 MB limit) and the 5 storage policies exist`, (await send(c, SQL.bucketRow)).rows[0].n === 1 && (await send(c, SQL.storagePolicies)).rows[0].n === 5);
  const unv = (await send(c, SQL.unvalidated)).rows[0].names; rep(`${phase}: every constraint added by the chain is validated (unvalidated ones that existed before are listed)`, unv.every((x) => before.unvalidated.includes(x)), `before: ${before.unvalidated.join(',') || 'none'}; now: ${unv.join(',') || 'none'}`);
  rep(`${phase}: public rpc_ function count (for review)`, true, String((await send(c, SQL.newFnCount)).rows[0].n));
  return now;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ scenario context
// The scenario runs INSIDE the rehearsal transaction (so it is always rolled back). It may only run in rehearsal mode. su() runs as the connection owner (setup and direct reads); as() runs ONE statement as a fake
// authenticated or anon caller with the given JWT claims, inside a savepoint, so a refused call never aborts the transaction. Statements that could end or escape the transaction are refused.
const FORBIDDEN = /(commit|begin|savepoint|release|abort|rollback|prepares+transaction|resets+all)|sets+session|alters+system|copy/i;
export function makeScenarioCtx(c, rep) {
  const guard = (sql) => { if (FORBIDDEN.test(sql.replace(/'[^']*'/g, "''"))) throw new Error('scenario statement refused (transaction control)'); };
  const su = async (sql, params = []) => { guard(sql); return (await c.query(sql, params)).rows; };
  const as = async (claims, sql, params = []) => {
    guard(sql);
    await c.query(SQL.sp);
    try {
      await c.query(SQL.claims, [JSON.stringify(claims ?? {})]);
      await c.query(claims && claims.sub ? SQL.roleAuth : SQL.roleAnon);
      const r = await c.query(sql, params);
      await c.query(SQL.roleReset); await c.query(SQL.spx);
      return { ok: true, rows: r.rows, r: r.rows[0]?.r };
    } catch (e) {
      await c.query(SQL.roleReset).catch(() => {}); await c.query(SQL.spr); await c.query(SQL.spx);
      return { ok: false, err: e?.code ?? 'ERR', msg: String(e?.message ?? '').slice(0, 300) };
    }
  };
  // attempt(): run ONE statement that is EXPECTED to fail (for example an update of an append-only table) inside a savepoint; returns the SQLSTATE, or 'none' if it succeeded.
  const attempt = async (sql, params = []) => {
    guard(sql);
    await c.query(SQL.sp);
    try { await c.query(sql, params); await c.query(SQL.spr); await c.query(SQL.spx); return 'none'; } catch (e) { await c.query(SQL.spr); await c.query(SQL.spx); return e?.code ?? 'ERR'; }
  };
  return { su, as, attempt, rep };
}

const takeSnapshot = async (c, send) => { const s = await snapshot(c, send); s.unvalidated = (await send(c, SQL.unvalidated)).rows[0].names; return s; };

export async function runApply(o) {
  const { rep, note } = o.reporter; const send = makeSender(o.migs, o.sqlLog ?? []);
  const out = { outcome: null, exitCode: EXIT.FAILED_ROLLED_BACK, committed: false, persisted: null, commitError: null, failedMigration: null };
  if (o.mode !== 'rehearse' && o.mode !== 'commit') { out.outcome = 'refused_bad_mode'; out.exitCode = EXIT.REFUSED_PRECHECK; return out; }
  if (o.mode === 'commit' && (!o.confirm || o.confirm !== o.expectedConfirm)) { rep('commit mode needs the exact --commit-confirm string', false); out.outcome = 'refused_commit_confirmation'; out.exitCode = EXIT.REFUSED_PRECHECK; return out; }
  let before = null; let tx = null; let txOpen = false; let commitSent = false; let plan = null; let gatesOk = false;
  const sig = () => { if (txOpen && !commitSent && tx) { try { tx.end(); } catch { /* the server rolls back an abandoned transaction */ } } process.exit(130); };
  if (o.handleSignals) { process.once('SIGINT', sig); process.once('SIGTERM', sig); }
  const stateGates = async (c, label) => {
    const cols = (await send(c, SQL.histCols)).rows; const p0 = historyPlan(cols, []);
    const rows = (await send(c, p0.hasStatements ? SQL.histRowsStmt : SQL.histRowsNoStmt)).rows; plan = historyPlan(cols, rows);
    rep(`${label}: migration history table has the expected shape and the harness can fill it (${plan.variant ?? 'n/a'})`, plan.ok, plan.reason ?? '');
    if (!plan.ok) return 'refused_history_schema';
    if (rows.some((r) => CHAIN.some((m) => String(r.version) === m.version))) { rep(`${label}: none of the five new migration versions is already applied`, false, 'duplicate execution refused'); return 'refused_already_applied'; }
    rep(`${label}: migration history is exactly the six applied versions and names`, histRowsEqual(rows, PINS.priorHistory), rows.map((r) => `${r.version}:${r.name}`).join(','));
    if (!histRowsEqual(rows, PINS.priorHistory)) return 'refused_history_mismatch';
    const n = (await send(c, SQL.presentRel, [NEW_TABLES])).rows[0].n;
    rep(`${label}: none of the new tables exists yet`, n === 0, `${n} present`);
    return n === 0 ? null : 'refused_objects_exist';
  };
  try {
    let c0; try { c0 = await o.connect(); } catch (e) { rep('connection with strict TLS and the pinned CA', false, `error code ${e?.code ?? 'ERR'}`); out.outcome = 'refused_connect'; out.exitCode = EXIT.REFUSED_CONNECT; return out; }
    try { const refusal = await stateGates(c0, 'PRE-STATE'); if (refusal) { out.outcome = refusal; out.exitCode = EXIT.REFUSED_STATE; return out; } before = await takeSnapshot(c0, send); gatesOk = true; note('BEFORE snapshot taken (fresh connection, read-only)'); }
    finally { await c0.end().catch(() => {}); }
    tx = await o.connect(); await send(tx, SQL.begin); txOpen = true; await send(tx, SQL.tl_idle); await send(tx, SQL.tl_stmt); await send(tx, SQL.tl_lock);
    await send(tx, SQL.advisory);
    const refusal = await stateGates(tx, 'IN-TX RE-CHECK');
    if (refusal) { await send(tx, SQL.rollback); txOpen = false; out.outcome = refusal.replace('refused_', 'refused_in_tx_'); out.exitCode = EXIT.REFUSED_STATE; }
    else {
      note('transaction open (READ COMMITTED); executing the five migrations in order, each followed by its history entry');
      for (const m of o.migs) {
        out.failedMigration = m.n;
        try { await send(tx, m.text); } catch (e) {
          const line = lineOf(m.text, e?.position);
          rep(`${m.n}: MIGRATION executed in PostgreSQL`, false, `${clean(e?.code ?? 'ERR')} ${clean(e?.message ?? '').slice(0, 400)}${line ? ` (file line ${line})` : ''}${e?.where ? ` | where: ${clean(e.where).split('\n')[0].slice(0, 200)}` : ''}${e?.detail ? ` | detail: ${clean(e.detail).slice(0, 200)}` : ''}${e?.hint ? ` | hint: ${clean(e.hint).slice(0, 200)}` : ''}`);
          throw e;
        }
        rep(`${m.n}: MIGRATION executed in PostgreSQL (its own self-check DO block passed)`, true, m.sha.slice(0, 12));
        if (plan.variant === 'histInsert3') await send(tx, SQL.histInsert3, [m.version, m.name, [m.text]]); else await send(tx, SQL.histInsert2, [m.version, m.name]);
        rep(`${m.n}: migration history entry inserted`, true, `${m.version} ${m.name}`);
        out.failedMigration = null;
      }
      const failBefore = o.reporter.failed();
      await verifyChain(tx, send, before, rep, 'in-tx');
      const verified = o.reporter.failed() === failBefore;
      if (!verified) { await send(tx, SQL.rollback); txOpen = false; rep('in-transaction verification failed: ROLLBACK issued, nothing committed', null); out.outcome = 'rolled_back_verification_failed'; out.exitCode = EXIT.FAILED_ROLLED_BACK; }
      else if (o.mode === 'rehearse' && o.scenario) {
        note('SCENARIO: running inside the same transaction (always rolled back)');
        const sf = o.reporter.failed();
        try { await o.scenario(makeScenarioCtx(tx, rep)); } catch (e) { rep('SCENARIO aborted by an unexpected error', false, `${clean(e?.code ?? 'ERR')} ${clean(e?.message ?? '').slice(0, 300)}`); }
        await send(tx, SQL.rollback); txOpen = false;
        out.scenarioFailures = o.reporter.failed() - sf;
        rep('SCENARIO finished; ROLLBACK issued (nothing committed)', null); out.outcome = out.scenarioFailures ? 'rehearsal_scenario_failed' : 'rehearsal_rolled_back'; out.exitCode = out.scenarioFailures ? EXIT.FAILED_ROLLED_BACK : EXIT.OK;
      }
      else if (o.mode === 'rehearse') { await send(tx, SQL.rollback); txOpen = false; rep('REHEARSAL: all five migrations executed and every in-transaction check passed; ROLLBACK issued (nothing committed)', null); out.outcome = 'rehearsal_rolled_back'; out.exitCode = EXIT.OK; }
      else {
        // THE ONLY COMMIT SITE: commit mode, confirmed, every in-transaction check passed. No retry.
        note('COMMIT sent'); commitSent = true;
        try { await send(tx, SQL.commit); out.committed = true; txOpen = false; } catch (e) { out.commitError = e?.code ?? 'ERR'; txOpen = false; }
      }
    }
  } catch (e) {
    note(`ERROR during the transaction: ${clean(e?.code ?? 'ERR')} ${clean(e?.message ?? '').slice(0, 300)}`);
    if (txOpen && !commitSent && tx) { try { await send(tx, SQL.rollback); note('ROLLBACK issued (after error)'); } catch { note('rollback after error failed (the server aborts an abandoned transaction)'); } txOpen = false; }
    out.outcome = out.outcome ?? 'rolled_back_error'; out.exitCode = commitSent ? EXIT.COMMIT_AMBIGUOUS : EXIT.FAILED_ROLLED_BACK;
  } finally {
    if (tx) await tx.end().catch(() => {});
    if (o.handleSignals) { process.removeListener('SIGINT', sig); process.removeListener('SIGTERM', sig); }
  }
  if (!gatesOk || !before) return out;
  let c1 = null;
  try {
    c1 = await o.connect();
    const hrows = (await send(c1, SQL.sHistory)).rows; const persisted = hrows.some((r) => CHAIN.some((m) => String(r.version) === m.version)); out.persisted = persisted;
    if (out.committed || (commitSent && persisted)) {
      if (!out.committed) out.commitError = out.commitError ?? 'ERR';
      const f0 = o.reporter.failed(); await verifyChain(c1, send, before, rep, 'post-commit');
      const ok = o.reporter.failed() === f0;
      if (out.committed) { out.outcome = ok ? 'committed_verified' : 'committed_verification_failed'; out.exitCode = ok ? EXIT.OK : EXIT.COMMITTED_BUT_UNVERIFIED; if (!ok) note('COMMITTED but post-commit verification FAILED: nothing is cleaned up automatically'); }
      else { out.outcome = ok ? 'commit_error_but_persisted_verified' : 'commit_error_but_persisted_unverified'; out.exitCode = EXIT.COMMIT_AMBIGUOUS; note('the COMMIT reported an error but the state IS persisted'); }
    } else {
      const after = await takeSnapshot(c1, send); const fa0 = o.reporter.failed();
      for (const k of Object.keys(before)) {
        const isMap = before[k] && typeof before[k] === 'object' && !Array.isArray(before[k]); const dd = isMap ? diff(before[k], after[k]) : null;
        const same = isMap ? noChange(dd) : JSON.stringify(before[k]) === JSON.stringify(after[k]);
        if (k === 'advisoryLocks') continue;
        if (k === 'sequences' && o.scenario) { rep(`AFTER (fresh connection): sequences may have advanced (they are not transactional); changed: ${(dd?.changed ?? []).join(', ') || 'none'}; added: ${(dd?.added ?? []).length}; removed: ${(dd?.removed ?? []).length}`, (dd?.added ?? []).length === 0 && (dd?.removed ?? []).length === 0); continue; }
        rep(`AFTER (fresh connection): ${k} identical to BEFORE`, same);
      }
      const n = (await send(c1, SQL.presentRel, [NEW_TABLES])).rows[0].n;
      const clean0 = n === 0 && !persisted && after.history.length === PINS.priorHistory.length;
      rep('AFTER (fresh connection): no new table and no new history entry persisted', clean0, `${n} new tables present`);
      const afterOk = clean0 && o.reporter.failed() === fa0;
      if (commitSent) { out.outcome = 'commit_error_not_persisted_verified_clean'; out.exitCode = afterOk ? EXIT.COMMIT_AMBIGUOUS : EXIT.INCONSISTENT; }
      else if (!afterOk) { out.outcome = 'rollback_not_verified_clean'; out.exitCode = EXIT.INCONSISTENT; note('the fresh-connection comparison after the rollback is NOT identical: investigate before any further step'); }
    }
  } catch (e) { rep('fresh-connection verification', false, `error code ${e?.code ?? 'ERR'}`); out.exitCode = commitSent || out.committed ? EXIT.COMMITTED_BUT_UNVERIFIED : EXIT.INCONSISTENT; out.outcome = (out.outcome ?? 'unknown') + '+fresh_verification_error'; }
  finally { if (c1) await c1.end().catch(() => {}); }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ CLI
function cliMain() {
  const argv = process.argv.slice(2); const flag = (n) => argv.includes(n); const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const LOG = `${SCRATCH}/apply-chain-log.txt`; const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const RESULT = (mode) => `${SCRATCH}/chain-apply-result-${mode}-${stamp}.json`;
  const note = (s) => { console.log(s); try { appendFileSync(LOG, s + '\n'); } catch { /* best effort */ } };
  const reporter = makeReporter(note); const { rep } = reporter;
  const selfSha = sha(readFileSync(fileURLToPath(import.meta.url)));
  const commit = flag('--authorized-persistent-apply'); const rehearse = flag('--authorized-rolled-back-execution');
  if (commit && rehearse) { console.log('REFUSING: --authorized-persistent-apply and --authorized-rolled-back-execution are mutually exclusive'); return 2; }
  if (!commit && !rehearse) { console.log('REFUSING: needs --authorized-rolled-back-execution (rehearsal) or --authorized-persistent-apply (commit)'); return 2; }
  if (opt('--harness-sha') !== selfSha) { console.log(`REFUSING: --harness-sha must equal the sha256 of this harness file (${selfSha})`); return 2; }
  if (commit && (!opt('--approval-ref') || opt('--approval-ref').length < 4)) { console.log('REFUSING: commit mode needs --approval-ref'); return 2; }
  const source = commit ? 'promoted' : (opt('--source') ?? 'draft');
  const scenarioArg = opt('--scenario');
  if (commit && scenarioArg) { console.log('REFUSING: a scenario never runs in commit mode'); return 2; }
  if (source !== 'draft' && source !== 'promoted') { console.log('REFUSING: --source must be draft or promoted'); return 2; }
  const art = loadChain({ source }); for (const x of art.checks) rep(x.n, x.ok, x.d);
  rep('this harness file has a recorded sha256 (printed for the approval)', true, selfSha);
  rep(`the chain hash (the five ${source} migrations, in order)`, true, art.chainSha);
  for (const m of art.migs) rep(`${m.n} sha256`, true, m.sha);
  if (!art.ok) { note('STOP: artifact verification failed; nothing was executed'); return 3; }
  const mode = commit ? 'commit' : 'rehearse'; const confirm = opt('--commit-confirm'); const exp = expectedConfirm(art.chainSha, selfSha);
  if (commit && confirm !== exp) { rep('commit mode needs the exact --commit-confirm string', false); note('STOP: commit confirmation missing or wrong; nothing was executed'); return 2; }
  let scenario = null;
  if (scenarioArg) { const p = join(ROOT, scenarioArg); const sbuf = readFileSync(p); rep('scenario file sha256 (it only ever runs inside the rolled-back rehearsal)', true, sha(sbuf)); scenario = { url: pathToFileURL(p).href }; }
  let v = process.env.P2_DATABASE_URL ?? '';
  if (!v && flag('--authorized-read-env-local')) { const line = readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); } }
  if (!v) { console.log('STOP: P2_DATABASE_URL not set and --authorized-read-env-local not given'); return 2; }
  const pem = readFileSync(PINS.caFile, 'utf8'); const tg = checkTarget(v, pem, PINS); setSecrets(tg.secrets ?? [v]);
  for (const x of tg.checks) rep(x.n, x.ok);
  if (!tg.ok) { note('STOP: target or CA check failed; nothing was executed'); return 3; }
  const pg = createRequire(join(ROOT, 'package.json'))('pg');
  const connect = async () => { const k = new pg.Client({ ...buildClientConfig(tg), application_name: 'chain-apply' }); await k.connect(); try { assertTls(k); } catch (e) { await k.end().catch(() => {}); throw e; } return k; };
  return { run: async () => {
    const scenarioFn = scenario ? (await import(scenario.url)).default : null;
    const res = await runApply({ mode, connect, migs: art.migs, reporter, confirm, expectedConfirm: exp, handleSignals: true, scenario: scenarioFn });
    note(`chain apply (${mode}, ${source}): ${reporter.results.filter((r) => r.ok === true).length} passed, ${reporter.failed()} FAILED; outcome ${res.outcome}; failed migration ${res.failedMigration ?? 'none'}; committed ${res.committed}; exit ${res.exitCode}`);
    try { writeFileSync(RESULT(mode), JSON.stringify({ harness: 'apply-chain.mjs', mode, source, harnessSha: selfSha, chainSha: art.chainSha, approvalRef: opt('--approval-ref') ?? null, outcome: res.outcome, committed: res.committed, persisted: res.persisted, exitCode: res.exitCode, results: reporter.results }, null, 1), { flag: 'wx' }); } catch { /* best effort */ }
    return res.exitCode;
  } };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const r = cliMain();
  if (typeof r === 'number') process.exitCode = r; else if (r?.run) process.exitCode = await r.run();
}
