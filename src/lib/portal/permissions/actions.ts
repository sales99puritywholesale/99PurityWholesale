import type { CapabilityCode } from './capabilities';

/**
 * Central registry of protected actions (P2.2 and later). One place defines, for every sensitive operation:
 *   - which actor class performs it,
 *   - which staff capability it needs (staff actions),
 *   - whether a fresh MFA verification (step-up, 15 minutes) is required,
 *   - whether it must be written to the audit log.
 *
 * This registry drives UI visibility, server-side pre-checks and the documentation of the step-up policy. The database is
 * authoritative: each mutation is also enforced inside its SECURITY DEFINER RPC (capability or ownership check, step-up
 * check on the signed JWT, audit write in the same transaction). Adding an action here does not grant anything.
 *
 * Step-up policy (owner decision, 2026-11): fresh TOTP verification within 15 minutes is required for staff role changes,
 * staff suspension and reinstatement, MFA changes, ownership transfer, sensitive organization membership operations and
 * financially sensitive administration.
 */
export const STEP_UP_MAX_AGE_SECONDS = 15 * 60;
/** Same allowance as private.step_up_ok() in the database: a verification up to 60 s "in the future" is clock skew, more is stale. */
export const STEP_UP_CLOCK_SKEW_SECONDS = 60;

type StaffAction = {
  readonly actor: 'staff';
  readonly capability: CapabilityCode;
  readonly stepUp: boolean;
  readonly audit: boolean;
  readonly description: string;
};

type OwnerAction = {
  readonly actor: 'organization-owner';
  readonly stepUp: boolean;
  readonly audit: boolean;
  readonly description: string;
};

type MemberAction = {
  readonly actor: 'organization-member';
  readonly stepUp: boolean;
  readonly audit: boolean;
  readonly description: string;
};

export type ProtectedAction = StaffAction | OwnerAction | MemberAction;

const staff = (capability: CapabilityCode, stepUp: boolean, audit: boolean, description: string): StaffAction => ({
  actor: 'staff',
  capability,
  stepUp,
  audit,
  description,
});
const owner = (stepUp: boolean, audit: boolean, description: string): OwnerAction => ({ actor: 'organization-owner', stepUp, audit, description });
const member = (stepUp: boolean, audit: boolean, description: string): MemberAction => ({ actor: 'organization-member', stepUp, audit, description });

export const PROTECTED_ACTIONS = {
  // ---- staff administration (P2.2) ----------------------------------------------------------------------------------------
  'staff.list': staff('staff.read', false, false, 'View staff members and their roles'),
  'staff.permissions.view': staff('staff.read', false, false, 'Review the capabilities of each role'),
  'staff.member.add': staff('staff.manage', true, true, 'Make an existing user a staff member (blocked if the user is an organization member)'),
  'staff.role.grant': staff('staff.manage', true, true, 'Grant an approved staff role'),
  'staff.role.revoke': staff('staff.manage', true, true, 'Revoke a staff role (the last active admin is protected)'),
  'staff.member.suspend': staff('staff.manage', true, true, 'Suspend a staff member (the last active admin is protected)'),
  'staff.member.reinstate': staff('staff.manage', true, true, 'Reinstate a suspended staff member'),
  'staff.mfa.window.authorize': staff('staff.manage', true, true, 'Open an MFA enrolment window for a staff member'),
  'staff.mfa.window.revoke': staff('staff.manage', true, true, 'Revoke an open MFA enrolment window'),
  'staff.mfa.factor.remove': staff('staff.manage', true, true, 'Remove an approved staff MFA factor'),
  'staff.owner_mfa_window.authorize': staff('owner.mfa.authorize', true, true, 'Open the first-enrolment or recovery MFA window for an organization owner (operator; single use, audited)'),
  'staff.owner_mfa.overview': staff('owner.mfa.authorize', false, true, 'Read an owner MFA state and recovery request (operator; audited)'),
  'audit.view': staff('audit.read', false, false, 'Read the audit log'),

  // ---- organizations and members, staff side ------------------------------------------------------------------------------
  'org.view': staff('org.read', false, false, 'Read organization name, code, status and terms'),
  'org.billing.view': staff('org.billing.read', false, true, 'Read an organization billing address (audited)'),
  'org.status.change': staff('org.manage', true, true, 'Change organization status'),
  'org.members.view': staff('members.read', false, false, 'Read organization membership rows'),
  'org.members.manage': staff('members.manage', true, true, 'Add, remove or change organization members as staff'),
  'org.invites.view': staff('invites.read', false, false, 'Read organization invitations'),
  'org.onboarding.review': staff('onboarding.review', false, true, 'Review organization onboarding'),

  // ---- sensitive platform administration (used by later milestones; step-up fixed here) -----------------------------------
  'flags.change': staff('flags.write', true, true, 'Change a platform feature flag'),
  'gates.change': staff('gates.write', true, true, 'Record or revoke a compliance gate'),
  'documents.delete': staff('documents.delete', true, true, 'Delete a stored document'),
  'payments.confirm': staff('payments.confirm', true, true, 'Confirm a payment (financially sensitive)'),
  'payments.reconcile': staff('payments.reconcile', true, true, 'Reconcile payments (financially sensitive)'),
  'financial.write': staff('financial.write', true, true, 'Write a financial record (financially sensitive)'),

  // ---- organization lifecycle, customer side (P2.3) -----------------------------------------------------------------------
  'org.invite.create.member': owner(false, true, 'Invite a person as a member'),
  'org.invite.create.owner': owner(true, true, 'Invite a person as an owner'),
  'org.invite.resend': owner(false, true, 'Resend (reissue) an open invitation'),
  'org.invite.revoke': owner(false, true, 'Revoke an open invitation'),
  'org.member.remove': owner(true, true, 'Remove a member'),
  'org.owner.remove': owner(true, true, 'Remove or demote an owner (the last owner is protected)'),
  'org.member.restore': owner(false, true, 'Restore a removed member'),
  'org.ownership.transfer': owner(true, true, 'Transfer ownership'),
  'org.onboarding.edit': owner(false, true, 'Edit and submit the organization onboarding profile'),
  'org.members.view.own': member(false, false, 'View the members of your own organization'),

  // ---- account security, all account types (P2.4) -------------------------------------------------------------------------
  'mfa.factor.enroll': member(false, true, 'Enroll a TOTP factor'),
  'mfa.factor.remove': member(true, true, 'Remove an MFA factor'),
  'mfa.recovery.generate': member(true, true, 'Generate a new set of recovery codes'),
  'account.password.change': member(true, true, 'Change the password while signed in'),
} as const satisfies Record<string, ProtectedAction>;

export type ProtectedActionId = keyof typeof PROTECTED_ACTIONS;

export const isProtectedActionId = (value: unknown): value is ProtectedActionId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROTECTED_ACTIONS, value);

/** Every action that requires a fresh step-up, for documentation and tests. */
export const STEP_UP_ACTIONS = (Object.keys(PROTECTED_ACTIONS) as ProtectedActionId[]).filter((id) => PROTECTED_ACTIONS[id].stepUp);
