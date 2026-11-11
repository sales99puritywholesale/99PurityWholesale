import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { denyAllContext, parseStaffContext } from '@/lib/portal/permissions/context';
import type { StaffAccessContext } from '@/lib/portal/permissions/evaluate';

// Scenario tests for the P3 admin gate (src/lib/portal/staff-gate.ts) and for EVERY admin server action, with the authentication and the staff context mocked.
// They prove the application-side decision only (that no RPC is even attempted without the right database staff context). The database re-check
// (private.staff_gate in every staff RPC) is the second layer and is NOT exercised here: no database is involved.
const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'u@example.test' } as { id: string; email: string } | null,
  ctx: null as unknown,
  rpc: {
    adminVariantSetPrice: vi.fn(async () => ({ ok: true, data: {} })),
    adminProductSetStatus: vi.fn(async () => ({ ok: true, data: {} })),
    adminOrgCreate: vi.fn(async () => ({ ok: true, data: {} })),
    adminOrgMemberAdd: vi.fn(async () => ({ ok: true, data: {} })),
    adminMarkupRuleSet: vi.fn(async () => ({ ok: true, data: {} })),
    adminOrgProductSet: vi.fn(async () => ({ ok: true, data: {} })),
    adminOrderSetStatus: vi.fn(async () => ({ ok: true, data: {} })),
  },
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/portal/auth', () => ({
  requireUser: async (next: string) => {
    if (!h.user) throw new Error(`REDIRECT:/login?next=${next}`);
    return h.user;
  },
}));
// the real module is a .tsx file (JSX is not transformed by this unit-test setup); only its `back` helper is used by the actions
vi.mock('@/components/portal/commerce-ui', () => ({
  back: (path: string, params: Record<string, string>, outcome: { ok: boolean; code?: string }) => {
    const q = new URLSearchParams(params);
    if (outcome.ok) q.set('ok', '1');
    else q.set('e', String(outcome.code));
    return `${path}?${q.toString()}`;
  },
}));
vi.mock('@/lib/portal/staff-access', () => ({ getStaffAccessContext: async () => h.ctx }));
vi.mock('@/lib/portal/commerce/server', async (orig) => ({ ...(await orig<object>()), ...h.rpc }));

const ID = '3f0c1e0a-6b1d-4b8e-9f3a-2d5c7a9e1b11';
const ID2 = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const now = new Date('2026-11-10T12:00:00Z');
const staff = (roles: string[], over: Partial<{ staff_status: string; session_ok: boolean }> = {}): StaffAccessContext =>
  parseStaffContext({ staff_status: 'active', roles, session_ok: true, step_up_ok: true, last_totp_epoch: Math.floor(now.getTime() / 1000), ...over }, true, now);

const SCENARIOS: Record<string, { user: boolean; ctx: StaffAccessContext }> = {
  unauthenticated: { user: false, ctx: denyAllContext(false, now) },
  'normal customer (not staff)': { user: true, ctx: parseStaffContext({ staff_status: 'none', roles: [], session_ok: false, step_up_ok: false }, true, now) },
  'inactive (disabled) staff': { user: true, ctx: staff(['admin'], { staff_status: 'disabled' }) },
  'staff with an unverified session (no aal2 / approved factor)': { user: true, ctx: staff(['admin'], { session_ok: false }) },
  'staff with an unknown role': { user: true, ctx: staff(['superuser']) },
  'support (org.read only)': { user: true, ctx: staff(['support']) },
  'finance (org.read only)': { user: true, ctx: staff(['finance']) },
  'operations (org.read + fulfillment.process)': { user: true, ctx: staff(['operations']) },
  'admin (everything)': { user: true, ctx: staff(['admin']) },
};

// the capability each action needs, and the roles that hold it (from migration 0002 / capabilities.ts)
const ACTIONS: { name: string; cap: 'org.manage' | 'members.manage' | 'fulfillment.process'; allowed: string[]; form: Record<string, string>; rpc: keyof typeof h.rpc }[] = [
  { name: 'setVariantPriceAction', cap: 'org.manage', allowed: ['admin (everything)'], form: { variantId: ID, base: '10.00', floor: '' }, rpc: 'adminVariantSetPrice' },
  { name: 'setProductStatusAction', cap: 'org.manage', allowed: ['admin (everything)'], form: { productId: ID, status: 'archived' }, rpc: 'adminProductSetStatus' },
  { name: 'createOrgAction', cap: 'org.manage', allowed: ['admin (everything)'], form: { name: 'Lab', code: 'LAB-001' }, rpc: 'adminOrgCreate' },
  { name: 'addMemberAction', cap: 'members.manage', allowed: ['admin (everything)'], form: { organizationId: ID, email: 'a@example.test', role: 'member' }, rpc: 'adminOrgMemberAdd' },
  { name: 'setMarkupRuleAction', cap: 'org.manage', allowed: ['admin (everything)'], form: { organizationId: ID, kind: 'organization', productId: '', type: 'percent', value: '10', active: 'on' }, rpc: 'adminMarkupRuleSet' },
  { name: 'setOrgProductAction', cap: 'org.manage', allowed: ['admin (everything)'], form: { organizationId: ID, productId: ID2, mode: 'assign' }, rpc: 'adminOrgProductSet' },
  { name: 'setOrderStatusAction', cap: 'fulfillment.process', allowed: ['operations (org.read + fulfillment.process)', 'admin (everything)'], form: { orderId: ID, to: 'confirmed' }, rpc: 'adminOrderSetStatus' },
];
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  for (const f of Object.values(h.rpc)) f.mockClear();
});

describe('admin server actions: the staff context and capability are checked BEFORE any RPC call', () => {
  for (const a of ACTIONS) {
    describe(a.name, () => {
      for (const [label, sc] of Object.entries(SCENARIOS)) {
        const shouldRun = a.allowed.includes(label);
        it(`${label}: ${shouldRun ? 'reaches the RPC' : 'is refused and no RPC is called'}`, async () => {
          h.user = sc.user ? { id: 'u1', email: 'u@example.test' } : null;
          h.ctx = sc.ctx;
          const actions = await import('@/app/(portal)/admin/commerce-actions');
          const fn = (actions as unknown as Record<string, (f: FormData) => Promise<void>>)[a.name] as (f: FormData) => Promise<void>;
          let thrown = '';
          try {
            await fn(fd(a.form));
          } catch (e) {
            thrown = (e as Error).message;
          }
          if (shouldRun) {
            expect(h.rpc[a.rpc]).toHaveBeenCalledTimes(1);
            expect(thrown.startsWith('REDIRECT:/admin')).toBe(true); // success path redirects back to the admin page
          } else {
            expect(h.rpc[a.rpc]).not.toHaveBeenCalled();
            expect(thrown).toMatch(sc.user ? /^NOT_FOUND$/ : /^REDIRECT:\/login/);
          }
        });
      }
    });
  }
  it('every exported action of the admin actions file is covered by this matrix', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', '(portal)', 'admin', 'commerce-actions.ts'), 'utf8');
    const exported = [...src.matchAll(/export async function ([A-Za-z]+)\(/g)].map((m) => m[1]).sort();
    expect(exported).toEqual(ACTIONS.map((a) => a.name).sort());
  });
});

describe('admin pages and layout: static coverage (no page relies on middleware or on hidden links)', () => {
  const adminDir = join(process.cwd(), 'src', 'app', '(portal)', 'admin');
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const pages = walk(adminDir).filter((f) => /page\.tsx$/.test(f));
  it('finds the expected set of admin pages', () => {
    expect(pages.map((p) => relative(adminDir, p).replace(/\\/g, '/')).sort()).toEqual([
      'applications/page.tsx', 'audit/page.tsx', 'commissions/page.tsx', 'customers/page.tsx', 'fulfillment/[orgId]/page.tsx', 'fulfillment/gates/page.tsx', 'fulfillment/orders/[id]/page.tsx', 'fulfillment/orders/page.tsx', 'fulfillment/page.tsx', 'integrations/page.tsx', 'inventory/certificates/page.tsx', 'inventory/page.tsx', 'inventory/receipts/[id]/page.tsx', 'invoices/[id]/page.tsx', 'invoices/page.tsx', 'invoices/payments/page.tsx', 'notifications/page.tsx', 'orders/[id]/page.tsx', 'orders/page.tsx',
      'organizations/[id]/page.tsx', 'organizations/page.tsx', 'page.tsx', 'pricing/[orgId]/page.tsx', 'pricing/page.tsx', 'products/page.tsx', 'reports/page.tsx', 'settings/page.tsx', 'staff/page.tsx',
    ]);
  });
  it('every admin page performs its own server-side gate before reading any data (requireStaffCapability, or the fail-closed requireAdminAccess/AdminModulePage placeholder)', () => {
    for (const p of pages) {
      const src = readFileSync(p, 'utf8');
      const gated = /await requireStaffCapability\(/.test(src) || /<AdminModulePage\b/.test(src) || /await requireAdminAccess\(/.test(src);
      expect(gated, p).toBe(true);
      if (/requireStaffCapability/.test(src)) {
        const gate = src.indexOf('await requireStaffCapability(');
        const firstData = [...src.matchAll(/await (admin[A-Za-z]+|getStaffAccessContext)\(/g)].map((m) => m.index ?? Infinity);
        for (const i of firstData) expect(gate, `${p}: the gate must come first`).toBeLessThan(i);
      }
    }
  });
  it('the placeholder admin modules stay fail-closed for everyone (authorizeAdmin is unchanged)', () => {
    const auth = readFileSync(join(process.cwd(), 'src', 'lib', 'portal', 'auth.ts'), 'utf8');
    expect(auth).toMatch(/return \{ allowed: false, reason: 'staff-authorization-not-implemented' \}/);
  });
  it('the layout reads the staff context from the database and denies without a verified staff session; navigation is filtered by capability', () => {
    const l = readFileSync(join(adminDir, 'layout.tsx'), 'utf8');
    expect(l).toMatch(/evaluateAdminAccess\(ctx\)\.allowed/);
    expect(l).toMatch(/return <PortalAccessDenied \/>/);
    expect(l).toMatch(/filterAdminNav\(ctx, ADMIN_NAV\)/);
  });
  it('API routes: the public OG image generator plus the portal-owned integration routes (P6), and nothing else', () => {
    const api = walk(join(process.cwd(), 'src', 'app', 'api')).map((f) => relative(join(process.cwd(), 'src', 'app', 'api'), f).replace(/\\/g, '/')).sort();
    expect(api).toEqual(['cron/webhooks/route.ts', 'og/route.tsx', 'v1/orders/[ref]/route.ts', 'v1/orders/route.ts']);
  });
  it('every integration route delegates to a handler that authenticates itself (API key or cron secret): /api is outside the portal middleware, so no route relies on it', () => {
    const root = join(process.cwd(), 'src', 'app', 'api');
    const handlers = readFileSync(join(process.cwd(), 'src', 'lib', 'portal', 'integrations', 'handlers.ts'), 'utf8');
    for (const f of ['cron/webhooks/route.ts', 'v1/orders/[ref]/route.ts', 'v1/orders/route.ts']) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).toMatch(/from '@\/lib\/portal\/integrations\/handlers'/);
      expect(src, f).toMatch(/handle(CreateOrder|GetOrder|ListOrders|WebhookCron)\(/);
      expect(src, f).not.toMatch(/service_role|SERVICE_ROLE|createClient\(/);
    }
    for (const fnName of ['handleCreateOrder', 'handleGetOrder', 'handleListOrders']) {
      const body = new RegExp(`export async function ${fnName}\\([\\s\\S]*?\\n}\\n`).exec(handlers)?.[0] ?? '';
      expect(body, fnName).toMatch(/parseBearer\(req\.headers\.get\('authorization'\)\)/);
      expect(body.indexOf('parseBearer'), fnName).toBeLessThan(body.indexOf('deps.'));
    }
    expect(handlers).toMatch(/timingSafeEqual/);
    const anon = readFileSync(join(process.cwd(), 'src', 'lib', 'portal', 'integrations', 'anon-db.ts'), 'utf8');
    expect(anon).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(anon).toMatch(/requireSupabasePublicConfig\(\)/);
  });
});

describe('every RPC invocation is made with the caller session (no service role) and no staff RPC is reachable without the gate in the calling file', () => {
  const server = readFileSync(join(process.cwd(), 'src', 'lib', 'portal', 'commerce', 'server.ts'), 'utf8');
  it('uses only the per-request user client', () => {
    expect(server).toMatch(/createPortalServerClient\(\)/);
    expect(server).not.toMatch(/service_role|SERVICE_ROLE|createClient\(/);
  });
  it('staff RPC wrappers are imported only by gated files', () => {
    const roots = [join(process.cwd(), 'src', 'app'), join(process.cwd(), 'src', 'components')];
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    for (const f of roots.flatMap(walk).filter((x) => /\.(ts|tsx)$/.test(x))) {
      const src = readFileSync(f, 'utf8');
      if (/\badmin(Orgs|Org|Catalog|Variant|Product|Orders|Order)[A-Za-z]*\b[^;]*from '@\/lib\/portal\/commerce\/server'/s.test(src) || /import\s*\{[^}]*\badmin[A-Z][A-Za-z]*[^}]*\}\s*from '@\/lib\/portal\/commerce\/server'/s.test(src)) {
        expect(/requireStaffCapability\(/.test(src), f).toBe(true);
      }
    }
  });
  it('the customer RPC wrappers pass the organization id chosen from the user\'s own memberships, never a price', () => {
    expect(server).not.toMatch(/\bp_(price|total|unit|amount)/);
  });
});
