import type { Metadata } from 'next';
import Link from 'next/link';
import { portalCopy } from '@/lib/portal/copy';
import { requireUser } from '@/lib/portal/auth';
import { getMyOrganizations, catalogList } from '@/lib/portal/commerce/server';
import { documentUrl, onboardingGet, type OnboardingState } from '@/lib/portal/onboarding/server';
import { LABEL_TEMPLATES, LABEL_TEMPLATE_LABELS, STEP_COUNT, STORE_METHODS, STORE_METHOD_LABELS, approvedCount, canSubmit, nextCustomerStep, stepDef, stepLabel, viewOf, type StepStatus, type StepView } from '@/lib/portal/onboarding/steps';
import { formatCents } from '@/lib/portal/billing/invoices';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill, type StatusTone } from '@/components/portal/portal-status';
import { Field, Flash, INPUT, NoOrganization, one, type Sp } from '@/components/portal/commerce-ui';
import { acceptAgreementAction, deleteSkuAction, saveSkuAction, saveStoreAction, selectPackagingAction, submitStepAction, uploadLabelAction } from './actions';

export const metadata: Metadata = { title: portalCopy.client.modules.fulfillment.title };

const TONE: Record<StepView, StatusTone> = { locked: 'neutral', todo: 'info', in_progress: 'info', submitted: 'warning', approved: 'success', rejected: 'danger' };
const ITEM_TONE: Record<string, StatusTone> = { draft: 'neutral', submitted: 'warning', approved: 'success', rejected: 'danger', verified: 'success' };

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireUser('/client/fulfillment/setup');
  const t = portalCopy.client.modules.fulfillment;
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
  const res = await onboardingGet(org.id);
  if (!res.ok) {
    return (
      <>
        <PortalPageHeader area="client" title={t.title} description={t.description} />
        <Flash sp={searchParams} stepUpNext="/client" />
        <p role="alert" className="text-sm text-portal-danger">{messageFor(res.code)}</p>
      </>
    );
  }
  const { state, can_edit: canEdit } = res.data;
  const statuses = Object.fromEntries(state.steps.map((s) => [s.step_no, s.status as StepStatus])) as Record<number, StepStatus>;
  const done = approvedCount(statuses);
  const next = nextCustomerStep(statuses);
  const catalog = canEdit ? await catalogList(org.id) : null;
  const variants = catalog && catalog.ok ? catalog.data.items.flatMap((i) => i.variants.map((v) => ({ id: v.variant_id, label: `${i.name} ${v.spec}`.trim(), sku: v.sku }))) : [];
  const urls = new Map<string, string>();
  const paths = [...state.labels.map((l) => l.storage_path), ...(state.agreement ? [state.agreement.offered_document.storage_path, ...(state.agreement.signed_document ? [state.agreement.signed_document.storage_path] : [])] : [])];
  await Promise.all(paths.map(async (p) => { const u = await documentUrl(p); if (u) urls.set(p, u); }));
  const hidden = <input type="hidden" name="organizationId" value={org.id} />;
  const submitButton = (no: number, label: string) => (
    <form action={submitStepAction} className="mt-4">
      {hidden}
      <input type="hidden" name="stepNo" value={no} />
      <button type="submit" className="portal-btn">{label}</button>
    </form>
  );
  const link = (path: string, name: string) => (urls.get(path) ? <a className="underline" href={urls.get(path)} target="_blank" rel="noopener noreferrer">{name}</a> : <span>{name}</span>);

  const body = (no: number, view: StepView, s: OnboardingState['steps'][number]) => {
    const open = canEdit && canSubmit(no, statuses);
    if (view === 'locked') {
      const missing = (stepDef(no)?.dependsOn ?? []).filter((d) => statuses[d] !== 'approved').map((d) => stepDef(d)?.title).join(', ');
      return <p className="text-sm text-portal-muted">Finish first: {missing}.</p>;
    }
    const note = s.status === 'rejected' ? (
      <p role="alert" className="mb-3 rounded-lg border border-[#FECDCA] bg-portal-danger-soft px-3 py-2 text-sm text-portal-danger">
        Needs changes{s.review_reason ? `: ${s.review_reason}` : ''}{s.review_instructions ? ` ${s.review_instructions}` : ''}
      </p>
    ) : null;
    const waiting = view === 'submitted' ? <p className="text-sm text-portal-muted">Submitted and waiting for review by our team.</p> : null;
    switch (no) {
      case 1:
        return (
          <>
            {note}{waiting}
            <ul className="divide-y divide-portal-border text-sm">
              {state.mappings.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="text-portal-text">{m.product_name} {m.spec} <span className="portal-id text-xs">{m.external_sku}</span> <span className="text-xs text-portal-muted">x{m.units_per_pack} per pack, internal {m.internal_sku}</span>{m.review_reason ? <span className="block text-xs text-portal-danger">{m.review_reason}</span> : null}</span>
                  <span className="inline-flex items-center gap-2">
                    <PortalStatusPill label={m.status} tone={ITEM_TONE[m.status] ?? 'neutral'} />
                    {canEdit && (m.status === 'draft' || m.status === 'rejected') && (
                      <form action={deleteSkuAction}>{hidden}<input type="hidden" name="id" value={m.id} /><button className="portal-btn-quiet" type="submit">Remove</button></form>
                    )}
                  </span>
                </li>
              ))}
              {state.mappings.length === 0 && <li className="py-2.5 text-portal-muted">No products yet.</li>}
            </ul>
            {open && (
              <>
                <form action={saveSkuAction} className="mt-4 grid gap-3 border-t border-portal-border pt-4 sm:grid-cols-2">
                  {hidden}
                  <Field label="Product source">
                    <select name="source" className={INPUT} defaultValue="catalog">
                      <option value="catalog">From our catalog</option>
                      <option value="private">My own product</option>
                    </select>
                  </Field>
                  <Field label="Catalog product (if from our catalog)">
                    <select name="variantId" className={INPUT} defaultValue="">
                      <option value="">Choose...</option>
                      {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Product name (own product only)"><input name="productName" maxLength={160} className={INPUT} /></Field>
                  <Field label="Specification (own product only)"><input name="spec" maxLength={120} className={INPUT} /></Field>
                  <Field label="Your SKU"><input name="externalSku" required maxLength={64} className={INPUT} /></Field>
                  <Field label="Units per pack"><input name="unitsPerPack" required inputMode="numeric" defaultValue="1" className={INPUT} /></Field>
                  <Field label="Barcode (optional, 8 to 14 digits)"><input name="barcode" inputMode="numeric" className={INPUT} /></Field>
                  <Field label="Weight in grams (optional)"><input name="weightGrams" inputMode="numeric" className={INPUT} /></Field>
                  <div className="sm:col-span-2"><button type="submit" className="portal-btn-quiet">Add product</button></div>
                </form>
                {state.mappings.length > 0 && submitButton(1, 'Submit products for review')}
              </>
            )}
          </>
        );
      case 2:
        return (
          <>
            {note}{waiting}
            <ul className="divide-y divide-portal-border text-sm">
              {state.labels.map((l) => {
                const m = state.mappings.find((x) => x.id === l.sku_mapping_id);
                return (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-portal-text">{m?.product_name} {m?.spec} ({LABEL_TEMPLATE_LABELS[l.template]}): {link(l.storage_path, l.file_name)}{l.review_reason ? <span className="block text-xs text-portal-danger">{l.review_reason}</span> : null}</span>
                    <PortalStatusPill label={l.status} tone={ITEM_TONE[l.status] ?? 'neutral'} />
                  </li>
                );
              })}
              {state.labels.length === 0 && <li className="py-2.5 text-portal-muted">No label artwork yet.</li>}
            </ul>
            {open && (
              <>
                <form action={uploadLabelAction} encType="multipart/form-data" className="mt-4 grid gap-3 border-t border-portal-border pt-4 sm:grid-cols-2">
                  {hidden}
                  <Field label="Product">
                    <select name="skuMappingId" required className={INPUT}>
                      {state.mappings.filter((m) => m.status === 'approved').map((m) => <option key={m.id} value={m.id}>{m.product_name} {m.spec} ({m.external_sku})</option>)}
                    </select>
                  </Field>
                  <Field label="Label template">
                    <select name="template" className={INPUT}>{LABEL_TEMPLATES.map((x) => <option key={x} value={x}>{LABEL_TEMPLATE_LABELS[x]}</option>)}</select>
                  </Field>
                  <div className="sm:col-span-2"><Field label="Artwork file (PDF, PNG or JPEG, up to 10 MB)"><input name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className={INPUT} /></Field></div>
                  <div className="sm:col-span-2"><button type="submit" className="portal-btn-quiet">Upload label</button></div>
                </form>
                {state.labels.length > 0 && submitButton(2, 'Submit labels for review')}
              </>
            )}
          </>
        );
      case 3:
        return (
          <>
            {note}{waiting}
            {open ? (
              <form action={selectPackagingAction} className="grid gap-3 sm:grid-cols-2">
                {hidden}
                <Field label="Packaging">
                  <select name="optionId" className={INPUT} defaultValue={state.packaging.selection?.option_id}>
                    {state.packaging.options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.fee_cents > 0 ? ` (${formatCents(o.fee_cents)})` : ''}</option>)}
                  </select>
                </Field>
                <Field label="Notes (optional)"><input name="notes" maxLength={300} defaultValue={state.packaging.selection?.notes ?? ''} className={INPUT} /></Field>
                <div className="sm:col-span-2"><button type="submit" className="portal-btn-quiet">Save packaging</button></div>
              </form>
            ) : (
              <p className="text-sm text-portal-text">{state.packaging.options.find((o) => o.id === state.packaging.selection?.option_id)?.name ?? 'No packaging selected.'}</p>
            )}
            {open && state.packaging.selection && submitButton(3, 'Submit packaging for review')}
          </>
        );
      case 4:
        return (
          <>
            {note}{waiting}
            {state.store && <p className="mb-3 text-sm text-portal-text">{STORE_METHOD_LABELS[state.store.method]} {state.store.store_url ?? ''} <PortalStatusPill label={state.store.status} tone={ITEM_TONE[state.store.status] ?? 'neutral'} /></p>}
            {open && (
              <>
                <form action={saveStoreAction} className="grid gap-3 sm:grid-cols-2">
                  {hidden}
                  <Field label="How do you send orders?">
                    <select name="method" className={INPUT} defaultValue={state.store?.method ?? 'api'}>{STORE_METHODS.map((m) => <option key={m} value={m}>{STORE_METHOD_LABELS[m]}</option>)}</select>
                  </Field>
                  <Field label="Store URL (https, not needed for manual)"><input name="storeUrl" type="url" maxLength={300} defaultValue={state.store?.store_url ?? ''} className={INPUT} /></Field>
                  <Field label="Webhook URL for status updates (https, optional)"><input name="webhookUrl" type="url" maxLength={300} defaultValue={state.store?.webhook_url ?? ''} className={INPUT} /></Field>
                  <Field label="Notes (optional)"><input name="notes" maxLength={500} defaultValue={state.store?.notes ?? ''} className={INPUT} /></Field>
                  <div className="sm:col-span-2"><button type="submit" className="portal-btn-quiet">Save connection</button></div>
                </form>
                {state.store && submitButton(4, 'Submit store connection for review')}
              </>
            )}
          </>
        );
      case 5:
        return (
          <>
            {note}{waiting}
            <p className="text-sm text-portal-muted">Create a test API key in <Link className="underline" href={`/client/api-keys?org=${org.id}`}>API Keys</Link> and send a sandbox order. Sandbox orders never ship or charge anything.</p>
            <p className="mt-2 text-sm text-portal-text">{state.test_order_ready ? 'A valid sandbox order was received.' : 'No sandbox order received yet.'}</p>
            {open && state.test_order_ready && submitButton(5, 'Submit test order for review')}
          </>
        );
      case 6:
        return (
          <>
            {view === 'todo' || view === 'in_progress' || view === 'rejected' ? <p className="mb-3 text-sm text-portal-muted">Waiting on 99 Purity: our team reviews the signed agreement and the paid setup invoice.</p> : null}
            {note}
            {!state.agreement ? <p className="text-sm text-portal-muted">Your account manager will send the agreement here.</p> : (
              <div className="space-y-3 text-sm text-portal-text">
                <p>Agreement: {link(state.agreement.offered_document.storage_path, state.agreement.offered_document.file_name)} <PortalStatusPill label={state.agreement.status === 'signed' ? 'Signed' : 'Waiting for your signature'} tone={state.agreement.status === 'signed' ? 'success' : 'warning'} /></p>
                {state.agreement.status === 'signed' ? (
                  <p className="text-xs text-portal-muted">Signed by {state.agreement.signer_name}, {state.agreement.signer_title}{state.agreement.signed_document ? <> ({link(state.agreement.signed_document.storage_path, 'signed copy')})</> : null}.</p>
                ) : canEdit ? (
                  <form action={acceptAgreementAction} encType="multipart/form-data" className="grid gap-3 border-t border-portal-border pt-3 sm:grid-cols-2">
                    {hidden}
                    <Field label="Your full name"><input name="signerName" required maxLength={120} className={INPUT} /></Field>
                    <Field label="Your title"><input name="signerTitle" required maxLength={120} className={INPUT} /></Field>
                    <div className="sm:col-span-2"><Field label="Signed copy (optional, PDF, PNG or JPEG)"><input name="file" type="file" accept="application/pdf,image/png,image/jpeg" className={INPUT} /></Field></div>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="accept" required /> I accept this agreement on behalf of {org.name}.</label>
                    <div className="sm:col-span-2"><button type="submit" className="portal-btn-quiet">Sign agreement</button></div>
                  </form>
                ) : null}
              </div>
            )}
            {state.setup_invoice && (
              <p className="mt-3 text-sm text-portal-text">
                Setup invoice <Link className="portal-id" href={`/client/purchases/${state.setup_invoice.invoice_id}?org=${org.id}`}>{state.setup_invoice.invoice_number}</Link>: {formatCents(state.setup_invoice.total_cents)}{' '}
                <PortalStatusPill label={state.setup_invoice.status === 'paid' ? 'Paid' : 'Unpaid'} tone={state.setup_invoice.status === 'paid' ? 'success' : 'warning'} />
              </p>
            )}
          </>
        );
      case 7:
        return (
          <>
            {note}{waiting}
            {!state.funding ? <p className="text-sm text-portal-muted">Our team will set your funding requirement after the agreement is signed.</p> : (
              <p className="text-sm text-portal-text">
                {state.funding.type === 'waived' ? 'No funding is required.' : state.funding.type === 'credit_terms' ? 'You have credit terms.' : <>Fund {formatCents(state.funding.amount_cents)} by invoice{state.funding.invoice_id ? <> <Link className="portal-id" href={`/client/purchases/${state.funding.invoice_id}?org=${org.id}`}>{state.funding.invoice_number}</Link></> : null}.</>}{' '}
                <PortalStatusPill label={state.funding.met ? 'Met' : 'Not met yet'} tone={state.funding.met ? 'success' : 'warning'} />
              </p>
            )}
            {open && state.funding && (
              <form action={submitStepAction} className="mt-4 space-y-3">
                {hidden}
                <input type="hidden" name="stepNo" value="7" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="acknowledge" required /> I understand the funding terms. Payments are confirmed by 99 Purity before this step is approved.</label>
                <button type="submit" className="portal-btn">Submit for review</button>
              </form>
            )}
          </>
        );
      case 8:
        return (
          <>
            {note}{waiting}
            {open && (
              <form action={submitStepAction} className="grid gap-3 sm:grid-cols-2">
                {hidden}
                <input type="hidden" name="stepNo" value="8" />
                <Field label="Main contact name"><input name="contactName" required maxLength={120} className={INPUT} /></Field>
                <Field label="Main contact email"><input name="contactEmail" type="email" required maxLength={254} className={INPUT} /></Field>
                <Field label="Main contact phone (optional)"><input name="contactPhone" maxLength={40} className={INPUT} /></Field>
                <span />
                <Field label="Escalation contact name"><input name="escalationName" required maxLength={120} className={INPUT} /></Field>
                <Field label="Escalation contact email"><input name="escalationEmail" type="email" required maxLength={254} className={INPUT} /></Field>
                <Field label="Return address: name"><input name="raName" required maxLength={120} className={INPUT} /></Field>
                <Field label="Address line 1"><input name="raLine1" required maxLength={160} className={INPUT} /></Field>
                <Field label="Address line 2 (optional)"><input name="raLine2" maxLength={160} className={INPUT} /></Field>
                <Field label="City"><input name="raCity" required maxLength={80} className={INPUT} /></Field>
                <Field label="State or region"><input name="raRegion" required maxLength={80} className={INPUT} /></Field>
                <Field label="Postal code"><input name="raPostal" required maxLength={20} className={INPUT} /></Field>
                <Field label="Country (2 letters)"><input name="raCountry" required minLength={2} maxLength={2} defaultValue="US" className={INPUT} /></Field>
                <div className="space-y-2 text-sm sm:col-span-2">
                  <label className="flex items-center gap-2"><input type="checkbox" name="cAccurate" required /> The information above is accurate.</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="cLabels" required /> My approved labels are final.</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="cTerms" required /> I accept the fulfillment terms.</label>
                </div>
                <div className="sm:col-span-2"><button type="submit" className="portal-btn">Request launch review</button></div>
              </form>
            )}
          </>
        );
      default:
        return <p className="text-sm text-portal-muted">{state.instance.status === 'live' ? 'You are live.' : 'Waiting on 99 Purity to go live once every step is approved.'}</p>;
    }
  };

  return (
    <>
      <PortalPageHeader area="client" title={t.title} description={`${t.description} Organization: ${org.name}.`} />
      <Flash sp={searchParams} stepUpNext="/client" />
      <PortalCard>
        <p className="text-sm text-portal-text"><span className="font-semibold">{done} of {STEP_COUNT} steps done.</span> {state.instance.status === 'live' ? 'You are live.' : next ? `Next: ${next.title}.` : 'Everything on your side is submitted.'}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-portal-canvas" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={STEP_COUNT} aria-label="Setup progress">
          <div className="h-full bg-portal-accent-strong" style={{ width: `${(done / STEP_COUNT) * 100}%` }} />
        </div>
        {!canEdit && <p className="mt-3 text-sm text-portal-muted">{state.started ? 'Only an organization owner can change this setup. You can follow its progress here.' : 'An organization owner has not started the setup yet.'}</p>}
      </PortalCard>
      <div className="mt-4 space-y-4">
        {state.steps.map((s) => {
          const def = stepDef(s.step_no);
          if (!def) return null;
          const view = viewOf(s.step_no, statuses);
          return (
            <PortalCard key={s.step_no} eyebrow={`Step ${s.step_no}`} title={s.title} actions={<PortalStatusPill label={stepLabel(def, view)} tone={TONE[view]} />}>
              {body(s.step_no, view, s)}
            </PortalCard>
          );
        })}
      </div>
    </>
  );
}
