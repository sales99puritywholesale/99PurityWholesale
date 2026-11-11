import 'server-only';
import type { MfaApi, Aal, AuthErr } from './service';

type AuthLike = {
  mfa: {
    listFactors(): Promise<{ data: { all: { id: string; factor_type: string; status: string }[] } | null; error: AuthErr }>;
    enroll(p: { factorType: 'totp'; friendlyName?: string; issuer?: string }): Promise<{ data: { id: string; totp: { qr_code: string } } | null; error: AuthErr }>;
    challenge(p: { factorId: string }): Promise<{ data: { id: string } | null; error: AuthErr }>;
    verify(p: { factorId: string; challengeId: string; code: string }): Promise<{ data: unknown; error: AuthErr }>;
    unenroll(p: { factorId: string }): Promise<{ data: unknown; error: AuthErr }>;
    getAuthenticatorAssuranceLevel(): Promise<{ data: { currentLevel: Aal; nextLevel: Aal } | null; error: AuthErr }>;
  };
};

/**
 * Maps the Supabase Auth MFA client (the user's own SSR session; no service role) to the MfaApi of service.ts.
 * The TOTP secret and the otpauth URI that Supabase returns at enrolment are DROPPED here: only the QR code image goes on.
 */
export function createMfaApi(auth: unknown): MfaApi {
  const a = auth as AuthLike;
  return {
    async listFactors() {
      const { data, error } = await a.mfa.listFactors();
      return { factors: (data?.all ?? []).map((f) => ({ id: f.id, type: f.factor_type, status: f.status })), error };
    },
    async enrollTotp(p) {
      const { data, error } = await a.mfa.enroll({ factorType: 'totp', friendlyName: p.friendlyName, issuer: p.issuer });
      if (error || !data) return { error: error ?? { code: 'unexpected_failure' } };
      return { id: data.id, qrCode: data.totp.qr_code };
    },
    async challenge(factorId) {
      const { data, error } = await a.mfa.challenge({ factorId });
      if (error || !data) return { error: error ?? { code: 'unexpected_failure' } };
      return { challengeId: data.id };
    },
    async verify(p) {
      const { error } = await a.mfa.verify(p);
      return { error };
    },
    async unenroll(factorId) {
      const { error } = await a.mfa.unenroll({ factorId });
      return { error };
    },
    async aal() {
      const { data, error } = await a.mfa.getAuthenticatorAssuranceLevel();
      return { current: data?.currentLevel ?? null, next: data?.nextLevel ?? null, error };
    },
  };
}
