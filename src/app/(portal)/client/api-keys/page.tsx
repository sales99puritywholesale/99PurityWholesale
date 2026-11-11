import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { apiKeysList, integrationOrdersList, webhookDeliveriesList, webhookEndpointsList } from '@/lib/portal/integrations/server';
import { WEBHOOK_EVENTS } from '@/lib/portal/integrations/keys';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { OneTimeSecretForm } from '@/components/portal/one-time-secret';
import { dateOnly } from '@/components/portal/billing-ui';
import { Field, Flash, INPUT, NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';
import { createEndpointAction, createKeyAction, revokeKeyAction, rotateEndpointAction, testEndpointAction, toggleEndpointAction } from './actions';

export const metadata: Metadata = { title: portalCopy.client.modules.apiKeys.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/api-keys');
  const t = portalCopy.client.modules.apiKeys;
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  if (!org) {
    return (
      <>
        <PortalPageHeader area="client" title={t.title} description={t.description} />
        <NoOrganization />
      </>
    );
  }
  const [keys, hooks, deliveries, orders] = await Promise.all([apiKeysList(org.id), webhookEndpointsList(org.id), webhookDeliveriesList(org.id), integrationOrdersList(org.id)]);
  const canEdit = keys.ok && keys.data.can_edit;
  const hidden = <input type="hidden" name="organizationId" value={org.id} />;
  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={`${t.description} Organization: ${org.name}.`} />
      <Flash sp={searchParams} stepUpNext="/client" />
      {!keys.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(keys.code)}</p>}
      <div className="space-y-4">
        <PortalCard title="API keys" actions={<Link href="/client/docs" className="portal-btn-quiet">API documentation</Link>}>
          {keys.ok && keys.data.keys.length > 0 ? (
            <ul className="divide-y divide-portal-border text-sm">
              {keys.data.keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="text-portal-text">
                    {k.name} <span className="portal-id text-xs">{k.prefix}...</span>{' '}
                    <span className="text-xs text-portal-muted">created {dateOnly(k.created_at)}{k.last_used_at ? `, last used ${dateOnly(k.last_used_at)}` : ', never used'}</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <PortalStatusPill label={k.environment === 'live' ? 'Live' : 'Test'} tone={k.environment === 'live' ? 'warning' : 'info'} />
                    {k.revoked_at ? <PortalStatusPill label="Revoked" tone="danger" /> : canEdit ? (
                      <form action={revokeKeyAction}>{hidden}<input type="hidden" name="id" value={k.id} /><button type="submit" className="portal-btn-quiet">Revoke</button></form>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-portal-muted">No API keys yet.</p>}
          {canEdit ? (
            <OneTimeSecretForm action={createKeyAction} label="Create key" secretLabel="Your new API key" className="mt-4 border-t border-portal-border pt-4">
              {hidden}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name"><input name="name" required maxLength={80} placeholder="My store" className={INPUT} /></Field>
                <Field label="Environment">
                  <select name="environment" className={INPUT} defaultValue="test">
                    <option value="test">Test (sandbox orders only)</option>
                    <option value="live" disabled={!(keys.ok && keys.data.live_available)}>Live{keys.ok && keys.data.live_available ? '' : ' (after go-live)'}</option>
                  </select>
                </Field>
              </div>
            </OneTimeSecretForm>
          ) : <p className="mt-3 text-xs text-portal-muted">Only an organization owner can create or revoke keys.</p>}
        </PortalCard>

        <PortalCard title="Webhook endpoints">
          {hooks.ok && hooks.data.endpoints.length > 0 ? (
            <ul className="divide-y divide-portal-border text-sm">
              {hooks.data.endpoints.map((e) => (
                <li key={e.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-portal-text break-all">{e.url} <span className="text-xs text-portal-muted">{e.events.join(', ')}</span></span>
                    <PortalStatusPill label={e.active ? 'Active' : 'Paused'} tone={e.active ? 'success' : 'neutral'} />
                  </div>
                  <p className="mt-1 text-xs text-portal-muted">{e.delivered} delivered, {e.pending} pending, {e.failed} failed</p>
                  {canEdit && (
                    <div className="mt-2 flex flex-wrap items-start gap-2">
                      <form action={toggleEndpointAction}>{hidden}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="active" value={e.active ? 'false' : 'true'} /><button type="submit" className="portal-btn-quiet">{e.active ? 'Pause' : 'Resume'}</button></form>
                      <form action={testEndpointAction}>{hidden}<input type="hidden" name="id" value={e.id} /><button type="submit" className="portal-btn-quiet">Send test event</button></form>
                      <OneTimeSecretForm action={rotateEndpointAction} label="Rotate signing key" secretLabel="Your new signing key" quiet>{hidden}<input type="hidden" name="id" value={e.id} /></OneTimeSecretForm>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-portal-muted">No webhook endpoints yet.</p>}
          {canEdit && (
            <OneTimeSecretForm action={createEndpointAction} label="Add endpoint" secretLabel="Your signing key" className="mt-4 border-t border-portal-border pt-4">
              {hidden}
              <Field label="HTTPS URL (public domain name, port 443)"><input name="url" type="url" required maxLength={300} placeholder="https://example.com/webhooks/99purity" className={INPUT} /></Field>
              <fieldset className="mt-3 flex flex-wrap gap-4 text-sm">
                <legend className="mb-1 text-xs font-medium text-portal-muted">Events</legend>
                {WEBHOOK_EVENTS.map((ev) => <label key={ev} className="flex items-center gap-2"><input type="checkbox" name="events" value={ev} defaultChecked={ev !== 'ping'} /> {ev}</label>)}
              </fieldset>
            </OneTimeSecretForm>
          )}
        </PortalCard>

        <PortalCard title="Recent deliveries">
          {deliveries.ok && deliveries.data.deliveries.length > 0 ? (
            <ul className="divide-y divide-portal-border text-sm">
              {deliveries.data.deliveries.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="text-portal-text break-all">{d.event_type} <span className="text-xs text-portal-muted">to {d.url}, {d.attempts} attempt{d.attempts === 1 ? '' : 's'}{d.last_http_status ? `, HTTP ${d.last_http_status}` : ''}{d.last_error ? `, ${d.last_error}` : ''}</span></span>
                  <PortalStatusPill label={d.status === 'delivered' ? 'Delivered' : d.status === 'failed' ? 'Failed' : 'Pending'} tone={d.status === 'delivered' ? 'success' : d.status === 'failed' ? 'danger' : 'warning'} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-portal-muted">No deliveries yet.</p>}
        </PortalCard>

        <PortalCard title="Orders received through the API">
          {orders.ok && orders.data.orders.length > 0 ? (
            <ul className="divide-y divide-portal-border text-sm">
              {orders.data.orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="text-portal-text">{o.order_number} <span className="portal-id text-xs">{o.external_ref}</span> <span className="text-xs text-portal-muted">{o.lines.map((l) => `${l.quantity} x ${l.sku}`).join(', ')}, {dateOnly(o.created_at)}</span></span>
                  <span className="inline-flex gap-2"><PortalStatusPill label={o.sandbox ? 'Sandbox' : 'Live'} tone={o.sandbox ? 'info' : 'warning'} /><PortalStatusPill label={o.status} tone="neutral" /></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-portal-muted">No orders yet. Send a test order with a test key to complete your fulfillment setup.</p>}
        </PortalCard>
      </div>
    </>
  );
}
