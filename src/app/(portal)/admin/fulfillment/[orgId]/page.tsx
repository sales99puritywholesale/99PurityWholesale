import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { adminOnboardingGet, documentUrl } from '@/lib/portal/onboarding/server';
import {
  GATE_TITLES, LABEL_TEMPLATE_LABELS, STEP_COUNT, STEP_GATES, STORE_METHOD_LABELS, approvedCount, canReview, missingGates, stepDef, stepLabel, viewOf, type StepStatus, type StepView,
} from '@/lib/portal/onboarding/steps';
import { formatCents } from '@/lib/portal/billing/invoices';
import { uuid } from '@/lib/portal/onboarding/schemas';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { PortalCard } from '@/components/portal/portal-card';
import { PortalStatusPill, type StatusTone } from '@/components/portal/portal-status';
import { Field, Flash, INPUT, type Sp } from '@/components/portal/commerce-ui';
import {
  createSetupInvoicesAction, goLiveAction, offerAgreementAction, reviewLabelAction, reviewMappingAction, reviewStepAction, setFundingAction,
} from '../../onboarding-actions';

export const metadata: Metadata = { title: 'Fulfillment onboarding' };
const TONE: Record<StepView, StatusTone> = { locked: 'neutral', todo: 'info', in_progress: 'info', submitted: 'warning', approved: 'success', rejected: 'danger' };
const ITEM_TONE: Record<string, StatusTone> = { draft: 'neutral', submitted: 'warning', approved: 'success', rejected: 'danger', verified: 'success' };

export default async function Page({ params, searchParams }: { params: { orgId: string }; searchParams: Sp }) {
  const path = `/admin/fulfillment/${params.orgId}`;
  await requireStaffCapability(path, 'onboarding.review');
  if (!uuid.safeParse(params.orgId).success) notFound();
  const res = await adminOnboardingGet(params.orgId);
  if (!res.ok) notFound();
  const { organization: org, state, gates, submissions, events } = res.data;
  const ctx = await getStaffAccessContext();
  const canFinance = evaluateCapability(ctx, 'financial.write').allowed;
  const canGoLive = evaluateCapability(ctx, 'onboarding.golive').allowed;
  const statuses = Object.fromEntries(state.steps.map((s) => [s.step_no, s.status as StepStatus])) as Record<number, StepStatus>;
  const recorded = new Set(gates.filter((g) => g.status === 'recorded').map((g) => g.code));
  const latest = (no: number) => submissions.filter((s) => s.step_no === no).sort((a, b) => b.version - a.version)[0];
  const urls = new Map<string, string>();
  const paths = [...state.labels.map((l) => l.storage_path), ...(state.agreement ? [state.agreement.offered_document.storage_path, ...(state.agreement.signed_document ? [state.agreement.signed_document.storage_path] : [])] : [])];
  await Promise.all(paths.map(async (p) => { const u = await documentUrl(p); if (u) urls.set(p, u); }));
  const link = (p: string, name: string) => (urls.get(p) ? <a className="underline" href={urls.get(p)} target="_blank" rel="noopener noreferrer">{name}</a> : <span>{name}</span>);
  const hidden = <input type="hidden" name="organizationId" value={org.id} />;

  const itemReview = (action: (f: FormData) => Promise<void>, id: string) => (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      {hidden}
      <input type="hidden" name="id" value={id} />
      <input name="reason" maxLength={300} placeholder="Reason (needed to reject)" className={`${INPUT} max-w-xs`} />
      <button name="decision" value="approve" type="submit" className="portal-btn">Approve</button>
      <button name="decision" value="reject" type="submit" className="portal-btn-quiet">Reject</button>
    </form>
  );
  const stepReview = (no: number) => (
    <form action={reviewStepAction} className="mt-4 grid gap-3 border-t border-portal-border pt-4 sm:grid-cols-2">
      {hidden}
      <input type="hidden" name="stepNo" value={no} />
      <Field label="Reason (needed to reject)"><input name="reason" maxLength={300} className={INPUT} /></Field>
      <Field label="Instructions for the customer (optional)"><input name="instructions" maxLength={500} className={INPUT} /></Field>
      <div className="flex gap-2 sm:col-span-2">
        <button name="decision" value="approve" type="submit" className="portal-btn">Approve step {no}</button>
        <button name="decision" value="reject" type="submit" className="portal-btn-quiet">Send back</button>
      </div>
    </form>
  );
  const gateNote = (no: number) => {
    const miss = missingGates(no, recorded);
    return (STEP_GATES[no]?.length ?? 0) > 0 ? (
      <p className={`mt-2 text-xs ${miss.length ? 'text-portal-danger' : 'text-portal-muted'}`}>
        Needs gates: {STEP_GATES[no]?.join(', ')}{miss.length ? ` (missing ${miss.join(', ')}: ${miss.map((g) => GATE_TITLES[g]).join('; ')})` : ' (all recorded)'}. <Link className="underline" href="/admin/fulfillment/gates">Gates</Link>
      </p>
    ) : null;
  };

  const detail = (no: number) => {
    switch (no) {
      case 1:
        return (
          <ul className="divide-y divide-portal-border text-sm">
            {state.mappings.map((m) => (
              <li key={m.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-portal-text">{m.product_name} {m.spec} <span className="portal-id text-xs">{m.external_sku}</span> <span className="text-xs text-portal-muted">x{m.units_per_pack}, {m.internal_sku}{m.barcode ? `, barcode ${m.barcode}` : ''}{m.weight_grams ? `, ${m.weight_grams} g` : ''}</span></span>
                  <PortalStatusPill label={m.status} tone={ITEM_TONE[m.status] ?? 'neutral'} />
                </div>
                {m.status === 'submitted' && itemReview(reviewMappingAction, m.id)}
              </li>
            ))}
            {state.mappings.length === 0 && <li className="py-2.5 text-portal-muted">No products yet.</li>}
          </ul>
        );
      case 2:
        return (
          <>
            <ul className="divide-y divide-portal-border text-sm">
              {state.labels.map((l) => {
                const m = state.mappings.find((x) => x.id === l.sku_mapping_id);
                return (
                  <li key={l.id} className="py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-portal-text">{m?.product_name} {m?.spec} ({LABEL_TEMPLATE_LABELS[l.template]}): {link(l.storage_path, l.file_name)}</span>
                      <PortalStatusPill label={l.status} tone={ITEM_TONE[l.status] ?? 'neutral'} />
                    </div>
                    {l.status === 'submitted' && itemReview(reviewLabelAction, l.id)}
                  </li>
                );
              })}
              {state.labels.length === 0 && <li className="py-2.5 text-portal-muted">No label artwork yet.</li>}
            </ul>
            {gateNote(2)}
          </>
        );
      case 3:
        return <p className="text-sm text-portal-text">{state.packaging.options.find((o) => o.id === state.packaging.selection?.option_id)?.name ?? 'No packaging selected.'}{state.packaging.selection?.notes ? ` (${state.packaging.selection.notes})` : ''}</p>;
      case 4:
        return state.store ? (
          <p className="text-sm text-portal-text">{STORE_METHOD_LABELS[state.store.method]} {state.store.store_url ?? ''}{state.store.webhook_url ? `, webhook ${state.store.webhook_url}` : ''}{state.store.notes ? ` (${state.store.notes})` : ''} <PortalStatusPill label={state.store.status} tone={ITEM_TONE[state.store.status] ?? 'neutral'} /></p>
        ) : <p className="text-sm text-portal-muted">No store connection yet.</p>;
      case 5:
        return <p className="text-sm text-portal-text">{state.test_order_ready ? 'A sandbox order was received.' : 'No sandbox order yet. After checking a test order by hand you can approve this step directly.'}</p>;
      case 6:
        return (
          <div className="space-y-3 text-sm text-portal-text">
            <p>
              Agreement:{' '}
              {state.agreement ? <>{link(state.agreement.offered_document.storage_path, state.agreement.offered_document.file_name)} <PortalStatusPill label={state.agreement.status === 'signed' ? 'Signed' : 'Offered'} tone={state.agreement.status === 'signed' ? 'success' : 'warning'} />{state.agreement.status === 'signed' ? <span className="text-xs text-portal-muted"> by {state.agreement.signer_name}, {state.agreement.signer_title}{state.agreement.signed_document ? <> ({link(state.agreement.signed_document.storage_path, 'signed copy')})</> : null}</span> : null}</> : 'not offered yet'}
            </p>
            {(!state.agreement || state.agreement.status !== 'signed') && (
              <form action={offerAgreementAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
                {hidden}
                <Field label="Agreement document (PDF, PNG or JPEG)"><input name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className={INPUT} /></Field>
                <button type="submit" className="portal-btn-quiet">{state.agreement ? 'Replace agreement' : 'Send agreement'}</button>
              </form>
            )}
            <p>
              Setup invoice:{' '}
              {state.setup_invoice ? <><Link className="portal-id" href={`/admin/invoices/${state.setup_invoice.invoice_id}`}>{state.setup_invoice.invoice_number}</Link> {formatCents(state.setup_invoice.total_cents)} <PortalStatusPill label={state.setup_invoice.status === 'paid' ? 'Paid' : 'Unpaid'} tone={state.setup_invoice.status === 'paid' ? 'success' : 'warning'} /></> : state.funding?.type === 'waived' ? 'waived' : 'not created yet'}
            </p>
            {!state.funding && canFinance && (
              <form action={createSetupInvoicesAction} className="flex flex-wrap items-end gap-2">
                {hidden}
                <Field label="Setup fee (USD)"><input name="setup" inputMode="decimal" defaultValue="4000.00" className={INPUT} /></Field>
                <Field label="Prepaid funding (USD)"><input name="funding" inputMode="decimal" defaultValue="1000.00" className={INPUT} /></Field>
                <button type="submit" className="portal-btn-quiet">Create setup invoices (fresh code needed)</button>
              </form>
            )}
          </div>
        );
      case 7:
        return (
          <div className="space-y-3 text-sm text-portal-text">
            <p>
              {state.funding ? <>{state.funding.type === 'waived' ? 'Waived' : state.funding.type === 'credit_terms' ? 'Credit terms' : `${formatCents(state.funding.amount_cents)} by invoice`}{state.funding.invoice_id ? <> <Link className="portal-id" href={`/admin/invoices/${state.funding.invoice_id}`}>{state.funding.invoice_number}</Link></> : null} <PortalStatusPill label={state.funding.met ? 'Met' : 'Not met yet'} tone={state.funding.met ? 'success' : 'warning'} /></> : 'No funding requirement yet (create the setup invoices in step 6).'}
            </p>
            {canFinance && (
              <form action={setFundingAction} className="flex flex-wrap items-end gap-2">
                {hidden}
                <Field label="Replace the requirement with">
                  <select name="type" className={INPUT} defaultValue="waived"><option value="waived">Waiver</option><option value="credit_terms">Approved credit terms</option></select>
                </Field>
                <Field label="Reason (required)"><input name="reason" required maxLength={300} className={INPUT} /></Field>
                <button type="submit" className="portal-btn-quiet">Apply (fresh code needed)</button>
              </form>
            )}
          </div>
        );
      case 8: {
        const s = latest(8);
        return s ? <pre className="overflow-x-auto rounded-lg bg-portal-canvas p-3 text-xs text-portal-text">{JSON.stringify(s.data, null, 2)}</pre> : <p className="text-sm text-portal-muted">Not submitted yet.</p>;
      }
      default:
        return (
          <div className="space-y-2 text-sm text-portal-text">
            <p>{state.instance.status === 'live' ? `Live since ${state.instance.live_at?.slice(0, 10)}.` : 'Steps 1 to 8 approved and gates G1, G2, G4, G5, G6 recorded are required.'}</p>
            {gateNote(9)}
            {state.instance.status !== 'live' && (canGoLive ? (
              <form action={goLiveAction} className="mt-2">
                {hidden}
                <button type="submit" className="portal-btn">Go live (fresh code needed)</button>
              </form>
            ) : <p className="text-xs text-portal-muted">Only an administrator can take an organization live.</p>)}
          </div>
        );
    }
  };

  return (
    <>
      <PortalPageHeader
        area="admin"
        title={org.name}
        description={`${org.code}, terms ${org.payment_terms}. ${approvedCount(statuses)} of ${STEP_COUNT} steps approved${state.instance.status === 'live' ? ', live' : ''}.`}
        crumbs={[{ label: 'Fulfillment', href: '/admin/fulfillment' }]}
      />
      <Flash sp={searchParams} stepUpNext={path} />
      {!state.started && <p className="mb-4 text-sm text-portal-muted">The customer has not started the setup yet. You can already prepare the agreement and setup invoices from step 6 once steps 1 to 3 are approved.</p>}
      <div className="space-y-4">
        {state.steps.map((s) => {
          const def = stepDef(s.step_no);
          if (!def) return null;
          const view = viewOf(s.step_no, statuses);
          const reviewable = canReview(s.step_no, statuses) && s.step_no !== 9 && !(s.step_no === 5 && view === 'locked');
          return (
            <PortalCard key={s.step_no} eyebrow={`Step ${s.step_no} (${def.owner === 'staff' ? 'staff' : 'customer'})`} title={s.title} actions={<PortalStatusPill label={stepLabel(def, view)} tone={TONE[view]} />}>
              {view === 'locked' ? <p className="text-sm text-portal-muted">Locked until: {def.dependsOn.filter((d) => statuses[d] !== 'approved').map((d) => stepDef(d)?.title).join(', ')}.</p> : detail(s.step_no)}
              {s.review_reason && s.status === 'rejected' && <p className="mt-2 text-xs text-portal-danger">Sent back: {s.review_reason}{s.review_instructions ? ` (${s.review_instructions})` : ''}</p>}
              {reviewable && s.step_no !== 9 && stepReview(s.step_no)}
            </PortalCard>
          );
        })}
      </div>
      <PortalCard title="History" className="mt-4">
        {events.length === 0 ? <p className="text-sm text-portal-muted">No events yet.</p> : (
          <ol className="space-y-1 text-sm text-portal-text">
            {events.map((e, i) => <li key={i}>{e.event}{e.step_no ? ` (step ${e.step_no})` : ''} <span className="text-xs text-portal-muted">{e.at.slice(0, 16).replace('T', ' ')}, {e.actor_kind}{e.note ? `: ${e.note}` : ''}</span></li>)}
          </ol>
        )}
      </PortalCard>
    </>
  );
}
