// Pure module (no server imports): safe, user-facing copy for P6 result codes. Never echoes database messages.
export const INTEGRATION_MESSAGES: Readonly<Record<string, string>> = {
  not_live: 'Live keys are available after your fulfillment setup has gone live. Create a test key for now.',
  too_many_keys: 'You already have the maximum number of active API keys. Revoke one first.',
  key_not_found: 'API key not found.',
  endpoint_not_found: 'Webhook endpoint not found.',
  too_many_endpoints: 'You already have the maximum number of webhook endpoints.',
  duplicate_endpoint: 'That URL is already registered.',
  invalid_url: 'Use an https URL on a public domain name (no IP addresses, no localhost, no port other than 443).',
  already_revoked: 'That key is already revoked.',
  inactive: 'Activate the endpoint first.',
};
