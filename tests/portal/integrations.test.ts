import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BACKOFF_SECONDS, MAX_DELIVERY_ATTEMPTS, formatApiKey, hashApiKey, isApiKey, isPublicIp, isSafeWebhookUrl, keyEnvironment, keyPrefix, nextDelaySeconds, parseBearer, signWebhook, verifyWebhook,
} from '@/lib/portal/integrations/keys';
import { API_ERROR_TEXT, HTTP_STATUS, apiErrorText, apiOrderSchema, httpStatusFor } from '@/lib/portal/integrations/api';
import { createEndpointSchema, createKeySchema } from '@/lib/portal/integrations/schemas';
import { messageFor } from '@/lib/portal/commerce/messages';

const id = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f';
const bytes = (n: number) => new Uint8Array(20).fill(n);

describe('API keys', () => {
  it('formats 99pw_<env>_<40 hex> from exactly 20 random bytes', () => {
    const k = formatApiKey('test', bytes(0xab));
    expect(k).toBe(`99pw_test_${'ab'.repeat(20)}`);
    expect(isApiKey(k)).toBe(true);
    expect(formatApiKey('live', bytes(1))).toMatch(/^99pw_live_[0-9a-f]{40}$/);
    expect(() => formatApiKey('test', new Uint8Array(19))).toThrow(RangeError);
  });
  it('hashes with SHA-256 (hex), the prefix is the first 16 characters and never reveals the secret part', () => {
    const k = formatApiKey('test', bytes(0x11));
    expect(hashApiKey(k)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(k)).not.toBe(hashApiKey(formatApiKey('test', bytes(0x12))));
    expect(keyPrefix(k)).toBe('99pw_test_111111');
    expect(keyPrefix(k).length).toBe(16);
    expect(k.startsWith(keyPrefix(k))).toBe(true);
  });
  it('detects the environment and refuses malformed keys', () => {
    expect(keyEnvironment(formatApiKey('live', bytes(2)))).toBe('live');
    expect(keyEnvironment(formatApiKey('test', bytes(2)))).toBe('test');
    for (const bad of ['', '99pw_prod_' + 'a'.repeat(40), '99pw_test_' + 'A'.repeat(40), '99pw_test_' + 'a'.repeat(39), '99pw_test_' + 'a'.repeat(41), 'sk_test_' + 'a'.repeat(40)]) expect(isApiKey(bad)).toBe(false);
    expect(keyEnvironment('nope')).toBeNull();
  });
  it('parses only a well-formed Bearer header', () => {
    const k = formatApiKey('test', bytes(3));
    expect(parseBearer(`Bearer ${k}`)).toBe(k);
    for (const bad of [null, undefined, '', k, `bearer ${k}`, `Bearer  ${k} extra`, `Basic ${k}`, 'Bearer short', `Bearer ${k}\n${k}`]) expect(parseBearer(bad as string)).toBeNull();
  });
});

describe('webhook signatures', () => {
  const secret = 'whsec_test_secret';
  const body = '{"event":"ping"}';
  it('signs t.body with HMAC-SHA256 and formats t=...,v1=...', () => {
    const expected = createHmac('sha256', secret).update(`1700000000.${body}`).digest('hex');
    expect(signWebhook(secret, 1700000000, body)).toBe(`t=1700000000,v1=${expected}`);
  });
  it('verifies a good signature within the 5 minute window and refuses replays, tampering and bad formats', () => {
    const h = signWebhook(secret, 1700000000, body);
    expect(verifyWebhook(secret, h, body, 1700000000)).toBe(true);
    expect(verifyWebhook(secret, h, body, 1700000299)).toBe(true);
    expect(verifyWebhook(secret, h, body, 1700000301)).toBe(false);
    expect(verifyWebhook(secret, h, body, 1699999600)).toBe(false);
    expect(verifyWebhook(secret, h, body + ' ', 1700000000)).toBe(false);
    expect(verifyWebhook('other', h, body, 1700000000)).toBe(false);
    for (const bad of ['', 't=1,v1=zz', `t=abc,v1=${'0'.repeat(64)}`, `v1=${'0'.repeat(64)}`, h + 'x']) expect(verifyWebhook(secret, bad, body, 1700000000)).toBe(false);
  });
});

describe('webhook URL and address safety', () => {
  it('accepts only https URLs on public DNS names with the default port', () => {
    for (const ok of ['https://hooks.example.com/99pw', 'https://shop.example.co.uk:443/a?b=1', 'https://a-b.example.com']) expect(isSafeWebhookUrl(ok), ok).toBe(true);
  });
  it('refuses http, credentials, fragments, odd ports, IP literals, localhost and internal names', () => {
    const bad = [
      'http://hooks.example.com', 'https://user:pw@hooks.example.com', 'https://hooks.example.com/#x', 'https://hooks.example.com:8443/', 'https://127.0.0.1/', 'https://10.0.0.5/x', 'https://[::1]/',
      'https://localhost/', 'https://localhost.localdomain.local/', 'https://printer.local/', 'https://api.internal/', 'https://nodots/', 'ftp://hooks.example.com', 'javascript:alert(1)', '',
      'https://exa mple.com/', 'https://hooks.example.com/' + 'a'.repeat(300), 'https://.example.com/', 'https://example..com/', 'https://metadata.google.internal/', 'https://router.lan/', 'https://x.home.arpa/',
    ];
    for (const b of bad) expect(isSafeWebhookUrl(b), b).toBe(false);
  });
  it('treats private, loopback, link-local, carrier-grade, test and multicast addresses as non-public (IPv4, IPv6 and mapped)', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.10', '198.18.0.1', '203.0.113.9',
                      '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', '999.1.1.1', 'not-an-ip']) expect(isPublicIp(ip), ip).toBe(false);
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.63.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPublicIp(ip), ip).toBe(true);
  });
});

describe('delivery retries', () => {
  it('backs off 1 min, 5 min, 30 min, 2 h, 12 h and gives up after six attempts', () => {
    expect(BACKOFF_SECONDS).toEqual([60, 300, 1800, 7200, 43200]);
    expect([1, 2, 3, 4, 5].map(nextDelaySeconds)).toEqual([60, 300, 1800, 7200, 43200]);
    expect(nextDelaySeconds(MAX_DELIVERY_ATTEMPTS)).toBeNull();
    expect(nextDelaySeconds(7)).toBeNull();
  });
});

describe('API order contract', () => {
  const ok = { external_ref: 'SHOP-1001', recipient: { name: 'A B', line1: '1 St', city: 'Austin', region: 'TX', postal: '78701', country: 'US' }, lines: [{ sku: 'ACME-1', quantity: 2 }] };
  it('accepts a valid order and rejects unknown fields', () => {
    expect(apiOrderSchema.safeParse(ok).success).toBe(true);
    expect(apiOrderSchema.safeParse({ ...ok, price_cents: 1 }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, lines: [{ sku: 'A', quantity: 1, price: 5 }] }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, status: 'shipped' }).success).toBe(false);
  });
  it('bounds the ref, quantities, line count, country and duplicate SKUs', () => {
    expect(apiOrderSchema.safeParse({ ...ok, external_ref: '' }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, external_ref: 'a b' }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, lines: [] }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, lines: [{ sku: 'A', quantity: 0 }] }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, lines: [{ sku: 'A', quantity: 10001 }] }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, lines: [{ sku: 'A', quantity: 1.5 }] }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, lines: Array.from({ length: 51 }, (_, i) => ({ sku: `S${i}`, quantity: 1 })) }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, lines: [{ sku: 'A', quantity: 1 }, { sku: 'A', quantity: 2 }] }).success).toBe(false);
    expect(apiOrderSchema.safeParse({ ...ok, recipient: { ...ok.recipient, country: 'usa' } }).success).toBe(false);
  });
  it('maps result codes to HTTP statuses and fixed public text; unknown codes become 400 with a generic text', () => {
    expect(httpStatusFor('unauthorized')).toBe(401);
    expect(httpStatusFor('forbidden_scope')).toBe(403);
    expect(httpStatusFor('unknown_sku')).toBe(422);
    expect(httpStatusFor('duplicate_order')).toBe(409);
    expect(httpStatusFor('constructor')).toBe(400);
    expect(httpStatusFor('relation "x" does not exist')).toBe(400);
    for (const code of Object.keys(HTTP_STATUS)) expect(API_ERROR_TEXT[code], code).toBeTruthy();
    expect(apiErrorText('some db error: relation x')).toBe('The request could not be completed.');
  });
});

describe('action validation and messages', () => {
  it('key creation needs a name and a known environment', () => {
    expect(createKeySchema.safeParse({ organizationId: id, name: 'My shop', environment: 'test' }).success).toBe(true);
    expect(createKeySchema.safeParse({ organizationId: id, name: '', environment: 'test' }).success).toBe(false);
    expect(createKeySchema.safeParse({ organizationId: id, name: 'x', environment: 'prod' }).success).toBe(false);
    expect(createKeySchema.safeParse({ organizationId: id, name: 'x', environment: 'test', scopes: ['orders:write'] }).success).toBe(false);
  });
  it('endpoints need a safe https URL and known events', () => {
    expect(createEndpointSchema.safeParse({ organizationId: id, url: 'https://hooks.example.com/x', events: ['order.created'] }).success).toBe(true);
    expect(createEndpointSchema.safeParse({ organizationId: id, url: 'http://hooks.example.com/x', events: ['order.created'] }).success).toBe(false);
    expect(createEndpointSchema.safeParse({ organizationId: id, url: 'https://127.0.0.1/x', events: ['order.created'] }).success).toBe(false);
    expect(createEndpointSchema.safeParse({ organizationId: id, url: 'https://hooks.example.com/x', events: [] }).success).toBe(false);
    expect(createEndpointSchema.safeParse({ organizationId: id, url: 'https://hooks.example.com/x', events: ['order.deleted'] }).success).toBe(false);
  });
  it('integration result codes resolve in the shared banner', () => {
    expect(messageFor('not_live')).toMatch(/Live keys/);
    expect(messageFor('invalid_url')).toMatch(/https/);
    expect(messageFor('step_locked')).toMatch(/earlier steps/);
  });
});
