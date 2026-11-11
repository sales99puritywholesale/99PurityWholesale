import { RATE_LIMIT_POLICIES } from '../ratelimit/policies';
import { OWNER_RECOVERY_STATUSES } from './owner';

/**
 * Mirror of migration 0005 REV6 (review draft; NOT applied; NEVER parsed by PostgreSQL; rev5, rev4, rev3.1 and rev3 are preserved unchanged, their mirrors are owner-rev5.ts, owner-rev4.ts
 * and owner.ts). The database is authoritative: this module exists for typing, early UX denial and parity tests (tests/portal/owner-rev6.test.ts parses the rev6 SQL and fails if any list
 * or number here differs). Pure module: no I/O, no service-role client, no environment access. Nothing here proves PostgreSQL behavior; the pure models below only document the intended rules.
 */

export const RECOVERY_VERIFICATION_METHODS_REV6 = ['video_id_check', 'in_person', 'verified_business_contact'] as const;
export const RECOVERY_REF_PATTERN_REV6 = /^[A-Za-z0-9._:/#-]{1,80}$/;

export const RECOVERY_COOLOFF_HOURS_REV6 = 24;
export const RECOVERY_APPROVAL_DEADLINE_HOURS_REV6 = 72;
export const RECOVERY_VALIDITY_DAYS_AFTER_COOLOFF_REV6 = 7;
/** THREE standard windows plus at most TWO explicitly authorized extensions: FIVE is a hard maximum (constraint, guards and RPCs). */
export const RECOVERY_STANDARD_WINDOWS = 3;
export const RECOVERY_MAX_EXTENSIONS = 2;
export const RECOVERY_MAX_WINDOWS = 5;
export const RECOVERY_WINDOW_MAX_MINUTES_REV6 = 60;
export const RECOVERY_WINDOW_MIN_MINUTES_REV6 = 5;
export const OWNER_CANCEL_LOCK_HOURS_REV6 = 24;
export const OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H_REV6 = 5;
export const OPERATOR_INITIATIONS_PER_OWNER_PER_7D_REV6 = 2;
/** Stranded-owner exception (approved decisions 3 and 4). */
export const STRANDED_LOOKBACK_DAYS = 30;
export const EXCEPTIONS_PER_OWNER_PER_30D = 2;
export const EXCEPTION_GRANT_DEADLINE_HOURS = 24;
export const EXCEPTION_USE_HOURS_AFTER_GRANT = 72;
/** Factor-removal order: at most 5 refused completions, then FAILED. */
export const REMOVAL_ORDER_MAX_ATTEMPTS = 5;
export const MAX_VERIFIED_FACTORS_IN_ORDER = 10;
/** The structure check of 0002 (private.mfa_check_ok) and rev6 (private.auth_structure_ok): a passed row no older than this. */
export const STRUCTURE_CHECK_MAX_AGE_HOURS = 24;
export const REQUIRED_TRANSACTION_ISOLATION_REV6 = 'read committed';

export const RATE_LIMIT_POLICIES_REV6 = {
  ...RATE_LIMIT_POLICIES,
  operator_recovery_initiate: { maxAttempts: OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H_REV6, windowSecs: 86400, blockSecs: 86400 },
  operator_recovery_target: { maxAttempts: OPERATOR_INITIATIONS_PER_OWNER_PER_7D_REV6, windowSecs: 604800, blockSecs: 604800 },
} as const;

export const RECOVERY_REQUEST_STATUSES_REV6 = ['awaiting_approval', 'pending', 'cancelled', 'completed', 'expired'] as const;
export const EXCEPTION_STATUSES = ['requested', 'granted', 'consumed', 'expired', 'cancelled'] as const;
export const EXCEPTION_CLOSING_CODES = ['not_stranded', 'operator_cancelled'] as const;
export const REMOVAL_ORDER_STATUSES = ['ordered', 'completed', 'expired', 'cancelled', 'failed'] as const;
export const REMOVAL_METHODS = ['manual', 'none_needed'] as const;
export const AUTO_REVOKE_CODES_REV6 = ['request_cancelled', 'request_expired'] as const;
export const FACTOR_LOSS_CATEGORIES_REV6 = ['stranded', 'unexplained'] as const;

/** Result codes of the owner-side window and claim RPCs. */
export const OWNER_WINDOW_CODES_REV6 = [
  'window_open', 'factor_approved', 'revoked', 'not_an_owner', 'invalid_input', 'step_up_required', 'operator_authorization_required', 'unapproved_factor_present',
  'recovery_required', 'unknown_state', 'no_open_window', 'already_approved', 'factor_not_eligible', 'window_already_open', 'removal_not_verified',
] as const;
/** Result codes of the operator RPCs (authorize, extension, revoke window, initiate, approve, cancel, exceptions, removal orders, factor-loss review). */
export const OPERATOR_RECOVERY_CODES_REV6 = [
  'authorized', 'revoked', 'awaiting_approval', 'approved', 'request_cancelled', 'reviewed', 'exception_requested', 'exception_granted', 'exception_cancelled',
  'order_created', 'order_open', 'completed', 'already_completed',
  'forbidden', 'step_up_required', 'self_change_not_allowed', 'target_not_eligible', 'recovery_not_ready', 'recovery_cooling_off', 'recovery_awaiting_approval',
  'already_enrolled', 'unapproved_factor_present', 'unknown_state', 'window_already_open', 'no_open_window', 'recovery_window_limit', 'request_ending', 'extension_not_needed',
  'extension_rejected', 'removal_not_verified', 'first_enrolment_applies', 'recovery_locked', 'request_pending', 'throttled', 'exception_not_usable', 'request_not_found',
  'request_expired', 'request_not_awaiting', 'self_approval_not_allowed', 'state_changed', 'initiator_not_active', 'verification_ref_reused', 'approval_rejected', 'request_not_open',
  'structure_check_required', 'stranded_not_confirmed', 'exception_already_open', 'exception_limit', 'exception_rejected', 'exception_not_found', 'exception_not_open',
  'self_grant_not_allowed', 'requester_not_active', 'grant_rejected', 'no_open_recovery_window', 'removal_already_verified', 'request_not_usable', 'no_factors_to_remove',
  'order_rejected', 'order_not_found', 'order_not_open', 'window_not_open', 'factor_set_changed', 'factors_still_present', 'completion_rejected',
] as const;
/** Result codes of the owner recovery RPCs (set codes, request, cancel). */
export const OWNER_RECOVERY_CODES_REV6 = [
  'codes_issued', 'request_created', 'request_cancelled', 'not_available', 'code_reused', 'step_up_required', 'throttled', 'request_not_accepted', 'recovery_locked',
  'request_pending', 'no_pending_request',
] as const;
const SUCCESS = {
  window: ['window_open', 'factor_approved', 'revoked'],
  operator: ['authorized', 'revoked', 'awaiting_approval', 'approved', 'request_cancelled', 'reviewed', 'exception_requested', 'exception_granted', 'exception_cancelled',
    'order_created', 'order_open', 'completed', 'already_completed'],
  recovery: ['codes_issued', 'request_created', 'request_cancelled'],
} as const;

export type CodeResultRev6<C extends string> = { readonly ok: true; readonly code: C } | { readonly ok: false; readonly code: C | 'invalid_response' };
function parse<C extends string>(raw: unknown, known: readonly C[], success: readonly string[]): CodeResultRev6<C> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, code: 'invalid_response' };
  const o = raw as Record<string, unknown>;
  if (typeof o.ok !== 'boolean' || typeof o.code !== 'string' || !(known as readonly string[]).includes(o.code)) return { ok: false, code: 'invalid_response' };
  if (o.ok !== success.includes(o.code)) return { ok: false, code: 'invalid_response' };
  return o.ok ? { ok: true, code: o.code as C } : { ok: false, code: o.code as C };
}
export const parseOwnerWindowResultRev6 = (raw: unknown) => parse(raw, OWNER_WINDOW_CODES_REV6, SUCCESS.window);
export const parseOperatorRecoveryResultRev6 = (raw: unknown) => parse(raw, OPERATOR_RECOVERY_CODES_REV6, SUCCESS.operator);
export const parseOwnerRecoveryResultRev6 = (raw: unknown) => parse(raw, OWNER_RECOVERY_CODES_REV6, SUCCESS.recovery);

/** The production owner-context parser accepts every status rev6 can report (rev6 adds none beyond rev5). */
export const PRODUCTION_PARSER_ACCEPTS_REV6_STATUSES = ['none', 'awaiting_approval', 'cooling_off', 'ready', 'stranded', 'locked'].every((s) => (OWNER_RECOVERY_STATUSES as readonly string[]).includes(s));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Pure models of the rev6 rules (documentation by code; the SQL constraints and guards are authoritative and were never executed)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The window-counter invariant of the table constraint: issued is 0..5 and the extension counter is exactly the number of windows beyond the third (no banking). */
export function windowCountersConsistent(issued: number, extra: number): boolean {
  return Number.isInteger(issued) && Number.isInteger(extra) && issued >= 0 && issued <= RECOVERY_MAX_WINDOWS && extra >= 0 && extra <= RECOVERY_MAX_EXTENSIONS && extra === Math.max(issued - RECOVERY_STANDARD_WINDOWS, 0);
}
/** The only legal counter transitions: one standard window (up to the third) or one extension (the fourth or fifth), never a decrease, never both counters apart. */
export function windowCounterTransitionAllowed(from: { issued: number; extra: number }, to: { issued: number; extra: number }): boolean {
  if (!windowCountersConsistent(from.issued, from.extra) || !windowCountersConsistent(to.issued, to.extra)) return false;
  if (to.issued === from.issued + 1 && to.issued <= RECOVERY_STANDARD_WINDOWS && to.extra === from.extra) return true;
  return to.issued === from.issued + 1 && to.issued >= RECOVERY_STANDARD_WINDOWS + 1 && to.extra === from.extra + 1;
}
/** A recovery window's end is capped at its request's expiry; refused when less than the minimum window length remains. */
export function recoveryWindowEnd(nowMs: number, minutes: number, requestExpiresMs: number): number | null {
  if (!Number.isInteger(minutes) || minutes < RECOVERY_WINDOW_MIN_MINUTES_REV6 || minutes > RECOVERY_WINDOW_MAX_MINUTES_REV6) return null;
  const end = Math.min(nowMs + minutes * 60_000, requestExpiresMs);
  return end < nowMs + RECOVERY_WINDOW_MIN_MINUTES_REV6 * 60_000 ? null : end;
}

/** A structure check row as stored by private.run_auth_structure_check(). */
export type StructureCheckRow = { readonly status: string; readonly checkedAtMs: number } | null;
/** TRUE only for a PASSED check no older than 24 hours and not future-dated. Missing, failed, stale or future-dated is false (fail closed). */
export function structureCheckFresh(row: StructureCheckRow, nowMs: number): boolean {
  if (row === null || row.status !== 'passed') return false;
  return row.checkedAtMs > nowMs - STRUCTURE_CHECK_MAX_AGE_HOURS * 3_600_000 && row.checkedAtMs <= nowMs;
}
export type FactorRow = { readonly id: string | null; readonly status: string | null; readonly type: string | null };
const KNOWN_STATUS = ['verified', 'unverified'];
const KNOWN_TYPE = ['totp', 'phone', 'webauthn'];
/**
 * Model of private.owner_verified_factor_ids: returns the sorted verified ids, or NULL meaning UNKNOWN. It is NEVER an empty list for an unreadable state: absent, stale or failed structure
 * check, a null id, a null or unrecognized status, or a null or unrecognized type of ANY row of the user makes the result unknown.
 */
export function verifiedFactorIds(rows: readonly FactorRow[] | null, structure: StructureCheckRow, nowMs: number): string[] | null {
  if (rows === null || !structureCheckFresh(structure, nowMs)) return null;
  for (const r of rows) if (r.id === null || r.status === null || r.type === null || !KNOWN_STATUS.includes(r.status) || !KNOWN_TYPE.includes(r.type)) return null;
  return rows.filter((r) => r.status === 'verified').map((r) => r.id as string).sort();
}
export type RemovalOutcome = 'unknown' | 'complete' | 'still_present' | 'set_changed';
/** Model of the completion rule: it reads the state itself; unknown refuses; any verified factor refuses; a verified factor outside the snapshot makes the order stale. */
export function removalOutcome(snapshot: readonly string[], current: readonly string[] | null): RemovalOutcome {
  if (current === null) return 'unknown';
  if (current.length === 0) return 'complete';
  return current.some((id) => !snapshot.includes(id)) ? 'set_changed' : 'still_present';
}

const EXCEPTION_TRANSITIONS: Record<string, readonly string[]> = { requested: ['granted', 'expired', 'cancelled'], granted: ['consumed', 'expired', 'cancelled'], consumed: [], expired: [], cancelled: [] };
export const exceptionTransitionAllowed = (from: string, to: string): boolean => (EXCEPTION_TRANSITIONS[from] ?? []).includes(to);
const ORDER_TRANSITIONS: Record<string, readonly string[]> = { ordered: ['ordered', 'completed', 'expired', 'cancelled', 'failed'], completed: [], expired: [], cancelled: [], failed: [] };
export const orderTransitionAllowed = (from: string, to: string): boolean => (ORDER_TRANSITIONS[from] ?? []).includes(to);

export type ExceptionPeople = { readonly requester: string; readonly granter: string | null; readonly requesterActive: boolean; readonly granterActive: boolean };
/** Model of the two-person rules, evaluated at the grant (the proposed granter) and again at the consume: two different accounts, both active operators. A missing granter is never ok. */
export function exceptionPeopleOk(p: ExceptionPeople): boolean {
  if (p.granter === null) return false;
  return p.requester !== p.granter && p.requesterActive && p.granterActive;
}
