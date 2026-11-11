import { PROTECTED_ACTIONS, STEP_UP_CLOCK_SKEW_SECONDS, STEP_UP_MAX_AGE_SECONDS, isProtectedActionId, type ProtectedActionId } from './actions';
import { capabilitiesForRoles, isStaffRole, type CapabilityCode } from './capabilities';

/**
 * Pure, default-deny evaluation of staff authorization (P2.2).
 *
 * The context is built on the server from database reads made with the USER'S OWN session (RLS-gated: the role and
 * capability tables only return rows when the database's own staff_session_ok() holds). The client never supplies roles,
 * assurance level or MFA state, and this module trusts none of them from a request. It exists for UX gating, early denial
 * and defense in depth; the database re-checks every mutation.
 *
 * Every branch that is not an explicit allow is a deny, and unknown inputs are denied.
 */

export type StaffStatus = 'active' | 'disabled' | 'none';

export type StaffAccessContext = {
  /** A user verified with the auth server for this request. */
  readonly authenticated: boolean;
  /** Row in public.staff_members for the user: 'none' when there is no row. */
  readonly staffStatus: StaffStatus;
  /** Role strings read from public.staff_roles (unknown values are ignored). */
  readonly roles: readonly string[];
  /**
   * True only when the database confirmed the full staff session condition (aal2 JWT, approved factor, fresh structure
   * check). Derived from an RLS-gated read, never from client input.
   */
  readonly dbSessionOk: boolean;
  /** When the user last verified a TOTP factor (from the signed token), or null. */
  readonly totpVerifiedAt: Date | null;
  readonly now: Date;
};

export type DenyReason =
  | 'unauthenticated'
  | 'unknown-action'
  | 'not-staff'
  | 'staff-disabled'
  | 'no-valid-role'
  | 'staff-session-not-verified'
  | 'capability-missing'
  | 'step-up-required'
  | 'wrong-actor-type';

export type Decision = { readonly allowed: true } | { readonly allowed: false; readonly reason: DenyReason };

const deny = (reason: DenyReason): Decision => ({ allowed: false, reason });
const ALLOW: Decision = { allowed: true };

/**
 * Age of the last TOTP verification in seconds (0 for a timestamp within the allowed clock skew ahead of now). Missing, invalid
 * or further-future values are not fresh (fail closed). Mirrors private.step_up_ok() in the database.
 */
export function stepUpAgeSeconds(totpVerifiedAt: Date | null, now: Date): number | null {
  if (!totpVerifiedAt) return null;
  const age = (now.getTime() - totpVerifiedAt.getTime()) / 1000;
  if (!Number.isFinite(age) || age < -STEP_UP_CLOCK_SKEW_SECONDS) return null;
  return Math.max(age, 0);
}

export function isStepUpFresh(totpVerifiedAt: Date | null, now: Date): boolean {
  const age = stepUpAgeSeconds(totpVerifiedAt, now);
  return age !== null && age <= STEP_UP_MAX_AGE_SECONDS;
}

/** Staff session gate shared by every staff decision: authenticated, active staff, a valid role, database-verified session. */
function staffGate(ctx: StaffAccessContext): Decision {
  if (!ctx.authenticated) return deny('unauthenticated');
  if (ctx.staffStatus === 'none') return deny('not-staff');
  if (ctx.staffStatus !== 'active') return deny('staff-disabled');
  if (!ctx.roles.some(isStaffRole)) return deny('no-valid-role');
  if (!ctx.dbSessionOk) return deny('staff-session-not-verified');
  return ALLOW;
}

/** True when the staff session is valid and one of the user's roles grants the capability. */
export function evaluateCapability(ctx: StaffAccessContext, capability: CapabilityCode): Decision {
  const gate = staffGate(ctx);
  if (!gate.allowed) return gate;
  return capabilitiesForRoles(ctx.roles).has(capability) ? ALLOW : deny('capability-missing');
}

/** True when the staff session is valid and one of the roles grants ANY of the capabilities. */
export function evaluateAnyCapability(ctx: StaffAccessContext, capabilities: readonly CapabilityCode[]): Decision {
  const gate = staffGate(ctx);
  if (!gate.allowed) return gate;
  const held = capabilitiesForRoles(ctx.roles);
  return capabilities.some((c) => held.has(c)) ? ALLOW : deny('capability-missing');
}

/** Staff action: capability plus (when the registry says so) a fresh step-up. Non-staff actions are never allowed here. */
export function evaluateStaffAction(ctx: StaffAccessContext, actionId: string): Decision {
  if (!isProtectedActionId(actionId)) return deny('unknown-action');
  const action = PROTECTED_ACTIONS[actionId as ProtectedActionId];
  if (action.actor !== 'staff') return deny('wrong-actor-type');
  const decision = evaluateCapability(ctx, action.capability);
  if (!decision.allowed) return decision;
  if (action.stepUp && !isStepUpFresh(ctx.totpVerifiedAt, ctx.now)) return deny('step-up-required');
  return ALLOW;
}

/** Any signed-in staff member with a verified session may open the admin overview. */
export function evaluateAdminAccess(ctx: StaffAccessContext): Decision {
  return staffGate(ctx);
}
