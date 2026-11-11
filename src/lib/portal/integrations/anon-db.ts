import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSupabasePublicConfig } from '../config';
import type { ApiDeps, Delivery, RpcAnswer, WorkerDeps } from './handlers';

/**
 * The anon-role database client for the key-authenticated routes (no cookies, no session): the PUBLIC key only. The only functions the anon role may execute are the five
 * key-authenticated RPCs of the P6 migration; each checks the API key hash (or worker token hash) itself. No service-role key exists anywhere in this application.
 */
function anon() {
  const { url, anonKey } = requireSupabasePublicConfig();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const envelope = (data: unknown): RpcAnswer => {
  if (data && typeof data === 'object' && 'ok' in data) {
    const d = data as Record<string, unknown>;
    if (d.ok === true) return { ok: true, data: d };
    const { ok: _ok, code, ...extra } = d;
    void _ok;
    return { ok: false, code: typeof code === 'string' ? code : 'invalid_response', extra };
  }
  return { ok: false, code: 'invalid_response' };
};

async function rpc(fn: string, args: Record<string, unknown>): Promise<RpcAnswer> {
  try {
    const { data, error } = await anon().rpc(fn, args);
    return error ? { ok: false, code: 'unavailable' } : envelope(data);
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

export const realApiDeps: ApiDeps = {
  createOrder: (keyHash, idem, reqHash, order) => rpc('rpc_api_order_create', { p_key_hash: keyHash, p_idempotency_key: idem, p_request_hash: reqHash, p_order: order }),
  getOrder: (keyHash, ref) => rpc('rpc_api_order_get', { p_key_hash: keyHash, p_ref: ref }),
  listOrders: (keyHash, limit) => rpc('rpc_api_orders_list', { p_key_hash: keyHash, p_limit: limit }),
};

export const realWorkerClaim: WorkerDeps['claim'] = async (tokenHash, limit) => {
  const r = await rpc('rpc_worker_claim_deliveries', { p_token_hash: tokenHash, p_limit: limit });
  return r.ok ? { ok: true, deliveries: Array.isArray(r.data.deliveries) ? (r.data.deliveries as Delivery[]) : [] } : { ok: false, code: r.code };
};
export const realWorkerRecord: WorkerDeps['record'] = async (tokenHash, id, httpStatus, ok, error) => {
  await rpc('rpc_worker_record_result', { p_token_hash: tokenHash, p_delivery_id: id, p_http_status: httpStatus, p_ok: ok, p_error: error });
};
