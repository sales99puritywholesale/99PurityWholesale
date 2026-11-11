import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_CODES, ROLE_CAPABILITIES } from '@/lib/portal/permissions/capabilities';
import { BACKOFF_SECONDS, MAX_ACTIVE_KEYS, MAX_DELIVERY_ATTEMPTS, MAX_WEBHOOK_ENDPOINTS, WEBHOOK_EVENTS, isSafeWebhookUrl } from '@/lib/portal/integrations/keys';

// These tests read the TEXT of the P6 migration DRAFT only (no database): supabase/review/p6/. They check the anonymous-callable surface (exactly five functions, credential
// checked first), tenant isolation, grants, immutability and that the SQL agrees with the TypeScript model.
const root = process.cwd();
const file = join(root, 'supabase', 'review', 'p6', '20261111000300_p6_api_integrations.sql');
const sql = readFileSync(file, 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = (schema: string, name: string) => new RegExp(`create (?:or replace )?function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(code)?.[0] ?? '';

const ANON = ['rpc_api_order_create', 'rpc_api_order_get', 'rpc_api_orders_list', 'rpc_worker_claim_deliveries', 'rpc_worker_record_result'];
const CUSTOMER = ['rpc_api_keys_list', 'rpc_api_key_create', 'rpc_api_key_revoke', 'rpc_webhook_endpoints_list', 'rpc_webhook_endpoint_create', 'rpc_webhook_endpoint_set_active', 'rpc_webhook_endpoint_rotate', 'rpc_webhook_test', 'rpc_webhook_deliveries_list', 'rpc_integration_orders_list'];
const STAFF: Record<string, { cap: string; stepUp: boolean }> = {
  rpc_admin_api_keys_list: { cap: 'org.read', stepUp: false },
  rpc_admin_api_key_revoke: { cap: 'org.manage', stepUp: false },
  rpc_admin_deliveries_overview: { cap: 'org.read', stepUp: false },
  rpc_admin_worker_token_create: { cap: 'flags.write', stepUp: true },
};
const TABLES = ['api_keys', 'idempotency_records', 'fulfillment_orders', 'fulfillment_order_lines', 'webhook_endpoints', 'webhook_deliveries', 'integration_worker_tokens'];

describe('P6 migration draft: scope', () => {
  it('is a reviewed draft under supabase/review/p6 with a byte-identical promoted copy in supabase/migrations', () => {
    expect(sql).toMatch(/P6 DRAFT\. NOT APPLIED\./);
    expect(readFileSync(join(root, 'supabase', 'migrations', '20261111000300_p6_api_integrations.sql'))).toEqual(readFileSync(file)); // the promoted file is a byte-identical copy of this reviewed draft
    expect(readFileSync(join(root, 'supabase', 'migration-hashes.txt'), 'utf8')).toContain(`${createHash('sha256').update(readFileSync(file)).digest('hex')}  20261111000300_p6_api_integrations.sql`);
  });
  it('uses only existing capabilities with the intended role split', () => {
    for (const { cap } of Object.values(STAFF)) expect(CAPABILITY_CODES as readonly string[]).toContain(cap);
    expect(ROLE_CAPABILITIES.admin).toContain('flags.write');
    expect(ROLE_CAPABILITIES.finance).not.toContain('flags.write');
    expect(ROLE_CAPABILITIES.operations).not.toContain('org.manage');
    expect(code).not.toMatch(/insert into public\.(capabilities|role_capabilities)/);
  });
});

describe('P6 anonymous-callable surface', () => {
  it('exactly five functions are granted to anon, nothing to PUBLIC or service_role', () => {
    const grants = [...code.matchAll(/grant execute on function ([\s\S]*?) to (anon|authenticated|public|service_role);/g)];
    const toAnon = grants.filter((g) => g[2] === 'anon').flatMap((g) => [...(g[1] ?? '').matchAll(/public\.([a-z_]+)\(/g)].map((m) => m[1] ?? ''));
    expect(toAnon.sort()).toEqual([...ANON].sort());
    expect(grants.some((g) => g[2] === 'public' || g[2] === 'service_role')).toBe(false);
    const toAuth = grants.filter((g) => g[2] === 'authenticated').flatMap((g) => [...(g[1] ?? '').matchAll(/public\.([a-z_]+)\(/g)].map((m) => m[1] ?? ''));
    expect(toAuth.sort()).toEqual([...CUSTOMER, ...Object.keys(STAFF)].sort());
    expect(toAuth.filter((n) => ANON.includes(n))).toEqual([]);
  });
  it('every anon function is a definer with a pinned search_path that checks its credential FIRST and never raises for a bad one', () => {
    for (const name of ANON) {
      const b = fn('public', name);
      expect(b, name).toMatch(/security definer set search_path = ''/);
      const firstCheck = Math.min(...[b.indexOf('private.int_key_auth(p_key_hash)'), b.indexOf('private.int_worker_ok(p_token_hash)')].filter((i) => i >= 0));
      expect(firstCheck, name).toBeGreaterThan(-1);
      const firstWrite = [b.search(/\binsert into\b/), b.search(/\bupdate public\./), b.search(/\bdelete from\b/)].filter((i) => i >= 0);
      for (const w of firstWrite) expect(w, name).toBeGreaterThan(firstCheck);
      expect(b, name).toMatch(/'code', 'unauthorized'/);
      expect(b, name).not.toMatch(/raise exception/);
      expect(b, name).not.toMatch(/auth\.uid\(\)/);
    }
  });
  it('the key credential is a hash: the plaintext key is never a parameter, a column or stored anywhere', () => {
    expect(code).toMatch(/key_hash\s+text not null unique check \(key_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(code).toMatch(/function public\.rpc_api_key_create\(p_organization_id uuid, p_name text, p_environment text, p_prefix text, p_key_hash text\)/);
    expect(code).not.toMatch(/\bplaintext\b|p_key\b|p_token\b(?!_hash)/);
    expect(fn('private', 'int_key_auth')).toMatch(/k\.key_hash = p_hash and k\.revoked_at is null and g\.status = 'active'/);
    expect(fn('private', 'int_worker_ok')).toMatch(/w\.revoked_at is null/);
  });
  it('the self-check proves the anon set is exactly the five functions', () => {
    expect(sql).toMatch(/the set of anon-executable public functions is not exactly the five key-authenticated RPCs/);
  });
});

describe('P6 tables and privileges', () => {
  it('every table has RLS enabled, no policy and no API-role privilege', () => {
    for (const t of TABLES) expect(code).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on\s+(table\s+)?public\./i);
    expect(code).toMatch(/revoke all on table public\.api_keys,[\s\S]*?from public, anon, authenticated, service_role/);
  });
  it('keys, orders and deliveries are immutable where it matters; sandbox orders cannot progress', () => {
    expect(fn('private', 'guard_int_api_keys')).toMatch(/API key identity is immutable/);
    expect(fn('private', 'guard_int_api_keys')).toMatch(/a revoked key stays revoked/);
    expect(fn('private', 'guard_fulfillment_orders')).toMatch(/sandbox orders never progress past pending/);
    expect(fn('private', 'guard_fulfillment_orders')).toMatch(/fulfillment orders cannot be deleted/);
    expect(fn('private', 'guard_webhook_deliveries')).toMatch(/a finished delivery is final/);
    expect(code).toMatch(/create trigger fulfillment_order_lines_append_only/);
  });
  it('order lifecycle in SQL matches the intended graph', () => {
    const f = fn('private', 'fo_transition_ok');
    const pairs = [...f.matchAll(/\('([a-z]+)', '([a-z]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    expect(pairs).toEqual(['allocated>cancelled', 'allocated>picked', 'packed>cancelled', 'packed>ready', 'pending>cancelled', 'pending>queued', 'picked>cancelled', 'picked>packed', 'queued>allocated', 'queued>cancelled', 'ready>shipped', 'shipped>delivered'].sort());
  });
  it('money is not stored here: no amount columns', () => {
    expect(code).not.toMatch(/_cents|\bnumeric\b|\bdecimal\b|\bfloat\b/i);
  });
});

describe('P6 customer and staff RPCs', () => {
  it('customer reads use the tenant boundary and writes the owner gate; staff RPCs use staff_gate with the expected capability and step-up', () => {
    for (const name of ['rpc_api_keys_list', 'rpc_webhook_endpoints_list', 'rpc_webhook_deliveries_list', 'rpc_integration_orders_list']) {
      const b = fn('public', name);
      expect(b, name).toMatch(/private\.my_org_ids\(\)/);
      expect(b, name).toMatch(/private\.shop_org_ok\(p_organization_id\) is not true/);
    }
    for (const name of ['rpc_api_key_create', 'rpc_api_key_revoke', 'rpc_webhook_endpoint_create', 'rpc_webhook_endpoint_set_active', 'rpc_webhook_endpoint_rotate', 'rpc_webhook_test']) {
      expect(fn('public', name), name).toMatch(/private\.ob_owner_gate\(p_organization_id\)/);
    }
    for (const [name, { cap, stepUp }] of Object.entries(STAFF)) {
      const b = fn('public', name);
      expect(b, name).toMatch(new RegExp(`staff_gate\\('${cap.replace('.', '\\.')}', '[a-z.]+', ${stepUp}, `));
      expect(b, name).toMatch(/if v_gate <> 'ok' then return jsonb_build_object\('ok', false, 'code', v_gate\)/);
    }
    for (const name of [...CUSTOMER, ...Object.keys(STAFF)]) expect(fn('public', name), name).toMatch(/security definer set search_path = ''/);
  });
  it('state-changing RPCs write an audit event', () => {
    for (const name of ['rpc_api_key_create', 'rpc_api_key_revoke', 'rpc_webhook_endpoint_create', 'rpc_webhook_endpoint_set_active', 'rpc_webhook_endpoint_rotate', 'rpc_admin_api_key_revoke', 'rpc_admin_worker_token_create', 'rpc_api_order_create']) {
      expect(fn('public', name), name).toMatch(/private\.write_audit\(/);
    }
  });
  it('key creation: live keys need a live organization, at most 10 active keys, prefix consistent with the environment', () => {
    const b = fn('public', 'rpc_api_key_create');
    expect(b).toMatch(/p_environment = 'live' and not coalesce\(\(select i\.status = 'live'/);
    expect(b).toMatch(new RegExp(`>= ${MAX_ACTIVE_KEYS} then`));
    expect(b).toMatch(/p_prefix not like '99pw\\_' \|\| p_environment/);
    expect(b).toMatch(/not_live/);
  });
  it('webhook endpoints: safe URL, at most 5 per organization, known events, signing key format, no secret in lists or audits', () => {
    const b = fn('public', 'rpc_webhook_endpoint_create');
    expect(b).toMatch(/private\.int_url_ok\(v_url\) is not true/);
    expect(b).toMatch(new RegExp(`>= ${MAX_WEBHOOK_ENDPOINTS} then`));
    for (const ev of WEBHOOK_EVENTS) expect(b).toContain(`'${ev}'`);
    expect(b).toMatch(/p_signing_key !~ '\^whsec_\[0-9a-f\]\{48\}\$'/);
    expect(fn('public', 'rpc_webhook_endpoints_list')).not.toMatch(/signing_key/);
    expect(fn('public', 'rpc_webhook_deliveries_list')).not.toMatch(/signing_key/);
    for (const name of ['rpc_webhook_endpoint_create', 'rpc_webhook_endpoint_rotate']) expect(fn('public', name), name).not.toMatch(/write_audit\([^;]*signing_key/);
    expect(code).not.toMatch(/\bsecret\b/);
  });
});

describe('P6 order intake and delivery worker', () => {
  it('order intake validates the body, locks per organization, handles idempotency, maps only APPROVED SKUs and keeps sandbox and live apart', () => {
    const b = fn('public', 'rpc_api_order_create');
    expect(b).toMatch(/pg_advisory_xact_lock\(hashtextextended\('api:orders:'/);
    expect(b).toMatch(/\(k -> 'scopes'\) \? 'orders:write'/);
    expect(b).toMatch(/private\.shop_ship_to_ok\(p_order -> 'recipient'\) is not true/);
    expect(b).toMatch(/m\.status = 'approved'/);
    expect(b).toMatch(/idempotency_conflict/);
    expect(b).toMatch(/v_prev\.request_hash = p_request_hash/);
    expect(b).toMatch(/v_env = 'test'/);
    expect(b).toMatch(/not_live/);
    expect(b).toMatch(/duplicate_order/);
    expect(b).toMatch(/private\.int_emit_event\(v_org, 'order\.created'/);
    expect(b).not.toMatch(/price|_cents|invoice/i);
    expect(fn('public', 'rpc_api_order_get')).toMatch(/o\.is_sandbox = \(\(k ->> 'environment'\) = 'test'\)/);
    expect(fn('public', 'rpc_api_orders_list')).toMatch(/x\.is_sandbox = \(\(k ->> 'environment'\) = 'test'\)/);
    for (const n of ['rpc_api_order_get', 'rpc_api_orders_list']) expect(fn('public', n), n).toMatch(/\(k -> 'scopes'\) \? 'orders:read'/);
  });
  it('step 5 of the onboarding is satisfied only by a sandbox order received through the API', () => {
    expect(fn('private', 'ob_test_order_ok')).toMatch(/o\.is_sandbox and o\.source = 'api'/);
  });
  it('the worker claims with skip locked, hides claimed deliveries for 10 minutes, gives up after six attempts and never trusts caller text', () => {
    const c = fn('public', 'rpc_worker_claim_deliveries');
    expect(c).toMatch(/for update of d skip locked/);
    expect(c).toMatch(/interval '10 minutes'/);
    expect(c).toMatch(new RegExp(`d\\.attempts < ${MAX_DELIVERY_ATTEMPTS}`));
    expect(c).toMatch(/least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
    const r = fn('public', 'rpc_worker_record_result');
    expect(r).toMatch(new RegExp(`v_attempts >= ${MAX_DELIVERY_ATTEMPTS} then`));
    expect(r).toMatch(/p_error ~ '\^\[a-z_\]\{1,40\}\$'/);
    expect(r).toMatch(/v_status <> 'pending'/);
  });
  it('backoff in SQL equals the TypeScript schedule', () => {
    const f = fn('private', 'int_backoff_seconds');
    const sqlValues = [...f.matchAll(/when (\d) then (\d+)/g)].map((m) => Number(m[2]));
    expect(sqlValues).toEqual(BACKOFF_SECONDS.slice(0, 4));
    expect(f).toMatch(/else 43200 end/);
  });
});

describe('P6 webhook URL rules: the SQL and the TypeScript rule give the same answers', () => {
  const body = fn('private', 'int_url_ok');
  const lits = [...body.matchAll(/p_url (~\*|!~\*|!~) '([^']+)'/g)].map((m) => ({ op: m[1], re: new RegExp((m[2] ?? '').replace(/\[:space:\]/g, '\\s'), m[1] === '!~' ? '' : 'i') }));
  const sqlOk = (u: string) => u.length <= 300 && lits.every(({ op, re }) => (op === '~*' ? re.test(u) : !re.test(u)));
  it('found the four patterns', () => {
    expect(lits.length).toBe(4);
  });
  it('agree on accepted and refused vectors', () => {
    const accept = ['https://hooks.example.com/99pw', 'https://shop.example.co.uk:443/a?b=1', 'https://a-b.example.com/', 'https://HOOKS.Example.com/x'];
    const refuse = [
      'http://hooks.example.com/x', 'https://user:pw@hooks.example.com/x', 'https://hooks.example.com/#x', 'https://hooks.example.com:8443/', 'https://127.0.0.1/', 'https://10.0.0.5/x', 'https://[::1]/',
      'https://localhost/', 'https://localhost.localdomain.local/', 'https://printer.local/', 'https://api.internal/', 'https://nodots/', 'ftp://hooks.example.com', 'javascript:alert(1)', '',
      'https://exa mple.com/', 'https://hooks.example.com/' + 'a'.repeat(300), 'https://.example.com/', 'https://example..com/', 'https://metadata.google.internal/', 'https://router.lan/', 'https://x.home.arpa/',
    ];
    for (const u of accept) {
      expect(sqlOk(u), `sql ${u}`).toBe(true);
      expect(isSafeWebhookUrl(u), `ts ${u}`).toBe(true);
    }
    for (const u of refuse) {
      expect(sqlOk(u), `sql ${u}`).toBe(false);
      expect(isSafeWebhookUrl(u), `ts ${u}`).toBe(false);
    }
  });
});
