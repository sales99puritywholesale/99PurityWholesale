/**
 * P4 invoice and payment model (pure: no server imports). Mirrors the P4 migration draft (supabase/review/p4/); the database is authoritative.
 * Money is integer cents. A customer can only REPORT a payment; only staff with `payments.confirm` can confirm one, and only the confirm RPC moves an invoice's paid amount.
 */
export const INVOICE_STATUSES = ['open', 'partially_paid', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ['reported', 'confirmed', 'rejected', 'duplicate'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['wire', 'zelle', 'ach', 'check', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MAX_INVOICE_CENTS = 1_000_000_000_000;
/** At most this many unreviewed ("reported") payments per invoice: stops a customer flooding the reconciliation queue. */
export const MAX_PENDING_PAYMENTS_PER_INVOICE = 5;
export const DEFAULT_NET_DAYS = 30;

export const INVOICE_STATUS_LABELS: Readonly<Record<InvoiceStatus, string>> = {
  open: 'Waiting for payment',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  void: 'Void',
};
export const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatus, string>> = {
  reported: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
};
export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = { wire: 'Wire transfer', zelle: 'Zelle', ach: 'ACH', check: 'Check', other: 'Other' };

/** Reported payments move to exactly one final state; confirmed, rejected and duplicate never change again. */
export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  reported: ['confirmed', 'rejected', 'duplicate'],
  confirmed: [],
  rejected: [],
  duplicate: [],
};
export const canTransitionPayment = (from: PaymentStatus, to: PaymentStatus): boolean => PAYMENT_TRANSITIONS[from].includes(to);

export const isInvoiceStatus = (v: unknown): v is InvoiceStatus => typeof v === 'string' && (INVOICE_STATUSES as readonly string[]).includes(v);
export const isPaymentStatus = (v: unknown): v is PaymentStatus => typeof v === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(v);

/** Status derived from the totals (the same rule as the database check constraint). A void invoice stays void. */
export function deriveInvoiceStatus(totalCents: number, paidCents: number, voided = false): InvoiceStatus {
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(paidCents) || totalCents < 1 || totalCents > MAX_INVOICE_CENTS || paidCents < 0 || paidCents > totalCents) {
    throw new RangeError('invalid invoice amounts');
  }
  if (voided) {
    if (paidCents !== 0) throw new RangeError('a paid invoice cannot be voided');
    return 'void';
  }
  if (paidCents === 0) return 'open';
  return paidCents === totalCents ? 'paid' : 'partially_paid';
}

/** Amount still owed. Zero for paid and void invoices. */
export function balanceCents(status: InvoiceStatus, totalCents: number, paidCents: number): number {
  if (status === 'void') return 0;
  return Math.max(totalCents - paidCents, 0);
}

/** A confirmation is valid only for a payable invoice and an amount between 1 and the remaining balance (no overpayment, no credit in P4). */
export function canConfirmAmount(status: InvoiceStatus, totalCents: number, paidCents: number, confirmCents: number): boolean {
  return (status === 'open' || status === 'partially_paid') && Number.isSafeInteger(confirmCents) && confirmCents >= 1 && confirmCents <= balanceCents(status, totalCents, paidCents);
}

/** Payment terms are free text codes in the database (`prepay`, `net30`, `net_15`, ...). Prepay is due on receipt; `net<days>` adds days; anything else defaults to net 30. */
export function termsDays(terms: string): number {
  if (terms === 'prepay') return 0;
  const m = /^net_?([0-9]{1,3})$/.exec(terms);
  const days = m ? Number(m[1]) : DEFAULT_NET_DAYS;
  return days >= 0 && days <= 365 ? days : DEFAULT_NET_DAYS;
}
export function dueAt(issuedAt: Date, terms: string): Date {
  const d = new Date(issuedAt.getTime());
  d.setUTCDate(d.getUTCDate() + termsDays(terms));
  return d;
}

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';
/** Days past due -> aging bucket, used by the finance aging summary. Not past due (or paid/void) is `current`. */
export function agingBucket(status: InvoiceStatus, due: Date, now: Date): AgingBucket {
  if (status === 'paid' || status === 'void') return 'current';
  const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export const formatCents = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
