import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_CODES, ROLE_CAPABILITIES } from '@/lib/portal/permissions/capabilities';
import { MOVEMENT_TYPES } from '@/lib/portal/inventory/fulfillment';

// These tests read the TEXT of the P7 migration DRAFT only (no database): supabase/review/p7/. They check the baseline controls (tenant boundary, grants, gates, the single ledger
// writer, allocation rules, immutability) and that the SQL and the TypeScript model agree.
const root = process.cwd();
const file = join(root, 'supabase', 'review', 'p7', '20261111000400_p7_inventory_warehouse.sql');
const sql = readFileSync(file, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = (schema: string, name: string) => new RegExp(`create (?:or replace )?function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(code)?.[0] ?? '';

const CUSTOMER = ['rpc_stock_list', 'rpc_inbound_list', 'rpc_inbound_create', 'rpc_inbound_cancel', 'rpc_fulfillment_orders_list', 'rpc_fulfillment_order_get', 'rpc_fulfillment_order_cancel'];
const STAFF: Record<string, { cap: string; stepUp: boolean }> = {
  rpc_admin_inventory_overview: { cap: 'org.read', stepUp: false },
  rpc_admin_warehouse_save: { cap: 'org.manage', stepUp: false },
  rpc_admin_location_save: { cap: 'org.manage', stepUp: false },
  rpc_admin_stock_list: { cap: 'org.read', stepUp: false },
  rpc_admin_movements_list: { cap: 'org.read', stepUp: false },
  rpc_admin_receipts_list: { cap: 'org.read', stepUp: false },
  rpc_admin_receipt_get: { cap: 'org.read', stepUp: false },
  rpc_admin_receipt_receive: { cap: 'inventory.adjust', stepUp: false },
  rpc_admin_stock_adjust: { cap: 'inventory.adjust', stepUp: true },
  rpc_admin_fo_list: { cap: 'org.read', stepUp: false },
  rpc_admin_fo_get: { cap: 'org.read', stepUp: false },
  rpc_admin_fo_transition: { cap: 'fulfillment.process', stepUp: false },
  rpc_admin_exception_resolve: { cap: 'fulfillment.process', stepUp: false },
};
const TABLES = ['warehouses', 'warehouse_locations', 'inventory_lots', 'inventory_balances', 'inventory_movements', 'inbound_receipts', 'inbound_receipt_lines', 'inventory_reservations', 'shipments', 'fulfillment_order_events', 'fulfillment_exceptions'];
const functionsWriting = (re: RegExp) => [...code.matchAll(/create (?:or replace )?function ((?:public|private)\.[a-z_]+)\([\s\S]*?\n\$\$;/g)].filter((m) => re.test(m[0])).map((m) => m[1]).sort();

describe('P7 migration draft: scope', () => {
  it('is a reviewed draft under supabase/review/p7 with a byte-identical promoted copy in supabase/migrations', () => {
    expect(sql).toMatch(/P7 DRAFT\. NOT APPLIED\./);
    expect(readFileSync(join(root, 'supabase', 'migrations', '20261111000400_p7_inventory_warehouse.sql'))).toEqual(readFileSync(file)); // the promoted file is a byte-identical copy of this reviewed draft
    expect(readFileSync(join(root, 'supabase', 'migration-hashes.txt'), 'utf8')).toContain(`${createHash('sha256').update(readFileSync(file)).digest('hex')}  20261111000400_p7_inventory_warehouse.sql`);
  });
  it('uses only existing capabilities with the intended role split (no catalog change)', () => {
    for (const { cap } of Object.values(STAFF)) expect(CAPABILITY_CODES as readonly string[]).toContain(cap);
    for (const cap of ['inventory.adjust', 'fulfillment.process'] as const) {
      expect(ROLE_CAPABILITIES.operations).toContain(cap);
      expect(ROLE_CAPABILITIES.admin).toContain(cap);
      expect(ROLE_CAPABILITIES.finance).not.toContain(cap);
      expect(ROLE_CAPABILITIES.support).not.toContain(cap);
    }
    expect(ROLE_CAPABILITIES.operations).not.toContain('org.manage');
    expect(code).not.toMatch(/insert into public\.(capabilities|role_capabilities)/);
  });
  it('adds no grant to anon and does not redefine the lifecycle graph of P6', () => {
    expect(code).not.toMatch(/to anon\b/);
    expect(code).not.toMatch(/create (or replace )?function private\.fo_transition_ok/);
    expect(sql).toMatch(/the anon-executable set changed/);
  });
});

describe('P7 tables and privileges', () => {
  it('every table has RLS enabled, no policy and no API-role privilege', () => {
    for (const t of TABLES) expect(code).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on\s+(table\s+)?public\./i);
    expect(code).toMatch(/revoke all on table public\.warehouses,[\s\S]*?from public, anon, authenticated, service_role/);
  });
  it('stock is whole units (integers), never money or fractions', () => {
    expect(code).not.toMatch(/\b(numeric|decimal|real|double precision|float)\b|_cents/i);
  });
  it('balances cannot go negative or be over-reserved, and each movement type equals the model', () => {
    expect(code).toMatch(/on_hand\s+integer not null default 0 check \(on_hand >= 0\)/);
    expect(code).toMatch(/reserved\s+integer not null default 0 check \(reserved >= 0\)/);
    expect(code).toMatch(/inventory_balances_reserved_le_on_hand check \(reserved <= on_hand\)/);
    const types = /movement_type\s+text not null check \(movement_type in \(([^)]*)\)\)/.exec(code)?.[1]?.match(/'[a-z_]+'/g)?.map((x) => x.slice(1, -1)) ?? [];
    expect(types).toEqual([...MOVEMENT_TYPES]);
    expect(code).toMatch(/inventory_movements_adjust_reason check \(movement_type not in \('adjust_plus', 'adjust_minus'\) or reason is not null\)/);
    expect(code).toMatch(/idempotency_key uuid not null unique/);
  });
  it('the ledger, lots and order history are append-only and nothing important can be truncated', () => {
    for (const t of ['inventory_lots', 'inventory_movements', 'fulfillment_order_events']) expect(code).toMatch(new RegExp(`create trigger ${t}_append_only before update or delete on public\\.${t}`));
    for (const t of ['inventory_lots', 'inventory_balances', 'inventory_movements', 'inventory_reservations', 'shipments', 'fulfillment_order_events']) expect(code).toMatch(new RegExp(`create trigger ${t}_no_truncate before truncate on public\\.${t}`));
    expect(fn('private', 'guard_inv_reservations')).toMatch(/a closed reservation is final/);
    expect(fn('private', 'guard_inv_shipments')).toMatch(/shipment details are immutable/);
    expect(fn('private', 'guard_inv_receipts')).toMatch(/a finished receipt is final/);
  });
  it('private.inv_move is the ONLY function that writes balances, and only allocation/closing code writes reservations', () => {
    expect(functionsWriting(/(insert into|update) public\.inventory_balances/)).toEqual(['private.inv_move']);
    expect(functionsWriting(/insert into public\.inventory_reservations/)).toEqual(['private.fo_allocate']);
    expect(functionsWriting(/update public\.inventory_reservations/)).toEqual(['private.fo_close_reservations']);
    expect(functionsWriting(/insert into public\.inventory_movements/)).toEqual(['private.inv_move']);
    const m = fn('private', 'inv_move');
    for (const t of MOVEMENT_TYPES) expect(m, t).toContain(`'${t}'`);
    expect(m).toMatch(/unknown movement type/);
  });
  it('the reconciliation recomputes balances from the movements with the same signs as the model', () => {
    const r = fn('private', 'inv_reconcile');
    expect(r).toMatch(/m\.movement_type in \('receive', 'adjust_plus'\) then m\.qty else -m\.qty/);
    expect(r).toMatch(/m\.movement_type in \('receive', 'adjust_plus', 'adjust_minus', 'consume'\)/);
    expect(r).toMatch(/m\.movement_type = 'reserve' then m\.qty else -m\.qty/);
    expect(r).toMatch(/m\.movement_type in \('reserve', 'release', 'consume'\)/);
    expect(sql).toMatch(/if private\.inv_reconcile\(\) <> 0 then raise exception/);
  });
});

describe('P7 allocation (first expiry first, all or nothing)', () => {
  const a = fn('private', 'fo_allocate');
  it('locks the candidate balances in a fixed order before checking, and checks the whole order before reserving anything', () => {
    expect(a).toMatch(/order by bal\.sku_mapping_id, bal\.lot_id, bal\.location_id for update of bal/);
    expect(a.indexOf('for update of bal')).toBeLessThan(a.indexOf("return 'insufficient_stock'"));
    expect(a.indexOf("return 'insufficient_stock'")).toBeLessThan(a.indexOf('insert into public.inventory_reservations'));
    expect(a).toMatch(/sum\(l\.quantity\) as q/);
  });
  it('orders by earliest expiry (no expiry last), then oldest lot, then location, like the model', () => {
    expect(a).toMatch(/order by lo\.expires_on nulls last, lo\.created_at, bal\.location_id/);
  });
  it('never uses expired lots or quarantine and inactive locations, in allocation and in availability', () => {
    for (const body of [a, fn('private', 'inv_available')]) {
      expect(body).toMatch(/wl\.kind <> 'quarantine' and wl\.active/);
      expect(body).toMatch(/lo\.expires_on is null or lo\.expires_on >= current_date/);
    }
  });
  it('reserves through the single movement function', () => {
    expect(a).toMatch(/private\.inv_move\('reserve'/);
    expect(fn('private', 'fo_close_reservations')).toMatch(/case when p_consume then 'consume' else 'release' end/);
  });
});

describe('P7 RPCs', () => {
  const all = [...CUSTOMER, ...Object.keys(STAFF)];
  it('every RPC is SECURITY DEFINER with an empty search_path and granted to authenticated only', () => {
    for (const name of all) {
      const b = fn('public', name);
      expect(b, name).not.toBe('');
      expect(b, name).toMatch(/security definer set search_path = ''/);
    }
    const grant = /grant execute on function public\.rpc_stock_list[\s\S]*?to authenticated;/.exec(code)?.[0] ?? '';
    for (const name of all) expect(grant, name).toContain(`public.${name}(`);
  });
  it('customer reads use the tenant boundary and writes the owner gate', () => {
    for (const name of ['rpc_stock_list', 'rpc_inbound_list', 'rpc_fulfillment_orders_list', 'rpc_fulfillment_order_get']) {
      const b = fn('public', name);
      expect(b, name).toMatch(/private\.my_org_ids\(\)/);
      expect(b, name).toMatch(/private\.shop_org_ok\(p_organization_id\) is not true/);
    }
    for (const name of ['rpc_inbound_create', 'rpc_inbound_cancel', 'rpc_fulfillment_order_cancel']) expect(fn('public', name), name).toMatch(/private\.ob_owner_gate\(p_organization_id\)/);
    expect(fn('public', 'rpc_inbound_create')).toMatch(/m\.organization_id = p_organization_id and m\.status = 'approved'/);
    expect(fn('public', 'rpc_fulfillment_order_cancel')).toMatch(/v_status not in \('pending', 'queued'\)/);
  });
  it('every staff RPC calls staff_gate with the expected capability and step-up and returns a denial', () => {
    for (const [name, { cap, stepUp }] of Object.entries(STAFF)) {
      const b = fn('public', name);
      expect(b, name).toMatch(new RegExp(`staff_gate\\('${cap.replace('.', '\\.')}', '[a-z.]+', ${stepUp}, `));
      expect(b, name).toMatch(/if v_gate <> 'ok' then return jsonb_build_object\('ok', false, 'code', v_gate\)/);
    }
  });
  it('every state-changing RPC writes an audit event', () => {
    for (const name of ['rpc_inbound_create', 'rpc_inbound_cancel', 'rpc_fulfillment_order_cancel', 'rpc_admin_warehouse_save', 'rpc_admin_location_save', 'rpc_admin_receipt_receive', 'rpc_admin_stock_adjust', 'rpc_admin_fo_transition', 'rpc_admin_exception_resolve']) {
      expect(fn('public', name), name).toMatch(/private\.write_audit\(/);
    }
  });
  it('receiving locks the receipt, answers every line once, uses the receiving warehouse only, and posts receive movements', () => {
    const b = fn('public', 'rpc_admin_receipt_receive');
    expect(b).toMatch(/from public\.inbound_receipts r where r\.id = p_id for update/);
    expect(b).toMatch(/v_status <> 'expected'/);
    expect(b).toMatch(/jsonb_array_length\(p_lines\) <> \(select count\(\*\) from public\.inbound_receipt_lines/);
    expect(b).toMatch(/wl\.warehouse_id = v_wh and wl\.active/);
    expect(b).toMatch(/private\.inv_move\('receive'/);
  });
  it('a stock correction needs a fresh step-up, a reason and an idempotency key, and can never go below what is reserved', () => {
    const b = fn('public', 'rpc_admin_stock_adjust');
    expect(b).toMatch(/v_reason is null/);
    expect(b).toMatch(/p_idempotency_key is null/);
    expect(b).toMatch(/v_on - v_res < -p_delta/);
    expect(b).toMatch(/below_reserved/);
    expect(b).toMatch(/for update/);
    expect(b).toMatch(/'replay', true/);
  });
  it('the order lifecycle RPC refuses sandbox orders first, follows the P6 graph, and ships/cancels through the stock functions', () => {
    const b = fn('public', 'rpc_admin_fo_transition');
    expect(b.indexOf('sandbox_order')).toBeGreaterThan(-1);
    expect(b.indexOf('sandbox_order')).toBeLessThan(b.indexOf('private.fo_transition_ok'));
    expect(b).toMatch(/not private\.fo_transition_ok\(v_from, p_to_status\)/);
    expect(b).toMatch(/for update/);
    expect(b).toMatch(/p_to_status = 'queued' and not coalesce\(\(select i\.status = 'live'/);
    expect(b).toMatch(/private\.fo_allocate\(p_order_id, v_actor\)/);
    expect(b).toMatch(/insufficient_stock/);
    expect(b).toMatch(/private\.fo_close_reservations\(p_order_id, true, v_actor\)/);
    expect(b).toMatch(/private\.fo_close_reservations\(p_order_id, false, v_actor\)/);
    expect(b).toMatch(/v_carrier is null or v_track is null/);
    expect(b).toMatch(/insert into public\.shipments/);
    expect(b).toMatch(/private\.int_emit_event\(v_org, 'order\.status_changed'/);
    expect(b).toMatch(/insert into public\.fulfillment_order_events/);
  });
  it('a failed allocation opens (at most) one exception and changes nothing else', () => {
    expect(code).toMatch(/create unique index fulfillment_exceptions_open_key on public\.fulfillment_exceptions \(order_id, kind\) where status = 'open'/);
    expect(fn('public', 'rpc_admin_fo_transition')).toMatch(/on conflict \(order_id, kind\) where status = 'open' do nothing/);
  });
});
