import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES, DEFAULT_HOLD_DAYS, MAX_HOLD_DAYS, MAX_RATE_BPS, MAX_SEND_ATTEMPTS, OPTIONAL_CATEGORIES, PAYOUT_METHODS, REFERRAL_CODE, REPORTS, TEMPLATE_KEYS, TEMPLATE_VARS, availableAt, cellText, commissionBalance,
  commissionCents, defaultPeriod, formatRate, outcomeAfterFailure, payoutAllowed, periodOk, renderTemplate, reportDef, retryDelayMinutes, toCsv, unknownPlaceholders, usd,
  type LedgerEntry, type TemplateKey,
} from '@/lib/portal/aftersales/model';
import {
  adjustSchema, certificatePublishSchema, certificateWithdrawSchema, enrollSchema, payoutSchema, planActiveSchema, planSaveSchema, prefSchema, referralEndSchema, referralLinkSchema, reportRequestSchema,
  templateSaveSchema,
} from '@/lib/portal/aftersales/schemas';
import { AFTERSALES_MESSAGES } from '@/lib/portal/aftersales/messages';
import { messageFor } from '@/lib/portal/commerce/messages';
import { dispatchOutbox, getEmailAdapter, type EmailAdapter, type OutboundEmail, type SendResult } from '@/lib/portal/aftersales/sender';
import { agingBucket } from '@/lib/portal/billing/invoices';

const sql = readFileSync(join(process.cwd(), 'supabase', 'review', 'p9', '20261111000600_p9_aftersales.sql'), 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = (name: string) => new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(code)?.[0] ?? '';
const id = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f';
const id2 = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

describe('commission arithmetic', () => {
  it('rounds down to whole cents and agrees with exact integer division', () => {
    expect(commissionCents(10_000, 500)).toBe(500);
    expect(commissionCents(999, 500)).toBe(49);
    expect(commissionCents(1, 5000)).toBe(0);
    expect(commissionCents(0, 100)).toBe(0);
    expect(commissionCents(1_000_000_000_000, MAX_RATE_BPS)).toBe(500_000_000_000);
    for (const [b, r] of [[123_456_789, 137], [987_654_321_012, 4999], [77, 1], [100_000, 250], [1_999_999, 3333]] as const) {
      expect(commissionCents(b, r)).toBe(Number((BigInt(b) * BigInt(r)) / 10000n));
    }
  });
  it('refuses rates above 50 percent, fractions and negative amounts', () => {
    for (const [b, r] of [[100, 5001], [100, -1], [-1, 100], [1.5, 100], [100, 1.5], [Number.MAX_SAFE_INTEGER + 1, 100]] as const) expect(() => commissionCents(b, r), `${b} ${r}`).toThrow(RangeError);
  });
  it('becomes payable after the hold, counted in whole days from the last confirmed payment', () => {
    expect(availableAt(new Date('2026-11-01T10:00:00Z'), DEFAULT_HOLD_DAYS).toISOString()).toBe('2026-11-15T10:00:00.000Z');
    expect(availableAt(new Date('2026-11-01T10:00:00Z'), 0).toISOString()).toBe('2026-11-01T10:00:00.000Z');
    expect(() => availableAt(new Date(), MAX_HOLD_DAYS + 1)).toThrow(RangeError);
    expect(() => availableAt(new Date(), -1)).toThrow(RangeError);
  });
  it('formats rates exactly', () => {
    expect([500, 250, 125, 5000, 1, 10].map(formatRate)).toEqual(['5%', '2.5%', '1.25%', '50%', '0.01%', '0.1%']);
  });
  it('splits the balance into pending, available and paid out exactly as the ledger function does', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    const entries: LedgerEntry[] = [
      { type: 'accrual', amountCents: 1000, availableAt: new Date('2026-11-10T00:00:00Z') },
      { type: 'accrual', amountCents: 500, availableAt: new Date('2026-11-25T00:00:00Z') },
      { type: 'accrual', amountCents: 300, availableAt: new Date('2026-11-20T00:00:00Z') },
      { type: 'adjustment', amountCents: -100 },
      { type: 'payout', amountCents: -400 },
    ];
    expect(commissionBalance(entries, now)).toEqual({ pending: 500, available: 800, paidOut: 400 });
    expect(commissionBalance([], now)).toEqual({ pending: 0, available: 0, paidOut: 0 });
  });
  it('a payout can never exceed the available balance or be below one cent', () => {
    expect(payoutAllowed(800, 800)).toBe(true);
    expect(payoutAllowed(801, 800)).toBe(false);
    expect(payoutAllowed(0, 800)).toBe(false);
    expect(payoutAllowed(1.5, 800)).toBe(false);
    expect(payoutAllowed(1, 0)).toBe(false);
  });
});

describe('notification templates', () => {
  it('fills only the placeholders of the template, as plain text without line breaks, at most 200 characters', () => {
    expect(renderTemplate('Invoice {{invoice_number}} for {{total}}', 'invoice_issued', { invoice_number: 'INV-1', total: '$5.00' })).toBe('Invoice INV-1 for $5.00');
    expect(renderTemplate('Hi {{title}}', 'certificate_available', { title: 'a\r\nBcc: x@evil.test\tz' })).toBe('Hi a Bcc: x@evil.test z');
    expect(renderTemplate('{{title}}', 'certificate_available', { title: 'x'.repeat(500) })).toHaveLength(200);
    expect(renderTemplate('{{total}} {{nope}}', 'payment_rejected', { total: 'x' })).toBe('{{total}} {{nope}}');
    expect(renderTemplate('{{amount}}', 'commission_payout', {})).toBe('');
  });
  it('finds placeholders that are not allowed for a template', () => {
    expect(unknownPlaceholders('{{invoice_number}} {{total}} {{due_date}}', 'invoice_issued')).toEqual([]);
    expect(unknownPlaceholders('{{invoice_number}} {{secret}} {{secret}} {{ }}', 'payment_rejected').sort()).toEqual([' ', 'secret']);
    expect(unknownPlaceholders('no placeholders', 'order_shipped')).toEqual([]);
  });
  it('retries after 5, 20, 45 and 80 minutes and gives up after five attempts', () => {
    expect([1, 2, 3, 4].map(retryDelayMinutes)).toEqual([5, 20, 45, 80]);
    expect(outcomeAfterFailure(MAX_SEND_ATTEMPTS - 1)).toBe('retry');
    expect(outcomeAfterFailure(MAX_SEND_ATTEMPTS)).toBe('failed');
  });
  it('formats dollars', () => {
    expect(usd(123_456)).toBe('$1,234.56');
    expect(usd(5)).toBe('$0.05');
  });
});

describe('the e-mail dispatch loop and the adapter', () => {
  const msg = (n: number): OutboundEmail => ({ id: `m${n}`, to: `u${n}@example.test`, subject: `s${n}`, body: `b${n}` });
  const adapter = (f: (m: OutboundEmail) => Promise<SendResult>): EmailAdapter => ({ name: 'fake', send: f });
  it('no provider is wired', () => {
    expect(getEmailAdapter()).toBeNull();
  });
  it('records every result: success, failure, a throwing adapter and a failed write-back', async () => {
    const recorded: [string, SendResult][] = [];
    const a = adapter(async (m) => {
      if (m.id === 'm2') return { ok: false, error: 'bounced' };
      if (m.id === 'm3') throw new Error('network down: secret details');
      return { ok: true, providerRef: `ref-${m.id}` };
    });
    const out = await dispatchOutbox(a, async () => [msg(1), msg(2), msg(3), msg(4)], async (mid, r) => { recorded.push([mid, r]); return mid !== 'm4'; });
    expect(out).toEqual({ claimed: 4, sent: 1, unsent: 2, recordFailures: 1 });
    expect(recorded.map(([mid]) => mid)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(recorded[0]![1]).toEqual({ ok: true, providerRef: 'ref-m1' });
    expect(recorded[2]![1]).toEqual({ ok: false, error: 'send failed' }); // the raw error text is never stored
  });
  it('does nothing when the claim fails or is empty', async () => {
    const a = adapter(async () => { throw new Error('must not be called'); });
    expect(await dispatchOutbox(a, async () => null, async () => true)).toEqual({ claimed: 0, sent: 0, unsent: 0, recordFailures: 0 });
    expect(await dispatchOutbox(a, async () => [], async () => true)).toEqual({ claimed: 0, sent: 0, unsent: 0, recordFailures: 0 });
  });
});

describe('reports and CSV', () => {
  it('the four reports have the expected shape, and only billing reports need billing access', () => {
    expect(REPORTS.map((r) => r.key)).toEqual(['sales', 'receivables', 'inventory', 'commissions']);
    expect(REPORTS.filter((r) => r.usesPeriod).map((r) => r.key)).toEqual(['sales', 'commissions']);
    expect(REPORTS.filter((r) => r.capability === 'org.read').map((r) => r.key)).toEqual(['inventory']);
    expect(reportDef('sales')?.columns.length).toBe(5);
    expect(reportDef('nope')).toBeUndefined();
    expect(reportDef('__proto__')).toBeUndefined();
  });
  it('accepts only ordered, bounded periods', () => {
    const today = new Date('2026-11-11T12:00:00Z');
    expect(defaultPeriod(today)).toEqual({ from: '2026-10-12', to: '2026-11-11' });
    expect(periodOk('2026-10-12', '2026-11-11', today)).toBe(true);
    expect(periodOk('2026-11-11', '2026-11-11', today)).toBe(true);
    expect(periodOk('2025-11-11', '2026-11-12', today)).toBe(true); // 366 days, ending tomorrow
    expect(periodOk('2025-11-10', '2026-11-11', today)).toBe(true); // exactly 366 days apart is the limit
    expect(periodOk('2025-11-09', '2026-11-11', today)).toBe(false); // 367 days
    expect(periodOk('2026-11-12', '2026-11-11', today)).toBe(false);
    expect(periodOk('2019-12-31', '2020-01-02', today)).toBe(false);
    expect(periodOk('2026-11-01', '2026-11-13', today)).toBe(false); // beyond tomorrow
    expect(periodOk('2026-02-30', '2026-03-01', today)).toBe(false);
    expect(periodOk('yesterday', 'today', today)).toBe(false);
  });
  it('shows money as dollars with two decimals and leaves empty values empty', () => {
    expect(cellText('cents', 123_456)).toBe('1234.56');
    expect(cellText('cents', -250)).toBe('-2.50');
    expect(cellText('cents', null)).toBe('');
    expect(cellText('int', 7.9)).toBe('7');
    expect(cellText('date', '2026-11-11')).toBe('2026-11-11');
    expect(cellText('cents', 'abc')).toBe('');
  });
  it('builds a safe CSV: quoted, doubled quotes, CRLF, and no spreadsheet formulas from text', () => {
    const cols = [{ key: 'n', label: 'Name', kind: 'text' as const }, { key: 'c', label: 'Total', kind: 'cents' as const }, { key: 'd', label: 'Day', kind: 'date' as const }];
    const csv = toCsv(cols, [
      { n: '=HYPERLINK("http://evil.test","x")', c: 100, d: '2026-11-11' },
      { n: '+1+1', c: -250, d: null },
      { n: '-2+3', c: 0, d: '@x' },
      { n: 'say "hi", ok', c: 5, d: '2026-01-01' },
      { n: '\tTAB', c: 1, d: '2026-01-01' },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"Name","Total","Day"');
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://evil.test"",""x"")","1.00","2026-11-11"`);
    expect(lines[2]).toBe(`"'+1+1","-2.50",""`);
    expect(lines[3]).toBe(`"'-2+3","0.00","'@x"`);
    expect(lines[4]).toBe('"say ""hi"", ok","0.05","2026-01-01"');
    expect(lines[5]).toBe(`"'\tTAB","0.01","2026-01-01"`);
    expect(lines[6]).toBe('');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('validation', () => {
  it('certificates need a lot or an order; withdrawing needs a reason', () => {
    expect(certificatePublishSchema.safeParse({ organizationId: id, title: 'COA', lotId: id2 }).success).toBe(true);
    expect(certificatePublishSchema.safeParse({ organizationId: id, title: 'COA', orderId: id2, issuedOn: '2026-11-01' }).success).toBe(true);
    expect(certificatePublishSchema.safeParse({ organizationId: id, title: 'COA' }).success).toBe(false);
    expect(certificatePublishSchema.safeParse({ organizationId: id, title: '', lotId: id2 }).success).toBe(false);
    expect(certificatePublishSchema.safeParse({ organizationId: id, title: 'x'.repeat(161), lotId: id2 }).success).toBe(false);
    expect(certificatePublishSchema.safeParse({ organizationId: id, title: 'COA', lotId: id2, extra: 1 }).success).toBe(false);
    expect(certificateWithdrawSchema.safeParse({ id, reason: 'wrong lot' }).success).toBe(true);
    expect(certificateWithdrawSchema.safeParse({ id, reason: ' ' }).success).toBe(false);
  });
  it('plans: bounded rate and hold, code format; referral codes are upper-cased and 6 to 12 characters', () => {
    expect(planSaveSchema.safeParse({ code: 'standard_5', name: 'Standard', rateBps: 500, holdDays: 14 }).success).toBe(true);
    for (const over of [{ rateBps: 0 }, { rateBps: 5001 }, { rateBps: 1.5 }, { holdDays: -1 }, { holdDays: 91 }, { code: 'Bad Code' }, { name: '' }]) expect(planSaveSchema.safeParse({ code: 'ok_code', name: 'N', rateBps: 500, holdDays: 14, ...over }).success).toBe(false);
    expect(planActiveSchema.safeParse({ planId: id, active: false }).success).toBe(true);
    expect(enrollSchema.safeParse({ organizationId: id, planId: id2 }).success).toBe(true);
    const ok = referralLinkSchema.safeParse({ referredOrgId: id, code: ' ab12cd34 ' });
    expect(ok.success && ok.data.code).toBe('AB12CD34');
    for (const c of ['abc', 'ABCDEFGHIJKLM', 'AB-12345', '']) expect(referralLinkSchema.safeParse({ referredOrgId: id, code: c }).success, c).toBe(false);
    expect(referralEndSchema.safeParse({ id, reason: 'left the program' }).success).toBe(true);
    expect(REFERRAL_CODE.test('AB12CD34')).toBe(true);
  });
  it('payouts need exact positive cents, a known method and a date; adjustments are signed but never zero', () => {
    const p = { organizationId: id, amountCents: 10_000, method: 'wire', paidOn: '2026-11-11', idempotencyKey: id2 };
    expect(payoutSchema.safeParse(p).success).toBe(true);
    for (const over of [{ amountCents: 0 }, { amountCents: -5 }, { amountCents: 1.5 }, { amountCents: 1_000_000_000_001 }, { method: 'bitcoin' }, { paidOn: '11/11/2026' }, { idempotencyKey: 'x' }]) expect(payoutSchema.safeParse({ ...p, ...over }).success).toBe(false);
    expect([...PAYOUT_METHODS]).toEqual(['wire', 'zelle', 'ach', 'check', 'other']);
    const a = { organizationId: id, amountCents: -2500, reason: 'billing error', idempotencyKey: id2 };
    expect(adjustSchema.safeParse(a).success).toBe(true);
    expect(adjustSchema.safeParse({ ...a, amountCents: 2500 }).success).toBe(true);
    expect(adjustSchema.safeParse({ ...a, amountCents: 0 }).success).toBe(false);
    expect(adjustSchema.safeParse({ ...a, reason: '' }).success).toBe(false);
  });
  it('preferences cover the optional categories only (billing cannot be switched off); templates need one-line subjects', () => {
    expect([...OPTIONAL_CATEGORIES]).toEqual(['fulfillment', 'certificates', 'commissions']);
    expect(prefSchema.safeParse({ category: 'certificates', enabled: false }).success).toBe(true);
    expect(prefSchema.safeParse({ category: 'billing', enabled: false }).success).toBe(false);
    expect(templateSaveSchema.safeParse({ key: 'order_shipped', subject: 'Shipped', body: 'Body' }).success).toBe(true);
    expect(templateSaveSchema.safeParse({ key: 'order_shipped', subject: 'Line\nbreak', body: 'Body' }).success).toBe(false);
    expect(templateSaveSchema.safeParse({ key: 'made_up', subject: 'S', body: 'B' }).success).toBe(false);
    expect(templateSaveSchema.safeParse({ key: 'order_shipped', subject: 'S', body: 'x'.repeat(4001) }).success).toBe(false);
  });
  it('report requests: known report, both dates or none, a valid period', () => {
    expect(reportRequestSchema.safeParse({ report: 'sales' }).success).toBe(true);
    expect(reportRequestSchema.safeParse({ report: 'sales', from: '2026-10-01', to: '2026-10-31' }).success).toBe(true);
    expect(reportRequestSchema.safeParse({ report: 'sales', from: '2026-10-01' }).success).toBe(false);
    expect(reportRequestSchema.safeParse({ report: 'payroll' }).success).toBe(false);
    expect(reportRequestSchema.safeParse({ report: 'sales', from: '2026-10-31', to: '2026-10-01' }).success).toBe(false);
  });
});

describe('messages', () => {
  it('every P9 result code resolves in the shared banner and never echoes input', () => {
    for (const [c, text] of Object.entries(AFTERSALES_MESSAGES)) {
      expect(messageFor(c), c).toBe(text);
      expect(text.length, c).toBeGreaterThan(10);
    }
    expect(messageFor('insufficient_commission')).toMatch(/available commission balance/);
    expect(messageFor('no_provider')).toMatch(/nothing was sent/);
    expect(messageFor('relation "email_outbox" does not exist')).toBe('Something went wrong. Please try again.');
  });
  it('does not take over a code another module already uses', async () => {
    const others = await Promise.all([import('@/lib/portal/billing/messages'), import('@/lib/portal/onboarding/messages'), import('@/lib/portal/integrations/messages'), import('@/lib/portal/inventory/messages'), import('@/lib/portal/admin-ops/messages')]);
    const taken = new Set(others.flatMap((m) => Object.values(m).flatMap((t) => Object.keys(t as Record<string, string>))));
    for (const c of Object.keys(AFTERSALES_MESSAGES)) expect(taken.has(c), c).toBe(false);
  });
});

describe('the SQL draft and the TypeScript model agree', () => {
  it('template keys, categories and placeholders', () => {
    const keys = /key\s+text primary key check \(key in \(([^)]*)\)\)/.exec(code)?.[1]?.match(/'[a-z_]+'/g)?.map((x) => x.slice(1, -1)) ?? [];
    expect(keys).toEqual([...TEMPLATE_KEYS]);
    const cats = /category\s+text not null check \(category in \(([^)]*)\)\),\s+subject/.exec(code)?.[1]?.match(/'[a-z]+'/g)?.map((x) => x.slice(1, -1)) ?? [];
    expect(cats).toEqual([...CATEGORIES]);
    const fnBody = /create function private\.notif_vars[\s\S]*?\$\$;/.exec(code)?.[0] ?? '';
    for (const k of TEMPLATE_KEYS) {
      const m = new RegExp(`when '${k}' then array\\[([^\\]]*)\\]`).exec(fnBody)?.[1] ?? '';
      expect(m.match(/'[a-z_]+'/g)?.map((x) => x.slice(1, -1)) ?? [], k).toEqual([...TEMPLATE_VARS[k]]);
    }
  });
  it('the seeded template texts use only the placeholders of their own template', () => {
    const seeds = [...code.matchAll(/\('([a-z_]+)', '([a-z]+)', '((?:[^']|'')*)',\s*E'((?:[^']|'')*)'\)/g)];
    expect(seeds.map((m) => m[1])).toEqual([...TEMPLATE_KEYS]);
    for (const m of seeds) expect(unknownPlaceholders(`${m[3]} ${m[4]}`, m[1] as TemplateKey), m[1]).toEqual([]);
  });
  it('limits and formats: rates, holds, referral codes, payout methods, retry schedule', () => {
    expect(code).toMatch(new RegExp(`rate_bps\\s+integer not null check \\(rate_bps between 1 and ${MAX_RATE_BPS}\\)`));
    expect(code).toMatch(new RegExp(`hold_days\\s+integer not null default ${DEFAULT_HOLD_DAYS} check \\(hold_days between 0 and ${MAX_HOLD_DAYS}\\)`));
    expect(code).toContain(`code ~ '${REFERRAL_CODE.source}'`);
    const methods = /method\s+text not null check \(method in \(([^)]*)\)\)/.exec(code)?.[1]?.match(/'[a-z]+'/g)?.map((x) => x.slice(1, -1)) ?? [];
    expect(methods).toEqual([...PAYOUT_METHODS]);
    const rec = fn('rpc_admin_outbox_record');
    expect(rec).toMatch(new RegExp(`v_row\\.attempts >= ${MAX_SEND_ATTEMPTS}`));
    expect(rec).toMatch(/make_interval\(mins => 5 \* v_row\.attempts \* v_row\.attempts\)/);
    expect(retryDelayMinutes(3)).toBe(45);
  });
  it('every report column key is produced by the report query, and the receivables buckets equal the invoice model', () => {
    const body = fn('rpc_admin_report');
    for (const r of REPORTS) for (const c of r.columns) expect(body, `${r.key}.${c.key}`).toContain(`'${c.key}'`);
    expect(body).toMatch(/case when d\.days <= 0 then 'current' when d\.days <= 30 then '1-30' when d\.days <= 60 then '31-60' when d\.days <= 90 then '61-90' else '90\+' end/);
    const due = new Date('2026-10-01T00:00:00Z');
    expect([0, 1, 30, 31, 60, 61, 90, 91].map((d) => agingBucket('open', due, new Date(due.getTime() + d * 86_400_000)))).toEqual(['current', '1-30', '1-30', '31-60', '31-60', '61-90', '61-90', '90+']);
    expect(body).toMatch(/limit 2001/);
    expect(body).toMatch(/v_rows - 2000/);
    expect(body).toMatch(/v_to - v_from > 366/);
  });
  it('the commission formula and hold in SQL are the ones tested here', () => {
    const b = fn('rpc_admin_commissions_accrue');
    expect(b).toMatch(/\(q\.base_cents \* q\.rate_bps\) \/ 10000/);
    expect(b).toMatch(/q\.paid_at \+ make_interval\(days => q\.hold_days\)/);
  });
});
