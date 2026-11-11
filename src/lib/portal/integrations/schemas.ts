import { z } from 'zod';
import { KEY_ENVIRONMENTS, WEBHOOK_EVENTS, isSafeWebhookUrl } from './keys';

/** Input validation for the P6 server actions (customer and staff). Strict objects, UUID ids; the database re-validates everything. */
export const uuid = z.string().uuid();
const httpsWebhook = z.string().trim().max(300).refine(isSafeWebhookUrl, 'not a safe https webhook URL');

export const createKeySchema = z.object({ organizationId: uuid, name: z.string().trim().min(1).max(80), environment: z.enum(KEY_ENVIRONMENTS) }).strict();
export const revokeKeySchema = z.object({ organizationId: uuid, id: uuid }).strict();
export const createEndpointSchema = z
  .object({ organizationId: uuid, url: httpsWebhook, events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length) })
  .strict();
export const endpointIdSchema = z.object({ organizationId: uuid, id: uuid }).strict();
export const endpointActiveSchema = z.object({ organizationId: uuid, id: uuid, active: z.boolean() }).strict();
export const adminRevokeKeySchema = z.object({ id: uuid }).strict();
