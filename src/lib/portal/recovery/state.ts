/**
 * Recovery state machine for ORGANIZATION users (P2.4, approved defaults). Pure and deterministic. The database (single-use code
 * rows, factor state in Supabase Auth) is authoritative; this machine defines which transitions and actions are legitimate and is
 * what the server flows and tests are written against. See docs/P2-2-P2-4-DESIGN.md section 8.1.
 *
 * Guarantees encoded here:
 *  - there is no path from a lost device to `mfa_active` that skips a verified replacement factor;
 *  - there is NO state in which a recovery code permits a sensitive action: sensitive actions are allowed only in `mfa_active`;
 *  - a recovery session is restricted (30 minutes) and expires back to `recovery_requested` (the used code stays consumed);
 *  - repeated wrong codes lock the flow (5 failures, 15 minutes).
 */
export type RecoveryStateKind = 'no_mfa' | 'mfa_active' | 'recovery_requested' | 'recovery_pending' | 'factor_replaced' | 'locked';

export type RecoveryContext = {
  readonly state: RecoveryStateKind;
  readonly failedAttempts: number;
  readonly pendingSince: Date | null;
  readonly lockedUntil: Date | null;
  /** True right after completion: a new set of recovery codes must be issued and the old set is void. */
  readonly issueNewCodes: boolean;
};

export type RecoveryEvent =
  | 'enrol_verified' //         a TOTP factor was enrolled and verified
  | 'device_lost' //            the user reports a lost authenticator
  | 'code_accepted' //          a valid, unused recovery code was consumed
  | 'code_rejected' //          a wrong or already used code
  | 'replacement_verified' //   a NEW factor was enrolled and verified during recovery
  | 'old_factor_removed' //     the lost factor was removed
  | 'tick'; //                  time passes (expiry and lock release are evaluated)

export const RECOVERY_PENDING_MINUTES = 30;
export const RECOVERY_MAX_FAILURES = 5;
export const RECOVERY_LOCK_MINUTES = 15;

export type TransitionResult = { readonly ok: true; readonly ctx: RecoveryContext } | { readonly ok: false; readonly reason: 'invalid-transition' | 'locked' };

export const initialContext = (hasVerifiedFactor: boolean): RecoveryContext => ({
  state: hasVerifiedFactor ? 'mfa_active' : 'no_mfa',
  failedAttempts: 0,
  pendingSince: null,
  lockedUntil: null,
  issueNewCodes: false,
});

const minutes = (m: number) => m * 60_000;
const invalid: TransitionResult = { ok: false, reason: 'invalid-transition' };

export function transition(ctx: RecoveryContext, event: RecoveryEvent, now: Date): TransitionResult {
  // Time-based evaluation first.
  if (ctx.state === 'locked') {
    if (ctx.lockedUntil && now.getTime() >= ctx.lockedUntil.getTime()) {
      ctx = { ...ctx, state: 'recovery_requested', failedAttempts: 0, lockedUntil: null };
    } else {
      return { ok: false, reason: 'locked' };
    }
  }
  if (ctx.state === 'recovery_pending' && ctx.pendingSince && now.getTime() - ctx.pendingSince.getTime() > minutes(RECOVERY_PENDING_MINUTES)) {
    ctx = { ...ctx, state: 'recovery_requested', pendingSince: null }; // the consumed code stays consumed
  }
  if (event === 'tick') return { ok: true, ctx };

  switch (ctx.state) {
    case 'no_mfa':
      return event === 'enrol_verified' ? { ok: true, ctx: { ...ctx, state: 'mfa_active', issueNewCodes: false } } : invalid;
    case 'mfa_active':
      return event === 'device_lost' ? { ok: true, ctx: { ...ctx, state: 'recovery_requested', failedAttempts: 0, issueNewCodes: false } } : invalid;
    case 'recovery_requested':
      if (event === 'code_accepted') return { ok: true, ctx: { ...ctx, state: 'recovery_pending', pendingSince: now, failedAttempts: 0 } };
      if (event === 'code_rejected') {
        const failed = ctx.failedAttempts + 1;
        if (failed >= RECOVERY_MAX_FAILURES) return { ok: true, ctx: { ...ctx, state: 'locked', failedAttempts: failed, lockedUntil: new Date(now.getTime() + minutes(RECOVERY_LOCK_MINUTES)) } };
        return { ok: true, ctx: { ...ctx, failedAttempts: failed } };
      }
      return invalid;
    case 'recovery_pending':
      return event === 'replacement_verified' ? { ok: true, ctx: { ...ctx, state: 'factor_replaced' } } : invalid;
    case 'factor_replaced':
      return event === 'old_factor_removed' ? { ok: true, ctx: { ...ctx, state: 'mfa_active', pendingSince: null, failedAttempts: 0, issueNewCodes: true } } : invalid;
    default:
      return invalid;
  }
}

export type RecoveryAction = 'enrol_factor' | 'submit_recovery_code' | 'enrol_replacement_factor' | 'remove_old_factor' | 'sensitive_actions';

/** What the application may offer in each state. Sensitive actions (step-up actions) are possible ONLY with an active factor. */
export function allowedActions(state: RecoveryStateKind): readonly RecoveryAction[] {
  switch (state) {
    case 'no_mfa':
      return ['enrol_factor'];
    case 'mfa_active':
      return ['sensitive_actions'];
    case 'recovery_requested':
      return ['submit_recovery_code'];
    case 'recovery_pending':
      return ['enrol_replacement_factor'];
    case 'factor_replaced':
      return ['remove_old_factor'];
    default:
      return [];
  }
}
