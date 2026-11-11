import { z } from 'zod';
import { isWellFormedInviteToken } from './token';

/**
 * Input schemas for P2.3 (validation at the application boundary; the database re-validates everything and is authoritative).
 */

// Same rule as public.organization_invites.email (0001): lower case, at most 254 chars, one '@', no spaces.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^@\s]+@[^@\s]+$/, 'invalid email');

export const createInviteSchema = z
  .object({
    organizationId: z.string().uuid(),
    email: emailSchema,
    role: z.enum(['owner', 'member']),
  })
  .strict();
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z
  .object({ token: z.string().refine(isWellFormedInviteToken, 'invalid token') })
  .strict();

/**
 * Organization business profile for onboarding. FIELDS ARE ONLY THE APPROVED M1 SET (docs/MILESTONE-1-SCHEMA-AND-RLS.md):
 * organization name and billing address (update_organization_profile), plus the business fields of the account request
 * (contact_name, phone, country, website, business_type). No tax id, licence or other legal field is requested or invented.
 */
const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalTrimmed = (max: number) => z.string().trim().max(max).optional();

export const billingAddressSchema = z
  .object({
    line1: trimmed(200),
    line2: optionalTrimmed(200),
    city: trimmed(120),
    region: optionalTrimmed(120),
    postal_code: trimmed(20),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 country code'),
  })
  .strict()
  .refine((a) => JSON.stringify(a).length <= 4096, 'billing address too large');

export const onboardingProfileSchema = z
  .object({
    organizationName: trimmed(200),
    contactName: trimmed(200),
    phone: optionalTrimmed(40),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 country code'),
    website: z
      .string()
      .trim()
      .max(300)
      .refine((w) => {
        try {
          const u = new URL(w);
          return u.protocol === 'https:' || u.protocol === 'http:';
        } catch {
          return false;
        }
      }, 'invalid website')
      .optional(),
    businessType: trimmed(100),
    billingAddress: billingAddressSchema,
  })
  .strict();
export type OnboardingProfileInput = z.infer<typeof onboardingProfileSchema>;

/** Onboarding states. Purchasing access requires `approved` (admin approval, approved default). */
export const ONBOARDING_STATUSES = ['draft', 'submitted', 'changes_requested', 'approved'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

const ONBOARDING_TRANSITIONS: Readonly<Record<OnboardingStatus, readonly OnboardingStatus[]>> = {
  draft: ['submitted'],
  submitted: ['changes_requested', 'approved'],
  changes_requested: ['submitted'],
  approved: [], // changing an approved profile is a later, explicit staff action
};

export const canTransitionOnboarding = (from: OnboardingStatus, to: OnboardingStatus): boolean => ONBOARDING_TRANSITIONS[from].includes(to);

/** Wholesale purchasing access is allowed only for an approved onboarding (default deny for every other state). */
export const purchasingAllowed = (status: OnboardingStatus | null | undefined): boolean => status === 'approved';
