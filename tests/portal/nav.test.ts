import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, CLIENT_NAV, isNavActive } from '@/lib/portal/nav';

const routeFile = (href: string) => join(process.cwd(), 'src', 'app', '(portal)', ...href.split('/').filter(Boolean), 'page.tsx');

describe('customer navigation', () => {
  it('has the observed 12 items in the observed order', () => {
    expect(CLIENT_NAV.map((i) => i.label)).toEqual([
      'Overview', 'Shop', 'Orders', 'Invoices & Payments', 'Billing', 'Account',
      'Certificates', 'Inventory', 'Commissions', 'Fulfillment Setup', 'API Keys', 'API Docs',
    ]);
  });
  it('uses the documented slugs and unique keys/hrefs', () => {
    expect(CLIENT_NAV.map((i) => i.href)).toEqual([
      '/client', '/client/shop', '/client/orders', '/client/purchases', '/client/billing', '/client/account',
      '/client/certificates', '/client/stock', '/client/commissions', '/client/fulfillment/setup', '/client/api-keys', '/client/docs',
    ]);
    expect(new Set(CLIENT_NAV.map((i) => i.key)).size).toBe(12);
    expect(new Set(CLIENT_NAV.map((i) => i.href)).size).toBe(12);
  });
  it('every item resolves to a real route file', () => {
    for (const item of CLIENT_NAV) expect(existsSync(routeFile(item.href)), item.href).toBe(true);
  });
});

describe('admin navigation', () => {
  it('has the 17 modules (the 13 proposed ones plus staff, audit, commissions and notifications), all under /admin', () => {
    expect(ADMIN_NAV).toHaveLength(17);
    for (const item of ADMIN_NAV) expect(item.href === '/admin' || item.href.startsWith('/admin/')).toBe(true);
    expect(new Set(ADMIN_NAV.map((i) => i.href)).size).toBe(17);
  });
  it('every item resolves to a real route file', () => {
    for (const item of ADMIN_NAV) expect(existsSync(routeFile(item.href)), item.href).toBe(true);
  });
  it('shares no href with the customer navigation', () => {
    const client = new Set(CLIENT_NAV.map((i) => i.href));
    for (const item of ADMIN_NAV) expect(client.has(item.href)).toBe(false);
  });
});

describe('isNavActive', () => {
  it('matches the area root exactly and other items by prefix', () => {
    expect(isNavActive('/client', '/client', '/client')).toBe(true);
    expect(isNavActive('/client', '/client/orders', '/client')).toBe(false);
    expect(isNavActive('/client/orders', '/client/orders', '/client')).toBe(true);
    expect(isNavActive('/client/orders', '/client/orders/123', '/client')).toBe(true);
    expect(isNavActive('/client/orders', '/client/orders-archive', '/client')).toBe(false);
    expect(isNavActive('/client/fulfillment/setup', '/client/fulfillment/setup/3', '/client')).toBe(true);
  });
});
