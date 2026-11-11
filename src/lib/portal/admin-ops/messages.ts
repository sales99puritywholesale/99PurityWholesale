// Pure module (no imports): safe, user-facing copy for P8 result codes and for the P2 staff-management codes, so one banner serves both. Never echoes database messages.
// The staff texts are copies of STAFF_RPC_MESSAGES (src/lib/portal/staff-rpc.ts). They are copied, not imported, on purpose: that module pulls in the whole permissions graph, and
// every server-action file imports this table through the shared banner. tests/portal/admin-ops.test.ts fails if a copy ever differs from the original.
export const ADMIN_OPS_MESSAGES: Readonly<Record<string, string>> = {
  self_change_not_allowed: 'You cannot change your own staff access. Another administrator must do this.',
  organization_member_conflict: 'This user belongs to an organization and cannot be staff.',
  already_staff: 'This user is already a staff member.',
  not_staff: 'This user is not a staff member.',
  role_not_found: 'The user does not have that role.',
  last_admin_protected: 'The last active administrator cannot be removed or disabled.',
  invariant_protected: 'This change is not allowed because it would break a protected rule.',
  window_already_open: 'An enrolment window is already open for this user.',
  target_not_eligible: 'The user cannot be enrolled right now.',
  window_not_open: 'That enrolment window is not open.',
  approval_rejected: 'The authenticator could not be approved. Ask an administrator to open a new window.',
  already_approved: 'This authenticator is already approved.',
  has_open_items: 'This organization still has unpaid invoices or open fulfillment orders, so it cannot be closed yet.',
  member_not_found: 'That member was not found in this organization.',
  last_owner_protected: 'An organization must keep at least one active owner. Add another owner first.',
  application_not_found: 'Application not found.',
  effective_date_invalid: 'The start date must be after the date the current price started.',
};
