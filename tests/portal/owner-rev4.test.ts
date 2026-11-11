import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H,
  OPERATOR_INITIATIONS_PER_OWNER_PER_7D,
  OPERATOR_RECOVERY_CODES_REV4,
  OWNER_RECOVERY_CODES_REV4,
  OWNER_RECOVERY_STATUSES_REV4,
  OWNER_WINDOW_CODES_REV4,
  RATE_LIMIT_POLICIES_REV4,
  RECOVERY_APPROVAL_DEADLINE_HOURS,
  RECOVERY_COOLOFF_HOURS,
  RECOVERY_MAX_WINDOWS_PER_REQUEST,
  RECOVERY_REF_PATTERN,
  RECOVERY_REQUEST_STATUSES,
  RECOVERY_VALIDITY_DAYS_AFTER_COOLOFF,
  RECOVERY_VERIFICATION_METHODS,
  checkRecoveryEvidence,
  parseOperatorRecoveryResultRev4,
  parseOwnerRecoveryResultRev4,
  parseOwnerWindowResultRev4,
} from '@/lib/portal/permissions/owner-rev4';

// rev4 is a REVIEW DRAFT next to the canonical rev3.1; these tests read the draft text only (no database, nothing executed).
const sql = readFileSync(join(process.cwd(), 'supabase', 'review', '0005_rate_limits_and_owner_mfa.rev4.sql'), 'utf8');
const noComments = sql.replace(/--[^\n]*/g, '');
const fnBody = (schema: string, name: string) => new RegExp(`create function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(noComments)?.[0] ?? '';
const codes = (body: string) => [
  ...[...body.matchAll(/'code',\s*'([a-z_]+)'/g)].map((m) => m[1] as string),
  ...[...body.matchAll(/(?:then|else)\s+'([a-z_]+)'/g)].map((m) => m[1] as string),
  ...[...body.matchAll(/v_code\s*:=\s*'([a-z_]+)'/g)].map((m) => m[1] as string),
];
const GATE = ['forbidden', 'step_up_required'];

describe('rev4 mirror equals the rev4 SQL draft: numbers, lists and result codes', () => {
  it('rate-limit seed has the same eight buckets with the same numbers (D-V9)', () => {
    const block = /insert into private\.rate_limit_policies[^;]*values([\s\S]*?\));\s*\n/i.exec(sql)?.[1] ?? '';
    const rows = [...block.matchAll(/\(\s*'([a-z_]+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g)].map((m) => ({ bucket: m[1] as string, maxAttempts: Number(m[2]), windowSecs: Number(m[3]), blockSecs: Number(m[4]) }));
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.bucket).sort()).toEqual(Object.keys(RATE_LIMIT_POLICIES_REV4).sort());
    for (const r of rows) expect(RATE_LIMIT_POLICIES_REV4[r.bucket as keyof typeof RATE_LIMIT_POLICIES_REV4], r.bucket).toEqual({ maxAttempts: r.maxAttempts, windowSecs: r.windowSecs, blockSecs: r.blockSecs });
    expect([OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H, OPERATOR_INITIATIONS_PER_OWNER_PER_7D]).toEqual([5, 2]);
    // the table bounds were widened so a 7-day window is representable
    expect(noComments).toMatch(/window_secs between 10 and 604800/);
    expect(noComments).toMatch(/block_secs\s+integer not null check \(block_secs between 10 and 604800\)/);
  });
  it('the verification method list and the reference pattern are the same in the table, in both operator RPCs and in TypeScript', () => {
    const list = `('${RECOVERY_VERIFICATION_METHODS.join("', '")}')`;
    expect(noComments.split(list).length - 1).toBeGreaterThanOrEqual(4); // verification_method, second_verification_method checks, initiate, approve
    expect(noComments).toContain(`'^[A-Za-z0-9._:/#-]{1,80}$'`);
    expect(RECOVERY_REF_PATTERN.source).toBe('^[A-Za-z0-9._:/#-]{1,80}$');
  });
  it('lifecycle numbers: 24 h cool-off anchored at approval, 72 h approval deadline, 7 days validity after the cool-off, at most 3 windows per request', () => {
    expect([RECOVERY_COOLOFF_HOURS, RECOVERY_APPROVAL_DEADLINE_HOURS, RECOVERY_VALIDITY_DAYS_AFTER_COOLOFF, RECOVERY_MAX_WINDOWS_PER_REQUEST]).toEqual([24, 72, 7, 3]);
    expect(noComments).toMatch(/cooloff_until is null or cooloff_until >= coalesce\(approved_at, created_at\) \+ interval '24 hours'/);
    expect(noComments).toMatch(/expires_at <= created_at \+ interval '72 hours'/);
    expect(noComments).toMatch(/expires_at <= coalesce\(cooloff_until, created_at\) \+ interval '7 days'/);
    expect(noComments).toMatch(/windows_issued between 0 and 3/);
    expect(fnBody('public', 'rpc_staff_approve_owner_recovery')).toMatch(/cooloff_until = v_now \+ interval '24 hours', expires_at = v_now \+ interval '24 hours' \+ interval '7 days'/);
    expect(fnBody('public', 'rpc_staff_initiate_owner_recovery')).toMatch(/v_now \+ interval '72 hours'/);
  });
  it('statuses and request states match', () => {
    const ctx = fnBody('public', 'rpc_my_owner_context');
    for (const s of OWNER_RECOVERY_STATUSES_REV4) if (s !== 'none') expect(ctx.includes(`'${s}'`), s).toBe(true);
    expect(noComments).toContain(`status in ('${RECOVERY_REQUEST_STATUSES.join("', '")}')`);
  });
  const groups: Array<[string, string[], readonly string[]]> = [
    ['owner window, claim and own-window revocation', ['rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_revoke_factor_window'], OWNER_WINDOW_CODES_REV4],
    ['operator', ['rpc_staff_authorize_owner_mfa_window', 'rpc_staff_revoke_owner_mfa_window', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery', 'rpc_staff_cancel_owner_recovery'], OPERATOR_RECOVERY_CODES_REV4],
    ['owner recovery', ['rpc_owner_set_recovery_codes', 'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel'], OWNER_RECOVERY_CODES_REV4],
  ];
  for (const [label, names, ts] of groups) {
    it(`${label}: every code the SQL can return is known to TypeScript and every TypeScript code exists in the SQL`, () => {
      const body = names.map((n) => fnBody('public', n)).join('\n');
      expect(body.length, label).toBeGreaterThan(800);
      const sqlCodes = new Set(codes(body));
      expect(sqlCodes.size, label).toBeGreaterThanOrEqual(8);
      for (const c of sqlCodes) expect(ts as readonly string[], `SQL code ${c} unknown to TS (${label})`).toContain(c);
      for (const c of ts) if (!GATE.includes(c)) expect(body.includes(`'${c}'`), `TS code ${c} missing in SQL (${label})`).toBe(true);
    });
  }
  it('parsers fail closed and keep ok consistent with the success codes', () => {
    expect(parseOperatorRecoveryResultRev4({ ok: true, code: 'awaiting_approval', request_id: 'x' })).toEqual({ ok: true, code: 'awaiting_approval' });
    expect(parseOperatorRecoveryResultRev4({ ok: false, code: 'window_already_open' })).toEqual({ ok: false, code: 'window_already_open' });
    expect(parseOwnerWindowResultRev4({ ok: true, code: 'revoked' })).toEqual({ ok: true, code: 'revoked' });
    expect(parseOwnerRecoveryResultRev4({ ok: false, code: 'request_not_accepted' })).toEqual({ ok: false, code: 'request_not_accepted' });
    for (const bad of [null, undefined, 'x', 1, [], {}, { ok: true }, { ok: true, code: 'self_approval_not_allowed' }, { ok: false, code: 'approved' }, { ok: true, code: 'made_up' }]) {
      expect(parseOperatorRecoveryResultRev4(bad), JSON.stringify(bad)).toEqual({ ok: false, code: 'invalid_response' });
    }
    expect(parseOwnerRecoveryResultRev4({ ok: true, code: 'throttled' })).toEqual({ ok: false, code: 'invalid_response' });
    expect(parseOwnerWindowResultRev4({ ok: false, code: 'factor_approved' })).toEqual({ ok: false, code: 'invalid_response' });
  });
  it('the early evidence check applies the same rules as the database', () => {
    const base = { initiatorId: 'a', approverId: 'b', initiatorMethod: 'in_person', initiatorRef: 'CASE-1', approverMethod: 'video_id_check', approverRef: 'CASE-2' };
    expect(checkRecoveryEvidence(base)).toEqual({ ok: true });
    expect(checkRecoveryEvidence({ ...base, approverId: 'a' })).toEqual({ ok: false, reason: 'self_approval_not_allowed' });
    expect(checkRecoveryEvidence({ ...base, approverMethod: 'phone_call' })).toEqual({ ok: false, reason: 'invalid_method' });
    for (const ref of ['', 'has space', 'x'.repeat(81), 'a;b', 'é']) expect(checkRecoveryEvidence({ ...base, approverRef: ref })).toEqual({ ok: false, reason: 'invalid_ref' });
    expect(checkRecoveryEvidence({ ...base, approverRef: 'CASE-1' })).toEqual({ ok: false, reason: 'verification_ref_reused' });
    expect(checkRecoveryEvidence({ ...base, initiatorMethod: 'notarized_statement', approverMethod: 'notarized_statement' })).toEqual({ ok: false, reason: 'notarization_not_sufficient' });
    expect(checkRecoveryEvidence({ ...base, initiatorMethod: 'notarized_statement' })).toEqual({ ok: true }); // supplementary next to another method
  });
});

describe('rev4 structural guarantees read from the SQL text (static; the draft was never executed)', () => {
  const RPCS = ['rpc_staff_authorize_owner_mfa_window', 'rpc_staff_revoke_owner_mfa_window', 'rpc_owner_open_factor_window', 'rpc_owner_revoke_factor_window', 'rpc_owner_claim_factor',
    'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery', 'rpc_staff_cancel_owner_recovery', 'rpc_owner_set_recovery_codes'];
  it('two-person rule is enforced by the database: constraint, insert trigger, approval function and window trigger', () => {
    expect(noComments).toMatch(/constraint owner_recovery_requests_two_person check \(approved_by is null or initiated_by is null or approved_by <> initiated_by\)/);
    expect(noComments).toMatch(/constraint owner_recovery_requests_independent_evidence check \(second_verification_ref is null or second_verification_ref <> verification_ref\)/);
    expect(noComments).toMatch(/constraint owner_recovery_requests_notarized_not_alone check \(not \(verification_method = 'notarized_statement' and second_verification_method = 'notarized_statement'\)\)/);
    expect(fnBody('public', 'rpc_staff_approve_owner_recovery')).toMatch(/v_req\.initiated_by = v_actor/);
    expect(fnBody('private', 'guard_owner_mfa_window_insert')).toMatch(/v_req\.approved_by = v_req\.initiated_by/);
    expect(fnBody('private', 'guard_owner_recovery_request_insert')).toMatch(/rc\.capability_code = 'owner\.mfa\.authorize'/);
  });
  it('no silent replacement: an active window is refused, a lapsed window is closed by a recorded and audited revocation, and nothing is deleted', () => {
    for (const n of ['rpc_staff_authorize_owner_mfa_window', 'rpc_owner_open_factor_window']) {
      const b = fnBody('public', n);
      expect(b, n).toMatch(/'window_already_open'/);
      expect(b, n).toMatch(/revoke_reason = 'lapsed'/);
      expect(b, n).toMatch(/\.lapse', 'success'/);
      expect(b, n).not.toMatch(/delete\s+from/i);
    }
    expect(noComments).toMatch(/constraint owner_mfa_windows_revocation_group check \(num_nonnulls\(revoked_at, revoked_by, revoke_reason\) in \(0, 3\)\)/);
    expect(fnBody('public', 'rpc_staff_revoke_owner_mfa_window')).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', 'staff\.owner_mfa_window\.revoke', true/);
  });
  it('history is preserved: no delete from any owner MFA or recovery table anywhere, and the self-check asserts it on the live definitions', () => {
    expect(noComments).not.toMatch(/delete\s+from\s+private\.owner_/i);
    expect(noComments).toMatch(/self-check: a function deletes owner MFA or recovery history/);
    for (const t of ['owner_mfa_windows', 'owner_mfa_factors', 'owner_recovery_codes', 'owner_recovery_requests']) expect(noComments).toMatch(new RegExp(`create trigger ${t}_no_truncate`));
  });
  it('rate-limit state cannot be bypassed through rollback: operator quotas are counted from durable rows under locks, read from the policy table', () => {
    const b = fnBody('public', 'rpc_staff_initiate_owner_recovery');
    expect(b).toMatch(/bucket = 'operator_recovery_initiate'/);
    expect(b).toMatch(/bucket = 'operator_recovery_target'/);
    expect(b).toMatch(/from private\.owner_recovery_requests r\s+where r\.origin = 'operator' and r\.initiated_by = v_actor/);
    expect(b).toMatch(/from private\.owner_recovery_requests r\s+where r\.origin = 'operator' and r\.user_id = p_owner_user_id/);
    expect(b).not.toMatch(/rate_limit_hit/); // no in-memory style counter that a rollback could erase
  });
  it('lock hierarchy: whenever several advisory locks are taken they appear in the order operator, owner recovery, owner window', () => {
    const order = ['p2:operator_recovery:', 'p2:owner_recovery:', 'p2:owner_window:'];
    for (const n of RPCS) {
      const b = fnBody('public', n); const pos = order.map((k) => b.indexOf(k)).filter((p) => p >= 0);
      expect(pos, n).toEqual([...pos].sort((a, c) => a - c));
    }
  });
  it('argument validation raises BEFORE any lock or counter; after the first lock or counter no statement raises (refusals are returned and audited)', () => {
    for (const n of RPCS) {
      const b = fnBody('public', n); const first = Math.min(...['pg_advisory_xact_lock', 'rate_limit_hit'].map((k) => (b.indexOf(k) >= 0 ? b.indexOf(k) : Infinity)));
      if (!Number.isFinite(first)) continue;
      expect(b.slice(first), n).not.toMatch(/raise exception/);
    }
  });
  it('free text and sensitive material never enter an audit detail: no reason text, no hash, no token appears in any write_audit call', () => {
    const calls = [...noComments.matchAll(/private\.write_audit\([\s\S]*?\);/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(50);
    for (const c of calls) {
      expect(c).not.toMatch(/\bv_reason\b|\bp_reason\b|initiation_reason|approval_reason|cancel_reason|reason_text|code_hash|p_hashes|p_code_hash|token|secret/i);
    }
    expect(noComments).toMatch(/cancel_reason\s+text check/); // free text lives in the row
  });
  it('recovery requests and codes cannot influence privileges: the decision functions never mention recovery; the request RPC touches no factor, window or aal object', () => {
    for (const n of ['owner_mfa_ok', 'my_mfa_owner_org_ids']) expect(fnBody('private', n), n).not.toMatch(/recover/i);
    const r = fnBody('public', 'rpc_owner_recovery_request');
    expect(r).not.toMatch(/owner_mfa_factors|owner_mfa_windows|mfa_factors|aal|step_up_ok|owner_mfa_ok/);
    expect(noComments).toMatch(/pg_get_functiondef\(f::regprocedure\) ~\* 'recover'/);
    expect(noComments).not.toMatch(/\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+auth\./i);
  });
  it('the rev3.1 defect is fixed: request timestamps come from one captured instant', () => {
    const r = fnBody('public', 'rpc_owner_recovery_request');
    expect(r).toMatch(/v_now := clock_timestamp\(\);/);
    expect(r).toMatch(/insert into private\.owner_recovery_requests \(user_id, origin, status, created_at, cooloff_until, expires_at\)\s+values \(v_actor, 'owner_code', 'pending', v_now, v_now \+ interval '24 hours'/);
  });
  it('the approval trigger refuses a window whose request is no longer pending and unexpired (expired requests are unusable)', () => {
    expect(fnBody('private', 'guard_owner_mfa_factor_insert')).toMatch(/rq\.status = 'pending' and rq\.expires_at > clock_timestamp\(\)/);
    expect(fnBody('public', 'rpc_staff_authorize_owner_mfa_window')).toMatch(/close_expired_recovery_requests/);
  });
});
