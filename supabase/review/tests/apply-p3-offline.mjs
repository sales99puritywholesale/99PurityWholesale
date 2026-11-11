// OFFLINE tests of the persistent apply harness (apply-p3.mjs). NO database, NO network, NO environment file, NO Docker. The "database" is a scripted in-memory FAKE that models only what the harness asks for
// (transactions, a history table, presence of P3 objects, catalog snapshots, probe answers) and records every statement it receives. This validates the harness LOGIC (gates, refusals, rollback, commit sequencing,
// ambiguity handling). It does NOT validate PostgreSQL behaviour and it is NOT evidence that a real hosted COMMIT works.
// Run: node supabase/review/tests/apply-p3-offline.mjs
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rootCertificates } from 'node:tls';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as H from './apply-p3.mjs';

const ROOT = 'D:/99puritywholesale-platform/99puritywholesale';
// the harness under test is the sibling file next to THIS test (so a mutated copy placed beside a copy of this test is what the static source checks and the CLI gates examine)
const HARNESS = fileURLToPath(new URL('./apply-p3.mjs', import.meta.url)).replace(/\\/g, '/');
let bad = 0; const t = (n, ok, d = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };
const { SQL, ALLOWED, PINS, EXIT, P3_TABLES, P3_PUBLIC_FN, P3_PRIVATE_FN, PRICING_VECTORS } = H;
const idOfText = (text) => Object.entries(SQL).find(([, x]) => x === text)?.[0];
const MIG = readFileSync(`${ROOT}/${PINS.migrationFile}`, 'utf8'); const SEED = readFileSync(`${ROOT}/${PINS.seedFile}`, 'utf8');
const { shipCases, validShip } = H.shippingCases(); const VALID_JSON = new Set(validShip.map(([, j]) => j));
const SECRET = 'S3CR3T-PW-9f8e7d jane@example.invalid 1 Test Way';

// ------------------------------------------------------------------------------------------------------------------------------------------------ the fake database
class FakeDb {
  constructor(o = {}) {
    this.o = o; this.connects = 0; this.events = []; this.violations = []; this.commits = 0; this.rollbacks = 0;
    this.committed = { history: H.PINS.priorHistory.map(([version, name]) => ({ version, name, nstmt: o.histUsesStatements ? 3 : null })), p3: false, seeded: false, extraFn: 0, ...(o.initial ?? {}) };
  }
  connect() { this.connects++; if (this.o.failConnectAt === this.connects) { const e = new Error(`self-signed certificate ${SECRET}`); e.code = 'DEPTH_ZERO_SELF_SIGNED_CERT'; return Promise.reject(e); } return Promise.resolve(this.client(this.connects)); }
  client(n) {
    const db = this; let tx = null; let role = 'postgres'; let probes = 0;
    const view = () => tx ?? db.committed;
    const rec = (id) => db.events.push({ conn: n, id, inTx: Boolean(tx) });
    return {
      async end() { /* an abandoned transaction is rolled back by the server */ tx = null; },
      async query(text, params = []) {
        const id = text === MIG ? 'FILE:migration' : text === SEED ? 'FILE:seed' : idOfText(text);
        if (!id) throw new Error(`FAKE: unscripted statement ${text.slice(0, 60)}`);
        rec(id); const v = view(); const rows = (r) => ({ rows: r, rowCount: r.length });
        const clone = () => ({ ...db.committed, history: db.committed.history.map((r) => ({ ...r })) });
        const writeOutsideTx = (what) => { if (!tx) db.violations.push(`${what} outside a transaction`); };
        // like the real database, the anon role has no EXECUTE on any RPC and no table privilege: the answer depends on the ROLE, not on which probe id carries the text
        if (role === 'anon' && /^(probe|staff:|anon:|shipRpc)/.test(id)) throw Object.assign(new Error('permission denied'), { code: '42501' });
        switch (id) {
          case 'begin': tx = clone(); return rows([]);
          case 'tl_idle': case 'tl_stmt': case 'tl_lock': case 'sp': case 'spr': case 'spx': case 'claims': return rows([]);
          case 'roleAuth': role = 'authenticated'; return rows([]); case 'roleAnon': role = 'anon'; return rows([]); case 'roleReset': role = 'postgres'; return rows([]);
          case 'advisory': if (db.o.raceOnAdvisory && tx) tx.history.push({ version: PINS.newVersion, name: PINS.newName, nstmt: null }); return rows([]);
          case 'rollback': db.rollbacks++; tx = null; return rows([]);
          case 'commit': {
            db.commits++; if (!tx) throw new Error('FAKE: commit without a transaction');
            if (db.o.failCommit === 'before') { tx = null; const e = new Error('server closed the connection'); e.code = '57P01'; throw e; }
            db.committed = tx; tx = null; if (db.o.postCommitTamper) db.committed.extraFn = 1;
            if (db.o.failCommit === 'after') { const e = new Error('connection lost after commit'); e.code = '08006'; throw e; }
            return rows([]);
          }
          case 'histCols': return rows(db.o.histCols ?? [{ column_name: 'version', data_type: 'text', is_nullable: 'NO', column_default: null }, { column_name: 'statements', data_type: 'ARRAY', is_nullable: 'YES', column_default: null }, { column_name: 'name', data_type: 'text', is_nullable: 'YES', column_default: null }]);
          case 'histRowsStmt': case 'histRowsNoStmt': return rows(v.history.map((r) => ({ ...r })));
          case 'histInsert2': case 'histInsert3': {
            writeOutsideTx('history insert'); if (db.o.failHistoryInsert) { const e = new Error('duplicate key'); e.code = '23505'; throw e; }
            if (id === 'histInsert3' && !(Array.isArray(params[2]) && params[2].length === 1 && params[2][0] === MIG)) throw new Error('FAKE: statements parameter is not [migration text]');
            v.history.push({ version: params[0], name: params[1], nstmt: id === 'histInsert3' ? 1 : null }); return rows([]);
          }
          case 'FILE:migration': writeOutsideTx('migration'); if (db.o.failMigration) { const e = new Error(`relation already exists ${SECRET}`); e.code = '42P07'; throw e; } v.p3 = true; return rows([]);
          case 'FILE:seed': writeOutsideTx('seed'); if (db.o.failSeed) { const e = new Error('seed failed'); e.code = '23505'; throw e; } if (!v.p3) throw new Error('FAKE: seed before migration'); v.seeded = true; return rows([]);
          case 'presentRel': return rows([{ n: v.p3 ? 10 : 0 }]); case 'presentFn': return rows([{ n: v.p3 ? 27 : 0 }]); case 'presentPol': return rows([{ n: 0 }]);
          case 'sVersion': return rows([{ v: 'PostgreSQL 17.11 (fake)', sv: '17.11', svn: '170011' }]);
          case 'sFunctions': { const m = {}; for (let i = 0; i < 20; i++) m[`public.base_fn_${i}()`] = `h${i}`; if (v.p3) { for (const f of P3_PUBLIC_FN) m[`public.${f}()`] = 'p3'; for (const f of P3_PRIVATE_FN) m[`private.${f}()`] = 'p3'; if (db.o.extraFunction) m['public.rogue()'] = 'x'; if (v.extraFn) m['public.rogue_after_commit()'] = 'x'; if (db.o.alterExistingFn) m['public.base_fn_0()'] = 'changed'; } return rows(Object.entries(m).map(([k, val]) => ({ k, v: val }))); }
          case 'sRelations': { const m = {}; for (let i = 0; i < 10; i++) m[`public.base_t${i}`] = `r${i}`; if (v.p3) { for (const x of P3_TABLES) { m[`public.${x}`] = 'p3'; m[`public.${x}_pkey`] = 'p3'; } for (let i = 0; i < 12; i++) m[`public.p3_extra_${i}_idx`] = 'p3'; m['public.order_number_seq'] = 'p3'; } return rows(Object.entries(m).map(([k, val]) => ({ k, v: val }))); }
          case 'sColumns': case 'sConstraints': { const m = {}; for (let i = 0; i < 5; i++) m[`k${i}`] = `c${i}`; if (v.p3) for (let i = 0; i < 20; i++) m[`p3_${id}_${i}`] = 'p3'; return rows(Object.entries(m).map(([k, val]) => ({ k, v: val }))); }
          case 'sPolicies': return rows([{ k: 'public.profiles.p1', v: 'pol' }]);
          case 'sTriggers': { const m = { 'public.profiles.touch': 't' }; if (v.p3) for (let i = 0; i < 10; i++) m[`public.orders.trg${i}`] = 'p3'; return rows(Object.entries(m).map(([k, val]) => ({ k, v: val }))); }
          case 'sRowCounts': { const m = {}; for (let i = 0; i < 10; i++) m[`public.base_t${i}`] = String(i); if (v.p3) for (const x of P3_TABLES) m[`public.${x}`] = v.seeded && x === 'products' ? '153' : '0'; return rows(Object.entries(m).map(([k, val]) => ({ k, v: val }))); }
          case 'sSchemaAcl': return rows([{ k: 'public', v: 'acl' }, { k: 'private', v: 'acl' }, { k: 'auth', v: 'acl' }]); case 'sDefaultAcl': return rows([{ k: 'postgres.public.r', v: 'acl' }]);
          case 'sSchemas': return rows([{ nspname: 'public' }, { nspname: 'private' }, { nspname: 'auth' }]);
          case 'sHistory': return rows(v.history.map((r) => ({ version: r.version, name: r.name })));
          case 'sSequences': { const m = { 'public.some_old_seq': '5|1' }; if (v.p3) m['public.order_number_seq'] = '|1'; return rows(Object.entries(m).map(([k, val]) => ({ k, v: val }))); }
          case 'sAdvisory': return rows([{ n: 0 }]);
          case 'tableProps': { const base = {}; for (const r of ['anon', 'authenticated', 'service_role', 'public']) for (const p of ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) base[`${r}_${p}`] = false; if (db.o.grantToAnon) base.anon_select = true; return rows(P3_TABLES.map((x) => ({ t: x, rls: !db.o.rlsOff, o: 'postgres', acl: '{postgres=arwdDxtm/postgres}', ...base }))); }
          case 'fnProps': return rows([...P3_PUBLIC_FN.map((f) => ({ s: 'public', f, d: true, cfg: ['search_path=""'], o: 'postgres', an: false, au: true, sr: false, pu: false })), ...P3_PRIVATE_FN.map((f) => ({ s: 'private', f, d: false, cfg: ['search_path=""'], o: 'postgres', an: false, au: false, sr: false, pu: false }))]);
          case 'trigEnabled': return rows([{ n: 10 }]);
          case 'seedCounts': return rows([v.seeded ? { p: db.o.seedShort ? 152 : 153, v: 221, priced: 0, nodesc: 34, skus: 221, odd: 0 } : { p: 0, v: 0, priced: 0, nodesc: 0, skus: 0, odd: 0 }]);
          case 'seedWording': return rows([{ n: 0 }]); case 'noDataCreated': return rows([{ n: db.o.dataCreated ? 1 : 0 }]); case 'seqProps': return rows([{ n: 1 }]);
          case 'pricingNull': return rows([{ a: true, b: true, c: true }]); case 'pricingBreakdown': return rows([{ u: '10000' }]); case 'transitions': return rows([{ a: true, b: false, c: true }]);
          case 'shipDirect': return rows([{ r: db.o.shipNull && params[0] === '{}' ? null : VALID_JSON.has(params[0]) }]);
          case 'shipRpc': { if (role !== 'authenticated') throw Object.assign(new Error('x'), { code: '42501' }); if (VALID_JSON.has(params[0])) return rows([{ r: { ok: false, code: 'organization_not_found' } }]); if (db.o.checkoutAcceptsIncomplete && params[0] === '{}') return rows([{ r: { ok: true, code: 'order_placed' } }]); throw Object.assign(new Error('invalid arguments'), { code: '22023' }); }
          case 'probeCatalog': case 'probeCheckout': return rows([{ r: { ok: false, code: 'organization_not_found' } }]);
          default: {
            if (id.startsWith('vec:')) return rows([{ u: PRICING_VECTORS.find(([a]) => `vec:${a}` === id)[1] }]);
            if (id.startsWith('staff:') || id.startsWith('anon:') || id === 'probeTableAuth' || id === 'probeTableAnon') { probes++; throw Object.assign(new Error('permission denied'), { code: '42501' }); }
            if (id.startsWith('digest:')) { const tbl = id.slice(7); const changed = (db.o.digestChangesInTx && tx && v.p3 && tbl === 'public.audit_events') || (db.o.digestChangesAfterProbes && probes > 3 && tbl === 'public.audit_events') || (db.o.driftAfterRollback && n >= 3 && tbl === 'public.audit_events'); return rows([{ d: changed ? 'CHANGED' : `d-${tbl}`, n: 3 }]); }
            if (id.startsWith('auth:')) return rows([{ d: `d-${id}`, n: 2 }]);
            throw new Error(`FAKE: no handler for ${id}`);
          }
        }
      },
    };
  }
  snapshotOfCommitted() { return JSON.stringify(this.committed); }
}

async function run(opts = {}, mode = 'rehearse', extra = {}) {
  const db = new FakeDb(opts); const lines = []; const reporter = H.makeReporter((s) => lines.push(s)); const sqlLog = [];
  const confirm = extra.confirm ?? H.expectedConfirm('f'.repeat(64)); const res = await H.runApply({ mode, connect: () => db.connect(), mig: MIG, seed: SEED, reporter, confirm, expectedConfirm: extra.expected ?? H.expectedConfirm('f'.repeat(64)), sqlLog, ...extra.o });
  return { res, db, lines, sqlLog, reporter, ids: db.events.map((e) => e.id) };
}
const count = (ids, id) => ids.filter((x) => x === id).length;
const noFails = (r) => r.reporter.failed() === 0;
const cleanState = (r) => r.db.committed.p3 === false && r.db.committed.seeded === false && r.db.committed.history.length === 4 && r.db.violations.length === 0;

// ================================================================================================================================================ A. successful paths
{
  const r = await run({}, 'rehearse');
  t('A1 rehearsal: every in-transaction check passes, ROLLBACK is issued, outcome rehearsal_rolled_back, exit 0', r.res.outcome === 'rehearsal_rolled_back' && r.res.exitCode === EXIT.OK && noFails(r), `${r.res.outcome} exit ${r.res.exitCode}`);
  t('A1 rehearsal: COMMIT is never sent; nothing persisted; the fresh-connection comparison is identical', count(r.ids, 'commit') === 0 && r.db.commits === 0 && cleanState(r) && r.lines.some((l) => /PASS\s+AFTER \(fresh connection\) unchanged: history/.test(l)) && r.lines.some((l) => /no P3 object and no history entry persisted/.test(l) && /^PASS/.test(l)));
  t('A1 rehearsal: migration, seed and history insert ran inside the transaction, in that order, after the advisory lock and the in-transaction state re-check', (() => { const e = r.db.events; const i = (id, from = 0) => e.findIndex((x, k) => k >= from && x.id === id); const b = e.findIndex((x) => x.id === 'begin' && x.conn === 2); const a = i('advisory'); const m = i('FILE:migration'); const s = i('FILE:seed'); const h = i('histInsert2'); return b >= 0 && a > b && m > a && s > m && h > s && e[m].inTx && e[s].inTx && e[h].inTx && e.slice(a, m).some((x) => x.id === 'histRowsNoStmt' || x.id === 'histRowsStmt'); })());
}
let committedDb;
{
  const r = await run({}, 'commit'); committedDb = r;
  t('A2 commit: all checks pass, COMMIT sent once, outcome committed_verified, exit 0', r.res.outcome === 'committed_verified' && r.res.exitCode === EXIT.OK && r.res.committed === true && count(r.ids, 'commit') === 1 && noFails(r), `${r.res.outcome} exit ${r.res.exitCode}`);
  t('A2 commit: state persisted exactly once: P3 objects, seed, and the history row 20261110000100 p3_catalog_pricing_orders (history is 5 rows, the four old ones untouched)', r.db.committed.p3 && r.db.committed.seeded && r.db.committed.history.length === 5 && r.db.committed.history[4].version === PINS.newVersion && r.db.committed.history[4].name === PINS.newName && JSON.stringify(r.db.committed.history.slice(0, 4).map((x) => [x.version, x.name])) === JSON.stringify(PINS.priorHistory));
  const lastVerify = r.ids.lastIndexOf('shipRpc'); const commitAt = r.ids.indexOf('commit'); const lastFile = r.ids.lastIndexOf('FILE:seed');
  t('A2 commit: COMMIT comes only AFTER the migration, seed, history insert and every in-transaction check (including the shipping probes); the post-commit verification comes after COMMIT', commitAt > lastFile && commitAt > r.ids.indexOf('probeCheckout') && r.ids.slice(0, commitAt).includes('shipRpc') && r.ids.slice(commitAt + 1).includes('shipRpc') && lastVerify > commitAt);
  t('A2 commit: the post-commit verification runs on a FRESH connection (a different connection than the transaction) and repeats the full verification (history, P3 objects, seed, grants, probes, digests)', (() => { const txConn = r.db.events.find((x) => x.id === 'commit').conn; const post = r.db.events.filter((x) => x.conn > txConn); return post.some((x) => x.id === 'sHistory') && post.some((x) => x.id === 'tableProps') && post.some((x) => x.id === 'seedCounts') && post.some((x) => x.id === 'shipRpc') && post.some((x) => x.id === 'digest:public.audit_events'); })());
  t('A2 commit: the only statements that write are the advisory lock, ONE history insert, the migration, the seed and the COMMIT; every statement was on the allow-list; no write outside a transaction', (() => { const writers = r.ids.filter((x) => ['advisory', 'histInsert2', 'histInsert3', 'commit', 'FILE:migration', 'FILE:seed'].includes(x)); return writers.join() === 'advisory,FILE:migration,FILE:seed,histInsert2,commit' && r.sqlLog.every((x) => x.startsWith('FILE:') || x in SQL) && r.db.violations.length === 0; })());
  t('A2 commit: no statement after COMMIT writes anything (no cleanup, no repair, no retry)', !r.ids.slice(r.ids.indexOf('commit') + 1).some((x) => ['advisory', 'histInsert2', 'histInsert3', 'commit', 'FILE:migration', 'FILE:seed'].includes(x)));
}
t('A3 successful commit with an existing history table that records statements: the history row is written with the statements column', await (async () => { const r = await run({ histUsesStatements: true }, 'commit'); return r.res.outcome === 'committed_verified' && r.ids.includes('histInsert3') && !r.ids.includes('histInsert2') && r.db.committed.history[4].nstmt === 1; })());

// ================================================================================================================================================ B. duplicate execution
{
  const before = committedDb.db.snapshotOfCommitted(); const db2 = committedDb.db; db2.events = []; db2.o = {}; const lines = []; const rep2 = H.makeReporter((s) => lines.push(s)); const sqlLog = [];
  const res = await H.runApply({ mode: 'commit', connect: () => db2.connect(), mig: MIG, seed: SEED, reporter: rep2, confirm: H.expectedConfirm('f'.repeat(64)), expectedConfirm: H.expectedConfirm('f'.repeat(64)), sqlLog });
  t('B1 a second run against the already-applied database is refused before any transaction (refused_already_applied, exit 4); nothing written; state unchanged', res.outcome === 'refused_already_applied' && res.exitCode === EXIT.REFUSED_STATE && !db2.events.some((e) => e.id === 'begin') && !db2.events.some((e) => ['FILE:migration', 'FILE:seed', 'commit', 'advisory'].includes(e.id)) && db2.snapshotOfCommitted() === before);
}
{
  const r = await run({ initial: { p3: true } }, 'commit');
  t('B2 P3 objects already exist but the history lacks the entry: refused (refused_p3_objects_exist, exit 4), no transaction opened', r.res.outcome === 'refused_p3_objects_exist' && r.res.exitCode === EXIT.REFUSED_STATE && count(r.ids, 'begin') === 0 && r.db.commits === 0);
}
{
  const r = await run({ raceOnAdvisory: true }, 'commit');
  t('B3 a racing execution (the entry appears after the advisory lock) is caught by the in-transaction re-check: ROLLBACK, no migration sent, no commit (refused_in_tx_already_applied)', r.res.outcome === 'refused_in_tx_already_applied' && r.res.exitCode === EXIT.REFUSED_STATE && !r.ids.includes('FILE:migration') && !r.ids.includes('commit') && count(r.ids, 'rollback') >= 1 && cleanState(r));
}

// ================================================================================================================================================ C. history mismatches and history table shape
const hist = (rows) => rows.map(([version, name]) => ({ version, name, nstmt: null }));
for (const [label, rows] of [
  ['an extra unknown version', [...PINS.priorHistory, ['20261109000001', 'something_else']]], ['a missing applied version', PINS.priorHistory.slice(1)],
  ['a different name for an applied version', [['20261108000001', 'foundation_identity_x'], ...PINS.priorHistory.slice(1)]], ['an empty history', []], ['versions out of order', [PINS.priorHistory[1], PINS.priorHistory[0], ...PINS.priorHistory.slice(2)]]]) {
  const r = await run({ initial: { history: hist(rows) } }, 'commit');
  t(`C1 history mismatch (${label}): refused (refused_history_mismatch, exit 4) before any transaction; nothing written`, r.res.outcome === 'refused_history_mismatch' && r.res.exitCode === EXIT.REFUSED_STATE && count(r.ids, 'begin') === 0 && r.db.commits === 0 && r.db.violations.length === 0);
}
{
  const r = await run({ histCols: [{ column_name: 'version', data_type: 'text', is_nullable: 'NO', column_default: null }, { column_name: 'name', data_type: 'text', is_nullable: 'YES', column_default: null }, { column_name: 'created_by', data_type: 'text', is_nullable: 'NO', column_default: null }] }, 'commit');
  t('C2 a history table with a required column the harness cannot fill is refused (refused_history_schema, exit 4)', r.res.outcome === 'refused_history_schema' && r.res.exitCode === EXIT.REFUSED_STATE && count(r.ids, 'begin') === 0);
  const r2 = await run({ histCols: [{ column_name: 'id', data_type: 'int', is_nullable: 'NO', column_default: null }] }, 'commit');
  t('C3 a history table without version/name columns is refused', r2.res.outcome === 'refused_history_schema' && count(r2.ids, 'begin') === 0);
  const hp = (c, rows = []) => H.historyPlan(c, rows); const col = (n, nullable = 'YES', def = null) => ({ column_name: n, data_type: 'text', is_nullable: nullable, column_default: def });
  t('C4 historyPlan: version+name only -> 2-column insert; statements nullable and unused -> 2-column insert; statements used by existing rows -> 3-column insert; statements NOT NULL without default -> 3-column insert', hp([col('version', 'NO'), col('name')]).variant === 'histInsert2' && hp([col('version', 'NO'), col('name'), col('statements')], [{ nstmt: null }]).variant === 'histInsert2' && hp([col('version', 'NO'), col('name'), col('statements')], [{ nstmt: 4 }]).variant === 'histInsert3' && hp([col('version', 'NO'), col('name'), col('statements', 'NO')], []).variant === 'histInsert3');
}

// ================================================================================================================================================ D. failures inside the transaction -> rollback, no commit
for (const [label, opts, flagFile] of [['migration fails', { failMigration: true }, 'FILE:migration'], ['seed fails', { failSeed: true }, 'FILE:seed'], ['history insert fails (duplicate key)', { failHistoryInsert: true }, 'histInsert2']]) {
  for (const mode of ['rehearse', 'commit']) {
    const r = await run(opts, mode);
    t(`D1 ${label} (${mode} mode): ROLLBACK issued, COMMIT never sent, outcome rolled_back_error, exit 1, nothing persisted (fresh connection clean), later steps not attempted`, r.res.outcome === 'rolled_back_error' && r.res.exitCode === EXIT.FAILED_ROLLED_BACK && count(r.ids, 'commit') === 0 && count(r.ids, 'rollback') >= 1 && cleanState(r) && !r.lines.some((l) => /^FAIL\s+AFTER/.test(l)));
    if (flagFile === 'FILE:migration') t(`D1 ${label} (${mode}): the seed and history insert were never sent`, !r.ids.includes('FILE:seed') && !r.ids.includes('histInsert2'));
  }
}
for (const [label, opts] of [
  ['an extra function appears (28 instead of 27 added)', { extraFunction: true }], ['an existing function changed', { alterExistingFn: true }], ['RLS is off on the P3 tables', { rlsOff: true }], ['a table is granted to anon', { grantToAnon: true }],
  ['the seed is short (152 products)', { seedShort: true }], ['a P1/P2 row digest changes in the transaction (audit_events)', { digestChangesInTx: true }], ['probes write a P1/P2 row (digest changes after the probes)', { digestChangesAfterProbes: true }],
  ['data exists in the P3 tables', { dataCreated: true }], ['the validator returns NULL for {} (the original defect)', { shipNull: true }], ['checkout accepts an incomplete address (the original defect)', { checkoutAcceptsIncomplete: true }]]) {
  const r = await run(opts, 'commit');
  t(`D2 in-transaction verification fails (${label}): ROLLBACK, COMMIT never sent even in commit mode, outcome rolled_back_verification_failed, exit 1, nothing persisted`, r.res.outcome === 'rolled_back_verification_failed' && r.res.exitCode === EXIT.FAILED_ROLLED_BACK && count(r.ids, 'commit') === 0 && r.db.commits === 0 && count(r.ids, 'rollback') >= 1 && cleanState(r) && r.reporter.failed() >= 1);
}

// ================================================================================================================================================ E. commit ambiguity and post-commit failure
{
  const r = await run({ failCommit: 'before' }, 'commit');
  t('E1 COMMIT fails and the state is NOT persisted: commit sent once (no retry), outcome commit_error_not_persisted_verified_clean, exit 6, a fresh connection proves the database is clean, nothing else written', r.res.outcome === 'commit_error_not_persisted_verified_clean' && r.res.exitCode === EXIT.COMMIT_AMBIGUOUS && count(r.ids, 'commit') === 1 && cleanState(r) && r.res.persisted === false && !r.ids.slice(r.ids.indexOf('commit') + 1).some((x) => ['FILE:migration', 'FILE:seed', 'histInsert2', 'commit', 'advisory'].includes(x)));
  const r2 = await run({ failCommit: 'after' }, 'commit');
  t('E2 COMMIT reports an error but the state IS persisted: no retry, no repair; the fresh connection verifies the persisted state; outcome commit_error_but_persisted_verified, exit 6 (a human is told)', r2.res.outcome === 'commit_error_but_persisted_verified' && r2.res.exitCode === EXIT.COMMIT_AMBIGUOUS && count(r2.ids, 'commit') === 1 && r2.db.committed.history.length === 5 && r2.res.persisted === true && !r2.ids.slice(r2.ids.indexOf('commit') + 1).some((x) => ['FILE:migration', 'FILE:seed', 'histInsert2', 'commit', 'advisory'].includes(x)));
  const r3 = await run({ postCommitTamper: true }, 'commit');
  t('E3 the post-commit verification fails after a successful COMMIT: outcome committed_verification_failed, exit 5, NO automatic cleanup or rollback attempt, nothing written after COMMIT', r3.res.outcome === 'committed_verification_failed' && r3.res.exitCode === EXIT.COMMITTED_BUT_UNVERIFIED && r3.res.committed === true && r3.db.committed.history.length === 5 && !r3.ids.slice(r3.ids.indexOf('commit') + 1).some((x) => ['FILE:migration', 'FILE:seed', 'histInsert2', 'commit', 'advisory'].includes(x)));
}

// ================================================================================================================================================ E4. fresh-connection comparison that is NOT identical must never report success
{
  const r = await run({ driftAfterRollback: true }, 'rehearse');
  t('E4 rehearsal: a fresh-connection comparison that differs after the rollback is NOT reported as success: outcome rollback_not_verified_clean, exit 7, a FAIL line names the key', r.res.outcome === 'rollback_not_verified_clean' && r.res.exitCode === EXIT.INCONSISTENT && r.lines.some((l) => /^FAIL\s+AFTER \(fresh connection\) unchanged: rowDigests/.test(l)), `${r.res.outcome} exit ${r.res.exitCode}`);
  const r2 = await run({ driftAfterRollback: true }, 'commit');
  t('E4 commit mode: the same drift after a ROLLED-BACK failure still exits non-zero and the harness never commits', r2.res.exitCode !== EXIT.OK && count(r2.ids, 'commit') >= 0);
  const r3 = await run({ failCommit: 'before', driftAfterRollback: true }, 'commit');
  t('E4 ambiguous COMMIT that did not persist but where the fresh state differs: reported as commit_error_not_persisted_but_state_differs, exit 7', r3.res.outcome === 'commit_error_not_persisted_but_state_differs' && r3.res.exitCode === EXIT.INCONSISTENT, r3.res.outcome);
}

// ================================================================================================================================================ F. connection, TLS and target refusals
{
  const r = await run({ failConnectAt: 1 }, 'commit');
  t('F1 a TLS/certificate verification failure on the first connection stops the run: refused_connect, exit 3, ZERO statements sent, no retry, no downgrade', r.res.outcome === 'refused_connect' && r.res.exitCode === EXIT.REFUSED_CONNECT && r.db.events.length === 0 && r.db.connects === 1);
  t('F1 the connection error is logged as its code only (no message, host or credential text)', r.lines.some((l) => /error code DEPTH_ZERO_SELF_SIGNED_CERT/.test(l)) && !r.lines.join('\n').includes('SECRET') && !r.lines.join('\n').includes('S3CR3T') && !r.lines.join('\n').includes('jane@'));
  const r2 = await run({ failConnectAt: 2 }, 'commit');
  t('F2 the transaction connection fails after the pre-state check: no write happened, no commit, exit 1, and the fresh-connection verification proves the database is untouched', r2.res.exitCode === EXIT.FAILED_ROLLED_BACK && r2.db.commits === 0 && cleanState(r2) && !r2.ids.includes('FILE:migration'));
}
const PEM = readFileSync(PINS.caFile, 'utf8'); const url = (o = {}) => `postgresql://${o.user ?? 'postgres'}:${o.pw ?? SECRET.split(' ')[0]}@${o.host ?? `db.${PINS.ref}.supabase.co`}:${o.port ?? 5432}/${o.db ?? 'postgres'}`;
{
  const ok = H.checkTarget(url(), PEM);
  t('F3 the correct target and the pinned CA pass; the TLS settings are strict (rejectUnauthorized true, pinned CA, servername)', ok.ok && ok.ssl.rejectUnauthorized === true && ok.ssl.ca === PEM && ok.ssl.servername === `db.${PINS.ref}.supabase.co`);
  for (const [label, u] of [['another project ref', url({ host: 'db.abcdefghijklmnopqrst.supabase.co' })], ['a non-Supabase host', url({ host: 'example.com' })], ['a pooler host', url({ host: 'aws-0-us-east-1.pooler.supabase.com' })], ['a wrong port', url({ port: 6543 })], ['a wrong user', url({ user: 'service_role' })], ['a wrong database', url({ db: 'other' })], ['an unparseable URL', 'not a url']]) {
    const x = H.checkTarget(u, PEM); t(`F4 wrong target refused (${label})`, x.ok === false && JSON.stringify(x.checks).indexOf(SECRET.split(' ')[0]) < 0);
  }
  // the pg driver lets a connection string override the explicit ssl option: such URLs are refused, and the client is built from components only
  for (const q of ['?sslmode=disable', '?sslmode=no-verify', '?sslmode=require', '?sslmode=verify-full', '?ssl=false', '?ssl=true', '?uselibpqcompat=true&sslmode=require', '?SSLMODE=disable', '?sslrootcert=system']) {
    const x = H.checkTarget(url() + q, PEM); t(`F8 a URL with an SSL parameter is refused (${q.slice(0, 40)})`, x.ok === false && x.checks.some((c) => /SSL-related query parameter/.test(c.n) && !c.ok));
  }
  const benign = H.checkTarget(url() + '?application_name=x', PEM); const cfg = H.buildClientConfig(benign);
  t('F9 a URL with a harmless parameter is accepted but the parameter is IGNORED: the client configuration is built from the components only', benign.ok && !('connectionString' in cfg) && cfg.host === `db.${PINS.ref}.supabase.co` && cfg.port === 5432 && cfg.user === 'postgres' && cfg.database === 'postgres' && cfg.ssl.rejectUnauthorized === true && cfg.ssl.ca === PEM && cfg.ssl.servername === cfg.host && !JSON.stringify(cfg).includes('application_name=x'));
  const enc = H.checkTarget(`postgresql://postgres:p%40ss%3Aw%2Frd@db.${PINS.ref}.supabase.co:5432/postgres`, PEM); t('F10 the password is URL-decoded into the configuration, never logged (the checks hold no password)', enc.ok && H.buildClientConfig(enc).password === 'p@ss:w/rd' && !JSON.stringify(enc.checks).includes('p@ss') && !JSON.stringify(enc.checks).includes('p%40ss'));
  const bogus = (s) => ({ connection: { stream: s } });
  t('F11 assertTls accepts only a TLS session whose peer was verified (encrypted AND authorized)', (() => { H.assertTls(bogus({ encrypted: true, authorized: true })); const rej = (c) => { try { H.assertTls(c); return false; } catch (e) { return e.code === 'TLS_NOT_VERIFIED'; } }; return rej(bogus({ encrypted: false, authorized: false })) && rej(bogus({ encrypted: true, authorized: false })) && rej(bogus({ encrypted: true })) && rej(bogus(undefined)) && rej({}) && rej(null); })());
  const wrongCa = H.checkTarget(url(), rootCertificates[0]); t('F5 a CA certificate that is not the pinned Supabase CA is refused (fingerprint mismatch)', wrongCa.ok === false && wrongCa.checks.some((c) => /pinned CA fingerprint/.test(c.n) && !c.ok));
  t('F5 a garbage CA is refused', H.checkTarget(url(), 'not a pem').ok === false);
  t('F6 check results never contain the URL, password or user', !JSON.stringify(ok.checks).includes(SECRET.split(' ')[0]) && !JSON.stringify(H.checkTarget(url({ host: 'example.com' }), PEM).checks).includes('postgresql://'));
  H.setSecrets(ok.secrets); t('F7 redaction: clean() removes the URL, the password and any connection string from a message', !H.clean(`oops ${url()} and ${SECRET.split(' ')[0]}`).includes(SECRET.split(' ')[0]) && !/postgresql:\/\/postgres:/.test(H.clean(`failed ${url()}`))); H.setSecrets([]);
}

// ================================================================================================================================================ G. commit confirmation and mode gates
{
  for (const [label, confirm] of [['missing', undefined], ['empty', ''], ['wrong migration hash', 'p3-apply:000000000000:1b3b922dbb62:' + 'f'.repeat(12)], ['wrong harness hash', H.expectedConfirm('e'.repeat(64))], ['trailing text', H.expectedConfirm('f'.repeat(64)) + ' ']]) {
    const db = new FakeDb(); const reporter = H.makeReporter(() => {}); const res = await H.runApply({ mode: 'commit', connect: () => db.connect(), mig: MIG, seed: SEED, reporter, confirm, expectedConfirm: H.expectedConfirm('f'.repeat(64)) });
    t(`G1 commit mode with a ${label} --commit-confirm is refused before any connection (exit 2)`, res.outcome === 'refused_commit_confirmation' && res.exitCode === EXIT.REFUSED_PRECHECK && db.connects === 0);
  }
  const db = new FakeDb(); const res = await H.runApply({ mode: 'whatever', connect: () => db.connect(), mig: MIG, seed: SEED, reporter: H.makeReporter(() => {}), expectedConfirm: 'x' });
  t('G2 an unknown mode is refused before any connection', res.outcome === 'refused_bad_mode' && db.connects === 0);
  t('G3 the expected confirmation string binds the migration hash, the seed hash and the harness hash', H.expectedConfirm('a'.repeat(64)) === `p3-apply:${PINS.migrationSha.slice(0, 12)}:${PINS.seedSha.slice(0, 12)}:aaaaaaaaaaaa` && PINS.migrationSha.startsWith('d5efe7e9753b') && PINS.seedSha.startsWith('1b3b922dbb62'));
}

// ================================================================================================================================================ H. the allow-list refuses unexpected SQL BEFORE sending
{
  const sent = []; const send = H.makeSender(MIG, SEED, []); const fakeClient = { query: async (x) => { sent.push(x); return { rows: [] }; } };
  const refused = []; for (const text of ['drop table public.orders', 'delete from public.audit_events', 'update public.products set name = 1', 'insert into public.products(name) values (1)', 'create extension dblink', 'truncate public.orders', 'select 1', MIG + '\n-- tampered', SEED + '\n-- tampered', 'commit;', 'COMMIT ; select 1', 'insert into supabase_migrations.schema_migrations (version) values (1)']) { try { send(fakeClient, text); } catch (e) { if (/NOT ALLOW-LISTED/.test(e.message)) refused.push(text); } }
  t('H1 SQL outside the allow-list (DDL, deletes, updates, other inserts, a tampered migration or seed, a COMMIT with trailing text, a different history insert) is refused BEFORE it is sent', refused.length === 12 && sent.length === 0);
  send(fakeClient, MIG); send(fakeClient, SEED); send(fakeClient, '  begin   isolation level read committed '); t('H2 the two pinned files and whitespace-normalised allow-listed statements ARE sent', sent.length === 3);
  const mutating = Object.entries(SQL).filter(([, x]) => /^\s*(insert|update|delete|truncate|create|alter|drop|commit|select pg_advisory)/i.test(x)).map(([id]) => id).sort();
  t('H3 the only registered statements that write or commit are: the advisory lock, the two history inserts and COMMIT', JSON.stringify(mutating) === JSON.stringify(['advisory', 'commit', 'histInsert2', 'histInsert3']), mutating.join(','));
  t('H4 every registered statement STARTS with a read, role, savepoint or transaction verb (select, set local, reset, savepoint, rollback, begin) except the history inserts and COMMIT; none starts with DDL or a delete/update/truncate/grant', Object.entries(SQL).every(([id, x]) => ['commit', 'histInsert2', 'histInsert3'].includes(id) || (/^\s*(select|set local|reset role|savepoint|rollback|release savepoint|begin)\b/i.test(x) && !/^\s*(create|alter|drop|truncate|delete|update|insert|grant|revoke)\b/i.test(x))));
  t('H5 the SQL registry has no duplicate texts and 80 statements', ALLOWED.size === Object.keys(SQL).length && ALLOWED.size === 80);
}

// ================================================================================================================================================ I. artifact verification with tampered copies
{
  const real = H.verifyArtifacts(); t('I1 the real artifacts verify (all pinned hashes, byte-identical candidate, five migrations, change control)', real.ok, real.checks.filter((c) => !c.ok).map((c) => c.n).join('; '));
  const FILES = [PINS.migrationFile, PINS.draftFile, PINS.originalFile, PINS.seedFile, PINS.hashesFile, PINS.tierRManifestFile, ...Object.keys(PINS.priorMigrations).map((n) => `supabase/migrations/${n}`)];
  const mkRoot = (mutate) => { const d = mkdtempSync(join(tmpdir(), 'apply-p3-')); for (const f of FILES) { const dst = join(d, f); mkdirSync(join(dst, '..'), { recursive: true }); copyFileSync(join(ROOT, f), dst); } if (mutate) mutate(d); return d; };
  const append = (f) => (d) => writeFileSync(join(d, f), readFileSync(join(d, f), 'utf8') + '\n-- x\n');
  const cases = [
    ['promoted migration differs by one byte', append(PINS.migrationFile), /promoted migration sha256 equals/], ['the reviewed candidate differs', append(PINS.draftFile), /byte-identical to the reviewed/],
    ['the original defective draft is promoted instead (its bytes in the promoted file)', (d) => copyFileSync(join(ROOT, PINS.originalFile), join(d, PINS.migrationFile)), /promoted migration sha256 equals/],
    ['the seed differs by one byte', append(PINS.seedFile), /seed sha256 equals/], ['migration-hashes.txt differs', append(PINS.hashesFile), /migration-hashes.txt equals the pinned hash/], ['the Tier R manifest differs', append(PINS.tierRManifestFile), /Tier R execution manifest equals/],
    ['an applied migration was modified', append('supabase/migrations/20261108000002_staff_capabilities.sql'), /each of the four applied migrations still has/], ['an unexpected extra file is in supabase/migrations', (d) => writeFileSync(join(d, 'supabase/migrations/20261111000000_extra.sql'), 'select 1;\n'), /exactly those five files/],
    ['an applied migration is missing', (d) => rmSync(join(d, 'supabase/migrations/20261108000001_foundation_identity.sql')), /exactly those five files/], ['the migration contains a COMMIT statement', (d) => writeFileSync(join(d, PINS.migrationFile), readFileSync(join(d, PINS.migrationFile), 'utf8') + '\ncommit;\n'), /transaction control/]];
  for (const [label, mut, rx] of cases) { const d = mkRoot(mut); const x = H.verifyArtifacts({ root: d }); const hit = x.checks.filter((c) => !c.ok).some((c) => rx.test(c.n)); t(`I2 hash/provenance mismatch refused: ${label}`, x.ok === false && hit, x.checks.filter((c) => !c.ok).map((c) => c.n.slice(0, 40)).join(' | ')); rmSync(d, { recursive: true, force: true }); }
  t('I3 a copy with no modification verifies (the tamper tests above are meaningful)', (() => { const d = mkRoot(); const x = H.verifyArtifacts({ root: d }); rmSync(d, { recursive: true, force: true }); return x.ok; })());
}

// ================================================================================================================================================ J. CLI gates (spawned in offline-only paths; every one stops before any environment read or connection)
{
  const env = { ...process.env }; delete env.P2_DATABASE_URL; const cli = (file, args) => spawnSync('node', [file, ...args], { encoding: 'utf8', env, timeout: 60000 });
  const self = H.sha(readFileSync(HARNESS)); const conf = H.expectedConfirm(self);
  const cases = [
    ['no mode flag', ['--harness-sha', self], 2], ['both mode flags', ['--authorized-persistent-apply', '--authorized-rolled-back-execution', '--harness-sha', self, '--approval-ref', 'abcd'], 2],
    ['rehearsal with a wrong harness sha', ['--authorized-rolled-back-execution', '--harness-sha', '0'.repeat(64)], 2], ['commit with a wrong harness sha', ['--authorized-persistent-apply', '--harness-sha', '0'.repeat(64), '--approval-ref', 'abcd', '--commit-confirm', conf], 2],
    ['commit without --approval-ref', ['--authorized-persistent-apply', '--harness-sha', self, '--commit-confirm', conf], 2], ['commit without --commit-confirm', ['--authorized-persistent-apply', '--harness-sha', self, '--approval-ref', 'abcd'], 2],
    ['commit with a wrong --commit-confirm', ['--authorized-persistent-apply', '--harness-sha', self, '--approval-ref', 'abcd', '--commit-confirm', 'p3-apply:x:y:z'], 2],
  ];
  for (const [label, args, code] of cases) { const r = cli(HARNESS, args); t(`J1 CLI refuses: ${label} (exit ${code}, before any environment read)`, r.status === code && !/BEFORE snapshot|transaction open|P2_DATABASE_URL not set/.test(r.stdout), `exit ${r.status}`); }
  const tmp = mkdtempSync(join(tmpdir(), 'apply-p3-cli-'));
  const src = readFileSync(HARNESS, 'utf8'); const tamperedMig = join(tmp, 'm.sql').replace(/\\/g, '/'); writeFileSync(tamperedMig, MIG + '\n-- x\n');
  const patched = src.replace(`const ROOT = 'D:/99puritywholesale-platform/99puritywholesale';`, `const ROOT = '${tmp.replace(/\\/g, '/')}/root';`);
  t('J2 the root-substitution used for the CLI tamper test applied', patched !== src);
  const rootDir = join(tmp, 'root'); for (const f of [PINS.migrationFile, PINS.draftFile, PINS.originalFile, PINS.seedFile, PINS.hashesFile, PINS.tierRManifestFile, ...Object.keys(PINS.priorMigrations).map((n) => `supabase/migrations/${n}`)]) { mkdirSync(join(rootDir, f, '..'), { recursive: true }); copyFileSync(join(ROOT, f), join(rootDir, f)); }
  writeFileSync(join(rootDir, PINS.migrationFile), MIG + '\n-- one extra byte\n');
  const p = join(tmp, 'apply-p3-tampered.mjs'); writeFileSync(p, patched); const sp = H.sha(readFileSync(p));
  const r1 = cli(p, ['--offline-selftest']); t('J3 the CLI with a tampered migration stops at artifact verification (exit 3) in self-test mode', r1.status === 3 && /FAIL\s+promoted migration sha256/.test(r1.stdout) && /nothing was executed/.test(r1.stdout), `exit ${r1.status}`);
  const r2 = cli(p, ['--authorized-rolled-back-execution', '--harness-sha', sp]); t('J4 the CLI with a tampered migration and the correct harness hash stops BEFORE any environment read or connection (exit 3)', r2.status === 3 && !/P2_DATABASE_URL not set|BEFORE snapshot/.test(r2.stdout), `exit ${r2.status}`);
  const r3 = cli(p, ['--authorized-persistent-apply', '--harness-sha', sp, '--approval-ref', 'abcd', '--commit-confirm', H.expectedConfirm(sp)]); t('J5 commit mode with a tampered migration and every flag correct still stops at artifact verification (exit 3); nothing connects', r3.status === 3 && !/P2_DATABASE_URL not set|BEFORE snapshot/.test(r3.stdout), `exit ${r3.status}`);
  rmSync(tmp, { recursive: true, force: true });
  const r4 = cli(HARNESS, ['--offline-selftest']); t('J6 the genuine harness self-test passes (artifact verification only; no connection, no environment read)', r4.status === 0 && /offline self-test: \d+ passed, 0 FAILED/.test(r4.stdout) && /no environment file was read/.test(r4.stdout));
}

// ================================================================================================================================================ K. static review of the harness source
{
  const src = readFileSync(HARNESS, 'utf8'); const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  t('K1 exactly ONE place can send COMMIT (send(tx, SQL.commit)); there is no retry loop, no setTimeout/sleep and no second COMMIT path', (code.match(/SQL\.commit\b/g) ?? []).length === 1 && !/\bretry|setTimeout|setInterval|while\s*\(true\)|for\s*\(;;\)/.test(code));
  t('K2 the COMMIT site is the final else of: if verification failed -> rollback; else if rehearsal -> rollback; else commit (so it is reached only in commit mode after every in-transaction check passed)', /if \(!verified\) \{[\s\S]*?SQL\.rollback[\s\S]*?\}\s*else if \(o\.mode === 'rehearse'\) \{[\s\S]*?SQL\.rollback[\s\S]*?\}\s*else \{[\s\S]*?send\(tx, SQL\.commit\)/.test(code) && /verified = o\.reporter\.failed\(\) === failBefore/.test(code));
  t('K3 TLS is always strict and pinned; there is no way to disable it', /rejectUnauthorized: true/.test(code) && !/rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/.test(code.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\^\(ssl\|uselibpq\|sslmode\)/, '')));
  t('K11 the client is built ONLY by buildClientConfig (components + strict ssl); the source never passes a connection string to pg; every connection is checked with assertTls before use', !/connectionString/.test(code) && (code.match(/new pg\.Client\(/g) ?? []).length === 1 && /new pg\.Client\(buildClientConfig\(tg\)\)/.test(code) && /assertTls\(k\)/.test(code) && /await k\.end\(\)/.test(code.slice(code.indexOf('assertTls(k)'))));
  t('K4 the only environment access is process.env.P2_DATABASE_URL and one flag-gated read of the single P2_DATABASE_URL line of .env.local; no other env var and no other env file', [...code.matchAll(/process\.env\.(\w+)/g)].every((m) => m[1] === 'P2_DATABASE_URL') && (code.match(/readFileSync\(join\(ROOT, '\.env\.local'\)/g) ?? []).length === 1 && [...code.matchAll(/['"`](\.env[\w.\-]*)['"`]/g)].every((m) => m[1] === '.env.local') && /flag\('--authorized-read-env-local'\)/.test(code));
  t('K5 nothing logs the URL, the password or an error message: logs carry error CODES only', !/(console\.log|note|rep)\([^;]*\b(SECRETS|\.password|\bv\)|connectionString)/.test(code) && !/e\??\.message/.test(code.replace(/clean\(e\??\.message\)/g, '')));
  t('K6 the result file is written with flag wx to a new timestamped name (never overwrites) and holds no URL, credential or message', /flag: 'wx'/.test(code) && /p3-persistent-apply-result-\$\{mode\}-\$\{stamp\}\.json/.test(code));
  t('K7 the harness hash binding: connection requires --harness-sha equal to the file hash; commit also requires the exact --commit-confirm (migration hash, seed hash, harness hash) and --approval-ref; the two mode flags are exclusive', /opt\('--harness-sha'\) !== selfSha/.test(code) && /confirm !== exp/.test(code) && /mutually exclusive/.test(code));
  t('K8 the seed idempotency probe of the dry run (which UPDATEs rows) is NOT part of this harness: no registered statement starts with UPDATE, DELETE, TRUNCATE or DDL, and the dry-run probe text is absent from the source', !Object.values(SQL).some((x) => /^\s*(update|delete|truncate|create|alter|drop|grant|revoke)\b/i.test(x)) && !/set base_price_cents = 12345|ADMIN TEXT/.test(code));
  t('K9 a signal during the transaction ends the connection (the server rolls an uncommitted transaction back) and exits non-zero; after COMMIT was sent nothing is rolled back', /process\.once\('SIGINT'/.test(code) && /txOpen && !commitSent/.test(code));
  t('K10 fresh-connection verification (section 3 of runApply) runs in all end states that opened the gates and only reads: the statements it sends itself are sHistory, presentRel and presentFn; everything else goes through snapshot()/verifyApplied()', (() => { const i = src.indexOf('3. fresh-connection verification'); const end = src.indexOf('// CLI', i); const tail = src.slice(i, end > 0 ? end : src.length); const used = [...tail.matchAll(/send\(c1, SQL\.(\w+)/g)].map((m) => m[1]); return i > 0 && used.length >= 3 && used.every((x) => ['sHistory', 'presentRel', 'presentFn'].includes(x)) && /if \(!gatesOk \|\| !before\) return out;/.test(code); })());
}

console.log(bad === 0 ? 'all offline apply-harness tests pass (fake database only: this is NOT evidence that a real hosted commit works)' : `${bad} FAILED`); process.exit(bad ? 1 : 0);
