// OFFLINE tests of the development fixture provisioning script. NO database, NO network, NO secrets, NO Docker: the "database" is a scripted in-memory fake that records every statement.
// They validate the script's LOGIC (manifest checks, refusals, idempotency, dry-run rollback, commit sequencing, verification, ambiguity). They are NOT evidence that it works on the real database.
// Run: node supabase/review/provisioning/provision-p3-dev-fixtures-offline.mjs
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as P from './provision-p3-dev-fixtures.mjs';
import { makeReporter } from '../tests/apply-p3.mjs';

const TOOL = fileURLToPath(new URL('./provision-p3-dev-fixtures.mjs', import.meta.url)).replace(/\\/g, '/');
const ROOT = 'D:/99puritywholesale-platform/99puritywholesale';
let bad = 0; const t = (n, ok, d = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };
const { SQL, EXIT } = P; const idOf = (text) => Object.entries(SQL).find(([, x]) => x === text)?.[0];
const loaded = P.loadManifest(); const M = loaded.manifest; const MSHA = loaded.manifestSha;
const OWNER = 'owner.fixture@example.test'; const REF = 'TICKET-5678'; const OWNER_ID = '11111111-2222-4333-8444-555555555555'; const MODE = 'org_percent_plus_rep_fixed';
const SECRET = 'S3CR3T-PW-9f8e7d';
const slugId = (s) => { const h = createHash('sha1').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const plan = P.buildPlan(M, OWNER, MODE);

class Fake {
  constructor(o = {}) {
    this.o = o; this.connects = 0; this.events = []; this.commits = 0; this.violations = []; this.s = {
      orgs: new Map(), members: [], assigns: [], rules: [], audit: 0, orders: o.orders ?? 0, carts: o.carts ?? 0, staff: 0,
      variants: new Map(M.products.flatMap((p) => p.variants.map((v) => [v.sku, { id: slugId(v.sku), sku: v.sku, base: null, floor: null, slug: p.slug, product_id: slugId(p.slug), pstatus: 'active', vstatus: 'active' }]))), ...(o.initial ? o.initial(M, slugId) : {}),
    };
    this.user = o.user === null ? undefined : { id: OWNER_ID, confirmed: true, banned: false, deleted: false, is_staff: false, ...(o.user ?? {}) };
    for (const [k, v] of Object.entries(o.variantPatch ?? {})) Object.assign(this.s.variants.get(k) ?? {}, v);
    if (o.dropSku) this.s.variants.delete(o.dropSku);
  }
  connect() { this.connects++; if (this.o.failConnectAt === this.connects) return Promise.reject(Object.assign(new Error(`cert ${SECRET}`), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })); return Promise.resolve(this.client()); }
  client() {
    const db = this; let tx = null; let role = 'postgres'; let claims = null; const v = () => tx ?? db.s;
    const clone = () => ({ ...db.s, orgs: new Map([...db.s.orgs].map(([k, x]) => [k, { ...x }])), members: db.s.members.map((x) => ({ ...x })), assigns: db.s.assigns.map((x) => ({ ...x })), rules: db.s.rules.map((x) => ({ ...x })), variants: new Map([...db.s.variants].map(([k, x]) => [k, { ...x }])) });
    const unitOf = (s, orgId, base, floor) => { const orgRule = s.rules.find((r) => r.org === orgId && r.kind === 'organization'); const rep = s.rules.find((r) => r.org === orgId && r.kind === 'representative'); let u = BigInt(base); if (orgRule) u += (BigInt(base) * BigInt(orgRule.value) + 500000n) / 1000000n; if (rep) u += (BigInt(rep.value) + 50n) / 100n; return Number(u > BigInt(floor) ? u : BigInt(floor)); };
    return {
      async end() { tx = null; },
      async query(text, params = []) {
        const id = idOf(text); if (!id) throw new Error('FAKE: unscripted statement'); db.events.push({ id, inTx: Boolean(tx) }); const rows = (r) => ({ rows: r, rowCount: r.length }); const w = () => { if (!tx) db.violations.push(`${id} outside a transaction`); };
        switch (id) {
          case 'begin': tx = clone(); return rows([]);
          case 'tlIdle': case 'tlStmt': case 'tlLock': case 'lock': case 'sp': case 'spr': case 'spx': return rows([]);
          case 'rollback': tx = null; return rows([]);
          case 'commit': { db.commits++; if (db.o.failCommit === 'before') { tx = null; throw Object.assign(new Error('closed'), { code: '57P01' }); } db.s = tx; tx = null; if (db.o.postCommitTamper) db.s.assigns.pop(); if (db.o.failCommit === 'after') throw Object.assign(new Error('lost'), { code: '08006' }); return rows([]); }
          case 'claims': claims = JSON.parse(params[0]); return rows([]); case 'roleAuth': role = 'authenticated'; return rows([]); case 'roleReset': role = 'postgres'; claims = null; return rows([]);
          case 'p3': return rows([{ hist: db.o.p3Missing ? 0 : 1, objects: !db.o.p3Missing }]);
          case 'user': return rows(db.user ? [db.user] : []);
          case 'org': { const o = v().orgs.get(params[0]); return rows(o ? [{ ...o }] : []); }
          case 'member': return rows(v().members.filter((x) => x.org === params[0] && x.user === params[1]).map((x) => ({ role: x.role, status: x.status })));
          case 'variants': return rows([...v().variants.values()].filter((x) => params[0].includes(x.sku)).map((x) => ({ id: x.id, sku: x.sku, base_price_cents: x.base, min_price_cents: x.floor, product_id: x.product_id, slug: x.slug, pstatus: x.pstatus, vstatus: x.vstatus })));
          case 'assigns': return rows(v().assigns.filter((x) => x.org === params[0]).map((x) => ({ product_id: x.product, available: x.available })));
          case 'rules': return rows(v().rules.filter((x) => x.org === params[0]).map((x) => ({ kind: x.kind, product_id: null, markup_type: x.type, value_e4: String(x.value), is_active: x.active })));
          case 'counts': { const s = v(); return rows([{ orgs: s.orgs.size, members: s.members.length, assigns: s.assigns.length, rules: s.rules.length, priced: [...s.variants.values()].filter((x) => x.base !== null).length, orders: s.orders, carts: s.carts, staff: s.staff }]); }
          case 'insOrg': w(); if (db.o.failAt === 'insOrg') throw Object.assign(new Error('x'), { code: '23505' }); { const idv = `b0000000-0000-4000-8000-${String(v().orgs.size + 1).padStart(12, '0')}`; v().orgs.set(params[1], { id: idv, name: params[0], code: params[1], status: 'active', payment_terms: params[2] }); return rows([{ id: idv }]); }
          case 'insMember': w(); v().members.push({ org: params[0], user: params[1], role: 'owner', status: 'active' }); return rows([]);
          case 'updPrice': { w(); if (db.o.failAt === 'updPrice') throw Object.assign(new Error('x'), { code: '23514' }); const x = [...v().variants.values()].find((q) => q.id === params[0]); if (!x || (x.base !== null && x.base !== params[1]) || (x.floor !== null && x.floor !== params[2])) return { rows: [], rowCount: 0 }; x.base = params[1]; x.floor = params[2]; return { rows: [], rowCount: 1 }; }
          case 'insAssign': w(); v().assigns.push({ org: params[0], product: params[1], available: true }); return rows([]);
          case 'insRule': w(); v().rules.push({ org: params[0], kind: params[1], type: params[2], value: Number(params[3]), active: true }); return rows([]);
          case 'audit': w(); v().audit += 1; return rows([{ id: 'a1' }]);
          case 'expected': { const b = BigInt(params[0]); let u = b + (b * BigInt(params[2]) + 500000n) / 1000000n; if (params[3] === 'fixed') u += (BigInt(params[4]) + 50n) / 100n; const f = BigInt(params[1]); return rows([{ unit: String(u > f ? u : f) }]); }
          case 'rpcCatalog': case 'rpcCart': case 'rpcOrders': {
            if (role !== 'authenticated' || !claims?.sub) throw Object.assign(new Error('denied'), { code: '42501' });
            const s = v(); const org = [...s.orgs.values()].find((x) => x.id === params[0]); const isMember = org && s.members.some((m) => m.org === org.id && m.user === claims.sub);
            if (!isMember) return rows([{ r: { ok: false, code: 'organization_not_found' } }]);
            if (id === 'rpcCart') return rows([{ r: { ok: true, lines: db.o.cartLines ?? [] } }]); if (id === 'rpcOrders') return rows([{ r: { ok: true, orders: db.o.orderRows ?? [] } }]);
            const items = []; for (const a of s.assigns.filter((x) => x.org === org.id && x.available)) { const vars = [...s.variants.values()].filter((x) => x.product_id === a.product && x.base !== null); if (!vars.length) continue; items.push({ slug: vars[0].slug, variants: vars.map((x) => ({ sku: x.sku, unit_cents: db.o.badPrice === x.sku ? 1 : unitOf(s, org.id, x.base, x.floor), ...(db.o.leakCost ? { base_price_cents: x.base } : {}) })) }); }
            return rows([{ r: { ok: true, items: db.o.dropItem ? items.slice(1) : items } }]);
          }
          default: throw new Error(`FAKE: no handler for ${id}`);
        }
      },
    };
  }
}
async function run(opts = {}, mode = 'dry', extra = {}) {
  const db = new Fake(opts); const lines = []; const reporter = makeReporter((s) => lines.push(s)); const sqlLog = [];
  const markupMode = extra.markupMode ?? MODE; const ownerEmail = extra.ownerEmail ?? OWNER;
  const res = await P.runProvision({ mode, connect: () => db.connect(), manifest: M, manifestSha: MSHA, ownerEmail, markupMode, approvalRef: REF, approved: P.approvalString(MSHA, ownerEmail, markupMode, REF), commitFlag: mode === 'commit', commitEnv: 'yes', reporter, sqlLog, ...extra });
  return { res, db, lines, reporter, sqlLog, ids: db.events.map((e) => e.id) };
}
const cnt = (ids, id) => ids.filter((x) => x === id).length; const wrote = (ids) => ids.some((x) => P.WRITERS.includes(x));
const clean = (r) => r.db.s.orgs.size === 0 && r.db.s.members.length === 0 && r.db.s.assigns.length === 0 && r.db.s.rules.length === 0 && [...r.db.s.variants.values()].every((x) => x.base === null) && r.db.s.audit === 0 && r.db.violations.length === 0;

// ============================================================ A. manifest, plan and preview
t('A1 the pinned manifest and seed verify; 10 products, 20 variants, all from the persisted seed; floor = base; no e-mail, mode or secret in the manifest', loaded.ok, loaded.checks.filter((c) => !c.ok).map((c) => c.n).join('; '));
{
  const FILES = [P.PINS.manifestFile, P.PINS.seedFile]; const mk = (mut) => { const d = mkdtempSync(join(tmpdir(), 'prov-')); for (const f of FILES) { mkdirSync(join(d, f, '..'), { recursive: true }); copyFileSync(join(ROOT, f), join(d, f)); } mut?.(d); return d; };
  for (const [label, mut] of [['the manifest differs by one byte', (d) => writeFileSync(join(d, P.PINS.manifestFile), readFileSync(join(d, P.PINS.manifestFile), 'utf8') + ' ')], ['the seed differs by one byte', (d) => writeFileSync(join(d, P.PINS.seedFile), readFileSync(join(d, P.PINS.seedFile), 'utf8') + '\n-- x\n')],
    ['a SKU not in the seed is added to the manifest', (d) => { const m = JSON.parse(readFileSync(join(d, P.PINS.manifestFile), 'utf8')); m.products[0].variants[0].sku = 'INVENTED-SKU-1'; writeFileSync(join(d, P.PINS.manifestFile), JSON.stringify(m, null, 2) + '\n'); }]]) {
    const d = mk(mut); const x = P.loadManifest(d); t(`A2 refused: ${label}`, x.ok === false); rmSync(d, { recursive: true, force: true });
  }
  const d = mk(); t('A2 an unmodified copy verifies (the tamper tests are meaningful)', P.loadManifest(d).ok); rmSync(d, { recursive: true, force: true });
}
t('A3 preview arithmetic: BPC-157 5mg $32.00 -> 15 percent $4.80 -> $36.80; plus the $5.00 representative amount -> $41.80; the floor (= base) never binds', (() => { const a = P.previewUnit(3200, 3200, MODE, M.pricing); const b = P.previewUnit(3200, 3200, 'org_percent_only', M.pricing); return a.unit === 4180 && b.unit === 3680 && a.orgAmount === 480 && a.repAmount === 500 && !a.floorApplied; })());
t('A3 rounding is half away from zero on the markup amount (e.g. 3330 cents x 15 percent = 499.5 -> 500) and a floor above the marked-up price wins', P.previewUnit(3330, 3330, 'org_percent_only', M.pricing).orgAmount === 500 && P.previewUnit(1000, 5000, MODE, M.pricing).unit === 5000 && P.previewUnit(1000, 5000, MODE, M.pricing).floorApplied);
t('A4 every previewed price is at least its floor and at least base x 1.15 (rounded), in both modes', plan.items.every((i) => i.preview.unit >= i.floorCents && i.preview.unit >= i.baseCents + Math.round(i.baseCents * 0.15) - 1) && P.buildPlan(M, OWNER, 'org_percent_only').items.every((i) => i.preview.unit >= i.floorCents));
t('A5 the plan lists the organization, the owner placeholder and all 20 SKUs for both markup options', (() => { const f = P.formatPlan(M); return f.includes('99PW-DEV-001') && f.includes('<owner email supplied at run time>') && plan.items.every((i) => f.includes(i.sku)) && f.includes('$41.80') && f.includes('$36.80'); })());

// ============================================================ B. dry run
{
  const r = await run({}, 'dry');
  t('B1 dry run: 34 proposed changes (1 organization, 1 membership, 20 prices, 10 assignments, 2 markup rules) are applied in ONE transaction, verified, then ROLLED BACK; COMMIT is never sent; nothing persists', r.res.outcome === 'dry_run_rolled_back' && r.res.exitCode === EXIT.OK && r.res.wrote.length === 34 && cnt(r.ids, 'commit') === 0 && clean(r) && r.reporter.failed() === 0, `${r.res.wrote.length} writes`);
  t('B1 dry run: every write ran inside the transaction, after the advisory lock and the in-transaction re-check', (() => { const e = r.db.events; const lock = e.findIndex((x) => x.id === 'lock'); return e.filter((x) => P.WRITERS.includes(x.id)).every((x) => x.inTx) && e.findIndex((x) => P.WRITERS.includes(x.id)) > lock && e.findIndex((x) => x.id === 'insOrg') > e.findLastIndex((x, i) => i < e.findIndex((q) => q.id === 'insOrg') && x.id === 'variants'); })());
  t('B2 the report lists every proposed insert and update before any write', r.lines.some((l) => /PROPOSED CHANGES \(34\)/.test(l)) && r.lines.filter((l) => /^\s+(INSERT|UPDATE)/.test(l)).length === 34);
  const r2 = await run({}, 'dry', { markupMode: 'org_percent_only' }); t('B3 the org_percent_only mode proposes 33 changes (one markup rule) and verifies', r2.res.wrote.length === 33 && r2.res.exitCode === EXIT.OK && r2.reporter.failed() === 0);
}

// ============================================================ C. commit
{
  const r = await run({}, 'commit');
  t('C1 commit: persists exactly the proposed records; outcome committed_verified; ONE commit, after the in-transaction verification; post-commit verification on a fresh connection', r.res.outcome === 'committed_verified' && r.res.exitCode === EXIT.OK && r.db.s.orgs.size === 1 && r.db.s.members.length === 1 && r.db.s.assigns.length === 10 && r.db.s.rules.length === 2 && [...r.db.s.variants.values()].filter((x) => x.base !== null).length === 20 && cnt(r.ids, 'commit') === 1 && r.ids.lastIndexOf('rpcCatalog') > r.ids.indexOf('commit') && r.db.connects === 3);
  t('C2 commit: prices and floors persisted equal the manifest (floor = base); the owner is an active owner; both rules exist; one audit event; no cart, order or staff', [...r.db.s.variants.values()].every((x) => { const mv = M.products.flatMap((p) => p.variants).find((v) => v.sku === x.sku); return x.base === mv.baseCents && x.floor === mv.floorCents; }) && r.db.s.members[0].role === 'owner' && r.db.s.rules.map((x) => `${x.kind}:${x.type}:${x.value}`).sort().join() === 'organization:percent:150000,representative:fixed:50000' && r.db.s.audit === 1 && r.db.s.orders === 0 && r.db.s.carts === 0 && r.db.s.staff === 0);
  t('C3 commit: the only writing statements are the organization, membership, price updates, assignments, markup rules, one audit call and ONE commit; no write outside a transaction', r.ids.filter((x) => P.WRITERS.includes(x)).filter((x, i, a) => a.indexOf(x) === i).join() === 'insOrg,insMember,updPrice,insAssign,insRule,audit,commit' && r.db.violations.length === 0);
  const again = new Fake({}); again.s = r.db.s; const lines = []; const rep2 = makeReporter((s) => lines.push(s));
  const res2 = await P.runProvision({ mode: 'commit', connect: () => again.connect(), manifest: M, manifestSha: MSHA, ownerEmail: OWNER, markupMode: MODE, approvalRef: REF, approved: P.approvalString(MSHA, OWNER, MODE, REF), commitFlag: true, commitEnv: 'yes', reporter: rep2 });
  t('D1 idempotent: a second run finds every record present, proposes NOTHING, writes nothing, never opens a write transaction, and still verifies through the RPCs (already_provisioned_verified)', res2.outcome === 'already_provisioned_verified' && res2.exitCode === EXIT.OK && !again.events.some((e) => P.WRITERS.includes(e.id)) && lines.some((l) => /none: every record already matches/.test(l)) && again.commits === 0 && rep2.failed() === 0);
}

// ============================================================ E. authorization and input refusals (before any connection)
for (const [label, extra] of [['no --commit flag', { commitFlag: false }], ['P3_FIXTURES_COMMIT not yes', { commitEnv: 'no' }], ['no approval string', { approved: undefined }], ['approval for another owner', { approved: P.approvalString(MSHA, 'x@example.test', MODE, REF) }],
  ['approval for the other markup mode', { approved: P.approvalString(MSHA, OWNER, 'org_percent_only', REF) }], ['approval for another manifest hash', { approved: P.approvalString('0'.repeat(64), OWNER, MODE, REF) }], ['approval with another reference', { approved: P.approvalString(MSHA, OWNER, MODE, 'OTHER-REF') }]]) {
  const r = await run({}, 'commit', extra); t(`E1 commit refused before connecting (${label})`, r.res.exitCode === EXIT.REFUSED_FLAGS && r.db.connects === 0 && r.db.events.length === 0);
}
for (const [label, extra] of [['no markup mode', { markupMode: undefined }], ['an unknown markup mode', { markupMode: 'both' }], ['no owner e-mail', { ownerEmail: '' }], ['a malformed owner e-mail', { ownerEmail: 'nope' }], ['an approval reference with spaces', { approvalRef: 'a b c d' }]]) {
  const r = await run({}, 'dry', { ...extra, approved: 'x' }); t(`E2 inputs refused before connecting (${label})`, r.res.exitCode === EXIT.REFUSED_FLAGS && r.db.connects === 0);
}

// ============================================================ F. state refusals (nothing written)
const refuse = async (label, opts, outcome) => { const r = await run(opts, 'commit'); t(`F1 refused: ${label} (${outcome})`, r.res.outcome === outcome && r.res.exitCode === EXIT.REFUSED_STATE && !wrote(r.ids) && cnt(r.ids, 'begin') === 0 && r.db.commits === 0 && r.db.violations.length === 0); };
await refuse('the P3 migration is not applied', { p3Missing: true }, 'refused_p3_not_applied');
await refuse('the owner does not exist (no account is created)', { user: null }, 'refused_owner_missing');
await refuse('the owner is unconfirmed', { user: { confirmed: false } }, 'refused_owner_ineligible'); await refuse('the owner is banned', { user: { banned: true } }, 'refused_owner_ineligible'); await refuse('the owner is deleted', { user: { deleted: true } }, 'refused_owner_ineligible');
await refuse('the owner is a staff member', { user: { is_staff: true } }, 'refused_owner_ineligible');
await refuse('a manifest SKU does not exist in the catalog (nothing is invented)', { dropSku: 'KPV-5MGX10' }, 'refused_variant_missing');
await refuse('a variant belongs to another product', { variantPatch: { 'KPV-5MGX10': { slug: 'something-else' } } }, 'refused_catalog_mismatch'); await refuse('a product is archived', { variantPatch: { 'KPV-5MGX10': { pstatus: 'archived' } } }, 'refused_catalog_mismatch');
await refuse('a variant already has a DIFFERENT base price (never overwritten)', { variantPatch: { 'KPV-5MGX10': { base: 999, floor: 999 } } }, 'refused_price_conflict');
await refuse('a variant has the right base but a different floor', { variantPatch: { 'KPV-5MGX10': { base: 3000, floor: 3100 } } }, 'refused_price_conflict');
await refuse('the organization code exists with another name', { initial: () => ({ orgs: new Map([['99PW-DEV-001', { id: 'b0000000-0000-4000-8000-000000000009', name: 'Someone Else Ltd', code: '99PW-DEV-001', status: 'active', payment_terms: 'prepay' }]]) }) }, 'refused_org_conflict');
const orgExisting = (extra = {}) => () => ({ orgs: new Map([['99PW-DEV-001', { id: 'b0000000-0000-4000-8000-000000000009', name: '99 Purity Demo Wholesale', code: '99PW-DEV-001', status: 'active', payment_terms: 'prepay' }]]), ...extra });
await refuse('the owner is already a removed member of the organization', { initial: orgExisting({ members: [{ org: 'b0000000-0000-4000-8000-000000000009', user: OWNER_ID, role: 'owner', status: 'removed' }] }) }, 'refused_membership_conflict');
await refuse('the owner is a plain member rather than an owner', { initial: orgExisting({ members: [{ org: 'b0000000-0000-4000-8000-000000000009', user: OWNER_ID, role: 'member', status: 'active' }] }) }, 'refused_membership_conflict');
await refuse('an existing organization markup rule has a different value', { initial: orgExisting({ rules: [{ org: 'b0000000-0000-4000-8000-000000000009', kind: 'organization', type: 'percent', value: 100000, active: true }] }) }, 'refused_rule_conflict');
await refuse('an unexpected extra markup rule exists for the organization', { initial: orgExisting({ rules: [{ org: 'b0000000-0000-4000-8000-000000000009', kind: 'organization', type: 'percent', value: 150000, active: true }, { org: 'b0000000-0000-4000-8000-000000000009', kind: 'representative', type: 'percent', value: 10000, active: true }] }) }, 'refused_rule_conflict');
{ const r = await run({ failConnectAt: 1 }, 'commit'); t('F2 a TLS/connection failure stops the run (exit 3) with ZERO statements; only the error code is logged', r.res.exitCode === EXIT.REFUSED_TARGET && r.db.events.length === 0 && r.lines.some((l) => /DEPTH_ZERO_SELF_SIGNED_CERT/.test(l)) && !r.lines.join('\n').includes('S3CR3T')); }

// ============================================================ G. failures, verification and ambiguity
for (const at of ['insOrg', 'updPrice']) { const r = await run({ failAt: at }, 'commit'); t(`G1 a failing write (${at}) rolls everything back: rolled_back_error, exit 1, COMMIT never sent, nothing persisted`, r.res.outcome === 'rolled_back_error' && r.res.exitCode === EXIT.FAILED_ROLLED_BACK && r.db.commits === 0 && clean(r)); }
for (const [label, opts] of [['the database returns a different price than private.shop_compose computes', { badPrice: 'KPV-5MGX10' }], ['a cost field leaks into the customer catalog', { leakCost: true }], ['a product is missing from the customer catalog', { dropItem: true }],
  ['the cart is not empty', { cartLines: [{ x: 1 }] }], ['an order exists', { orderRows: [{ x: 1 }] }]]) {
  const r = await run(opts, 'commit'); t(`G2 application-facing verification fails (${label}): ROLLBACK, COMMIT never sent even in commit mode, nothing persisted`, r.res.outcome === 'rolled_back_verification_failed' && r.db.commits === 0 && clean(r) && r.reporter.failed() >= 1);
}
{
  const o1 = await run({ orders: 1 }, 'commit'); t('G3 an existing order anywhere makes the in-transaction count check fail: rolled back', o1.res.outcome === 'rolled_back_verification_failed' && o1.db.commits === 0);
  const a = await run({ failCommit: 'before' }, 'commit'); t('G4 COMMIT fails and nothing persisted: sent once, commit_error_not_persisted_verified_clean, exit 6', a.res.outcome === 'commit_error_not_persisted_verified_clean' && a.res.exitCode === EXIT.COMMIT_AMBIGUOUS && cnt(a.ids, 'commit') === 1 && clean(a));
  const b = await run({ failCommit: 'after' }, 'commit'); t('G5 COMMIT reports an error but the state persisted: no retry or repair, commit_error_but_persisted_verified, exit 6', b.res.outcome === 'commit_error_but_persisted_verified' && b.res.exitCode === EXIT.COMMIT_AMBIGUOUS && cnt(b.ids, 'commit') === 1 && b.db.s.orgs.size === 1);
  const c = await run({ postCommitTamper: true }, 'commit'); t('G6 post-commit verification failing after a successful COMMIT: committed_verification_failed, exit 5, no cleanup or further writes', c.res.outcome === 'committed_verification_failed' && c.res.exitCode === EXIT.COMMITTED_BUT_UNVERIFIED && !c.ids.slice(c.ids.indexOf('commit') + 1).some((x) => P.WRITERS.includes(x)));
}

// ============================================================ H. allow-list and static review
{
  const send = P.makeSender([]); const c = { query: async () => ({ rows: [] }) }; const refused = [];
  for (const text of ['insert into auth.users (id) values (1)', 'insert into public.staff_members (user_id) values (1)', 'insert into public.carts (organization_id, user_id) values (1, 2)', 'insert into public.orders (organization_id) values (1)', 'delete from public.organizations', 'update public.product_variants set base_price_cents = 1', 'truncate public.markup_rules', "insert into public.organization_members (organization_id, user_id, role, status) values ($1::uuid, $2::uuid, 'member', 'active')", 'commit; select 1']) { try { send(c, text); } catch (e) { if (/NOT ALLOW-LISTED/.test(e.message)) refused.push(text); } }
  t('H1 SQL outside the registry (Auth users, staff, carts, orders, deletes, unbounded updates, a member role other than owner) is refused BEFORE sending', refused.length === 9);
  const writers = Object.entries(SQL).filter(([, x]) => /^\s*(insert|update|delete|truncate)/i.test(x) || /private\.write_audit\(/.test(x) || /^commit$/i.test(x)).map(([id]) => id).sort();
  t('H2 the only writing statements in the registry are the organization, membership (owner only), variant price update (bounded to one id and NULL-or-equal prices), assignment, markup rule, audit call and COMMIT', JSON.stringify(writers) === JSON.stringify(['audit', 'commit', 'insAssign', 'insMember', 'insOrg', 'insRule', 'updPrice']) && /'owner', 'active'/.test(SQL.insMember) && /where id = \$1::uuid and \(base_price_cents is null or base_price_cents = \$2::integer\)/.test(SQL.updPrice));
  const src = readFileSync(TOOL, 'utf8'); const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  t('H3 one COMMIT site; no retry; strict TLS builder and assertTls; no connection string; no service role; the only environment variables are P2_DATABASE_URL, P3_FIXTURES_APPROVED and P3_FIXTURES_COMMIT', (code.match(/S\.commit\b/g) ?? []).length === 1 && !/\bretry|setTimeout|while\s*\(true\)/.test(code) && /buildClientConfig\(tg\)/.test(code) && /assertTls\(k\)/.test(code) && !/connectionString/.test(code) && !/SERVICE_ROLE|service_role_key/i.test(code) && [...code.matchAll(/process\.env\.(\w+)/g)].every((m) => ['P2_DATABASE_URL', 'P3_FIXTURES_APPROVED', 'P3_FIXTURES_COMMIT'].includes(m[1])));
  t('H4 no Auth user, staff, cart or order is ever written; passwords, tokens and error messages are never logged; the result file holds no e-mail', !/insert into auth\./i.test(code) && !/staff_members \(/.test(SQL.insMember) && !/(note|rep)\([^;]*(\.password|SECRETS|\.message)/.test(code) && !/ownerEmail/.test(code.slice(code.indexOf('p3-dev-fixtures-result'), code.indexOf('p3-dev-fixtures-result') + 380)));
  t('H5 the project reference guard and the pinned CA come from the reviewed helper (apply-p3.mjs, hash-pinned before use)', /applySha === PINS\.applyHarnessSha/.test(code) && P.PINS.ref === 'semtmllmwhxznxechfsk' && P.PINS.applyHarnessSha === '2c543932f88daecdd426f5689043b1acea053b47d6f6379669fa2fc915570fb7');
}

// ============================================================ I. CLI (offline modes and refusals before any connection)
{
  const env = { ...process.env }; delete env.P2_DATABASE_URL; delete env.P3_FIXTURES_APPROVED; delete env.P3_FIXTURES_COMMIT; const cli = (args, e = env) => spawnSync('node', [TOOL, ...args], { encoding: 'utf8', env: e, timeout: 60000 });
  const planOut = cli(['--offline-plan']); const self = (planOut.stdout.match(/recorded sha256 \(printed for the approval\)  \(([0-9a-f]{64})\)/) ?? [])[1];
  t('I1 --offline-plan prints the plan for both markup options and the script and manifest hashes; no connection, no environment read; exit 0', planOut.status === 0 && Boolean(self) && /offline plan: \d+ passed, 0 FAILED/.test(planOut.stdout) && /\$41\.80/.test(planOut.stdout) && /no environment file was read/.test(planOut.stdout));
  for (const [label, args] of [['no --harness-sha', ['--owner-email', OWNER, '--markup-mode', MODE, '--approval-ref', REF]], ['a wrong --harness-sha', ['--harness-sha', '0'.repeat(64), '--owner-email', OWNER, '--markup-mode', MODE, '--approval-ref', REF]], ['no credentials available', ['--harness-sha', self, '--owner-email', OWNER, '--markup-mode', MODE, '--approval-ref', REF]], ['no markup mode', ['--harness-sha', self, '--owner-email', OWNER, '--approval-ref', REF]]]) {
    const r = cli(args); t(`I2 CLI refuses (${label}): exit 2 before any connection`, r.status === 2 && !/PRE-STATE|transaction|URL host/.test(r.stdout), `exit ${r.status}`);
  }
  const fake = 'postgresql://postgres:placeholder@db.semtmllmwhxznxechfsk.supabase.co:5432/postgres'; // placeholder: every case below must refuse BEFORE connecting
  for (const [label, args, e] of [['commit without approval variables', ['--commit'], {}], ['commit with a wrong approval string', ['--commit'], { P3_FIXTURES_COMMIT: 'yes', P3_FIXTURES_APPROVED: 'approve-p3-dev-fixtures:wrong' }]]) {
    const r = cli(['--harness-sha', self, '--owner-email', OWNER, '--markup-mode', MODE, '--approval-ref', REF, ...args], { ...env, P2_DATABASE_URL: fake, ...e }); t(`I3 CLI refuses before connecting (${label}): exit 2`, r.status === 2 && !/PRE-STATE|URL host|transaction/.test(r.stdout), `exit ${r.status}`);
  }
}

console.log(bad === 0 ? 'all offline provisioning tests pass (fake database only: NOT evidence that the script works against the real database)' : `${bad} FAILED`); process.exit(bad ? 1 : 0);
