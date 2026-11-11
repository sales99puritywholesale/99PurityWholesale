/**
 * P8 admin-operations model (pure: no server imports). Mirrors the P8 migration draft (supabase/review/p8/); the database is authoritative.
 */
export const ORG_STATUSES = ['active', 'suspended', 'closed'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];
export const ORG_STATUS_LABELS: Readonly<Record<OrgStatus, string>> = { active: 'Active', suspended: 'Suspended', closed: 'Closed' };
export const ORG_STATUS_HINTS: Readonly<Record<OrgStatus, string>> = {
  active: 'The customer can shop, place orders and use the API.',
  suspended: 'The customer is blocked at once: no shop, no orders, API keys stop working. Nothing is deleted.',
  closed: 'Ends the relationship. Not allowed while invoices are unpaid or fulfillment orders are open.',
};

/** Payment terms: `prepay`, or `net<days>` / `net_<days>` with 0 to 365 days (the same rule as the database and as the invoice due date in billing/invoices.ts). */
const TERMS = /^(prepay|net_?[0-9]{1,3})$/;
export function isValidTerms(terms: string): boolean {
  if (!TERMS.test(terms)) return false;
  return terms === 'prepay' || Number(terms.replace(/[^0-9]/g, '')) <= 365;
}
export function termsLabel(terms: string): string {
  if (terms === 'prepay') return 'Prepay (due on receipt)';
  const m = /^net_?([0-9]{1,3})$/.exec(terms);
  return m ? `Net ${Number(m[1])} days` : terms;
}

export const APPLICATION_STATUSES = ['new', 'approved', 'rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = { new: 'New', approved: 'Approved', rejected: 'Rejected' };
/** Organization codes (same rule as organizations.code). */
export const ORG_CODE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
/** A suggested code from a company name: upper case letters and digits, at most 12 characters, with a numeric suffix when too short. Only a suggestion; staff edit it. */
export function suggestOrgCode(company: string): string {
  const base = company.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 12).replace(/-+$/g, '');
  const padded = base.length >= 3 ? base : `${base}${'001'}`.slice(0, 8);
  return ORG_CODE.test(padded) ? padded : 'NEW-001';
}

export const SETTING_KEYS = ['payment_instructions', 'invoice_footer'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export const SETTING_LABELS: Readonly<Record<SettingKey, { title: string; hint: string }>> = {
  payment_instructions: { title: 'Payment instructions', hint: 'Shown to customers on every invoice under "How to pay": bank or Zelle details and the reference to quote.' },
  invoice_footer: { title: 'Invoice footer', hint: 'A short note for the bottom of invoices (for example terms or a support contact).' },
};

export const FEE_UNITS = ['flat', 'per_order', 'per_unit', 'per_box', 'per_pallet', 'per_month'] as const;
export type FeeUnit = (typeof FEE_UNITS)[number];
export const FEE_UNIT_LABELS: Readonly<Record<FeeUnit, string>> = { flat: 'one-time', per_order: 'per order', per_unit: 'per unit', per_box: 'per box', per_pallet: 'per pallet', per_month: 'per month' };
export const formatFee = (amountCents: number, unit: FeeUnit): string => `$${(amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${FEE_UNIT_LABELS[unit]}`;
/** A fee is current on `today` when it has started and not ended (the end date itself still counts). Dates are YYYY-MM-DD. */
export const feeIsCurrent = (from: string, to: string | null, today: string): boolean => from <= today && (to === null || to >= today);
/** A new price must start after the row it replaces; the old row then ends the day before. */
export function closingDate(newFrom: string): string {
  const d = new Date(`${newFrom}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export const canReplaceFee = (openFrom: string, newFrom: string): boolean => newFrom > openFrom;

export const STAFF_ROLE_LABELS: Readonly<Record<string, string>> = { admin: 'Administrator', finance: 'Finance', operations: 'Operations', support: 'Support' };
export const STAFF_ROLE_SUMMARY: Readonly<Record<string, string>> = {
  admin: 'Everything, including pricing, organizations, staff, settings and go-live.',
  finance: 'Invoices, payment confirmation, billing data and fees. No product or order changes.',
  operations: 'Orders, fulfillment onboarding reviews, inventory and shipping. No billing.',
  support: 'Read-only basics: organizations, members and applications (basic fields).',
};

/** Audit action families offered as filters (a plain prefix; the database never treats it as a pattern). */
export const AUDIT_FILTERS: readonly { prefix: string; label: string }[] = [
  { prefix: '', label: 'Everything' },
  { prefix: 'staff.', label: 'Staff actions' },
  { prefix: 'order.', label: 'Orders placed' },
  { prefix: 'payment.', label: 'Payments reported' },
  { prefix: 'staff.payment.', label: 'Payment review' },
  { prefix: 'onboarding.', label: 'Customer setup' },
  { prefix: 'api.', label: 'API keys and webhooks' },
  { prefix: 'inventory.', label: 'Inbound shipments' },
  { prefix: 'staff.org.', label: 'Organization changes' },
  { prefix: 'staff.profiles.', label: 'Personal data reads' },
];
export const isAuditPrefix = (v: string): boolean => v === '' || (v.length <= 40 && /^[a-z._]+$/.test(v));

/** Share as a whole percent, 0 when the denominator is 0 (dashboard tiles). */
export const percent = (part: number, whole: number): number => (whole <= 0 ? 0 : Math.round((part / whole) * 100));
