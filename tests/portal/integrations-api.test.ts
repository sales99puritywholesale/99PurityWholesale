import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { handleCreateOrder, handleGetOrder, handleListOrders, handleWebhookCron, requestHash, type ApiDeps, type Delivery, type WorkerDeps } from '@/lib/portal/integrations/handlers';
import { formatApiKey, verifyWebhook } from '@/lib/portal/integrations/keys';

const KEY = formatApiKey('test', new Uint8Array(20).fill(7));
const KEY_HASH = createHash('sha256').update(KEY).digest('hex');
const order = { external_ref: 'SHOP-1', recipient: { name: 'A B', line1: '1 St', city: 'Austin', region: 'TX', postal: '78701', country: 'US' }, lines: [{ sku: 'ACME-1', quantity: 2 }] };
const stored = { id: '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11', order_number: 'FO-00001000', external_ref: 'SHOP-1', status: 'pending', sandbox: true, created_at: '2026-11-11T00:00:00Z', lines: [{ sku: 'ACME-1', quantity: 2 }] };

const deps = (over: Partial<ApiDeps> = {}): ApiDeps & { createOrder: ReturnType<typeof vi.fn>; getOrder: ReturnType<typeof vi.fn>; listOrders: ReturnType<typeof vi.fn> } => ({
  createOrder: vi.fn(async () => ({ ok: true as const, data: { order: stored, replay: false } })),
  getOrder: vi.fn(async () => ({ ok: true as const, data: { order: stored } })),
  listOrders: vi.fn(async () => ({ ok: true as const, data: { orders: [stored] } })),
  ...over,
}) as never;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://example.test/api/v1/orders', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const json = async (r: Response) => (await r.json()) as Record<string, any>;

describe('POST /api/v1/orders', () => {
  it('refuses a missing, malformed or non-bearer credential with 401 before any database call', async () => {
    const d = deps();
    for (const auth of [undefined, '', `Basic ${KEY}`, 'Bearer nope', `Bearer ${KEY.toUpperCase()}`]) {
      const res = await handleCreateOrder(new Request('https://example.test/x', { method: 'POST', headers: { ...(auth === undefined ? {} : { authorization: auth }), 'content-type': 'application/json' }, body: JSON.stringify(order) }), d);
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer');
    }
    expect(d.createOrder).not.toHaveBeenCalled();
  });
  it('sends only the SHA-256 of the key to the database, never the key', async () => {
    const d = deps();
    await handleCreateOrder(post(order), d);
    expect(d.createOrder.mock.calls[0]?.[0]).toBe(KEY_HASH);
    expect(JSON.stringify(d.createOrder.mock.calls)).not.toContain(KEY);
  });
  it('creates an order: 201 with the order and replay false', async () => {
    const res = await handleCreateOrder(post(order), deps());
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await json(res)).toEqual({ order: stored, replay: false });
  });
  it('an idempotent replay answers 200 with replay true; the request hash is derived from the validated order', async () => {
    const d = deps({ createOrder: vi.fn(async () => ({ ok: true as const, data: { order: stored, replay: true } })) });
    const res = await handleCreateOrder(post(order, { 'idempotency-key': 'retry-key-0001' }), d);
    expect(res.status).toBe(200);
    expect((await json(res)).replay).toBe(true);
    expect(d.createOrder.mock.calls[0]?.[1]).toBe('retry-key-0001');
    expect(d.createOrder.mock.calls[0]?.[2]).toBe(requestHash(order as never));
    expect(d.createOrder.mock.calls[0]?.[2]).toMatch(/^[0-9a-f]{64}$/);
  });
  it('without an Idempotency-Key no request hash is sent', async () => {
    const d = deps();
    await handleCreateOrder(post(order), d);
    expect(d.createOrder.mock.calls[0]?.[1]).toBeNull();
    expect(d.createOrder.mock.calls[0]?.[2]).toBeNull();
  });
  it('rejects a bad idempotency key, a wrong content type, a huge body, invalid JSON and invalid orders without calling the database', async () => {
    const d = deps();
    expect((await handleCreateOrder(post(order, { 'idempotency-key': 'short' }), d)).status).toBe(400);
    expect((await handleCreateOrder(post(order, { 'content-type': 'text/plain' }), d)).status).toBe(415);
    expect((await handleCreateOrder(post(order, { 'content-length': '40000' }), d)).status).toBe(413);
    expect((await handleCreateOrder(post('x'.repeat(40_000)), d)).status).toBe(413);
    expect((await handleCreateOrder(post('{not json'), d)).status).toBe(400);
    const bad = await handleCreateOrder(post({ ...order, lines: [{ sku: 'A', quantity: 0 }], price_cents: 1 }), d);
    expect(bad.status).toBe(400);
    const body = await json(bad);
    expect(body.error.code).toBe('invalid_request');
    expect(Array.isArray(body.error.fields)).toBe(true);
    expect(d.createOrder).not.toHaveBeenCalled();
  });
  it('maps database result codes to HTTP statuses with fixed public wording', async () => {
    const cases: [string, number, Record<string, unknown>?][] = [['unauthorized', 401], ['forbidden_scope', 403], ['not_live', 403], ['unknown_sku', 422, { skus: ['ZZZ'] }], ['duplicate_order', 409], ['idempotency_conflict', 409], ['invalid_request', 400]];
    for (const [code, status, extra] of cases) {
      const res = await handleCreateOrder(post(order), deps({ createOrder: vi.fn(async () => ({ ok: false as const, code, extra })) }));
      expect(res.status, code).toBe(status);
      const body = await json(res);
      expect(body.error.code).toBe(code);
      expect(typeof body.error.message).toBe('string');
      if (extra) expect(body.error.skus).toEqual(['ZZZ']);
    }
  });
  it('never echoes unknown or database codes: they become a generic 400', async () => {
    const res = await handleCreateOrder(post(order), deps({ createOrder: vi.fn(async () => ({ ok: false as const, code: 'relation "api_keys" does not exist' })) }));
    expect(res.status).toBe(400);
    const text = JSON.stringify(await json(res));
    expect(text).not.toMatch(/relation|api_keys/);
  });
  it('a thrown database failure becomes 503 without details', async () => {
    const res = await handleCreateOrder(post(order), deps({ createOrder: vi.fn(async () => { throw new Error('connection to db.secret.supabase.co refused'); }) }));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await json(res))).not.toMatch(/supabase|connection/);
  });
});

describe('GET /api/v1/orders and /orders/{ref}', () => {
  const get = (url: string, auth: string | null = `Bearer ${KEY}`) => new Request(url, { headers: auth ? { authorization: auth } : {} });
  it('needs a valid key, validates the reference and the limit, and returns 404 for unknown orders', async () => {
    const d = deps();
    expect((await handleGetOrder(get('https://example.test/x', null), 'SHOP-1', d)).status).toBe(401);
    expect((await handleGetOrder(get('https://example.test/x'), '../etc/passwd', d)).status).toBe(404);
    expect(d.getOrder).not.toHaveBeenCalled();
    expect((await handleGetOrder(get('https://example.test/x'), 'SHOP-1', d)).status).toBe(200);
    expect(d.getOrder).toHaveBeenCalledWith(KEY_HASH, 'SHOP-1');
    const miss = await handleGetOrder(get('https://example.test/x'), 'NOPE', deps({ getOrder: vi.fn(async () => ({ ok: false as const, code: 'not_found' })) }));
    expect(miss.status).toBe(404);
    expect((await handleListOrders(get('https://example.test/api/v1/orders?limit=0'), d)).status).toBe(400);
    expect((await handleListOrders(get('https://example.test/api/v1/orders?limit=101'), d)).status).toBe(400);
    expect((await handleListOrders(get('https://example.test/api/v1/orders?limit=abc'), d)).status).toBe(400);
    expect((await handleListOrders(get('https://example.test/api/v1/orders?limit=25'), d)).status).toBe(200);
    expect(d.listOrders).toHaveBeenCalledWith(KEY_HASH, 25);
  });
});

describe('webhook worker (cron)', () => {
  const WORKER = '99pw_worker_' + 'a'.repeat(64);
  const WORKER_HASH = createHash('sha256').update(WORKER).digest('hex');
  const delivery: Delivery = { id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', url: 'https://hooks.example.com/99pw', signing_key: 'whsec_' + 'c'.repeat(48), event_type: 'order.created', payload: { order: stored }, attempt: 1, created_at: '2026-11-11T00:00:00Z' };
  const mk = (over: Partial<WorkerDeps> = {}) => {
    const d = {
      claim: vi.fn(async () => ({ ok: true as const, deliveries: [delivery] })),
      record: vi.fn(async () => {}),
      resolve: vi.fn(async () => ['93.184.216.34']),
      fetchImpl: vi.fn(async () => ({ status: 204 })),
      now: () => 1_700_000_000_000,
      cronSecret: 'cron-secret-value',
      workerToken: WORKER,
      ...over,
    };
    return d as WorkerDeps & { claim: ReturnType<typeof vi.fn>; record: ReturnType<typeof vi.fn>; resolve: ReturnType<typeof vi.fn>; fetchImpl: ReturnType<typeof vi.fn> };
  };
  const call = (d: WorkerDeps, auth: string | null = 'Bearer cron-secret-value') => handleWebhookCron(new Request('https://example.test/api/cron/webhooks', { headers: auth ? { authorization: auth } : {} }), d);

  it('is unavailable without its two environment secrets and refuses a wrong or missing bearer before claiming anything', async () => {
    const a = mk({ cronSecret: undefined });
    expect((await call(a)).status).toBe(503);
    const b = mk({ workerToken: undefined });
    expect((await call(b)).status).toBe(503);
    const c = mk();
    for (const auth of [null, 'Bearer wrong', 'Bearer cron-secret-valuX', 'Bearer ']) expect((await call(c, auth)).status).toBe(401);
    expect(c.claim).not.toHaveBeenCalled();
    expect(a.claim).not.toHaveBeenCalled();
  });
  it('claims with the HASH of the worker token, sends a signed POST and records success', async () => {
    const d = mk();
    const res = await call(d);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ claimed: 1, delivered: 1, failed: 0 });
    expect(d.claim).toHaveBeenCalledWith(WORKER_HASH, 20);
    const [url, init] = d.fetchImpl.mock.calls[0] as [string, { headers: Record<string, string>; body: string; redirect: string; method: string }];
    expect(url).toBe(delivery.url);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(verifyWebhook(delivery.signing_key, init.headers['X-99PW-Signature'] ?? '', init.body, 1_700_000_000)).toBe(true);
    expect(JSON.parse(init.body)).toEqual({ id: delivery.id, type: 'order.created', created_at: delivery.created_at, data: delivery.payload });
    expect(d.record).toHaveBeenCalledWith(WORKER_HASH, delivery.id, 204, true, null);
  });
  it('refuses to send to a URL that is unsafe or resolves to a non-public address, and records why (no request is made)', async () => {
    for (const [url, addrs, klass] of [['http://hooks.example.com/x', ['93.184.216.34'], 'unsafe_url'], ['https://hooks.example.com/x', ['10.0.0.8'], 'blocked_address'], ['https://hooks.example.com/x', ['93.184.216.34', '169.254.169.254'], 'blocked_address'], ['https://hooks.example.com/x', [], 'blocked_address'], ['https://hooks.example.com/x', ['::1'], 'blocked_address']] as const) {
      const d = mk({ claim: vi.fn(async () => ({ ok: true as const, deliveries: [{ ...delivery, url }] })), resolve: vi.fn(async () => [...addrs]) });
      await call(d);
      expect(d.fetchImpl, url + addrs.join()).not.toHaveBeenCalled();
      expect(d.record).toHaveBeenCalledWith(WORKER_HASH, delivery.id, null, false, klass);
    }
  });
  it('treats a non-2xx answer as a failure, refuses redirects, and records timeouts and network errors by class only', async () => {
    const cases: [() => Promise<{ status: number }>, number | null, string][] = [
      [async () => ({ status: 500 }), 500, 'http_error'], [async () => ({ status: 302 }), 302, 'redirect_refused'], [async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }, null, 'timeout'],
      [async () => { throw new Error('getaddrinfo ENOTFOUND secret-host'); }, null, 'network_error'],
    ];
    for (const [fetchImpl, status, klass] of cases) {
      const d = mk({ fetchImpl });
      const res = await call(d);
      expect(await json(res)).toEqual({ claimed: 1, delivered: 0, failed: 1 });
      expect(d.record).toHaveBeenCalledWith(WORKER_HASH, delivery.id, status, false, klass);
    }
  });
  it('an unauthorized worker token (revoked or wrong) is reported as unavailable without sending anything', async () => {
    const d = mk({ claim: vi.fn(async () => ({ ok: false as const, code: 'unauthorized' })) });
    const res = await call(d);
    expect(res.status).toBe(503);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
});
