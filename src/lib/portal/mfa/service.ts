/**
 * TOTP multi-factor logic for the portal (Supabase Auth MFA), written against a small interface so it is unit-testable without Supabase and so that NO secret can cross it:
 * the adapter (adapter.ts) maps Supabase's answers to this interface and drops the TOTP secret and the otpauth URI; only the QR code image (an SVG data URI) is passed on, once,
 * to the page that must show it. Nothing here logs, stores or returns a secret, a code or a token. Pure module: no Next.js, no Node APIs.
 */
export type MfaErrorCode = 'invalid_code' | 'expired' | 'rate_limited' | 'no_factor' | 'not_allowed' | 'failed' | 'step_up_required' | 'approval_rejected' | 'already_approved';
export type AuthErr = { code?: string; message?: string; status?: number } | null;
export type Aal = 'aal1' | 'aal2' | null;

export interface MfaApi {
  listFactors(): Promise<{ factors: { id: string; type: string; status: string }[]; error: AuthErr }>;
  /** Starts a TOTP enrolment. The adapter returns the QR code image only (never the secret or the otpauth URI). */
  enrollTotp(p: { friendlyName: string; issuer: string }): Promise<{ id: string; qrCode: string } | { error: AuthErr }>;
  challenge(factorId: string): Promise<{ challengeId: string } | { error: AuthErr }>;
  verify(p: { factorId: string; challengeId: string; code: string }): Promise<{ error: AuthErr }>;
  unenroll(factorId: string): Promise<{ error: AuthErr }>;
  aal(): Promise<{ current: Aal; next: Aal; error: AuthErr }>;
}

export const CODE_PATTERN = /^\d{6}$/;
export const normalizeCode = (raw: unknown): string => String(raw ?? '').replace(/\s+/g, '');

/** Maps a Supabase Auth error to a fixed code (copy is looked up from the code; provider messages are never shown). */
export function mapMfaError(err: AuthErr): MfaErrorCode {
  const code = err?.code ?? '';
  if (err?.status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'rate_limited';
  if (code === 'mfa_challenge_expired') return 'expired';
  if (code === 'mfa_verification_failed' || code === 'validation_failed' || code === 'mfa_verification_rejected') return 'invalid_code';
  if (code === 'mfa_factor_not_found') return 'no_factor';
  return 'failed';
}

export const MFA_MESSAGES: Readonly<Record<MfaErrorCode, string>> = {
  invalid_code: 'That code is not correct. Enter the current six-digit code from your authenticator app.',
  expired: 'That verification expired. Enter a fresh code from your authenticator app.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  no_factor: 'No authenticator is set up for this account yet.',
  not_allowed: 'This action is not available for your account.',
  failed: 'Verification could not be completed. Try again, or sign out and sign in again.',
  step_up_required: 'Please verify your authenticator code again to continue.',
  approval_rejected: 'This authenticator could not be approved for staff access. Check the authorization code and that it has not expired, then start again.',
  already_approved: 'This authenticator is already approved.',
};
export const mfaMessage = (code: string): string => (code in MFA_MESSAGES ? MFA_MESSAGES[code as MfaErrorCode] : MFA_MESSAGES.failed);

export type AssuranceState = 'satisfied' | 'needs_challenge' | 'no_factor' | 'unknown';
/** satisfied: this session is aal2. needs_challenge: a verified factor exists but the session is aal1. no_factor: no verified factor. */
export async function assuranceState(api: MfaApi): Promise<AssuranceState> {
  const r = await api.aal();
  if (r.error) return 'unknown';
  if (r.current === 'aal2') return 'satisfied';
  if (r.next === 'aal2') return 'needs_challenge';
  return r.next === 'aal1' ? 'no_factor' : 'unknown';
}

export const isVerifiedTotp = (f: { type: string; status: string }) => f.type === 'totp' && f.status === 'verified';

export type EnrolResult = { ok: true; factorId: string; qrCode: string } | { ok: false; code: MfaErrorCode };
/** Starts (or restarts) enrolment: leftover UNVERIFIED TOTP factors of this user are removed first so abandoned attempts never accumulate; verified factors are never touched. */
export async function startEnrolment(api: MfaApi, opts: { issuer: string; nowMs: number }): Promise<EnrolResult> {
  const listed = await api.listFactors();
  if (listed.error) return { ok: false, code: mapMfaError(listed.error) };
  for (const f of listed.factors) if (f.type === 'totp' && f.status !== 'verified') await api.unenroll(f.id);
  const r = await api.enrollTotp({ friendlyName: `Portal authenticator ${new Date(opts.nowMs).toISOString().slice(0, 19)}Z`, issuer: opts.issuer });
  if ('error' in r) return { ok: false, code: mapMfaError(r.error) };
  // defensive: only a data-URI SVG image is ever rendered
  if (!r.id || !/^data:image\/svg\+xml[;,]/.test(r.qrCode)) return { ok: false, code: 'failed' };
  return { ok: true, factorId: r.id, qrCode: r.qrCode };
}

export type CodeResult = { ok: true } | { ok: false; code: MfaErrorCode };
async function challengeAndVerify(api: MfaApi, factorId: string, rawCode: unknown): Promise<CodeResult> {
  const code = normalizeCode(rawCode);
  if (!CODE_PATTERN.test(code)) return { ok: false, code: 'invalid_code' };
  const c = await api.challenge(factorId);
  if ('error' in c) return { ok: false, code: mapMfaError(c.error) };
  const v = await api.verify({ factorId, challengeId: c.challengeId, code });
  return v.error ? { ok: false, code: mapMfaError(v.error) } : { ok: true };
}

/** Confirms a new factor with its first code. On success Supabase promotes the session to aal2. The factor must be one of this user's UNVERIFIED TOTP factors. */
export async function confirmEnrolment(api: MfaApi, factorId: string, rawCode: unknown): Promise<CodeResult> {
  const listed = await api.listFactors();
  if (listed.error) return { ok: false, code: mapMfaError(listed.error) };
  if (!listed.factors.some((f) => f.id === factorId && f.type === 'totp' && f.status !== 'verified')) return { ok: false, code: 'not_allowed' };
  return challengeAndVerify(api, factorId, rawCode);
}

/** Cancels an enrolment in progress: only an UNVERIFIED TOTP factor of this user can be removed here (a verified factor is never removed by this path). */
export async function cancelEnrolment(api: MfaApi, factorId: string): Promise<CodeResult> {
  const listed = await api.listFactors();
  if (listed.error) return { ok: false, code: mapMfaError(listed.error) };
  const f = listed.factors.find((x) => x.id === factorId);
  if (!f || f.type !== 'totp' || f.status === 'verified') return { ok: false, code: 'not_allowed' };
  const r = await api.unenroll(factorId);
  return r.error ? { ok: false, code: mapMfaError(r.error) } : { ok: true };
}

/**
 * Lets a person whose authenticator was verified BEFORE their administrator opened the setup window (so it can never be approved) start over: removes their authenticators so a new one
 * can be created inside the window. It acts only when there is exactly ONE verified TOTP factor (several factors are refused: ask an administrator), and it also removes leftover
 * unverified ones. The caller must refuse administrators (their approved authenticator must never be removed this way).
 */
export async function removeSoleVerifiedFactor(api: MfaApi): Promise<CodeResult> {
  const listed = await api.listFactors();
  if (listed.error) return { ok: false, code: mapMfaError(listed.error) };
  const totp = listed.factors.filter((f) => f.type === 'totp');
  const verified = totp.filter(isVerifiedTotp);
  if (verified.length !== 1) return { ok: false, code: 'not_allowed' };
  for (const f of totp) {
    const r = await api.unenroll(f.id);
    if (r.error) return { ok: false, code: mapMfaError(r.error) };
  }
  return { ok: true };
}

/** Login challenge (and step-up): verifies a code against the user's verified TOTP factor. Reaching aal2 / refreshing the TOTP time is done by Supabase. */
export async function verifyChallenge(api: MfaApi, rawCode: unknown): Promise<CodeResult> {
  const listed = await api.listFactors();
  if (listed.error) return { ok: false, code: mapMfaError(listed.error) };
  const factor = listed.factors.find(isVerifiedTotp);
  if (!factor) return { ok: false, code: 'no_factor' };
  return challengeAndVerify(api, factor.id, rawCode);
}

/** Where to send a user right after the password step. Customers without a factor go straight on; a verified factor means a challenge; an ACTIVE staff member without one must enrol. */
export async function loginDestination(p: { api: MfaApi; staffStatus: 'none' | 'active' | 'disabled'; next: string }): Promise<string> {
  const q = `next=${encodeURIComponent(p.next)}`;
  const state = await assuranceState(p.api);
  if (state === 'needs_challenge') return `/login/mfa?${q}`;
  if (state === 'no_factor' && p.staffStatus === 'active') return `/login/mfa/setup?${q}`;
  return p.next;
}

export type RpcCall = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
/** Binds the verified factor to the staff member's open enrolment window (rpc_staff_claim_factor). The database requires a fresh TOTP verification and checks the factor was created inside the window. */
export async function claimFactor(rpc: RpcCall, windowId: string, factorId: string): Promise<CodeResult> {
  const { data, error } = await rpc('rpc_staff_claim_factor', { p_window_id: windowId, p_factor_id: factorId });
  if (error || !data || typeof data !== 'object') return { ok: false, code: 'failed' };
  const d = data as { ok?: unknown; code?: unknown };
  if (d.ok === true) return { ok: true };
  if (d.code === 'step_up_required' || d.code === 'approval_rejected' || d.code === 'already_approved') return { ok: false, code: d.code };
  return { ok: false, code: 'failed' };
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
