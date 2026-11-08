import { portalCopy, type AdminModuleKey, type ClientModuleKey } from './copy';

export type PortalNavItem = { key: string; label: string; href: string };

const c = portalCopy.client.modules;
const a = portalCopy.admin.modules;

/**
 * Customer navigation. Order and labels reproduce the observed US Wholesale Peptides sidebar (flat text list, no icons).
 * Slugs follow docs/ARCHITECTURE.md section 5 (/client/purchases for invoices, /client/stock for inventory).
 * Hiding a link is cosmetic; every page re-checks access on the server.
 */
export const CLIENT_NAV: readonly (PortalNavItem & { key: 'overview' | ClientModuleKey })[] = [
  { key: 'overview', label: portalCopy.client.overview.title, href: '/client' },
  { key: 'shop', label: c.shop.title, href: '/client/shop' },
  { key: 'orders', label: c.orders.title, href: '/client/orders' },
  { key: 'invoices', label: c.invoices.title, href: '/client/purchases' },
  { key: 'billing', label: c.billing.title, href: '/client/billing' },
  { key: 'account', label: c.account.title, href: '/client/account' },
  { key: 'certificates', label: c.certificates.title, href: '/client/certificates' },
  { key: 'inventory', label: c.inventory.title, href: '/client/stock' },
  { key: 'commissions', label: c.commissions.title, href: '/client/commissions' },
  { key: 'fulfillment', label: c.fulfillment.title, href: '/client/fulfillment/setup' },
  { key: 'apiKeys', label: c.apiKeys.title, href: '/client/api-keys' },
  { key: 'apiDocs', label: c.apiDocs.title, href: '/client/docs' },
] as const;

/**
 * Admin navigation. PROPOSED modules (not observed in any USW screenshot); see docs/ADMIN-PORTAL-SPECIFICATION.md.
 * In P1 every admin route is denied to everyone.
 */
export const ADMIN_NAV: readonly (PortalNavItem & { key: AdminModuleKey })[] = [
  { key: 'overview', label: a.overview.title, href: '/admin' },
  { key: 'applications', label: a.applications.title, href: '/admin/applications' },
  { key: 'organizations', label: a.organizations.title, href: '/admin/organizations' },
  { key: 'customers', label: a.customers.title, href: '/admin/customers' },
  { key: 'products', label: a.products.title, href: '/admin/products' },
  { key: 'pricing', label: a.pricing.title, href: '/admin/pricing' },
  { key: 'orders', label: a.orders.title, href: '/admin/orders' },
  { key: 'invoices', label: a.invoices.title, href: '/admin/invoices' },
  { key: 'fulfillment', label: a.fulfillment.title, href: '/admin/fulfillment' },
  { key: 'inventory', label: a.inventory.title, href: '/admin/inventory' },
  { key: 'integrations', label: a.integrations.title, href: '/admin/integrations' },
  { key: 'reports', label: a.reports.title, href: '/admin/reports' },
  { key: 'settings', label: a.settings.title, href: '/admin/settings' },
] as const;

/** Exact match for the root item of an area, prefix match for the rest. */
export function isNavActive(itemHref: string, pathname: string, areaRoot: '/client' | '/admin'): boolean {
  if (itemHref === areaRoot) return pathname === areaRoot;
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}
