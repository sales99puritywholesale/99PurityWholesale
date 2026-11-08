import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DM_Mono, DM_Sans, Rajdhani } from 'next/font/google';
import './portal.css';
import { assertPortalEnabled } from '@/lib/portal/auth';

// Portal pages are always rendered per request (the middleware sets a per-request CSP nonce) and never indexed.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Portal', template: '%s | 99 Purity Wholesale Portal' },
  robots: { index: false, follow: false, nocache: true, noarchive: true },
};

export const viewport: Viewport = { themeColor: '#090C11' };

// Portal-specific CSS variable names: the public site's fonts and variables are never loaded or overridden here.
const heading = Rajdhani({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-portal-heading', display: 'swap' });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-portal-body', display: 'swap' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-portal-mono', display: 'swap' });

// Own <html>/<body>: deliberately no analytics, no WhatsApp widget, no marketing header/footer.
export default function PortalRootLayout({ children }: { children: ReactNode }) {
  assertPortalEnabled(); // defence in depth: the middleware already answers 404 when the portal is off
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
