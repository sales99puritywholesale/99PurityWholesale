import type { ReactNode } from 'react';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalEmptyState } from './portal-empty-state';
import { FlashToast } from './flash-toast';

export const INPUT = 'w-full rounded-lg border border-portal-border bg-white px-3 py-2 text-sm text-portal-text outline-none focus:border-portal-accent-strong';
export const LABEL = 'mb-1 block text-xs font-medium text-portal-muted';

export type Sp = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Result of an action, shown as a toast in the bottom-right corner (see FlashToast): `e` carries a result CODE (looked up in fixed copy, never echoed) and `ok` a fixed success key.
 * The toast removes the flag from the address bar, so it appears once and does not come back on refresh.
 */
export function Flash({ sp, stepUpNext = '/admin' }: { sp: Sp; stepUpNext?: string }) {
  const e = one(sp.e);
  const ok = one(sp.ok);
  const stamp = Date.now();
  if (e) return <FlashToast kind="error" message={messageFor(e)} verifyHref={e === 'step_up_required' ? `/login/mfa?stepup=1&next=${encodeURIComponent(stepUpNext)}` : undefined} stamp={stamp} />;
  if (ok) return <FlashToast kind="ok" message="Saved" stamp={stamp} />;
  return null;
}

export const NoOrganization = () => (
  <PortalEmptyState title="No organization yet" description="Your account is not a member of an active organization. Ask your account manager to add you." />
);

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

/** Build a same-page redirect target with a result code or a success flag (query values are fixed keys or result codes only). */
export const back = (path: string, params: Record<string, string>, outcome: { ok: true } | { ok: false; code: string }): string => {
  const q = new URLSearchParams(params);
  if (outcome.ok) q.set('ok', '1');
  else q.set('e', outcome.code.replace(/[^a-z_]/g, '').slice(0, 40));
  return `${path}?${q.toString()}`;
};
