// Pure module (no server imports): safe, user-facing copy for P4 result codes. Never echoes database messages.
export const BILLING_MESSAGES: Readonly<Record<string, string>> = {
  forbidden: 'You do not have permission to do this.',
  step_up_required: 'Please verify your authenticator code again to continue.',
  organization_not_found: 'Organization not found.',
  invoice_not_found: 'Invoice not found.',
  invoice_not_payable: 'This invoice is not open for payment.',
  payment_not_found: 'Payment not found.',
  payment_already_reviewed: 'This payment has already been reviewed.',
  too_many_pending: 'This invoice already has several payments awaiting confirmation. Please wait for them to be reviewed.',
  exceeds_balance: 'The amount is more than the remaining balance on this invoice.',
  has_payments: 'An invoice with confirmed payments cannot be voided.',
  already_void: 'This invoice is already void.',
  wallet_disabled: 'The wallet is not available.',
  not_found: 'Not found.',
  unavailable: 'The service is temporarily unavailable. Please try again.',
  invalid_response: 'Something went wrong. Please try again.',
};
export const billingMessageFor = (code: string): string =>
  (Object.hasOwn(BILLING_MESSAGES, code) ? BILLING_MESSAGES[code] : undefined) ?? 'Something went wrong. Please try again.';
