import type { CapabilityCode } from './capabilities';
import { evaluateAdminAccess, evaluateAnyCapability, type StaffAccessContext } from './evaluate';

/**
 * Which capability (any of) a staff member needs to SEE an admin navigation item. Visibility only: hiding a link is cosmetic,
 * every page and every mutation re-authorizes on the server and in the database.
 *
 * Default deny: an admin module that has no entry here is hidden from everyone until the milestone that introduces its
 * capability maps it. `overview` needs only a verified staff session.
 */
export const ADMIN_NAV_REQUIREMENTS: Readonly<Record<string, readonly CapabilityCode[] | 'staff-session'>> = {
  overview: 'staff-session',
  applications: ['applications.read.basic', 'applications.read.full'],
  organizations: ['org.read'],
  customers: ['profiles.read.basic', 'profiles.read.full'],
  // P3: catalog and pricing use the existing org.manage capability (admin); orders are read with org.read and changed with fulfillment.process (no new capability rows)
  products: ['org.manage'],
  pricing: ['org.manage'],
  orders: ['org.read'],
  fulfillment: ['fulfillment.process'],
  inventory: ['inventory.adjust'],
  invoices: ['payments.confirm', 'payments.reconcile', 'financial.write'],
  // P6 and P8: the integration screens and settings (visibility only; every page and every change is gated again by its own capability)
  integrations: ['fulfillment.process', 'org.manage'],
  settings: ['flags.read'],
  // P9: commissions are financial; notifications need the templates (flags.read) or the outbox (profiles.read.basic); reports are open to anyone who can read organizations
  // (each report is gated again by its own capability inside the database)
  commissions: ['org.billing.read'],
  notifications: ['flags.read', 'profiles.read.basic'],
  reports: ['org.read'],
  staff: ['staff.read'],
  audit: ['audit.read'],
};

export function canSeeAdminNavItem(ctx: StaffAccessContext, key: string): boolean {
  const requirement = Object.prototype.hasOwnProperty.call(ADMIN_NAV_REQUIREMENTS, key) ? ADMIN_NAV_REQUIREMENTS[key] : undefined;
  if (requirement === undefined) return false; // unmapped modules stay hidden
  if (requirement === 'staff-session') return evaluateAdminAccess(ctx).allowed;
  return evaluateAnyCapability(ctx, requirement).allowed;
}

export function filterAdminNav<T extends { readonly key: string }>(ctx: StaffAccessContext, items: readonly T[]): T[] {
  return items.filter((item) => canSeeAdminNavItem(ctx, item.key));
}
