import 'server-only';
import { z } from 'zod';
import { createPortalServerClient } from '@/portal/db/server';

/**
 * Shared typed RPC caller for the P5 to P9 server layers. Every call runs with the signed-in user's own session, so the DATABASE decides who may do what; nothing here
 * uses a service-role key. Answers are validated; anything unexpected (an error, a missing function, a malformed body) becomes a generic failure code.
 */
export type Result<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly code: string };

const envelope = z.object({ ok: z.boolean(), code: z.string().max(64).optional() }).passthrough();
export const done = z.object({ ok: z.literal(true), code: z.string().optional() }).passthrough();
export const cents = z.number().int().nonnegative();

export async function call<S extends z.ZodTypeAny>(fn: string, args: Record<string, unknown>, schema: S): Promise<Result<z.infer<S>>> {
  try {
    const supabase = createPortalServerClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, code: 'unavailable' };
    const env = envelope.safeParse(data);
    if (!env.success) return { ok: false, code: 'invalid_response' };
    if (!env.data.ok) return { ok: false, code: env.data.code ?? 'failed' };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: 'invalid_response' };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}
