import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_CODES, ROLE_CAPABILITIES } from '@/lib/portal/permissions/capabilities';
import { FEE_UNITS, SETTING_KEYS } from '@/lib/portal/admin-ops/model';

// These tests read the TEXT of the P8 migration DRAFT only (no database): supabase/review/p8/. They check tenant boundaries, capability and step-up gates, privacy rules for personal
// data, the append-only fee history and that the SQL and the TypeScript model agree.
const root = process.cwd();
const file = join(root, 'supabase', 'review', 'p8', '20261111000500_p8_admin_operations.sql');
const sql = readFileSync(file, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = (schema: string, name: string) => new RegExp(`create (?:or replace )?function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(code)?.[0] ?? '';

const CUSTOMER = ['rpc_payment_instructions', 'rpc_fee_schedule_current', 'rpc_org_members_list', 'rpc_profile_get', 'rpc_profile_update'];
const STAFF: Record<string, { cap: string; stepUp: boolean }> = {
  rpc_admin_dashboard: { cap: 'org.read', stepUp: false },
  rpc_admin_orgs_overview: { cap: 'org.read', stepUp: false },
  rpc_admin_org_detail: { cap: 'org.read', stepUp: false },
  rpc_admin_org_set_status: { cap: 'org.manage', stepUp: true },
  rpc_admin_org_set_terms: { cap: 'org.manage', stepUp: true },
  rpc_admin_member_set: { cap: 'members.manage', stepUp: true },
  rpc_admin_application_create: { cap: 'applications.review', stepUp: false },
  rpc_admin_applications_list: { cap: 'applications.read.basic', stepUp: false },
  rpc_admin_application_review: { cap: 'applications.review', stepUp: true },
  rpc_admin_customers_list: { cap: 'profiles.read.basic', stepUp: false },
  rpc_admin_audit_list: { cap: 'audit.read', stepUp: false },
  rpc_admin_settings_get: { cap: 'flags.read', stepUp: false },
  rpc_admin_setting_set: { cap: 'flags.write', stepUp: true },
  rpc_admin_fee_list: { cap: 'org.billing.read', stepUp: false },
  rpc_admin_fee_save: { cap: 'financial.write', stepUp: true },
  rpc_admin_fee_retire: { cap: 'financial.write', stepUp: true },
};
const TABLES = ['organization_applications', 'platform_settings', 'fee_schedules'];

describe('P8 migration draft: scope', () => {
  it('is a reviewed draft under supabase/review/p8 with a byte-identical promoted copy in supabase/migrations, and does not touch the P2 staff functions', () => {
    expect(sql).toMatch(/P8 DRAFT\. NOT APPLIED\./);
    expect(readFileSync(join(root, 'supabase', 'migrations', '20261111000500_p8_admin_operations.sql'))).toEqual(readFileSync(file)); // the promoted file is a byte-identical copy of this reviewed draft
    expect(readFileSync(join(root, 'supabase', 'migration-hashes.txt'), 'utf8')).toContain(`${createHash('sha256').update(readFileSync(file)).digest('hex')}  20261111000500_p8_admin_operations.sql`);
    expect(code).not.toMatch(/create (or replace )?function public\.rpc_staff_/);
    expect(code).not.toMatch(/to anon\b/);
  });
  it('uses only existing capabilities with the intended role split (no catalog change)', () => {
    for (const { cap } of Object.values(STAFF)) expect(CAPABILITY_CODES as readonly string[]).toContain(cap);
    for (const cap of ['org.manage', 'members.manage', 'applications.review', 'audit.read', 'flags.write'] as const) {
      expect(ROLE_CAPABILITIES.admin).toContain(cap);
      for (const role of ['finance', 'operations', 'support'] as const) expect(ROLE_CAPABILITIES[role], `${role} ${cap}`).not.toContain(cap);
    }
    expect(ROLE_CAPABILITIES.finance).toContain('financial.write');
    expect(ROLE_CAPABILITIES.finance).toContain('org.billing.read');
    expect(ROLE_CAPABILITIES.support).toContain('profiles.read.basic');
    expect(ROLE_CAPABILITIES.support).not.toContain('profiles.read.full');
    expect(ROLE_CAPABILITIES.support).toContain('applications.read.basic');
    expect(ROLE_CAPABILITIES.support).not.toContain('applications.read.full');
    expect(code).not.toMatch(/insert into public\.(capabilities|role_capabilities)/);
  });
});

describe('P8 tables and privileges', () => {
  it('every table has RLS enabled, no policy and no API-role privilege', () => {
    for (const t of TABLES) expect(code).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on\s+(table\s+)?public\./i);
    expect(code).toMatch(/revoke all on table public\.organization_applications, public\.platform_settings, public\.fee_schedules from public, anon, authenticated, service_role/);
  });
  it('fee history is append-only in spirit: rows are immutable except for closing, never deleted, one open row per code', () => {
    const g = fn('private', 'guard_adminops_fees');
    expect(g).toMatch(/fee schedule rows cannot be deleted/);
    expect(g).toMatch(/immutable except for closing them/);
    expect(g).toMatch(/a closed fee schedule row is final/);
    expect(code).toMatch(/create unique index fee_schedules_one_open_per_code on public\.fee_schedules \(code\) where effective_to is null/);
    expect(code).toMatch(/amount_cents\s+bigint not null check \(amount_cents between 0 and 100000000\)/);
    const units = /unit\s+text not null check \(unit in \(([^)]*)\)\)/.exec(code)?.[1]?.match(/'[a-z_]+'/g)?.map((x) => x.slice(1, -1)) ?? [];
    expect(units).toEqual([...FEE_UNITS]);
  });
  it('applications are final once reviewed and never deleted; settings keys are fixed and equal the model', () => {
    expect(fn('private', 'guard_adminops_applications')).toMatch(/a reviewed application is final/);
    expect(fn('private', 'guard_adminops_applications')).toMatch(/applications cannot be deleted/);
    const keys = /key\s+text primary key check \(key in \(([^)]*)\)\)/.exec(code)?.[1]?.match(/'[a-z_]+'/g)?.map((x) => x.slice(1, -1)) ?? [];
    expect(keys).toEqual([...SETTING_KEYS]);
    expect(code).toMatch(/applications_org_consistent check \(\(status = 'approved'\) = \(organization_id is not null\)\)/);
    expect(code).toMatch(/applications_reject_note check \(status <> 'rejected' or review_note is not null\)/);
  });
});

describe('P8 RPCs', () => {
  const all = [...CUSTOMER, ...Object.keys(STAFF)];
  it('every RPC is SECURITY DEFINER with an empty search_path and granted to authenticated only', () => {
    for (const name of all) {
      const b = fn('public', name);
      expect(b, name).not.toBe('');
      expect(b, name).toMatch(/security definer set search_path = ''/);
    }
    const grant = /grant execute on function public\.rpc_payment_instructions[\s\S]*?to authenticated;/.exec(code)?.[0] ?? '';
    for (const name of all) expect(grant, name).toContain(`public.${name}(`);
  });
  it('every staff RPC calls staff_gate with the expected capability and step-up and returns a denial', () => {
    for (const [name, { cap, stepUp }] of Object.entries(STAFF)) {
      const b = fn('public', name);
      expect(b, name).toMatch(new RegExp(`staff_gate\\('${cap.replace('.', '\\.')}', '[a-z.]+', ${stepUp}, `));
      expect(b, name).toMatch(/if v_gate <> 'ok' then return jsonb_build_object\('ok', false, 'code', v_gate\)/);
    }
  });
  it('every change that affects access or money needs a fresh step-up', () => {
    for (const name of ['rpc_admin_org_set_status', 'rpc_admin_org_set_terms', 'rpc_admin_member_set', 'rpc_admin_application_review', 'rpc_admin_setting_set', 'rpc_admin_fee_save', 'rpc_admin_fee_retire']) expect(STAFF[name]?.stepUp, name).toBe(true);
  });
  it('every state-changing RPC writes an audit event', () => {
    for (const name of ['rpc_profile_update', 'rpc_admin_org_set_status', 'rpc_admin_org_set_terms', 'rpc_admin_member_set', 'rpc_admin_application_create', 'rpc_admin_application_review', 'rpc_admin_setting_set', 'rpc_admin_fee_save', 'rpc_admin_fee_retire']) {
      expect(fn('public', name), name).toMatch(/private\.write_audit\(/);
    }
  });
  it('customer RPCs need an active membership; member e-mail addresses are shown only to owners; the profile RPCs only ever touch the caller', () => {
    for (const name of ['rpc_payment_instructions', 'rpc_fee_schedule_current']) {
      const b = fn('public', name);
      expect(b, name).toMatch(/private\.my_org_ids\(\) o\(id\) join public\.organizations g on g\.id = o\.id where g\.status = 'active'/);
      expect(b, name).toMatch(/authentication required/);
    }
    const m = fn('public', 'rpc_org_members_list');
    expect(m).toMatch(/private\.my_org_ids\(\)/);
    expect(m).toMatch(/private\.shop_org_ok\(p_organization_id\) is not true/);
    expect(m).toMatch(/case when v_owner then u\.email else null end/);
    const pu = fn('public', 'rpc_profile_update');
    expect(pu).toMatch(/values \(v_actor, v_name, v_phone\) on conflict \(user_id\) do update/);
    expect(pu).not.toMatch(/p_user_id|p_target/);
    expect(fn('public', 'rpc_profile_get')).toMatch(/where u\.id = v_actor/);
  });
  it('the dashboard computes money only for staff who may read billing, and applications only for those who may read them', () => {
    const b = fn('public', 'rpc_admin_dashboard');
    expect(b).toMatch(/v_fin\s+boolean := private\.has_capability\('org\.billing\.read'\)/);
    expect(b).toMatch(/if v_fin then\s+v_fin_json :=/);
    expect(b.indexOf('invoiced_30d_cents')).toBeGreaterThan(b.indexOf('if v_fin then'));
    expect(b).toMatch(/'finance', v_fin_json/);
    expect(b).toMatch(/case when v_app then \(select count\(\*\)::int from public\.organization_applications/);
    expect(b).toMatch(/not o\.is_sandbox/);
    expect(fn('public', 'rpc_admin_orgs_overview')).toMatch(/case when v_fin then/);
  });
  it('personal data is gated by capability and audited: customer list, organization detail, application contacts', () => {
    const c = fn('public', 'rpc_admin_customers_list');
    expect(c).toMatch(/private\.write_audit\(v_actor, 'staff', 'staff\.profiles\.read'/);
    expect(c).toMatch(/case when v_full then c\.phone else null end/);
    expect(c).toMatch(/position\(v_q in lower\(u\.email\)\)/);
    expect(c).not.toMatch(/\blike\b|\bilike\b|~\*/);
    const d = fn('public', 'rpc_admin_org_detail');
    expect(d).toMatch(/case when v_pii then u\.email else null end/);
    expect(d).toMatch(/if v_pii then perform private\.write_audit\(/);
    const a = fn('public', 'rpc_admin_applications_list');
    expect(a).toMatch(/case when v_full then a\.contact_email else null end/);
    expect(a).toMatch(/applications\.read\.full/);
  });
  it('closing an organization is refused while money or fulfillment is open, and every status change records a reason', () => {
    const b = fn('public', 'rpc_admin_org_set_status');
    expect(b).toMatch(/p_status not in \('active', 'suspended', 'closed'\)/);
    expect(b).toMatch(/has_open_items/);
    expect(b).toMatch(/i\.status in \('open', 'partially_paid'\)/);
    expect(b).toMatch(/fo\.status not in \('delivered', 'cancelled'\)/);
    expect(b).toMatch(/v_reason is null/);
    expect(b).toMatch(/'reason', v_reason/);
  });
  it('payment terms follow the invoice rules (prepay or net days up to 365)', () => {
    const b = fn('public', 'rpc_admin_org_set_terms');
    expect(b).toMatch(/p_terms !~ '\^\(prepay\|net_\?\[0-9\]\{1,3\}\)\$'/);
    expect(b).toMatch(/::int > 365/);
  });
  it('member changes cannot remove the last owner (the P1 trigger answers and is reported as last_owner_protected)', () => {
    const b = fn('public', 'rpc_admin_member_set');
    expect(b).toMatch(/exception when sqlstate '23514' then\s+return jsonb_build_object\('ok', false, 'code', 'last_owner_protected'\)/);
    expect(b).toMatch(/for update/);
    expect(b).toMatch(/p_action not in \('remove', 'set_role'\)/);
  });
  it('approving an application creates the organization on prepay terms, reports a taken code, and adds an owner only for a confirmed, non-banned account', () => {
    const b = fn('public', 'rpc_admin_application_review');
    expect(b).toMatch(/insert into public\.organizations \(name, code, payment_terms\) values \(left\(v_co, 200\), p_org_code, 'prepay'\)/);
    expect(b).toMatch(/exception when unique_violation then\s+return jsonb_build_object\('ok', false, 'code', 'code_taken'\)/);
    expect(b).toMatch(/u\.email_confirmed_at is not null and u\.deleted_at is null and \(u\.banned_until is null or u\.banned_until <= now\(\)\)/);
    expect(b).toMatch(/p_org_code !~ '\^\[A-Z0-9\]\[A-Z0-9-\]\{2,19\}\$'/);
    expect(b).toMatch(/v_status <> 'new'/);
    expect(b).toMatch(/for update/);
  });
  it('a fee change closes the open row the day before and refuses an earlier or equal start date', () => {
    const b = fn('public', 'rpc_admin_fee_save');
    expect(b).toMatch(/where x\.code = p_code and x\.effective_to is null for update/);
    expect(b).toMatch(/p_effective_from <= v_open\.effective_from then return jsonb_build_object\('ok', false, 'code', 'effective_date_invalid'\)/);
    expect(b).toMatch(/set effective_to = p_effective_from - 1/);
    expect(b).toMatch(/p_amount_cents not between 0 and 100000000/);
    expect(fn('public', 'rpc_admin_fee_retire')).toMatch(/p_effective_to < v_from/);
  });
  it('the audit viewer filters by a plain prefix, never a pattern, and is read only', () => {
    const b = fn('public', 'rpc_admin_audit_list');
    expect(b).toMatch(/v_prefix !~ '\^\[a-z\._\]\+\$'/);
    expect(b).toMatch(/left\(x\.action, char_length\(v_prefix\)\) = v_prefix/);
    expect(b).not.toMatch(/\blike\b|\bilike\b|insert into|update public|delete from/i);
  });
  it('settings can only change the two known keys', () => {
    const b = fn('public', 'rpc_admin_setting_set');
    expect(b).toMatch(/p_key not in \('payment_instructions', 'invoice_footer'\)/);
    expect(b).toMatch(/update public\.platform_settings set value = v_value/);
    expect(fn('public', 'rpc_admin_settings_get')).not.toMatch(/key_hash|signing_key/);
  });
});
