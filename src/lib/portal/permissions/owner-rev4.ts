import { RATE_LIMIT_POLICIES } from '../ratelimit/policies';

/**
 * Mirror of migration 0005 REV4 (review draft; NOT applied; separate from rev3.1, whose mirror is owner.ts). Decisions D-V1, D-V2, D-V7, D-V9.
 * The database is authoritative: this module exists for typing, early UX denial and parity tests (tests/portal/owner-rev4.test.ts parses the rev4 SQL
 * and fails if any list or number here differs). Pure module: no I/O.
 */

/** Identity-verification methods an operator may record (the list is a CHECK constraint in the database). Never identity documents or personal data. */
export const RECOVERY_VERIFICATION_METHODS = ['video_id_check', 'in_person', 'notarized_statement', 'verified_business_contact'] as const;
export type RecoveryVerificationMethod = (typeof RECOVERY_VERIFICATION_METHODS)[number];
/** A case identifier only: letters, digits and . _ : / # - , 1 to 80 characters (a CHECK constraint in the database). */
export const RECOVERY_REF_PATTERN = /^[A-Za-z0-9._:/#-]{1,80}$/;

export const RECOVERY_COOLOFF_HOURS = 24; // starts at the SECOND approval for operator-initiated requests
export const RECOVERY_APPROVAL_DEADLINE_HOURS = 72; // the second approval must come within 72 hours of the initiation
export const RECOVERY_VALIDITY_DAYS_AFTER_COOLOFF = 7;
export const RECOVERY_MAX_WINDOWS_PER_REQUEST = 3;
export const OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H = 5;
export const OPERATOR_INITIATIONS_PER_OWNER_PER_7D = 2;

export const RATE_LIMIT_POLICIES_REV4 = {
  ...RATE_LIMIT_POLICIES,
  operator_recovery_initiate: { maxAttempts: OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H, windowSecs: 86400, blockSecs: 86400 },
  operator_recovery_target: { maxAttempts: OPERATOR_INITIATIONS_PER_OWNER_PER_7D, windowSecs: 604800, blockSecs: 604800 },
} as const;

export const OWNER_RECOVERY_STATUSES_REV4 = ['none', 'awaiting_approval', 'cooling_off', 'ready', 'locked'] as const;
export type OwnerRecoveryStatusRev4 = (typeof OWNER_RECOVERY_STATUSES_REV4)[number];
export const RECOVERY_REQUEST_STATUSES = ['awaiting_approval', 'pending', 'cancelled', 'completed', 'expired'] as const;

/** Result codes of the rev4 owner-side window and claim RPCs (rpc_owner_open_factor_window, rpc_owner_claim_factor, rpc_owner_revoke_factor_window). */
export const OWNER_WINDOW_CODES_REV4 = [
  'window_open', 'factor_approved', 'revoked', 'not_an_owner', 'invalid_input', 'step_up_required', 'operator_authorization_required', 'unapproved_factor_present',
  'recovery_required', 'unknown_state', 'no_open_window', 'already_approved', 'factor_not_eligible', 'window_already_open',
] as const;
/** Result codes of the operator RPCs (authorize, revoke window, initiate, approve, cancel). */
export const OPERATOR_RECOVERY_CODES_REV4 = [
  'authorized', 'revoked', 'awaiting_approval', 'approved', 'request_cancelled', 'forbidden', 'step_up_required', 'self_change_not_allowed', 'target_not_eligible',
  'recovery_not_ready', 'recovery_cooling_off', 'recovery_awaiting_approval', 'already_enrolled', 'unapproved_factor_present', 'unknown_state', 'window_already_open',
  'no_open_window', 'factor_removal_required', 'recovery_window_limit', 'first_enrolment_applies', 'recovery_locked', 'request_pending', 'throttled', 'request_not_found',
  'request_expired', 'request_not_awaiting', 'self_approval_not_allowed', 'state_changed', 'verification_ref_reused', 'notarization_not_sufficient', 'approval_rejected',
  'request_not_open',
] as const;
/** Result codes of the owner recovery RPCs (set codes, request, cancel). */
export const OWNER_RECOVERY_CODES_REV4 = [
  'codes_issued', 'request_created', 'request_cancelled', 'not_available', 'code_reused', 'step_up_required', 'throttled', 'request_not_accepted', 'recovery_locked',
  'request_pending', 'no_pending_request',
] as const;
const SUCCESS = {
  window: ['window_open', 'factor_approved', 'revoked'],
  operator: ['authorized', 'revoked', 'awaiting_approval', 'approved', 'request_cancelled'],
  recovery: ['codes_issued', 'request_created', 'request_cancelled'],
} as const;

export type CodeResultRev4<C extends string> = { readonly ok: true; readonly code: C } | { readonly ok: false; readonly code: C | 'invalid_response' };
function parse<C extends string>(raw: unknown, known: readonly C[], success: readonly string[]): CodeResultRev4<C> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, code: 'invalid_response' };
  const o = raw as Record<string, unknown>;
  if (typeof o.ok !== 'boolean' || typeof o.code !== 'string' || !(known as readonly string[]).includes(o.code)) return { ok: false, code: 'invalid_response' };
  if (o.ok !== success.includes(o.code)) return { ok: false, code: 'invalid_response' };
  return o.ok ? { ok: true, code: o.code as C } : { ok: false, code: o.code as C };
}
export const parseOwnerWindowResultRev4 = (raw: unknown) => parse(raw, OWNER_WINDOW_CODES_REV4, SUCCESS.window);
export const parseOperatorRecoveryResultRev4 = (raw: unknown) => parse(raw, OPERATOR_RECOVERY_CODES_REV4, SUCCESS.operator);
export const parseOwnerRecoveryResultRev4 = (raw: unknown) => parse(raw, OWNER_RECOVERY_CODES_REV4, SUCCESS.recovery);

export type RecoveryEvidenceInput = {
  readonly initiatorId: string;
  readonly approverId: string;
  readonly initiatorMethod: string;
  readonly initiatorRef: string;
  readonly approverMethod: string;
  readonly approverRef: string;
};
export type RecoveryEvidenceDenial =
  | 'self_approval_not_allowed' | 'invalid_method' | 'invalid_ref' | 'verification_ref_reused' | 'notarization_not_sufficient';

/**
 * Early (UX) check of the two-person evidence rules, identical to the database rules: different accounts, listed methods, reference pattern, different
 * references, and a notarized statement is supplementary (never the only method). The database enforces all of it again; this never replaces it.
 * Different PEOPLE (not only accounts) is a procedure of the written identity-verification policy; the database can only distinguish accounts.
 */
export function checkRecoveryEvidence(i: RecoveryEvidenceInput): { readonly ok: true } | { readonly ok: false; readonly reason: RecoveryEvidenceDenial } {
  if (i.initiatorId === i.approverId) return { ok: false, reason: 'self_approval_not_allowed' };
  const methods = RECOVERY_VERIFICATION_METHODS as readonly string[];
  if (!methods.includes(i.initiatorMethod) || !methods.includes(i.approverMethod)) return { ok: false, reason: 'invalid_method' };
  if (!RECOVERY_REF_PATTERN.test(i.initiatorRef) || !RECOVERY_REF_PATTERN.test(i.approverRef)) return { ok: false, reason: 'invalid_ref' };
  if (i.initiatorRef === i.approverRef) return { ok: false, reason: 'verification_ref_reused' };
  if (i.initiatorMethod === 'notarized_statement' && i.approverMethod === 'notarized_statement') return { ok: false, reason: 'notarization_not_sufficient' };
  return { ok: true };
}
