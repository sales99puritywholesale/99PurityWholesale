import 'server-only';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { call, done } from '../rpc-call';
import { formatApiKey, hashApiKey, keyPrefix, type KeyEnvironment } from './keys';

/**
 * Typed access to the P6 customer and staff RPCs (supabase/review/p6/20261111000300_p6_api_integrations.sql). Everything runs with the signed-in user's session: the database decides
 * who may do what. Secrets are generated HERE, shown to the user once, and only a hash (API keys, worker token) or the signing key (webhooks, which the sender needs) is stored.
 */
export type NewApiKey = { key: string; prefix: string; hash: string };
export function newApiKey(env: KeyEnvironment): NewApiKey {
  const key = formatApiKey(env, randomBytes(20));
  return { key, prefix: keyPrefix(key), hash: hashApiKey(key) };
}
/** `whsec_` + 48 hex characters (24 random bytes). */
export const newSigningKey = (): string => `whsec_${randomBytes(24).toString('hex')}`;
/** The delivery worker token (a random value, shown once; the database keeps its SHA-256). */
export function newWorkerToken(): { token: string; hash: string } {
  const token = `99pw_worker_${randomBytes(32).toString('hex')}`;
  return { token, hash: hashApiKey(token) };
}

const iso = z.string();
const keyRow = z.object({
  id: z.string().uuid(), name: z.string(), environment: z.enum(['test', 'live']), prefix: z.string(), scopes: z.array(z.string()), created_at: iso, last_used_at: iso.nullable(), revoked_at: iso.nullable(),
});
export type ApiKeyRow = z.infer<typeof keyRow>;
export const apiKeysList = (organizationId: string) =>
  call('rpc_api_keys_list', { p_organization_id: organizationId }, z.object({ live_available: z.boolean(), can_edit: z.boolean(), keys: z.array(keyRow) }));
export const apiKeyCreate = (organizationId: string, name: string, environment: KeyEnvironment, k: NewApiKey) =>
  call('rpc_api_key_create', { p_organization_id: organizationId, p_name: name, p_environment: environment, p_prefix: k.prefix, p_key_hash: k.hash }, done);
export const apiKeyRevoke = (organizationId: string, id: string) => call('rpc_api_key_revoke', { p_organization_id: organizationId, p_id: id }, done);

const endpointRow = z.object({
  id: z.string().uuid(), url: z.string(), events: z.array(z.string()), active: z.boolean(), created_at: iso, secret_rotated_at: iso.nullable(),
  delivered: z.number().int(), failed: z.number().int(), pending: z.number().int(),
});
export type EndpointRow = z.infer<typeof endpointRow>;
export const webhookEndpointsList = (organizationId: string) => call('rpc_webhook_endpoints_list', { p_organization_id: organizationId }, z.object({ can_edit: z.boolean(), endpoints: z.array(endpointRow) }));
export const webhookEndpointCreate = (organizationId: string, url: string, events: string[], signingKey: string) =>
  call('rpc_webhook_endpoint_create', { p_organization_id: organizationId, p_url: url, p_events: events, p_signing_key: signingKey }, done);
export const webhookEndpointSetActive = (organizationId: string, id: string, active: boolean) => call('rpc_webhook_endpoint_set_active', { p_organization_id: organizationId, p_id: id, p_active: active }, done);
export const webhookEndpointRotate = (organizationId: string, id: string, signingKey: string) => call('rpc_webhook_endpoint_rotate', { p_organization_id: organizationId, p_id: id, p_signing_key: signingKey }, done);
export const webhookTest = (organizationId: string, id: string) => call('rpc_webhook_test', { p_organization_id: organizationId, p_id: id }, done);

const deliveryRow = z.object({
  id: z.string().uuid(), url: z.string(), event_type: z.string(), status: z.enum(['pending', 'delivered', 'failed']), attempts: z.number().int(), last_http_status: z.number().int().nullable(),
  last_error: z.string().nullable(), created_at: iso, delivered_at: iso.nullable(),
});
export type DeliveryRow = z.infer<typeof deliveryRow>;
export const webhookDeliveriesList = (organizationId: string) => call('rpc_webhook_deliveries_list', { p_organization_id: organizationId, p_limit: 30 }, z.object({ deliveries: z.array(deliveryRow) }));

const orderRow = z.object({
  id: z.string().uuid(), order_number: z.string(), external_ref: z.string(), status: z.string(), sandbox: z.boolean(), created_at: iso, lines: z.array(z.object({ sku: z.string(), quantity: z.number().int() })),
});
export type IntegrationOrder = z.infer<typeof orderRow>;
export const integrationOrdersList = (organizationId: string) => call('rpc_integration_orders_list', { p_organization_id: organizationId, p_limit: 20 }, z.object({ orders: z.array(orderRow) }));

// ---------------------------------------------------------------------------------------------------------------- admin (staff)
const adminKeyRow = z.object({
  id: z.string().uuid(), organization_id: z.string().uuid(), organization_name: z.string(), organization_code: z.string(), name: z.string(), environment: z.enum(['test', 'live']), prefix: z.string(),
  created_at: iso, last_used_at: iso.nullable(), revoked_at: iso.nullable(),
});
export type AdminApiKeyRow = z.infer<typeof adminKeyRow>;
export const adminApiKeysList = () => call('rpc_admin_api_keys_list', {}, z.object({ keys: z.array(adminKeyRow) }));
export const adminApiKeyRevoke = (id: string) => call('rpc_admin_api_key_revoke', { p_id: id }, done);
const failureRow = z.object({ id: z.string().uuid(), organization_name: z.string(), url: z.string(), event_type: z.string(), attempts: z.number().int(), last_http_status: z.number().int().nullable(), last_error: z.string().nullable(), created_at: iso });
export type DeliveryFailure = z.infer<typeof failureRow>;
export const adminDeliveriesOverview = () =>
  call('rpc_admin_deliveries_overview', {}, z.object({ pending: z.number().int(), failed_24h: z.number().int(), delivered_24h: z.number().int(), worker_token_active: z.boolean(), recent_failures: z.array(failureRow) }));
export const adminWorkerTokenCreate = (hash: string) => call('rpc_admin_worker_token_create', { p_token_hash: hash }, done);
