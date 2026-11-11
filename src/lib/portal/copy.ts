/**
 * All user-facing portal text lives here (English only in P1). Components read from this object and never hard-code
 * strings, so a later milestone can move it into next-intl message files (EN/ES) without touching component logic.
 *
 * Rules: portal copy follows project-rules.md (research-grade / laboratory-use language, professional B2B tone, no outcome
 * claims). Module descriptions below describe software capabilities only.
 */
export const portalCopy = {
  brand: { name: '99 Purity Wholesale', area: { client: 'Customer portal', admin: 'Operations portal' } },
  common: {
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    skipToContent: 'Skip to content',
    openMenu: 'Open navigation menu',
    closeMenu: 'Close navigation menu',
    primaryNav: 'Primary navigation',
    breadcrumbs: 'Breadcrumb',
    portalRoot: 'Portal',
    notConnected: 'Not connected yet',
    notConnectedNote: 'Data for this module is not connected yet. Nothing on this page is live information.',
    loading: 'Loading',
    errorTitle: 'Something went wrong',
    errorBody: 'This page could not be displayed. Please try again. If the problem continues, contact your account manager.',
    retry: 'Try again',
    notFoundTitle: 'Page not found',
    notFoundBody: 'The page you requested does not exist or is not available.',
    backToPortal: 'Back to the portal',
    sidebarFooter: 'Questions? Contact your account manager.',
    accountMenu: 'Account menu',
  },
  login: {
    title: 'Sign in',
    eyebrow: 'Wholesale portal',
    description: 'Sign in with the email address and password for your account.',
    email: 'Email address',
    password: 'Password',
    submit: 'Sign in',
    noSignup: 'Accounts are created by invitation or after an approved wholesale application. Contact your account manager for access.',
    errors: {
      invalid_input: 'Enter a valid email address and your password.',
      invalid_credentials: 'The email address or password is incorrect.',
      rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
      callback: 'The sign-in link could not be verified. Please sign in again.',
      unavailable: 'Sign-in is temporarily unavailable. Please try again later.',
    },
  },
  client: {
    overview: {
      title: 'Overview',
      description: 'A summary of your account activity.',
      banner: 'Preview foundation: the cards below are placeholders and are not connected to account data yet.',
      cards: {
        invoices: { title: 'Unpaid invoices', hint: 'Count and amount due appear here once invoicing is connected.' },
        setup: { title: 'Fulfillment setup', hint: 'Progress through the nine setup steps appears here.' },
        orders: { title: 'Recent orders', hint: 'Your latest orders and their status appear here.' },
        stock: { title: 'Stock summary', hint: 'Available and owned inventory appears here.' },
      },
    },
    modules: {
      shop: { title: 'Shop', description: 'Browse the wholesale catalog and place orders.', empty: 'The wholesale catalog is not connected yet.' },
      orders: { title: 'Orders', description: 'Track every order from placement to delivery.', empty: 'You have no orders to show yet.' },
      invoices: { title: 'Invoices & Payments', description: 'View invoices and report payments.', empty: 'No invoices are connected yet.' },
      billing: { title: 'Billing', description: 'Statements, payment history and the fee schedule.', empty: 'Billing information is not connected yet.' },
      account: { title: 'Account', description: 'Your company profile, team and account terms.', empty: 'Account management is not connected yet.' },
      certificates: { title: 'Certificates', description: 'Certificates of analysis for your orders.', empty: 'No certificates are available yet.' },
      inventory: { title: 'Inventory', description: 'Stock held for your account.', empty: 'No inventory is connected yet.' },
      commissions: { title: 'Commissions', description: 'Referral earnings and payouts, where enabled for your account.', empty: 'No commissions yet.' },
      fulfillment: { title: 'Fulfillment Setup', description: 'Complete the steps to start fulfillment services.', empty: 'Fulfillment setup is not connected yet.' },
      apiKeys: { title: 'API Keys', description: 'Create and manage keys for system integrations.', empty: 'API keys are not available yet.' },
      apiDocs: { title: 'API Docs', description: 'Documentation for integrating your systems.', empty: 'API documentation is not available yet.' },
    },
  },
  admin: {
    denied: {
      title: 'Access restricted',
      body: 'Operations access is not enabled for this account. Staff authorization is not available yet.',
    },
    modules: {
      overview: { title: 'Overview', description: 'Operations summary.', empty: 'Operations dashboards are not connected yet.' },
      applications: { title: 'Applications', description: 'Review wholesale account applications.', empty: 'Applications are not connected yet.' },
      organizations: { title: 'Organizations', description: 'Customer organizations and terms.', empty: 'Organizations are not connected yet.' },
      customers: { title: 'Customers', description: 'Customer users and access.', empty: 'Customers are not connected yet.' },
      products: { title: 'Products', description: 'Wholesale product catalog management.', empty: 'The product catalog is not connected yet.' },
      pricing: { title: 'Catalogs & Pricing', description: 'Price lists and customer assignments.', empty: 'Pricing is not connected yet.' },
      orders: { title: 'Orders', description: 'Order queues and processing.', empty: 'Orders are not connected yet.' },
      invoices: { title: 'Invoices & Payments', description: 'Invoicing and payment reconciliation.', empty: 'Invoicing is not connected yet.' },
      fulfillment: { title: 'Fulfillment', description: 'Fulfillment onboarding and operations.', empty: 'Fulfillment is not connected yet.' },
      inventory: { title: 'Inventory', description: 'Warehouse stock and movements.', empty: 'Inventory is not connected yet.' },
      integrations: { title: 'Integrations', description: 'API keys, webhooks and connections.', empty: 'Integrations are not connected yet.' },
      reports: { title: 'Reports', description: 'Sales, receivables, inventory and commission reports, with CSV export.', empty: 'Reports are not connected yet.' },
      commissions: { title: 'Commissions', description: 'Referral plans, codes, accruals and payouts.', empty: 'Commissions are not connected yet.' },
      notifications: { title: 'Notifications', description: 'E-mail templates and the outbox.', empty: 'Notifications are not connected yet.' },
      settings: { title: 'Settings', description: 'Payment instructions, fee schedule, feature flags and compliance.', empty: 'Settings are not connected yet.' },
      staff: { title: 'Staff', description: 'Team members and roles.', empty: 'Staff is not connected yet.' },
      audit: { title: 'Audit log', description: 'Who did what, and when.', empty: 'The audit log is not connected yet.' },
    },
  },
} as const;

export type PortalCopy = typeof portalCopy;
export type ClientModuleKey = keyof PortalCopy['client']['modules'];
export type AdminModuleKey = keyof PortalCopy['admin']['modules'];
export type LoginErrorCode = keyof PortalCopy['login']['errors'];

export function isLoginErrorCode(value: unknown): value is LoginErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(portalCopy.login.errors, value);
}
