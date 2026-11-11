import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROTECTED_ACTIONS,
  evaluateMemberAction,
  evaluateOwnerAction,
  parseOwnerContext,
  parseOwnerFactorRpcResult,
  parseOperatorOwnerMfaResult,
  parseOwnerRecoveryResult,
  OWNER_FACTOR_RPC_CODES,
  OPERATOR_OWNER_MFA_CODES,
  OWNER_RECOVERY_RPC_CODES,
  OWNER_FACTOR_STATES,
  OWNER_RECOVERY_STATUSES,
  OWNER_RECOVERY_STATUSES_SINCE_REV5,
  RECOVERY_CODE_SATISFIES_STEP_UP,
  RECOVERY_CODE_GRANTS_OWNER_PRIVILEGES,
  FIRST_OWNER_ENROLMENT_IS_SELF_SERVICE,
  ROLE_CAPABILITIES,
  STAFF_ROLES,
  type OwnerAccessContext,
  type ProtectedActionId,
  type StaffAccessContext,
} from '@/lib/portal/permissions';
import { RECOVERY_CODE_COUNT } from '@/lib/portal/recovery/codes';
import { RATE_LIMIT_BUCKETS, RATE_LIMIT_POLICIES, isRateLimitBucket, parseThrottleResult } from '@/lib/portal/ratelimit/policies';
import { deriveRateLimitKey, loadRateLimitPepper, normalizeRateLimitIdentifier, toPostgrestBytea } from '@/lib/portal/ratelimit/keys';
import {
  STAFF_RPC_FAILURE_CODES,
  STAFF_RPC_MESSAGES,
  STAFF_RPC_SUCCESS_CODES,
  parseStaffRpcResult,
  precheckStaffAction,
  staffRpcHttpStatus,
} from '@/lib/portal/staff-rpc';

const OWNER_ACTIONS = (Object.keys(PROTECTED_ACTIONS) as ProtectedActionId[]).filter((id) => PROTECTED_ACTIONS[id].actor === 'organization-owner');
const MEMBER_ACTIONS = (Object.keys(PROTECTED_ACTIONS) as ProtectedActionId[]).filter((id) => PROTECTED_ACTIONS[id].actor === 'organization-member');
const owner = (o: Partial<OwnerAccessContext> = {}): OwnerAccessContext => ({ authenticated: true, isOwner: true, ownerMfaOk: true, stepUpOk: true, ...o });

describe('owner MFA (D-P24-4)', () => {
  it('every owner action requires an owner WITH MFA; an owner without MFA is denied all of them', () => {
    expect(OWNER_ACTIONS.length).toBeGreaterThan(5);
    for (const id of OWNER_ACTIONS) {
      expect(evaluateOwnerAction(owner(), id).allowed, id).toBe(true);
      expect(evaluateOwnerAction(owner({ ownerMfaOk: false }), id), id).toEqual({ allowed: false, reason: 'owner-mfa-required' });
    }
  });
  it('a non-owner member, an unauthenticated user and an owner of another organization are denied', () => {
    for (const id of OWNER_ACTIONS) {
      expect(evaluateOwnerAction(owner({ isOwner: false, ownerMfaOk: false }), id), id).toEqual({ allowed: false, reason: 'not-owner' });
      expect(evaluateOwnerAction(owner({ authenticated: false }), id), id).toEqual({ allowed: false, reason: 'unauthenticated' });
    }
  });
  it('step-up actions additionally need a fresh verification; plain owner actions do not', () => {
    for (const id of OWNER_ACTIONS) {
      const need = PROTECTED_ACTIONS[id].stepUp;
      const d = evaluateOwnerAction(owner({ stepUpOk: false }), id);
      expect(d.allowed, id).toBe(!need);
      if (need) expect(d, id).toEqual({ allowed: false, reason: 'step-up-required' });
    }
    expect(PROTECTED_ACTIONS['org.ownership.transfer'].stepUp).toBe(true);
    expect(PROTECTED_ACTIONS['org.invite.create.owner'].stepUp).toBe(true);
    expect(PROTECTED_ACTIONS['org.invite.create.member'].stepUp).toBe(false);
  });
  it('ordinary members do NOT need MFA, except for actions that are step-up actions themselves', () => {
    for (const id of MEMBER_ACTIONS) {
      const need = PROTECTED_ACTIONS[id].stepUp;
      expect(evaluateMemberAction({ authenticated: true, stepUpOk: false }, id).allowed, id).toBe(!need);
      expect(evaluateMemberAction({ authenticated: true, stepUpOk: true }, id).allowed, id).toBe(true);
      expect(evaluateMemberAction({ authenticated: false, stepUpOk: true }, id).allowed, id).toBe(false);
    }
    expect(evaluateMemberAction({ authenticated: true, stepUpOk: false }, 'org.members.view.own').allowed).toBe(true);
  });
  it('the evaluators never cross actor types and reject unknown and prototype ids', () => {
    expect(evaluateOwnerAction(owner(), 'staff.role.grant')).toEqual({ allowed: false, reason: 'wrong-actor-type' });
    expect(evaluateOwnerAction(owner(), 'mfa.factor.enroll')).toEqual({ allowed: false, reason: 'wrong-actor-type' });
    expect(evaluateMemberAction({ authenticated: true, stepUpOk: true }, 'org.ownership.transfer')).toEqual({ allowed: false, reason: 'wrong-actor-type' });
    for (const bad of ['', 'nope', '__proto__', 'constructor', 'toString']) {
      expect(evaluateOwnerAction(owner(), bad)).toEqual({ allowed: false, reason: 'unknown-action' });
      expect(evaluateMemberAction({ authenticated: true, stepUpOk: true }, bad)).toEqual({ allowed: false, reason: 'unknown-action' });
    }
  });
  const ctxRaw = (o: Record<string, unknown> = {}) => ({ is_owner: true, owner_mfa_ok: true, step_up_ok: true, factor_state: 'approved', recovery_status: 'none', recovery_codes_remaining: 10, ...o });
  it('parses the database answer strictly and fails closed', () => {
    expect(parseOwnerContext(ctxRaw({ step_up_ok: false }), true)).toEqual({ authenticated: true, isOwner: true, ownerMfaOk: true, stepUpOk: false, factorState: 'approved', recoveryStatus: 'none', recoveryCodesRemaining: 10 });
    expect(parseOwnerContext(ctxRaw({ is_owner: false }), true).ownerMfaOk).toBe(false); // MFA is meaningless without ownership
    const deny = { authenticated: true, isOwner: false, ownerMfaOk: false, stepUpOk: false };
    const base = ctxRaw();
    const without = (k: string) => Object.fromEntries(Object.entries(base).filter(([key]) => key !== k));
    for (const bad of [null, undefined, 'x', 1, [], {}, ctxRaw({ is_owner: 'true' }), ctxRaw({ owner_mfa_ok: 1 }), ctxRaw({ role: 'admin' }),
      without('factor_state'), without('recovery_status'), without('recovery_codes_remaining'), // pre-rev3 shapes are no longer accepted
      ctxRaw({ factor_state: 'verified' }), ctxRaw({ factor_state: 7 }), ctxRaw({ recovery_status: 'done' }), ctxRaw({ recovery_codes_remaining: -1 }),
      ctxRaw({ recovery_codes_remaining: 11 }), ctxRaw({ recovery_codes_remaining: 1.5 }), ctxRaw({ recovery_codes_remaining: '10' })]) {
      expect(parseOwnerContext(bad, true), JSON.stringify(bad)).toEqual(deny);
    }
    expect(parseOwnerContext(ctxRaw(), false)).toEqual({ authenticated: false, isOwner: false, ownerMfaOk: false, stepUpOk: false });
  });
  it('an abandoned-then-verified factor never yields owner MFA: every state other than "approved" denies, even if owner_mfa_ok were reported true', () => {
    for (const state of OWNER_FACTOR_STATES) {
      const ctx = parseOwnerContext(ctxRaw({ factor_state: state }), true);
      expect(ctx.ownerMfaOk, state).toBe(state === 'approved');
      if (state !== 'approved') for (const id of OWNER_ACTIONS) expect(evaluateOwnerAction(ctx, id), `${state}/${id}`).toEqual({ allowed: false, reason: 'owner-mfa-required' });
    }
  });
  it('a ready or cooling-off recovery request never grants anything: owner privileges depend on the factor state only', () => {
    for (const rec of OWNER_RECOVERY_STATUSES) {
      const ctx = parseOwnerContext(ctxRaw({ owner_mfa_ok: false, factor_state: 'recovery_required', recovery_status: rec, recovery_codes_remaining: 9 }), true);
      expect(ctx.ownerMfaOk, rec).toBe(false);
      for (const id of OWNER_ACTIONS) expect(evaluateOwnerAction(ctx, id).allowed, `${rec}/${id}`).toBe(false);
    }
  });
});

describe('recovery codes and first enrolment: the approved rules (D-P24-6, D-P24-9, D-P24-10)', () => {
  it('no protected action can be satisfied by a recovery code and none lists one as an alternative to step-up', () => {
    expect(RECOVERY_CODE_SATISFIES_STEP_UP).toBe(false);
    expect(RECOVERY_CODE_GRANTS_OWNER_PRIVILEGES).toBe(false);
    // Structural rule: the registry has no field through which an action could name an alternative to a fresh TOTP step-up. Any new field must be reviewed here.
    const ALLOWED_FIELDS = new Set(['actor', 'capability', 'stepUp', 'audit', 'description']);
    for (const [id, a] of Object.entries(PROTECTED_ACTIONS)) for (const k of Object.keys(a)) expect(ALLOWED_FIELDS.has(k), `${id}.${k}`).toBe(true);
    // The only action that mentions codes is the one that GENERATES them, and it demands a step-up itself.
    expect(PROTECTED_ACTIONS['mfa.recovery.generate']).toMatchObject({ actor: 'organization-member', stepUp: true });
  });
  it('first owner enrolment is operator-authorized only; the operator actions need the dedicated capability, step-up and an audit row', () => {
    expect(FIRST_OWNER_ENROLMENT_IS_SELF_SERVICE).toBe(false);
    expect(PROTECTED_ACTIONS['staff.owner_mfa_window.authorize']).toMatchObject({ actor: 'staff', capability: 'owner.mfa.authorize', stepUp: true, audit: true });
    expect(PROTECTED_ACTIONS['staff.owner_mfa.overview']).toMatchObject({ actor: 'staff', capability: 'owner.mfa.authorize', audit: true });
    // only admin holds it
    expect(STAFF_ROLES.filter((r) => ROLE_CAPABILITIES[r].includes('owner.mfa.authorize'))).toEqual(['admin']);
  });
  it('recovery codes are owner-only and ten per set (TypeScript generator and SQL agree)', async () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'review', '0005_rate_limits_and_owner_mfa.sql'), 'utf8');
    expect(RECOVERY_CODE_COUNT).toBe(10);
    expect(sql).toMatch(/cardinality\(p_hashes\) <> 10/);
    expect(sql).toMatch(/\(select count\(distinct h\) from unnest\(p_hashes\) h\) <> 10/);
    for (const fnName of ['rpc_owner_set_recovery_codes', 'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel']) {
      const body = new RegExp(`create function public\\.${fnName}\\([\\s\\S]*?\\n\\$\\$;`).exec(sql)?.[0] ?? '';
      expect(body.length, fnName).toBeGreaterThan(300);
      expect(body, fnName).toMatch(/m\.role = 'owner'/);          // owners only
      expect(body, fnName).toMatch(/public\.staff_members/);      // staff are refused explicitly
    }
  });
});

describe('owner MFA, operator and recovery RPCs mirror the SQL (migration 0005 draft rev3)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'review', '0005_rate_limits_and_owner_mfa.sql'), 'utf8');
  const fn = (name: string) => new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(sql)?.[0] ?? '';
  const priv = (name: string) => new RegExp(`create function private\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(sql)?.[0] ?? '';
  // codes appear as `'code', '<literal>'`, as `then '<literal>'` / `else '<literal>'`, or as the gate status returned by private.staff_gate
  const codes = (body: string) => [
    ...[...body.matchAll(/'code',\s*'([a-z_]+)'/g)].map((m) => m[1] as string),
    ...[...body.matchAll(/(?:then|else)\s+'([a-z_]+)'/g)].map((m) => m[1] as string),
  ];
  const GATE = ['forbidden', 'step_up_required']; // returned by private.staff_gate (0003), not spelled out as literals in the 0005 operator functions
  const groups: Array<[string, string[], readonly string[]]> = [
    ['owner window and claim', ['rpc_owner_open_factor_window', 'rpc_owner_claim_factor'], OWNER_FACTOR_RPC_CODES],
    ['operator', ['rpc_staff_authorize_owner_mfa_window'], OPERATOR_OWNER_MFA_CODES],
    ['recovery', ['rpc_owner_set_recovery_codes', 'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel'], OWNER_RECOVERY_RPC_CODES],
  ];
  for (const [label, names, tsCodes] of groups) {
    it(`${label}: every code the SQL can return is known to TypeScript, and every TypeScript code exists in the SQL`, () => {
      const body = names.map(fn).join('\n');
      expect(body.length, label).toBeGreaterThan(500);
      const sqlCodes = new Set(codes(body));
      expect(sqlCodes.size, label).toBeGreaterThanOrEqual(3);
      for (const c of sqlCodes) expect(tsCodes as readonly string[], `SQL code ${c} unknown to TS (${label})`).toContain(c);
      for (const c of tsCodes) if (!GATE.includes(c)) expect(body.includes(`'${c}'`), `TS code ${c} missing in SQL (${label})`).toBe(true);
    });
  }
  it('the SQL defines the factor states and recovery statuses the TypeScript parser accepts', () => {
    const body = priv('owner_factor_state');
    for (const s of OWNER_FACTOR_STATES) expect(body.includes(`'${s}'`), s).toBe(true);
    const ctx = fn('rpc_my_owner_context');
    // the canonical rev3.1 SQL defines the statuses it has always had; the two rev5 statuses are checked against the rev5 draft in owner-rev5.test.ts
    for (const s of OWNER_RECOVERY_STATUSES.filter((x) => !(OWNER_RECOVERY_STATUSES_SINCE_REV5 as readonly string[]).includes(x))) expect(ctx.includes(`'${s}'`), s).toBe(true);
    expect([...OWNER_RECOVERY_STATUSES_SINCE_REV5].sort()).toEqual(['awaiting_approval', 'stranded']);
  });
  it('parses RPC results strictly and fails closed (all three groups)', () => {
    expect(parseOwnerFactorRpcResult({ ok: true, code: 'window_open', kind: 'additional', expires_at: 'x' })).toEqual({ ok: true, code: 'window_open' });
    expect(parseOwnerFactorRpcResult({ ok: false, code: 'operator_authorization_required' })).toEqual({ ok: false, code: 'operator_authorization_required' });
    expect(parseOperatorOwnerMfaResult({ ok: true, code: 'authorized', kind: 'first', window_id: 'x' })).toEqual({ ok: true, code: 'authorized' });
    expect(parseOperatorOwnerMfaResult({ ok: false, code: 'recovery_cooling_off', cooloff_until: 'x' })).toEqual({ ok: false, code: 'recovery_cooling_off' });
    expect(parseOwnerRecoveryResult({ ok: true, code: 'request_created', cooloff_until: 'x' })).toEqual({ ok: true, code: 'request_created' });
    expect(parseOwnerRecoveryResult({ ok: false, code: 'request_not_accepted' })).toEqual({ ok: false, code: 'request_not_accepted' });
    const bads = [null, undefined, 'x', 1, [], {}, { ok: true }, { ok: 'true', code: 'window_open' }, { ok: true, code: 7 }, { ok: false, code: 'made_up' }, { ok: true, code: 'no_open_window' }, { ok: false, code: 'window_open' },
      { ok: true, code: 'request_created' }, { ok: false, code: 'authorized' }, { ok: true, code: 'request_not_accepted' }];
    for (const bad of bads) {
      expect(parseOwnerFactorRpcResult(bad), JSON.stringify(bad)).toEqual({ ok: false, code: 'invalid_response' });
    }
    for (const bad of [{ ok: true, code: 'window_open' }, { ok: false, code: 'authorized' }, { ok: true, code: 'forbidden' }]) expect(parseOperatorOwnerMfaResult(bad)).toEqual({ ok: false, code: 'invalid_response' });
    for (const bad of [{ ok: true, code: 'throttled' }, { ok: false, code: 'request_created' }, { ok: true, code: 'authorized' }]) expect(parseOwnerRecoveryResult(bad)).toEqual({ ok: false, code: 'invalid_response' });
  });
});

describe('0005 rev3 structural guarantees, read from the SQL text (static; the file was never executed)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'review', '0005_rate_limits_and_owner_mfa.sql'), 'utf8');
  const noComments = sql.replace(/--[^\n]*/g, '');
  const fnBody = (schema: string, name: string) => new RegExp(`create function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(noComments)?.[0] ?? '';
  it('no self-service first enrolment: the windows table forbids a first or recovery window without a different authorizing user', () => {
    expect(noComments).toMatch(/constraint owner_mfa_windows_authorizer check \(\s*\(kind = 'additional' and authorized_by = user_id\)\s*or \(kind in \('first', 'recovery'\) and authorized_by is not null and authorized_by <> user_id\)\)/);
    const open = fnBody('public', 'rpc_owner_open_factor_window');
    expect(open).toMatch(/'additional'/);
    expect(open).not.toMatch(/'first'/);
    expect(open).not.toMatch(/'recovery'/);
    expect(open).toMatch(/when 'none' then 'operator_authorization_required'/);
  });
  it('the window insert trigger re-verifies, at insertion, the operator capability, the factor state and the recovery cool-off', () => {
    const t = fnBody('private', 'guard_owner_mfa_window_insert');
    expect(t).toMatch(/rc\.capability_code = 'owner\.mfa\.authorize'/);
    expect(t).toMatch(/s\.status = 'active'/);
    expect(t).toMatch(/r\.cooloff_until <= clock_timestamp\(\)/);
    expect(t).toMatch(/new\.kind = 'first' and v_state <> 'none'/);
    expect(t).toMatch(/new\.kind = 'additional' and v_state <> 'approved'/);
    expect(t).toMatch(/v_state <> 'recovery_required'/);
  });
  it('the operator RPC is independently authenticated (staff gate with step-up), uses the dedicated capability, is audited, bounded and single use', () => {
    const f = fnBody('public', 'rpc_staff_authorize_owner_mfa_window');
    expect(f).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', 'staff\.owner_mfa_window\.authorize', true,/);
    expect(f).toMatch(/p_minutes not between 5 and 60/);
    expect(f).toMatch(/private\.write_audit\(v_actor, 'staff', 'staff\.owner_mfa_window\.authorize', 'success'/);
    expect(f).toMatch(/self_change_not_allowed/);
    expect(noComments).toMatch(/update private\.owner_mfa_windows set consumed_at = clock_timestamp\(\) where id = new\.window_id/); // consumed by the approval trigger
    expect(noComments).toMatch(/create unique index owner_mfa_windows_one_open_idx/);
  });
  it('the recovery cool-off is 24 hours and enforced by a constraint, not only by code', () => {
    expect(noComments).toMatch(/constraint owner_recovery_requests_cooloff check \(cooloff_until >= created_at \+ interval '24 hours'\)/);
    expect(fnBody('public', 'rpc_owner_recovery_request')).toMatch(/v_cool := clock_timestamp\(\) \+ interval '24 hours'/);
    expect(fnBody('public', 'rpc_owner_recovery_request')).toMatch(/interval '24 hours'/);
  });
  it('a recovery code only creates a request: the request RPC touches no factor, window, session or privilege object', () => {
    const f = fnBody('public', 'rpc_owner_recovery_request');
    expect(f).not.toMatch(/owner_mfa_factors|owner_mfa_windows|mfa_factors|aal|step_up_ok|owner_mfa_ok/);
    expect(f).toMatch(/insert into private\.owner_recovery_requests/);
  });
  it('the functions that decide owner MFA, step-up and staff sessions never reference recovery objects (also asserted by the migration self-check)', () => {
    expect(fnBody('private', 'owner_mfa_ok')).not.toMatch(/recover/i);
    expect(fnBody('private', 'my_mfa_owner_org_ids')).not.toMatch(/recover/i);
    expect(noComments).toMatch(/pg_get_functiondef\(f::regprocedure\) ~\* 'recover'/);
  });
  it('nothing in the file writes to, deletes from or truncates the auth schema (operator-assisted recovery: no Auth factor removal)', () => {
    expect(noComments).not.toMatch(/\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+auth\./i);
    expect(noComments).not.toMatch(/\balter\s+table\s+auth\./i);
  });
  it('per-email throttling is a non-blocking cool-down: one request per 10 minutes, and the seed says so', () => {
    expect(noComments).toMatch(/\('password_recovery',\s+1,\s+600,\s+600,/);
    const t = fnBody('public', 'rpc_throttle_password_recovery');
    expect(t).not.toMatch(/auth\.|organization_members|profiles/); // never looks an account up: existing and unknown emails are counted identically
    expect(t).toMatch(/'allowed', true, 'retry_after_secs', 0/);
  });
  it('user-scoped throttle keys are derived inside the database from the caller id (a caller cannot choose another user\'s counter)', () => {
    expect(fnBody('private', 'rl_user_key')).toMatch(/auth\.uid\(\)/);
    const f = fnBody('public', 'rpc_owner_recovery_request');
    expect(f).toMatch(/private\.rl_user_key\('recovery_code'\)/);
    expect(f).toMatch(/private\.rl_user_key\('mfa_recovery'\)/);
  });
});

describe('rate limit policies mirror the SQL seed (migration 0005 draft)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'review', '0005_rate_limits_and_owner_mfa.sql'), 'utf8');
  const block = /insert into private\.rate_limit_policies[^;]*values([\s\S]*?\));\s*\n/i.exec(sql)?.[1] ?? '';
  const rows = [...block.matchAll(/\(\s*'([a-z_]+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g)].map((m) => ({ bucket: m[1] as string, maxAttempts: Number(m[2]), windowSecs: Number(m[3]), blockSecs: Number(m[4]) }));
  it('has the same six buckets with the same numbers', () => {
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.bucket).sort()).toEqual([...RATE_LIMIT_BUCKETS].sort());
    for (const r of rows) expect(RATE_LIMIT_POLICIES[r.bucket as keyof typeof RATE_LIMIT_POLICIES], r.bucket).toEqual({ maxAttempts: r.maxAttempts, windowSecs: r.windowSecs, blockSecs: r.blockSecs });
  });
  it('every block outlasts its window (the database enforces this with a constraint)', () => {
    for (const p of Object.values(RATE_LIMIT_POLICIES)) expect(p.blockSecs).toBeGreaterThanOrEqual(p.windowSecs);
  });
  it('recovery code attempts follow the same limits as the recovery state machine (5 failures, 15 minute lock)', () => {
    expect(RATE_LIMIT_POLICIES.recovery_code).toEqual({ maxAttempts: 5, windowSecs: 900, blockSecs: 900 });
  });
  it('recognizes only known buckets', () => {
    for (const b of RATE_LIMIT_BUCKETS) expect(isRateLimitBucket(b)).toBe(true);
    for (const bad of ['', 'nope', '__proto__', 'constructor', 'RECOVERY_CODE', null, 1]) expect(isRateLimitBucket(bad)).toBe(false);
  });
});

describe('throttle result parsing fails closed', () => {
  it('accepts exactly the two documented shapes', () => {
    expect(parseThrottleResult({ allowed: true, retry_after_secs: 0 })).toEqual({ allowed: true, retryAfterSecs: 0 });
    expect(parseThrottleResult({ allowed: false, retry_after_secs: 900 })).toEqual({ allowed: false, retryAfterSecs: 900 });
  });
  it('treats every other answer as a denial', () => {
    for (const bad of [null, undefined, 'ok', 1, [], {}, { allowed: 'yes', retry_after_secs: 0 }, { allowed: true }, { allowed: true, retry_after_secs: 5 },
      { allowed: false, retry_after_secs: 0 }, { allowed: false, retry_after_secs: -1 }, { allowed: false, retry_after_secs: 1.5 }, { allowed: false, retry_after_secs: 99999 },
      { allowed: true, retry_after_secs: 0, extra: 1 }]) {
      expect(parseThrottleResult(bad), JSON.stringify(bad)).toEqual({ allowed: false, retryAfterSecs: 60 });
    }
  });
});

describe('rate limit keys (HMAC, no identifier leaves the application)', () => {
  const PEPPER = 'p'.repeat(40);
  it('is deterministic, 32 bytes, and hides the identifier', () => {
    const k = deriveRateLimitKey(PEPPER, 'password_recovery', 'User@Example.com');
    expect(k).toHaveLength(32);
    expect(deriveRateLimitKey(PEPPER, 'password_recovery', ' user@example.com ').equals(k)).toBe(true);
    expect(k.toString('hex')).not.toContain(Buffer.from('user@example.com').toString('hex'));
  });
  it('separates buckets and depends on the secret', () => {
    const a = deriveRateLimitKey(PEPPER, 'password_recovery_ip', '203.0.113.7');
    expect(deriveRateLimitKey(PEPPER, 'invite_accept_ip', '203.0.113.7').equals(a)).toBe(false);
    expect(deriveRateLimitKey('q'.repeat(40), 'password_recovery_ip', '203.0.113.7').equals(a)).toBe(false);
    expect(deriveRateLimitKey(PEPPER, 'password_recovery_ip', '[2001:db8::1]').equals(deriveRateLimitKey(PEPPER, 'password_recovery_ip', '2001:db8::1'))).toBe(true);
  });
  it('rejects empty, oversized, whitespace and malformed identifiers', () => {
    for (const bad of ['', '   ', 'a b@c.co', 'a@b\n.co', 'a@b\u0000.co', 'x'.repeat(400) + '@b.co', 'no-at']) expect(() => normalizeRateLimitIdentifier('password_recovery', bad), JSON.stringify(bad)).toThrow();
    expect(normalizeRateLimitIdentifier('password_recovery', 'a@b.co\n')).toBe('a@b.co'); // surrounding whitespace is trimmed, never kept
    expect(() => normalizeRateLimitIdentifier('password_recovery_ip', '1.2.3.4 ')).not.toThrow();
  });
  it('fails closed without a strong secret', () => {
    expect(() => loadRateLimitPepper({} as NodeJS.ProcessEnv)).toThrow();
    expect(() => loadRateLimitPepper({ RATE_LIMIT_PEPPER: 'short' } as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(loadRateLimitPepper({ RATE_LIMIT_PEPPER: PEPPER } as unknown as NodeJS.ProcessEnv)).toBe(PEPPER);
    expect(() => deriveRateLimitKey('short', 'recovery_code', 'abc')).toThrow();
  });
  it('encodes bytea parameters for PostgREST as \\x plus hex', () => {
    const k = deriveRateLimitKey(PEPPER, 'recovery_code', '33333333-3333-4333-8333-333333333333');
    expect(toPostgrestBytea(k)).toMatch(/^\\x[0-9a-f]{64}$/);
  });
});

describe('staff RPC results', () => {
  it('parses success and failure shapes and strips ok/code from the data', () => {
    expect(parseStaffRpcResult({ ok: true, code: 'authorized', window_id: 'w', expires_at: 't' })).toEqual({ ok: true, code: 'authorized', data: { window_id: 'w', expires_at: 't' } });
    for (const code of STAFF_RPC_SUCCESS_CODES) expect(parseStaffRpcResult({ ok: true, code }).ok).toBe(true);
    for (const code of STAFF_RPC_FAILURE_CODES) expect(parseStaffRpcResult({ ok: false, code })).toEqual({ ok: false, code });
  });
  it('treats unknown codes, wrong types and success/failure mismatches as invalid responses', () => {
    for (const bad of [null, undefined, 'ok', 1, [], {}, { ok: true }, { ok: 'true', code: 'granted' }, { ok: true, code: 'forbidden' }, { ok: false, code: 'granted' }, { ok: false, code: 'DROP TABLE' }, { ok: true, code: 1 }]) {
      expect(parseStaffRpcResult(bad), JSON.stringify(bad)).toEqual({ ok: false, code: 'invalid_response' });
    }
  });
  it('has a safe message and an HTTP status for every failure code', () => {
    for (const code of [...STAFF_RPC_FAILURE_CODES, 'invalid_response' as const]) {
      expect(STAFF_RPC_MESSAGES[code].length, code).toBeGreaterThan(10);
      expect(STAFF_RPC_MESSAGES[code], code).not.toMatch(/sql|exception|constraint|pg_|42501|trigger/i);
      const status = staffRpcHttpStatus({ ok: false, code });
      expect(status).toBeGreaterThanOrEqual(401);
    }
    expect(staffRpcHttpStatus({ ok: false, code: 'forbidden' })).toBe(403);
    expect(staffRpcHttpStatus({ ok: false, code: 'step_up_required' })).toBe(401);
    expect(staffRpcHttpStatus({ ok: false, code: 'last_admin_protected' })).toBe(409);
    expect(staffRpcHttpStatus({ ok: true, code: 'granted', data: {} })).toBe(200);
  });
  it('the failure codes the SQL can return are all handled (parity with migration 0004)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', 'review', '0004_staff_management_rpcs.sql'), 'utf8');
    const codes = new Set([...sql.matchAll(/'code',\s*'([a-z_]+)'/g)].map((m) => m[1] as string));
    const known = new Set<string>([...STAFF_RPC_SUCCESS_CODES, ...STAFF_RPC_FAILURE_CODES]);
    for (const c of codes) expect(known.has(c), `SQL returns code '${c}' that the application does not handle`).toBe(true);
    for (const c of STAFF_RPC_FAILURE_CODES) expect(codes.has(c) || c === 'forbidden' || c === 'step_up_required', `TypeScript handles '${c}' that the SQL never returns`).toBe(true);
  });
  it('precheck stops only where the database writes no audit row', () => {
    const base: StaffAccessContext = { authenticated: true, staffStatus: 'active', roles: ['support'], dbSessionOk: true, totpVerifiedAt: null, now: new Date('2026-11-10T12:00:00Z') };
    expect(precheckStaffAction({ ...base, authenticated: false }, 'staff.role.grant')).toEqual({ proceed: false, reason: 'unauthenticated' });
    expect(precheckStaffAction({ ...base, staffStatus: 'none' }, 'staff.role.grant')).toEqual({ proceed: false, reason: 'not-staff' });
    expect(precheckStaffAction({ ...base, dbSessionOk: false }, 'staff.role.grant')).toEqual({ proceed: false, reason: 'staff-session-not-verified' });
    expect(precheckStaffAction(base, 'nope')).toEqual({ proceed: false, reason: 'unknown-action' });
    // a verified staff member without the capability or without step-up still reaches the database, which audits the denial
    expect(precheckStaffAction(base, 'staff.role.grant')).toEqual({ proceed: true });
    expect(precheckStaffAction({ ...base, roles: ['admin'] }, 'staff.role.grant')).toEqual({ proceed: true });
  });
});
