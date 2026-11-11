// Pure module (no imports): safe, user-facing copy for P9 result codes. Never echoes database messages. Merged into the shared banner table (commerce/messages.ts).
// The file codes document_not_found and document_invalid are shared with onboarding and live in onboarding/messages.ts (a test fails if a code is defined twice).
export const AFTERSALES_MESSAGES: Readonly<Record<string, string>> = {
  target_not_found: 'That lot or order does not belong to this organization.',
  already_published: 'A certificate was already published for that file.',
  already_withdrawn: 'This certificate is already withdrawn.',
  plan_code_taken: 'A plan with that code already exists.',
  plan_not_found: 'That commission plan is not available.',
  already_enrolled: 'This organization already has a referral code.',
  referral_code_not_found: 'No active referral code matches that code.',
  self_referral: 'An organization cannot refer itself.',
  already_referred: 'This organization already has a referrer.',
  already_ended: 'This referral link has already ended.',
  not_enrolled: 'This organization is not enrolled in the referral program.',
  insufficient_commission: 'The payout is more than the available commission balance.',
  idempotency_conflict: 'That request was already used with different details. Reload the page and try again.',
  template_variable_unknown: 'The text uses a {{placeholder}} that is not available for this message.',
  not_claimed: 'That message is not being sent right now.',
  no_provider: 'No e-mail provider is connected yet, so nothing was sent. Messages stay queued.',
};
