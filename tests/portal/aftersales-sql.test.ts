import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_CODES, ROLE_CAPABILITIES } from '@/lib/portal/permissions/capabilities';

// These tests read the TEXT of the P9 migration DRAFT only (no database): supabase/review/p9/. They check tenant boundaries, capability and step-up gates, the append-only money
// ledger, payout safety, privacy of referred organizations, notification recipients and the report rules. PostgreSQL has not parsed this file.
const root = process.cwd();
const file = join(root, 'supabase', 'review', 'p9', '20261111000600_p9_aftersales.sql');
const sql = readFileSync(file, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = (schema: string, name: string) => new RegExp(`create (?:or replace )?function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(code)?.[0] ?? '';

const CUSTOMER = ['rpc_certificates_list', 'rpc_commissions_get', 'rpc_notification_prefs_get', 'rpc_notification_pref_set'];
const STAFF: Record<string, { cap: string; stepUp: boolean }> = {
  rpc_admin_certificates_list: { cap: 'documents.read', stepUp: false },
  rpc_admin_certificate_targets: { cap: 'inventory.adjust', stepUp: false },
  rpc_admin_certificate_publish: { cap: 'inventory.adjust', stepUp: false },
  rpc_admin_certificate_withdraw: { cap: 'inventory.adjust', stepUp: true },
  rpc_admin_commission_overview: { cap: 'org.billing.read', stepUp: false },
  rpc_admin_commission_plan_save: { cap: 'financial.write', stepUp: true },
  rpc_admin_commission_plan_set_active: { cap: 'financial.write', stepUp: true },
  rpc_admin_referral_code_enroll: { cap: 'financial.write', stepUp: true },
  rpc_admin_referral_link: { cap: 'financial.write', stepUp: true },
  rpc_admin_referral_end: { cap: 'financial.write', stepUp: true },
  rpc_admin_commissions_accrue: { cap: 'financial.write', stepUp: false },
  rpc_admin_commission_payout: { cap: 'financial.write', stepUp: true },
  rpc_admin_commission_adjust: { cap: 'financial.write', stepUp: true },
  rpc_admin_templates_list: { cap: 'flags.read', stepUp: false },
  rpc_admin_template_save: { cap: 'flags.write', stepUp: true },
  rpc_admin_notifications_scan: { cap: 'financial.write', stepUp: false },
  rpc_admin_outbox_list: { cap: 'profiles.read.basic', stepUp: false },
  rpc_admin_outbox_claim: { cap: 'org.manage', stepUp: false },
  rpc_admin_outbox_record: { cap: 'org.manage', stepUp: false },
};
const TABLES = ['certificates', 'commission_plans', 'referral_codes', 'organization_referrals', 'commission_payouts', 'commission_entries', 'notification_templates', 'notification_preferences', 'email_outbox'];

describe('P9 migration draft: scope', () => {
  it('is a reviewed draft under supabase/review/p9 with a byte-identical promoted copy in supabase/migrations, and adds no anon-callable function', () => {
    expect(sql).toMatch(/P9 DRAFT\. NOT APPLIED\./);
    expect(readFileSync(join(root, 'supabase', 'migrations', '20261111000600_p9_aftersales.sql'))).toEqual(readFileSync(file)); // the promoted file is a byte-identical copy of this reviewed draft
    expect(readFileSync(join(root, 'supabase', 'migration-hashes.txt'), 'utf8')).toContain(`${createHash('sha256').update(readFileSync(file)).digest('hex')}  20261111000600_p9_aftersales.sql`);
    expect(code).not.toMatch(/to anon\b/);
    expect(code).not.toMatch(/grant execute[^;]*to (public|anon|service_role)/i);
    expect(code).toMatch(/self-check: the anon-executable set changed/);
  });
  it('uses only existing capabilities with the intended role split (no catalog change)', () => {
    for (const { cap } of Object.values(STAFF)) expect(CAPABILITY_CODES as readonly string[]).toContain(cap);
    expect(code).not.toMatch(/insert into public\.(capabilities|role_capabilities)/);
    for (const role of ['finance', 'admin'] as const) expect(ROLE_CAPABILITIES[role]).toContain('financial.write');
    for (const role of ['operations', 'support'] as const) expect(ROLE_CAPABILITIES[role]).not.toContain('financial.write'); // money changes are finance or admin only
    for (const role of ['operations', 'admin'] as const) expect(ROLE_CAPABILITIES[role]).toContain('inventory.adjust'); // certificates: operations or admin
    for (const role of ['finance', 'support'] as const) expect(ROLE_CAPABILITIES[role]).not.toContain('inventory.adjust');
    for (const role of ['finance', 'operations', 'support'] as const) expect(ROLE_CAPABILITIES[role]).not.toContain('org.manage'); // dispatching e-mail: admin only
    expect(ROLE_CAPABILITIES.support).toContain('profiles.read.basic');
    expect(ROLE_CAPABILITIES.operations).not.toContain('org.billing.read'); // sales, receivables and commission reports are finance or admin only
  });
});

describe('P9 tables and privileges', () => {
  it('every table has RLS enabled, no API-role privilege, and the only policy is the certificate upload policy on storage', () => {
    for (const t of TABLES) expect(code).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    const policies = [...code.matchAll(/create policy (\w+) on ([a-z.]+)/gi)].map((m) => `${m[1]} on ${m[2]}`);
    expect(policies).toEqual(['portal_documents_cert_insert on storage.objects']);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on\s+(table\s+)?public\./i);
    for (const t of TABLES) expect(/revoke all on table public\.certificates[\s\S]*?service_role;/.exec(code)?.[0] ?? '', t).toContain(`public.${t}`);
  });
  it('the certificate upload policy needs a verified staff session with inventory.adjust, the private bucket and a strict path', () => {
    const p = /create policy portal_documents_cert_insert[\s\S]*?;/.exec(code)?.[0] ?? '';
    expect(p).toMatch(/bucket_id = 'portal-documents'/);
    expect(p).toMatch(/private\.staff_session_ok\(\)/);
    expect(p).toMatch(/private\.has_capability\('inventory\.adjust'\)/);
    expect(p).toMatch(/\^\[0-9a-f\]\{8\}-.*\\\.\(pdf\|png\|jpg\|jpeg\)\$/);
  });
  it('lots and fulfillment orders get composite keys, so a certificate cannot point at another organization\'s lot or order', () => {
    expect(code).toMatch(/alter table public\.inventory_lots add constraint inventory_lots_id_org_key unique \(id, organization_id\)/);
    expect(code).toMatch(/alter table public\.fulfillment_orders add constraint fulfillment_orders_id_org_key unique \(id, organization_id\)/);
    expect(code).toMatch(/certificates_lot_fk foreign key \(lot_id, organization_id\) references public\.inventory_lots \(id, organization_id\)/);
    expect(code).toMatch(/certificates_order_fk foreign key \(fulfillment_order_id, organization_id\) references public\.fulfillment_orders \(id, organization_id\)/);
    expect(code).toMatch(/certificates_document_fk foreign key \(document_id, organization_id\) references public\.documents \(id, organization_id\)/);
    expect(code).toMatch(/certificates_target check \(lot_id is not null or fulfillment_order_id is not null\)/);
  });
  it('the money ledger and payouts are append-only; plans, codes, links and certificates change only in the one allowed way', () => {
    expect(fn('private', 'guard_p9_append_only')).toMatch(/% is append-only/);
    expect(code).toMatch(/create trigger commission_entries_append_only before update or delete on public\.commission_entries/);
    expect(code).toMatch(/create trigger commission_payouts_append_only before update or delete on public\.commission_payouts/);
    expect(fn('private', 'guard_p9_plans')).toMatch(/immutable except for its active flag/);
    expect(fn('private', 'guard_p9_codes')).toMatch(/new\.code <> old\.code/);
    expect(fn('private', 'guard_p9_referrals')).toMatch(/a referral link can only be ended/);
    expect(fn('private', 'guard_p9_referrals')).toMatch(/an ended referral link is final/);
    expect(fn('private', 'guard_p9_certificates')).toMatch(/a withdrawn certificate is final/);
    expect(fn('private', 'guard_p9_certificates')).toMatch(/immutable except for withdrawing it/);
    expect(fn('private', 'guard_p9_outbox')).toMatch(/a finished outbox message is final/);
    expect(fn('private', 'guard_p9_outbox')).toMatch(/new\.subject <> old\.subject or new\.body <> old\.body/);
    for (const t of TABLES) expect(code, t).toMatch(new RegExp(`create trigger ${t}_no_truncate before truncate on public\\.${t}`));
  });
  it('the ledger has the right shape: one accrual per invoice, one entry per payout, signs by type, a reason for adjustments', () => {
    expect(code).toMatch(/create unique index commission_entries_one_accrual_per_invoice on public\.commission_entries \(invoice_id\) where entry_type = 'accrual'/);
    expect(code).toMatch(/create unique index commission_entries_one_entry_per_payout on public\.commission_entries \(payout_id\) where entry_type = 'payout'/);
    expect(code).toMatch(/commission_entries_accrual_shape check \(entry_type <> 'accrual' or \(amount_cents > 0 and invoice_id is not null/);
    expect(code).toMatch(/commission_entries_payout_shape check \(entry_type <> 'payout' or \(amount_cents < 0 and payout_id is not null/);
    expect(code).toMatch(/commission_entries_adjustment_shape check \(entry_type <> 'adjustment' or \(reason is not null[^;]*idempotency_key is not null\)\)/);
    expect(code).toMatch(/referrals_not_self check \(referrer_org_id <> referred_org_id\)/);
    expect(code).toMatch(/referred_org_id\s+uuid not null unique references public\.organizations/);
    expect(code).toMatch(/referral_codes[\s\S]*organization_id uuid not null unique references/);
  });
});

describe('P9 RPCs', () => {
  const all = [...CUSTOMER, ...Object.keys(STAFF), 'rpc_admin_certificate_publish', 'rpc_admin_commissions_accrue', 'rpc_admin_report'];
  const unique = [...new Set(all)];
  it('every RPC is SECURITY DEFINER with an empty search_path and granted to authenticated only (24 in all)', () => {
    expect(unique.length).toBe(24); // 4 customer RPCs + 19 staff RPCs + the report RPC (the same number the migration's self-check asserts)
    for (const name of unique) {
      const b = fn('public', name);
      expect(b, name).not.toBe('');
      expect(b, name).toMatch(/security definer set search_path = ''/);
    }
    const grant = /grant execute on function public\.rpc_certificates_list[\s\S]*?to authenticated;/.exec(code)?.[0] ?? '';
    for (const name of unique) expect(grant, name).toContain(`public.${name}(`);
    const created = [...code.matchAll(/create function public\.(rpc_\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual([...unique].sort());
  });
  it('every staff RPC calls staff_gate with the expected capability and step-up and returns a denial', () => {
    for (const [name, { cap, stepUp }] of Object.entries(STAFF)) {
      const b = fn('public', name);
      expect(b, name).toMatch(new RegExp(`staff_gate\\('${cap.replace('.', '\\.')}', '[a-z._]+', ${stepUp}, `));
      expect(b, name).toMatch(/if v_gate <> 'ok' then return jsonb_build_object\('ok', false, 'code', v_gate\)/);
    }
  });
  it('every change to money, referral links, published documents or templates needs a fresh step-up', () => {
    for (const name of ['rpc_admin_certificate_withdraw', 'rpc_admin_commission_plan_save', 'rpc_admin_commission_plan_set_active', 'rpc_admin_referral_code_enroll', 'rpc_admin_referral_link', 'rpc_admin_referral_end',
      'rpc_admin_commission_payout', 'rpc_admin_commission_adjust', 'rpc_admin_template_save']) expect(STAFF[name]?.stepUp, name).toBe(true);
  });
  it('every state-changing or personal-data RPC writes an audit event', () => {
    for (const name of ['rpc_notification_pref_set', 'rpc_admin_certificate_publish', 'rpc_admin_certificate_withdraw', 'rpc_admin_commission_plan_save', 'rpc_admin_commission_plan_set_active', 'rpc_admin_referral_code_enroll',
      'rpc_admin_referral_link', 'rpc_admin_referral_end', 'rpc_admin_commissions_accrue', 'rpc_admin_commission_payout', 'rpc_admin_commission_adjust', 'rpc_admin_template_save', 'rpc_admin_notifications_scan',
      'rpc_admin_outbox_list', 'rpc_admin_outbox_claim', 'rpc_admin_report']) {
      expect(fn('public', name), name).toMatch(/private\.write_audit\(/);
    }
  });
  it('customer RPCs need an active membership of an active organization; commissions are owner-only', () => {
    for (const name of ['rpc_certificates_list', 'rpc_commissions_get']) {
      const b = fn('public', name);
      expect(b, name).toMatch(/p_organization_id in \(select private\.my_org_ids\(\)\)/);
      expect(b, name).toMatch(/private\.shop_org_ok\(p_organization_id\) is not true/);
      expect(b, name).toMatch(/authentication required/);
    }
    expect(fn('public', 'rpc_commissions_get')).toMatch(/private\.pay_org_owner_ok\(p_organization_id\) is not true then return jsonb_build_object\('ok', false, 'code', 'owner_required'\)/);
    for (const name of ['rpc_notification_prefs_get', 'rpc_notification_pref_set']) expect(fn('public', name), name).toMatch(/v_actor uuid := \(select auth\.uid\(\)\)/);
  });
  it('a customer sees withdrawn certificates as withdrawn but never gets their file path', () => {
    expect(fn('public', 'rpc_certificates_list')).toMatch(/case when x\.status = 'published' then x\.storage_path else null end/);
  });
  it('the customer commission statement never exposes referred organizations: no organization table, no names, only numbered labels', () => {
    const b = fn('public', 'rpc_commissions_get');
    expect(b).not.toMatch(/public\.organizations|g\.name|\.name\b.*organization/);
    expect(b).toMatch(/'Referral ' \|\| x\.n/);
    expect(b).not.toMatch(/invoice_number|order_number|i\.id|'invoice_id'|'referred_org_id'/);
    expect(b).toMatch(/where z\.referrer_org_id = p_organization_id/);
  });
});

describe('P9 certificates', () => {
  it('publishing reads the real uploaded object back, checks that the lot and order belong to the organization, and refuses a repeat', () => {
    const b = fn('public', 'rpc_admin_certificate_publish');
    expect(b).toMatch(/from storage\.objects o where o\.bucket_id = 'portal-documents' and o\.name like p_organization_id::text \|\| '\/' \|\| p_document_id::text \|\| '\.%'/);
    expect(b).toMatch(/v_type not in \('application\/pdf', 'image\/png', 'image\/jpeg'\)/);
    expect(b).toMatch(/v_size > 10485760/);
    expect(b).toMatch(/lo\.id = p_lot_id and lo\.organization_id = p_organization_id/);
    expect(b).toMatch(/o\.id = p_order_id and o\.organization_id = p_organization_id/);
    expect(b).toMatch(/already_published/);
    expect(b).toMatch(/'certificate', v_name, v_type, v_size, v_path, v_actor, 'staff'/);
    expect(b).toMatch(/d\.kind = 'certificate'/);
    expect(b).toMatch(/private\.notif_enqueue\('certificate_available'/);
    expect(b).not.toMatch(/p_content_type|p_size/);
  });
  it('withdrawing locks the row, needs a reason and cannot be repeated', () => {
    const b = fn('public', 'rpc_admin_certificate_withdraw');
    expect(b).toMatch(/for update/);
    expect(b).toMatch(/char_length\(v_reason\) not between 1 and 300/);
    expect(b).toMatch(/already_withdrawn/);
  });
});

describe('P9 commissions', () => {
  it('accrues only on PAID order invoices of referred organizations with an active link and code, from wholesale lines, once per invoice', () => {
    const b = fn('public', 'rpc_admin_commissions_accrue');
    expect(b).toMatch(/i\.status = 'paid' and i\.kind = 'order'/);
    expect(b).toMatch(/l\.line_type = 'wholesale'/);
    expect(b).toMatch(/r\.status = 'active'/);
    expect(b).toMatch(/c\.active/);
    expect(b).toMatch(/not exists \(select 1 from public\.commission_entries e where e\.invoice_id = i\.id and e\.entry_type = 'accrual'\)/);
    expect(b).toMatch(/on conflict \(invoice_id\) where entry_type = 'accrual' do nothing/);
    expect(b).toMatch(/q\.base_cents > 0 and q\.paid_at is not null/);
    expect(b).toMatch(/>= q\.started_on/);
    expect(b).toMatch(/max\(pm\.reviewed_at\) from public\.payments pm where pm\.invoice_id = i\.id and pm\.status = 'confirmed'/);
    expect(b).toMatch(/limit 500/);
  });
  it('the balance excludes accruals still in the hold and counts payouts and adjustments', () => {
    const b = fn('private', 'comm_balance');
    expect(b).toMatch(/entry_type = 'accrual' and e\.available_at > clock_timestamp\(\)/);
    expect(b).toMatch(/\(e\.entry_type = 'accrual' and e\.available_at <= clock_timestamp\(\)\) or e\.entry_type in \('adjustment', 'payout'\)/);
    expect(b).toMatch(/sum\(-e\.amount_cents\) filter \(where e\.entry_type = 'payout'\)/);
  });
  it('a payout cannot exceed the available balance: the referrer row is locked, the key is idempotent, the ledger entry is negative', () => {
    const b = fn('public', 'rpc_admin_commission_payout');
    expect(b.indexOf('for update')).toBeGreaterThan(-1);
    expect(b.indexOf('for update')).toBeLessThan(b.indexOf('comm_balance'));
    expect(b).toMatch(/p_amount_cents > v_avail then return jsonb_build_object\('ok', false, 'code', 'insufficient_commission'\)/);
    expect(b).toMatch(/where y\.idempotency_key = p_idempotency_key/);
    expect(b).toMatch(/idempotency_conflict/);
    expect(b).toMatch(/'payout', -p_amount_cents, v_id/);
    expect(b).toMatch(/p_paid_on > current_date \+ 1/);
    expect(b).toMatch(/not_enrolled/);
  });
  it('adjustments are idempotent, need a reason, and lock the same row', () => {
    const b = fn('public', 'rpc_admin_commission_adjust');
    expect(b).toMatch(/for update/);
    expect(b).toMatch(/p_amount_cents = 0/);
    expect(b).toMatch(/char_length\(v_reason\) not between 1 and 300/);
    expect(b).toMatch(/idempotency_conflict/);
  });
  it('referral links: staff only, real active code, no self referral, one referrer per organization', () => {
    const b = fn('public', 'rpc_admin_referral_link');
    expect(b).toMatch(/self_referral/);
    expect(b).toMatch(/already_referred/);
    expect(b).toMatch(/referral_code_not_found/);
    expect(b).toMatch(/v_code !~ '\^\[A-Z0-9\]\{6,12\}\$'/);
    const e = fn('public', 'rpc_admin_referral_code_enroll');
    expect(e).toMatch(/already_enrolled/);
    expect(e).toMatch(/p\.id = p_plan_id and p\.active/);
  });
});

describe('P9 notifications', () => {
  it('messages go to active OWNERS only; billing ignores preferences, the other categories respect them; repeats are impossible', () => {
    const b = fn('private', 'notif_enqueue');
    expect(b).toMatch(/m\.role = 'owner' and m\.status = 'active'/);
    expect(b).toMatch(/v_t\.category = 'billing' or not exists \(select 1 from public\.notification_preferences np/);
    expect(b).toMatch(/np\.enabled = false/);
    expect(b).toMatch(/on conflict \(dedupe_key\) do nothing/);
    expect(b).toMatch(/security definer set search_path = ''/);
    expect(code).toMatch(/dedupe_key\s+text not null unique/);
    expect(code).toMatch(/revoke all on function [^;]*private\.notif_enqueue\(text, uuid, jsonb, text\)[^;]*from public, anon, authenticated, service_role/);
  });
  it('preferences exist for the optional categories only', () => {
    expect(code).toMatch(/category\s+text not null check \(category in \('fulfillment', 'certificates', 'commissions'\)\),\s+enabled/);
    expect(fn('public', 'rpc_notification_pref_set')).toMatch(/p_category not in \('fulfillment', 'certificates', 'commissions'\)/);
    expect(fn('public', 'rpc_notification_prefs_get')).toMatch(/np\.user_id = v_actor/);
  });
  it('rendered text is plain: values lose line breaks and are cut to 200 characters', () => {
    const b = fn('private', 'notif_render');
    expect(b).toMatch(/left\(regexp_replace\(coalesce\(p_vars ->> k, ''\), '\[\\r\\n\\t\]\+', ' ', 'g'\), 200\)/);
  });
  it('the scan only looks at the last 14 days and the outbox is claimed with skip locked, reclaiming after 10 minutes', () => {
    const s = fn('public', 'rpc_admin_notifications_scan');
    expect((s.match(/interval '14 days'/g) ?? []).length).toBe(3);
    expect(s).toMatch(/not o\.is_sandbox/);
    expect(s).toMatch(/'inv:' \|\| r\.id::text/);
    expect(s).toMatch(/'pay:' \|\| r\.id::text/);
    expect(s).toMatch(/'ship:' \|\| r\.id::text/);
    const c = fn('public', 'rpc_admin_outbox_claim');
    expect(c).toMatch(/for update skip locked/);
    expect(c).toMatch(/o\.claimed_at < clock_timestamp\(\) - interval '10 minutes'/);
    expect(c).toMatch(/least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
  });
  it('recording a result needs a claimed message and keeps error text short', () => {
    const b = fn('public', 'rpc_admin_outbox_record');
    expect(b).toMatch(/v_row\.status <> 'sending' then return jsonb_build_object\('ok', false, 'code', 'not_claimed'\)/);
    expect(b).toMatch(/left\(nullif\(btrim\(coalesce\(p_error, ''\)\), ''\), 200\)/);
  });
  it('reading the outbox (it shows recipient addresses) is audited; template changes are validated against the allowed placeholders', () => {
    expect(fn('public', 'rpc_admin_outbox_list')).toMatch(/'staff\.outbox\.read'/);
    const t = fn('public', 'rpc_admin_template_save');
    expect(t).toMatch(/not \(v_ph = any \(private\.notif_vars\(p_key\)\)\) then return jsonb_build_object\('ok', false, 'code', 'template_variable_unknown'\)/);
    expect(t).toMatch(/v_subject ~ '\[\\r\\n\]'/);
  });
});

describe('P9 reports', () => {
  const b = fn('public', 'rpc_admin_report');
  it('validates the report name and period BEFORE anything is read, and picks the capability by report', () => {
    expect(b).toMatch(/p_report not in \('sales', 'receivables', 'inventory', 'commissions'\)/);
    expect(b.indexOf("p_report not in ('sales'")).toBeLessThan(b.indexOf('staff_gate'));
    expect(b).toMatch(/v_cap := case p_report when 'inventory' then 'org\.read' else 'org\.billing\.read' end/);
    expect(b).toMatch(/staff_gate\(v_cap, 'staff\.report\.run', false, 'report', p_report\)/);
    expect(b).toMatch(/v_from < date '2020-01-01' or v_to > current_date \+ 1/);
  });
  it('caps the rows, says when it did, and audits every run', () => {
    expect(b).toMatch(/'truncated', v_trunc/);
    expect(b).toMatch(/write_audit\(v_actor, 'staff', 'staff\.report\.run', 'success', null, 'report', p_report/);
  });
  it('sales exclude cancelled orders from the total; only approved products appear in the inventory report', () => {
    expect(b).toMatch(/o\.status <> 'cancelled'/);
    expect(b).toMatch(/m\.status = 'approved'/);
  });
});
