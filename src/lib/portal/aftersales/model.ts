// Pure module (no server imports): the P9 rules in TypeScript, mirroring supabase/review/p9/20261111000600_p9_aftersales.sql. Tests pin the two together.

// ---------------------------------------------------------------------------------------------------------------- commissions
export const PAYOUT_METHODS = ['wire', 'zelle', 'ach', 'check', 'other'] as const;
export const REFERRAL_CODE = /^[A-Z0-9]{6,12}$/;
export const PLAN_CODE = /^[a-z0-9_]{2,40}$/;
export const MAX_RATE_BPS = 5000;
export const MAX_HOLD_DAYS = 90;
export const DEFAULT_HOLD_DAYS = 14;

/** Commission on a base amount: whole cents, rounded DOWN (the database does the same with integer division). */
export function commissionCents(baseCents: number, rateBps: number): number {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0 || !Number.isInteger(rateBps) || rateBps < 0 || rateBps > MAX_RATE_BPS) throw new RangeError('invalid commission inputs');
  return Math.floor((baseCents * rateBps) / 10000);
}

/** The moment an accrual becomes payable: the last confirmed payment plus the hold, in whole days. */
export function availableAt(paidAt: Date, holdDays: number): Date {
  if (!Number.isInteger(holdDays) || holdDays < 0 || holdDays > MAX_HOLD_DAYS) throw new RangeError('invalid hold');
  return new Date(paidAt.getTime() + holdDays * 86_400_000);
}

export function formatRate(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(2).replace(/0+$/, '')}%`;
}

export type LedgerEntry =
  | { type: 'accrual'; amountCents: number; availableAt: Date }
  | { type: 'adjustment'; amountCents: number }
  | { type: 'payout'; amountCents: number };

/** The balance split, exactly as private.comm_balance computes it. Payout entries are negative. */
export function commissionBalance(entries: readonly LedgerEntry[], now: Date): { pending: number; available: number; paidOut: number } {
  let pending = 0;
  let available = 0;
  let paidOut = 0;
  for (const e of entries) {
    if (e.type === 'accrual') {
      if (e.availableAt.getTime() > now.getTime()) pending += e.amountCents;
      else available += e.amountCents;
    } else {
      available += e.amountCents;
      if (e.type === 'payout') paidOut += -e.amountCents;
    }
  }
  return { pending, available, paidOut };
}

/** A payout can never exceed what is available (and must be at least one cent). */
export const payoutAllowed = (amountCents: number, availableCents: number): boolean => Number.isSafeInteger(amountCents) && amountCents >= 1 && amountCents <= availableCents;

// ---------------------------------------------------------------------------------------------------------------- notifications
export const TEMPLATE_KEYS = ['invoice_issued', 'payment_confirmed', 'payment_rejected', 'order_shipped', 'certificate_available', 'commission_payout'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export const TEMPLATE_VARS: Readonly<Record<TemplateKey, readonly string[]>> = {
  invoice_issued: ['invoice_number', 'total', 'due_date'],
  payment_confirmed: ['invoice_number', 'amount'],
  payment_rejected: ['invoice_number'],
  order_shipped: ['order_number', 'carrier', 'tracking_number'],
  certificate_available: ['title'],
  commission_payout: ['amount'],
};
export const CATEGORIES = ['billing', 'fulfillment', 'certificates', 'commissions'] as const;
export const OPTIONAL_CATEGORIES = ['fulfillment', 'certificates', 'commissions'] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];
export const CATEGORY_LABELS: Readonly<Record<OptionalCategory, string>> = {
  fulfillment: 'Shipping updates',
  certificates: 'New certificates of analysis',
  commissions: 'Commission payouts',
};
export const MAX_SEND_ATTEMPTS = 5;
export const VALUE_MAX = 200;

/** Fills {{placeholders}} from the fixed list of a template. Values are plain text: line breaks and tabs become one space, at most 200 characters. Other {{...}} text is left alone. */
export function renderTemplate(text: string, key: TemplateKey, vars: Readonly<Record<string, string>>): string {
  let out = text;
  for (const k of TEMPLATE_VARS[key]) out = out.split(`{{${k}}}`).join((vars[k] ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, VALUE_MAX));
  return out;
}

/** Placeholders in the text that are not in the template's list (the database refuses to save these). */
export function unknownPlaceholders(text: string, key: TemplateKey): string[] {
  const allowed = TEMPLATE_VARS[key];
  const bad = new Set<string>();
  for (const m of text.matchAll(/\{\{([^}]*)\}\}/g)) {
    const name = m[1] ?? '';
    if (!allowed.includes(name)) bad.add(name);
  }
  return [...bad];
}

/** Minutes to wait before attempt number attempt + 1 after a failed attempt (5 times the attempt number squared). */
export const retryDelayMinutes = (attemptsMade: number): number => 5 * attemptsMade * attemptsMade;
export type SendOutcome = 'sent' | 'retry' | 'failed';
export const outcomeAfterFailure = (attemptsMade: number): SendOutcome => (attemptsMade >= MAX_SEND_ATTEMPTS ? 'failed' : 'retry');

export const usd = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------------------------------------------- reports
export type ReportKey = 'sales' | 'receivables' | 'inventory' | 'commissions';
export type ColumnKind = 'text' | 'int' | 'cents' | 'date';
export type ReportColumn = { readonly key: string; readonly label: string; readonly kind: ColumnKind };
export type ReportDef = { readonly key: ReportKey; readonly title: string; readonly description: string; readonly usesPeriod: boolean; readonly capability: 'org.billing.read' | 'org.read'; readonly columns: readonly ReportColumn[] };

export const REPORTS: readonly ReportDef[] = [
  {
    key: 'sales', title: 'Sales by organization', description: 'Orders placed in the period, per organization. Cancelled orders are counted separately and excluded from the total.', usesPeriod: true, capability: 'org.billing.read',
    columns: [
      { key: 'organization_name', label: 'Organization', kind: 'text' }, { key: 'organization_code', label: 'Code', kind: 'text' }, { key: 'orders', label: 'Orders', kind: 'int' },
      { key: 'cancelled', label: 'Cancelled', kind: 'int' }, { key: 'total_cents', label: 'Total', kind: 'cents' },
    ],
  },
  {
    key: 'receivables', title: 'Receivables aging', description: 'Every unpaid invoice as of now, with its aging bucket.', usesPeriod: false, capability: 'org.billing.read',
    columns: [
      { key: 'organization_name', label: 'Organization', kind: 'text' }, { key: 'invoice_number', label: 'Invoice', kind: 'text' }, { key: 'issued_on', label: 'Issued', kind: 'date' },
      { key: 'due_on', label: 'Due', kind: 'date' }, { key: 'days_overdue', label: 'Days overdue', kind: 'int' }, { key: 'bucket', label: 'Bucket', kind: 'text' }, { key: 'remaining_cents', label: 'Remaining', kind: 'cents' },
    ],
  },
  {
    key: 'inventory', title: 'Inventory position', description: 'Stock of every approved product as of now: on hand, reserved, available and the next expiry.', usesPeriod: false, capability: 'org.read',
    columns: [
      { key: 'organization_name', label: 'Organization', kind: 'text' }, { key: 'external_sku', label: 'SKU', kind: 'text' }, { key: 'product_name', label: 'Product', kind: 'text' },
      { key: 'on_hand', label: 'On hand', kind: 'int' }, { key: 'reserved', label: 'Reserved', kind: 'int' }, { key: 'available', label: 'Available', kind: 'int' }, { key: 'next_expiry', label: 'Next expiry', kind: 'date' },
    ],
  },
  {
    key: 'commissions', title: 'Commissions', description: 'Accruals, adjustments and payouts in the period, with the current pending and available balance, per referring organization.', usesPeriod: true, capability: 'org.billing.read',
    columns: [
      { key: 'organization_name', label: 'Organization', kind: 'text' }, { key: 'accrued_cents', label: 'Accrued', kind: 'cents' }, { key: 'adjustments_cents', label: 'Adjustments', kind: 'cents' },
      { key: 'paid_out_cents', label: 'Paid out', kind: 'cents' }, { key: 'pending_cents', label: 'Pending', kind: 'cents' }, { key: 'available_cents', label: 'Available', kind: 'cents' },
    ],
  },
];
export const reportDef = (key: string): ReportDef | undefined => REPORTS.find((r) => r.key === key);
export const MAX_REPORT_ROWS = 2000;
export const MAX_PERIOD_DAYS = 366;

const dayMs = 86_400_000;
const parseDay = (s: string): number => Date.parse(`${s}T00:00:00Z`);
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
export const defaultPeriod = (today: Date): { from: string; to: string } => ({ from: isoDay(new Date(today.getTime() - 30 * dayMs)), to: isoDay(today) });
/** The same rules the database enforces: ordered, at most 366 days, not before 2020-01-01, not beyond tomorrow. */
export function periodOk(from: string, to: string, today: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const a = parseDay(from);
  const b = parseDay(to);
  if (Number.isNaN(a) || Number.isNaN(b) || isoDay(new Date(a)) !== from || isoDay(new Date(b)) !== to) return false;
  return a <= b && (b - a) / dayMs <= MAX_PERIOD_DAYS && a >= parseDay('2020-01-01') && b <= parseDay(isoDay(today)) + dayMs;
}

/** Text of one cell. Money is shown as dollars with two decimals; dates and text as they are. */
export function cellText(kind: ColumnKind, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (kind === 'cents') return typeof value === 'number' && Number.isFinite(value) ? (value / 100).toFixed(2) : '';
  if (kind === 'int') return typeof value === 'number' && Number.isFinite(value) ? String(Math.trunc(value)) : '';
  return String(value);
}

/**
 * CSV for a report. Spreadsheet programs run text that starts with = + - @ (or a tab or carriage return) as a FORMULA, so such text cells get a leading apostrophe; every cell is quoted
 * and quotes are doubled. Numbers (int and cents columns) are never altered, so a negative amount stays a number.
 */
export function toCsv(columns: readonly ReportColumn[], rows: readonly Record<string, unknown>[]): string {
  const cell = (kind: ColumnKind, v: unknown): string => {
    let t = cellText(kind, v);
    if ((kind === 'text' || kind === 'date') && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const head = columns.map((c) => cell('text', c.label)).join(',');
  return [head, ...rows.map((r) => columns.map((c) => cell(c.kind, r[c.key])).join(','))].join('\r\n') + '\r\n';
}
