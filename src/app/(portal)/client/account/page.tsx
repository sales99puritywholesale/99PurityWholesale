import type { Metadata } from 'next';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations } from '@/lib/portal/commerce/server';
import { orgMembersList, profileGet } from '@/lib/portal/admin-ops/server';
import { notificationPrefsGet } from '@/lib/portal/aftersales/server';
import { CATEGORY_LABELS } from '@/lib/portal/aftersales/model';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { dateOnly } from '@/components/portal/billing-ui';
import { Field, Flash, INPUT, one, type Sp } from '@/components/portal/commerce-ui';
import { setNotificationPrefAction, updateProfileAction } from './actions';

export const metadata: Metadata = { title: portalCopy.client.modules.account.title };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/account');
  const t = portalCopy.client.modules.account;
  const orgs = await getMyOrganizations();
  const org = orgs.find((o) => o.id === one(searchParams.org)) ?? orgs[0];
  const [profile, members, prefs] = await Promise.all([profileGet(), org ? orgMembersList(org.id) : Promise.resolve(null), notificationPrefsGet()]);
  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={t.description} />
      <Flash sp={searchParams} stepUpNext="/client" />
      <div className="space-y-4">
        <PortalCard title="Your profile">
          {!profile.ok ? <p role="alert" className="text-sm text-portal-danger">{messageFor(profile.code)}</p> : (
            <form action={updateProfileAction} className="grid gap-3 sm:grid-cols-2">
              {org && <input type="hidden" name="org" value={org.id} />}
              <Field label="E-mail (sign-in address)"><input value={profile.data.email ?? ''} readOnly aria-readonly="true" className={`${INPUT} bg-portal-canvas`} /></Field>
              <Field label="Full name"><input name="fullName" maxLength={200} defaultValue={profile.data.full_name ?? ''} className={INPUT} autoComplete="name" /></Field>
              <Field label="Phone (optional)"><input name="phone" maxLength={40} defaultValue={profile.data.phone ?? ''} className={INPUT} autoComplete="tel" /></Field>
              <div className="sm:col-span-2"><button type="submit" className="portal-btn-quiet">Save profile</button></div>
            </form>
          )}
          <p className="mt-3 text-xs text-portal-muted">To change your e-mail address or password, contact your account manager.</p>
        </PortalCard>
        <PortalCard title="E-mail notifications">
          <p className="mb-3 text-xs text-portal-muted">Invoice and payment e-mails are always sent to organization owners. You can switch the other messages off or on.</p>
          {!prefs.ok && <p role="alert" className="text-sm text-portal-danger">{messageFor(prefs.code)}</p>}
          {prefs.ok && (
            <ul className="divide-y divide-portal-border text-sm">
              {prefs.data.preferences.map((p) => (
                <li key={p.category} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="text-portal-text">{CATEGORY_LABELS[p.category]} <span className="text-xs text-portal-muted">{p.enabled ? 'on' : 'off'}</span></span>
                  <form action={setNotificationPrefAction}>
                    {org && <input type="hidden" name="org" value={org.id} />}
                    <input type="hidden" name="category" value={p.category} />
                    <input type="hidden" name="enabled" value={p.enabled ? 'false' : 'true'} />
                    <button type="submit" className="portal-btn-quiet">{p.enabled ? 'Turn off' : 'Turn on'}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </PortalCard>
        {org ? (
          <PortalCard title={`Team at ${org.name}`} actions={<PortalStatusPill label={org.role === 'owner' ? 'You are an owner' : 'You are a member'} tone={org.role === 'owner' ? 'info' : 'neutral'} />}>
            {members && !members.ok && <p role="alert" className="text-sm text-portal-danger">{messageFor(members.code)}</p>}
            {members && members.ok && (
              <ul className="divide-y divide-portal-border text-sm">
                {members.data.members.map((m, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-portal-text">{m.name || 'Team member'}{m.is_me ? ' (you)' : ''}{m.email ? <span className="text-xs text-portal-muted"> {m.email}</span> : null} <span className="text-xs text-portal-muted">joined {dateOnly(m.joined)}</span></span>
                    <PortalStatusPill label={m.role === 'owner' ? 'Owner' : 'Member'} tone={m.role === 'owner' ? 'info' : 'neutral'} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-portal-muted">To add or remove a team member, contact your account manager.</p>
          </PortalCard>
        ) : <p className="text-sm text-portal-muted">Your account is not a member of an organization yet.</p>}
      </div>
    </>
  );
}
