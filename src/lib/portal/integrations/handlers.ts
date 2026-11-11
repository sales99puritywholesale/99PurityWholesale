import { createHash, timingSafeEqual } from 'node:crypto';
import { API_ERROR_TEXT, IDEMPOTENCY_KEY_PATTERN, MAX_BODY_BYTES, apiErrorText, apiOrderSchema, httpStatusFor, type ApiOrderInput } from './api';
import { hashApiKey, isPublicIp, isSafeWebhookUrl, parseBearer, signWebhook, SIGNATURE_HEADER } from './keys';

/**
 * Request handlers of the public API and of the webhook worker, as plain functions over the Web `Request`/`Response` objects with their dependencies INJECTED (the route files bind
 * the real database and network). This keeps every rule unit-testable without a server. No handler echoes database text: errors are a code plus fixed public wording.
 */
export type RpcAnswer = { ok: true; data: Record<string, unknown> } | { ok: false; code: string; extra?: Record<string, unknown> };
export type ApiDeps = {
  createOrder: (keyHash: string, idempotencyKey: string | null, requestHash: string | null, order: ApiOrderInput) => Promise<RpcAnswer>;
  getOrder: (keyHash: string, ref: string) => Promise<RpcAnswer>;
  listOrders: (keyHash: string, limit: number) => Promise<RpcAnswer>;
};

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;
const send = (status: number, body: unknown, extra: Record<string, string> = {}): Response => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
export const errorResponse = (code: string, extra?: Record<string, unknown>): Response => {
  const status = httpStatusFor(code);
  const known = Object.hasOwn(API_ERROR_TEXT, code);
  return send(status, { error: { code: known ? code : 'invalid_request', message: apiErrorText(code), ...(extra ?? {}) } }, status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {});
};

/** Stable fingerprint of the validated order (key order follows the schema), used to tell a retry from a different request under the same Idempotency-Key. */
export const requestHash = (order: ApiOrderInput): string => createHash('sha256').update(JSON.stringify(order), 'utf8').digest('hex');

async function readBody(req: Request): Promise<{ ok: true; text: string } | { ok: false; code: string }> {
  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('application/json')) return { ok: false, code: 'unsupported_media_type' };
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, code: 'payload_too_large' };
  const text = await req.text();
  return new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES ? { ok: false, code: 'payload_too_large' } : { ok: true, text };
}

const failure = (r: Extract<RpcAnswer, { ok: false }>): Response => errorResponse(r.code, r.extra);

export async function handleCreateOrder(req: Request, deps: ApiDeps): Promise<Response> {
  const key = parseBearer(req.headers.get('authorization'));
  if (!key) return errorResponse('unauthorized');
  try {
    const body = await readBody(req);
    if (!body.ok) return errorResponse(body.code);
    let raw: unknown;
    try { raw = JSON.parse(body.text); } catch { return errorResponse('invalid_request'); }
    const parsed = apiOrderSchema.safeParse(raw);
    if (!parsed.success) return errorResponse('invalid_request', { fields: [...new Set(parsed.error.issues.map((i) => i.path.join('.')).filter(Boolean))].slice(0, 10) });
    const idem = req.headers.get('idempotency-key');
    if (idem !== null && !IDEMPOTENCY_KEY_PATTERN.test(idem)) return errorResponse('invalid_request', { fields: ['Idempotency-Key'] });
    const answer = await deps.createOrder(hashApiKey(key), idem, idem === null ? null : requestHash(parsed.data), parsed.data);
    if (!answer.ok) return failure(answer);
    const replay = answer.data.replay === true;
    return send(replay ? 200 : 201, { order: answer.data.order, replay });
  } catch {
    return errorResponse('unavailable');
  }
}

export async function handleGetOrder(req: Request, ref: string, deps: ApiDeps): Promise<Response> {
  const key = parseBearer(req.headers.get('authorization'));
  if (!key) return errorResponse('unauthorized');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(ref)) return errorResponse('not_found');
  try {
    const answer = await deps.getOrder(hashApiKey(key), ref);
    return answer.ok ? send(200, { order: answer.data.order }) : failure(answer);
  } catch {
    return errorResponse('unavailable');
  }
}

export async function handleListOrders(req: Request, deps: ApiDeps): Promise<Response> {
  const key = parseBearer(req.headers.get('authorization'));
  if (!key) return errorResponse('unauthorized');
  const limitRaw = new URL(req.url).searchParams.get('limit');
  const limit = limitRaw === null ? 50 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return errorResponse('invalid_request', { fields: ['limit'] });
  try {
    const answer = await deps.listOrders(hashApiKey(key), limit);
    return answer.ok ? send(200, { orders: answer.data.orders }) : failure(answer);
  } catch {
    return errorResponse('unavailable');
  }
}

// ------------------------------------------------------------------------------------------------------------------------------ webhook worker
export type Delivery = { id: string; url: string; signing_key: string; event_type: string; payload: Record<string, unknown>; attempt: number; created_at: string };
export type WorkerDeps = {
  claim: (tokenHash: string, limit: number) => Promise<{ ok: true; deliveries: Delivery[] } | { ok: false; code: string }>;
  record: (tokenHash: string, id: string, httpStatus: number | null, ok: boolean, error: string | null) => Promise<void>;
  resolve: (host: string) => Promise<string[]>;
  fetchImpl: (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; redirect: 'manual'; signal: AbortSignal }) => Promise<{ status: number }>;
  now: () => number;
  cronSecret: string | undefined;
  workerToken: string | undefined;
};

/** Cron entry: `Authorization: Bearer <CRON_SECRET>`; claims due deliveries and sends them, each signed, with a 10 second timeout, no redirects, and public-address checks. */
export async function handleWebhookCron(req: Request, deps: WorkerDeps): Promise<Response> {
  if (!deps.cronSecret || !deps.workerToken) return send(503, { error: { code: 'unavailable', message: apiErrorText('unavailable') } });
  const given = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer /, ''), 'utf8');
  const want = Buffer.from(deps.cronSecret, 'utf8');
  if (given.length !== want.length || !timingSafeEqual(given, want)) return errorResponse('unauthorized');
  const tokenHash = hashApiKey(deps.workerToken);
  const claimed = await deps.claim(tokenHash, 20);
  if (!claimed.ok) return errorResponse(claimed.code === 'unauthorized' ? 'unavailable' : 'unavailable');
  let delivered = 0;
  let failed = 0;
  for (const d of claimed.deliveries) {
    let ok = false;
    let status: number | null = null;
    let error: string | null = null;
    try {
      if (!isSafeWebhookUrl(d.url)) throw Object.assign(new Error('unsafe'), { klass: 'unsafe_url' });
      const addresses = await deps.resolve(new URL(d.url).hostname);
      if (addresses.length === 0 || !addresses.every(isPublicIp)) throw Object.assign(new Error('blocked'), { klass: 'blocked_address' });
      const ts = Math.floor(deps.now() / 1000);
      const body = JSON.stringify({ id: d.id, type: d.event_type, created_at: d.created_at, data: d.payload });
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 10_000);
      try {
        const res = await deps.fetchImpl(d.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': '99Purity-Webhooks/1', [SIGNATURE_HEADER]: signWebhook(d.signing_key, ts, body) }, body, redirect: 'manual', signal: ctl.signal });
        status = res.status;
        ok = res.status >= 200 && res.status < 300;
        if (!ok) error = res.status >= 300 && res.status < 400 ? 'redirect_refused' : 'http_error';
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      const klass = (e as { klass?: string }).klass;
      error = klass ?? ((e as Error).name === 'AbortError' ? 'timeout' : 'network_error');
    }
    await deps.record(tokenHash, d.id, status, ok, error);
    if (ok) delivered += 1; else failed += 1;
  }
  return send(200, { claimed: claimed.deliveries.length, delivered, failed });
}
