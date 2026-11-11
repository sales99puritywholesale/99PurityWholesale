import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_CODES, ROLE_CAPABILITIES } from '@/lib/portal/permissions/capabilities';
import { GATE_CODES, STEP_DEFS, STEP_GATES } from '@/lib/portal/onboarding/steps';

// These tests read the TEXT of the P5 migration DRAFT only (no database): supabase/review/p5/. They check the baseline controls (tenant boundary, grants, gates,
// immutability, who may decide what) and that the SQL and the TypeScript model agree.
const root = process.cwd();
const file = join(root, 'supabase', 'review', 'p5', '20261111000200_p5_fulfillment_onboarding.sql');
const sql = readFileSync(file, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = (schema: string, name: string) => new RegExp(`create (?:or replace )?function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(code)?.[0] ?? '';

const CUSTOMER_RPCS = ['rpc_onboarding_get', 'rpc_document_register', 'rpc_sku_mapping_save', 'rpc_sku_mapping_delete', 'rpc_label_design_add', 'rpc_packaging_select', 'rpc_store_connection_save', 'rpc_agreement_accept', 'rpc_onboarding_step_submit'];
const STAFF_RPCS: Record<string, { cap: string; stepUp: boolean }> = {
  rpc_admin_onboarding_list: { cap: 'onboarding.review', stepUp: false },
  rpc_admin_onboarding_get: { cap: 'onboarding.review', stepUp: false },
  rpc_admin_document_register: { cap: 'onboarding.review', stepUp: false },
  rpc_admin_agreement_offer: { cap: 'onboarding.review', stepUp: false },
  rpc_admin_mapping_review: { cap: 'onboarding.review', stepUp: false },
  rpc_admin_label_review: { cap: 'onboarding.review', stepUp: false },
  rpc_admin_step_review: { cap: 'onboarding.review', stepUp: false },
  rpc_admin_setup_invoices_create: { cap: 'financial.write', stepUp: true },
  rpc_admin_funding_set: { cap: 'financial.write', stepUp: true },
  rpc_admin_gates_list: { cap: 'gates.read', stepUp: false },
  rpc_admin_gate_record: { cap: 'gates.write', stepUp: true },
  rpc_admin_go_live: { cap: 'onboarding.golive', stepUp: true },
};
const TABLES = ['documents', 'onboarding_step_defs', 'onboarding_instances', 'onboarding_steps', 'onboarding_submissions', 'onboarding_events', 'sku_mappings', 'label_designs', 'packaging_options', 'packaging_selections', 'store_connections', 'onboarding_agreements', 'funding_requirements', 'compliance_gates'];

describe('P5 migration draft: scope', () => {
  it('is a reviewed draft under supabase/review/p5 with a byte-identical promoted copy in supabase/migrations', () => {
    expect(sql).toMatch(/P5 DRAFT\. NOT APPLIED\./);
    expect(readFileSync(join(root, 'supabase', 'migrations', '20261111000200_p5_fulfillment_onboarding.sql'))).toEqual(readFileSync(file)); // the promoted file is a byte-identical copy of this reviewed draft
    expect(readFileSync(join(root, 'supabase', 'migration-hashes.txt'), 'utf8')).toContain(`${createHash('sha256').update(readFileSync(file)).digest('hex')}  20261111000200_p5_fulfillment_onboarding.sql`);
  });
  it('uses only capabilities that already exist, with the intended role split (no catalog change)', () => {
    for (const { cap } of Object.values(STAFF_RPCS)) expect(CAPABILITY_CODES as readonly string[]).toContain(cap);
    expect(ROLE_CAPABILITIES.operations).toContain('onboarding.review');
    expect(ROLE_CAPABILITIES.finance).not.toContain('onboarding.review');
    expect(ROLE_CAPABILITIES.admin).toContain('onboarding.golive');
    expect(ROLE_CAPABILITIES.operations).not.toContain('onboarding.golive');
    expect(ROLE_CAPABILITIES.finance).not.toContain('gates.write');
    expect(ROLE_CAPABILITIES.admin).toContain('gates.write');
    expect(code).not.toMatch(/insert into public\.(capabilities|role_capabilities)/);
  });
});

describe('P5 tables and privileges', () => {
  it('every table has RLS enabled, no table policy and no API-role privilege', () => {
    for (const t of TABLES) expect(code).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    expect(code).not.toMatch(/create policy \w+ on public\./i);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on\s+(table\s+)?public\./i);
    expect(code).toMatch(/revoke all on table public\.documents,[\s\S]*?from public, anon, authenticated, service_role/);
  });
  it('step definitions in SQL equal the TypeScript model (numbers, keys, owners, prerequisites)', () => {
    const rows = [...code.matchAll(/\((\d), '([a-z_]+)', '([^']+)', '(customer|staff)', '\{([\d,]*)\}'\)/g)].map((m) => ({ no: Number(m[1]), key: m[2], title: m[3], owner: m[4], dependsOn: m[5] ? m[5].split(',').map(Number) : [] }));
    expect(rows).toEqual(STEP_DEFS.map((d) => ({ no: d.no, key: d.key, title: d.title, owner: d.owner, dependsOn: [...d.dependsOn] })));
  });
  it('the six gates are seeded as not recorded and match the model; the SQL gate rules match STEP_GATES', () => {
    for (const g of GATE_CODES) expect(code).toContain(`('${g}')`);
    expect(fn('public', 'rpc_admin_label_review')).toMatch(/ob_gates_missing\(array\['G2'\]\)/);
    expect(fn('public', 'rpc_admin_step_review')).toMatch(/ob_gates_missing\(array\['G2'\]\)/);
    expect(STEP_GATES[2]).toEqual(['G2']);
    expect(fn('public', 'rpc_admin_go_live')).toMatch(/ob_gates_missing\(array\['G1', 'G2', 'G4', 'G5', 'G6'\]\)/);
    expect(STEP_GATES[9]).toEqual(['G1', 'G2', 'G4', 'G5', 'G6']);
  });
  it('ledgers are append-only, approved items and steps are final, and nothing can be truncated', () => {
    for (const t of ['documents', 'onboarding_submissions', 'onboarding_events', 'onboarding_step_defs']) expect(code).toMatch(new RegExp(`create trigger ${t}_append_only before update or delete on public\\.${t}`));
    for (const t of ['documents', 'onboarding_steps', 'onboarding_submissions', 'onboarding_events', 'sku_mappings', 'label_designs']) expect(code).toMatch(new RegExp(`create trigger ${t}_no_truncate before truncate on public\\.${t}`));
    expect(fn('private', 'guard_ob_steps')).toMatch(/an approved step is final/);
    expect(fn('private', 'guard_ob_items')).toMatch(/an approved item is final/);
    expect(fn('private', 'guard_ob_steps')).toMatch(/onboarding steps cannot be deleted/);
  });
  it('the funding requirement is never met by a customer claim: it needs a paid invoice, approved credit terms or a staff waiver', () => {
    const f = fn('private', 'ob_funding_met');
    expect(f).toMatch(/fr\.status = 'waived'/);
    expect(f).toMatch(/fr\.type = 'credit_terms' and fr\.status = 'met'/);
    expect(f).toMatch(/i\.status = 'paid'/);
    for (const name of CUSTOMER_RPCS) expect(fn('public', name)).not.toMatch(/insert into public\.funding_requirements|update public\.funding_requirements/);
  });
  it('money is integer cents', () => {
    expect(code).not.toMatch(/\b(numeric|decimal|real|double precision|float)\b/i);
  });
});

describe('P5 RPCs', () => {
  const all = [...CUSTOMER_RPCS, ...Object.keys(STAFF_RPCS)];
  it('every RPC is SECURITY DEFINER with an empty search_path and granted to authenticated only', () => {
    for (const name of all) {
      const body = fn('public', name);
      expect(body, name).not.toBe('');
      expect(body, name).toMatch(/security definer set search_path = ''/);
      expect(body, name).not.toMatch(/\bset local\b|\bset role\b/i);
    }
    const grant = /grant execute on function public\.rpc_onboarding_get[\s\S]*?to authenticated;/.exec(code)?.[0] ?? '';
    for (const name of all) expect(grant, name).toContain(`public.${name}(`);
    expect(code).not.toMatch(/grant execute[^;]*to (anon|public|service_role)/i);
  });
  it('every customer write checks authentication and the owner gate (tenant boundary) before touching data', () => {
    for (const name of CUSTOMER_RPCS.filter((n) => n !== 'rpc_onboarding_get')) {
      const body = fn('public', name);
      expect(body, name).toMatch(/authentication required/);
      expect(body, name).toMatch(/private\.ob_owner_gate\(p_organization_id\)/);
    }
    const g = fn('private', 'ob_owner_gate');
    expect(g).toMatch(/private\.my_org_ids\(\)/);
    expect(g).toMatch(/private\.shop_org_ok\(p_org\)/);
    expect(g).toMatch(/private\.pay_org_owner_ok\(p_org\)/);
    expect(fn('public', 'rpc_onboarding_get')).toMatch(/private\.my_org_ids\(\)/);
  });
  it('every staff RPC calls staff_gate with the expected capability and step-up requirement and returns a denial', () => {
    for (const [name, { cap, stepUp }] of Object.entries(STAFF_RPCS)) {
      const body = fn('public', name);
      expect(body, name).toMatch(new RegExp(`staff_gate\\('${cap.replace('.', '\\.')}', '[a-z.]+', ${stepUp}, `));
      expect(body, name).toMatch(/if v_gate <> 'ok' then return jsonb_build_object\('ok', false, 'code', v_gate\)/);
    }
  });
  it('every state-changing RPC writes an audit event', () => {
    const writers = all.filter((n) => !['rpc_onboarding_get', 'rpc_admin_onboarding_list', 'rpc_admin_onboarding_get', 'rpc_admin_gates_list'].includes(n));
    for (const name of writers) expect(fn('public', name), name).toMatch(/private\.write_audit\(/);
  });
  it('a customer can only submit steps 1 to 5, 7 and 8; the database re-checks the lock, the status and the preconditions', () => {
    const b = fn('public', 'rpc_onboarding_step_submit');
    expect(b).toMatch(/p_step_no not in \(1, 2, 3, 4, 5, 7, 8\)/);
    expect(b).toMatch(/v_status not in \('todo', 'in_progress', 'rejected'\)/);
    expect(b).toMatch(/private\.ob_deps_ok\(v_inst, p_step_no\)/);
    expect(b).toMatch(/private\.ob_step_ready\(/);
    expect(b).toMatch(/for update/);
    expect(b).not.toMatch(/'approved'/);
  });
  it('only staff decide steps: step review needs the step rules, bounded to steps 1 to 8, and refuses a self-review', () => {
    const b = fn('public', 'rpc_admin_step_review');
    expect(b).toMatch(/p_step_no not between 1 and 8/);
    expect(b).toMatch(/same_person/);
    expect(b).toMatch(/agreement_not_signed/);
    expect(b).toMatch(/setup_unpaid/);
    expect(b).toMatch(/funding_unmet/);
    expect(b).toMatch(/gate_required/);
    expect(b).toMatch(/step_locked/);
    for (const name of CUSTOMER_RPCS) expect(fn('public', name)).not.toMatch(/status = 'approved'/);
  });
  it('go-live needs steps 1 to 8 approved and the gates, and is admin-only with a fresh step-up', () => {
    const b = fn('public', 'rpc_admin_go_live');
    expect(b).toMatch(/private\.ob_deps_ok\(v_inst, 9\)/);
    expect(b).toMatch(/not_all_approved/);
    expect(b).toMatch(/already_live/);
    expect(b).toMatch(/for update/);
  });
  it('uploads are verified against the REAL stored object, not caller-claimed size or type', () => {
    for (const name of ['rpc_document_register', 'rpc_admin_document_register']) {
      const b = fn('public', name);
      expect(b, name).toMatch(/from storage\.objects o where o\.bucket_id = 'portal-documents'/);
      expect(b, name).toMatch(/o\.metadata ->> 'mimetype'/);
      expect(b, name).toMatch(/o\.metadata ->> 'size'/);
      expect(b, name).not.toMatch(/p_size|p_content_type/);
    }
    expect(fn('public', 'rpc_document_register')).toMatch(/p_kind not in \('label_artwork', 'agreement_signed', 'payment_proof', 'other'\)/);
    expect(fn('public', 'rpc_admin_document_register')).toMatch(/p_kind not in \('agreement', 'certificate', 'gate_evidence', 'other'\)/);
  });
  it('setup invoices are created once per organization, with a fresh step-up, through the fee helper', () => {
    const b = fn('public', 'rpc_admin_setup_invoices_create');
    expect(b).toMatch(/invoice_exists/);
    expect(b).toMatch(/private\.ob_fee_invoice_create\(/);
    expect(fn('private', 'ob_fee_invoice_create')).toMatch(/p_kind not in \('setup', 'funding'\)/);
  });
  it('the test-order check is a stub that returns false until the integration platform replaces it', () => {
    expect(fn('private', 'ob_test_order_ok')).toMatch(/select false;/);
  });
});

describe('P5 storage and invoice changes', () => {
  it('the bucket is private with a 10 MB limit and the three allowed types', () => {
    expect(code).toMatch(/values \('portal-documents', 'portal-documents', false, 10485760, array\['application\/pdf', 'image\/png', 'image\/jpeg'\]\)/);
  });
  it('storage policies use only helpers the API roles may execute and keep the organization prefix rule', () => {
    const pol = [...code.matchAll(/create policy (portal_documents_[a-z_]+) on storage\.objects[\s\S]*?;\n/g)].map((m) => m[0]);
    expect(pol.length).toBe(4);
    for (const p of pol) {
      const used = [...p.matchAll(/private\.([a-z_]+)\(/g)].map((m) => m[1]);
      for (const u of used) expect(['my_org_ids', 'my_owner_org_ids', 'staff_session_ok', 'has_capability']).toContain(u);
      expect(p).toMatch(/bucket_id = 'portal-documents'/);
      expect(p).not.toMatch(/\bfor (update|delete|all)\b/);
    }
    expect(pol.filter((p) => /for insert/.test(p)).length).toBe(2);
    expect(pol.find((p) => /owner_insert/.test(p))).toMatch(/my_owner_org_ids\(\)/);
    expect(pol.find((p) => /member_select/.test(p))).toMatch(/my_org_ids\(\)/);
  });
  it('invoices may exist without an order only for the setup and funding kinds, and the guard protects the kind', () => {
    expect(code).toMatch(/alter table public\.invoices alter column order_id drop not null/);
    expect(code).toMatch(/invoices_kind_matches_order check \(\(kind = 'order'\) = \(order_id is not null\)\)/);
    const g = fn('private', 'guard_pay_invoices');
    expect(g).toMatch(/new\.order_id is distinct from old\.order_id/);
    expect(g).toMatch(/new\.kind <> old\.kind/);
  });
  it('the four invoice read RPCs use a left join to orders and return the kind', () => {
    for (const name of ['rpc_invoices_list', 'rpc_invoice_get', 'rpc_admin_invoices_list', 'rpc_admin_invoice_get']) {
      const b = fn('public', name);
      expect(b, name).toMatch(/left join public\.orders/);
      expect(b, name).toMatch(/'kind', i\.kind/);
    }
  });
});
