// P4 PERSISTENT APPLY HARNESS. Applies the promoted P4 migration (invoices, payments, locked wallet; replaces public.rpc_checkout) and its migration-history entry to the hosted development project
// (ref semtmllmwhxznxechfsk) in ONE READ COMMITTED transaction, verifies everything read-only before commit, and COMMITS only in an explicitly confirmed commit mode. Otherwise it ROLLS BACK ("rehearsal").
// It reuses the proven building blocks of apply-p3.mjs (target and CA pinning, strict TLS from URL components, redaction, history-table handling, snapshot/diff) and has its OWN statement allow-list and P4 verification.
//
// MODES (mutually exclusive):
//   rehearsal  --authorized-rolled-back-execution   migration + history row + full verification, then ROLLBACK, then fresh-connection proof that nothing persisted
//   commit     --authorized-persistent-apply --approval-ref <ref> --commit-confirm p4-apply:<migration sha 12>:<this file's sha 12>
// Always required to connect: --harness-sha <this file's sha256> and credentials via --authorized-read-env-local (the single P2_DATABASE_URL line, in memory, never printed) or P2_DATABASE_URL in the environment.
// Offline: --offline-selftest (no network, no environment read).
//
// SAFETY MODEL: every artifact is hash-pinned and verified BEFORE any environment read or connection; strict TLS with the pinned CA; every statement goes through send() (exact-text allow-list plus the one pinned
// migration file) BEFORE it is sent; exactly one site can send COMMIT (commit mode, confirmed, every in-transaction check passed); no retry anywhere; the verification is READ-ONLY (no probe writes and no sequence is
// advanced: no checkout is simulated); pre-state gates run on a fresh connection and again inside the transaction after an advisory lock; an ambiguous COMMIT is never retried or repaired.
import { readFileSync, readdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PINS as P3, EXIT, sha, setSecrets, clean, makeReporter, SQL as SQL3, checkTarget, buildClientConfig, assertTls, historyPlan, snapshot, diff } from './apply-p3.mjs';

const ROOT = 'D:/99puritywholesale-platform/99puritywholesale';
const SCRATCH = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/cbe1b851-01c2-43b3-85ae-39723a514ceb/scratchpad';
const norm = (s) => s.replace(/\s+/g, ' ').trim();

export const PINS = {
  ref: P3.ref, caFile: P3.caFile, caSha256: P3.caSha256,
  migrationFile: 'supabase/migrations/20261111000100_p4_invoices_payments_wallet.sql', migrationName: '20261111000100_p4_invoices_payments_wallet.sql',
  migrationSha: '97941a128db8d932c40d94d3c9a04599afa2a3d8ca37b6c0bf5eeeecdc9fcbe6',
  draftFile: 'supabase/review/p4/20261111000100_p4_invoices_payments_wallet.sql',
  hashesFile: 'supabase/migration-hashes.txt', hashesSha: '7f4721b8719a1e799818fb8ac74627b3121411563275f02a962fc0cc9659bd0f',
  priorMigrations: { ...P3.priorMigrations, [P3.migrationName]: P3.migrationSha },
  priorHistory: [...P3.priorHistory, [P3.newVersion, P3.newName]],
  newVersion: '20261111000100', newName: 'p4_invoices_payments_wallet',
};
export { EXIT, sha };

export const P4_TABLES = ['invoices', 'invoice_lines', 'payments', 'payment_events', 'platform_flags', 'wallet_entries'];
export const P4_PUBLIC_FN = ['rpc_billing_summary', 'rpc_invoices_list', 'rpc_invoice_get', 'rpc_payment_report', 'rpc_admin_invoices_list', 'rpc_admin_invoice_get', 'rpc_admin_payments_list',
  'rpc_admin_payment_confirm', 'rpc_admin_payment_reject', 'rpc_admin_invoice_void', 'rpc_wallet_get', 'rpc_admin_wallet_adjust'];
export const P4_PRIVATE_FN = ['pay_invoice_transition_ok', 'pay_payment_transition_ok', 'pay_org_owner_ok', 'pay_wallet_enabled', 'guard_pay_invoices', 'guard_pay_payments', 'guard_pay_append_only', 'guard_pay_flags',
  'pay_invoice_create', 'pay_order_cancel_voids_invoice'];
const P3_DATA_TABLES = ['products', 'product_variants', 'organization_products', 'markup_rules', 'carts', 'cart_items', 'orders', 'order_items', 'order_events'];
const O = "'00000000-0000-4000-8000-000000000001'::uuid";

// ------------------------------------------------------------------------------------------------------------------------------------------------ the SQL allow-list
const GENERIC = ['begin', 'tl_idle', 'tl_stmt', 'tl_lock', 'commit', 'rollback', 'sp', 'spr', 'spx', 'claims', 'roleAuth', 'roleAnon', 'roleReset', 'histCols', 'histRowsNoStmt', 'histRowsStmt', 'histInsert2', 'histInsert3',
  'presentRel', 'presentFn', 'presentPol', 'sVersion', 'sFunctions', 'sRelations', 'sColumns', 'sConstraints', 'sPolicies', 'sTriggers', 'sRowCounts', 'sSchemaAcl', 'sDefaultAcl', 'sSchemas', 'sHistory', 'sSequences', 'sAdvisory',
  'tableProps', 'fnProps', 'trigEnabled', 'probeCheckout'];
export const SQL = {};
for (const k of GENERIC) { if (!(k in SQL3)) throw new Error(`apply-p4: expected statement ${k} in apply-p3`); SQL[k] = SQL3[k]; }
for (const [k, v] of Object.entries(SQL3)) if (k.startsWith('digest:') || k.startsWith('auth:')) SQL[k] = v;
Object.assign(SQL, {
  advisory: "select pg_advisory_xact_lock(hashtextextended('p4-persistent-apply', 0))",
  checkoutHasInvoice: "select position('pay_invoice_create' in p.prosrc) > 0 as has from pg_proc p where p.oid = 'public.rpc_checkout(uuid,jsonb,text,uuid)'::regprocedure",
  orderInvoice: `select (select count(*)::int from public.orders) o, (select count(*)::int from public.invoices) i, (select count(*)::int from public.orders x where not exists (select 1 from public.invoices v where v.order_id = x.id)) missing, (select count(*)::int from public.invoices v join public.orders x on x.id = v.order_id where (x.status = 'cancelled') <> (v.status = 'void')) mismatch`,
  invoiceTotals: `select count(*)::int n from public.invoices i where i.total_cents <> (select coalesce(sum(l.line_total_cents), 0) from public.invoice_lines l where l.invoice_id = i.id)`,
  payNoData: `select (select count(*)::int from public.payments) + (select count(*)::int from public.payment_events) + (select count(*)::int from public.wallet_entries) as n`,
  walletFlag: `select (select count(*)::int from public.platform_flags where key = 'wallet_enabled' and enabled = false) as f, (select count(*)::int from public.platform_flags) as n, private.pay_wallet_enabled() as w`,
  cancelTrigger: `select count(*)::int n from pg_trigger t where t.tgname = 'orders_cancel_voids_invoice' and t.tgrelid = 'public.orders'::regclass and t.tgenabled = 'O'`,
  transitions: `select private.pay_invoice_transition_ok('open','paid') a, private.pay_invoice_transition_ok('paid','void') b, private.pay_invoice_transition_ok('void','open') c, private.pay_payment_transition_ok('reported','confirmed') d, private.pay_payment_transition_ok('confirmed','rejected') e`,
  pBill: `select public.rpc_billing_summary(${O}) as r`, pInv: `select public.rpc_invoices_list(${O}, 10) as r`, pInvGet: `select public.rpc_invoice_get(${O}, ${O}) as r`,
  pReport: `select public.rpc_payment_report(${O}, ${O}, 'zelle', 100, null, null, null, ${O}) as r`, pWallet: `select public.rpc_wallet_get(${O}) as r`,
  sInvList: 'select public.rpc_admin_invoices_list() as r', sInvGet: `select public.rpc_admin_invoice_get(${O}) as r`, sPayList: 'select public.rpc_admin_payments_list() as r',
  sConfirm: `select public.rpc_admin_payment_confirm(${O}, 100, date '2026-01-01', null, null) as r`, sReject: `select public.rpc_admin_payment_reject(${O}, 'rejected', 'x') as r`,
  sVoid: `select public.rpc_admin_invoice_void(${O}, 'x') as r`, sWallet: `select public.rpc_admin_wallet_adjust(${O}, 100, 'x', ${O}) as r`,
  tAuth: 'select count(*)::int as r from public.invoices', tAnon: 'select count(*)::int as r from public.payments',
});
for (const t of P3_DATA_TABLES) SQL[`p3digest:${t}`] = `select coalesce(md5(string_agg(md5(x::text), '' order by md5(x::text))), 'empty') d, count(*)::int n from public.${t} x`;
export const ALLOWED = new Map(Object.entries(SQL).map(([id, text]) => [norm(text), id]));
if (ALLOWED.size !== Object.keys(SQL).length) throw new Error('duplicate SQL text in the allow-list');

export function makeSender(mig, log = []) {
  return function send(c, text, params) {
    let id;
    if (text === mig) id = 'FILE:migration'; else { id = ALLOWED.get(norm(text)); if (!id) throw new Error('STATEMENT NOT ALLOW-LISTED (refused before sending)'); }
    log.push(id);
    return c.query(text, params);
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ offline artifact verification
export function verifyArtifacts({ root = ROOT, pins = PINS } = {}) {
  const out = []; const t = (n, ok, d = '') => out.push({ n, ok: Boolean(ok), d });
  const read = (rel) => { try { return readFileSync(join(root, rel)); } catch { return null; } };
  const mig = read(pins.migrationFile); const draft = read(pins.draftFile); const hashes = read(pins.hashesFile);
  t('promoted P4 migration sha256 equals the pinned hash', mig && sha(mig) === pins.migrationSha, mig ? sha(mig).slice(0, 12) : 'missing');
  t('promoted P4 migration is byte-identical to the reviewed draft in supabase/review/p4', mig && draft && mig.equals(draft));
  t('supabase/migration-hashes.txt equals the pinned hash', hashes && sha(hashes) === pins.hashesSha, hashes ? sha(hashes).slice(0, 12) : 'missing');
  let listed = null; try { listed = Object.fromEntries(hashes.toString('utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)).map(([h, n]) => [n, h])); } catch { /* handled below */ }
  const want = { ...pins.priorMigrations, [pins.migrationName]: pins.migrationSha };
  t('migration-hashes.txt lists exactly the five applied migrations and the promoted P4 migration with the pinned hashes', listed && JSON.stringify(Object.entries(listed).sort()) === JSON.stringify(Object.entries(want).sort()));
  let dir = null; try { dir = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort(); } catch { /* handled below */ }
  t('supabase/migrations holds exactly those six files', dir && JSON.stringify(dir) === JSON.stringify(Object.keys(want).sort()), dir ? `${dir.length} files` : 'unreadable');
  t('each of the five applied migrations still has its recorded hash', Object.entries(pins.priorMigrations).every(([n, h]) => { const b = read(`supabase/migrations/${n}`); return b && sha(b) === h; }));
  const strip = (s) => s.replace(/--[^\n]*/g, '');
  t('the migration is LF only', mig && !mig.includes(13));
  t('the migration contains no transaction control (commit, rollback, savepoint, begin;) and does not touch supabase_migrations', mig && !/\b(commit|rollback|savepoint)\s*;|\bbegin\s*;|\bbegin\s+(transaction|work)\b|supabase_migrations/i.test(strip(mig.toString('utf8'))));
  return { ok: out.every((x) => x.ok), checks: out, mig: mig ?? null };
}
export const expectedConfirm = (harnessSha, pins = PINS) => `p4-apply:${pins.migrationSha.slice(0, 12)}:${harnessSha.slice(0, 12)}`;

// ------------------------------------------------------------------------------------------------------------------------------------------------ verification
const noChange = (d) => d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;
const EXPECT_HISTORY = [...PINS.priorHistory.map(([v, n]) => `${v}:${n}`), `${PINS.newVersion}:${PINS.newName}`];
const CHECKOUT_KEY = /(^|\.)rpc_checkout\(uuid,\s?jsonb,\s?text,\s?uuid\)$/;

export async function collectP3(c, send) { const o = {}; for (const t of P3_DATA_TABLES) o[t] = (await send(c, SQL[`p3digest:${t}`])).rows[0]; return o; }

export async function verifyApplied(c, send, before, rep, phase) {
  const now = await snapshot(c, send); const d = (k) => diff(before[k], now[k]);
  const relTables = d('relations').added.filter((k) => !/_pkey$|_key$|_idx$|_seq$/.test(k));
  rep(`${phase}: relations added are exactly the 6 P4 tables, their indexes and the invoice sequence; nothing removed or changed`, d('relations').removed.length === 0 && d('relations').changed.length === 0 && P4_TABLES.every((t) => `public.${t}` in now.relations) && relTables.length === 6 && 'public.invoice_number_seq' in now.relations, `${d('relations').added.length} added, ${relTables.length} tables`);
  const fa = d('functions');
  rep(`${phase}: functions added are exactly the 12 public RPCs and the 10 private helpers`, fa.removed.length === 0 && fa.added.length === 22, `${fa.added.length} added`);
  rep(`${phase}: the only existing function that changed is public.rpc_checkout(uuid,jsonb,text,uuid)`, fa.changed.length === 1 && CHECKOUT_KEY.test(fa.changed[0]), fa.changed.join(', '));
  const ta = d('triggers');
  rep(`${phase}: no existing policy changed; 16 triggers added (15 on the P4 tables, 1 on orders); no existing trigger changed or removed`, noChange(d('policies')) && ta.removed.length === 0 && ta.changed.length === 0 && ta.added.length === 16, `${ta.added.length} added`);
  rep(`${phase}: no existing column or constraint changed or removed`, ['columns', 'constraints'].every((k) => d(k).removed.length === 0 && d(k).changed.length === 0));
  rep(`${phase}: existing table row counts unchanged (only the 6 P4 tables are new)`, d('rowCounts').removed.length === 0 && d('rowCounts').changed.length === 0 && d('rowCounts').added.length === 6);
  rep(`${phase}: default privileges, schema ACLs and the schema list unchanged`, JSON.stringify(before.defaultAcl) === JSON.stringify(now.defaultAcl) && JSON.stringify(before.schemaAcl) === JSON.stringify(now.schemaAcl) && JSON.stringify(before.schemas) === JSON.stringify(now.schemas));
  rep(`${phase}: migration history is the five applied versions plus exactly the P4 entry`, JSON.stringify(now.history) === JSON.stringify(EXPECT_HISTORY), now.history.join(','));
  for (const k of Object.keys(before.rowDigests)) rep(`${phase}: unrelated data unchanged: ${k}`, JSON.stringify(before.rowDigests[k]) === JSON.stringify(now.rowDigests[k]));
  for (const k of Object.keys(before.auth)) rep(`${phase}: auth.${k} untouched`, JSON.stringify(before.auth[k]) === JSON.stringify(now.auth[k]));
  const p3 = await collectP3(c, send);
  for (const t of P3_DATA_TABLES) rep(`${phase}: P3 data unchanged: public.${t}`, JSON.stringify(before.p3[t]) === JSON.stringify(p3[t]));
  const sq = d('sequences'); rep(`${phase}: no existing sequence changed; the only new sequence is public.invoice_number_seq`, sq.removed.length === 0 && sq.changed.length === 0 && JSON.stringify(sq.added) === JSON.stringify(['public.invoice_number_seq']), sq.added.join(','));
  const tb = (await send(c, SQL.tableProps, [P4_TABLES])).rows;
  rep(`${phase}: the 6 P4 tables: RLS enabled, owner postgres, ACL only the owner, no privilege for anon, authenticated, service_role or PUBLIC`, tb.length === 6 && tb.every((r) => r.rls && r.o === 'postgres' && /^\{postgres=arwdDxtm?\/postgres\}$/.test(r.acl) && !Object.entries(r).some(([k, v]) => /^(anon|authenticated|service_role|public)_/.test(k) && v === true)));
  rep(`${phase}: no RLS policy exists on the P4 tables (default deny, RPC-only access)`, (await send(c, SQL.presentPol, [P4_TABLES])).rows[0].n === 0);
  const fr = (await send(c, SQL.fnProps, [[...P4_PUBLIC_FN, 'rpc_checkout'], P4_PRIVATE_FN])).rows; const bad = [];
  for (const r of fr) {
    if (r.o !== 'postgres') bad.push(`${r.f} owner`);
    if (!(r.cfg ?? []).some((x) => x.replace(/[\s"']/g, '').toLowerCase() === 'search_path=')) bad.push(`${r.f} search_path`);
    if (r.an || r.sr || r.pu) bad.push(`${r.f} anon/service_role/PUBLIC`);
    if (r.s === 'public' && !(r.au && r.d)) bad.push(`${r.f} not definer or not granted to authenticated`);
    if (r.s === 'private' && r.au) bad.push(`${r.f} private helper executable by authenticated`);
  }
  rep(`${phase}: 23 functions (12 new RPCs, rpc_checkout, 10 helpers): owner postgres, search_path pinned, no anon/service_role/PUBLIC execute; the 13 RPCs are SECURITY DEFINER and granted to authenticated only; helpers are not`, fr.length === 23 && bad.length === 0, bad.join('; ') || '23 checked');
  rep(`${phase}: the 15 triggers on the P4 tables and the orders cancel trigger exist and are enabled`, (await send(c, SQL.trigEnabled, [P4_TABLES])).rows[0].n === 15 && (await send(c, SQL.cancelTrigger)).rows[0].n === 1);
  rep(`${phase}: rpc_checkout now issues the invoice (calls private.pay_invoice_create)`, (await send(c, SQL.checkoutHasInvoice)).rows[0].has === true);
  const oi = (await send(c, SQL.orderInvoice)).rows[0];
  rep(`${phase}: every existing order has exactly one invoice (cancelled orders void, others open); no order without an invoice`, oi.o === oi.i && oi.missing === 0 && oi.mismatch === 0, JSON.stringify(oi));
  rep(`${phase}: every invoice total equals the sum of its lines`, (await send(c, SQL.invoiceTotals)).rows[0].n === 0);
  rep(`${phase}: no payment, payment event or wallet entry exists`, (await send(c, SQL.payNoData)).rows[0].n === 0);
  const wf = (await send(c, SQL.walletFlag)).rows[0]; rep(`${phase}: the wallet flag exists, is disabled and the helper reports disabled`, wf.f === 1 && wf.n === 1 && wf.w === false);
  const tr = (await send(c, SQL.transitions)).rows[0]; rep(`${phase}: invoice and payment transitions match the model`, tr.a === true && tr.b === false && tr.c === false && tr.d === true && tr.e === false);
  // behavioural probes (read-only: refused or empty answers; a savepoint isolates each; none advances a sequence)
  const own = phase !== 'in-tx'; if (own) await send(c, SQL.begin);
  const asRole = async (role, claims, id, params = []) => { await send(c, SQL.sp); try { await send(c, SQL.claims, [JSON.stringify(claims)]); await send(c, role === 'anon' ? SQL.roleAnon : SQL.roleAuth); const r = await send(c, SQL[id], params); await send(c, SQL.roleReset); await send(c, SQL.spx); return { v: r.rows[0]?.r }; } catch (e) { await send(c, SQL.spr); await send(c, SQL.spx); return { e: e.code }; } };
  const fake = { sub: '00000000-0000-4000-8000-0000000000aa', role: 'authenticated', aal: 'aal2', amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }] };
  try {
    const nm = []; for (const id of ['pBill', 'pInv', 'pInvGet', 'pReport', 'pWallet', 'probeCheckout']) { const r = await asRole('authenticated', fake, id); if (r.v?.code !== 'organization_not_found') nm.push(id); }
    rep(`${phase}: authenticated non-member: billing, invoice, report, wallet and checkout answer organization_not_found (no data, no write)`, nm.length === 0, nm.join(', '));
    const sr = []; for (const id of ['sInvList', 'sInvGet', 'sPayList', 'sConfirm', 'sReject', 'sVoid', 'sWallet']) { const r = await asRole('authenticated', fake, id); if (r.e !== '42501') sr.push(id); }
    rep(`${phase}: staff billing RPCs refuse a non-staff authenticated caller with 42501`, sr.length === 0, sr.join(', '));
    const ar = []; for (const id of ['pBill', 'pReport', 'sInvList', 'sConfirm']) { const r = await asRole('anon', {}, id); if (r.e !== '42501') ar.push(id); }
    rep(`${phase}: anon is refused (42501) on customer and staff billing RPCs`, ar.length === 0, ar.join(', '));
    const da = await asRole('authenticated', fake, 'tAuth'); const dn = await asRole('anon', {}, 'tAnon');
    rep(`${phase}: direct table access is denied to authenticated and anon (42501)`, da.e === '42501' && dn.e === '42501');
  } finally { if (own) await send(c, SQL.rollback); }
  const after = await snapshot(c, send);
  const changedByProbes = ['rowDigests', 'auth', 'rowCounts', 'sequences'].filter((k) => JSON.stringify(after[k]) !== JSON.stringify(now[k]));
  rep(`${phase}: the probes wrote nothing (row digests, auth digests, row counts and sequences unchanged by them)`, changedByProbes.length === 0, changedByProbes.join(', '));
  if (own) rep(`${phase}: advisory lock state is clean (no advisory lock held)`, after.advisoryLocks === before.advisoryLocks, `${after.advisoryLocks}/${before.advisoryLocks}`);
  return now;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ the run
const histRowsEqual = (rows, pairs) => JSON.stringify(rows.map((r) => [String(r.version), String(r.name)])) === JSON.stringify(pairs);
const takeSnapshot = async (c, send) => { const s = await snapshot(c, send); s.p3 = await collectP3(c, send); return s; };

export async function runApply(o) {
  const { rep, note } = o.reporter; const send = makeSender(o.mig, o.sqlLog ?? []);
  const out = { outcome: null, exitCode: EXIT.FAILED_ROLLED_BACK, committed: false, persisted: null, commitError: null };
  if (o.mode !== 'rehearse' && o.mode !== 'commit') { out.outcome = 'refused_bad_mode'; out.exitCode = EXIT.REFUSED_PRECHECK; return out; }
  if (o.mode === 'commit' && (!o.confirm || o.confirm !== o.expectedConfirm)) { rep('commit mode needs the exact --commit-confirm string', false); out.outcome = 'refused_commit_confirmation'; out.exitCode = EXIT.REFUSED_PRECHECK; return out; }
  let before = null; let tx = null; let txOpen = false; let commitSent = false; let plan = null; let gatesOk = false; let verified = false;
  const sig = () => { if (txOpen && !commitSent && tx) { try { tx.end(); } catch { /* the server rolls back an abandoned transaction */ } } process.exit(130); };
  if (o.handleSignals) { process.once('SIGINT', sig); process.once('SIGTERM', sig); }
  const stateGates = async (c, label) => {
    const cols = (await send(c, SQL.histCols)).rows; const p0 = historyPlan(cols, []);
    const rows = (await send(c, p0.hasStatements ? SQL.histRowsStmt : SQL.histRowsNoStmt)).rows; plan = historyPlan(cols, rows);
    rep(`${label}: migration history table has the expected shape and the harness can fill it (${plan.variant ?? 'n/a'})`, plan.ok, plan.reason ?? '');
    if (!plan.ok) return 'refused_history_schema';
    if (rows.some((r) => String(r.version) === PINS.newVersion)) { rep(`${label}: the P4 migration version is NOT already applied`, false, 'duplicate execution refused'); return 'refused_already_applied'; }
    rep(`${label}: migration history is exactly the five applied versions and names`, histRowsEqual(rows, PINS.priorHistory), rows.map((r) => `${r.version}:${r.name}`).join(','));
    if (!histRowsEqual(rows, PINS.priorHistory)) return 'refused_history_mismatch';
    const rel = (await send(c, SQL.presentRel, [[...P4_TABLES, 'invoice_number_seq']])).rows[0].n; const fn = (await send(c, SQL.presentFn, [P4_PUBLIC_FN, P4_PRIVATE_FN])).rows[0].n; const pol = (await send(c, SQL.presentPol, [P4_TABLES])).rows[0].n;
    const ck = (await send(c, SQL.checkoutHasInvoice)).rows[0].has;
    rep(`${label}: no P4 table, sequence, function or policy exists and rpc_checkout is still the P3 version`, rel === 0 && fn === 0 && pol === 0 && ck === false, `tables ${rel}, functions ${fn}, policies ${pol}, checkout already issues invoices: ${ck}`);
    return rel === 0 && fn === 0 && pol === 0 && ck === false ? null : 'refused_p4_objects_exist';
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
      note('transaction open (READ COMMITTED); executing the migration, then the history entry');
      await send(tx, o.mig); rep('MIGRATION executed in PostgreSQL (its own self-check DO block passed)', true);
      if (plan.variant === 'histInsert3') await send(tx, SQL.histInsert3, [PINS.newVersion, PINS.newName, [o.mig]]); else await send(tx, SQL.histInsert2, [PINS.newVersion, PINS.newName]);
      rep('migration history entry inserted', true, `${PINS.newVersion} ${PINS.newName} (${plan.variant})`);
      const failBefore = o.reporter.failed();
      await verifyApplied(tx, send, before, rep, 'in-tx');
      verified = o.reporter.failed() === failBefore;
      if (!verified) { await send(tx, SQL.rollback); txOpen = false; rep('in-transaction verification failed: ROLLBACK issued, nothing committed', null); out.outcome = 'rolled_back_verification_failed'; out.exitCode = EXIT.FAILED_ROLLED_BACK; }
      else if (o.mode === 'rehearse') { await send(tx, SQL.rollback); txOpen = false; rep('REHEARSAL: every in-transaction check passed; ROLLBACK issued (nothing committed)', null); out.outcome = 'rehearsal_rolled_back'; out.exitCode = EXIT.OK; }
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
  // fresh-connection verification of whatever state the database is now in
  let c1 = null;
  try {
    c1 = await o.connect();
    const hrows = (await send(c1, SQL.sHistory)).rows; const persisted = hrows.some((r) => String(r.version) === PINS.newVersion); out.persisted = persisted;
    if (out.committed || (commitSent && persisted)) {
      if (!out.committed) out.commitError = out.commitError ?? 'ERR';
      const f0 = o.reporter.failed(); await verifyApplied(c1, send, before, rep, 'post-commit');
      const ok = o.reporter.failed() === f0;
      if (out.committed) { out.outcome = ok ? 'committed_verified' : 'committed_verification_failed'; out.exitCode = ok ? EXIT.OK : EXIT.COMMITTED_BUT_UNVERIFIED; if (!ok) note('COMMITTED but post-commit verification FAILED: nothing is cleaned up automatically'); }
      else { out.outcome = ok ? 'commit_error_but_persisted_verified' : 'commit_error_but_persisted_unverified'; out.exitCode = EXIT.COMMIT_AMBIGUOUS; note('the COMMIT reported an error but the state IS persisted'); }
    } else {
      const after = await takeSnapshot(c1, send); const fa0 = o.reporter.failed();
      for (const k of Object.keys(before)) {
        const isMap = before[k] && typeof before[k] === 'object' && !Array.isArray(before[k]); const dd = isMap ? diff(before[k], after[k]) : null;
        const same = isMap ? noChange(dd) : JSON.stringify(before[k]) === JSON.stringify(after[k]);
        if (k === 'advisoryLocks') continue;
        rep(`AFTER (fresh connection): ${k} identical to BEFORE`, same);
      }
      const rel = (await send(c1, SQL.presentRel, [[...P4_TABLES, 'invoice_number_seq']])).rows[0].n; const fn = (await send(c1, SQL.presentFn, [P4_PUBLIC_FN, P4_PRIVATE_FN])).rows[0].n;
      const clean0 = rel === 0 && fn === 0 && !persisted && after.history.length === 5;
      rep('AFTER (fresh connection): no P4 object and no history entry persisted', clean0, `tables ${rel}, functions ${fn}`);
      const afterOk = clean0 && o.reporter.failed() === fa0;
      if (commitSent) { out.outcome = 'commit_error_not_persisted_verified_clean'; out.exitCode = afterOk ? EXIT.COMMIT_AMBIGUOUS : EXIT.INCONSISTENT; if (!afterOk) out.outcome = 'commit_error_not_persisted_but_state_differs'; }
      else if (!afterOk) { out.outcome = 'rollback_not_verified_clean'; out.exitCode = EXIT.INCONSISTENT; note('the fresh-connection comparison after the rollback is NOT identical: investigate before any further step'); }
    }
  } catch (e) { rep('fresh-connection verification', false, `error code ${e?.code ?? 'ERR'}`); out.exitCode = commitSent || out.committed ? EXIT.COMMITTED_BUT_UNVERIFIED : EXIT.INCONSISTENT; out.outcome = (out.outcome ?? 'unknown') + '+fresh_verification_error'; }
  finally { if (c1) await c1.end().catch(() => {}); }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ CLI
function cliMain() {
  const argv = process.argv.slice(2); const flag = (n) => argv.includes(n); const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const LOG = `${SCRATCH}/apply-p4-log.txt`; const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const RESULT = (mode) => `${SCRATCH}/p4-persistent-apply-result-${mode}-${stamp}.json`;
  const note = (s) => { console.log(s); try { appendFileSync(LOG, s + '\n'); } catch { /* best effort */ } };
  const reporter = makeReporter(note); const { rep } = reporter;
  const selfSha = sha(readFileSync(fileURLToPath(import.meta.url)));
  const OFFLINE = flag('--offline-selftest');
  const commit = flag('--authorized-persistent-apply'); const rehearse = flag('--authorized-rolled-back-execution');
  if (!OFFLINE) {
    if (commit && rehearse) { console.log('REFUSING: --authorized-persistent-apply and --authorized-rolled-back-execution are mutually exclusive'); return 2; }
    if (!commit && !rehearse) { console.log('REFUSING: needs --authorized-rolled-back-execution (rehearsal) or --authorized-persistent-apply (commit), or --offline-selftest'); return 2; }
    if (opt('--harness-sha') !== selfSha) { console.log('REFUSING: --harness-sha must equal the sha256 of this harness file (the approved harness)'); return 2; }
    if (commit && (!opt('--approval-ref') || opt('--approval-ref').length < 4)) { console.log('REFUSING: commit mode needs --approval-ref'); return 2; }
  }
  const art = verifyArtifacts(); for (const x of art.checks) rep(x.n, x.ok, x.d);
  rep('this harness file has a recorded sha256 (printed for the approval)', true, selfSha);
  if (!art.ok) { note('STOP: artifact verification failed; nothing was executed'); return 3; }
  if (OFFLINE) { note(`offline self-test: ${reporter.results.filter((r) => r.ok).length} passed, ${reporter.failed()} FAILED (no connection was made, no environment file was read)`); return reporter.failed() ? 1 : 0; }
  const mode = commit ? 'commit' : 'rehearse'; const confirm = opt('--commit-confirm'); const exp = expectedConfirm(selfSha);
  if (commit && confirm !== exp) { rep('commit mode needs the exact --commit-confirm string', false); note('STOP: commit confirmation missing or wrong; nothing was executed'); return 2; }
  let v = process.env.P2_DATABASE_URL ?? '';
  if (!v && flag('--authorized-read-env-local')) { const line = readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); } }
  if (!v) { console.log('STOP: P2_DATABASE_URL not set and --authorized-read-env-local not given'); return 2; }
  const pem = readFileSync(PINS.caFile, 'utf8'); const tg = checkTarget(v, pem, PINS); setSecrets(tg.secrets ?? [v]);
  for (const x of tg.checks) rep(x.n, x.ok);
  if (!tg.ok) { note('STOP: target or CA check failed; nothing was executed'); return 3; }
  const pg = createRequire(join(ROOT, 'package.json'))('pg');
  const connect = async () => { const k = new pg.Client({ ...buildClientConfig(tg), application_name: 'p4-apply' }); await k.connect(); try { assertTls(k); } catch (e) { await k.end().catch(() => {}); throw e; } return k; };
  return { run: async () => {
    const res = await runApply({ mode, connect, mig: art.mig.toString('utf8'), reporter, confirm, expectedConfirm: exp, handleSignals: true });
    note(`p4 persistent apply (${mode}): ${reporter.results.filter((r) => r.ok === true).length} passed, ${reporter.failed()} FAILED; outcome ${res.outcome}; committed ${res.committed}; exit ${res.exitCode}`);
    try { writeFileSync(RESULT(mode), JSON.stringify({ harness: 'apply-p4.mjs', mode, harnessSha: selfSha, migrationSha: PINS.migrationSha, migrationHashesSha: PINS.hashesSha, approvalRef: opt('--approval-ref') ?? null, outcome: res.outcome, committed: res.committed, persisted: res.persisted, exitCode: res.exitCode, results: reporter.results }, null, 1), { flag: 'wx' }); } catch { /* best effort */ }
    return res.exitCode;
  } };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const r = cliMain();
  if (typeof r === 'number') process.exitCode = r; else if (r?.run) process.exitCode = await r.run();
}
