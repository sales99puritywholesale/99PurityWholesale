import type { Metadata } from 'next';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminOutboxList, adminTemplatesList } from '@/lib/portal/aftersales/server';
import { getEmailAdapter } from '@/lib/portal/aftersales/sender';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Field, Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import { dispatchOutboxAction, saveTemplateAction, scanNotificationsAction } from '../aftersales-actions';

export const metadata: Metadata = { title: 'Notifications' };

const TONE = { queued: 'warning', sending: 'info', sent: 'success', failed: 'danger' } as const;

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/notifications', 'flags.read');
  const ctx = await getStaffAccessContext();
  const canWriteTemplates = evaluateCapability(ctx, 'flags.write').allowed;
  const canScan = evaluateCapability(ctx, 'financial.write').allowed;
  const canDispatch = evaluateCapability(ctx, 'org.manage').allowed;
  const canSeeOutbox = evaluateCapability(ctx, 'profiles.read.basic').allowed;
  const [templates, outbox] = await Promise.all([adminTemplatesList(), canSeeOutbox ? adminOutboxList(null) : Promise.resolve(null)]);
  const provider = getEmailAdapter();
  return (
    <>
      <PortalPageHeader area="admin" title="Notifications" description="E-mail templates and the outbox of messages to customers." />
      <Flash sp={searchParams} stepUpNext="/admin/notifications" />
      <div className="space-y-4">
        <PortalCard title="Outbox" actions={<PortalStatusPill label={provider ? `Provider: ${provider.name}` : 'No e-mail provider connected'} tone={provider ? 'success' : 'warning'} />}>
          <p className="mb-3 text-xs text-portal-muted">
            Messages are created when a certificate is published or a commission payout is recorded, and by the scan below (invoices, payment reviews and shipped orders of the last 14 days). They go to the
            owners of the organization. {provider ? '' : 'Until a provider is connected, messages stay queued and nothing is sent.'}
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {canScan && <form action={scanNotificationsAction}><button type="submit" className="portal-btn-quiet">Scan for new events</button></form>}
            {canDispatch && <form action={dispatchOutboxAction}><button type="submit" className="portal-btn-quiet">Send queued messages</button></form>}
          </div>
          {outbox === null && <p className="text-sm text-portal-muted">Reading the outbox needs the customer-profile permission (it shows recipients&apos; addresses).</p>}
          {outbox && !outbox.ok && <p role="alert" className="text-sm text-portal-danger">{messageFor(outbox.code)}</p>}
          {outbox && outbox.ok && (
            <>
              <p className="mb-2 text-xs text-portal-muted">{(['queued', 'sending', 'sent', 'failed'] as const).map((s) => `${s}: ${outbox.data.counts[s] ?? 0}`).join(', ')}</p>
              {outbox.data.messages.length === 0 ? <p className="text-sm text-portal-muted">No messages yet.</p> : (
                <ul className="divide-y divide-portal-border text-sm">
                  {outbox.data.messages.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <span className="text-portal-text">{m.subject}<span className="block text-xs text-portal-muted">{m.recipient_email}, {m.organization_name}, {new Date(m.created_at).toISOString().slice(0, 16).replace('T', ' ')} UTC{m.attempts > 0 ? `, ${m.attempts} attempt${m.attempts === 1 ? '' : 's'}` : ''}{m.last_error ? `, ${m.last_error}` : ''}</span></span>
                      <PortalStatusPill label={m.status} tone={TONE[m.status]} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </PortalCard>

        <PortalCard title="Templates">
          <p className="mb-3 text-xs text-portal-muted">Plain text only. Use the {'{{placeholders}}'} listed for each message; other placeholders are refused. Billing messages cannot be switched off by customers.</p>
          {!templates.ok && <p role="alert" className="text-sm text-portal-danger">{messageFor(templates.code)}</p>}
          {templates.ok && (
            <div className="space-y-5">
              {templates.data.templates.map((t) => (
                <div key={t.key} className="border-b border-portal-border pb-4 last:border-b-0 last:pb-0">
                  <p className="text-sm font-semibold text-portal-text">{t.key} <span className="text-xs font-normal text-portal-muted">category {t.category}; placeholders: {t.variables.length > 0 ? t.variables.map((v) => `{{${v}}}`).join(' ') : 'none'}</span></p>
                  {canWriteTemplates ? (
                    <form action={saveTemplateAction} className="mt-2 space-y-2">
                      <input type="hidden" name="key" value={t.key} />
                      <Field label="Subject"><input name="subject" required maxLength={150} defaultValue={t.subject} className={INPUT} /></Field>
                      <Field label="Body"><textarea name="body" required rows={6} maxLength={4000} defaultValue={t.body} className={INPUT} /></Field>
                      <button type="submit" className="portal-btn-quiet">Save template (fresh code needed)</button>
                    </form>
                  ) : <pre className="mt-2 whitespace-pre-wrap text-xs text-portal-muted">{t.subject}{'\n\n'}{t.body}</pre>}
                </div>
              ))}
            </div>
          )}
        </PortalCard>
      </div>
    </>
  );
}
