/**
 * P5 fulfillment onboarding model (pure: no server imports). Mirrors the P5 migration draft (supabase/review/p5/); the database is authoritative.
 * Nine steps, each with an owner, prerequisites (a step is LOCKED until all of its prerequisites are approved) and whether it needs a staff review.
 * The step definitions live as data in the database (`onboarding_step_defs`); this file mirrors that seed and a test fails if they differ.
 */
export const STEP_STATUSES = ['todo', 'in_progress', 'submitted', 'approved', 'rejected'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
/** What a customer sees: the stored status, or `locked` while a prerequisite is not approved. */
export type StepView = StepStatus | 'locked';

export type StepOwner = 'customer' | 'staff';
export type StepDef = { readonly no: number; readonly key: string; readonly title: string; readonly owner: StepOwner; readonly dependsOn: readonly number[] };

export const STEP_DEFS: readonly StepDef[] = [
  { no: 1, key: 'products', title: 'Add your products', owner: 'customer', dependsOn: [] },
  { no: 2, key: 'labels', title: 'Design your labels', owner: 'customer', dependsOn: [1] },
  { no: 3, key: 'packaging', title: 'Choose how we pack', owner: 'customer', dependsOn: [1] },
  { no: 4, key: 'store', title: 'Connect your store', owner: 'customer', dependsOn: [1] },
  { no: 5, key: 'test_order', title: 'Send a test order', owner: 'customer', dependsOn: [1, 4] },
  { no: 6, key: 'agreement', title: 'Sign your agreement and pay setup', owner: 'staff', dependsOn: [1, 2, 3] },
  { no: 7, key: 'funding', title: 'Meet the funding requirement', owner: 'customer', dependsOn: [6] },
  { no: 8, key: 'launch_review', title: 'Launch review', owner: 'customer', dependsOn: [1, 2, 3, 4, 5, 6, 7] },
  { no: 9, key: 'go_live', title: 'Go live', owner: 'staff', dependsOn: [8] },
] as const;

export const STEP_COUNT = STEP_DEFS.length;
export const stepDef = (no: number): StepDef | undefined => STEP_DEFS.find((s) => s.no === no);
export const isStepStatus = (v: unknown): v is StepStatus => typeof v === 'string' && (STEP_STATUSES as readonly string[]).includes(v);

export const STEP_STATUS_LABELS: Readonly<Record<StepView, string>> = {
  locked: 'Locked',
  todo: 'Your step',
  in_progress: 'In progress',
  submitted: 'Waiting for review',
  approved: 'Done',
  rejected: 'Needs changes',
};
/** The staff-owned steps show "Waiting on 99 Purity" instead of "Your step". */
export const stepLabel = (def: StepDef, view: StepView): string => (def.owner === 'staff' && (view === 'todo' || view === 'in_progress') ? 'Waiting on 99 Purity' : STEP_STATUS_LABELS[view]);

/** Statuses of every step by number. A step is `locked` while any prerequisite is not approved (and is not itself already approved or submitted). */
export function viewOf(no: number, statuses: Readonly<Record<number, StepStatus>>): StepView {
  const def = stepDef(no);
  if (!def) throw new RangeError('unknown step');
  const own = statuses[no] ?? 'todo';
  if (own === 'approved' || own === 'submitted') return own;
  return def.dependsOn.every((d) => statuses[d] === 'approved') ? own : 'locked';
}

export const approvedCount = (statuses: Readonly<Record<number, StepStatus>>): number => STEP_DEFS.filter((s) => statuses[s.no] === 'approved').length;

/** The first customer-owned step that needs the customer (todo, in progress or rejected and not locked); null when none. */
export function nextCustomerStep(statuses: Readonly<Record<number, StepStatus>>): StepDef | null {
  return STEP_DEFS.find((s) => s.owner === 'customer' && ['todo', 'in_progress', 'rejected'].includes(viewOf(s.no, statuses))) ?? null;
}

/** A customer may submit a customer-owned step that is not locked and is todo, in progress or rejected. */
export const canSubmit = (no: number, statuses: Readonly<Record<number, StepStatus>>): boolean => {
  const def = stepDef(no);
  return !!def && def.owner === 'customer' && ['todo', 'in_progress', 'rejected'].includes(viewOf(no, statuses));
};

/** Staff may review a submitted step; the staff-owned steps (6 and 9) are decided by staff without a customer submission. */
export const canReview = (no: number, statuses: Readonly<Record<number, StepStatus>>): boolean => {
  const def = stepDef(no);
  if (!def) return false;
  const v = viewOf(no, statuses);
  return def.owner === 'staff' ? v !== 'locked' && v !== 'approved' : v === 'submitted';
};

// ------------------------------------------------------------------------------------------------------------------------------ compliance gates
export const GATE_CODES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
export type GateCode = (typeof GATE_CODES)[number];
export const GATE_TITLES: Readonly<Record<GateCode, string>> = {
  G1: 'Product classification and regulatory status',
  G2: 'Labeling, claims and marketing wording',
  G3: 'Payment-provider and legal approval (wallet)',
  G4: 'Supplier qualification and quality',
  G5: 'Shipping eligibility, carriers, licensing and insurance',
  G6: 'Go-live authorization',
};
/** Gates that must be recorded before a step can be approved (G3 only concerns the wallet and is not required here). */
export const STEP_GATES: Readonly<Record<number, readonly GateCode[]>> = { 2: ['G2'], 9: ['G1', 'G2', 'G4', 'G5', 'G6'] };
export const missingGates = (no: number, recorded: ReadonlySet<string>): GateCode[] => (STEP_GATES[no] ?? []).filter((g) => !recorded.has(g));

// ------------------------------------------------------------------------------------------------------------------------------ funding
export const FUNDING_TYPES = ['prepay_invoice', 'deposit_invoice', 'credit_terms', 'waived'] as const;
export type FundingType = (typeof FUNDING_TYPES)[number];
export const FUNDING_LABELS: Readonly<Record<FundingType, string>> = {
  prepay_invoice: 'Prepay invoice',
  deposit_invoice: 'Deposit invoice',
  credit_terms: 'Credit terms',
  waived: 'Waived by 99 Purity',
};
export const FUNDING_STATUSES = ['unmet', 'met', 'waived'] as const;
/** Met by confirmed payment (invoice paid), by credit terms approved, or waived by staff with a reason. A customer claim alone never meets it. */
export function fundingMet(type: FundingType, status: string, invoicePaid: boolean): boolean {
  if (status === 'waived' || type === 'waived') return status === 'waived';
  if (type === 'credit_terms') return status === 'met';
  return invoicePaid;
}

// ------------------------------------------------------------------------------------------------------------------------------ products, labels, packaging, store
export const LABEL_TEMPLATES = ['ml3', 'ml10'] as const;
export const LABEL_TEMPLATE_LABELS: Readonly<Record<(typeof LABEL_TEMPLATES)[number], string>> = { ml3: '3 ml vial label', ml10: '10 ml vial label' };
export const STORE_METHODS = ['api', 'woocommerce', 'shopify', 'manual'] as const;
export const STORE_METHOD_LABELS: Readonly<Record<(typeof STORE_METHODS)[number], string>> = { api: 'Our API', woocommerce: 'WooCommerce', shopify: 'Shopify', manual: 'Manual (send orders by email)' };
export const REVIEW_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const DOCUMENT_KINDS = ['label_artwork', 'agreement', 'agreement_signed', 'certificate', 'payment_proof', 'gate_evidence', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const documentOk = (contentType: string, bytes: number): boolean => (DOCUMENT_TYPES as readonly string[]).includes(contentType) && Number.isSafeInteger(bytes) && bytes >= 1 && bytes <= DOCUMENT_MAX_BYTES;
/** Storage path: `<organization id>/<document id>.<ext>`; the organization prefix is what the storage policies check. */
export const documentPath = (organizationId: string, documentId: string, contentType: string): string =>
  `${organizationId}/${documentId}.${contentType === 'application/pdf' ? 'pdf' : contentType === 'image/png' ? 'png' : 'jpg'}`;
