import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * P6 integration model (pure apart from node:crypto; no server-only imports so tests and handlers can use it). Mirrors the P6 migration draft (supabase/review/p6/);
 * the database is authoritative. A key is `99pw_<test|live>_<40 hex>`: the plaintext is shown to its owner ONCE and never stored; the database keeps only the
 * SHA-256 of the whole key and its first 16 characters (the prefix) for display.
 */
export const KEY_ENVIRONMENTS = ['test', 'live'] as const;
export type KeyEnvironment = (typeof KEY_ENVIRONMENTS)[number];
export const KEY_SCOPES = ['orders:write', 'orders:read'] as const;
export type KeyScope = (typeof KEY_SCOPES)[number];
export const MAX_ACTIVE_KEYS = 10;
export const KEY_PATTERN = /^99pw_(test|live)_[0-9a-f]{40}$/;
export const KEY_PREFIX_LENGTH = 16;

/** Build a key from 20 random bytes (the caller supplies `crypto.randomBytes(20)`; passing the bytes keeps this function deterministic for tests). */
export function formatApiKey(env: KeyEnvironment, randomBytes: Uint8Array): string {
  if (randomBytes.length !== 20) throw new RangeError('20 random bytes are required');
  return `99pw_${env}_${Buffer.from(randomBytes).toString('hex')}`;
}
export const hashApiKey = (key: string): string => createHash('sha256').update(key, 'utf8').digest('hex');
export const keyPrefix = (key: string): string => key.slice(0, KEY_PREFIX_LENGTH);
export const isApiKey = (v: unknown): v is string => typeof v === 'string' && KEY_PATTERN.test(v);
export const keyEnvironment = (key: string): KeyEnvironment | null => (isApiKey(key) ? (key.startsWith('99pw_live_') ? 'live' : 'test') : null);

/** `Authorization: Bearer <key>` -> the key, or null for anything else (wrong scheme, wrong shape, extra tokens). */
export function parseBearer(header: string | null | undefined): string | null {
  if (typeof header !== 'string') return null;
  const m = /^Bearer ([^\s]+)$/.exec(header.trim());
  return m && isApiKey(m[1]) ? m[1] : null;
}

// ------------------------------------------------------------------------------------------------------------------------------ webhooks
export const WEBHOOK_EVENTS = ['order.created', 'order.status_changed', 'ping'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const MAX_WEBHOOK_ENDPOINTS = 5;
export const MAX_DELIVERY_ATTEMPTS = 6;
/** Seconds to wait before attempt n+1 after attempt n failed: 1 min, 5 min, 30 min, 2 h, 12 h. */
export const BACKOFF_SECONDS: readonly number[] = [60, 300, 1800, 7200, 43200];
export const nextDelaySeconds = (attemptsSoFar: number): number | null => (attemptsSoFar >= MAX_DELIVERY_ATTEMPTS ? null : (BACKOFF_SECONDS[Math.min(Math.max(attemptsSoFar, 1), BACKOFF_SECONDS.length) - 1] ?? null));

export const SIGNATURE_HEADER = 'X-99PW-Signature';
export const SIGNATURE_TOLERANCE_SECONDS = 300;
/** HMAC-SHA256 over `<timestamp>.<body>` with the endpoint secret; sent as `t=<timestamp>,v1=<hex>`. */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')}`;
}
/** Receiver-side check (documented for customers): constant-time compare and a 5 minute window against replays. */
export function verifyWebhook(secret: string, header: string, body: string, nowSeconds: number): boolean {
  const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header);
  if (!m) return false;
  const ts = Number(m[1]);
  if (Math.abs(nowSeconds - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signWebhook(secret, ts, body).split('v1=')[1] ?? '', 'hex');
  const given = Buffer.from(m[2] ?? '', 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
/** Webhook URL rules (the database applies the same ones): https only, port 443, no credentials, a real DNS name (not an IP literal, not localhost or an internal suffix). */
export function isSafeWebhookUrl(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length > 300 || /\s/.test(raw)) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash) return false;
  if (u.port !== '' && u.port !== '443') return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('[') || IPV4.test(host)) return false;
  if (host === 'localhost' || /\.(local|localhost|internal|lan|home|corp|intranet|arpa)$/.test(host)) return false;
  return /^[a-z0-9.-]+$/.test(host) && !host.startsWith('.') && !host.endsWith('.') && !host.includes('..');
}

/** Sender-side defence in depth: the resolved address must not be private, loopback, link-local or otherwise non-public (v4 and v6). */
export function isPublicIp(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return false;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && Number(v4[3]) === 0) || (b === 0 && Number(v4[3]) === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && Number(v4[3]) === 100))) return false;
    if (a === 203 && b === 0 && Number(v4[3]) === 113) return false;
    return true;
  }
  const v6 = ip.toLowerCase();
  if (!v6.includes(':')) return false;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v6);
  if (mapped) return isPublicIp(mapped[1] ?? '');
  if (v6 === '::' || v6 === '::1') return false;
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff') || v6.startsWith('2001:db8')) return false;
  return true;
}
