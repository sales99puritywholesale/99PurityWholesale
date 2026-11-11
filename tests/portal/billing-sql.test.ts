import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAYMENT_TRANSITIONS, INVOICE_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS, termsDays, MAX_PENDING_PAYMENTS_PER_INVOICE } from '@/lib/portal/billing/invoices';
import { CAPABILITY_CODES, ROLE_CAPABILITIES } from '@/lib/portal/permissions/capabilities';

// These tests read the TEXT of the P4 migration DRAFT only (no database). The draft lives in supabase/review/p4/ and is NOT applied and NOT in supabase/migrations/.
// They check the baseline controls (tenant boundary, grants, gates, immutability, who may change money) and that the SQL and the TypeScript model agree.
const root = process.cwd();
const file = join(root, 'supabase', 'review', 'p4', '20261111000100_p4_invoices_payments_wallet.sql');
const sql = readFileSync(file, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = (schema: string, name: string) => new RegExp(`create (?:or replace )?function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(code)?.[0] ?? '';

const CUSTOMER_RPCS = ['rpc_billing_summary', 'rpc_invoices_list', 'rpc_invoice_get', 'rpc_payment_report', 'rpc_wallet_get'];
const STAFF_RPCS: Record<string, { cap: string; stepUp: boolean }> = {
  rpc_admin_invoices_list: { cap: 'org.billing.read', stepUp: false },
  rpc_admin_invoice_get: { cap: 'org.billing.read', stepUp: false },
  rpc_admin_payments_list: { cap: 'payments.reconcile', stepUp: false },
  rpc_admin_payment_confirm: { cap: 'payments.confirm', stepUp: true },
  rpc_admin_payment_reject: { cap: 'payments.reconcile', stepUp: false },
  rpc_admin_invoice_void: { cap: 'financial.write', stepUp: true },
  rpc_admin_wallet_adjust: { cap: 'financial.write', stepUp: true },
};
const TABLES = ['invoices', 'invoice_lines', 'payments', 'payment_events', 'platform_flags', 'wallet_entries'];

describe('P4 migration draft: placement and scope', () => {
  it('the promoted migration is a byte-identical copy of the reviewed draft and its hash is recorded in the change-control manifest', () => {
    const promoted = join(root, 'supabase', 'migrations', '20261111000100_p4_invoices_payments_wallet.sql');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(promoted).equals(readFileSync(file))).toBe(true);
    expect(readFileSync(promoted).includes(13)).toBe(false); // LF only
    const hash = createHash('sha256').update(readFileSync(promoted)).digest('hex');
    expect(readFileSync(join(root, 'supabase', 'migration-hashes.txt'), 'utf8')).toContain(`${hash}  20261111000100_p4_invoices_payments_wallet.sql`);
    // the header is part of the reviewed bytes and is deliberately not edited (editing it would change the pinned hash)
    expect(sql).toMatch(/P4 DRAFT\. NOT APPLIED\./);
  });
  it('uses only capabilities that already exist and that finance (and admin) hold: no catalog change', () => {
    for (const { cap } of Object.values(STAFF_RPCS)) expect(CAPABILITY_CODES as readonly string[]).toContain(cap);
    for (const cap of ['org.billing.read', 'payments.reconcile', 'payments.confirm', 'financial.write'] as const) {
      expect(ROLE_CAPABILITIES.finance).toContain(cap);
      expect(ROLE_CAPABILITIES.admin).toContain(cap);
      expect(ROLE_CAPABILITIES.operations).not.toContain(cap);
      expect(ROLE_CAPABILITIES.support).not.toContain(cap);
    }
    expect(code).not.toMatch(/insert into public\.(capabilities|role_capabilities)/);
  });
});

describe('P4 tables and privileges', () => {
  it('every table has RLS enabled, no policies and no API-role privileges', () => {
    for (const t of TABLES) expect(code).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on\s+(table\s+)?public\./i);
  });
  it('money is integer cents with bounds, never floating point', () => {
    expect(code).not.toMatch(/\b(numeric|decimal|real|double precision|float)\b/i);
    expect(code).toMatch(/total_cents\s+bigint not null check \(total_cents between 1 and 1000000000000\)/);
    expect(code).toMatch(/claimed_cents\s+bigint not null check \(claimed_cents between 1 and 1000000000000\)/);
  });
  it('invoice status is tied to the amounts by a check constraint and one invoice exists per order', () => {
    expect(code).toMatch(/order_id\s+uuid not null unique references public\.orders/);
    expect(code).toMatch(/invoices_status_matches_amounts/);
    for (const s of INVOICE_STATUSES) expect(code).toContain(`'${s}'`);
  });
  it('a payment must belong to an invoice of the same organization (composite foreign key)', () => {
    expect(code).toMatch(/foreign key \(invoice_id, organization_id\) references public\.invoices \(id, organization_id\)/);
  });
  it('payment statuses and methods in SQL equal the TypeScript model', () => {
    for (const s of PAYMENT_STATUSES) expect(code).toContain(`'${s}'`);
    for (const m of PAYMENT_METHODS) expect(code).toContain(`'${m}'`);
    const sqlMethods = /method\s+text not null check \(method in \(([^)]*)\)\)/.exec(code)?.[1]?.match(/'[a-z]+'/g)?.map((x) => x.slice(1, -1)) ?? [];
    expect(sqlMethods).toEqual([...PAYMENT_METHODS]);
  });
  it('ledgers and snapshots are append-only and cannot be truncated; invoices and payments cannot be deleted', () => {
    for (const t of ['invoice_lines', 'payment_events', 'wallet_entries']) expect(code).toMatch(new RegExp(`create trigger ${t}_append_only before update or delete on public\\.${t}`));
    for (const t of TABLES) expect(code).toMatch(new RegExp(`create trigger ${t}_no_truncate before truncate on public\\.${t}`));
    expect(fn('private', 'guard_pay_invoices')).toMatch(/invoices cannot be deleted/);
    expect(fn('private', 'guard_pay_payments')).toMatch(/payments cannot be deleted/);
  });
  it('REVOKEs all table, sequence and private-function privileges from every API role', () => {
    expect(code).toMatch(/revoke all on table public\.invoices, public\.invoice_lines, public\.payments, public\.payment_events, public\.platform_flags, public\.wallet_entries\s+from public, anon, authenticated, service_role/);
    expect(code).toMatch(/revoke all on sequence public\.invoice_number_seq from public, anon, authenticated, service_role/);
    const priv = [...code.matchAll(/create function (private\.[a-z_]+)\(/g)].map((m) => m[1]);
    expect(priv.length).toBeGreaterThanOrEqual(10);
    for (const f of priv) expect(code).toContain(`${f}(`);
    const revoked = /revoke all on function private\.pay_invoice_transition_ok[\s\S]*?from public, anon, authenticated, service_role;/.exec(code)?.[0] ?? '';
    for (const f of priv) expect(revoked).toContain(f + '(');
    expect(code).not.toMatch(/grant execute on function private\./);
  });
});

describe('P4 RPCs', () => {
  const all = [...CUSTOMER_RPCS, ...Object.keys(STAFF_RPCS)];
  it('every RPC is SECURITY DEFINER with an empty search_path and is granted to authenticated only', () => {
    for (const name of [...all, 'rpc_checkout']) {
      const body = fn('public', name);
      expect(body, name).not.toBe('');
      expect(body, name).toMatch(/security definer set search_path = ''/);
      expect(body, name).not.toMatch(/\bset local\b|\bset role\b/i);
    }
    const grant = /grant execute on function public\.rpc_billing_summary[\s\S]*?to authenticated;/.exec(code)?.[0] ?? '';
    for (const name of [...all, 'rpc_checkout']) expect(grant, name).toContain(`public.${name}(`);
    expect(code).not.toMatch(/grant execute[^;]*to (anon|public|service_role)/i);
  });
  it('every customer RPC checks authentication and the tenant boundary before reading anything', () => {
    for (const name of CUSTOMER_RPCS) {
      const body = fn('public', name);
      expect(body, name).toMatch(/authentication required/);
      expect(body, name).toMatch(/private\.my_org_ids\(\)/);
      expect(body, name).toMatch(/private\.shop_org_ok\(/);
    }
  });
  it('reporting a payment needs the owner role, is idempotent, bounded, and never touches the invoice', () => {
    const body = fn('public', 'rpc_payment_report');
    expect(body).toMatch(/private\.pay_org_owner_ok\(/);
    expect(body).toMatch(/owner_required/);
    expect(body).toMatch(/idempotency_key/);
    expect(body).toMatch(/exceeds_balance/);
    expect(body).toMatch(/invoice_not_payable/);
    expect(body).toMatch(new RegExp(`>= ${MAX_PENDING_PAYMENTS_PER_INVOICE}\\b`));
    expect(body).not.toMatch(/update public\.invoices/);
    expect(body).not.toMatch(/'confirmed'/);
  });
  it('every staff RPC calls staff_gate with the expected capability and step-up requirement, and returns a denial', () => {
    for (const [name, { cap, stepUp }] of Object.entries(STAFF_RPCS)) {
      const body = fn('public', name);
      expect(body, name).toContain(`private.staff_gate('${cap}'`);
      expect(body, name).toMatch(new RegExp(`staff_gate\\('${cap.replace('.', '\\.')}', '[a-z.]+', ${stepUp}, `));
      expect(body, name).toMatch(/if v_gate <> 'ok' then return jsonb_build_object\('ok', false, 'code', v_gate\)/);
      expect(body, name).not.toMatch(/\bauth\.uid\(\)\s*(=|is not null)\s*[^;]*private\.has_capability/);
    }
  });
  it('only the confirm RPC, the void RPC and the cancel trigger write invoice amounts or status', () => {
    const writers = [...code.matchAll(/create (?:or replace )?function ((?:public|private)\.[a-z_]+)\([\s\S]*?\n\$\$;/g)]
      .filter((m) => /update public\.invoices/.test(m[0]))
      .map((m) => m[1])
      .sort();
    expect(writers).toEqual(['private.pay_order_cancel_voids_invoice', 'public.rpc_admin_invoice_void', 'public.rpc_admin_payment_confirm']);
  });
  it('confirmation locks the invoice before the payment, caps the amount at the balance and recomputes paid from confirmed payments', () => {
    const body = fn('public', 'rpc_admin_payment_confirm');
    expect(body.indexOf('from public.invoices x where x.id = v_inv for update')).toBeGreaterThan(-1);
    expect(body.indexOf('from public.invoices x where x.id = v_inv for update')).toBeLessThan(body.indexOf('from public.payments p where p.id = p_payment_id for update'));
    expect(body).toMatch(/p_confirmed_cents > i\.total_cents - i\.paid_cents/);
    expect(body).toMatch(/sum\(p\.confirmed_cents\)[\s\S]*status = 'confirmed'/);
    expect(body).toMatch(/payment_already_reviewed/);
  });
  it('voiding is refused once anything is paid and audits the action', () => {
    const body = fn('public', 'rpc_admin_invoice_void');
    expect(body).toMatch(/i\.paid_cents > 0 or i\.status <> 'open'/);
    expect(body).toMatch(/has_payments/);
    expect(body).toMatch(/private\.write_audit\(/);
  });
  it('every state-changing staff RPC writes an audit event', () => {
    for (const name of ['rpc_admin_payment_confirm', 'rpc_admin_payment_reject', 'rpc_admin_invoice_void', 'rpc_admin_wallet_adjust']) expect(fn('public', name), name).toMatch(/private\.write_audit\(/);
    expect(fn('public', 'rpc_payment_report')).toMatch(/private\.write_audit\(/);
  });
});

describe('P4 checkout issues the invoice with the order', () => {
  const body = fn('public', 'rpc_checkout');
  it('creates the invoice inside the same function, after the order lines exist', () => {
    expect(body.indexOf('insert into public.order_items')).toBeGreaterThan(-1);
    expect(body.indexOf('private.pay_invoice_create(v_order)')).toBeGreaterThan(body.indexOf('insert into public.order_items'));
  });
  it('keeps the P3 safeguards (idempotency, pricing lock, tenant check, validated address)', () => {
    expect(body).toMatch(/pg_advisory_xact_lock_shared\(hashtextextended\('shop:pricing', 0\)\)/);
    expect(body).toMatch(/private\.shop_ship_to_ok\(p_ship_to\) is not true/);
    expect(body).toMatch(/idempotency_key = p_idempotency_key/);
    expect(body).toMatch(/private\.shop_org_ok\(p_organization_id\)/);
  });
  it('the invoice lines must add up to the order total or the transaction fails', () => {
    expect(fn('private', 'pay_invoice_create')).toMatch(/v_sum <> o\.total_cents/);
  });
  it('terms in SQL give the same days as the TypeScript model', () => {
    const f = fn('private', 'pay_invoice_create');
    expect(f).toMatch(/v_terms = 'prepay' then 0/);
    expect(f).toMatch(/\^net_\?\[0-9\]\{1,3\}\$/);
    expect(f).toMatch(/v_days > 365 then v_days := 30/);
    expect([termsDays('prepay'), termsDays('net30'), termsDays('net_15'), termsDays('net999'), termsDays('x')]).toEqual([0, 30, 15, 30, 30]);
  });
});

describe('P4 payment and invoice guards agree with the TypeScript model', () => {
  it('payment transitions: only reported can move, to exactly confirmed, rejected or duplicate', () => {
    const f = fn('private', 'pay_payment_transition_ok');
    const pairs = [...f.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const model = Object.entries(PAYMENT_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)).sort();
    expect(pairs).toEqual(model);
  });
  it('a reviewed payment is final and the customer claim is immutable', () => {
    const g = fn('private', 'guard_pay_payments');
    expect(g).toMatch(/a reviewed payment is final/);
    expect(g).toMatch(/new\.claimed_cents <> old\.claimed_cents/);
  });
  it('paid amount cannot decrease and paid or void invoices are final', () => {
    const g = fn('private', 'guard_pay_invoices');
    expect(g).toMatch(/new\.paid_cents < old\.paid_cents/);
    expect(g).toMatch(/a paid or void invoice is final/);
    expect(g).toMatch(/new\.total_cents <> old\.total_cents/);
  });
  it('cancelling an order voids only an unpaid (open) invoice', () => {
    const f = fn('private', 'pay_order_cancel_voids_invoice');
    expect(f).toMatch(/new\.status = 'cancelled' and old\.status <> 'cancelled'/);
    expect(f).toMatch(/status = 'open'/);
  });
});

describe('P4 wallet is locked until Gate G3', () => {
  it('the flag is pinned to false by a table constraint and starts disabled', () => {
    expect(code).toMatch(/constraint wallet_locked_until_gate_g3 check \(key <> 'wallet_enabled' or enabled = false\)/);
    expect(code).toMatch(/insert into public\.platform_flags \(key\) values \('wallet_enabled'\)/);
  });
  it('every wallet RPC refuses while the flag is off and no top-up path exists for customers', () => {
    for (const name of ['rpc_wallet_get', 'rpc_admin_wallet_adjust']) {
      const body = fn('public', name);
      expect(body, name).toMatch(/if not private\.pay_wallet_enabled\(\) then return jsonb_build_object\('ok', false, 'code', 'wallet_disabled'\)/);
    }
    expect(code).not.toMatch(/rpc_wallet_(topup|fund|deposit)/i);
    expect(code).not.toMatch(/insert into public\.wallet_entries[\s\S]{0,200}'topup'/);
  });
  it('the self-check proves the flag cannot be enabled', () => {
    expect(sql).toMatch(/self-check: the wallet flag could be enabled/);
  });
});
