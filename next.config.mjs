import createNextIntlPlugin from 'next-intl/plugin';
import withPWAInit from 'next-pwa';
import defaultRuntimeCaching from 'next-pwa/cache.js';

const withNextIntl = createNextIntlPlugin();

// Portal paths must never be served from or written to any service-worker cache.
// This rule is listed first so it wins over next-pwa's default runtime caching.
const portalNetworkOnly = {
  urlPattern: ({ url }) => /^\/(client|admin|login|auth|api)(\/|$)/.test(url.pathname),
  handler: 'NetworkOnly',
};

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [portalNetworkOnly, ...defaultRuntimeCaching],
});

const PORTAL_SECURITY_HEADERS = [
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{ source: '/:portal(client|admin|login|auth)/:path*', headers: PORTAL_SECURITY_HEADERS },
            { source: '/:portal(client|admin|login|auth)', headers: PORTAL_SECURITY_HEADERS }];
  },
  async redirects() {
    return [
      {
        source: '/work',
        destination: '/',
        permanent: false,
      },
      {
        source: '/en/work',
        destination: '/',
        permanent: true,
      },
      {
        source: '/es/work',
        destination: '/es',
        permanent: false,
      },
      {
        source: '/quality',
        destination: '/certificates-of-analysis',
        permanent: true,
      },
      {
        source: '/legal/terms',
        destination: '/terms',
        permanent: true,
      },
      {
        source: '/legal/privacy',
        destination: '/privacy',
        permanent: true,
      },
      {
        source: '/legal/disclaimer',
        destination: '/compliance',
        permanent: true,
      },
      {
        source: '/calculator',
        destination: '/peptide-calculator',
        permanent: true,
      },
      {
        source: '/en/calculator',
        destination: '/peptide-calculator',
        permanent: true,
      },
      {
        source: '/es/calculator',
        destination: '/es/peptide-calculator',
        permanent: true,
      },
      // Bare /en needs its own rule: the catch-all below matches it with an empty
      // :path*, which renders an empty Location header rather than '/'.
      {
        source: '/en',
        destination: '/',
        permanent: true,
      },
      // Catch-all for the default locale. next-intl's middleware would also strip the
      // /en prefix, but only as a 307, so Google never consolidates onto the bare URL.
      // Handling it here emits a 308 and runs before middleware. Must stay last so the
      // specific /en rules above win; /es is a real route and is deliberately untouched.
      {
        source: '/en/:path*',
        destination: '/:path*',
        permanent: true,
      }
    ];
  },
};

export default withPWA(withNextIntl(nextConfig));
