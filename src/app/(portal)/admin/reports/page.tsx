import type { Metadata } from 'next';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminReport } from '@/lib/portal/aftersales/server';
import { REPORTS, cellText, defaultPeriod, periodOk, reportDef, toCsv } from '@/lib/portal/aftersales/model';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { CsvDownload } from '@/components/portal/csv-download';
import { Field, INPUT, one, type Sp } from '@/components/portal/commerce-ui';

export const metadata: Metadata = { title: portalCopy.admin.modules.reports.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/reports', 'org.read');
  const t = portalCopy.admin.modules.reports;
  const ctx = await getStaffAccessContext();
  const allowed = REPORTS.filter((r) => evaluateCapability(ctx, r.capability).allowed);
  const today = new Date();
  const def = reportDef(one(searchParams.report) ?? '');
  const chosen = def && allowed.some((r) => r.key === def.key) ? def : undefined;
  const dflt = defaultPeriod(today);
  const fromQ = one(searchParams.from) ?? dflt.from;
  const toQ = one(searchParams.to) ?? dflt.to;
  const periodValid = periodOk(fromQ, toQ, today);
  const result = chosen && (!chosen.usesPeriod || periodValid) ? await adminReport(chosen.key, chosen.usesPeriod ? fromQ : null, chosen.usesPeriod ? toQ : null) : null;
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <div className="space-y-4">
        <PortalCard title="Run a report">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Report">
              <select name="report" defaultValue={chosen?.key ?? ''} className={INPUT}>
                <option value="" disabled>Choose...</option>
                {allowed.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
              </select>
            </Field>
            <Field label="From"><input name="from" type="date" defaultValue={fromQ} className={INPUT} /></Field>
            <Field label="To"><input name="to" type="date" defaultValue={toQ} className={INPUT} /></Field>
            <button type="submit" className="portal-btn-quiet">Run</button>
          </form>
          {chosen ? <p className="mt-3 text-xs text-portal-muted">{chosen.description}{chosen.usesPeriod ? ' Uses the dates above (at most 366 days).' : ' Shows the position right now; the dates are ignored.'}</p>
            : <p className="mt-3 text-xs text-portal-muted">{allowed.length === 0 ? 'Your role cannot run any report.' : 'Choose a report. Every run is recorded in the audit log.'}</p>}
        </PortalCard>

        {chosen && chosen.usesPeriod && !periodValid && <p role="alert" className="text-sm text-portal-danger">The dates are not valid: the start must not be after the end, and the period can be at most 366 days.</p>}
        {result && !result.ok && <p role="alert" className="text-sm text-portal-danger">{messageFor(result.code)}</p>}
        {chosen && result && result.ok && (
          <PortalCard title={chosen.title} actions={<CsvDownload filename={`${chosen.key}-${result.data.from}-${result.data.to}.csv`} csv={toCsv(chosen.columns, result.data.rows)} />}>
            {result.data.truncated && <p className="mb-3 text-xs text-portal-warning">Only the first 2000 rows are shown (and exported). Narrow the period to see the rest.</p>}
            {result.data.rows.length === 0 ? <p className="text-sm text-portal-muted">No rows for this report.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-portal-border text-xs text-portal-muted">
                      {chosen.columns.map((c) => <th key={c.key} scope="col" className={`py-2 pr-4 font-medium ${c.kind === 'cents' || c.kind === 'int' ? 'text-right' : ''}`}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-portal-border">
                    {result.data.rows.map((row, i) => (
                      <tr key={i}>
                        {chosen.columns.map((c) => (
                          <td key={c.key} className={`py-2 pr-4 text-portal-text ${c.kind === 'cents' || c.kind === 'int' ? 'text-right tabular-nums' : ''}`}>
                            {c.kind === 'cents' && typeof row[c.key] === 'number' ? `$${Number(cellText('cents', row[c.key])).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : cellText(c.kind, row[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PortalCard>
        )}
      </div>
    </>
  );
}
