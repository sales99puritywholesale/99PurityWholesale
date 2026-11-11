import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { portalCopy, isLoginErrorCode } from '@/lib/portal/copy';
import { assertPortalEnabled, getPortalUser } from '@/lib/portal/auth';
import { getSupabasePublicConfig } from '@/lib/portal/config';
import { safeRedirectPath } from '@/lib/portal/validation';
import { DEMO_PERSONAS, isDemoMode } from '@/lib/portal/demo/config';
import { demoResetAction, demoSignInAction, signInAction } from './actions';

export const metadata: Metadata = { title: portalCopy.login.title };

type SearchParams = { next?: string | string[]; error?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Sign-in page. No sign-up, no social login, no password hints. Already-authenticated visitors go to the portal.
 * The error code comes from the query string but only maps to fixed copy (never echoed), and `next` is re-validated.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  assertPortalEnabled();
  if (isDemoMode()) return <DemoLogin searchParams={searchParams} />;
  const configured = getSupabasePublicConfig().ok;
  if (configured && (await getPortalUser())) redirect(safeRedirectPath(first(searchParams.next)));

  const next = safeRedirectPath(first(searchParams.next));
  const rawError = first(searchParams.error);
  const errorCode = !configured ? 'unavailable' : isLoginErrorCode(rawError) ? rawError : null;
  const t = portalCopy.login;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="portal-eyebrow mb-2">{t.eyebrow}</p>
          <h1 className="font-portal-heading text-4xl font-bold tracking-tight text-portal-text">{portalCopy.brand.name}</h1>
        </div>
        <div className="rounded-2xl border border-portal-border bg-portal-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-8">
          <h2 className="font-portal-heading text-xl font-semibold text-portal-text">{t.title}</h2>
          <p className="mt-1 text-sm text-portal-muted">{t.description}</p>

          {errorCode && (
            <p role="alert" className="mt-4 rounded-lg border border-[#FECDCA] bg-portal-danger-soft px-3 py-2 text-sm text-portal-danger">
              {t.errors[errorCode]}
            </p>
          )}

          <form action={signInAction} className="mt-6 space-y-4" noValidate>
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-portal-text">
                {t.email}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                maxLength={254}
                className="w-full rounded-lg border border-portal-border bg-white px-3 py-2.5 text-sm text-portal-text outline-none focus:border-portal-accent-strong"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-portal-text">
                {t.password}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                className="w-full rounded-lg border border-portal-border bg-white px-3 py-2.5 text-sm text-portal-text outline-none focus:border-portal-accent-strong"
              />
            </div>
            <button type="submit" className="portal-btn w-full" disabled={!configured}>
              {t.submit}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-xs text-portal-muted">{t.noSignup}</p>
      </div>
    </main>
  );
}

/** Demo mode sign-in (localhost demonstration only; isDemoMode() is false in every production build): pick a demo persona, no password. */
async function DemoLogin({ searchParams }: { searchParams: SearchParams }) {
  const next = safeRedirectPath(first(searchParams.next));
  if (await getPortalUser()) redirect(next);
  const groups = [
    { label: 'Administrator', hint: 'Products, pricing, organizations, orders', people: DEMO_PERSONAS.filter((p) => p.kind === 'admin') },
    { label: 'Customers', hint: 'Browse the catalog at your organization price, cart, checkout, orders', people: DEMO_PERSONAS.filter((p) => p.kind === 'customer') },
  ];
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <p className="portal-eyebrow mb-2">Wholesale portal demo</p>
          <h1 className="font-portal-heading text-4xl font-bold tracking-tight text-portal-text">{portalCopy.brand.name}</h1>
          <p className="mt-3 text-sm text-portal-muted">Choose who to sign in as. Everything you do is saved on this computer and shown consistently to the customer and the administrator.</p>
        </div>
        <div role="note" className="mb-5 rounded-xl border border-[#FEDF89] bg-portal-warning-soft px-4 py-3 text-sm text-portal-warning">
          Demonstration mode: sample data only. Payments, shipping and integrations are simulated; no real order, charge or shipment is ever created.
        </div>
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label} className="rounded-2xl border border-portal-border bg-portal-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <h2 className="font-portal-heading text-lg font-semibold text-portal-text">{g.label}</h2>
              <p className="mb-3 text-sm text-portal-muted">{g.hint}</p>
              <ul className="space-y-2">
                {g.people.map((p) => (
                  <li key={p.id}>
                    <form action={demoSignInAction} className="flex items-center justify-between gap-3 rounded-xl border border-portal-border px-4 py-3">
                      <input type="hidden" name="persona" value={p.id} />
                      <input type="hidden" name="next" value={next} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-portal-text">{p.name}</span>
                        <span className="block truncate text-xs text-portal-muted">{p.title}</span>
                      </span>
                      <button type="submit" className="portal-btn shrink-0">Sign in</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <form action={demoResetAction} className="mt-5 text-center">
          <button type="submit" className="text-xs text-portal-muted underline hover:text-portal-text">Reset demo data to the original sample data</button>
        </form>
      </div>
    </main>
  );
}
