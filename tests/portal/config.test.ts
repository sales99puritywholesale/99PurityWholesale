import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSupabasePublicConfig,
  isPortalEnabled,
  looksLikeServiceKey,
  parseSupabasePublicConfig,
  requireSupabasePublicConfig,
} from '@/lib/portal/config';

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: object) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature-not-verified`;
const ANON = jwt({ role: 'anon', iss: 'supabase' });
const SERVICE = jwt({ role: 'service_role', iss: 'supabase' });
const URL_OK = 'https://abcdefgh.supabase.co';

afterEach(() => vi.unstubAllEnvs());

describe('isPortalEnabled (feature flag fails closed)', () => {
  it('is on only for exactly "true"', () => {
    expect(isPortalEnabled('true')).toBe(true);
  });
  it.each([[undefined], [''], ['false'], ['TRUE'], ['True'], ['1'], ['yes'], ['on'], [' true'], ['true '], ['enabled']])(
    'is off for %o',
    (value) => {
      expect(isPortalEnabled(value)).toBe(false);
    },
  );
  it('reads PORTAL_ENABLED from the environment by default', () => {
    vi.stubEnv('PORTAL_ENABLED', 'true');
    expect(isPortalEnabled()).toBe(true);
    vi.stubEnv('PORTAL_ENABLED', 'nope');
    expect(isPortalEnabled()).toBe(false);
  });
});

describe('parseSupabasePublicConfig', () => {
  it('accepts a valid https URL and a public key, normalising the URL to its origin', () => {
    expect(parseSupabasePublicConfig({ url: ` ${URL_OK}/ `, anonKey: ANON })).toEqual({ ok: true, config: { url: URL_OK, anonKey: ANON } });
  });
  it('accepts http only for localhost', () => {
    expect(parseSupabasePublicConfig({ url: 'http://localhost:54321', anonKey: ANON }).ok).toBe(true);
    expect(parseSupabasePublicConfig({ url: 'http://127.0.0.1:54321', anonKey: ANON }).ok).toBe(true);
    expect(parseSupabasePublicConfig({ url: 'http://abcdefgh.supabase.co', anonKey: ANON }).ok).toBe(false);
  });
  it('accepts the new publishable key format', () => {
    expect(parseSupabasePublicConfig({ url: URL_OK, anonKey: 'sb_publishable_abcdefghijklmnop' }).ok).toBe(true);
  });
  it.each([
    ['missing url', { url: undefined, anonKey: ANON }],
    ['missing key', { url: URL_OK, anonKey: undefined }],
    ['empty url', { url: '', anonKey: ANON }],
    ['not a url', { url: 'supabase', anonKey: ANON }],
    ['credentials in url', { url: 'https://user:pass@abcdefgh.supabase.co', anonKey: ANON }],
    ['path in url', { url: `${URL_OK}/rest/v1`, anonKey: ANON }],
    ['query in url', { url: `${URL_OK}/?a=1`, anonKey: ANON }],
    ['ftp scheme', { url: 'ftp://abcdefgh.supabase.co', anonKey: ANON }],
    ['short key', { url: URL_OK, anonKey: 'short' }],
    ['key with whitespace', { url: URL_OK, anonKey: 'aaaaaaaaaa bbbbbbbbbbbb' }],
    ['non-string key', { url: URL_OK, anonKey: 12345678901234567890 }],
  ])('rejects %s', (_label, raw) => {
    expect(parseSupabasePublicConfig(raw).ok).toBe(false);
  });
  it('refuses a service-role JWT or a secret key as the public key', () => {
    expect(parseSupabasePublicConfig({ url: URL_OK, anonKey: SERVICE }).ok).toBe(false);
    expect(parseSupabasePublicConfig({ url: URL_OK, anonKey: 'sb_secret_abcdefghijklmnop' }).ok).toBe(false);
  });
  it('never includes configuration values in a failure result', () => {
    expect(JSON.stringify(parseSupabasePublicConfig({ url: 'https://u:p@x.supabase.co', anonKey: SERVICE }))).toBe('{"ok":false}');
  });
});

describe('looksLikeServiceKey', () => {
  it('detects secret keys and service_role JWTs only', () => {
    expect(looksLikeServiceKey('sb_secret_x')).toBe(true);
    expect(looksLikeServiceKey(SERVICE)).toBe(true);
    expect(looksLikeServiceKey(ANON)).toBe(false);
    expect(looksLikeServiceKey('sb_publishable_x')).toBe(false);
    expect(looksLikeServiceKey('not.a.jwt')).toBe(false);
    expect(looksLikeServiceKey('')).toBe(false);
  });
});

describe('environment access', () => {
  it('getSupabasePublicConfig reads only the two public variables', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_OK);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON);
    expect(getSupabasePublicConfig()).toEqual({ ok: true, config: { url: URL_OK, anonKey: ANON } });
  });
  it('is not configured when either variable is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON);
    expect(getSupabasePublicConfig().ok).toBe(false);
  });
  it('requireSupabasePublicConfig throws a message that contains no values', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://secret-looking-host.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'short');
    expect(() => requireSupabasePublicConfig()).toThrowError('Portal authentication is not configured.');
    try {
      requireSupabasePublicConfig();
    } catch (e) {
      expect(String(e)).not.toContain('secret-looking-host');
    }
  });
});
