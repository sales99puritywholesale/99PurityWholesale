import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { adminOrgCatalogGet, adminOrgsList, messageFor, type AdminRule } from '@/lib/portal/commerce/server';
import { formatE4 } from '@/lib/portal/commerce/pricing';
import { uuid } from '@/lib/portal/commerce/schemas';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill } from '@/components/portal/portal-status';
import { Field, Flash, INPUT, one, type Sp } from '@/components/portal/commerce-ui';
import { addMemberAction, setMarkupRuleAction, setOrgProductAction } from '../../commerce-actions';

export const metadata: Metadata = { title: 'Organization catalog and markup rules' };
const PAGE = 25;

const ruleText = (r: AdminRule) => `${r.markup_type === 'percent' ? `${formatE4(r.value_e4)}%` : `$${formatE4(r.value_e4)}`}`;
const boundsText = (r: AdminRule) => {
  const parts: string[] = [];
  if (r.rep_min_percent_e4 !== null || r.rep_max_percent_e4 !== null) parts.push(`percent ${r.rep_min_percent_e4 === null ? '-' : formatE4(r.rep_min_percent_e4)} to ${r.rep_max_percent_e4 === null ? '-' : formatE4(r.rep_max_percent_e4)}`);
  if (r.rep_min_fixed_e4 !== null || r.rep_max_fixed_e4 !== null) parts.push(`fixed $${r.rep_min_fixed_e4 === null ? '-' : formatE4(r.rep_min_fixed_e4)} to $${r.rep_max_fixed_e4 === null ? '-' : formatE4(r.rep_max_fixed_e4)}`);
  return parts.length ? `Representative bounds: ${parts.join('; ')}` : '';
};

export default async function Page({ params, searchParams }: { params: { orgId: string }; searchParams: Sp }) {
  await requireStaffCapability(`/admin/pricing/${params.orgId}`, 'org.manage');
  if (!uuid.safeParse(params.orgId).success) notFound();
  const [catalog, orgs] = await Promise.all([adminOrgCatalogGet(params.orgId), adminOrgsList()]);
  if (!catalog.ok) {
    if (catalog.code === 'organization_not_found') notFound();
    return (
      <p role="alert" className="text-sm text-portal-danger">
        {messageFor(catalog.code)}
      </p>
    );
  }
  const org = orgs.ok ? orgs.data.organizations.find((o) => o.id === params.orgId) : undefined;
  const q = (one(searchParams.q) ?? '').trim().toLowerCase().slice(0, 60);
  const page = Math.max(1, Math.min(200, Number(one(searchParams.page)) || 1));
  const products = catalog.data.products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.slug.includes(q));
  const rows = products.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(products.length / PAGE));
  const href = (p: number) => `/admin/pricing/${params.orgId}?q=${encodeURIComponent(q)}&page=${p}`;
  return (
    <>
      <PortalPageHeader area="admin" title={org ? `${org.name} (${org.code})` : 'Organization'} description="Markup rules, members and product assignment. Customers see only published products at the organization price." crumbs={[{ label: 'Pricing', href: '/admin/pricing' }]} />
      <Flash sp={searchParams} />
      <PortalCard title="Markup rules" className="mb-6">
        {catalog.data.rules.length === 0 ? (
          <p className="mb-4 text-sm text-portal-muted">No rules yet: customers pay the base price (never below the product floor).</p>
        ) : (
          <ul className="mb-4 divide-y divide-portal-border text-sm">
            {catalog.data.rules.map((r) => (
              <li key={r.rule_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-portal-text">
                  <strong className="capitalize">{r.kind}</strong> {ruleText(r)} on {r.product_name ?? 'all products'}
                  {boundsText(r) && <span className="block text-xs text-portal-muted">{boundsText(r)}</span>}
                </span>
                <PortalStatusPill label={r.is_active ? 'Active' : 'Inactive'} tone={r.is_active ? 'success' : 'neutral'} />
              </li>
            ))}
          </ul>
        )}
        <form action={setMarkupRuleAction} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="organizationId" value={params.orgId} />
          <Field label="Rule kind">
            <select name="kind" className={INPUT} defaultValue="organization">
              <option value="organization">Organization (applied first, on the base price)</option>
              <option value="representative">Representative (applied on the organization price)</option>
            </select>
          </Field>
          <Field label="Applies to">
            <select name="productId" className={INPUT} defaultValue="">
              <option value="">All products</option>
              {catalog.data.products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select name="type" className={INPUT} defaultValue="percent">
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount (USD)</option>
            </select>
          </Field>
          <Field label="Value (percent up to 1000, or USD; up to 4 decimals)">
            <input name="value" required inputMode="decimal" className={INPUT} />
          </Field>
          <Field label="Rep. min percent (org rules)">
            <input name="minPercent" inputMode="decimal" className={INPUT} />
          </Field>
          <Field label="Rep. max percent (org rules)">
            <input name="maxPercent" inputMode="decimal" className={INPUT} />
          </Field>
          <Field label="Rep. min fixed USD (org rules)">
            <input name="minFixed" inputMode="decimal" className={INPUT} />
          </Field>
          <Field label="Rep. max fixed USD (org rules)">
            <input name="maxFixed" inputMode="decimal" className={INPUT} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-portal-text">
            <input type="checkbox" name="active" defaultChecked /> Active
          </label>
          <div className="sm:col-span-3">
            <button className="portal-btn" type="submit">
              Save rule
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-portal-muted">Saving a rule replaces the rule with the same kind and scope. Rules apply to future checkouts only; placed orders keep their prices. Needs a fresh authenticator verification.</p>
      </PortalCard>
      <PortalCard title="Add member" className="mb-6">
        <form action={addMemberAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="organizationId" value={params.orgId} />
          <Field label="Email of a confirmed account">
            <input name="email" type="email" required maxLength={254} className={`${INPUT} w-64`} />
          </Field>
          <Field label="Role">
            <select name="role" className={INPUT} defaultValue="member">
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
          </Field>
          <button className="portal-btn" type="submit">
            Add
          </button>
        </form>
      </PortalCard>
      <PortalCard title={`Catalog (${products.length} products)`}>
        <form method="get" className="mb-4 flex items-end gap-2">
          <Field label="Search">
            <input name="q" defaultValue={q} maxLength={60} className={INPUT} />
          </Field>
          <button className="portal-btn-quiet" type="submit">
            Search
          </button>
        </form>
        <ul className="divide-y divide-portal-border">
          {rows.map((p) => (
            <li key={p.product_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-portal-text">
                {p.name}
                {!p.priced && <span className="block text-xs text-portal-danger">Needs a base price and a minimum price before it can be published</span>}
              </span>
              <span className="flex items-center gap-2">
                <PortalStatusPill label={!p.assigned ? 'Not published' : p.available ? 'Published and available' : 'Published, unavailable'} tone={!p.assigned ? 'neutral' : p.available ? 'success' : 'warning'} />
                {(['assign', 'hide', 'unassign'] as const).map((mode) => (
                  <form key={mode} action={setOrgProductAction}>
                    <input type="hidden" name="organizationId" value={params.orgId} />
                    <input type="hidden" name="productId" value={p.product_id} />
                    <input type="hidden" name="q" value={q} />
                    <input type="hidden" name="mode" value={mode} />
                    <button className="portal-btn-quiet" type="submit" disabled={mode !== 'unassign' && !p.priced}>
                      {mode === 'assign' ? 'Publish' : mode === 'hide' ? 'Make unavailable' : 'Unpublish'}
                    </button>
                  </form>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
            {page > 1 ? (
              <Link className="portal-btn-quiet" href={href(page - 1)}>
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-portal-muted">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link className="portal-btn-quiet" href={href(page + 1)}>
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </PortalCard>
    </>
  );
}
