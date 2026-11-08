import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import { isPortalPath, PORTAL_PREFIXES } from '@/lib/portal/paths';
import { decideRoute } from '@/lib/portal/route-policy';

const root = process.cwd();
const src = join(root, 'src');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const rel = (p: string) => relative(root, p).split(sep).join('/');
const isCode = (p: string) => /\.(ts|tsx|mjs|js)$/.test(p);

describe('public website is unaffected by the portal', () => {
  it('no public route segment collides with a portal prefix', () => {
    const publicPages = [...walk(join(src, 'app', '[locale]'))].filter((p) => p.endsWith('page.tsx'));
    expect(publicPages.length).toBeGreaterThan(20);
    const firstSegments = new Set(
      publicPages.map((p) => relative(join(src, 'app', '[locale]'), p).split(sep)[0]).filter((s): s is string => !!s && s !== 'page.tsx'),
    );
    for (const prefix of PORTAL_PREFIXES) expect(firstSegments.has(prefix.slice(1)), prefix).toBe(false);
  });

  it('every public page path is handed to next-intl, with the portal on or off', () => {
    const paths = ['/', '/es', '/about', '/products', '/products/bpc-157', '/es/products/bpc-157', '/blog', '/locations/us/texas', '/wholesale-application', '/contact', '/glossary'];
    for (const pathname of paths) {
      for (const portalEnabled of [true, false]) {
        expect(isPortalPath(pathname), pathname).toBe(false);
        expect(decideRoute({ pathname, portalEnabled, authConfigured: true, authenticated: false }).type).toBe('public');
      }
    }
  });

  it('the middleware matcher still excludes api, _next, _vercel and static files, and covers portal and public pages', async () => {
    const { config } = await import('@/middleware');
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ['/', '/es', '/products', '/client', '/client/orders', '/admin', '/login', '/auth/callback']) expect(pattern.test(path), path).toBe(true);
    for (const path of ['/api/og', '/api/portal/v1/orders', '/_next/static/x', '/_vercel/insights', '/favicon.ico', '/sitemap.xml', '/robots.txt']) expect(pattern.test(path), path).toBe(false);
  });

  it('portal security headers are scoped to portal paths only (next.config.mjs)', () => {
    const cfg = read('next.config.mjs');
    const sources = [...cfg.matchAll(/source:\s*'([^']+)'/g)].map((m) => m[1] ?? '');
    const headerSources = sources.filter((s) => s.includes('portal'));
    expect(headerSources).toEqual(['/:portal(client|admin|login|auth)/:path*', '/:portal(client|admin|login|auth)']);
    expect(cfg).toContain("handler: 'NetworkOnly'");
    expect(cfg).toMatch(/\(client\|admin\|login\|auth\|api\)/);
  });

  it('robots.txt disallows the portal for every rule block, and the sitemap never lists it', () => {
    const rules = ([] as unknown[]).concat(robots().rules) as { disallow?: string | string[] }[];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const disallow = ([] as string[]).concat(rule.disallow ?? []);
      for (const p of ['/client/', '/admin/', '/login', '/auth/']) expect(disallow, p).toContain(p);
    }
    expect(read('src', 'app', 'sitemap.ts')).not.toMatch(/\/(client|admin|login|auth)\b/);
  });

  it('public code never imports portal code (only the shared middleware may)', () => {
    const portalImport = /from\s+['"](?:@\/(?:components\/portal|portal|lib\/portal)|(?:\.{1,2}\/)+(?:components\/portal|portal|lib\/portal))/;
    const allowed = (p: string) =>
      p.startsWith('src/app/(portal)/') || p.startsWith('src/components/portal/') || p.startsWith('src/lib/portal/') || p.startsWith('src/portal/') || p === 'src/middleware.ts';
    const offenders = [...walk(src)].filter(isCode).map(rel).filter((p) => !allowed(p) && portalImport.test(read(p)));
    expect(offenders).toEqual([]);
  });

  it('portal code never imports public-site-only modules', () => {
    const publicImport = /from\s+['"]@\/(?:components\/(?:layout|home|cart|products|blog|locations|glossary|calculator|search|seo|shared|legal|wholesale)|context|data|hooks|utils|content)\b/;
    const portalFiles = [...walk(src)].filter(isCode).map(rel).filter((p) => p.startsWith('src/app/(portal)/') || p.startsWith('src/components/portal/') || p.startsWith('src/lib/portal/') || p.startsWith('src/portal/'));
    expect(portalFiles.length).toBeGreaterThan(30);
    expect(portalFiles.filter((p) => publicImport.test(read(p)))).toEqual([]);
  });
});

describe('portal pages carry no marketing or analytics code', () => {
  const portalFiles = () => [...walk(src)].filter(isCode).map(rel).filter((p) => p.startsWith('src/app/(portal)/') || p.startsWith('src/components/portal/') || p.startsWith('src/portal/') || p.startsWith('src/lib/portal/'));

  it('no GA, Clarity, WhatsApp or tracking references', () => {
    const banned = /googletagmanager|google-analytics|gtag\(|clarity\.ms|FloatingWhatsApp|wa\.me|NEXT_PUBLIC_GA_ID|SmoothScrollProvider/i;
    expect(portalFiles().filter((p) => banned.test(read(p)))).toEqual([]);
  });
  it('the portal layout does not load the public globals.css', () => {
    const layout = read('src', 'app', '(portal)', 'layout.tsx');
    expect(layout).not.toMatch(/globals\.css/);
    expect(layout).toContain("import './portal.css'");
  });
  it('the portal layout declares noindex and dynamic rendering', () => {
    const layout = read('src', 'app', '(portal)', 'layout.tsx');
    expect(layout).toMatch(/index:\s*false/);
    expect(layout).toContain("export const dynamic = 'force-dynamic'");
  });
  it('no portal file reads a service-role credential or environment secrets', () => {
    const banned = /SERVICE_ROLE|service_role_key|SUPABASE_SECRET|process\.env\.(?!NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|PORTAL_ENABLED|NODE_ENV)/;
    const offenders = portalFiles().filter((p) => {
      const text = read(p);
      // The service-role mention in the config guard is the check that REJECTS such keys.
      return banned.test(text.replace(/service_role/g, '').replace(/looksLikeServiceKey/g, ''));
    });
    expect(offenders).toEqual([]);
  });
});
