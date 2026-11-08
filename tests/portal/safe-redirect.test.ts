import { describe, expect, it } from 'vitest';
import { loginSchema, safeRedirectPath } from '@/lib/portal/validation';

describe('safeRedirectPath', () => {
  it('accepts portal-internal paths and keeps the query string', () => {
    expect(safeRedirectPath('/client')).toBe('/client');
    expect(safeRedirectPath('/client/orders')).toBe('/client/orders');
    expect(safeRedirectPath('/client/orders?status=shipped')).toBe('/client/orders?status=shipped');
    expect(safeRedirectPath('/admin/settings')).toBe('/admin/settings');
  });

  it.each([
    ['absolute https URL', 'https://evil.example/client'],
    ['absolute http URL', 'http://evil.example'],
    ['protocol-relative', '//evil.example/client'],
    ['protocol-relative with backslash', '/\\evil.example'],
    ['backslash path', '\\client'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>1</script>'],
    ['encoded protocol-relative', '/%2F%2Fevil.example'],
    ['double-encoded protocol-relative', '/%252F%252Fevil.example'],
    ['encoded backslash', '/%5Cevil.example'],
    ['newline injection', '/client\nSet-Cookie: x=1'],
    ['encoded newline', '/client%0d%0aSet-Cookie:x=1'],
    ['tab', '/client\t/x'],
    ['space', '/client /x'],
    ['not a portal path', '/products'],
    ['login loop target', '/login'],
    ['auth callback target', '/auth/callback'],
    ['similar prefix', '/clients'],
    ['relative without slash', 'client'],
    ['empty', ''],
    ['too long', `/client/${'a'.repeat(600)}`],
    ['malformed encoding', '/client/%E0%A4%A'],
  ])('rejects %s', (_label, value) => {
    expect(safeRedirectPath(value)).toBe('/client');
  });

  it.each([[null], [undefined], [42], [{}], [['/client']]])('rejects non-string %o', (value) => {
    expect(safeRedirectPath(value)).toBe('/client');
  });

  it('honours a custom fallback', () => {
    expect(safeRedirectPath('//evil', '/client/orders')).toBe('/client/orders');
  });
});

describe('loginSchema', () => {
  it('normalises the email and keeps the password untouched', () => {
    const r = loginSchema.safeParse({ email: '  User@Example.COM ', password: ' secret with spaces ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('user@example.com');
      expect(r.data.password).toBe(' secret with spaces ');
    }
  });
  it.each([
    [{ email: '', password: 'x' }],
    [{ email: 'not-an-email', password: 'x' }],
    [{ email: 'a@b.co', password: '' }],
    [{ email: 'a@b.co', password: 'x'.repeat(257) }],
    [{ email: `${'a'.repeat(250)}@b.co`, password: 'x' }],
    [{ email: null, password: 'x' }],
    [{}],
  ])('rejects %o', (input) => {
    expect(loginSchema.safeParse(input).success).toBe(false);
  });
});
