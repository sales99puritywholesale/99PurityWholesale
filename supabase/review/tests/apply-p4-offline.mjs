// Offline test of apply-p4.mjs against a SCRIPTED FAKE DATABASE (no network, no environment read). It proves the harness LOGIC (refusals, rollback in rehearsal, one commit site, commit only after verification,
// ambiguous commit handling). It is NOT evidence that PostgreSQL accepts the migration: only the rehearsal against the real database can show that.
// Run: node supabase/review/tests/apply-p4-offline.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ALLOWED, EXIT, P4_PRIVATE_FN, P4_PUBLIC_FN, P4_TABLES, PINS, SQL, expectedConfirm, makeSender, runApply, sha } from './apply-p4.mjs';
import { makeReporter } from './apply-p3.mjs';

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const SELF = readFileSync(fileURLToPath(new URL('./apply-p4.mjs', import.meta.url)), 'utf8');
const MIG = 'select 1; -- fake migration text';
const base = { fns: { 'public.rpc_checkout(uuid,jsonb,text,uuid)': 'v1', 'public.rpc_order_get(uuid,uuid)': 'a', 'private.shop_org_ok(uuid)': 'b' }, rels: { 'public.orders': 'o', 'public.orders_pkey': 'p' }, trig: { 'orders.orders_guard': 't' }, counts: { 'public.orders': '1' }, seq: { 'public.order_number_seq': '1000|1000' } };
const err = (code) => Object.assign(new Error('fake'), { code });

function fakeDb(opt = {}) {
  const st = { persisted: Boolean(opt.alreadyApplied), pending: false, inTx: false, role: null, log: [], connects: 0, commitCount: 0 };
  const prior = [['20261108000001', 'foundation_identity'], ['20261108000002', 'staff_capabilities'], ['20261108000003', 'audit_and_step_up'], ['20261108000004', 'staff_management_rpcs'], ['20261110000100', 'p3_catalog_pricing_orders']];
  const visible = () => st.persisted || (st.inTx && st.pending);
  const kv = (o) => ({ rows: Object.entries(o).map(([k, v]) => ({ k, v })) });
  const client = {
    async end() {},
    async query(text, params) {
      if (text === MIG) { st.pending = true; return { rows: [] }; }
      const id = ALLOWED.get(norm(text)); st.log.push(id);
      const vis = visible();
      switch (id) {
        case 'begin': st.inTx = true; return { rows: [] };
        case 'rollback': st.inTx = false; st.pending = false; st.role = null; return { rows: [] };
        // a failing COMMIT simulates a lost connection: the server rolls the transaction back
        case 'commit': st.commitCount++; if (opt.commitFails) { st.inTx = false; st.pending = false; throw err('08006'); } st.persisted = st.pending; st.inTx = false; st.pending = false; return { rows: [] };
        case 'histInsert2': case 'histInsert3': return { rows: [] };
        case 'tl_idle': case 'tl_stmt': case 'tl_lock': case 'advisory': case 'sp': case 'spr': case 'spx': case 'claims': return { rows: [] };
        case 'roleAuth': st.role = 'authenticated'; return { rows: [] };
        case 'roleAnon': st.role = 'anon'; return { rows: [] };
        case 'roleReset': st.role = null; return { rows: [] };
        case 'histCols': return { rows: [{ column_name: 'version', data_type: 'text', is_nullable: 'NO', column_default: null }, { column_name: 'name', data_type: 'text', is_nullable: 'YES', column_default: null }] };
        case 'histRowsNoStmt': case 'histRowsStmt': { const rows = (opt.shortHistory ? prior.slice(0, 4) : prior).map(([version, name]) => ({ version, name, nstmt: null })); if (vis) rows.push({ version: PINS.newVersion, name: PINS.newName, nstmt: null }); return { rows }; }
        case 'sHistory': return { rows: [...prior.map(([version, name]) => ({ version, name })), ...(vis ? [{ version: PINS.newVersion, name: PINS.newName }] : [])] };
        case 'presentRel': return { rows: [{ n: vis ? 7 : 0 }] };
        case 'presentFn': return { rows: [{ n: vis ? 22 : 0 }] };
        case 'presentPol': return { rows: [{ n: 0 }] };
        case 'checkoutHasInvoice': return { rows: [{ has: vis }] };
        case 'sVersion': return { rows: [{ v: 'PostgreSQL fake', sv: '15', svn: '150000' }] };
        case 'sFunctions': { const f = { ...base.fns }; if (vis) { for (const n of P4_PUBLIC_FN) f[`public.${n}()`] = 'n'; for (const n of P4_PRIVATE_FN.slice(0, opt.fewFunctions ? 9 : 10)) f[`private.${n}()`] = 'n'; f['public.rpc_checkout(uuid,jsonb,text,uuid)'] = 'v2'; } return kv(f); }
        case 'sRelations': { const r = { ...base.rels }; if (vis) { for (const t of P4_TABLES) { r[`public.${t}`] = 't'; r[`public.${t}_pkey`] = 'p'; } r['public.invoice_number_seq'] = 's'; } return kv(r); }
        case 'sColumns': case 'sConstraints': case 'sPolicies': case 'sSchemaAcl': case 'sDefaultAcl': return kv({ x: '1' });
        case 'sTriggers': { const t = { ...base.trig }; if (vis) for (let i = 0; i < 16; i++) t[`t.trg${i}`] = 'x'; return kv(t); }
        case 'sRowCounts': { const c = { ...base.counts }; if (vis) for (const t of P4_TABLES) c[`public.${t}`] = '0'; return kv(c); }
        case 'sSchemas': return { rows: [{ nspname: 'private' }, { nspname: 'public' }] };
        case 'sSequences': { const s = { ...base.seq }; if (vis) s['public.invoice_number_seq'] = '1001|1000'; return kv(s); }
        case 'sAdvisory': return { rows: [{ n: 0 }] };
        case 'tableProps': return { rows: vis ? P4_TABLES.map((t) => ({ t, rls: true, o: 'postgres', acl: '{postgres=arwdDxtm/postgres}', anon_select: false, authenticated_select: false })) : [] };
        case 'fnProps': return { rows: vis ? [...P4_PUBLIC_FN, 'rpc_checkout'].map((f) => ({ s: 'public', f, d: true, cfg: ['search_path=""'], o: 'postgres', an: false, au: true, sr: false, pu: false })).concat(P4_PRIVATE_FN.map((f) => ({ s: 'private', f, d: true, cfg: ['search_path=""'], o: 'postgres', an: false, au: false, sr: false, pu: false }))) : [] };
        case 'trigEnabled': return { rows: [{ n: 15 }] };
        case 'cancelTrigger': return { rows: [{ n: 1 }] };
        case 'orderInvoice': return { rows: [{ o: 1, i: 1, missing: 0, mismatch: 0 }] };
        case 'invoiceTotals': case 'payNoData': return { rows: [{ n: 0 }] };
        case 'walletFlag': return { rows: [{ f: 1, n: 1, w: false }] };
        case 'transitions': return { rows: [{ a: true, b: false, c: false, d: true, e: false }] };
        case 'probeCheckout': case 'pBill': case 'pInv': case 'pInvGet': case 'pReport': case 'pWallet':
          if (st.role === 'anon') throw err('42501');
          return { rows: [{ r: { ok: false, code: 'organization_not_found' } }] };
        case 'sInvList': case 'sInvGet': case 'sPayList': case 'sConfirm': case 'sReject': case 'sVoid': case 'sWallet': case 'tAuth': case 'tAnon': throw err('42501');
        default:
          if (id?.startsWith('digest:') || id?.startsWith('auth:') || id?.startsWith('p3digest:')) return { rows: [{ d: 'same', n: 1 }] };
          throw new Error(`fake: unhandled statement ${id}`);
      }
    },
  };
  return { st, connect: async () => { st.connects++; return client; } };
}

const results = []; const t = async (name, fn) => { try { await fn(); results.push([name, true]); console.log(`PASS  ${name}`); } catch (e) { results.push([name, false]); console.log(`FAIL  ${name}\n      ${e.message}`); } };
const run = async (mode, opt = {}, over = {}) => { const db = fakeDb(opt); const lines = []; const reporter = makeReporter((s) => lines.push(s)); const sqlLog = []; const res = await runApply({ mode, connect: db.connect, mig: MIG, reporter, confirm: over.confirm, expectedConfirm: over.expected ?? 'ok', handleSignals: false, sqlLog }); return { res, db, lines, reporter }; };

await t('rehearsal: all checks pass, ROLLBACK issued, nothing persisted, no COMMIT sent', async () => {
  const { res, db, lines } = await run('rehearse');
  assert.equal(res.exitCode, EXIT.OK, lines.filter((l) => l.startsWith('FAIL')).join('\n'));
  assert.equal(res.outcome, 'rehearsal_rolled_back'); assert.equal(db.st.commitCount, 0); assert.equal(db.st.persisted, false); assert.equal(res.persisted, false);
});
await t('rehearsal with a verification fault (21 instead of 22 new functions): ROLLBACK, exit 1, no COMMIT', async () => {
  const { res, db } = await run('rehearse', { fewFunctions: true });
  assert.equal(res.exitCode, EXIT.FAILED_ROLLED_BACK); assert.equal(res.outcome, 'rolled_back_verification_failed'); assert.equal(db.st.commitCount, 0);
});
await t('commit mode without the exact confirmation: refused before any connection', async () => {
  const { res, db } = await run('commit', {}, { confirm: 'wrong', expected: 'right' });
  assert.equal(res.exitCode, EXIT.REFUSED_PRECHECK); assert.equal(db.st.connects, 0);
});
await t('commit mode, confirmed, everything verified: exactly one COMMIT, persisted state re-verified on a fresh connection, exit 0', async () => {
  const { res, db, lines } = await run('commit', {}, { confirm: 'ok', expected: 'ok' });
  assert.equal(res.exitCode, EXIT.OK, lines.filter((l) => l.startsWith('FAIL')).join('\n'));
  assert.equal(res.outcome, 'committed_verified'); assert.equal(db.st.commitCount, 1); assert.equal(db.st.persisted, true);
  assert.ok(lines.some((l) => l.includes('post-commit')));
});
await t('commit mode with a verification fault: no COMMIT is ever sent', async () => {
  const { res, db } = await run('commit', { fewFunctions: true }, { confirm: 'ok', expected: 'ok' });
  assert.equal(db.st.commitCount, 0); assert.equal(db.st.persisted, false); assert.notEqual(res.exitCode, EXIT.OK);
});
await t('ambiguous COMMIT (connection error after COMMIT was sent): never retried; a fresh connection reports not persisted; exit 6', async () => {
  const { res, db } = await run('commit', { commitFails: true }, { confirm: 'ok', expected: 'ok' });
  assert.equal(db.st.commitCount, 1); assert.equal(res.exitCode, EXIT.COMMIT_AMBIGUOUS); assert.equal(res.persisted, false);
});
await t('history with only four versions (P3 missing): refused by state, no transaction opened', async () => {
  const { res, db } = await run('rehearse', { shortHistory: true });
  assert.equal(res.exitCode, EXIT.REFUSED_STATE); assert.ok(!db.st.log.includes('begin'));
});
await t('already applied (P4 history row present): refused by state, nothing executed', async () => {
  const { res, db } = await run('commit', { alreadyApplied: true }, { confirm: 'ok', expected: 'ok' });
  assert.equal(res.exitCode, EXIT.REFUSED_STATE); assert.equal(db.st.commitCount, 0); assert.ok(!db.st.log.includes('begin'));
});
await t('the sender refuses any statement that is not allow-listed, before sending', async () => {
  const sent = []; const send = makeSender(MIG); const c = { query: async (x) => { sent.push(x); return { rows: [] }; } };
  assert.throws(() => send(c, 'drop table public.orders'), /NOT ALLOW-LISTED/); assert.throws(() => send(c, 'delete from public.orders'), /NOT ALLOW-LISTED/);
  assert.throws(() => send(c, MIG + ' '), /NOT ALLOW-LISTED/ ); assert.equal(sent.length, 0);
});
await t('no allow-listed statement writes data (only transaction control, the history insert, session settings and the pinned migration)', async () => {
  const writers = Object.entries(SQL).filter(([, s]) => /^\s*(insert|update|delete|truncate|drop|alter|create|grant|revoke)\b/i.test(s)).map(([k]) => k).sort();
  assert.deepEqual(writers, ['histInsert2', 'histInsert3']);
});
await t('source review: exactly one COMMIT send site, strict TLS from components only, no connection string, no retry loop', async () => {
  assert.equal((SELF.match(/send\(tx, SQL\.commit\)/g) ?? []).length, 1);
  assert.ok(!/connectionString/.test(SELF)); assert.ok(/assertTls\(k\)/.test(SELF) && /buildClientConfig\(tg\)/.test(SELF));
  assert.ok(!/\bretry\b\s*\(/.test(SELF.replace(/\/\/[^\n]*/g, '')));
  assert.ok(expectedConfirm('a'.repeat(64)).startsWith(`p4-apply:${PINS.migrationSha.slice(0, 12)}:`));
});
console.log(`apply-p4 offline: ${results.filter((r) => r[1]).length} passed, ${results.filter((r) => !r[1]).length} FAILED`);
process.exitCode = results.some((r) => !r[1]) ? 1 : 0;
void sha;
