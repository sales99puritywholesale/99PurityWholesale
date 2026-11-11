import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminFeeList, adminSettingsGet } from '@/lib/portal/admin-ops/server';
import { FEE_UNITS, FEE_UNIT_LABELS, SETTING_KEYS, SETTING_LABELS, feeIsCurrent, formatFee } from '@/lib/portal/admin-ops/model';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Field, Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import { retireFeeAction, saveFeeAction, saveSettingAction } from '../ops-actions';

export const metadata: Metadata = { title: portalCopy.admin.modules.settings.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/settings', 'flags.read');
  const t = portalCopy.admin.modules.settings;
  const ctx = await getStaffAccessContext();
  const canWrite = evaluateCapability(ctx, 'flags.write').allowed;
  const canFees = evaluateCapability(ctx, 'financial.write').allowed;
  const canSeeFees = evaluateCapability(ctx, 'org.billing.read').allowed;
  const [settings, fees] = await Promise.all([adminSettingsGet(), canSeeFees ? adminFeeList() : Promise.resolve(null)]);
  const today = new Date().toISOString().slice(0, 10);
  const rows = fees && fees.ok ? fees.data.fees : [];
  const current = rows.filter((f) => feeIsCurrent(f.effective_from, f.effective_to, today));
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <Flash sp={searchParams} stepUpNext="/admin/settings" />
      {!settings.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(settings.code)}</p>}
      <div className="space-y-4">
        {settings.ok && SETTING_KEYS.map((k) => (
          <PortalCard key={k} title={SETTING_LABELS[k].title}>
            <p className="mb-3 text-xs text-portal-muted">{SETTING_LABELS[k].hint}</p>
            {canWrite ? (
              <form action={saveSettingAction} className="space-y-3">
                <input type="hidden" name="key" value={k} />
                <textarea name="value" rows={5} maxLength={2000} defaultValue={settings.data.settings[k] ?? ''} className={INPUT} aria-label={SETTING_LABELS[k].title} />
                <button type="submit" className="portal-btn-quiet">Save (fresh code needed)</button>
              </form>
            ) : <p className="whitespace-pre-wrap text-sm text-portal-text">{settings.data.settings[k] || 'Not set.'}</p>}
          </PortalCard>
        ))}

        {fees && (
          <PortalCard title="Fee schedule" actions={<span className="text-xs text-portal-muted">{current.length} current fee{current.length === 1 ? '' : 's'}</span>}>
            {!fees.ok && <p role="alert" className="text-sm text-portal-danger">{messageFor(fees.code)}</p>}
            {rows.length === 0 && fees.ok && <p className="text-sm text-portal-muted">No fees yet. Customers see the current fees on their billing page.</p>}
            <ul className="divide-y divide-portal-border text-sm">
              {rows.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="text-portal-text">{f.name} <span className="portal-id text-xs">{f.code}</span> <span className="text-xs text-portal-muted">from {f.effective_from}{f.effective_to ? ` to ${f.effective_to}` : ''}{f.note ? `, ${f.note}` : ''}</span></span>
                  <span className="inline-flex items-center gap-2">
                    <span className="font-semibold text-portal-text">{formatFee(f.amount_cents, f.unit)}</span>
                    {feeIsCurrent(f.effective_from, f.effective_to, today) ? <PortalStatusPill label="Current" tone="success" /> : f.effective_to ? <PortalStatusPill label="Ended" tone="neutral" /> : <PortalStatusPill label="Scheduled" tone="info" />}
                    {canFees && f.effective_to === null && (
                      <form action={retireFeeAction} className="inline-flex items-center gap-1">
                        <input type="hidden" name="code" value={f.code} />
                        <input name="effectiveTo" type="date" required defaultValue={today} aria-label={`End date for ${f.name}`} className={`${INPUT} w-40`} />
                        <button type="submit" className="portal-btn-quiet">End fee</button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {canFees ? (
              <form action={saveFeeAction} className="mt-4 grid gap-3 border-t border-portal-border pt-4 sm:grid-cols-3">
                <p className="text-xs text-portal-muted sm:col-span-3">Saving a code that already exists replaces its price from the start date; the old price ends the day before and stays in the history. Needs a fresh authenticator code.</p>
                <Field label="Code (letters, digits, underscore)"><input name="code" required maxLength={40} placeholder="per_order_fee" className={INPUT} /></Field>
                <Field label="Name"><input name="name" required maxLength={120} className={INPUT} /></Field>
                <Field label="Amount (USD)"><input name="amount" required inputMode="decimal" placeholder="5.00" className={INPUT} /></Field>
                <Field label="Per"><select name="unit" className={INPUT} defaultValue="per_order">{FEE_UNITS.map((u) => <option key={u} value={u}>{FEE_UNIT_LABELS[u]}</option>)}</select></Field>
                <Field label="Starts on"><input name="effectiveFrom" type="date" required defaultValue={today} className={INPUT} /></Field>
                <Field label="Note (optional)"><input name="note" maxLength={300} className={INPUT} /></Field>
                <div className="sm:col-span-3"><button type="submit" className="portal-btn-quiet">Save fee (fresh code needed)</button></div>
              </form>
            ) : null}
          </PortalCard>
        )}

        {settings.ok && (
          <PortalCard title="Feature flags and compliance gates" actions={<Link href="/admin/fulfillment/gates" className="portal-btn-quiet">Open gates</Link>}>
            <ul className="space-y-1 text-sm text-portal-text">
              {Object.entries(settings.data.flags).map(([k, v]) => <li key={k}>{k}: <PortalStatusPill label={v ? 'On' : 'Off (locked until Gate G3)'} tone={v ? 'warning' : 'neutral'} /></li>)}
            </ul>
            <p className="mt-3 text-xs text-portal-muted">Gates: {Object.entries(settings.data.gates).map(([k, v]) => `${k} ${v === 'recorded' ? 'recorded' : 'not recorded'}`).join(', ')}.</p>
          </PortalCard>
        )}
      </div>
    </>
  );
}
