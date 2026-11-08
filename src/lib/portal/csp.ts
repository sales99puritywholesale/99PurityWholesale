/**
 * Content-Security-Policy for PORTAL responses only (set by the middleware, with a per-request nonce).
 * The public website's headers are not touched.
 *
 * Trade-offs, stated plainly:
 *  - scripts: nonce + 'strict-dynamic' (no 'unsafe-inline'); 'unsafe-eval' only in development (React/Next dev tooling).
 *  - styles: 'unsafe-inline' remains for style attributes and Next/Tailwind injected styles; scripts are the XSS vector.
 *  - connect-src lists the Supabase origin so a future browser client can reach it; P1 authenticates on the server only.
 */
export function buildPortalCsp(opts: { nonce: string; supabaseOrigin?: string; isDev?: boolean }): string {
  const { nonce, supabaseOrigin, isDev = false } = opts;
  const connect = ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])];
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** URL-safe-ish random nonce. Edge-safe (Web Crypto only). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s);
}
