import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminApiKeysList, adminDeliveriesOverview } from '@/lib/portal/integrations/server';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { OneTimeSecretForm } from '@/components/portal/one-time-secret';
import { dateOnly } from '@/components/portal/billing-ui';
import { Flash, type Sp } from '@/components/portal/commerce-ui';
import { adminRevokeKeyAction, createWorkerTokenAction } from '../integrations-actions';

export const metadata: Metadata = { title: portalCopy.admin.modules.integrations.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/integrations', 'org.read');
  const t = portalCopy.admin.modules.integrations;
  const [keys, overview] = await Promise.all([adminApiKeysList(), adminDeliveriesOverview()]);
  const ctx = await getStaffAccessContext();
  const canRevoke = evaluateCapability(ctx, 'org.manage').allowed;
  const canToken = evaluateCapability(ctx, 'flags.write').allowed;
  return (
    <>
      <PortalPageHeader area="admin" title={t.title} description={t.description} />
      <Flash sp={searchParams} stepUpNext="/admin/integrations" />
      <div className="space-y-4">
        <PortalCard title="Webhook delivery" actions={overview.ok ? <PortalStatusPill label={overview.data.worker_token_active ? 'Worker credential set' : 'No worker credential'} tone={overview.data.worker_token_active ? 'success' : 'warning'} /> : undefined}>
          {overview.ok ? (
            <>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs text-portal-muted">Pending</dt><dd className="font-semibold text-portal-text">{overview.data.pending}</dd></div>
                <div><dt className="text-xs text-portal-muted">Delivered (24 h)</dt><dd className="font-semibold text-portal-text">{overview.data.delivered_24h}</dd></div>
                <div><dt className="text-xs text-portal-muted">Failed (24 h)</dt><dd className="font-semibold text-portal-text">{overview.data.failed_24h}</dd></div>
              </dl>
              {overview.data.recent_failures.length > 0 && (
                <ul className="mt-4 divide-y divide-portal-border border-t border-portal-border text-sm">
                  {overview.data.recent_failures.map((f) => (
                    <li key={f.id} className="py-2 text-portal-text break-all">{f.organization_name}: {f.event_type} to {f.url} <span className="text-xs text-portal-muted">{f.attempts} attempts{f.last_http_status ? `, HTTP ${f.last_http_status}` : ''}{f.last_error ? `, ${f.last_error}` : ''}</span></li>
                  ))}
                </ul>
              )}
            </>
          ) : <p role="alert" className="text-sm text-portal-danger">{messageFor(overview.code)}</p>}
          {canToken ? (
            <OneTimeSecretForm action={createWorkerTokenAction} label="Create worker credential (fresh code needed)" secretLabel="Worker credential" quiet className="mt-4 border-t border-portal-border pt-4">
              <p className="text-xs text-portal-muted">The scheduler calls <span className="portal-id">/api/cron/webhooks</span> with <span className="portal-id">CRON_SECRET</span>; the route uses this credential (as <span className="portal-id">INTEGRATION_WORKER_TOKEN</span>) to claim deliveries.</p>
            </OneTimeSecretForm>
          ) : <p className="mt-3 text-xs text-portal-muted">Only an administrator can create the worker credential.</p>}
        </PortalCard>
        <PortalCard title="API keys (all organizations)">
          {!keys.ok && <p role="alert" className="text-sm text-portal-danger">{messageFor(keys.code)}</p>}
          {keys.ok && keys.data.keys.length === 0 && <p className="text-sm text-portal-muted">No API keys yet.</p>}
          {keys.ok && keys.data.keys.length > 0 && (
            <ul className="divide-y divide-portal-border text-sm">
              {keys.data.keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="text-portal-text">{k.organization_name} ({k.organization_code}): {k.name} <span className="portal-id text-xs">{k.prefix}...</span> <span className="text-xs text-portal-muted">created {dateOnly(k.created_at)}{k.last_used_at ? `, last used ${dateOnly(k.last_used_at)}` : ', never used'}</span></span>
                  <span className="inline-flex items-center gap-2">
                    <PortalStatusPill label={k.environment === 'live' ? 'Live' : 'Test'} tone={k.environment === 'live' ? 'warning' : 'info'} />
                    {k.revoked_at ? <PortalStatusPill label="Revoked" tone="danger" /> : canRevoke ? (
                      <form action={adminRevokeKeyAction}><input type="hidden" name="id" value={k.id} /><button type="submit" className="portal-btn-quiet">Revoke</button></form>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PortalCard>
      </div>
      <p className="mt-4 text-xs text-portal-muted"><Link href="/admin/fulfillment" className="underline">Fulfillment onboarding</Link></p>
    </>
  );
}
