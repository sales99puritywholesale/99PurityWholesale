import { BILLING_MESSAGES } from '../billing/messages';
import { ONBOARDING_MESSAGES } from '../onboarding/messages';
import { INTEGRATION_MESSAGES } from '../integrations/messages';
import { INVENTORY_MESSAGES } from '../inventory/messages';
import { ADMIN_OPS_MESSAGES } from '../admin-ops/messages';
import { AFTERSALES_MESSAGES } from '../aftersales/messages';

// Pure module (no server imports): safe, user-facing copy for P3 result codes (and, since P4, the billing codes, so one banner serves both).
/** Safe, user-facing text for result codes. Never echoes database messages. */
export const COMMERCE_MESSAGES: Readonly<Record<string, string>> = {
  ...AFTERSALES_MESSAGES,
  ...ADMIN_OPS_MESSAGES,
  ...INVENTORY_MESSAGES,
  ...INTEGRATION_MESSAGES,
  ...ONBOARDING_MESSAGES,
  ...BILLING_MESSAGES,
  owner_required: 'Only an organization owner can do this.',
  forbidden: 'You do not have permission to do this.',
  step_up_required: 'Please verify your authenticator code again to continue.',
  organization_not_found: 'Organization not found.',
  not_available: 'This item is not available.',
  cart_full: 'Your cart has too many lines.',
  cart_empty: 'Your cart is empty.',
  order_too_large: 'This order is above the maximum order size. Split it into smaller orders.',
  owner_downgrade_not_allowed: 'An owner cannot be changed to a member here. Another owner must be assigned first.',
  product_not_priced: 'Set a base price and a minimum price for at least one variant before assigning this product.',
  already_member: 'That account is already a member with that role.',
  cart_not_purchasable: 'Some items in your cart are no longer available or have no price. Remove them and try again.',
  order_not_found: 'Order not found.',
  invalid_transition: 'That status change is not allowed for this order.',
  code_taken: 'That organization code is already in use.',
  user_not_found: 'No confirmed account with that email address.',
  member_not_allowed: 'That account cannot be added to an organization (staff accounts cannot be members).',
  variant_not_found: 'Variant not found.',
  product_not_found: 'Product not found.',
  not_found: 'Not found.',
  unavailable: 'The service is temporarily unavailable. Please try again.',
  invalid_response: 'Something went wrong. Please try again.',
};
export const messageFor = (code: string): string => (Object.hasOwn(COMMERCE_MESSAGES, code) ? COMMERCE_MESSAGES[code] : undefined) ?? 'Something went wrong. Please try again.';
