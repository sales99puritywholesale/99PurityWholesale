import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract between the TypeScript RPC wrappers (src/lib/portal/commerce/server.ts) and the P3 migration that is APPLIED to the hosted development project
 * (supabase/migrations/20261110000100_p3_catalog_pricing_orders.sql). Text-level checks, no database: they catch a renamed parameter, a missing required parameter or a response key
 * the app expects but the function never returns (which would surface at runtime as "invalid_response").
 */
const root = process.cwd();
const server = readFileSync(join(root, 'src', 'lib', 'portal', 'commerce', 'server.ts'), 'utf8');
const sql = readFileSync(join(root, 'supabase', 'migrations', '20261110000100_p3_catalog_pricing_orders.sql'), 'utf8').replace(/--[^\n]*/g, '');

type Sig = { name: string; params: { name: string; required: boolean }[]; body: string };
const functions: Sig[] = [...sql.matchAll(/create function public\.(rpc_[a-z_]+)\(([^)]*)\)\s*returns jsonb([\s\S]*?)\n\$\$;/g)].map((m) => ({
  name: m[1] as string,
  params: (m[2] as string).split(',').map((p) => p.trim()).filter(Boolean).map((p) => ({ name: p.split(/\s+/)[0] as string, required: !/\bdefault\b/i.test(p) })),
  body: m[3] as string,
}));
const calls = [...server.matchAll(/call\(\s*'(rpc_[a-z_]+)',\s*\{([^}]*)\}/g)].map((m) => ({ name: m[1] as string, keys: [...(m[2] as string).matchAll(/\b(p_[a-z0-9_]+)\s*:/g)].map((k) => k[1] as string) }));

describe('P3 RPC contract: calls match the committed signatures', () => {
  it('the migration defines the 19 P3 RPCs', () => {
    expect(functions.map((f) => f.name).sort()).toEqual([...new Set(functions.map((f) => f.name))].sort());
    expect(functions).toHaveLength(19);
  });
  it('every P3 RPC is wrapped by the application, and every wrapper calls an RPC that exists', () => {
    const called = new Set([...calls.map((c) => c.name), ...[...server.matchAll(/'(rpc_[a-z_]+)'/g)].map((m) => m[1] as string)]);
    for (const f of functions) expect(called.has(f.name), f.name).toBe(true);
    for (const c of calls) expect(functions.some((f) => f.name === c.name), c.name).toBe(true);
  });
  it('each call passes only known parameters and every required parameter', () => {
    expect(calls.length).toBeGreaterThanOrEqual(19);
    for (const c of calls) {
      const f = functions.find((x) => x.name === c.name)!;
      for (const k of c.keys) expect(f.params.map((p) => p.name), `${c.name} gets unknown parameter ${k}`).toContain(k);
      for (const p of f.params.filter((x) => x.required)) expect(c.keys, `${c.name} misses required ${p.name}`).toContain(p.name);
    }
  });
});

describe('P3 RPC contract: the response shapes the app validates exist in the SQL', () => {
  it('every snake_case response key named in the Zod schemas of server.ts is a key some P3 RPC returns', () => {
    const schemaText = server.slice(server.indexOf('const catalogVariant'));
    const keys = new Set([...schemaText.matchAll(/\b([a-z]+(?:_[a-z0-9]+)+)\s*:\s*(?:z\.|cents|e4)/g)].map((m) => m[1] as string).filter((k) => !k.startsWith('p_')));
    expect(keys.size).toBeGreaterThanOrEqual(35);
    const returned = new Set([...functions.flatMap((f) => [...f.body.matchAll(/'([a-z]+(?:_[a-z0-9]+)*)'/g)].map((m) => m[1] as string))]);
    // the order and pricing keys are produced by jsonb_build_object over the snapshot (pricing keys are produced by private.shop_price_breakdown)
    const breakdown = new Set([...sql.matchAll(/'([a-z]+(?:_[a-z0-9]+)+)'/g)].map((m) => m[1] as string));
    const missing = [...keys].filter((k) => !returned.has(k) && !breakdown.has(k));
    expect(missing).toEqual([]);
  });
  it('customer-facing functions never return cost data (base price, floor, markup breakdown)', () => {
    for (const name of ['rpc_catalog_list', 'rpc_cart_get', 'rpc_orders_list', 'rpc_order_get']) {
      const body = functions.find((f) => f.name === name)!.body;
      expect(body.replace(/\bp_[a-z_]+\b/g, ''), name).not.toMatch(/'(base_price_cents|floor_cents|min_price_cents|pricing|org_amount|rep_amount)'/);
    }
  });
  it('the checkout wrapper sends no price, total or line: only the organization, address, notes and idempotency key', () => {
    const checkout = calls.find((c) => c.name === 'rpc_checkout')!;
    expect(checkout.keys.sort()).toEqual(['p_idempotency_key', 'p_notes', 'p_organization_id', 'p_ship_to']);
  });
});
