// SCENARIO TEST for the P5 to P9 chain. Runs ONLY inside the rolled-back rehearsal transaction of apply-chain.mjs (--scenario). It creates fake users, organizations, staff and data as the connection owner, then drives the REAL
// RPCs as those users (JWT claims + role authenticated/anon) and checks the answers. Everything is rolled back; sequences (invoice, order numbers) may advance because sequences are not transactional.
// Staff sessions: the P2 MFA-factor plumbing (private.mfa_check_ok) is out of scope here, so ONLY private.staff_session_ok() is replaced inside the transaction by a version that keeps the real rules
// (active staff row with a role, aal2 in the JWT) and skips the MFA factor table. Capability checks (has_capability) and the step-up freshness check (step_up_ok) stay the real functions under test.
import { randomUUID, createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const SHIP = { name: 'Dr A', line1: '1 Lab Way', city: 'Austin', region: 'TX', postal: '78701', country: 'US' };

export default async function run({ su, as, attempt, rep }) {
  const ok = (name, cond, detail = '') => rep(`SCN ${name}`, !!cond, cond ? '' : String(detail).slice(0, 400));
  const show = (r) => JSON.stringify(r.ok === false ? { err: r.err, msg: r.msg } : r.r ?? r.rows?.[0] ?? null);
  const now = () => Math.floor(Date.now() / 1000);
  const J = (sub, { stale = false } = {}) => ({ sub, role: 'authenticated', aal: 'aal2', amr: [{ method: 'totp', timestamp: stale ? now() - 3600 : now() }] });
  const rpc = (who, fn, ...args) => as(who, `select public.${fn}(${args.map((a, i) => `$${i + 1}::${a[0]}`).join(', ')}) as r`, args.map((a) => a[1]));
  const u = (x) => ['uuid', x]; const t = (x) => ['text', x]; const i4 = (x) => ['integer', x]; const i8 = (x) => ['bigint', x]; const d = (x) => ['date', x]; const j = (x) => ['jsonb', JSON.stringify(x)]; const bo = (x) => ['boolean', x];
  const id = () => randomUUID();
  const code = (r) => (r.ok === false ? `raised ${r.err}` : r.r?.code ?? (r.r?.ok ? 'ok' : 'no-code'));
  const expectCode = (name, r, want) => ok(name, r.ok !== false && r.r?.ok === false && r.r?.code === want, `wanted ${want}; got ${show(r)}`);
  const expectOk = (name, r) => ok(name, r.ok !== false && r.r?.ok === true, show(r));
  const expectRaise = (name, r, sqlstate) => ok(name, r.ok === false && r.err === sqlstate, `wanted raise ${sqlstate}; got ${show(r)}`);

  // ------------------------------------------------------------------------------------------------------------------------------ setup (owner connection)
  const U = { ownerA: id(), memberA: id(), ownerB: id(), ownerR: id(), memberR: id(), ownerS: id(), admin: id(), finance: id(), ops: id(), support: id() };
  for (const [k, v] of Object.entries(U)) await su("insert into auth.users (id, email, email_confirmed_at, aud, role) values ($1, $2, now(), 'authenticated', 'authenticated')", [v, `scn-${k}@example.test`]);
  for (const [k, role] of [['admin', 'admin'], ['finance', 'finance'], ['ops', 'operations'], ['support', 'support']]) {
    await su("insert into public.staff_members (user_id, status, created_by) values ($1, 'active', $1)", [U[k]]);
    await su('insert into public.staff_roles (user_id, role, granted_by) values ($1, $2, $1)', [U[k], role]);
  }
  await su(`create or replace function private.staff_session_ok() returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.staff_members s where s.user_id = (select auth.uid()) and s.status = 'active' and exists (select 1 from public.staff_roles r where r.user_id = s.user_id))
       and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' $$`);
  const O = { A: id(), B: id(), R: id(), S: id() };
  for (const [k, v] of Object.entries(O)) await su("insert into public.organizations (id, name, code) values ($1, $2, $3)", [v, `Scenario ${k}`, `SCN-${k}`]);
  for (const [org, user, role] of [['A', 'ownerA', 'owner'], ['A', 'memberA', 'member'], ['B', 'ownerB', 'owner'], ['R', 'ownerR', 'owner'], ['R', 'memberR', 'member'], ['S', 'ownerS', 'owner']]) {
    await su('insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)', [O[org], U[user], role]);
  }
  const prod = id(); const variant = id();
  await su("insert into public.products (id, slug, name, category) values ($1, 'scn-peptide', 'Scenario Peptide', 'peptides')", [prod]);
  await su("insert into public.product_variants (id, product_id, spec, sku, base_price_cents, min_price_cents) values ($1, $2, '10mg', 'SCN-001', 10000, 8000)", [variant, prod]);
  for (const org of [O.A, O.B, O.R, O.S]) await su('insert into public.organization_products (organization_id, product_id) values ($1, $2)', [org, prod]);
  const mapA = id();
  await su("insert into public.sku_mappings (id, organization_id, source, product_name, spec, external_sku, units_per_pack, status, created_by, reviewed_by) values ($1, $2, 'private', 'Scenario Peptide', '10mg', 'EXT-1', 1, 'approved', $3, $3)", [mapA, O.A, U.ownerA]);
  await su("insert into public.onboarding_instances (organization_id, status, live_at, live_by) values ($1, 'live', now(), $2)", [O.A, U.admin]);
  rep('SCN setup: 10 users, 4 staff sessions, 4 organizations, a priced product and one live organization with an approved product', true);

  const ownerA = J(U.ownerA); const memberA = J(U.memberA); const ownerB = J(U.ownerB); const ownerR = J(U.ownerR); const memberR = J(U.memberR); const ownerS = J(U.ownerS);
  const admin = J(U.admin); const finance = J(U.finance); const ops = J(U.ops); const support = J(U.support);
  const financeStale = J(U.finance, { stale: true }); const adminStale = J(U.admin, { stale: true }); const opsStale = J(U.ops, { stale: true });
  const anon = {};

  // ------------------------------------------------------------------------------------------------------------------------------ tenant isolation (customer RPCs)
  const iso = [['rpc_stock_list', [u(O.A)]], ['rpc_inbound_list', [u(O.A)]], ['rpc_certificates_list', [u(O.A)]], ['rpc_commissions_get', [u(O.A)]], ['rpc_api_keys_list', [u(O.A)]], ['rpc_webhook_endpoints_list', [u(O.A)]],
    ['rpc_fulfillment_orders_list', [u(O.A), i4(10)]], ['rpc_invoices_list', [u(O.A), i4(10)]], ['rpc_billing_summary', [u(O.A)]], ['rpc_org_members_list', [u(O.A)]], ['rpc_onboarding_get', [u(O.A)]], ['rpc_orders_list', [u(O.A), i4(10)]]];
  for (const [fn, args] of iso) expectCode(`isolation: ${fn} refuses another organization's owner`, await rpc(ownerB, fn, ...args), 'organization_not_found');
  for (const [fn, args] of iso.slice(0, 4)) expectRaise(`isolation: ${fn} refuses anon`, await rpc(anon, fn, ...args), '42501');
  const stfRaise = [['rpc_admin_dashboard', []], ['rpc_admin_report', [t('sales')]], ['rpc_admin_commission_overview', []], ['rpc_admin_outbox_list', []], ['rpc_admin_certificates_list', []], ['rpc_admin_audit_list', []]];
  for (const [fn, args] of stfRaise) expectRaise(`non-staff owner is refused (42501) by ${fn}`, await rpc(ownerA, fn, ...args), '42501');

  // ------------------------------------------------------------------------------------------------------------------------------ P7 warehouse
  expectCode('warehouse: ops (no org.manage) cannot create a warehouse', await rpc(ops, 'rpc_admin_warehouse_save', u(null), t('WH1'), t('Main'), bo(true)), 'forbidden');
  const wh = await rpc(admin, 'rpc_admin_warehouse_save', u(null), t('WH1'), t('Main'), bo(true));
  expectOk('warehouse: admin creates a warehouse', wh);
  const whId = wh.r?.id ?? (await su("select id from public.warehouses where code = 'WH1'"))[0]?.id;
  const loc = await rpc(admin, 'rpc_admin_location_save', u(null), u(whId), t('A-01'), t('storage'), bo(true));
  expectOk('warehouse: admin creates a storage location', loc);
  const locId = loc.r?.id ?? (await su("select id from public.warehouse_locations where code = 'A-01'"))[0]?.id;

  // ------------------------------------------------------------------------------------------------------------------------------ P7 inbound and receiving
  expectCode('inbound: a member (not owner) cannot announce a shipment', await rpc(memberA, 'rpc_inbound_create', u(O.A), t('PO-1'), j([{ sku_mapping_id: mapA, expected_units: 100 }])), 'owner_required');
  expectCode('inbound: another organization cannot announce for A', await rpc(ownerB, 'rpc_inbound_create', u(O.A), t('PO-1'), j([{ sku_mapping_id: mapA, expected_units: 100 }])), 'organization_not_found');
  const inb = await rpc(ownerA, 'rpc_inbound_create', u(O.A), t('PO-1'), j([{ sku_mapping_id: mapA, expected_units: 100 }]));
  expectOk('inbound: owner announces 100 units', inb);
  const rid = inb.r?.id;
  const lineId = (await su('select id from public.inbound_receipt_lines where receipt_id = $1', [rid]))[0]?.id;
  const expiry = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  expectCode('receiving: support (no inventory.adjust) cannot receive', await rpc(support, 'rpc_admin_receipt_receive', u(rid), j([{ line_id: lineId, received_units: 100, lot_number: 'LOT1', location_id: locId, expires_on: expiry }])), 'forbidden');
  expectRaise('receiving: a lot number with a path in it is refused', await rpc(ops, 'rpc_admin_receipt_receive', u(rid), j([{ line_id: lineId, received_units: 100, lot_number: '../x', location_id: locId }])), '22023');
  expectOk('receiving: ops receives 100 units into lot LOT1', await rpc(ops, 'rpc_admin_receipt_receive', u(rid), j([{ line_id: lineId, received_units: 100, lot_number: 'LOT1', location_id: locId, expires_on: expiry }])));
  expectCode('receiving: a received shipment cannot be received twice', await rpc(ops, 'rpc_admin_receipt_receive', u(rid), j([{ line_id: lineId, received_units: 100, lot_number: 'LOT1', location_id: locId }])), 'already_reviewed');
  const bal = async () => (await su('select coalesce(sum(on_hand),0)::int oh, coalesce(sum(reserved),0)::int rs from public.inventory_balances where sku_mapping_id = $1', [mapA]))[0];
  const lotId = (await su("select id from public.inventory_lots where lot_number = 'LOT1' and sku_mapping_id = $1", [mapA]))[0]?.id;
  ok('stock: 100 on hand, 0 reserved after receiving', (await bal()).oh === 100 && (await bal()).rs === 0, JSON.stringify(await bal()));
  const sl = await rpc(ownerA, 'rpc_stock_list', u(O.A));
  ok('stock: the customer sees 100 available', sl.r?.items?.[0]?.available === 100, show(sl));
  expectCode('stock: B sees none of A\'s stock rows', await rpc(ownerB, 'rpc_stock_list', u(O.A)), 'organization_not_found');

  // adjustments
  const k1 = id();
  expectCode('adjust: a stale authenticator code is refused (step-up)', await rpc(opsStale, 'rpc_admin_stock_adjust', u(mapA), u(lotId), u(locId), i4(-1), t('damaged'), u(k1)), 'step_up_required');
  expectOk('adjust: fresh code takes 2 damaged units out', await rpc(ops, 'rpc_admin_stock_adjust', u(mapA), u(lotId), u(locId), i4(-2), t('damaged in transit'), u(k1)));
  const rep1 = await rpc(ops, 'rpc_admin_stock_adjust', u(mapA), u(lotId), u(locId), i4(-2), t('damaged in transit'), u(k1));
  ok('adjust: repeating the same key is a no-op (replay)', rep1.r?.ok === true && rep1.r?.replay === true, show(rep1));
  ok('adjust: stock is 98, not 96', (await bal()).oh === 98, JSON.stringify(await bal()));
  expectRaise('adjust: a reason is required', await rpc(ops, 'rpc_admin_stock_adjust', u(mapA), u(lotId), u(locId), i4(-1), t(' '), u(id())), '22023');
  expectCode('adjust: more than on hand is refused', await rpc(ops, 'rpc_admin_stock_adjust', u(mapA), u(lotId), u(locId), i4(-1000), t('shrink'), u(id())), 'below_reserved');

  // ------------------------------------------------------------------------------------------------------------------------------ P6 API keys, orders, idempotency, isolation
  const keyLive = `99pw_live_${randomUUID().replace(/-/g, '').slice(0, 40)}`; const keyTest = `99pw_test_${randomUUID().replace(/-/g, '').slice(0, 40)}`; const keyB = `99pw_live_${randomUUID().replace(/-/g, '').slice(0, 40)}`;
  const hLive = sha256(keyLive); const hTest = sha256(keyTest);
  expectCode('api key: a member cannot create keys', await rpc(memberA, 'rpc_api_key_create', u(O.A), t('k'), t('live'), t(keyLive.slice(0, 16)), t(hLive)), 'owner_required');
  expectOk('api key: owner creates a live key', await rpc(ownerA, 'rpc_api_key_create', u(O.A), t('prod'), t('live'), t(keyLive.slice(0, 16)), t(hLive)));
  expectOk('api key: owner creates a test key', await rpc(ownerA, 'rpc_api_key_create', u(O.A), t('sandbox'), t('test'), t(keyTest.slice(0, 16)), t(hTest)));
  expectCode('api key: a non-live organization cannot create a live key', await rpc(ownerB, 'rpc_api_key_create', u(O.B), t('x'), t('live'), t(keyB.slice(0, 16)), t(sha256(keyB))), 'not_live');
  expectRaise('api key: a malformed hash is refused', await rpc(ownerA, 'rpc_api_key_create', u(O.A), t('x'), t('live'), t('99pw_live_abcdef'), t('nothex')), '22023');
  const order = { external_ref: 'ORD-1', recipient: SHIP, lines: [{ sku: 'EXT-1', quantity: 2 }] };
  const idem = 'idem-key-0001'; const reqHash = sha256(JSON.stringify(order));
  const o1 = await rpc(anon, 'rpc_api_order_create', t(hLive), t(idem), t(reqHash), j(order));
  ok('api: a live order is created through the key (anon role)', o1.r?.ok === true && o1.r?.replay === false, show(o1));
  const o1r = await rpc(anon, 'rpc_api_order_create', t(hLive), t(idem), t(reqHash), j(order));
  ok('api: the same idempotency key and body replays the same order', o1r.r?.replay === true && o1r.r?.order?.id === o1.r?.order?.id, show(o1r));
  expectCode('api: the same idempotency key with a different body is a conflict', await rpc(anon, 'rpc_api_order_create', t(hLive), t(idem), t(sha256('other')), j({ ...order, external_ref: 'ORD-X' })), 'idempotency_conflict');
  expectCode('api: a duplicate external reference is refused', await rpc(anon, 'rpc_api_order_create', t(hLive), t(null), t(null), j(order)), 'duplicate_order');
  const unk = await rpc(anon, 'rpc_api_order_create', t(hLive), t(null), t(null), j({ external_ref: 'ORD-2', recipient: SHIP, lines: [{ sku: 'NOPE', quantity: 1 }] }));
  ok('api: an unknown SKU is refused and listed', unk.r?.code === 'unknown_sku' && JSON.stringify(unk.r?.skus) === '["NOPE"]', show(unk));
  expectCode('api: a wrong key is unauthorized (no hint whether it exists)', await rpc(anon, 'rpc_api_order_create', t(sha256('x')), t(null), t(null), j(order)), 'unauthorized');
  expectCode('api: a malformed order is invalid_request', await rpc(anon, 'rpc_api_order_create', t(hLive), t(null), t(null), j({ external_ref: 'ORD-3', recipient: {}, lines: [] })), 'invalid_request');
  const sb = await rpc(anon, 'rpc_api_order_create', t(hTest), t(null), t(null), j({ external_ref: 'SBX-1', recipient: SHIP, lines: [{ sku: 'EXT-1', quantity: 1 }] }));
  ok('api: a test key creates a SANDBOX order', sb.r?.ok === true, show(sb));
  const sbId = sb.r?.order?.id ?? (await su("select id from public.fulfillment_orders where external_ref = 'SBX-1'"))[0]?.id;
  const foId = (await su("select id from public.fulfillment_orders where external_ref = 'ORD-1' and not is_sandbox"))[0]?.id;
  const og = await rpc(anon, 'rpc_api_order_get', t(hLive), t('ORD-1'));
  ok('api: the key reads its own order', og.r?.ok === true, show(og));
  expectCode('api: a sandbox order is not visible with the live key', await rpc(anon, 'rpc_api_order_get', t(hLive), t('SBX-1')), 'not_found');
  const bk = await rpc(ownerB, 'rpc_api_key_create', u(O.B), t('x'), t('test'), t(keyB.replace('live', 'test').slice(0, 16)), t(sha256(keyB.replace('live', 'test'))));
  expectOk('api: B creates its own test key', bk);
  expectCode('api: B\'s key cannot read A\'s order', await rpc(anon, 'rpc_api_order_get', t(sha256(keyB.replace('live', 'test'))), t('ORD-1')), 'not_found');
  ok('api: B\'s key lists none of A\'s orders', ((await rpc(anon, 'rpc_api_orders_list', t(sha256(keyB.replace('live', 'test'))), i4(50))).r?.orders ?? []).length === 0, 'B saw orders');

  // ------------------------------------------------------------------------------------------------------------------------------ P7 fulfillment lifecycle and FEFO / stock safety
  expectCode('fulfillment: a sandbox order can never be processed', await rpc(ops, 'rpc_admin_fo_transition', u(sbId), t('queued'), j({})), 'sandbox_order');
  expectCode('fulfillment: support cannot move orders', await rpc(support, 'rpc_admin_fo_transition', u(foId), t('queued'), j({})), 'forbidden');
  expectCode('fulfillment: cannot skip states (pending to picked)', await rpc(ops, 'rpc_admin_fo_transition', u(foId), t('picked'), j({})), 'invalid_transition');
  expectOk('fulfillment: queued', await rpc(ops, 'rpc_admin_fo_transition', u(foId), t('queued'), j({})));
  expectOk('fulfillment: allocated (reserves 2 units)', await rpc(ops, 'rpc_admin_fo_transition', u(foId), t('allocated'), j({})));
  ok('stock: 2 reserved, 98 on hand', (await bal()).rs === 2 && (await bal()).oh === 98, JSON.stringify(await bal()));
  expectCode('adjust: cannot take stock below what is reserved', await rpc(ops, 'rpc_admin_stock_adjust', u(mapA), u(lotId), u(locId), i4(-97), t('shrink'), u(id())), 'below_reserved');
  const big = await rpc(anon, 'rpc_api_order_create', t(hLive), t(null), t(null), j({ external_ref: 'ORD-BIG', recipient: SHIP, lines: [{ sku: 'EXT-1', quantity: 500 }] }));
  const bigId = big.r?.order?.id ?? (await su("select id from public.fulfillment_orders where external_ref = 'ORD-BIG'"))[0]?.id;
  expectOk('fulfillment: a 500-unit order is accepted (pending)', big);
  expectOk('fulfillment: it can be queued', await rpc(ops, 'rpc_admin_fo_transition', u(bigId), t('queued'), j({})));
  const ins = await rpc(ops, 'rpc_admin_fo_transition', u(bigId), t('allocated'), j({}));
  ok('fulfillment: allocating more than available is refused (all or nothing)', ins.r?.ok === false, show(ins));
  ok('stock: the failed allocation reserved nothing extra (still 2)', (await bal()).rs === 2, JSON.stringify(await bal()));
  ok('fulfillment: an insufficient_stock exception was opened for the 500-unit order', (await su("select count(*)::int n from public.fulfillment_exceptions where order_id = $1 and kind = 'insufficient_stock' and status = 'open'", [bigId]))[0].n === 1);
  expectCode('fulfillment: cancelling needs a reason', await rpc(ops, 'rpc_admin_fo_transition', u(bigId), t('cancelled'), j({})), 'not_ready');
  expectOk('fulfillment: cancelling the big order with a reason', await rpc(ops, 'rpc_admin_fo_transition', u(bigId), t('cancelled'), j({ reason: 'customer request' })));
  for (const to of ['picked', 'packed', 'ready']) expectOk(`fulfillment: ${to}`, await rpc(ops, 'rpc_admin_fo_transition', u(foId), t(to), j({})));
  expectCode('fulfillment: shipping needs a carrier and tracking number', await rpc(ops, 'rpc_admin_fo_transition', u(foId), t('shipped'), j({})), 'not_ready');
  expectOk('fulfillment: shipped with carrier and tracking', await rpc(ops, 'rpc_admin_fo_transition', u(foId), t('shipped'), j({ carrier: 'UPS', tracking_number: '1Z999' })));
  ok('stock: shipping consumed the 2 reserved units (96 on hand, 0 reserved)', (await bal()).oh === 96 && (await bal()).rs === 0, JSON.stringify(await bal()));
  expectCode('fulfillment: a shipped order cannot go back', await rpc(ops, 'rpc_admin_fo_transition', u(foId), t('queued'), j({})), 'invalid_transition');
  ok('ledger: movements exist for receive, adjust, reserve and consume', (await su("select count(distinct movement_type)::int n from public.inventory_movements where sku_mapping_id = $1", [mapA]))[0].n >= 4);
  ok('ledger: balances equal the sum of movements', (await su(`select count(*)::int n from public.inventory_balances b where b.on_hand <> (select coalesce(sum(case when m.movement_type in ('receive','adjust_plus') then m.qty when m.movement_type in ('adjust_minus','consume') then -m.qty else 0 end),0) from public.inventory_movements m where m.sku_mapping_id = b.sku_mapping_id and m.lot_id = b.lot_id and m.location_id = b.location_id)`))[0].n === 0);
  const mv = await attempt("do $$ begin update public.inventory_movements set qty = qty + 1; end $$");
  ok('ledger: a stock movement cannot be rewritten', mv === '23514', mv);

  // ------------------------------------------------------------------------------------------------------------------------------ P6 webhooks and worker
  const whKey = `whsec_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  expectCode('webhook: a private or http URL is refused', await rpc(ownerA, 'rpc_webhook_endpoint_create', u(O.A), t('http://127.0.0.1/hook'), ['text[]', ['order.created']], t(whKey)), 'invalid_url');
  expectOk('webhook: owner creates an https endpoint', await rpc(ownerA, 'rpc_webhook_endpoint_create', u(O.A), t('https://hooks.example.com/99pw'), ['text[]', ['order.created', 'order.status_changed']], t(whKey)));
  const o4 = await rpc(anon, 'rpc_api_order_create', t(hLive), t(null), t(null), j({ external_ref: 'ORD-4', recipient: SHIP, lines: [{ sku: 'EXT-1', quantity: 1 }] }));
  expectOk('webhook: a new order is accepted', o4);
  const nd = (await su("select count(*)::int n from public.webhook_deliveries where status = 'pending'"))[0].n;
  ok('webhook: an order.created delivery was queued', nd >= 1, `pending ${nd}`);
  const wtoken = `wk_${randomUUID().replace(/-/g, '')}`;
  expectCode('worker: a stale code cannot create the worker credential', await rpc(adminStale, 'rpc_admin_worker_token_create', t(sha256(wtoken))), 'step_up_required');
  expectOk('worker: admin with a fresh code creates the worker credential', await rpc(admin, 'rpc_admin_worker_token_create', t(sha256(wtoken))));
  expectCode('worker: a wrong token is unauthorized', await rpc(anon, 'rpc_worker_claim_deliveries', t(sha256('nope')), i4(5)), 'unauthorized');
  const cl = await rpc(anon, 'rpc_worker_claim_deliveries', t(sha256(wtoken)), i4(5));
  ok('worker: claims due deliveries and gets the signing key and payload', cl.r?.ok === true && cl.r.deliveries.length >= 1 && /^whsec_/.test(cl.r.deliveries[0].signing_key), show(cl));
  const delId = cl.r?.deliveries?.[0]?.id;
  ok('worker: records the result as delivered', (await rpc(anon, 'rpc_worker_record_result', t(sha256(wtoken)), u(delId), i4(200), bo(true), t(null))).r?.ok === true);
  ok('worker: a second claim does not return the delivered one', !((await rpc(anon, 'rpc_worker_claim_deliveries', t(sha256(wtoken)), i4(50))).r?.deliveries ?? []).some((x) => x.id === delId));
  expectOk('api key: owner revokes the live key', await rpc(ownerA, 'rpc_api_key_revoke', u(O.A), u((await su("select id from public.api_keys where key_hash = $1", [hLive]))[0].id)));
  expectCode('api key: a revoked key is unauthorized', await rpc(anon, 'rpc_api_order_get', t(hLive), t('ORD-1')), 'unauthorized');

  // ------------------------------------------------------------------------------------------------------------------------------ P3/P4 purchase and payment (the invoice that earns commission)
  const buy = async (ownerClaims, org, qty, label) => {
    const cp = await rpc(ownerClaims, 'rpc_cart_put_item', u(org), u(variant), i4(qty));
    if (cp.r?.ok !== true) { ok(`${label}: add to cart`, false, show(cp)); return null; }
    const co = await rpc(ownerClaims, 'rpc_checkout', u(org), j(SHIP), t(null), u(id()));
    if (co.r?.ok !== true) { ok(`${label}: checkout`, false, show(co)); return null; }
    const inv = (await rpc(ownerClaims, 'rpc_invoices_list', u(org), i4(10))).r?.invoices?.find((x) => x.status === 'open');
    if (!inv) { ok(`${label}: an open invoice exists`, false, show(co)); return null; }
    const pr = await rpc(ownerClaims, 'rpc_payment_report', u(org), u(inv.invoice_id), t('zelle'), i8(inv.total_cents), t('ZP-1'), d(null), t(null), u(id()));
    if (pr.r?.ok !== true) { ok(`${label}: report payment`, false, show(pr)); return null; }
    const pid = (await su("select id from public.payments where invoice_id = $1", [inv.invoice_id]))[0].id;
    const cf = await rpc(finance, 'rpc_admin_payment_confirm', u(pid), i8(inv.total_cents), d(new Date().toISOString().slice(0, 10)), t('BANK-1'), t(null));
    ok(`${label}: finance confirms the payment and the invoice becomes paid`, cf.r?.ok === true && (await su('select status from public.invoices where id = $1', [inv.invoice_id]))[0].status === 'paid', show(cf));
    return { invoiceId: inv.invoice_id, total: Number(inv.total_cents), paymentId: pid };
  };
  const buyA = await buy(ownerA, O.A, 3, 'purchase A (3 x $100)');
  ok('purchase: the invoice total is 3 x $100.00 = $300.00', buyA && buyA.total === 30000, JSON.stringify(buyA));
  const buyB = await buy(ownerB, O.B, 2, 'purchase B (2 x $100)');

  // ------------------------------------------------------------------------------------------------------------------------------ P9 commissions
  expectCode('commission: ops cannot create plans', await rpc(ops, 'rpc_admin_commission_plan_save', t('zero_hold'), t('Zero hold'), i4(500), i4(0)), 'forbidden');
  expectCode('commission: finance with a STALE code cannot create plans', await rpc(financeStale, 'rpc_admin_commission_plan_save', t('zero_hold'), t('Zero hold'), i4(500), i4(0)), 'step_up_required');
  expectRaise('commission: a rate above 50 percent is refused', await rpc(finance, 'rpc_admin_commission_plan_save', t('too_high'), t('x'), i4(5001), i4(14)), '22023');
  const p0 = await rpc(finance, 'rpc_admin_commission_plan_save', t('zero_hold'), t('Zero hold 5%'), i4(500), i4(0)); expectOk('commission: finance creates a 5% plan with no hold', p0);
  const p14 = await rpc(finance, 'rpc_admin_commission_plan_save', t('hold_14'), t('Hold 14 days 5%'), i4(500), i4(14)); expectOk('commission: finance creates a 5% plan with a 14-day hold', p14);
  expectCode('commission: a duplicate plan code is refused', await rpc(finance, 'rpc_admin_commission_plan_save', t('zero_hold'), t('again'), i4(100), i4(1)), 'plan_code_taken');
  expectOk('commission: enrol R on the no-hold plan', await rpc(finance, 'rpc_admin_referral_code_enroll', u(O.R), u(p0.r?.id)));
  expectOk('commission: enrol S on the 14-day plan', await rpc(finance, 'rpc_admin_referral_code_enroll', u(O.S), u(p14.r?.id)));
  expectCode('commission: enrolling twice is refused', await rpc(finance, 'rpc_admin_referral_code_enroll', u(O.R), u(p0.r?.id)), 'already_enrolled');
  const codeR = (await su('select code from public.referral_codes where organization_id = $1', [O.R]))[0]?.code;
  const codeS = (await su('select code from public.referral_codes where organization_id = $1', [O.S]))[0]?.code;
  ok('commission: the referral code is 8 upper-case characters', /^[A-Z0-9]{8}$/.test(codeR ?? ''), codeR);
  expectCode('commission: an organization cannot refer itself', await rpc(finance, 'rpc_admin_referral_link', u(O.R), t(codeR)), 'self_referral');
  expectCode('commission: an unknown code is refused', await rpc(finance, 'rpc_admin_referral_link', u(O.A), t('ZZZZZZZZ')), 'referral_code_not_found');
  expectOk('commission: link A to R (lower-case input is accepted)', await rpc(finance, 'rpc_admin_referral_link', u(O.A), t(codeR.toLowerCase())));
  expectCode('commission: A cannot have a second referrer', await rpc(finance, 'rpc_admin_referral_link', u(O.A), t(codeS)), 'already_referred');
  expectOk('commission: link B to S', await rpc(finance, 'rpc_admin_referral_link', u(O.B), t(codeS)));
  const ac1 = await rpc(finance, 'rpc_admin_commissions_accrue');
  ok('commission: accrual creates two entries (A and B paid invoices)', ac1.r?.ok === true && ac1.r?.accrued === 2, show(ac1));
  ok('commission: running it again accrues nothing (idempotent)', (await rpc(finance, 'rpc_admin_commissions_accrue')).r?.accrued === 0);
  const entA = (await su("select amount_cents, base_cents, rate_bps, available_at <= clock_timestamp() as avail from public.commission_entries where invoice_id = $1", [buyA?.invoiceId]))[0];
  ok('commission: A entry is 5% of $300.00 = $15.00, available now (no hold)', entA && Number(entA.amount_cents) === 1500 && Number(entA.base_cents) === 30000 && entA.rate_bps === 500 && entA.avail === true, JSON.stringify(entA));
  const entB = (await su("select amount_cents, available_at > clock_timestamp() + interval '13 days' as held from public.commission_entries where invoice_id = $1", [buyB?.invoiceId]))[0];
  ok('commission: B entry is 5% of $200.00 = $10.00 and is held for 14 days', entB && Number(entB.amount_cents) === 1000 && entB.held === true, JSON.stringify(entB));
  const cg = await rpc(ownerR, 'rpc_commissions_get', u(O.R));
  ok('commission: R sees $15.00 available, nothing pending', cg.r?.enrolled === true && Number(cg.r.available_cents) === 1500 && Number(cg.r.pending_cents) === 0, show(cg));
  ok('commission: R\'s statement names no referred organization and no invoice', !/Scenario A|SCN-A|INV-|invoice_id|referred_org/.test(JSON.stringify(cg.r)), JSON.stringify(cg.r).slice(0, 300));
  expectCode('commission: R\'s member (not owner) cannot see commissions', await rpc(memberR, 'rpc_commissions_get', u(O.R)), 'owner_required');
  const cs = await rpc(ownerS, 'rpc_commissions_get', u(O.S));
  ok('commission: S sees $10.00 pending and $0.00 available (hold)', Number(cs.r?.pending_cents) === 1000 && Number(cs.r?.available_cents) === 0, show(cs));
  const pk = id();
  expectCode('payout: S cannot be paid out during the hold', await rpc(finance, 'rpc_admin_commission_payout', u(O.S), i8(1), t('wire'), t(null), d(new Date().toISOString().slice(0, 10)), u(id())), 'insufficient_commission');
  expectCode('payout: more than available ($15.01) is refused', await rpc(finance, 'rpc_admin_commission_payout', u(O.R), i8(1501), t('wire'), t(null), d(new Date().toISOString().slice(0, 10)), u(pk)), 'insufficient_commission');
  expectCode('payout: a stale code is refused', await rpc(financeStale, 'rpc_admin_commission_payout', u(O.R), i8(1000), t('wire'), t(null), d(new Date().toISOString().slice(0, 10)), u(pk)), 'step_up_required');
  expectCode('payout: ops cannot pay out', await rpc(ops, 'rpc_admin_commission_payout', u(O.R), i8(1000), t('wire'), t(null), d(new Date().toISOString().slice(0, 10)), u(pk)), 'forbidden');
  expectRaise('payout: a future date is refused', await rpc(finance, 'rpc_admin_commission_payout', u(O.R), i8(1000), t('wire'), t(null), d('2099-01-01'), u(pk)), '22023');
  const po = await rpc(finance, 'rpc_admin_commission_payout', u(O.R), i8(1000), t('wire'), t('WIRE-77'), d(new Date().toISOString().slice(0, 10)), u(pk));
  ok('payout: $10.00 is recorded', po.r?.ok === true && po.r?.replayed === false, show(po));
  const po2 = await rpc(finance, 'rpc_admin_commission_payout', u(O.R), i8(1000), t('wire'), t('WIRE-77'), d(new Date().toISOString().slice(0, 10)), u(pk));
  ok('payout: the same key replays and does NOT pay twice', po2.r?.ok === true && po2.r?.replayed === true && (await su('select count(*)::int n from public.commission_payouts where referrer_org_id = $1', [O.R]))[0].n === 1, show(po2));
  expectCode('payout: the same key with a different amount is a conflict', await rpc(finance, 'rpc_admin_commission_payout', u(O.R), i8(1001), t('wire'), t(null), d(new Date().toISOString().slice(0, 10)), u(pk)), 'idempotency_conflict');
  expectCode('payout: only $5.00 is left, so $5.01 is refused', await rpc(finance, 'rpc_admin_commission_payout', u(O.R), i8(501), t('wire'), t(null), d(new Date().toISOString().slice(0, 10)), u(id())), 'insufficient_commission');
  const adj = id();
  expectOk('adjust: finance removes $2.00 (a correction)', await rpc(finance, 'rpc_admin_commission_adjust', u(O.R), i8(-200), t('billing error'), u(adj)));
  ok('adjust: repeating the key does not remove it twice', (await rpc(finance, 'rpc_admin_commission_adjust', u(O.R), i8(-200), t('billing error'), u(adj))).r?.replayed === true && (await su("select count(*)::int n from public.commission_entries where entry_type = 'adjustment'"))[0].n === 1);
  const rb = (await su('select available_cents, paid_out_cents from private.comm_balance($1)', [O.R]))[0];
  ok('commission: R now has $3.00 available and $10.00 paid out', Number(rb.available_cents) === 300 && Number(rb.paid_out_cents) === 1000, JSON.stringify(rb));
  const upd = await attempt("do $$ begin update public.commission_entries set amount_cents = amount_cents + 1; end $$");
  ok('ledger: commission entries cannot be updated', upd === '23514', upd);
  const del = await attempt("do $$ begin delete from public.commission_payouts; end $$");
  ok('ledger: payouts cannot be deleted', del === '23514', del);
  expectOk('referral: finance ends the A to R link', await rpc(finance, 'rpc_admin_referral_end', u((await su('select id from public.organization_referrals where referred_org_id = $1', [O.A]))[0].id), t('left the program')));
  const buyA2 = await buy(ownerA, O.A, 1, 'purchase A2');
  ok('commission: after the link ended, a new paid invoice earns nothing', (await rpc(finance, 'rpc_admin_commissions_accrue')).r?.accrued === 0, 'accrued');

  // ------------------------------------------------------------------------------------------------------------------------------ P9 notifications
  const ob = async () => (await su("select status, count(*)::int n from public.email_outbox group by status")).reduce((a, r) => ({ ...a, [r.status]: r.n }), {});
  ok('notifications: the payout queued an e-mail for R\'s OWNER only (not the member)', (await su("select count(*)::int n from public.email_outbox where template_key = 'commission_payout' and user_id = $1", [U.ownerR]))[0].n === 1 && (await su("select count(*)::int n from public.email_outbox where user_id = $1", [U.memberR]))[0].n === 0);
  const sc1 = await rpc(finance, 'rpc_admin_notifications_scan');
  ok('notifications: the scan queues invoice and payment e-mails', sc1.r?.ok === true && sc1.r.queued >= 4, show(sc1));
  ok('notifications: scanning again queues nothing new (dedupe)', (await rpc(finance, 'rpc_admin_notifications_scan')).r?.queued === 0);
  ok('notifications: a shipped order e-mail was queued for A\'s owner', (await su("select count(*)::int n from public.email_outbox where template_key = 'order_shipped' and user_id = $1", [U.ownerA]))[0].n === 1);
  ok('notifications: rendered text has no leftover placeholders', (await su("select count(*)::int n from public.email_outbox where subject like '%{{%' or body like '%{{%'"))[0].n === 0);
  expectRaise('notifications: billing cannot be switched off (no preference exists)', await rpc(ownerA, 'rpc_notification_pref_set', t('billing'), bo(false)), '22023');
  expectOk('notifications: owner A switches off shipping e-mails', await rpc(ownerA, 'rpc_notification_pref_set', t('fulfillment'), bo(false)));
  const shipBefore = (await su("select count(*)::int n from public.email_outbox where user_id = $1", [U.ownerA]))[0].n;
  // a second shipped order for A would be needed to test suppression end to end; here the preference read-back and the helper are checked directly
  ok('notifications: the preference is stored and read back', (await rpc(ownerA, 'rpc_notification_prefs_get')).r?.preferences?.find((p) => p.category === 'fulfillment')?.enabled === false);
  const enq = (await su("select private.notif_enqueue('order_shipped', $1, '{\"order_number\":\"FO-X\",\"carrier\":\"UPS\",\"tracking_number\":\"T\"}'::jsonb, 'test:pref') as n", [O.A]))[0].n;
  ok('notifications: a switched-off category queues nothing for that owner', enq === 0 && (await su("select count(*)::int n from public.email_outbox where user_id = $1", [U.ownerA]))[0].n === shipBefore, `enq ${enq}`);
  const enqBill = (await su("select private.notif_enqueue('payment_rejected', $1, '{\"invoice_number\":\"INV-1\"}'::jsonb, 'test:bill') as n", [O.A]))[0].n;
  ok('notifications: billing e-mail is queued regardless of preferences', enqBill === 1, `enq ${enqBill}`);
  expectCode('outbox: ops cannot read the outbox (needs profiles.read.basic)', await rpc(ops, 'rpc_admin_outbox_list'), 'forbidden');
  const ol = await rpc(support, 'rpc_admin_outbox_list');
  ok('outbox: support reads the outbox and the read is audited', ol.r?.ok === true && (await su("select count(*)::int n from public.audit_events where action = 'staff.outbox.read'"))[0].n >= 1, show(ol));
  expectCode('outbox: support cannot dispatch (needs org.manage)', await rpc(support, 'rpc_admin_outbox_claim', i4(5)), 'forbidden');
  const cl2 = await rpc(admin, 'rpc_admin_outbox_claim', i4(3));
  ok('outbox: admin claims up to 3 messages', cl2.r?.ok === true && cl2.r.messages.length === 3, show(cl2));
  const m1 = cl2.r?.messages?.[0]?.id; const m2 = cl2.r?.messages?.[1]?.id;
  expectOk('outbox: a success is recorded as sent', await rpc(admin, 'rpc_admin_outbox_record', u(m1), bo(true), t(null), t('prov-1')));
  const rf = await rpc(admin, 'rpc_admin_outbox_record', u(m2), bo(false), t('timeout'), t(null));
  ok('outbox: a first failure is a retry, not final', rf.r?.code === 'retry', show(rf));
  expectCode('outbox: recording a result for an unclaimed message is refused', await rpc(admin, 'rpc_admin_outbox_record', u(m1), bo(true), t(null), t(null)), 'not_claimed');
  const upd2 = await attempt("do $$ begin update public.email_outbox set body = 'x' where status = 'sent'; end $$");
  ok('outbox: message content cannot be edited', upd2 === '23514', upd2);
  const tpl = await rpc(admin, 'rpc_admin_template_save', t('order_shipped'), t('Order {{order_number}} shipped'), t('Tracking {{tracking_number}} with {{carrier}}'));
  expectOk('templates: admin saves a template with allowed placeholders', tpl);
  expectCode('templates: an unknown placeholder is refused', await rpc(admin, 'rpc_admin_template_save', t('order_shipped'), t('x'), t('{{password}}')), 'template_variable_unknown');
  expectCode('templates: a stale code is refused', await rpc(adminStale, 'rpc_admin_template_save', t('order_shipped'), t('x'), t('y')), 'step_up_required');

  // ------------------------------------------------------------------------------------------------------------------------------ P9 certificates
  const docId = id(); const docBad = id(); const docMissing = id(); const docOther = id();
  const objMeta = (size, mime) => JSON.stringify({ size, mimetype: mime });
  await su("insert into storage.objects (bucket_id, name, metadata) values ('portal-documents', $1, $2::jsonb)", [`${O.A}/${docId}.pdf`, objMeta(2048, 'application/pdf')]);
  await su("insert into storage.objects (bucket_id, name, metadata) values ('portal-documents', $1, $2::jsonb)", [`${O.A}/${docBad}.pdf`, objMeta(2048, 'text/html')]);
  await su("insert into storage.objects (bucket_id, name, metadata) values ('portal-documents', $1, $2::jsonb)", [`${O.B}/${docOther}.pdf`, objMeta(2048, 'application/pdf')]);
  expectCode('certificate: support cannot publish', await rpc(support, 'rpc_admin_certificate_publish', u(O.A), u(docId), t('coa.pdf'), u(lotId), u(null), t('COA LOT1'), d(null)), 'forbidden');
  expectCode('certificate: a missing upload is refused', await rpc(ops, 'rpc_admin_certificate_publish', u(O.A), u(docMissing), t('coa.pdf'), u(lotId), u(null), t('COA'), d(null)), 'document_not_found');
  expectCode('certificate: a non-PDF/image upload is refused', await rpc(ops, 'rpc_admin_certificate_publish', u(O.A), u(docBad), t('coa.pdf'), u(lotId), u(null), t('COA'), d(null)), 'document_invalid');
  expectCode('certificate: a lot of another organization is refused', await rpc(ops, 'rpc_admin_certificate_publish', u(O.B), u(docOther), t('coa.pdf'), u(lotId), u(null), t('COA'), d(null)), 'target_not_found');
  expectRaise('certificate: a lot or an order is required', await rpc(ops, 'rpc_admin_certificate_publish', u(O.A), u(docId), t('coa.pdf'), u(null), u(null), t('COA'), d(null)), '22023');
  const cp = await rpc(ops, 'rpc_admin_certificate_publish', u(O.A), u(docId), t('coa.pdf'), u(lotId), u(foId), t('COA LOT1'), d('2026-11-01'));
  expectOk('certificate: ops publishes a certificate for lot LOT1 and the shipped order', cp);
  expectCode('certificate: the same file cannot be published twice', await rpc(ops, 'rpc_admin_certificate_publish', u(O.A), u(docId), t('coa.pdf'), u(lotId), u(null), t('again'), d(null)), 'already_published');
  const cl3 = await rpc(memberA, 'rpc_certificates_list', u(O.A));
  ok('certificate: a MEMBER of A sees it with the file path', cl3.r?.certificates?.length === 1 && cl3.r.certificates[0].storage_path === `${O.A}/${docId}.pdf` && cl3.r.certificates[0].lot_number === 'LOT1', show(cl3));
  ok('certificate: B sees none of it', ((await rpc(ownerB, 'rpc_certificates_list', u(O.B))).r?.certificates ?? []).length === 0);
  ok('certificate: the owner of A was notified', (await su("select count(*)::int n from public.email_outbox where template_key = 'certificate_available' and user_id = $1", [U.ownerA]))[0].n === 1);
  expectCode('certificate: withdrawing needs a fresh code', await rpc(opsStale, 'rpc_admin_certificate_withdraw', u(cp.r?.id), t('wrong lot')), 'step_up_required');
  expectRaise('certificate: withdrawing needs a reason', await rpc(ops, 'rpc_admin_certificate_withdraw', u(cp.r?.id), t(' ')), '22023');
  expectOk('certificate: ops withdraws it', await rpc(ops, 'rpc_admin_certificate_withdraw', u(cp.r?.id), t('wrong lot')));
  const cl4 = await rpc(memberA, 'rpc_certificates_list', u(O.A));
  ok('certificate: a withdrawn certificate is listed as withdrawn with NO file path', cl4.r?.certificates?.[0]?.status === 'withdrawn' && cl4.r.certificates[0].storage_path === null, show(cl4));
  expectCode('certificate: it cannot be withdrawn twice', await rpc(ops, 'rpc_admin_certificate_withdraw', u(cp.r?.id), t('again')), 'already_withdrawn');
  const cu = await attempt("do $$ begin update public.certificates set title = 'x'; end $$");
  ok('certificate: a certificate cannot be edited', cu === '23514', cu);

  // ------------------------------------------------------------------------------------------------------------------------------ P9 reports
  const rsales = await rpc(finance, 'rpc_admin_report', t('sales'), d(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)), d(new Date().toISOString().slice(0, 10)));
  ok('report: finance runs sales and A\'s total is $400.00 (3 + 1 units)', rsales.r?.ok === true && Number(rsales.r.rows.find((x) => x.organization_code === 'SCN-A')?.total_cents) === 40000, show(rsales));
  const rrec = await rpc(finance, 'rpc_admin_report', t('receivables'), d(null), d(null));
  ok('report: receivables run (all invoices are paid, so none for A)', rrec.r?.ok === true && !rrec.r.rows.some((x) => x.organization_name === 'Scenario A'), show(rrec));
  const rinv = await rpc(ops, 'rpc_admin_report', t('inventory'), d(null), d(null));
  ok('report: ops runs inventory and sees 96 on hand for EXT-1', rinv.r?.ok === true && rinv.r.rows.find((x) => x.external_sku === 'EXT-1')?.on_hand === 96, show(rinv));
  expectCode('report: ops cannot run a billing report', await rpc(ops, 'rpc_admin_report', t('sales'), d(null), d(null)), 'forbidden');
  expectCode('report: support cannot run a billing report', await rpc(support, 'rpc_admin_report', t('commissions'), d(null), d(null)), 'forbidden');
  expectRaise('report: an unknown report name is refused', await rpc(finance, 'rpc_admin_report', t('payroll'), d(null), d(null)), '22023');
  expectRaise('report: an upside-down period is refused', await rpc(finance, 'rpc_admin_report', t('sales'), d('2026-11-10'), d('2026-11-01')), '22023');
  expectRaise('report: a period over 366 days is refused', await rpc(finance, 'rpc_admin_report', t('sales'), d('2024-01-01'), d('2026-01-01')), '22023');
  const rcom = await rpc(finance, 'rpc_admin_report', t('commissions'), d(null), d(null));
  ok('report: commissions show R with $15.00 accrued, $2.00 adjusted away and $10.00 paid out', Number(rcom.r?.rows?.find((x) => x.organization_name === 'Scenario R')?.accrued_cents) === 1500 && Number(rcom.r?.rows?.find((x) => x.organization_name === 'Scenario R')?.paid_out_cents) === 1000, show(rcom));
  ok('report: every run was audited', (await su("select count(*)::int n from public.audit_events where action = 'staff.report.run' and outcome = 'success'"))[0].n === 4);

  // ------------------------------------------------------------------------------------------------------------------------------ P8 admin operations
  const dbF = await rpc(finance, 'rpc_admin_dashboard');
  ok('dashboard: finance sees money and order counts', dbF.r?.ok === true && dbF.r.can_see_finance === true && Number(dbF.r.finance?.invoiced_30d_cents) >= 50000, show(dbF));
  const dbO = await rpc(ops, 'rpc_admin_dashboard');
  ok('dashboard: ops sees operations but NO money', dbO.r?.ok === true && dbO.r.can_see_finance === false && dbO.r.finance === null, show(dbO));
  expectCode('org status: ops cannot suspend an organization', await rpc(ops, 'rpc_admin_org_set_status', u(O.B), t('suspended'), t('unpaid')), 'forbidden');
  expectCode('org status: a stale code is refused', await rpc(adminStale, 'rpc_admin_org_set_status', u(O.B), t('suspended'), t('unpaid')), 'step_up_required');
  expectCode('org close: A cannot be closed while it has open fulfillment orders', await rpc(admin, 'rpc_admin_org_set_status', u(O.A), t('closed'), t('test')), 'has_open_items');
  expectOk('org status: admin suspends B', await rpc(admin, 'rpc_admin_org_set_status', u(O.B), t('suspended'), t('unpaid invoices')));
  expectCode('org status: a suspended organization is locked out of its own data', await rpc(ownerB, 'rpc_stock_list', u(O.B)), 'organization_not_found');
  expectOk('org status: admin reactivates B', await rpc(admin, 'rpc_admin_org_set_status', u(O.B), t('active'), t('paid')));
  ok('org status: B works again', (await rpc(ownerB, 'rpc_stock_list', u(O.B))).r?.ok === true);
  expectCode('members: the last owner of R cannot be removed', await rpc(admin, 'rpc_admin_member_set', u(O.R), u(U.ownerR), t('remove'), t(null)), 'last_owner_protected');
  expectOk('members: admin sets a member role', await rpc(admin, 'rpc_admin_member_set', u(O.R), u(U.memberR), t('set_role'), t('owner')));
  expectOk('members: with two owners, the first can now be removed', await rpc(admin, 'rpc_admin_member_set', u(O.R), u(U.ownerR), t('remove'), t(null)));
  expectCode('org terms: an invalid term is refused', (await rpc(admin, 'rpc_admin_org_set_terms', u(O.B), t('net999')).then((x) => x.ok === false ? { r: { ok: false, code: 'raised' } } : x)), 'raised');
  expectOk('org terms: admin sets net30 for B', await rpc(admin, 'rpc_admin_org_set_terms', u(O.B), t('net30')));
  const app = await rpc(admin, 'rpc_admin_application_create', t('New Lab LLC'), t('Jo Lab'), t('jo@newlab.test'), t(null), t(null), t('hello'));
  expectOk('application: admin enters an application', app);
  const appId = (await su("select id from public.organization_applications where contact_email = 'jo@newlab.test'"))[0]?.id;
  expectCode('application: support cannot approve', await rpc(support, 'rpc_admin_application_review', u(appId), t('approve'), t('ok'), t('NEWLAB')), 'forbidden');
  const apr = await rpc(admin, 'rpc_admin_application_review', u(appId), t('approve'), t('ok'), t('NEWLAB'));
  ok('application: approval creates the organization on prepay terms', apr.r?.ok === true && (await su("select payment_terms from public.organizations where code = 'NEWLAB'"))[0]?.payment_terms === 'prepay', show(apr));
  expectCode('application: a reviewed application is final', await rpc(admin, 'rpc_admin_application_review', u(appId), t('reject'), t('late'), t(null)), 'already_reviewed');
  const fee = await rpc(finance, 'rpc_admin_fee_save', t('per_order'), t('Per order'), i8(500), t('per_order'), t(null), d(new Date().toISOString().slice(0, 10)));
  expectOk('fees: finance saves a fee', fee);
  expectCode('fees: a start date not after the open row is refused', await rpc(finance, 'rpc_admin_fee_save', t('per_order'), t('Per order'), i8(600), t('per_order'), t(null), d(new Date().toISOString().slice(0, 10))), 'effective_date_invalid');
  ok('fees: customers see the current fee', (await rpc(ownerA, 'rpc_fee_schedule_current')).r?.fees?.[0]?.amount_cents === 500);
  expectCode('settings: ops cannot change payment instructions', await rpc(ops, 'rpc_admin_setting_set', t('payment_instructions'), t('Zelle: x')), 'forbidden');
  expectOk('settings: admin sets payment instructions', await rpc(admin, 'rpc_admin_setting_set', t('payment_instructions'), t('Zelle: pay@example.test')));
  ok('settings: customers see them', (await rpc(ownerA, 'rpc_payment_instructions')).r?.payment_instructions === 'Zelle: pay@example.test');
  expectRaise('settings: an unknown key is refused', await rpc(admin, 'rpc_admin_setting_set', t('wallet_enabled'), t('true')), '22023');
  const cus = await rpc(support, 'rpc_admin_customers_list', t(null));
  ok('customers: support sees e-mail but NOT phone, and the read is audited', cus.r?.ok === true && cus.r.can_see_phone === false && cus.r.customers.every((c) => c.phone === null) && (await su("select count(*)::int n from public.audit_events where action = 'staff.profiles.read'"))[0].n >= 1, show(cus));
  const au = await rpc(admin, 'rpc_admin_audit_list', t('staff.commission.'), u(null), i4(50));
  ok('audit: the commission actions appear in the audit log', au.r?.ok === true && au.r.events.length >= 4, show(au));
  expectCode('audit: ops cannot read the audit log', await rpc(ops, 'rpc_admin_audit_list', t(null), u(null), i4(10)), 'forbidden');
  expectRaise('audit: a pattern in the prefix is refused', await rpc(admin, 'rpc_admin_audit_list', t('staff%'), u(null), i4(10)), '22023');
  ok('audit: denied attempts were recorded', (await su("select count(*)::int n from public.audit_events where outcome = 'denied'"))[0].n >= 20);
  ok('profile: a user updates only their own profile', (await rpc(ownerA, 'rpc_profile_update', t('Owner A'), t('+1 512 555 0100'))).r?.ok === true && (await su('select full_name from public.profiles where user_id = $1', [U.ownerA]))[0].full_name === 'Owner A' && (await su('select full_name from public.profiles where user_id = $1', [U.ownerB]))[0].full_name !== 'Owner A');

  // ------------------------------------------------------------------------------------------------------------------------------ P5 onboarding: a new organization from first product to go-live
  const userC = id(); const orgC = id(); const ownerC = J(userC);
  await su("insert into auth.users (id, email, email_confirmed_at, aud, role) values ($1, 'scn-ownerC@example.test', now(), 'authenticated', 'authenticated')", [userC]);
  await su("insert into public.organizations (id, name, code) values ($1, 'Scenario C', 'SCN-C')", [orgC]);
  await su("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [orgC, userC]);
  const payInvoice = async (claims, org, invoiceId, total, label) => {
    const pr = await rpc(claims, 'rpc_payment_report', u(org), u(invoiceId), t('wire'), i8(total), t('W-1'), d(null), t(null), u(id()));
    const pid = (await su('select id from public.payments where invoice_id = $1', [invoiceId]))[0]?.id;
    const cf = pid ? await rpc(finance, 'rpc_admin_payment_confirm', u(pid), i8(total), d(new Date().toISOString().slice(0, 10)), t(null), t(null)) : pr;
    ok(`${label}: paid and confirmed`, cf.r?.ok === true && (await su('select status from public.invoices where id = $1', [invoiceId]))[0]?.status === 'paid', show(cf));
  };
  const stepStatus = async (n) => (await su('select s.status from public.onboarding_steps s join public.onboarding_instances i on i.id = s.instance_id where i.organization_id = $1 and s.step_no = $2', [orgC, n]))[0]?.status;
  const review = (who, n, dec, reason = null) => rpc(who, 'rpc_admin_step_review', u(orgC), i4(n), t(dec), t(reason), t(null));
  expectCode('onboarding: nothing can be submitted before a product exists', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(1), j({})), 'nothing_to_submit');
  expectCode('onboarding: step 5 is locked until steps 1 and 4 are approved', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(5), j({})), 'step_locked');
  const sm = await rpc(ownerC, 'rpc_sku_mapping_save', u(orgC), u(null), t('private'), u(null), t('C Peptide'), t('10mg'), t('C-1'), i4(1), t('012345678905'), i4(20));
  expectOk('step 1: owner adds a private product', sm);
  expectCode('step 1: a duplicate external SKU is refused', await rpc(ownerC, 'rpc_sku_mapping_save', u(orgC), u(null), t('private'), u(null), t('Other'), t('5mg'), t('C-1'), i4(1), t(null), i4(null)), 'duplicate_sku');
  expectRaise('step 1: a bad barcode is refused', await rpc(ownerC, 'rpc_sku_mapping_save', u(orgC), u(null), t('private'), u(null), t('Other'), t('5mg'), t('C-2'), i4(1), t('abc'), i4(null)), '22023');
  expectCode('step 1: staff cannot approve before the customer submits', await rpc(ops, 'rpc_admin_mapping_review', u(sm.r?.id), t('approve'), t(null)), 'nothing_to_review');
  expectOk('step 1: owner submits the step', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(1), j({})));
  expectCode('step 1: a submitted product can no longer be edited', await rpc(ownerC, 'rpc_sku_mapping_save', u(orgC), u(sm.r?.id), t('private'), u(null), t('C Peptide'), t('10mg'), t('C-1'), i4(2), t(null), i4(null)), 'step_not_submittable');
  expectCode('step 1: approving the step before the product is approved is refused', await review(ops, 1, 'approve'), 'not_ready');
  expectOk('step 1: staff approve the product', await rpc(ops, 'rpc_admin_mapping_review', u(sm.r?.id), t('approve'), t(null)));
  expectOk('step 1: staff approve the step', await review(ops, 1, 'approve'));
  ok('step 1: status is approved', (await stepStatus(1)) === 'approved');
  // step 2 labels
  const docL = id(); const docOtherOrg = id();
  await su("insert into storage.objects (bucket_id, name, metadata) values ('portal-documents', $1, $2::jsonb)", [`${orgC}/${docL}.pdf`, JSON.stringify({ size: 4096, mimetype: 'application/pdf' })]);
  await su("insert into storage.objects (bucket_id, name, metadata) values ('portal-documents', $1, $2::jsonb)", [`${O.A}/${docOtherOrg}.pdf`, JSON.stringify({ size: 4096, mimetype: 'application/pdf' })]);
  expectCode('step 2: a file in another organization\'s folder cannot be registered by C', await rpc(ownerC, 'rpc_document_register', u(orgC), u(docOtherOrg), t('label_artwork'), t('x.pdf')), 'document_not_found');
  expectRaise('step 2: a customer cannot register a certificate or agreement kind', await rpc(ownerC, 'rpc_document_register', u(orgC), u(docL), t('certificate'), t('x.pdf')), '22023');
  expectOk('step 2: owner registers the label artwork (read back from storage)', await rpc(ownerC, 'rpc_document_register', u(orgC), u(docL), t('label_artwork'), t('label.pdf')));
  ok('step 2: the stored size and type come from storage, not the caller', Number((await su('select size_bytes from public.documents where id = $1', [docL]))[0]?.size_bytes) === 4096);
  const ld = await rpc(ownerC, 'rpc_label_design_add', u(orgC), u(sm.r?.id), t('ml3'), u(docL));
  expectOk('step 2: owner attaches the label to the product', ld);
  expectOk('step 2: owner submits labels', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(2), j({})));
  expectCode('step 2: a label cannot be approved before gate G2 is recorded', await rpc(ops, 'rpc_admin_label_review', u(ld.r?.id), t('approve'), t(null)), 'gate_required');
  expectCode('gates: ops cannot record a gate', await rpc(ops, 'rpc_admin_gate_record', t('G2'), t('recorded'), t('approved by counsel')), 'forbidden');
  expectCode('gates: a stale code cannot record a gate', await rpc(adminStale, 'rpc_admin_gate_record', t('G2'), t('recorded'), t('approved by counsel')), 'step_up_required');
  expectOk('gates: admin records G2', await rpc(admin, 'rpc_admin_gate_record', t('G2'), t('recorded'), t('label wording approved')));
  expectOk('step 2: staff approve the label', await rpc(ops, 'rpc_admin_label_review', u(ld.r?.id), t('approve'), t(null)));
  expectOk('step 2: staff approve the step', await review(ops, 2, 'approve'));
  // step 3 packaging, step 4 store
  const popt = (await su('select id from public.packaging_options where active limit 1'))[0]?.id;
  expectCode('step 3: an unknown packaging option is refused', await rpc(ownerC, 'rpc_packaging_select', u(orgC), u(id()), t(null)), 'option_not_found');
  expectOk('step 3: owner picks standard packaging', await rpc(ownerC, 'rpc_packaging_select', u(orgC), u(popt), t('fragile')));
  expectOk('step 3: owner submits packaging', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(3), j({})));
  expectOk('step 3: staff approve', await review(ops, 3, 'approve'));
  expectRaise('step 4: an http store URL is refused', await rpc(ownerC, 'rpc_store_connection_save', u(orgC), t('api'), t('http://shop.example.com'), t(null), t(null)), '22023');
  expectOk('step 4: owner saves the store connection', await rpc(ownerC, 'rpc_store_connection_save', u(orgC), t('api'), t('https://shop.example.com'), t(null), t(null)));
  expectOk('step 4: owner submits the store', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(4), j({})));
  expectRaise('step 4: staff cannot reject without a reason', await review(ops, 4, 'reject'), '22023');
  expectOk('step 4: staff reject with a reason', await review(ops, 4, 'reject', 'webhook URL missing'));
  ok('step 4: the step goes back to the customer as rejected', (await stepStatus(4)) === 'rejected');
  expectOk('step 4: owner fixes the store connection', await rpc(ownerC, 'rpc_store_connection_save', u(orgC), t('api'), t('https://shop.example.com'), t('https://shop.example.com/hook'), t(null)));
  expectOk('step 4: owner resubmits', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(4), j({})));
  expectOk('step 4: staff approve', await review(ops, 4, 'approve'));
  // step 5 sandbox test order through the API
  expectCode('step 5: not ready without a sandbox order', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(5), j({})), 'not_ready');
  const keyC = `99pw_test_${randomUUID().replace(/-/g, '').slice(0, 40)}`;
  expectOk('step 5: owner creates a test API key', await rpc(ownerC, 'rpc_api_key_create', u(orgC), t('sandbox'), t('test'), t(keyC.slice(0, 16)), t(sha256(keyC))));
  expectOk('step 5: a sandbox order arrives through the API', await rpc(anon, 'rpc_api_order_create', t(sha256(keyC)), t(null), t(null), j({ external_ref: 'TEST-1', recipient: SHIP, lines: [{ sku: 'C-1', quantity: 1 }] })));
  expectOk('step 5: owner submits the test order step', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(5), j({})));
  expectOk('step 5: staff approve', await review(ops, 5, 'approve'));
  // step 6 agreement and setup payment
  const docAg = id();
  await su("insert into storage.objects (bucket_id, name, metadata) values ('portal-documents', $1, $2::jsonb)", [`${orgC}/${docAg}.pdf`, JSON.stringify({ size: 9000, mimetype: 'application/pdf' })]);
  expectCode('step 6: the customer cannot accept an agreement nobody offered', await rpc(ownerC, 'rpc_agreement_accept', u(orgC), t('Dr C'), t('CEO'), u(null)), 'not_ready');
  expectOk('step 6: staff register the agreement', await rpc(ops, 'rpc_admin_document_register', u(orgC), u(docAg), t('agreement'), t('agreement.pdf')));
  expectOk('step 6: staff offer the agreement', await rpc(ops, 'rpc_admin_agreement_offer', u(orgC), u(docAg)));
  expectCode('step 6: approving before it is signed is refused', await review(ops, 6, 'approve'), 'agreement_not_signed');
  expectOk('step 6: owner signs (typed name and title)', await rpc(ownerC, 'rpc_agreement_accept', u(orgC), t('Dr C'), t('CEO'), u(null)));
  expectCode('step 6: signing twice is refused', await rpc(ownerC, 'rpc_agreement_accept', u(orgC), t('Dr C'), t('CEO'), u(null)), 'already_reviewed');
  expectCode('step 6: approving before the setup fee is paid is refused', await review(ops, 6, 'approve'), 'setup_unpaid');
  expectCode('setup invoices: ops cannot create them', await rpc(ops, 'rpc_admin_setup_invoices_create', u(orgC), i8(100000), i8(50000)), 'forbidden');
  expectCode('setup invoices: a stale code is refused', await rpc(financeStale, 'rpc_admin_setup_invoices_create', u(orgC), i8(100000), i8(50000)), 'step_up_required');
  expectOk('setup invoices: finance creates the $1,000 setup and $500 funding invoices', await rpc(finance, 'rpc_admin_setup_invoices_create', u(orgC), i8(100000), i8(50000)));
  expectCode('setup invoices: they cannot be created twice', await rpc(finance, 'rpc_admin_setup_invoices_create', u(orgC), i8(100000), i8(50000)), 'invoice_exists');
  const invs = (await rpc(ownerC, 'rpc_invoices_list', u(orgC), i4(10))).r?.invoices ?? [];
  const setupInv = invs.find((x) => x.kind === 'setup'); const fundInv = invs.find((x) => x.kind === 'funding');
  ok('setup invoices: the customer sees both, with no order attached', setupInv && fundInv && setupInv.order_number === null && Number(setupInv.total_cents) === 100000 && Number(fundInv.total_cents) === 50000, JSON.stringify(invs).slice(0, 300));
  expectCode('step 7: is locked until step 6 is approved', await review(ops, 7, 'approve'), 'step_locked');
  await payInvoice(ownerC, orgC, setupInv?.invoice_id, 100000, 'setup invoice');
  expectOk('step 6: with the setup fee paid, staff approve the agreement step', await review(ops, 6, 'approve'));
  // step 7 funding
  expectCode('step 7: the customer must acknowledge the funding', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(7), j({})), 'not_ready');
  expectOk('step 7: owner acknowledges', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(7), j({ acknowledge: 'true' })));
  expectCode('step 7: staff cannot approve while the funding invoice is unpaid', await review(ops, 7, 'approve'), 'funding_unmet');
  await payInvoice(ownerC, orgC, fundInv?.invoice_id, 50000, 'funding invoice');
  expectOk('step 7: staff approve once funded', await review(ops, 7, 'approve'));
  // step 8 launch review
  expectCode('step 8: incomplete launch data is refused', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(8), j({ contacts: [] })), 'not_ready');
  const launch = { contacts: [{ name: 'Dr C', email: 'c@example.test' }], escalation: { name: 'Dr C', phone: '+15125550100' }, returnAddress: SHIP, confirmations: { accurate: 'true', labelsApproved: 'true', terms: 'true' } };
  expectOk('step 8: owner submits the launch review', await rpc(ownerC, 'rpc_onboarding_step_submit', u(orgC), i4(8), j(launch)));
  expectOk('step 8: staff approve', await review(ops, 8, 'approve'));
  // step 9 go-live
  expectCode('go live: ops cannot go live (admin only)', await rpc(ops, 'rpc_admin_go_live', u(orgC)), 'forbidden');
  expectCode('go live: the required gates G1, G4, G5, G6 are not recorded yet', await rpc(admin, 'rpc_admin_go_live', u(orgC)), 'gate_required');
  for (const g of ['G1', 'G4', 'G5', 'G6']) expectOk(`gates: admin records ${g}`, await rpc(admin, 'rpc_admin_gate_record', t(g), t('recorded'), t('verified')));
  expectCode('go live: a stale code is refused', await rpc(adminStale, 'rpc_admin_go_live', u(orgC)), 'step_up_required');
  expectOk('go live: admin takes the organization live', await rpc(admin, 'rpc_admin_go_live', u(orgC)));
  expectCode('go live: it cannot be done twice', await rpc(admin, 'rpc_admin_go_live', u(orgC)), 'already_live');
  const liveKey = `99pw_live_${randomUUID().replace(/-/g, '').slice(0, 40)}`;
  expectOk('go live: the organization can now create a LIVE API key', await rpc(ownerC, 'rpc_api_key_create', u(orgC), t('prod'), t('live'), t(liveKey.slice(0, 16)), t(sha256(liveKey))));
  ok('onboarding: the audit log has the onboarding actions', (await su("select count(*)::int n from public.audit_events where action like 'onboarding.%' or action like 'staff.step.%' or action = 'staff.onboarding.golive'"))[0].n >= 20);
  ok('onboarding: all 9 steps are approved', (await su("select count(*)::int n from public.onboarding_steps s join public.onboarding_instances i on i.id = s.instance_id where i.organization_id = $1 and s.status = 'approved'", [orgC]))[0].n === 9);
  ok('onboarding: submissions cannot be rewritten', (await attempt("do $$ begin update public.onboarding_submissions set data = '{}'::jsonb; end $$")) === '23514');
  ok('onboarding: documents cannot be rewritten', (await attempt("do $$ begin update public.documents set file_name = 'x'; end $$")) === '23514');

  // ------------------------------------------------------------------------------------------------------------------------------ final invariants
  ok('invariant: the anon role still executes exactly the five key-authenticated functions', JSON.stringify((await su("select array_agg(p.proname::text order by p.proname) as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')"))[0].n) === JSON.stringify(['rpc_api_order_create', 'rpc_api_order_get', 'rpc_api_orders_list', 'rpc_worker_claim_deliveries', 'rpc_worker_record_result']));
  ok('invariant: no balance is negative and none reserves more than it holds', (await su('select count(*)::int n from public.inventory_balances where on_hand < 0 or reserved < 0 or reserved > on_hand'))[0].n === 0);
}
