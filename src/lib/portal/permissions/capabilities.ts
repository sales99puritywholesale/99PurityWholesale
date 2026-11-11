/**
 * Staff roles and capability catalog (P2.2).
 *
 * SOURCE OF TRUTH: the database. `public.capabilities` and `public.role_capabilities` are seeded by the approved migration
 * 20261108000002_staff_capabilities.sql and enforced by RLS and (from the P2.2 migrations) by SECURITY DEFINER RPCs.
 * This file mirrors that seed for type safety, navigation and UI decisions only. A unit test parses the migration SQL and
 * fails if this mirror and the seed ever differ. It must never be used as the only check before a protected mutation.
 *
 * Exactly four roles exist. There is no super-admin and no role that bypasses capability checks.
 *
 * Pure module: no server-only, no Node APIs (importable from middleware, server and tests).
 */

export const STAFF_ROLES = ['admin', 'finance', 'operations', 'support'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const CAPABILITY_CODES = [
  'org.read',
  'org.billing.read',
  'org.manage',
  'members.read',
  'members.manage',
  'invites.read',
  'profiles.read.full',
  'profiles.read.basic',
  'applications.read.full',
  'applications.read.basic',
  'applications.review',
  'staff.read',
  'staff.manage',
  'flags.read',
  'flags.write',
  'gates.read',
  'gates.write',
  'audit.read',
  'documents.read',
  'documents.delete',
  'payments.confirm',
  'payments.reconcile',
  'financial.write',
  'inventory.adjust',
  'fulfillment.process',
  'onboarding.review',
  'onboarding.golive',
  // added by migration 0005 (review draft rev3): operator authorization of owner MFA enrolment windows; admin only
  'owner.mfa.authorize',
] as const;
export type CapabilityCode = (typeof CAPABILITY_CODES)[number];

/** Role to capability mapping, identical to the approved seed (admin 28 once 0005 is applied, finance 8, operations 7, support 8). */
export const ROLE_CAPABILITIES: Readonly<Record<StaffRole, readonly CapabilityCode[]>> = {
  admin: CAPABILITY_CODES,
  finance: [
    'org.read',
    'org.billing.read',
    'flags.read',
    'gates.read',
    'documents.read',
    'payments.confirm',
    'payments.reconcile',
    'financial.write',
  ],
  operations: ['org.read', 'flags.read', 'gates.read', 'documents.read', 'inventory.adjust', 'fulfillment.process', 'onboarding.review'],
  support: [
    'org.read',
    'members.read',
    'invites.read',
    'profiles.read.basic',
    'applications.read.basic',
    'flags.read',
    'gates.read',
    'documents.read',
  ],
};

const ROLE_SET: ReadonlySet<string> = new Set(STAFF_ROLES);
const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITY_CODES);

export const isStaffRole = (value: unknown): value is StaffRole => typeof value === 'string' && ROLE_SET.has(value);
export const isCapabilityCode = (value: unknown): value is CapabilityCode => typeof value === 'string' && CAPABILITY_SET.has(value);

/** Union of the capabilities of the given roles. Unknown role strings are ignored (default deny), never mapped to anything. */
export function capabilitiesForRoles(roles: readonly unknown[]): ReadonlySet<CapabilityCode> {
  const out = new Set<CapabilityCode>();
  for (const role of roles) {
    if (!isStaffRole(role)) continue;
    for (const code of ROLE_CAPABILITIES[role]) out.add(code);
  }
  return out;
}

export const roleHasCapability = (role: unknown, capability: CapabilityCode): boolean =>
  isStaffRole(role) && ROLE_CAPABILITIES[role].includes(capability);
