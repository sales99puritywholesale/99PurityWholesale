import { RATE_LIMIT_POLICIES } from '../ratelimit/policies';
import { OWNER_RECOVERY_STATUSES } from './owner';

/**
 * Mirror of migration 0005 REV5 (review draft; NOT applied; rev4 and rev3.1 are preserved unchanged, their mirrors are owner-rev4.ts and owner.ts).
 * The database is authoritative: this module exists for typing, early UX denial and parity tests (tests/portal/owner-rev5.test.ts parses the rev5 SQL and fails if any
 * list or number here differs). Pure module: no I/O. Nothing here proves PostgreSQL behavior; it only proves that this file and the SQL text agree.
 */

/** Identity-verification methods an operator may record (a CHECK constraint). rev5 (F5): a notarized statement is NOT a method; it is the supplementary flag next to one. */
export const RECOVERY_VERIFICATION_METHODS_REV5 = ['video_id_check', 'in_person', 'verified_business_contact'] as const;
export type RecoveryVerificationMethodRev5 = (typeof RECOVERY_VERIFICATION_METHODS_REV5)[number];
/** A case identifier only: letters, digits and . _ : / # - , 1 to 80 characters (a CHECK constraint). Never personal data or document numbers. */
export const RECOVERY_REF_PATTERN_REV5 = /^[A-Za-z0-9._:/#-]{1,80}$/;

export const RECOVERY_COOLOFF_HOURS_REV5 = 24; // starts at the SECOND approval for operator-initiated requests
export const RECOVERY_APPROVAL_DEADLINE_HOURS_REV5 = 72;
export const RECOVERY_VALIDITY_DAYS_AFTER_COOLOFF_REV5 = 7;
export const RECOVERY_WINDOWS_BEFORE_ATTESTATION = 3;
export const RECOVERY_WINDOWS_AFTER_ATTESTATION = 6;
export const RECOVERY_WINDOW_MAX_MINUTES = 60;
export const OWNER_CANCEL_LOCK_HOURS = 24; // applies only while the owner's approved factor is intact
export const OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H_REV5 = 5;
export const OPERATOR_INITIATIONS_PER_OWNER_PER_7D_REV5 = 2;
/** Every mutating recovery RPC refuses any other isolation level (SQLSTATE 25000) before any lock or write. */
export const REQUIRED_TRANSACTION_ISOLATION = 'read committed';

export const RATE_LIMIT_POLICIES_REV5 = {
  ...RATE_LIMIT_POLICIES,
  operator_recovery_initiate: { maxAttempts: OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H_REV5, windowSecs: 86400, blockSecs: 86400 },
  operator_recovery_target: { maxAttempts: OPERATOR_INITIATIONS_PER_OWNER_PER_7D_REV5, windowSecs: 604800, blockSecs: 604800 },
} as const;

export const OWNER_RECOVERY_STATUSES_REV5 = ['none', 'awaiting_approval', 'cooling_off', 'ready', 'stranded', 'locked'] as const;
export type OwnerRecoveryStatusRev5 = (typeof OWNER_RECOVERY_STATUSES_REV5)[number];
export const RECOVERY_REQUEST_STATUSES_REV5 = ['awaiting_approval', 'pending', 'cancelled', 'completed', 'expired'] as const;
/** Categories of rpc_staff_list_owner_factor_loss (the detective control for factor removal outside the sanctioned procedure). */
export const FACTOR_LOSS_CATEGORIES = ['stranded', 'unexplained'] as const;
/** Fixed revocation codes of the AUTOMATIC window revocation (never free text). */
export const AUTO_REVOKE_CODES = ['request_cancelled', 'request_expired'] as const;

/** Result codes of the owner-side window and claim RPCs. */
export const OWNER_WINDOW_CODES_REV5 = [
  'window_open', 'factor_approved', 'revoked', 'not_an_owner', 'invalid_input', 'step_up_required', 'operator_authorization_required', 'unapproved_factor_present',
  'recovery_required', 'unknown_state', 'no_open_window', 'already_approved', 'factor_not_eligible', 'window_already_open', 'removal_attestation_required',
] as const;
/** Result codes of the operator RPCs (authorize, revoke window, initiate, approve, cancel, attest removal, review factor loss). */
export const OPERATOR_RECOVERY_CODES_REV5 = [
  'authorized', 'revoked', 'awaiting_approval', 'approved', 'request_cancelled', 'attested', 'already_attested', 'reviewed', 'forbidden', 'step_up_required',
  'self_change_not_allowed', 'target_not_eligible', 'recovery_not_ready', 'recovery_cooling_off', 'recovery_awaiting_approval', 'already_enrolled', 'unapproved_factor_present',
  'unknown_state', 'window_already_open', 'no_open_window', 'recovery_window_limit', 'first_enrolment_applies', 'recovery_locked', 'request_pending', 'throttled',
  'request_not_found', 'request_expired', 'request_not_awaiting', 'self_approval_not_allowed', 'state_changed', 'initiator_not_active', 'verification_ref_reused',
  'approval_rejected', 'request_not_open', 'no_open_recovery_window', 'request_not_usable', 'factors_still_present', 'count_mismatch', 'attestation_rejected',
] as const;
/** Result codes of the owner recovery RPCs (set codes, request, cancel). */
export const OWNER_RECOVERY_CODES_REV5 = [
  'codes_issued', 'request_created', 'request_cancelled', 'not_available', 'code_reused', 'step_up_required', 'throttled', 'request_not_accepted', 'recovery_locked',
  'request_pending', 'no_pending_request',
] as const;
const SUCCESS = {
  window: ['window_open', 'factor_approved', 'revoked'],
  operator: ['authorized', 'revoked', 'awaiting_approval', 'approved', 'request_cancelled', 'attested', 'already_attested', 'reviewed'],
  recovery: ['codes_issued', 'request_created', 'request_cancelled'],
} as const;

export type CodeResultRev5<C extends string> = { readonly ok: true; readonly code: C } | { readonly ok: false; readonly code: C | 'invalid_response' };
function parse<C extends string>(raw: unknown, known: readonly C[], success: readonly string[]): CodeResultRev5<C> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, code: 'invalid_response' };
  const o = raw as Record<string, unknown>;
  if (typeof o.ok !== 'boolean' || typeof o.code !== 'string' || !(known as readonly string[]).includes(o.code)) return { ok: false, code: 'invalid_response' };
  if (o.ok !== success.includes(o.code)) return { ok: false, code: 'invalid_response' };
  return o.ok ? { ok: true, code: o.code as C } : { ok: false, code: o.code as C };
}
export const parseOwnerWindowResultRev5 = (raw: unknown) => parse(raw, OWNER_WINDOW_CODES_REV5, SUCCESS.window);
export const parseOperatorRecoveryResultRev5 = (raw: unknown) => parse(raw, OPERATOR_RECOVERY_CODES_REV5, SUCCESS.operator);
export const parseOwnerRecoveryResultRev5 = (raw: unknown) => parse(raw, OWNER_RECOVERY_CODES_REV5, SUCCESS.recovery);

/** True if the production owner-context parser accepts every rev5 status (F7: rev4 would have been rejected into a deny-all context for awaiting_approval). */
export const PRODUCTION_PARSER_ACCEPTS_ALL_REV5_STATUSES = OWNER_RECOVERY_STATUSES_REV5.every((s) => (OWNER_RECOVERY_STATUSES as readonly string[]).includes(s));

export type RecoveryEvidenceInputRev5 = {
  readonly initiatorId: string;
  readonly approverId: string;
  readonly initiatorMethod: string;
  readonly initiatorRef: string;
  readonly approverMethod: string;
  readonly approverRef: string;
};
export type RecoveryEvidenceDenialRev5 = 'self_approval_not_allowed' | 'invalid_method' | 'invalid_ref' | 'verification_ref_reused';

/**
 * Early (UX) check of the two-person evidence rules, identical to the database rules: different accounts, one of the THREE real methods for EACH operator (a notarized
 * statement is never a method, so it can never be the only evidence), reference pattern, different references. The database enforces all of it again; this never replaces
 * it. Different PEOPLE (not only accounts) is a procedure of the written identity-verification policy; the database can only distinguish accounts.
 */
export function checkRecoveryEvidenceRev5(i: RecoveryEvidenceInputRev5): { readonly ok: true } | { readonly ok: false; readonly reason: RecoveryEvidenceDenialRev5 } {
  if (i.initiatorId === i.approverId) return { ok: false, reason: 'self_approval_not_allowed' };
  const methods = RECOVERY_VERIFICATION_METHODS_REV5 as readonly string[];
  if (!methods.includes(i.initiatorMethod) || !methods.includes(i.approverMethod)) return { ok: false, reason: 'invalid_method' };
  if (!RECOVERY_REF_PATTERN_REV5.test(i.initiatorRef) || !RECOVERY_REF_PATTERN_REV5.test(i.approverRef)) return { ok: false, reason: 'invalid_ref' };
  if (i.initiatorRef === i.approverRef) return { ok: false, reason: 'verification_ref_reused' };
  return { ok: true };
}

/** Maximum windows a request may have issued: 3 before the removal attestation, 6 after it (a failed enrolment after removal stays recoverable). */
export const maxRecoveryWindows = (removalAttested: boolean): number => (removalAttested ? RECOVERY_WINDOWS_AFTER_ATTESTATION : RECOVERY_WINDOWS_BEFORE_ATTESTATION);

/**
 * Does the owner's own cancellation lock apply? Only while the approved factor is intact (database state 'approved'); once the factor was removed it never applies, so a
 * cancellation cannot leave an owner without a usable recovery path. Mirrors the lock checks of rpc_owner_recovery_request and rpc_staff_initiate_owner_recovery.
 */
export function ownerCancelLockApplies(factorState: string, ownerCancelledWithinHours: number | null): boolean {
  return factorState === 'approved' && ownerCancelledWithinHours !== null && ownerCancelledWithinHours >= 0 && ownerCancelledWithinHours < OWNER_CANCEL_LOCK_HOURS;
}
