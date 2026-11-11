import { PROTECTED_ACTIONS, isProtectedActionId, type ProtectedActionId } from './actions';

/**
 * Owner MFA (D-P24-4, approved): organization OWNERS must use MFA. Owner privileges and sensitive organization operations are
 * enforced in the database (private.owner_mfa_ok(): aal2 token AND a verified TOTP factor; the owner-only policies and the owner
 * RPCs use private.my_mfa_owner_org_ids()). This module mirrors that decision for UX and early denial; it never replaces it.
 * Ordinary members are NOT required to use MFA, except where an action itself needs a step-up (for example removing a factor).
 *
 * The context comes from public.rpc_my_owner_context(org) evaluated by the database with the user's own session; the browser never
 * supplies any of these values. Default deny.
 */
export type OwnerAccessContext = {
  readonly authenticated: boolean;
  /** Active owner membership of the organization in question, as reported by the database. */
  readonly isOwner: boolean;
  /** aal2 token and a verified TOTP factor, as reported by the database. */
  readonly ownerMfaOk: boolean;
  /** Fresh TOTP verification within 15 minutes, as reported by the database (private.step_up_ok). */
  readonly stepUpOk: boolean;
  /** Factor state as computed by the database (informational; ownerMfaOk is only ever true together with 'approved'). */
  readonly factorState?: OwnerFactorState;
  /** Recovery request state: none, cooling_off (24 hours), ready (an operator may open the recovery window), locked (24 hours after a cancellation). */
  readonly recoveryStatus?: OwnerRecoveryStatus;
  /** Unused recovery codes (ten are issued per set). Recovery codes never grant privileges. */
  readonly recoveryCodesRemaining?: number;
};

export type OwnerDenyReason = 'unauthenticated' | 'unknown-action' | 'wrong-actor-type' | 'not-owner' | 'owner-mfa-required' | 'step-up-required';
export type OwnerDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: OwnerDenyReason };

const deny = (reason: OwnerDenyReason): OwnerDecision => ({ allowed: false, reason });

export function denyAllOwnerContext(authenticated: boolean): OwnerAccessContext {
  return { authenticated, isOwner: false, ownerMfaOk: false, stepUpOk: false };
}

/**
 * recovery_status values the database may report. none, cooling_off, ready and locked exist since rev3.1; awaiting_approval (an operator-initiated request waits for the
 * second operator) and stranded (factors removed under an attested recovery, request ended without an approved new factor) exist since rev5 (review draft, NOT applied).
 * The parser accepts the union so that a database running either revision is never rejected into a deny-all context (rev4 would have been: F7). Whatever the value, it
 * NEVER grants anything: owner privileges depend on the factor state only (tests/portal/owner-ratelimit-rpc.test.ts and owner-rev5.test.ts).
 */
export const OWNER_RECOVERY_STATUSES = ['none', 'awaiting_approval', 'cooling_off', 'ready', 'stranded', 'locked'] as const;
export type OwnerRecoveryStatus = (typeof OWNER_RECOVERY_STATUSES)[number];
/** The statuses that only exist from rev5 on (not in the canonical rev3.1 SQL). */
export const OWNER_RECOVERY_STATUSES_SINCE_REV5 = ['awaiting_approval', 'stranded'] as const;

/**
 * State of the owner's second factor as the database computes it (private.owner_factor_state):
 * approved = at least one APPROVED verified TOTP factor and no unapproved verified factor;
 * unapproved_factor_present = a verified factor that no enrolment window approved exists (never trusted; remove it);
 * recovery_required = the user once had an approved factor and has none now (recovery flow, never self-service);
 * none = never enrolled; unknown = the database could not tell (treated as denied).
 */
export const OWNER_FACTOR_STATES = ['approved', 'unapproved_factor_present', 'recovery_required', 'none', 'unknown'] as const;
export type OwnerFactorState = (typeof OWNER_FACTOR_STATES)[number];

export function parseOwnerContext(raw: unknown, authenticated: boolean): OwnerAccessContext {
  if (!authenticated) return denyAllOwnerContext(false);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return denyAllOwnerContext(true);
  const o = raw as Record<string, unknown>;
  const allowedKeys = new Set(['is_owner', 'owner_mfa_ok', 'step_up_ok', 'factor_state', 'recovery_status', 'recovery_codes_remaining']);
  if (Object.keys(o).some((k) => !allowedKeys.has(k))) return denyAllOwnerContext(true);
  if (typeof o.is_owner !== 'boolean' || typeof o.owner_mfa_ok !== 'boolean' || typeof o.step_up_ok !== 'boolean') return denyAllOwnerContext(true);
  if (typeof o.factor_state !== 'string' || !(OWNER_FACTOR_STATES as readonly string[]).includes(o.factor_state)) return denyAllOwnerContext(true);
  if (typeof o.recovery_status !== 'string' || !(OWNER_RECOVERY_STATUSES as readonly string[]).includes(o.recovery_status)) return denyAllOwnerContext(true);
  if (typeof o.recovery_codes_remaining !== 'number' || !Number.isInteger(o.recovery_codes_remaining) || o.recovery_codes_remaining < 0 || o.recovery_codes_remaining > 10) return denyAllOwnerContext(true);
  // fail closed on inconsistency: owner MFA is only ever valid together with an approved factor state
  const mfa = o.is_owner && o.owner_mfa_ok && o.factor_state === 'approved';
  return { authenticated: true, isOwner: o.is_owner, ownerMfaOk: mfa, stepUpOk: o.step_up_ok, factorState: o.factor_state as OwnerFactorState, recoveryStatus: o.recovery_status as OwnerRecoveryStatus, recoveryCodesRemaining: o.recovery_codes_remaining };
}

/**
 * Result codes of the owner-MFA RPCs of migration 0005 (review draft rev3). Three groups, each parity-tested against the SQL.
 * Responses are GENERIC by design: a wrong recovery code, a non-owner and a staff caller all get 'request_not_accepted'.
 */
export const OWNER_FACTOR_RPC_CODES = [
  'window_open', 'factor_approved', 'not_an_owner', 'invalid_input', 'step_up_required', 'operator_authorization_required',
  'unapproved_factor_present', 'recovery_required', 'unknown_state', 'no_open_window', 'already_approved', 'factor_not_eligible',
] as const;
export const OPERATOR_OWNER_MFA_CODES = [
  'authorized', 'forbidden', 'step_up_required', 'self_change_not_allowed', 'target_not_eligible', 'recovery_not_ready', 'recovery_cooling_off',
  'recovery_request_expired', 'already_enrolled', 'unapproved_factor_present', 'unknown_state',
] as const;
export const OWNER_RECOVERY_RPC_CODES = [
  'codes_issued', 'request_created', 'request_cancelled', 'not_available', 'code_reused', 'step_up_required', 'throttled', 'request_not_accepted',
  'recovery_locked', 'request_pending', 'no_pending_request',
] as const;
export type OwnerFactorRpcCode = (typeof OWNER_FACTOR_RPC_CODES)[number];
export type OperatorOwnerMfaCode = (typeof OPERATOR_OWNER_MFA_CODES)[number];
export type OwnerRecoveryRpcCode = (typeof OWNER_RECOVERY_RPC_CODES)[number];
const OWNER_FACTOR_SUCCESS = ['window_open', 'factor_approved'] as const;
const OPERATOR_SUCCESS = ['authorized'] as const;
const RECOVERY_SUCCESS = ['codes_issued', 'request_created', 'request_cancelled'] as const;

export type CodeResult<C extends string> = { readonly ok: true; readonly code: C } | { readonly ok: false; readonly code: C | 'invalid_response' };

/** Fail closed: anything that is not exactly {ok boolean, code in the known list} with ok matching the success codes is a denial. */
function parseCodeResult<C extends string>(raw: unknown, known: readonly C[], success: readonly C[]): CodeResult<C> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, code: 'invalid_response' };
  const o = raw as Record<string, unknown>;
  if (typeof o.ok !== 'boolean' || typeof o.code !== 'string' || !(known as readonly string[]).includes(o.code)) return { ok: false, code: 'invalid_response' };
  const isSuccessCode = (success as readonly string[]).includes(o.code);
  if (o.ok !== isSuccessCode) return { ok: false, code: 'invalid_response' };
  return o.ok ? { ok: true, code: o.code as C } : { ok: false, code: o.code as C };
}
export const parseOwnerFactorRpcResult = (raw: unknown) => parseCodeResult<OwnerFactorRpcCode>(raw, OWNER_FACTOR_RPC_CODES, OWNER_FACTOR_SUCCESS);
export const parseOperatorOwnerMfaResult = (raw: unknown) => parseCodeResult<OperatorOwnerMfaCode>(raw, OPERATOR_OWNER_MFA_CODES, OPERATOR_SUCCESS);
export const parseOwnerRecoveryResult = (raw: unknown) => parseCodeResult<OwnerRecoveryRpcCode>(raw, OWNER_RECOVERY_RPC_CODES, RECOVERY_SUCCESS);

/**
 * Recovery codes are NOT credentials for anything but the recovery request. This predicate exists so that the rule is testable: no protected action may be
 * satisfied by a recovery code, and a recovery code is never an alternative to a step-up.
 */
export const RECOVERY_CODE_SATISFIES_STEP_UP = false as const;
export const RECOVERY_CODE_GRANTS_OWNER_PRIVILEGES = false as const;

/** Operator-assisted recovery and the first owner enrolment need an operator capability, never a self-service path (D-P24-6). */
export const FIRST_OWNER_ENROLMENT_IS_SELF_SERVICE = false as const;
/** Owner actions: active owner, owner MFA, and a fresh step-up where the registry requires it. */
export function evaluateOwnerAction(ctx: OwnerAccessContext, actionId: string): OwnerDecision {
  if (!isProtectedActionId(actionId)) return deny('unknown-action');
  const action = PROTECTED_ACTIONS[actionId as ProtectedActionId];
  if (action.actor !== 'organization-owner') return deny('wrong-actor-type');
  if (!ctx.authenticated) return deny('unauthenticated');
  if (!ctx.isOwner) return deny('not-owner');
  if (!ctx.ownerMfaOk) return deny('owner-mfa-required'); // an owner without MFA keeps member access only
  if (action.stepUp && !ctx.stepUpOk) return deny('step-up-required');
  return { allowed: true };
}

/** Member actions need MFA only where the action itself is a step-up action (never for ordinary member access). */
export function evaluateMemberAction(ctx: Pick<OwnerAccessContext, 'authenticated' | 'stepUpOk'>, actionId: string): OwnerDecision {
  if (!isProtectedActionId(actionId)) return deny('unknown-action');
  const action = PROTECTED_ACTIONS[actionId as ProtectedActionId];
  if (action.actor !== 'organization-member') return deny('wrong-actor-type');
  if (!ctx.authenticated) return deny('unauthenticated');
  if (action.stepUp && !ctx.stepUpOk) return deny('step-up-required');
  return { allowed: true };
}
