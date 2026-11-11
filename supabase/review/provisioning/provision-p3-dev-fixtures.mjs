// P3 DEVELOPMENT FIXTURE PROVISIONING (prepared offline; NEVER RUN against a database; execution needs the project owner's separate written approval).
// DEVELOPMENT ONLY: it creates the minimum records needed to test the real customer workflow on the hosted DEVELOPMENT project semtmllmwhxznxechfsk: one organization, one owner membership
// (an EXISTING confirmed Auth user supplied at run time), development base prices with floor = base for 20 existing variants of 10 existing products, the product assignments and the
// organization markup rule(s). It does not replace audited admin onboarding. It never creates an Auth user, never touches staff, never creates a cart or an order, and prices are DEVELOPMENT
// PLACEHOLDERS (not commercial prices). Authoritative customer prices come from the SQL pricing function; this tool only PREVIEWS them and then verifies, through the application-facing RPCs
// (the customer's own RPC calls with simulated claims, the Tier R technique), that the database returns exactly what private.shop_compose computes.
//
// MODES   --offline-plan  no network, no environment read: validates the manifest against the seed, prints every proposed record and the preview prices (both markup options)
//         --dry-run       connects; performs every write inside ONE transaction, verifies, then ROLLS BACK (nothing persists)   [default for a connected run]
//         --commit        persists. Needs ALL of: --commit, P3_FIXTURES_COMMIT=yes, P3_FIXTURES_APPROVED=<exact approval string>
// Required to connect: --harness-sha <this file's sha256>  --owner-email <address of an existing confirmed Auth user>  --markup-mode org_percent_plus_rep_fixed|org_percent_only  --approval-ref <ref>
// Credentials: --authorized-read-env-local (the single P2_DATABASE_URL line, in memory) or P2_DATABASE_URL in the process environment.
// Approval string (exact): approve-p3-dev-fixtures:<manifest sha256 first 12>:<owner e-mail lower case>:<markup mode>:<approval-ref>
// Idempotent: records that already match are skipped; a record that exists with DIFFERENT content (organization name, a price, a markup rule, a membership) is REFUSED, never overwritten.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha, checkTarget, buildClientConfig, assertTls, makeReporter, setSecrets, clean, PINS as APPLY } from '../tests/apply-p3.mjs';

const ROOT = 'D:/99puritywholesale-platform/99puritywholesale';
const SCRATCH = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
export const PINS = {
  applyHarnessSha: '2c543932f88daecdd426f5689043b1acea053b47d6f6379669fa2fc915570fb7', applyHarnessFile: 'supabase/review/tests/apply-p3.mjs',
  manifestFile: 'supabase/review/provisioning/p3-dev-fixtures.manifest.json', manifestSha: '3af56f54b190ed74ea3883287f8a3a2d57885dfac094cdf30506b41cc1b39acf',
  seedFile: 'supabase/review/p3/seed-products.sql', seedSha: '1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164',
  ref: APPLY.ref, p3Version: '20261110000100',
};
export const MODES = ['org_percent_plus_rep_fixed', 'org_percent_only'];
export const EXIT = { OK: 0, FAILED_ROLLED_BACK: 1, REFUSED_FLAGS: 2, REFUSED_TARGET: 3, REFUSED_STATE: 4, COMMITTED_BUT_UNVERIFIED: 5, COMMIT_AMBIGUOUS: 6, INCONSISTENT: 7 };
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,255}$/;
export const approvalString = (manifestSha, ownerEmail, mode, ref) => `approve-p3-dev-fixtures:${manifestSha.slice(0, 12)}:${ownerEmail.toLowerCase()}:${mode}:${ref}`;

// ---------------------------------------------------------------------------------------------------------------------------------------------- manifest, seed cross-check and PREVIEW prices
export function loadManifest(root = ROOT, pins = PINS) {
  const raw = readFileSync(join(root, pins.manifestFile)); const seed = readFileSync(join(root, pins.seedFile));
  const checks = []; const t = (n, ok, d = '') => checks.push({ n, ok: Boolean(ok), d });
  t('manifest sha256 equals the pinned hash', sha(raw) === pins.manifestSha, sha(raw).slice(0, 12)); t('seed sha256 equals the pinned hash', sha(seed) === pins.seedSha, sha(seed).slice(0, 12));
  let m = null; try { m = JSON.parse(raw.toString('utf8')); } catch { /* handled */ }
  t('manifest is valid JSON for this project, with no markup mode, owner e-mail or credential stored', Boolean(m) && m.projectRef === pins.ref && !('markupMode' in (m?.pricing ?? {})) && !/@/.test(JSON.stringify(m ?? {}).replace(/Wholesale buyer/g, '')) && !/password|secret|token/i.test(JSON.stringify(m ?? {}).replace(/ownerDecisionRequired[^}]*/g, '')));
  if (m) {
    const seedText = seed.toString('utf8'); const skus = m.products.flatMap((p) => p.variants.map((v) => v.sku));
    t('every manifest SKU and its product exist in the persisted seed (nothing is invented)', m.products.every((p) => p.variants.every((v) => seedText.includes(`('${p.slug}', '${v.spec}', '${v.sku}')`))));
    t('10 products and 20 variants, all SKUs unique', m.products.length === 10 && skus.length === 20 && new Set(skus).size === 20);
    t('every variant has floor equal to base and a positive integer cent price (development placeholders)', m.products.every((p) => p.variants.every((v) => Number.isInteger(v.baseCents) && v.baseCents > 0 && v.floorCents === v.baseCents)));
    t('organization fixture matches the requested name and code', m.organization.name === '99 Purity Demo Wholesale' && m.organization.code === '99PW-DEV-001' && /^[A-Z0-9][A-Z0-9-]{2,19}$/.test(m.organization.code));
    t('organization percentage markup is 15 percent and the fixed amount is $5.00 (value in 1e-4 units)', m.pricing.organizationPercentE4 === 150000 && m.pricing.representativeFixedE4 === 50000);
  }
  return { ok: checks.every((c) => c.ok), checks, manifest: m, manifestSha: sha(raw) };
}
/** PREVIEW only (the database computes the real price with private.shop_compose and the run verifies it): org percent amount on the base, rep fixed amount on the organization price, floor last. Round half away from zero. */
export function previewUnit(baseCents, floorCents, mode, pricing) {
  const base = BigInt(baseCents); const orgAmt = (base * BigInt(pricing.organizationPercentE4) + 500000n) / 1000000n; const orgPrice = base + orgAmt;
  const repAmt = mode === 'org_percent_plus_rep_fixed' ? (BigInt(pricing.representativeFixedE4) + 50n) / 100n : 0n;
  const raw = orgPrice + repAmt; const unit = raw > BigInt(floorCents) ? raw : BigInt(floorCents);
  return { orgAmount: Number(orgAmt), orgPrice: Number(orgPrice), repAmount: Number(repAmt), raw: Number(raw), unit: Number(unit), floorApplied: raw < BigInt(floorCents) };
}
export function buildPlan(m, ownerEmail, mode) {
  const items = m.products.flatMap((p) => p.variants.map((v) => ({ slug: p.slug, requested: p.requested, spec: v.spec, sku: v.sku, baseCents: v.baseCents, floorCents: v.floorCents, preview: previewUnit(v.baseCents, v.floorCents, mode, m.pricing) })));
  const rules = [{ kind: 'organization', type: 'percent', valueE4: m.pricing.organizationPercentE4 }, ...(mode === 'org_percent_plus_rep_fixed' ? [{ kind: 'representative', type: 'fixed', valueE4: m.pricing.representativeFixedE4 }] : [])];
  return { org: { code: m.organization.code, name: m.organization.name, paymentTerms: m.organization.paymentTerms }, ownerEmail, items, rules, assignments: m.products.map((p) => p.slug), mode };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------- exact-text SQL allow-list
const S = {
  begin: 'begin isolation level read committed', tlIdle: "set local idle_in_transaction_session_timeout = '300s'", tlStmt: "set local statement_timeout = '120s'", tlLock: "set local lock_timeout = '10s'",
  lock: "select pg_advisory_xact_lock(hashtextextended('p3-dev-fixtures', 0))", rollback: 'rollback', commit: 'commit', sp: 'savepoint r', spr: 'rollback to savepoint r', spx: 'release savepoint r',
  claims: "select set_config('request.jwt.claims', $1, true)", roleAuth: 'set local role authenticated', roleReset: 'reset role',
  p3: "select (select count(*)::int from supabase_migrations.schema_migrations where version = $1) hist, (to_regclass('public.markup_rules') is not null and to_regclass('public.organization_products') is not null and to_regclass('public.orders') is not null) objects",
  user: "select u.id::text id, (u.email_confirmed_at is not null) confirmed, (u.banned_until is not null and u.banned_until > now()) banned, (u.deleted_at is not null) deleted, exists (select 1 from public.staff_members s where s.user_id = u.id) is_staff from auth.users u where lower(u.email) = $1",
  org: 'select id::text id, name, code, status, payment_terms from public.organizations where code = $1',
  member: 'select role, status from public.organization_members where organization_id = $1::uuid and user_id = $2::uuid',
  variants: 'select v.id::text id, v.sku, v.base_price_cents, v.min_price_cents, p.id::text product_id, p.slug, p.status pstatus, v.status vstatus from public.product_variants v join public.products p on p.id = v.product_id where v.sku = any($1::text[])',
  assigns: 'select product_id::text product_id, available from public.organization_products where organization_id = $1::uuid',
  rules: 'select kind, product_id::text product_id, markup_type, value_e4::text value_e4, is_active from public.markup_rules where organization_id = $1::uuid',
  counts: 'select (select count(*)::int from public.organizations) orgs, (select count(*)::int from public.organization_members) members, (select count(*)::int from public.organization_products) assigns, (select count(*)::int from public.markup_rules) rules, (select count(*)::int from public.product_variants where base_price_cents is not null) priced, (select count(*)::int from public.orders) orders, (select count(*)::int from public.carts) carts, (select count(*)::int from public.staff_members) staff',
  insOrg: "insert into public.organizations (name, code, status, payment_terms) values ($1, $2, 'active', $3) returning id::text as id",
  insMember: "insert into public.organization_members (organization_id, user_id, role, status) values ($1::uuid, $2::uuid, 'owner', 'active')",
  updPrice: 'update public.product_variants set base_price_cents = $2::integer, min_price_cents = $3::integer, updated_at = now() where id = $1::uuid and (base_price_cents is null or base_price_cents = $2::integer) and (min_price_cents is null or min_price_cents = $3::integer)',
  insAssign: 'insert into public.organization_products (organization_id, product_id, available) values ($1::uuid, $2::uuid, true)',
  insRule: 'insert into public.markup_rules (organization_id, kind, product_id, markup_type, value_e4, is_active) values ($1::uuid, $2, null, $3, $4::bigint, true)',
  audit: "select private.write_audit(null, 'system', 'dev.fixtures.provision', 'success', $1::uuid, 'organization', $1::text, $2::jsonb)::text as id",
  expected: "select (private.shop_compose($1::integer, $2::integer, 'percent', $3::bigint, $4::text, $5::bigint, null, null, null, null) ->> 'unit') as unit",
  rpcCatalog: 'select public.rpc_catalog_list($1::uuid) as r', rpcCart: 'select public.rpc_cart_get($1::uuid) as r', rpcOrders: 'select public.rpc_orders_list($1::uuid, 10) as r',
};
export const SQL = S;
const ALLOWED = new Map(Object.entries(S).map(([id, t]) => [norm(t), id]));
export const WRITERS = ['insOrg', 'insMember', 'updPrice', 'insAssign', 'insRule', 'audit', 'commit'];
export function makeSender(log = []) { return (c, text, params) => { const id = ALLOWED.get(norm(text)); if (!id) throw new Error('STATEMENT NOT ALLOW-LISTED (refused before sending)'); log.push(id); return c.query(text, params); }; }

// ---------------------------------------------------------------------------------------------------------------------------------------------- the run
/** o: { mode: 'dry'|'commit', connect, manifest, manifestSha, ownerEmail, markupMode, approvalRef, approved, commitFlag, commitEnv, reporter, sqlLog? } */
export async function runProvision(o) {
  const { rep, note } = o.reporter; const send = makeSender(o.sqlLog ?? []); const m = o.manifest;
  const out = { outcome: null, exitCode: EXIT.FAILED_ROLLED_BACK, committed: false, wrote: [] };
  const email = String(o.ownerEmail ?? '').trim().toLowerCase(); const ref = String(o.approvalRef ?? '');
  const inputsOk = EMAIL.test(email) && MODES.includes(o.markupMode) && ref.length >= 4 && ref.length <= 120 && !/\s/.test(ref);
  rep('inputs: an owner e-mail, a markup mode (org_percent_plus_rep_fixed or org_percent_only) and an approval reference (no spaces) are required', inputsOk);
  if (!inputsOk) { out.outcome = 'refused_inputs'; out.exitCode = EXIT.REFUSED_FLAGS; return out; }
  if (o.mode === 'commit') {
    const okA = o.commitFlag === true && o.commitEnv === 'yes' && o.approved === approvalString(o.manifestSha, email, o.markupMode, ref);
    rep('commit needs --commit, P3_FIXTURES_COMMIT=yes and the exact approval string for THIS manifest, owner e-mail, markup mode and reference', okA);
    if (!okA) { out.outcome = 'refused_commit_authorization'; out.exitCode = EXIT.REFUSED_FLAGS; return out; }
  }
  const plan = buildPlan(m, email, o.markupMode); const skus = plan.items.map((i) => i.sku);
  let before = null; let tx = null; let txOpen = false; let commitSent = false; let gatesOk = false; let ctx = null;

  /** Reads the current state and decides EXACTLY which writes are needed; refuses on any conflict. */
  const survey = async (c, label) => {
    const p3 = (await send(c, S.p3, [PINS.p3Version])).rows[0]; rep(`${label}: the P3 migration is applied (history entry and tables exist)`, p3.hist === 1 && p3.objects === true);
    if (!(p3.hist === 1 && p3.objects === true)) return { refuse: 'refused_p3_not_applied' };
    const u = (await send(c, S.user, [email])).rows[0];
    rep(`${label}: the owner is an EXISTING Auth user (it is never created by this tool)`, Boolean(u)); if (!u) return { refuse: 'refused_owner_missing' };
    const uOk = u.confirmed && !u.banned && !u.deleted && !u.is_staff; rep(`${label}: the owner's e-mail is confirmed, the account is not banned or deleted, and it is NOT staff (staff cannot be members)`, uOk); if (!uOk) return { refuse: 'refused_owner_ineligible' };
    const vs = (await send(c, S.variants, [skus])).rows; const bySku = new Map(vs.map((r) => [r.sku, r]));
    const found = plan.items.every((i) => bySku.has(i.sku)); rep(`${label}: all ${skus.length} SKUs exist in the catalog (nothing is invented)`, found, found ? '' : plan.items.filter((i) => !bySku.has(i.sku)).map((i) => i.sku).join(',')); if (!found) return { refuse: 'refused_variant_missing' };
    const catOk = plan.items.every((i) => { const r = bySku.get(i.sku); return r.slug === i.slug && r.pstatus === 'active' && r.vstatus === 'active'; }); rep(`${label}: every variant belongs to the expected ACTIVE product and is active`, catOk); if (!catOk) return { refuse: 'refused_catalog_mismatch' };
    const conflicts = plan.items.filter((i) => { const r = bySku.get(i.sku); return (r.base_price_cents !== null && r.base_price_cents !== i.baseCents) || (r.min_price_cents !== null && r.min_price_cents !== i.floorCents); });
    rep(`${label}: no variant already carries a DIFFERENT price (nothing is overwritten)`, conflicts.length === 0, conflicts.map((i) => i.sku).join(',')); if (conflicts.length) return { refuse: 'refused_price_conflict' };
    const org = (await send(c, S.org, [m.organization.code])).rows[0];
    if (org) { const same = org.name === m.organization.name && org.status === 'active' && org.payment_terms === m.organization.paymentTerms; rep(`${label}: the organization ${m.organization.code} already exists with exactly the manifest content`, same); if (!same) return { refuse: 'refused_org_conflict' }; }
    const orgId = org?.id ?? null; const actions = [];
    if (!orgId) actions.push({ op: 'insOrg', desc: `INSERT organization ${m.organization.code} "${m.organization.name}" (payment terms ${m.organization.paymentTerms}, status active)` });
    let mem = null, as = [], rl = [];
    if (orgId) { mem = (await send(c, S.member, [orgId, u.id])).rows[0] ?? null; as = (await send(c, S.assigns, [orgId])).rows; rl = (await send(c, S.rules, [orgId])).rows; }
    if (mem && !(mem.role === 'owner' && mem.status === 'active')) { rep(`${label}: the owner's existing membership matches (active owner)`, false); return { refuse: 'refused_membership_conflict' }; }
    if (!mem) actions.push({ op: 'insMember', desc: `INSERT membership: owner (user ${u.id}) in ${m.organization.code}` });
    for (const i of plan.items) { const r = bySku.get(i.sku); if (r.base_price_cents === null || r.min_price_cents === null) actions.push({ op: 'updPrice', sku: i.sku, id: r.id, base: i.baseCents, floor: i.floorCents, desc: `UPDATE ${i.sku}: base ${i.baseCents} cents, floor ${i.floorCents} cents (development placeholder)` }); }
    const prodIds = new Map(vs.map((r) => [r.slug, r.product_id]));
    for (const slug of plan.assignments) { const pid = prodIds.get(slug); const a = as.find((x) => x.product_id === pid); if (a && a.available !== true) { rep(`${label}: existing assignment of ${slug} is available`, false); return { refuse: 'refused_assignment_conflict' }; } if (!a) actions.push({ op: 'insAssign', productId: pid, desc: `INSERT assignment: ${slug} available for ${m.organization.code}` }); }
    for (const r of plan.rules) { const ex = rl.find((x) => x.kind === r.kind && x.product_id === null); if (ex && !(ex.markup_type === r.type && ex.value_e4 === String(r.valueE4) && ex.is_active === true)) { rep(`${label}: the existing ${r.kind} markup rule matches`, false); return { refuse: 'refused_rule_conflict' }; } if (!ex) actions.push({ op: 'insRule', rule: r, desc: `INSERT markup rule: ${r.kind} ${r.type} ${r.valueE4 / 10000}${r.type === 'percent' ? ' percent' : ' dollars'} for all products` }); }
    const extra = rl.filter((x) => !plan.rules.some((r) => r.kind === x.kind && x.product_id === null)); rep(`${label}: no other markup rule exists for the organization`, extra.length === 0); if (extra.length) return { refuse: 'refused_rule_conflict' };
    return { orgId, ownerId: u.id, bySku, prodIds, actions };
  };

  /** Application-facing verification: the owner's own RPC calls (simulated claims), the expected price from private.shop_compose, tenant isolation, no cost data, no cart or order. */
  const verify = async (c, orgId, ownerId, label, ownTx) => {
    if (ownTx) await send(c, S.begin);
    const as = async (rpc, arg) => { await send(c, S.sp); try { await send(c, S.claims, [JSON.stringify({ sub: ownerId, role: 'authenticated', aal: 'aal1', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] })]); await send(c, S.roleAuth); const r = await send(c, S[rpc], [arg]); await send(c, S.roleReset); await send(c, S.spx); return r.rows[0]?.r; } catch (e) { await send(c, S.spr); await send(c, S.spx); return { e: e.code ?? 'ERR' }; } };
    try {
      const cat = await as('rpcCatalog', orgId); const items = cat?.items ?? [];
      rep(`${label}: rpc_catalog_list answers ok for the owner's organization`, cat?.ok === true && Array.isArray(cat.items));
      const wantSlugs = [...plan.assignments].sort().join(); const gotSlugs = items.map((i) => i.slug).sort().join();
      rep(`${label}: the customer catalog lists exactly the 10 assigned products`, gotSlugs === wantSlugs, `${items.length} listed`);
      const got = new Map(items.flatMap((i) => i.variants.map((v) => [v.sku, v.unit_cents]))); const bad = []; let compared = 0;
      for (const i of plan.items) {
        const rules = { orgE4: m.pricing.organizationPercentE4, repType: o.markupMode === 'org_percent_plus_rep_fixed' ? 'fixed' : null, repE4: o.markupMode === 'org_percent_plus_rep_fixed' ? m.pricing.representativeFixedE4 : null };
        const exp = (await send(c, S.expected, [i.baseCents, i.floorCents, rules.orgE4, rules.repType, rules.repE4])).rows[0].unit; compared++;
        if (String(got.get(i.sku)) !== String(exp)) bad.push(i.sku);
        if (String(exp) !== String(i.preview.unit)) bad.push(`${i.sku}(preview)`);
      }
      rep(`${label}: each of the ${plan.items.length} variants shows exactly the price SQL computes (private.shop_compose), and the preview agrees`, bad.length === 0 && got.size === plan.items.length && compared === plan.items.length, bad.join(','));
      rep(`${label}: no cost data (base price, floor, markup, pricing) appears in the customer catalog`, !/base_price|min_price|floor|markup|pricing|org_amount|rep_amount/.test(JSON.stringify(cat ?? {})));
      const cart = await as('rpcCart', orgId); const ords = await as('rpcOrders', orgId);
      rep(`${label}: the cart is empty and there are no orders (this tool never creates either)`, cart?.ok === true && (cart.lines ?? []).length === 0 && ords?.ok === true && (ords.orders ?? []).length === 0);
      const other = await as('rpcCatalog', 'ffffffff-ffff-4fff-8fff-ffffffffffff'); rep(`${label}: tenant isolation: another organization id answers organization_not_found`, other?.ok === false && other.code === 'organization_not_found');
    } finally { if (ownTx) await send(c, S.rollback); }
  };

  try {
    let c0; try { c0 = await o.connect(); } catch (e) { rep('connection with strict TLS and the pinned CA', false, `error code ${e?.code ?? 'ERR'}`); out.outcome = 'refused_connect'; out.exitCode = EXIT.REFUSED_TARGET; return out; }
    try {
      ctx = await survey(c0, 'PRE-STATE'); if (ctx.refuse) { out.outcome = ctx.refuse; out.exitCode = EXIT.REFUSED_STATE; return out; }
      before = (await send(c0, S.counts)).rows[0]; gatesOk = true;
      note(`PROPOSED CHANGES (${ctx.actions.length}):`); for (const a of ctx.actions) note(`  ${a.desc}`);
      if (ctx.actions.length === 0) { note('  (none: every record already matches)'); if (ctx.orgId) { await verify(c0, ctx.orgId, ctx.ownerId, 'ALREADY-PROVISIONED', true); } out.outcome = o.reporter.failed() === 0 ? 'already_provisioned_verified' : 'already_provisioned_verification_failed'; out.exitCode = o.reporter.failed() === 0 ? EXIT.OK : EXIT.FAILED_ROLLED_BACK; return out; }
    } finally { await c0.end().catch(() => {}); }
    tx = await o.connect(); await send(tx, S.begin); txOpen = true; await send(tx, S.tlIdle); await send(tx, S.tlStmt); await send(tx, S.tlLock); await send(tx, S.lock);
    const again = await survey(tx, 'IN-TX RE-CHECK');
    if (again.refuse || JSON.stringify(again.actions.map((a) => a.desc)) !== JSON.stringify(ctx.actions.map((a) => a.desc))) { await send(tx, S.rollback); txOpen = false; out.outcome = again.refuse ? again.refuse.replace('refused_', 'refused_in_tx_') : 'refused_in_tx_state_changed'; out.exitCode = EXIT.REFUSED_STATE; }
    else {
      let orgId = again.orgId; const fails0 = o.reporter.failed();
      for (const a of again.actions) {
        if (a.op === 'insOrg') { orgId = (await send(tx, S.insOrg, [m.organization.name, m.organization.code, m.organization.paymentTerms])).rows[0].id; }
        else if (a.op === 'insMember') await send(tx, S.insMember, [orgId, again.ownerId]);
        else if (a.op === 'updPrice') { const r = await send(tx, S.updPrice, [a.id, a.base, a.floor]); rep(`price set for ${a.sku} (exactly one row)`, r.rowCount === 1); }
        else if (a.op === 'insAssign') await send(tx, S.insAssign, [orgId, a.productId]);
        else if (a.op === 'insRule') await send(tx, S.insRule, [orgId, a.rule.kind, a.rule.type, a.rule.valueE4]);
        out.wrote.push(a.op);
      }
      await send(tx, S.audit, [orgId, JSON.stringify({ manifest_sha256: o.manifestSha, approval_ref: ref, markup_mode: o.markupMode, changes: again.actions.length })]);
      rep(`${again.actions.length} proposed change(s) applied inside the transaction, plus one audit event (dev.fixtures.provision)`, o.reporter.failed() === fails0);
      const post = (await send(tx, S.counts)).rows[0];
      const exp = { orgs: before.orgs + (again.actions.some((a) => a.op === 'insOrg') ? 1 : 0), members: before.members + (again.actions.some((a) => a.op === 'insMember') ? 1 : 0), assigns: before.assigns + again.actions.filter((a) => a.op === 'insAssign').length, rules: before.rules + again.actions.filter((a) => a.op === 'insRule').length, priced: before.priced + again.actions.filter((a) => a.op === 'updPrice').length };
      rep('in-transaction counts changed by exactly the proposed changes; no cart, order or staff row exists', post.orgs === exp.orgs && post.members === exp.members && post.assigns === exp.assigns && post.rules === exp.rules && post.priced === exp.priced && post.orders === 0 && post.carts === 0 && post.staff === before.staff, JSON.stringify(post));
      await verify(tx, orgId, again.ownerId, 'in-tx', false);
      const verified = o.reporter.failed() === fails0;
      if (!verified) { await send(tx, S.rollback); txOpen = false; out.outcome = 'rolled_back_verification_failed'; out.exitCode = EXIT.FAILED_ROLLED_BACK; }
      else if (o.mode === 'dry') { await send(tx, S.rollback); txOpen = false; rep('DRY RUN: every write and every verification passed; ROLLBACK issued (nothing persisted)', null); out.outcome = 'dry_run_rolled_back'; out.exitCode = EXIT.OK; }
      else { note('COMMIT sent'); commitSent = true; try { await send(tx, S.commit); out.committed = true; txOpen = false; } catch (e) { out.commitError = e?.code ?? 'ERR'; txOpen = false; } out.orgId = orgId; out.ownerId = again.ownerId; out.expect = exp; }
    }
  } catch (e) {
    note(`ERROR during the transaction: ${clean(e?.code ?? 'ERR')}`);
    if (txOpen && !commitSent && tx) { try { await send(tx, S.rollback); note('ROLLBACK issued (after error)'); } catch { note('rollback after error failed (the server aborts an abandoned transaction)'); } txOpen = false; }
    out.outcome = out.outcome ?? 'rolled_back_error'; out.exitCode = commitSent ? EXIT.COMMIT_AMBIGUOUS : EXIT.FAILED_ROLLED_BACK;
  } finally { if (tx) await tx.end().catch(() => {}); }
  if (!gatesOk || !before) return out;
  let c1 = null;
  try {
    c1 = await o.connect(); const st = (await send(c1, S.counts)).rows[0]; const orgRow = (await send(c1, S.org, [m.organization.code])).rows[0];
    const persisted = Boolean(orgRow) && !ctx.orgId; const sameAsBefore = ['orgs', 'members', 'assigns', 'rules', 'priced', 'orders', 'carts', 'staff'].every((k) => st[k] === before[k]);
    if (out.committed || (commitSent && (persisted || st.orgs !== before.orgs))) {
      const f0 = o.reporter.failed(); const e = out.expect;
      rep('POST-COMMIT (fresh connection): counts equal the committed changes; no cart, order or staff row', st.orgs === e.orgs && st.members === e.members && st.assigns === e.assigns && st.rules === e.rules && st.priced === e.priced && st.orders === 0 && st.carts === 0, JSON.stringify(st));
      await verify(c1, orgRow?.id ?? out.orgId, out.ownerId, 'post-commit', true);
      const ok = o.reporter.failed() === f0; if (out.committed) { out.outcome = ok ? 'committed_verified' : 'committed_verification_failed'; out.exitCode = ok ? EXIT.OK : EXIT.COMMITTED_BUT_UNVERIFIED; } else { out.outcome = ok ? 'commit_error_but_persisted_verified' : 'commit_error_but_persisted_unverified'; out.exitCode = EXIT.COMMIT_AMBIGUOUS; }
    } else {
      rep('AFTER (fresh connection): nothing was persisted (every table count equals the before state)', sameAsBefore, JSON.stringify(st));
      if (commitSent) { out.outcome = sameAsBefore ? 'commit_error_not_persisted_verified_clean' : 'commit_error_not_persisted_but_state_differs'; out.exitCode = sameAsBefore ? EXIT.COMMIT_AMBIGUOUS : EXIT.INCONSISTENT; }
      else if (!sameAsBefore) { out.outcome = 'rollback_not_verified_clean'; out.exitCode = EXIT.INCONSISTENT; }
    }
  } catch (e) { rep('fresh-connection verification', false, `error code ${e?.code ?? 'ERR'}`); out.exitCode = commitSent || out.committed ? EXIT.COMMITTED_BUT_UNVERIFIED : EXIT.INCONSISTENT; out.outcome = (out.outcome ?? 'unknown') + '+fresh_verification_failed'; }
  finally { if (c1) await c1.end().catch(() => {}); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------- offline plan output and CLI
export function formatPlan(m, ownerEmailPlaceholder = '<owner email supplied at run time>') {
  const rows = []; const modes = MODES.map((x) => buildPlan(m, ownerEmailPlaceholder, x)); const [a, b] = modes;
  const money = (c) => `$${(c / 100).toFixed(2)}`;
  rows.push(`ORGANIZATION  ${a.org.code}  "${a.org.name}"  payment terms ${a.org.paymentTerms}  (type "Wholesale buyer" and currency USD are not stored by the schema)`);
  rows.push(`OWNER         the existing confirmed Auth user with e-mail ${ownerEmailPlaceholder} (role owner, active). No account is created.`);
  rows.push(`RULES  mode org_percent_plus_rep_fixed: organization percent 15 + representative fixed $5.00 (all products)   |   mode org_percent_only: organization percent 15`);
  rows.push('');
  rows.push('SKU'.padEnd(26) + 'product (requested -> catalog)'.padEnd(36) + 'spec'.padEnd(11) + 'base=floor'.padStart(11) + '  15%+$5.00'.padStart(12) + '   15% only'.padStart(11));
  for (const [i, it] of a.items.entries()) { const ct = m.products.find((p) => p.slug === it.slug).catalogName; rows.push(it.sku.padEnd(26) + `${it.requested} -> ${ct}`.slice(0, 34).padEnd(36) + it.spec.padEnd(11) + money(it.baseCents).padStart(11) + money(it.preview.unit).padStart(12) + money(b.items[i].preview.unit).padStart(11)); }
  return rows.join('\n');
}
function cliMain() {
  const argv = process.argv.slice(2); const flag = (n) => argv.includes(n); const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const note = (s) => { console.log(s); try { appendFileSync(`${SCRATCH}/provision-p3-dev-fixtures-log.txt`, s + '\n'); } catch { /* best effort */ } };
  const reporter = makeReporter(note); const { rep } = reporter; const selfSha = sha(readFileSync(fileURLToPath(import.meta.url)));
  const applySha = sha(readFileSync(join(ROOT, PINS.applyHarnessFile))); rep('the imported TLS/target helper (apply-p3.mjs) has its reviewed hash', applySha === PINS.applyHarnessSha); if (applySha !== PINS.applyHarnessSha) return EXIT.REFUSED_FLAGS;
  const loaded = loadManifest(); for (const c of loaded.checks) rep(c.n, c.ok, c.d); if (!loaded.ok) { note('STOP: manifest or seed verification failed; nothing was executed'); return EXIT.REFUSED_FLAGS; }
  if (flag('--offline-plan') || flag('--offline-selftest')) {
    rep('this script has a recorded sha256 (printed for the approval)', true, selfSha); rep('manifest sha256 (printed for the approval)', true, loaded.manifestSha);
    if (flag('--offline-plan')) { note('\nOFFLINE PLAN (no database was contacted; nothing was written). Prices are PREVIEWS: the database computes the real price and the run verifies it.\n' + formatPlan(loaded.manifest)); }
    note(`offline ${flag('--offline-plan') ? 'plan' : 'self-test'}: ${reporter.results.filter((r) => r.ok).length} passed, ${reporter.failed()} FAILED (no connection was made, no environment file was read)`); return reporter.failed() ? 1 : 0;
  }
  if (opt('--harness-sha') !== selfSha) { console.log('REFUSING: --harness-sha must equal the sha256 of this script'); return EXIT.REFUSED_FLAGS; }
  const mode = flag('--commit') ? 'commit' : 'dry'; const ownerEmail = opt('--owner-email'); const markupMode = opt('--markup-mode'); const approvalRef = opt('--approval-ref');
  const authArgs = { ownerEmail, markupMode, approvalRef, approved: process.env.P3_FIXTURES_APPROVED, commitFlag: flag('--commit'), commitEnv: process.env.P3_FIXTURES_COMMIT };
  const emailLc = String(ownerEmail ?? '').trim().toLowerCase(); const inputsOk = EMAIL.test(emailLc) && MODES.includes(markupMode) && String(approvalRef ?? '').length >= 4 && !/\s/.test(String(approvalRef ?? ''));
  rep('inputs: an owner e-mail, a markup mode and an approval reference are required', inputsOk); if (!inputsOk) return EXIT.REFUSED_FLAGS;
  if (mode === 'commit' && !(authArgs.commitFlag && authArgs.commitEnv === 'yes' && authArgs.approved === approvalString(loaded.manifestSha, emailLc, markupMode, approvalRef))) { rep('commit needs --commit, P3_FIXTURES_COMMIT=yes and the exact approval string', false); return EXIT.REFUSED_FLAGS; }
  let v = process.env.P2_DATABASE_URL ?? '';
  if (!v && flag('--authorized-read-env-local')) { const line = readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, ''); } }
  if (!v) { console.log('STOP: P2_DATABASE_URL not set and --authorized-read-env-local not given'); return EXIT.REFUSED_FLAGS; }
  const tg = checkTarget(v, readFileSync(APPLY.caFile, 'utf8')); setSecrets(tg.secrets ?? [v]); for (const x of tg.checks) rep(x.n, x.ok);
  if (!tg.ok) { note('STOP: target or CA check failed; nothing was executed'); return EXIT.REFUSED_TARGET; }
  const pg = createRequire(join(ROOT, 'package.json'))('pg');
  const connect = async () => { const k = new pg.Client(buildClientConfig(tg)); await k.connect(); try { assertTls(k); } catch (e) { await k.end().catch(() => {}); throw e; } return k; };
  return { run: async () => {
    const res = await runProvision({ mode, connect, manifest: loaded.manifest, manifestSha: loaded.manifestSha, reporter, ...authArgs });
    note(`p3 dev fixtures (${mode}): ${reporter.results.filter((r) => r.ok === true).length} passed, ${reporter.failed()} FAILED; outcome ${res.outcome}; committed ${res.committed}; exit ${res.exitCode}`);
    try { writeFileSync(`${SCRATCH}/p3-dev-fixtures-result-${mode}-${stamp}.json`, JSON.stringify({ tool: 'provision-p3-dev-fixtures.mjs', mode, toolSha: selfSha, manifestSha: loaded.manifestSha, markupMode, ref: PINS.ref, outcome: res.outcome, committed: res.committed, writes: res.wrote.length, failures: reporter.failed(), exitCode: res.exitCode, at: new Date().toISOString() }), { flag: 'wx' }); } catch { note('result file could not be written (an existing file is never overwritten)'); }
    return res.exitCode;
  } };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const r = cliMain(); if (typeof r === 'number') process.exitCode = r; else if (r?.run) process.exitCode = await r.run(); }
