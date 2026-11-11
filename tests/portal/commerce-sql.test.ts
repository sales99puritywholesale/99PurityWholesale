import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORDER_TRANSITIONS } from '@/lib/portal/commerce/orders';

// These tests read the TEXT of the P3 migration only (no database): the PROMOTED file supabase/migrations/20261110000100_p3_catalog_pricing_orders.sql, which is a byte-identical copy of the
// reviewed revision 2 candidate (supabase/review/p3/...rev2.sql, sha256 d5efe7e9...5beb) that passed the PostgreSQL rollback dry run and Phase T. It is promoted but NOT YET APPLIED to any database.
// They check the baseline controls (tenant boundary, grants, gates, snapshots, immutability, locks, idempotency) and that the SQL and the TypeScript model agree. Concurrency and real MFA remain
// untested (P10).
const root = process.cwd();
const MIGRATION_NAME = '20261110000100_p3_catalog_pricing_orders.sql';
const file = join(root, 'supabase', 'migrations', MIGRATION_NAME);
const candidateFile = join(root, 'supabase', 'review', 'p3', '20261110000100_p3_catalog_pricing_orders.rev2.sql');
const originalFile = join(root, 'supabase', 'review', 'p3', MIGRATION_NAME);
const REVISED_SHA256 = 'd5efe7e9753b13c6ccaedf1fb70d31ab3431d967d46764ceb3cb290ce5195beb';
const ORIGINAL_SHA256 = 'bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e';
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const sql = readFileSync(file, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = (schema: string, name: string) => new RegExp(`create function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(code)?.[0] ?? '';

const CUSTOMER_RPCS = ['rpc_catalog_list', 'rpc_cart_get', 'rpc_cart_put_item', 'rpc_cart_empty', 'rpc_checkout', 'rpc_orders_list', 'rpc_order_get'];
const STAFF_RPCS: Record<string, { cap: string; stepUp: boolean }> = {
  rpc_admin_orgs_list: { cap: 'org.read', stepUp: false },
  rpc_admin_org_create: { cap: 'org.manage', stepUp: true },
  rpc_admin_org_member_add: { cap: 'members.manage', stepUp: true },
  rpc_admin_catalog_list: { cap: 'org.manage', stepUp: false },
  rpc_admin_variant_set_price: { cap: 'org.manage', stepUp: true },
  rpc_admin_product_set_status: { cap: 'org.manage', stepUp: false },
  rpc_admin_org_catalog_get: { cap: 'org.manage', stepUp: false },
  rpc_admin_org_product_set: { cap: 'org.manage', stepUp: false },
  rpc_admin_markup_rule_set: { cap: 'org.manage', stepUp: true },
  rpc_admin_orders_list: { cap: 'org.read', stepUp: false },
  rpc_admin_order_get: { cap: 'org.read', stepUp: false },
  rpc_admin_order_set_status: { cap: 'fulfillment.process', stepUp: false },
};
const TABLES = ['products', 'product_variants', 'organization_products', 'markup_rules', 'carts', 'cart_items', 'orders', 'order_items', 'order_events'];
// the administrative RPCs that can change a price, a status, an assignment or a rule: they must take the pricing lock EXCLUSIVELY
const CH = [['p5', '20261111000200_p5_fulfillment_onboarding.sql'], ['p6', '20261111000300_p6_api_integrations.sql'], ['p7', '20261111000400_p7_inventory_warehouse.sql'], ['p8', '20261111000500_p8_admin_operations.sql'], ['p9', '20261111000600_p9_aftersales.sql']] as const;
const PRICING_WRITERS = ['rpc_admin_variant_set_price', 'rpc_admin_product_set_status', 'rpc_admin_org_product_set', 'rpc_admin_markup_rule_set'];

describe('P3 migration: placement, provenance and scope', () => {
  it('the migrations directory holds exactly the four P1/P2 files, the P3 and P4 migrations (applied) and the five promoted P5 to P9 migrations', () => {
    expect(readdirSync(join(root, 'supabase', 'migrations')).sort()).toEqual([
      '20261108000001_foundation_identity.sql', '20261108000002_staff_capabilities.sql', '20261108000003_audit_and_step_up.sql', '20261108000004_staff_management_rpcs.sql', MIGRATION_NAME,
      '20261111000100_p4_invoices_payments_wallet.sql', ...CH.map((x) => x[1]),
    ]);
    // the header is part of the reviewed bytes and is deliberately not edited (editing it would change the validated hash)
    expect(sql).toMatch(/P3 DRAFT\. NOT APPLIED\. NOT EXECUTED\. NEVER PARSED BY POSTGRESQL/);
  });
  it('the promoted file is byte-identical to the reviewed revision 2 candidate, whose hash is the one validated on PostgreSQL (dry run and Phase T)', () => {
    const promoted = readFileSync(file);
    expect(promoted.equals(readFileSync(candidateFile))).toBe(true);
    expect(sha256(promoted)).toBe(REVISED_SHA256);
    expect(promoted.includes(13)).toBe(false); // LF only
  });
  it('the ORIGINAL review draft (which has the shipping-validation defect) is not what is promoted, and is preserved unchanged', () => {
    expect(sha256(readFileSync(originalFile))).toBe(ORIGINAL_SHA256);
    expect(sha256(readFileSync(file))).not.toBe(ORIGINAL_SHA256);
  });
  it('supabase/migration-hashes.txt lists the promoted file with the revised hash', () => {
    const lines = readFileSync(join(root, 'supabase', 'migration-hashes.txt'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
    expect(lines).toContain(`${REVISED_SHA256}  ${MIGRATION_NAME}`);
  });
  it('adds no capability rows and no service-role dependency; writes nothing to auth', () => {
    expect(code).not.toMatch(/insert\s+into\s+public\.(capabilities|role_capabilities)/i);
    expect(code.replace(/'(?:[^']|'')*'/g, "''").replace(/from public, anon, authenticated, service_role/g, '')).not.toMatch(/service_role/);
    expect(code).not.toMatch(/(insert\s+into|update|delete\s+from)\s+auth\./i);
  });
  it('only reuses capabilities that exist in migration 0002', () => {
    const m2 = readFileSync(join(root, 'supabase', 'migrations', '20261108000002_staff_capabilities.sql'), 'utf8');
    for (const c of new Set(Object.values(STAFF_RPCS).map((s) => s.cap))) expect(m2, c).toContain(`'${c}'`);
  });
});

describe('default deny: RLS on, no table privilege to any API role, RPC-only access', () => {
  it('every table has RLS enabled and is revoked from public, anon, authenticated and service_role; no policy and no grant on tables', () => {
    for (const t of TABLES) expect(code, t).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security;`));
    const revoke = /revoke all on table([\s\S]*?)from public, anon, authenticated, service_role;/.exec(code)?.[1] ?? '';
    for (const t of TABLES) expect(revoke, t).toContain(`public.${t}`);
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)\b/i);
    expect(code).toMatch(/revoke all on sequence public\.order_number_seq/);
  });
  it('the self-check asserts RLS, the absence of API privileges, the RPC state, the guard triggers and the Aspen vectors', () => {
    expect(sql).toMatch(/self-check: RLS not enabled/);
    expect(sql).toMatch(/self-check: an API role has/);
    expect(sql).toMatch(/<> 19 then\s+raise exception 'self-check: RPC definer, search_path or grant state is wrong'/);
    expect(sql).toMatch(/<> 6 then\s+raise exception 'self-check: expected 6 guard triggers/);
    expect(sql).toMatch(/self-check: shop_compose does not reproduce the Aspen pricing vectors/);
  });
  it('19 public RPCs, every one SECURITY DEFINER with search_path pinned, revoked from every API role and granted to authenticated only', () => {
    const names = [...CUSTOMER_RPCS, ...Object.keys(STAFF_RPCS)];
    expect(names).toHaveLength(19);
    const all = [...code.matchAll(/create function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    expect(all.sort()).toEqual([...names].sort());
    for (const n of names) {
      const b = fn('public', n);
      expect(b, n).toMatch(/security definer set search_path = ''/);
      expect(code, n).toMatch(new RegExp(`revoke all on function[\\s\\S]*public\\.${n}\\(`));
      expect(code, n).toMatch(new RegExp(`grant execute on function[\\s\\S]*public\\.${n}\\([\\s\\S]*?to authenticated;`));
    }
    expect(code).not.toMatch(/grant execute[^;]*\bto\b[^;]*\b(anon|public|service_role)\b/i);
  });
  it('every private function pins search_path and is revoked from every API role', () => {
    for (const m of code.matchAll(/create function private\.([a-z0-9_]+)\([^)]*\)([\s\S]*?)\bas \$\$/g)) expect(m[2], m[1]).toMatch(/set search_path = ''/);
    for (const n of ['shop_markup_amount', 'shop_compose', 'shop_price_breakdown', 'shop_order_transition_ok', 'shop_ship_to_ok', 'shop_org_ok', 'guard_shop_orders', 'guard_shop_append_only'])
      expect(code, n).toMatch(new RegExp(`revoke all on function[\\s\\S]*private\\.${n}\\(`));
  });
});

describe('tenant boundary and authentication', () => {
  it('every customer RPC rejects an unauthenticated caller, checks active membership of the named organization (private.my_org_ids) and an active organization, and answers generically', () => {
    for (const n of CUSTOMER_RPCS) {
      const b = fn('public', n);
      expect(b, n).toMatch(/v_actor\s+uuid := \(select auth\.uid\(\)\)/);
      expect(b, n).toMatch(/if v_actor is null then raise exception 'authentication required' using errcode = '42501'/);
      expect(b, n).toMatch(/p_organization_id in \(select private\.my_org_ids\(\)\)/);
      expect(b, n).toMatch(/private\.shop_org_ok\(p_organization_id\)/);
      expect(b, n).toMatch(/'organization_not_found'/);
    }
  });
  it('customer reads and writes are scoped to the caller: cart by (organization, user), orders by organization', () => {
    expect(fn('public', 'rpc_cart_get')).toMatch(/c\.organization_id = p_organization_id and c\.user_id = v_actor/);
    expect(fn('public', 'rpc_cart_put_item')).toMatch(/c\.organization_id = p_organization_id and c\.user_id = v_actor for update/);
    expect(fn('public', 'rpc_cart_empty')).toMatch(/c\.organization_id = p_organization_id and c\.user_id = v_actor/);
    expect(fn('public', 'rpc_checkout')).toMatch(/c\.organization_id = p_organization_id and c\.user_id = v_actor for update/);
    expect(fn('public', 'rpc_orders_list')).toMatch(/x\.organization_id = p_organization_id/);
    expect(fn('public', 'rpc_order_get')).toMatch(/x\.id = p_order_id and x\.organization_id = p_organization_id/);
  });
  it('a storefront never returns the base price, the floor or any markup to a customer', () => {
    for (const n of ['rpc_catalog_list', 'rpc_cart_get', 'rpc_orders_list', 'rpc_order_get']) {
      const b = fn('public', n);
      expect(b, n).not.toMatch(/'base_price_cents'|'min_price_cents'|'floor_cents'|i\.pricing|'org_amount'|'rep_amount'|'markup/);
    }
    expect(fn('public', 'rpc_order_get')).not.toMatch(/i\.pricing|base_price|floor/);
  });
});

describe('staff RPCs: verified staff session, capability, step-up where money or access changes, audit', () => {
  for (const [n, rule] of Object.entries(STAFF_RPCS)) {
    it(`${n}: ${rule.cap}${rule.stepUp ? ' + fresh step-up' : ''}`, () => {
      const b = fn('public', n);
      expect(b).toMatch(new RegExp(`private\\.staff_gate\\('${rule.cap.replace('.', '\\.')}', '[a-z_.]+', ${rule.stepUp}, `));
      expect(b).toMatch(/if v_gate <> 'ok' then return jsonb_build_object\('ok', false, 'code', v_gate\)/);
      if (!/_(list|get)$/.test(n)) {
        expect(b).toMatch(/private\.write_audit\(v_actor, 'staff', 'staff\.[a-z_.]+', 'success'/);
        expect(b).not.toMatch(/jsonb_build_object\([^;]*(p_reason|v_reason)/);
      }
    });
  }
  it('prices, markup rules, organization creation and member changes require a fresh step-up; the audit keeps old and new values', () => {
    for (const n of ['rpc_admin_variant_set_price', 'rpc_admin_markup_rule_set', 'rpc_admin_org_create', 'rpc_admin_org_member_add']) expect(STAFF_RPCS[n]?.stepUp, n).toBe(true);
    expect(fn('public', 'rpc_admin_variant_set_price')).toMatch(/'old_base', o\.base_price_cents, 'new_base', p_base_cents/);
    expect(fn('public', 'rpc_admin_markup_rule_set')).toMatch(/'old_type', v_old_t, 'old_value_e4', v_old_v, 'old_active', v_old_a,[\s\S]*'new_type', p_markup_type, 'new_value_e4', p_value_e4, 'new_active', p_active/);
  });
  it('price, floor and rule inputs are range checked in the database; a floor and a base price are positive', () => {
    expect(fn('public', 'rpc_admin_variant_set_price')).toMatch(/p_base_cents not between 1 and 100000000/);
    expect(fn('public', 'rpc_admin_variant_set_price')).toMatch(/p_min_cents not between 1 and 100000000/);
    const r = fn('public', 'rpc_admin_markup_rule_set');
    expect(r).toMatch(/p_markup_type = 'percent' and p_value_e4 > 10000000/);
    expect(r).toMatch(/p_markup_type = 'fixed' and p_value_e4 > 10000000000/);
    expect(r).toMatch(/p_kind = 'representative' and num_nonnulls\(p_rep_min_percent_e4, p_rep_max_percent_e4, p_rep_min_fixed_e4, p_rep_max_fixed_e4\) <> 0/);
    expect(code).toMatch(/markup_rules_bounds_org_only check \(kind = 'organization' or num_nonnulls/);
    expect(code).toMatch(/markup_rules_value_cap check/);
  });
});

describe('Aspen pricing semantics in SQL (the numeric parity is in p3-pricing-aspen-parity.test.ts)', () => {
  const compose = fn('private', 'shop_compose');
  it('markup_amount: percent rounds half away from zero in integer arithmetic on four-decimal values; fixed rounds the value to cents', () => {
    expect(fn('private', 'shop_markup_amount')).toMatch(/when 'percent' then \(p_price_cents \* p_value_e4 \+ 500000\) \/ 1000000/);
    expect(fn('private', 'shop_markup_amount')).toMatch(/when 'fixed'\s+then \(p_value_e4 \+ 50\) \/ 100/);
  });
  it('compose: organization markup first, representative markup on the ORGANIZATION price, clamp to bounds of the rule type, floor last, floor and base required', () => {
    expect(compose).toMatch(/if p_base is null or p_base <= 0 or p_floor is null or p_floor <= 0 then\s+return null;/);
    const iOrg = compose.indexOf('v_org_amt := private.shop_markup_amount(p_org_type, p_org_value_e4, p_base)');
    const iRep = compose.indexOf('v_rep_amt := private.shop_markup_amount(p_rep_type, v_val, v_org_price)');
    const iFloor = compose.indexOf('v_unit := greatest(v_raw, p_floor)');
    expect(iOrg).toBeGreaterThan(-1);
    expect(iRep).toBeGreaterThan(iOrg);
    expect(iFloor).toBeGreaterThan(iRep);
    expect(compose).toMatch(/v_lo := case p_rep_type when 'percent' then p_min_pct_e4 else p_min_fixed_e4 end/);
    expect(compose).toMatch(/v_hi := case p_rep_type when 'percent' then p_max_pct_e4 else p_max_fixed_e4 end/);
    expect(compose).toMatch(/if v_unit > 100000000 then\s+return null;/);
  });
  it('rule choice: active rules only, product-specific beats the default, representative bounds come from the organization rule', () => {
    const b = fn('private', 'shop_price_breakdown');
    expect(b.match(/r\.is_active and \(r\.product_id = p_product or r\.product_id is null\)\s+order by \(r\.product_id is null\) limit 1/g)).toHaveLength(2);
    expect(b).toMatch(/r\.kind = 'organization'/);
    expect(b).toMatch(/r\.kind = 'representative'/);
    expect(b).toMatch(/r\.rep_min_percent_e4, r\.rep_max_percent_e4, r\.rep_min_fixed_e4, r\.rep_max_fixed_e4/);
  });
  it('a floor is required to list or sell: storefront, cart, add-to-cart, checkout and publishing all go through the same price function and refuse a variant without base AND floor', () => {
    for (const n of ['rpc_catalog_list', 'rpc_cart_get', 'rpc_cart_put_item', 'rpc_checkout']) expect(fn('public', n), n).toMatch(/private\.shop_price_breakdown\(/);
    const pub = fn('public', 'rpc_admin_org_product_set');
    expect(pub).toMatch(/v\.base_price_cents is not null and v\.min_price_cents is not null/);
    expect(pub).toMatch(/'product_not_priced'/);
    expect(code).toMatch(/base_price_cents\s+integer check \(base_price_cents is null or base_price_cents between 1 and 100000000\)/);
    expect(code).toMatch(/min_price_cents\s+integer check \(min_price_cents is null or min_price_cents between 1 and 100000000\)/);
    expect(fn('public', 'rpc_catalog_list')).toMatch(/b\.pr is not null/);
  });
  it('rules are unique per (organization, kind, product); one representative rule set per organization is the documented assumption', () => {
    expect(code).toMatch(/create unique index markup_rules_scope_idx on public\.markup_rules \(organization_id, kind, coalesce\(product_id,/);
  });
});

describe('future-only pricing: order lines are an immutable snapshot of the full breakdown', () => {
  it('the snapshot keeps base, floor, unit, line total and the complete breakdown, and the columns must agree', () => {
    const t = /create table public\.order_items \([\s\S]*?\n\);/.exec(code)?.[0] ?? '';
    for (const c of ['product_name', 'spec', 'sku', 'base_price_cents', 'floor_cents', 'unit_price_cents', 'line_total_cents']) expect(t, c).toContain(c);
    expect(t).toMatch(/pricing\s+jsonb not null/);
    expect(t).toMatch(/line_total_cents = unit_price_cents::bigint \* quantity/);
    expect(t).toMatch(/order_items_pricing_matches check \(\(pricing ->> 'unit'\)::bigint = unit_price_cents/);
    expect(code).toMatch(/orders_total_matches_subtotal check \(total_cents = subtotal_cents\)/);
  });
  it('orders, items and events cannot be deleted or rewritten; status moves only along the lifecycle; TRUNCATE is blocked; no function rewrites an item', () => {
    const g = fn('private', 'guard_shop_orders');
    for (const col of ['order_number', 'organization_id', 'placed_by', 'idempotency_key', 'subtotal_cents', 'total_cents', 'currency', 'ship_to', 'notes', 'created_at']) expect(g, col).toContain(`old.${col}`);
    expect(g).toMatch(/orders cannot be deleted/);
    expect(g).toMatch(/private\.shop_order_transition_ok\(old\.status, new\.status\)/);
    expect(code).toMatch(/create trigger order_items_append_only before update or delete on public\.order_items/);
    expect(code).toMatch(/create trigger order_events_append_only before update or delete on public\.order_events/);
    for (const t of ['orders', 'order_items', 'order_events']) expect(code).toMatch(new RegExp(`before truncate on public\\.${t} for each statement execute function private\\.block_truncate\\(\\)`));
    expect(code).not.toMatch(/(update|delete\s+from)\s+public\.(order_items|order_events)\b/i);
    expect(code).not.toMatch(/delete\s+from\s+public\.(orders|order_items|order_events)\b/i);
  });
  it('no repricing path exists: nothing updates orders except the status RPC (status and updated_at only)', () => {
    const updates = [...code.matchAll(/update public\.orders set ([^;]*?) where/g)].map((m) => m[1]);
    expect(updates).toEqual(['status = p_to_status, updated_at = clock_timestamp()']);
  });
  it('the SQL transition list equals the TypeScript lifecycle and the statuses match', () => {
    const body = /select \(p_from, p_to\) in \(([\s\S]*?)\);/.exec(fn('private', 'shop_order_transition_ok'))?.[1] ?? '';
    const sqlPairs = [...body.matchAll(/\('([a-z]+)', '([a-z]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const tsPairs = Object.entries(ORDER_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)).sort();
    expect(sqlPairs).toEqual(tsPairs);
    const list = /status\s+text not null default 'placed' check \(status in \(([^)]*)\)\)/.exec(code)?.[1] ?? '';
    expect([...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1])).toEqual(['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']);
  });
  it('the status RPC locks the order, writes the event and the audit row in the same transaction and audits a refused transition', () => {
    const b = fn('public', 'rpc_admin_order_set_status');
    expect(b).toMatch(/from public\.orders o where o\.id = p_order_id for update/);
    expect(b).toMatch(/insert into public\.order_events/);
    expect(b).toMatch(/'denied'[\s\S]*'invalid_transition'/);
  });
});

describe('M5: product, variant, assignment, rule and price changes cannot be seen half way by a checkout', () => {
  const co = fn('public', 'rpc_checkout');
  it('every privileged writer takes the pricing lock EXCLUSIVELY, after the gate and before any row work; the checkout takes it SHARED', () => {
    for (const n of PRICING_WRITERS) {
      const b = fn('public', n);
      const lock = b.indexOf("pg_advisory_xact_lock(hashtextextended('shop:pricing', 0))");
      expect(lock, n).toBeGreaterThan(-1);
      expect(lock, n).toBeGreaterThan(b.indexOf('private.staff_gate('));
      expect(b.slice(lock).search(/\bupdate public\.|\binsert into public\.|\bdelete from public\.|for update/), n).toBeGreaterThan(0);
    }
    expect(co).toMatch(/pg_advisory_xact_lock_shared\(hashtextextended\('shop:pricing', 0\)\)/);
    expect(co.indexOf("pg_advisory_xact_lock_shared(hashtextextended('shop:pricing', 0))")).toBeLessThan(co.indexOf('for update;'));
  });
  it('no other function takes the pricing lock exclusively, and no staff RPC takes a cart row lock (no lock cycle)', () => {
    const holders = [...code.matchAll(/create function public\.([a-z_]+)\([\s\S]*?\n\$\$;/g)].filter((m) => /pg_advisory_xact_lock\(hashtextextended\('shop:pricing'/.test(m[0])).map((m) => m[1]).sort();
    expect(holders).toEqual([...PRICING_WRITERS].sort());
    for (const n of Object.keys(STAFF_RPCS)) expect(fn('public', n), n).not.toMatch(/public\.carts/);
  });
  it('the checkout prices every line in ONE statement into v_lines and never reads a price again: the total, the order items and the audit all come from v_lines', () => {
    expect(co.match(/shop_price_breakdown\(/g)).toHaveLength(1);
    expect(co).toMatch(/into v_lines, v_bad/);
    expect(co).toMatch(/from jsonb_array_elements\(v_lines\) e/);
    const items = /insert into public\.order_items[\s\S]*?from jsonb_array_elements\(v_lines\) e;/.exec(co)?.[0] ?? '';
    expect(items.length).toBeGreaterThan(0);
    expect(items).not.toMatch(/public\.product_variants|shop_price_breakdown/);
  });
  it('availability, status, assignment and rules are evaluated in that same statement', () => {
    expect(co).toMatch(/pr\.status = 'active' and v\.status = 'active' and op\.available is true/);
    expect(co).toMatch(/left join public\.organization_products op on op\.organization_id = p_organization_id and op\.product_id = pr\.id/);
    expect(co).toMatch(/if jsonb_array_length\(v_bad\) > 0 then\s+return jsonb_build_object\('ok', false, 'code', 'cart_not_purchasable'/);
  });
});

describe('L1: checkout idempotency', () => {
  const co = fn('public', 'rpc_checkout');
  it('the signature takes an idempotency key; the order stores it under a unique (organization, user, key) constraint and it is immutable', () => {
    expect(/create function public\.rpc_checkout\(([^)]*)\)/.exec(code)?.[1]).toBe('p_organization_id uuid, p_ship_to jsonb, p_notes text, p_idempotency_key uuid');
    expect(code).toMatch(/idempotency_key uuid not null,/);
    expect(code).toMatch(/orders_idempotency_key unique \(organization_id, placed_by, idempotency_key\)/);
    expect(fn('private', 'guard_shop_orders')).toContain('old.idempotency_key');
  });
  it('a repeated key returns the SAME order (before the empty-cart test, so it also works after the cart was emptied) and the unique violation is handled as a replay', () => {
    const replay = co.indexOf('o.idempotency_key = p_idempotency_key');
    const empty = co.indexOf("'cart_empty'");
    expect(replay).toBeGreaterThan(-1);
    expect(replay).toBeLessThan(empty);
    expect(co).toMatch(/'replay', true/);
    expect(co).toMatch(/exception when unique_violation then/);
    // revision 2: the validator's answer can never be NULL, and the caller rejects anything that is not TRUE (a missing required key used to yield NULL and was accepted)
    expect(co).toMatch(/if p_idempotency_key is null or private\.shop_ship_to_ok\(p_ship_to\) is not true or /);
    expect(co).not.toMatch(/not private\.shop_ship_to_ok/);
    expect(fn('private', 'shop_ship_to_ok')).toMatch(/return coalesce\([\s\S]*?,\s*false\);/);
  });
  it('the replay happens after the cart row lock (a concurrent double submit is serialized) and writes no second audit row, order or item', () => {
    const lock = co.indexOf('c.user_id = v_actor for update');
    const replay = co.indexOf('o.idempotency_key = p_idempotency_key');
    expect(lock).toBeLessThan(replay);
    expect(co.match(/private\.write_audit\(/g)).toHaveLength(1);
    expect(co.match(/insert into public\.orders/g)).toHaveLength(1);
  });
});

describe('L2: order totals are validated with a clear error', () => {
  it('a total above the limit returns order_too_large before any write; the constraint stays as the backstop', () => {
    const co = fn('public', 'rpc_checkout');
    const check = co.indexOf('v_subtotal > 1000000000000');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(co.indexOf('insert into public.orders'));
    expect(co).toMatch(/'order_too_large'/);
    expect(code).toMatch(/subtotal_cents\s+bigint not null check \(subtotal_cents between 0 and 1000000000000\)/);
  });
});

describe('M2: cart edits are not audited; checkout and privileged actions are', () => {
  it('cart RPCs write no audit row; the checkout writes exactly one; every staff mutation writes one', () => {
    for (const n of ['rpc_cart_put_item', 'rpc_cart_empty', 'rpc_cart_get', 'rpc_catalog_list']) expect(fn('public', n), n).not.toMatch(/write_audit/);
    expect(code).not.toMatch(/cart\.item\.put/);
    expect(fn('public', 'rpc_checkout')).toMatch(/'order\.place'/);
  });
});

describe('M3: membership changes', () => {
  const m = fn('public', 'rpc_admin_org_member_add');
  it('rejects deleted and banned accounts and unconfirmed emails', () => {
    expect(m).toMatch(/u\.email_confirmed_at is not null and u\.deleted_at is null and \(u\.banned_until is null or u\.banned_until <= now\(\)\)/);
  });
  it('never silently demotes an owner; an unchanged membership is not re-written or audited', () => {
    expect(m).toMatch(/v_old_status = 'active' and v_old_role = 'owner' and p_role = 'member' then\s+return jsonb_build_object\('ok', false, 'code', 'owner_downgrade_not_allowed'\)/);
    expect(m).toMatch(/v_old_status = 'active' and v_old_role = p_role then\s+return jsonb_build_object\('ok', true, 'code', 'already_member'\)/);
    expect(m).not.toMatch(/on conflict/);
  });
  it('locks the membership row, keeps the 0001/0002 guards authoritative (staff, last owner) and maps their refusals to a safe code', () => {
    expect(m).toMatch(/where m\.organization_id = p_organization_id and m\.user_id = v_user for update/);
    expect(m.match(/exception when sqlstate '23514' then\s+return jsonb_build_object\('ok', false, 'code', 'member_not_allowed'\)/g)).toHaveLength(2);
  });
  it('the audit row states exactly what changed: added, reactivated or role_changed with the old and new role and status', () => {
    expect(m).toMatch(/v_change := case when v_old_status = 'removed' then 'reactivated' else 'role_changed' end/);
    expect(m).toMatch(/v_change := 'added'/);
    expect(m).toMatch(/jsonb_build_object\('change', v_change, 'old_role', v_old_role, 'old_status', v_old_status, 'new_role', p_role, 'new_status', 'active'\)/);
    expect(m).toMatch(/'staff\.org\.member\.add', 'success'/);
  });
});

describe('L4 and L5: index and seed', () => {
  it('L4: carts are indexed by user for the auth.users cascade', () => {
    expect(code).toMatch(/create index carts_user_idx on public\.carts \(user_id\)/);
  });
  const seed = join(root, 'supabase', 'review', 'p3', 'seed-products.sql');
  const s = existsSync(seed) ? readFileSync(seed, 'utf8') : '';
  const sc = s.replace(/--[^\n]*/g, '');
  it('the seed seeds NO prices, never deletes or archives, never updates variants and refreshes only seed-managed content', () => {
    expect(s).toMatch(/153 products, 221 variants/);
    expect(sc).not.toMatch(/base_price_cents|min_price_cents|status|delete|truncate|drop/i);
    expect(sc).toMatch(/on conflict \(slug\) do update\s+set name = excluded\.name, category = excluded\.category, cas = excluded\.cas, description = excluded\.description\s+where public\.products\.content_managed_by = 'seed';/);
    expect(sc).toMatch(/on conflict \(sku\) do nothing;/);
    expect(code).toMatch(/content_managed_by text not null default 'seed' check \(content_managed_by in \('seed', 'admin'\)\)/);
  });
  it('M4: no marketing or health-related wording survives in a seeded description', () => {
    const descriptions = [...sc.matchAll(/^\('[^']*', '(?:[^']|'')*', '[^']*', (?:'[^']*'|null), ('(?:[^']|'')*'|null)\)[,;]?$/gm)].map((m) => m[1] as string);
    expect(descriptions.length).toBe(153);
    const banned = /anti-?aging|\baging\b|\bbuy\b|\bonline\b|\bwholesale\b|purity|guarantee|treat|cure|clinical|patient|prescription|inject|weight|muscle|growth|repair|recover|heal|longevity|wellness|\bhealth|cardio|%|hplc|tested|verified|manufactured|\busa\b/i;
    for (const d of descriptions) expect(d, d).not.toMatch(banned);
    expect(descriptions.filter((d) => d !== 'null').length).toBeGreaterThan(60);
    expect(sc).toMatch(/\('epithalon', 'Epithalon', '[^']*', '[^']*', null\)/);
  });
  it('the storefront shows no category label (several category names read as health claims)', () => {
    const shop = readFileSync(join(root, 'src', 'app', '(portal)', 'client', 'shop', 'page.tsx'), 'utf8');
    expect(shop).not.toMatch(/eyebrow=/);
  });
});

describe('roadmap and the frozen P10 backlog', () => {
  const doc = (n: string) => readFileSync(join(root, 'docs', n), 'utf8');
  it('the roadmap lists P1 to P10 with P3 completed, P4 in progress and P10 receiving the deferred security work', () => {
    const r = doc('ROADMAP.md');
    for (let i = 1; i <= 10; i++) expect(r).toMatch(new RegExp(`\\| P${i} \\|`));
    expect(r).toMatch(/\| P3 \|[^\n]*Completed/);
    expect(r).toMatch(/\| P4 \|[^\n]*In progress/);
    expect(r).toMatch(/\| P10 \|[^\n]*owner MFA\/recovery migration validation/);
  });
  it('the backlog freezes every deferred item', () => {
    const b = doc('P10-BACKLOG.md');
    for (const topic of [/rev7/i, /rev8/i, /parsing/i, /Disposable Supabase project/i, /Owner MFA and recovery workflow/i, /stranded-owner/i, /PostgREST transaction-end/i, /Recovery throttling/i, /production hardening/i]) expect(b).toMatch(topic);
    expect(b).toMatch(/FROZEN/);
  });
});
