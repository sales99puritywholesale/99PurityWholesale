import { z } from 'zod';
import type { StaffAccessContext } from './evaluate';

/**
 * Builds a StaffAccessContext from the answer of the database function public.rpc_my_staff_context() (migration 0004, draft).
 * The payload is validated strictly; anything unexpected yields the deny-all context. The application never derives roles,
 * assurance level or MFA state from anything the browser sends.
 */
const payloadSchema = z
  .object({
    staff_status: z.enum(['none', 'active', 'disabled']),
    roles: z.array(z.string().max(40)).max(16),
    session_ok: z.boolean(),
    step_up_ok: z.boolean(),
    last_totp_epoch: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export function denyAllContext(authenticated: boolean, now: Date): StaffAccessContext {
  return { authenticated, staffStatus: 'none', roles: [], dbSessionOk: false, totpVerifiedAt: null, now };
}

export function parseStaffContext(raw: unknown, authenticated: boolean, now: Date): StaffAccessContext {
  if (!authenticated) return denyAllContext(false, now);
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return denyAllContext(true, now);
  const p = parsed.data;
  const epoch = p.last_totp_epoch;
  return {
    authenticated: true,
    staffStatus: p.staff_status,
    roles: p.roles,
    dbSessionOk: p.session_ok,
    totpVerifiedAt: typeof epoch === 'number' ? new Date(epoch * 1000) : null,
    now,
  };
}
