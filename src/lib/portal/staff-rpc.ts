/**
 * Result handling for the staff-management RPCs (migration 0004). Every RPC returns jsonb {ok, code, ...}. Pure module.
 *
 * Early denial policy: the server may stop a request BEFORE calling the database only when the database would write nothing anyway
 * (no verified staff session: the RPC raises 42501 without an audit row). For a verified staff member whose capability or step-up
 * is missing, the server MUST still call the RPC, so that the database records the audited denial. Hiding the button is cosmetic.
 */
import { evaluateStaffAction, type StaffAccessContext } from './permissions';

export const STAFF_RPC_SUCCESS_CODES = ['added', 'granted', 'already_granted', 'revoked', 'updated', 'no_change', 'authorized', 'approved'] as const;
export const STAFF_RPC_FAILURE_CODES = [
  'forbidden', 'step_up_required', 'self_change_not_allowed', 'organization_member_conflict', 'already_staff', 'user_not_found', 'not_staff',
  'role_not_found', 'last_admin_protected', 'invariant_protected', 'window_already_open', 'target_not_eligible', 'window_not_open',
  'approval_rejected', 'already_approved',
] as const;
export type StaffRpcSuccessCode = (typeof STAFF_RPC_SUCCESS_CODES)[number];
export type StaffRpcFailureCode = (typeof STAFF_RPC_FAILURE_CODES)[number];

export type StaffRpcOutcome =
  | { readonly ok: true; readonly code: StaffRpcSuccessCode; readonly data: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly code: StaffRpcFailureCode | 'invalid_response' };

const SUCCESS = new Set<string>(STAFF_RPC_SUCCESS_CODES);
const FAILURE = new Set<string>(STAFF_RPC_FAILURE_CODES);

export function parseStaffRpcResult(raw: unknown): StaffRpcOutcome {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, code: 'invalid_response' };
  const o = raw as Record<string, unknown>;
  if (typeof o.ok !== 'boolean' || typeof o.code !== 'string') return { ok: false, code: 'invalid_response' };
  if (o.ok) {
    if (!SUCCESS.has(o.code)) return { ok: false, code: 'invalid_response' };
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) if (k !== 'ok' && k !== 'code') data[k] = v;
    return { ok: true, code: o.code as StaffRpcSuccessCode, data };
  }
  return FAILURE.has(o.code) ? { ok: false, code: o.code as StaffRpcFailureCode } : { ok: false, code: 'invalid_response' };
}

/** Safe, user-facing text. Never echoes database messages. */
export const STAFF_RPC_MESSAGES: Readonly<Record<StaffRpcFailureCode | 'invalid_response', string>> = {
  forbidden: 'You do not have permission to do this.',
  step_up_required: 'Please verify your authenticator code again to continue.',
  self_change_not_allowed: 'You cannot change your own staff access. Another administrator must do this.',
  organization_member_conflict: 'This user belongs to an organization and cannot be staff.',
  already_staff: 'This user is already a staff member.',
  user_not_found: 'No such user.',
  not_staff: 'This user is not a staff member.',
  role_not_found: 'The user does not have that role.',
  last_admin_protected: 'The last active administrator cannot be removed or disabled.',
  invariant_protected: 'This change is not allowed because it would break a protected rule.',
  window_already_open: 'An enrolment window is already open for this user.',
  target_not_eligible: 'The user cannot be enrolled right now.',
  window_not_open: 'That enrolment window is not open.',
  approval_rejected: 'The authenticator could not be approved. Ask an administrator to open a new window.',
  already_approved: 'This authenticator is already approved.',
  invalid_response: 'Something went wrong. Please try again.',
};

export const staffRpcHttpStatus = (outcome: StaffRpcOutcome): number => {
  if (outcome.ok) return 200;
  switch (outcome.code) {
    case 'forbidden':
      return 403;
    case 'step_up_required':
      return 401;
    case 'user_not_found':
    case 'not_staff':
    case 'role_not_found':
    case 'window_not_open':
      return 404;
    case 'invalid_response':
      return 502;
    default:
      return 409; // an invariant or state conflict
  }
};

export type Precheck = { readonly proceed: true } | { readonly proceed: false; readonly reason: string };

/**
 * Early check before calling the database. Returns proceed=false only for conditions where the database writes no audit row.
 * 'capability-missing' and 'step-up-required' proceed on purpose: the database audits those denials.
 */
export function precheckStaffAction(ctx: StaffAccessContext, actionId: string): Precheck {
  const d = evaluateStaffAction(ctx, actionId);
  if (d.allowed) return { proceed: true };
  if (d.reason === 'capability-missing' || d.reason === 'step-up-required') return { proceed: true };
  return { proceed: false, reason: d.reason };
}
