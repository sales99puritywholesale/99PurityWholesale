import { describe, expect, it } from 'vitest';
import {
  agingBucket,
  balanceCents,
  canConfirmAmount,
  canTransitionPayment,
  deriveInvoiceStatus,
  dueAt,
  formatCents,
  PAYMENT_STATUSES,
  termsDays,
} from '@/lib/portal/billing/invoices';
import { confirmPaymentSchema, parseDollarsToCents, reportPaymentSchema } from '@/lib/portal/billing/schemas';
import { billingMessageFor } from '@/lib/portal/billing/messages';

const id = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f';

describe('P4 invoice status model', () => {
  it('derives status from totals', () => {
    expect(deriveInvoiceStatus(26460, 0)).toBe('open');
    expect(deriveInvoiceStatus(26460, 100)).toBe('partially_paid');
    expect(deriveInvoiceStatus(26460, 26460)).toBe('paid');
    expect(deriveInvoiceStatus(26460, 0, true)).toBe('void');
  });
  it('rejects impossible amounts and voiding a paid invoice', () => {
    expect(() => deriveInvoiceStatus(0, 0)).toThrow(RangeError);
    expect(() => deriveInvoiceStatus(100, 101)).toThrow(RangeError);
    expect(() => deriveInvoiceStatus(100, -1)).toThrow(RangeError);
    expect(() => deriveInvoiceStatus(100.5, 0)).toThrow(RangeError);
    expect(() => deriveInvoiceStatus(100, 50, true)).toThrow(RangeError);
  });
  it('balance is zero for paid and void', () => {
    expect(balanceCents('open', 1000, 0)).toBe(1000);
    expect(balanceCents('partially_paid', 1000, 400)).toBe(600);
    expect(balanceCents('paid', 1000, 1000)).toBe(0);
    expect(balanceCents('void', 1000, 0)).toBe(0);
  });
  it('confirmation is bounded by the remaining balance (no overpayment)', () => {
    expect(canConfirmAmount('open', 1000, 0, 1000)).toBe(true);
    expect(canConfirmAmount('open', 1000, 0, 1001)).toBe(false);
    expect(canConfirmAmount('partially_paid', 1000, 400, 600)).toBe(true);
    expect(canConfirmAmount('partially_paid', 1000, 400, 601)).toBe(false);
    expect(canConfirmAmount('paid', 1000, 1000, 1)).toBe(false);
    expect(canConfirmAmount('void', 1000, 0, 1)).toBe(false);
    expect(canConfirmAmount('open', 1000, 0, 0)).toBe(false);
    expect(canConfirmAmount('open', 1000, 0, 1.5)).toBe(false);
  });
});

describe('P4 payment lifecycle', () => {
  it('only a reported payment can be reviewed, once', () => {
    for (const to of ['confirmed', 'rejected', 'duplicate'] as const) expect(canTransitionPayment('reported', to)).toBe(true);
    for (const from of PAYMENT_STATUSES.filter((s) => s !== 'reported')) for (const to of PAYMENT_STATUSES) expect(canTransitionPayment(from, to)).toBe(false);
    expect(canTransitionPayment('reported', 'reported')).toBe(false);
  });
});

describe('P4 terms, due dates and aging', () => {
  it('maps terms to days', () => {
    expect(termsDays('prepay')).toBe(0);
    expect(termsDays('net30')).toBe(30);
    expect(termsDays('net_15')).toBe(15);
    expect(termsDays('net999')).toBe(30);
    expect(termsDays('whatever')).toBe(30);
  });
  it('computes due dates in UTC', () => {
    expect(dueAt(new Date('2026-11-11T10:00:00Z'), 'prepay').toISOString()).toBe('2026-11-11T10:00:00.000Z');
    expect(dueAt(new Date('2026-11-11T10:00:00Z'), 'net30').toISOString()).toBe('2026-12-11T10:00:00.000Z');
  });
  it('buckets aging', () => {
    const due = new Date('2026-10-01T00:00:00Z');
    const at = (d: number) => new Date(due.getTime() + d * 86_400_000);
    expect(agingBucket('open', due, at(0))).toBe('current');
    expect(agingBucket('open', due, at(1))).toBe('1-30');
    expect(agingBucket('open', due, at(31))).toBe('31-60');
    expect(agingBucket('partially_paid', due, at(61))).toBe('61-90');
    expect(agingBucket('open', due, at(91))).toBe('90+');
    expect(agingBucket('paid', due, at(200))).toBe('current');
    expect(agingBucket('void', due, at(200))).toBe('current');
  });
  it('formats cents exactly', () => {
    expect(formatCents(26460)).toBe('$264.60');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123456789)).toBe('$1,234,567.89');
  });
});

describe('P4 validation', () => {
  it('parses dollars to exact cents', () => {
    expect(parseDollarsToCents('264.60')).toBe(26460);
    expect(parseDollarsToCents('$1,234.5')).toBe(123450);
    expect(parseDollarsToCents('10')).toBe(1000);
    expect(parseDollarsToCents('0.10')).toBe(10);
    expect(parseDollarsToCents('0')).toBeNull();
    expect(parseDollarsToCents('-5')).toBeNull();
    expect(parseDollarsToCents('1.234')).toBeNull();
    expect(parseDollarsToCents('1e3')).toBeNull();
    expect(parseDollarsToCents('')).toBeNull();
  });
  it('report schema is strict and requires an idempotency key', () => {
    const ok = { organizationId: id, invoiceId: id, method: 'zelle', amountCents: 100, idempotencyKey: id };
    expect(reportPaymentSchema.safeParse(ok).success).toBe(true);
    expect(reportPaymentSchema.safeParse({ ...ok, status: 'confirmed' }).success).toBe(false);
    expect(reportPaymentSchema.safeParse({ ...ok, amountCents: 0 }).success).toBe(false);
    expect(reportPaymentSchema.safeParse({ ...ok, amountCents: 1.5 }).success).toBe(false);
    expect(reportPaymentSchema.safeParse({ ...ok, method: 'bitcoin' }).success).toBe(false);
    expect(reportPaymentSchema.safeParse({ ...ok, sentOn: '2026-13-45' }).success).toBe(false);
    const { idempotencyKey: _omit, ...noKey } = ok;
    expect(reportPaymentSchema.safeParse(noKey).success).toBe(false);
  });
  it('confirm schema needs an amount and a received date', () => {
    expect(confirmPaymentSchema.safeParse({ paymentId: id, confirmedCents: 100, receivedOn: '2026-11-11' }).success).toBe(true);
    expect(confirmPaymentSchema.safeParse({ paymentId: id, confirmedCents: 100 }).success).toBe(false);
  });
  it('unknown result codes get a generic message', () => {
    expect(billingMessageFor('exceeds_balance')).toMatch(/remaining balance/);
    expect(billingMessageFor('constructor')).toBe('Something went wrong. Please try again.');
    expect(billingMessageFor('some db error: relation x')).toBe('Something went wrong. Please try again.');
  });
});
