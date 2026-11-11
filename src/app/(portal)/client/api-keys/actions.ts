'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/portal/auth';
import { createEndpointSchema, createKeySchema, endpointActiveSchema, endpointIdSchema, revokeKeySchema } from '@/lib/portal/integrations/schemas';
import {
  apiKeyCreate, apiKeyRevoke, newApiKey, newSigningKey, webhookEndpointCreate, webhookEndpointRotate, webhookEndpointSetActive, webhookTest,
} from '@/lib/portal/integrations/server';
import { messageFor } from '@/lib/portal/commerce/messages';
import { back } from '@/components/portal/commerce-ui';
import type { SecretState } from '@/components/portal/one-time-secret';

/**
 * Customer actions of the integration settings. Each one: (1) signed-in user, (2) strict validation, (3) the RPC, which re-checks that the caller is an OWNER of the
 * organization (live keys also need the organization to be live) and writes the audit row. Secrets are generated here and returned ONCE to the form that asked for them.
 */
const PATH = '/client/api-keys';
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const orgOf = (f: FormData) => str(f, 'organizationId').slice(0, 36);
const err = (code: string): SecretState => ({ status: 'error', message: messageFor(code) });

export async function createKeyAction(_prev: SecretState, f: FormData): Promise<SecretState> {
  await requireUser(PATH);
  const p = createKeySchema.safeParse({ organizationId: orgOf(f), name: str(f, 'name'), environment: str(f, 'environment') });
  if (!p.success) return err('invalid_response');
  const k = newApiKey(p.data.environment);
  const r = await apiKeyCreate(p.data.organizationId, p.data.name, p.data.environment, k);
  return r.ok ? { status: 'created', secret: k.key, note: 'Copy this key now. It is shown only once and cannot be recovered; if you lose it, revoke it and create a new one.' } : err(r.code);
}

export async function createEndpointAction(_prev: SecretState, f: FormData): Promise<SecretState> {
  await requireUser(PATH);
  const p = createEndpointSchema.safeParse({ organizationId: orgOf(f), url: str(f, 'url'), events: f.getAll('events').map(String) });
  if (!p.success) return err('invalid_url');
  const signingKey = newSigningKey();
  const r = await webhookEndpointCreate(p.data.organizationId, p.data.url, p.data.events, signingKey);
  return r.ok ? { status: 'created', secret: signingKey, note: 'This signing key is shown only once. Use it to verify the X-99PW-Signature header of each delivery (see the API documentation).' } : err(r.code);
}

export async function rotateEndpointAction(_prev: SecretState, f: FormData): Promise<SecretState> {
  await requireUser(PATH);
  const p = endpointIdSchema.safeParse({ organizationId: orgOf(f), id: str(f, 'id') });
  if (!p.success) return err('invalid_response');
  const signingKey = newSigningKey();
  const r = await webhookEndpointRotate(p.data.organizationId, p.data.id, signingKey);
  return r.ok ? { status: 'created', secret: signingKey, note: 'New signing key, shown only once. The old key stops working immediately.' } : err(r.code);
}

export async function revokeKeyAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const p = revokeKeySchema.safeParse({ organizationId: org, id: str(f, 'id') });
  if (!p.success) redirect(back(PATH, { org }, { ok: false, code: 'invalid_response' }));
  const r = await apiKeyRevoke(p.data.organizationId, p.data.id);
  redirect(back(PATH, { org }, r.ok ? { ok: true } : r));
}

export async function toggleEndpointAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const p = endpointActiveSchema.safeParse({ organizationId: org, id: str(f, 'id'), active: str(f, 'active') === 'true' });
  if (!p.success) redirect(back(PATH, { org }, { ok: false, code: 'invalid_response' }));
  const r = await webhookEndpointSetActive(p.data.organizationId, p.data.id, p.data.active);
  redirect(back(PATH, { org }, r.ok ? { ok: true } : r));
}

export async function testEndpointAction(f: FormData): Promise<void> {
  await requireUser(PATH);
  const org = orgOf(f);
  const p = endpointIdSchema.safeParse({ organizationId: org, id: str(f, 'id') });
  if (!p.success) redirect(back(PATH, { org }, { ok: false, code: 'invalid_response' }));
  const r = await webhookTest(p.data.organizationId, p.data.id);
  redirect(back(PATH, { org }, r.ok ? { ok: true } : r));
}
