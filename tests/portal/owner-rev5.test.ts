import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTO_REVOKE_CODES,
  FACTOR_LOSS_CATEGORIES,
  OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H_REV5,
  OPERATOR_INITIATIONS_PER_OWNER_PER_7D_REV5,
  OPERATOR_RECOVERY_CODES_REV5,
  OWNER_CANCEL_LOCK_HOURS,
  OWNER_RECOVERY_CODES_REV5,
  OWNER_RECOVERY_STATUSES_REV5,
  OWNER_WINDOW_CODES_REV5,
  PRODUCTION_PARSER_ACCEPTS_ALL_REV5_STATUSES,
  RATE_LIMIT_POLICIES_REV5,
  RECOVERY_APPROVAL_DEADLINE_HOURS_REV5,
  RECOVERY_COOLOFF_HOURS_REV5,
  RECOVERY_REF_PATTERN_REV5,
  RECOVERY_REQUEST_STATUSES_REV5,
  RECOVERY_VALIDITY_DAYS_AFTER_COOLOFF_REV5,
  RECOVERY_VERIFICATION_METHODS_REV5,
  RECOVERY_WINDOWS_AFTER_ATTESTATION,
  RECOVERY_WINDOWS_BEFORE_ATTESTATION,
  REQUIRED_TRANSACTION_ISOLATION,
  checkRecoveryEvidenceRev5,
  maxRecoveryWindows,
  ownerCancelLockApplies,
  parseOperatorRecoveryResultRev5,
  parseOwnerRecoveryResultRev5,
  parseOwnerWindowResultRev5,
} from '@/lib/portal/permissions/owner-rev5';
import { OWNER_RECOVERY_STATUSES, OWNER_RECOVERY_STATUSES_SINCE_REV5, parseOwnerContext } from '@/lib/portal/permissions/owner';
import { APP_THROTTLE_POLICIES, appThrottleHit, createInMemoryAppThrottleStore } from '@/lib/portal/ratelimit/app-throttle';

// rev5 is a REVIEW DRAFT; these tests read its text only (no database, nothing executed). They prove that the text, the TypeScript mirror and the design agree. They do NOT prove
// that PostgreSQL accepts the SQL, that a constraint or trigger behaves as written, or anything about transactions, real Auth or concurrency.
const root = process.cwd();
// P2_REV5_TEST_FILE exists ONLY for supabase/review/tests/rev5-negative-controls.mjs, which points the suite at deliberately broken copies to prove the tests can fail.
const sql = readFileSync(process.env.P2_REV5_TEST_FILE ?? join(root, 'supabase', 'review', '0005_rate_limits_and_owner_mfa.rev5.sql'), 'utf8');
const noComments = sql.replace(/--[^\n]*/g, '');
const fnBody = (schema: string, name: string) => new RegExp(`create function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(noComments)?.[0] ?? '';
// result codes only: 'code', 'x' and conditional code expressions; the two non-code literals of the factor-loss review are filtered
const NON_CODE = ['stranded', 'unexplained'];
const codes = (body: string) =>
  [
    ...[...body.matchAll(/'code',\s*'([a-z_]+)'/g)].map((m) => m[1] as string),
    ...[...body.matchAll(/(?:then|else)\s+'([a-z_]+)'/g)].map((m) => m[1] as string),
    ...[...body.matchAll(/v_code\s*:=\s*'([a-z_]+)'/g)].map((m) => m[1] as string),
  ].filter((c) => !NON_CODE.includes(c));
const GATE = ['forbidden', 'step_up_required'];
const MUTATING_RPCS = ['rpc_staff_authorize_owner_mfa_window', 'rpc_staff_revoke_owner_mfa_window', 'rpc_owner_open_factor_window', 'rpc_owner_revoke_factor_window', 'rpc_owner_claim_factor',
  'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery', 'rpc_staff_cancel_owner_recovery',
  'rpc_owner_set_recovery_codes', 'rpc_staff_attest_owner_factor_removal', 'rpc_staff_list_owner_factor_loss', 'rpc_staff_owner_mfa_overview'];

describe('rev5 mirror equals the rev5 SQL draft: numbers, lists and result codes', () => {
  it('rate-limit seed has the same eight buckets with the same numbers (D-V9)', () => {
    const block = /insert into private\.rate_limit_policies[^;]*values([\s\S]*?\));\s*\n/i.exec(sql)?.[1] ?? '';
    const rows = [...block.matchAll(/\(\s*'([a-z_]+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g)].map((m) => ({ bucket: m[1] as string, maxAttempts: Number(m[2]), windowSecs: Number(m[3]), blockSecs: Number(m[4]) }));
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.bucket).sort()).toEqual(Object.keys(RATE_LIMIT_POLICIES_REV5).sort());
    for (const r of rows) expect(RATE_LIMIT_POLICIES_REV5[r.bucket as keyof typeof RATE_LIMIT_POLICIES_REV5], r.bucket).toEqual({ maxAttempts: r.maxAttempts, windowSecs: r.windowSecs, blockSecs: r.blockSecs });
    expect([OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H_REV5, OPERATOR_INITIATIONS_PER_OWNER_PER_7D_REV5]).toEqual([5, 2]);
  });
  it('the verification method list is THREE real methods everywhere; a notarized statement is never a method (F5); the reference pattern is the same', () => {
    const list = `('${RECOVERY_VERIFICATION_METHODS_REV5.join("', '")}')`;
    expect(noComments.split(list).length - 1).toBeGreaterThanOrEqual(4); // two CHECKs, initiate, approve
    expect(noComments).not.toMatch(/notarized_statement/);
    expect(noComments).not.toMatch(/notarization_not_sufficient/);
    expect(noComments).toMatch(/notarized_supplement\s+boolean not null default false/);
    expect(noComments).toMatch(/second_notarized_supplement boolean,/);
    expect(noComments).toContain(`'^[A-Za-z0-9._:/#-]{1,80}$'`);
    expect(RECOVERY_REF_PATTERN_REV5.source).toBe('^[A-Za-z0-9._:/#-]{1,80}$');
  });
  it('lifecycle numbers: 24 h cool-off anchored at approval, 72 h approval deadline, 7 days validity, 3 windows (6 after an attested removal), 60 minute windows', () => {
    expect([RECOVERY_COOLOFF_HOURS_REV5, RECOVERY_APPROVAL_DEADLINE_HOURS_REV5, RECOVERY_VALIDITY_DAYS_AFTER_COOLOFF_REV5, RECOVERY_WINDOWS_BEFORE_ATTESTATION, RECOVERY_WINDOWS_AFTER_ATTESTATION]).toEqual([24, 72, 7, 3, 6]);
    expect(noComments).toMatch(/cooloff_until is null or cooloff_until >= coalesce\(approved_at, created_at\) \+ interval '24 hours'/);
    expect(noComments).toMatch(/expires_at <= created_at \+ interval '72 hours'/);
    expect(noComments).toMatch(/expires_at <= coalesce\(cooloff_until, created_at\) \+ interval '7 days'/);
    expect(noComments).toMatch(/windows_issued between 0 and 6 and \(windows_issued <= 3 or factors_removed_at is not null\)/);
    expect(noComments).toMatch(/expires_at <= opened_at \+ interval '60 minutes'/);
    expect(noComments).toMatch(/case when v_req\.factors_removed_at is null then 3 else 6 end/);
    expect(fnBody('public', 'rpc_staff_approve_owner_recovery')).toMatch(/cooloff_until = v_now \+ interval '24 hours', expires_at = v_now \+ interval '24 hours' \+ interval '7 days'/);
    expect(fnBody('public', 'rpc_staff_initiate_owner_recovery')).toMatch(/v_now \+ interval '72 hours'/);
    expect([maxRecoveryWindows(false), maxRecoveryWindows(true)]).toEqual([3, 6]);
  });
  it('statuses match the SQL, and the PRODUCTION parser accepts every rev5 status (F7)', () => {
    const ctx = fnBody('public', 'rpc_my_owner_context');
    for (const s of OWNER_RECOVERY_STATUSES_REV5) if (s !== 'none') expect(ctx.includes(`'${s}'`), s).toBe(true);
    expect(noComments).toContain(`status in ('${RECOVERY_REQUEST_STATUSES_REV5.join("', '")}')`);
    expect(PRODUCTION_PARSER_ACCEPTS_ALL_REV5_STATUSES).toBe(true);
    expect([...OWNER_RECOVERY_STATUSES_SINCE_REV5].sort()).toEqual(['awaiting_approval', 'stranded']);
    for (const s of OWNER_RECOVERY_STATUSES_REV5) {
      const parsed = parseOwnerContext({ is_owner: true, owner_mfa_ok: false, step_up_ok: false, factor_state: 'recovery_required', recovery_status: s, recovery_codes_remaining: 0 }, true);
      expect(parsed.recoveryStatus, s).toBe(s); // not rejected into a deny-all context
      expect(parsed.ownerMfaOk, s).toBe(false); // and never granting anything
    }
    expect(parseOwnerContext({ is_owner: true, owner_mfa_ok: true, step_up_ok: true, factor_state: 'approved', recovery_status: 'made_up', recovery_codes_remaining: 0 }, true)).toEqual({ authenticated: true, isOwner: false, ownerMfaOk: false, stepUpOk: false });
    expect(OWNER_RECOVERY_STATUSES.length).toBe(6);
  });
  const groups: Array<[string, string[], readonly string[]]> = [
    ['owner window, claim and own-window revocation', ['rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_revoke_factor_window'], OWNER_WINDOW_CODES_REV5],
    ['operator', ['rpc_staff_authorize_owner_mfa_window', 'rpc_staff_revoke_owner_mfa_window', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery', 'rpc_staff_cancel_owner_recovery', 'rpc_staff_attest_owner_factor_removal', 'rpc_staff_list_owner_factor_loss'], OPERATOR_RECOVERY_CODES_REV5],
    ['owner recovery', ['rpc_owner_set_recovery_codes', 'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel'], OWNER_RECOVERY_CODES_REV5],
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
  it('the removed rev4 code factor_removal_required exists nowhere (R1: no removal precondition for a recovery window)', () => {
    expect(noComments).not.toMatch(/factor_removal_required/);
    expect(OPERATOR_RECOVERY_CODES_REV5 as readonly string[]).not.toContain('factor_removal_required');
  });
  it('parsers fail closed and keep ok consistent with the success codes', () => {
    expect(parseOperatorRecoveryResultRev5({ ok: true, code: 'attested' })).toEqual({ ok: true, code: 'attested' });
    expect(parseOperatorRecoveryResultRev5({ ok: false, code: 'count_mismatch' })).toEqual({ ok: false, code: 'count_mismatch' });
    expect(parseOwnerWindowResultRev5({ ok: false, code: 'removal_attestation_required' })).toEqual({ ok: false, code: 'removal_attestation_required' });
    expect(parseOwnerRecoveryResultRev5({ ok: false, code: 'request_not_accepted' })).toEqual({ ok: false, code: 'request_not_accepted' });
    for (const bad of [null, undefined, 'x', 1, [], {}, { ok: true }, { ok: true, code: 'count_mismatch' }, { ok: false, code: 'attested' }, { ok: true, code: 'made_up' }, { ok: true, code: 'factor_removal_required' }]) {
      expect(parseOperatorRecoveryResultRev5(bad), JSON.stringify(bad)).toEqual({ ok: false, code: 'invalid_response' });
    }
    expect(parseOwnerRecoveryResultRev5({ ok: true, code: 'throttled' })).toEqual({ ok: false, code: 'invalid_response' });
  });
  it('the early evidence check: three methods for each operator, notarization is never a method, references differ, accounts differ', () => {
    const base = { initiatorId: 'a', approverId: 'b', initiatorMethod: 'in_person', initiatorRef: 'CASE-1', approverMethod: 'video_id_check', approverRef: 'CASE-2' };
    expect(checkRecoveryEvidenceRev5(base)).toEqual({ ok: true });
    expect(checkRecoveryEvidenceRev5({ ...base, approverId: 'a' })).toEqual({ ok: false, reason: 'self_approval_not_allowed' });
    expect(checkRecoveryEvidenceRev5({ ...base, approverMethod: 'notarized_statement' })).toEqual({ ok: false, reason: 'invalid_method' });
    expect(checkRecoveryEvidenceRev5({ ...base, initiatorMethod: 'notarized_statement' })).toEqual({ ok: false, reason: 'invalid_method' });
    for (const ref of ['', 'has space', 'x'.repeat(81), 'a;b', 'é']) expect(checkRecoveryEvidenceRev5({ ...base, approverRef: ref })).toEqual({ ok: false, reason: 'invalid_ref' });
    expect(checkRecoveryEvidenceRev5({ ...base, approverRef: 'CASE-1' })).toEqual({ ok: false, reason: 'verification_ref_reused' });
  });
  it('the owner cancellation lock applies only while the approved factor is intact', () => {
    expect(OWNER_CANCEL_LOCK_HOURS).toBe(24);
    expect(ownerCancelLockApplies('approved', 3)).toBe(true);
    for (const st of ['recovery_required', 'none', 'unknown', 'unapproved_factor_present']) expect(ownerCancelLockApplies(st, 3), st).toBe(false);
    expect(ownerCancelLockApplies('approved', 24)).toBe(false);
    expect(ownerCancelLockApplies('approved', null)).toBe(false);
    for (const fn of ['rpc_owner_recovery_request', 'rpc_staff_initiate_owner_recovery']) expect(fnBody('public', fn), fn).toMatch(/owner_factor_state\(\w+\) = 'approved'|v_state = 'approved'/);
    expect(fnBody('public', 'rpc_my_owner_context')).toMatch(/and v_state = 'approved' then\s+v_rec := 'locked'/);
  });
});

describe('F1: transaction honesty and READ COMMITTED enforcement (static; nothing executed)', () => {
  it('the isolation guard is the FIRST action of every mutating RPC, before any gate, lock, counter or write', () => {
    expect(REQUIRED_TRANSACTION_ISOLATION).toBe('read committed');
    expect(noComments).toMatch(/current_setting\('transaction_isolation'\) <> 'read committed'/);
    expect(noComments).toMatch(/using errcode = '25000'/);
    for (const n of MUTATING_RPCS) {
      const b = fnBody('public', n);
      const g = b.indexOf('private.require_read_committed()');
      expect(g, n).toBeGreaterThan(0);
      for (const k of ['staff_gate(', 'pg_advisory_xact_lock', 'rate_limit_hit', 'write_audit(', 'insert into', 'update private', 'raise exception']) {
        const p = b.indexOf(k);
        if (p >= 0) expect(g, `${n}: guard must precede ${k}`).toBeLessThan(p);
      }
    }
    expect(noComments).toMatch(/self-check: a mutating recovery RPC does not call private\.require_read_committed\(\)/);
  });
  it('no claim of rollback durability remains: no dblink, no autonomous transaction, and the old claim appears only as the quoted correction', () => {
    expect(noComments).not.toMatch(/dblink|pg_background|create extension|autonomous/i);
    const claim = sql.match(/not bypassable by[^\n]*rollback/gi) ?? [];
    expect(claim.length).toBeLessThanOrEqual(1);
    for (const c of claim) expect(sql.slice(Math.max(0, sql.indexOf(c) - 120), sql.indexOf(c) + 5)).toMatch(/wrongly said/);
    expect(sql).toMatch(/NOTHING in this file survives a ROLLBACK/);
    expect(sql).toMatch(/UNVERIFIED/);
    expect(sql).toMatch(/COMMITTED/);
  });
  it('quotas are counted over request rows under the operator and owner locks, read from the policy table, with no counter that pretends to survive rollback', () => {
    const b = fnBody('public', 'rpc_staff_initiate_owner_recovery');
    expect(b).toMatch(/bucket = 'operator_recovery_initiate'/);
    expect(b).toMatch(/bucket = 'operator_recovery_target'/);
    expect(b).toMatch(/from private\.owner_recovery_requests r\s+where r\.origin = 'operator' and r\.initiated_by = v_actor/);
    expect(b).toMatch(/from private\.owner_recovery_requests r\s+where r\.origin = 'operator' and r\.user_id = p_owner_user_id/);
    expect(b).not.toMatch(/rate_limit_hit/);
    expect(b.indexOf('p2:operator_recovery:')).toBeLessThan(b.indexOf('p2:owner_recovery:'));
    expect(b.indexOf('p2:owner_recovery:')).toBeLessThan(b.indexOf("bucket = 'operator_recovery_initiate'"));
  });
});

describe('F4: factor removal sequence R1, window revocation, stranded state, cancellation (static)', () => {
  it('a recovery window needs NO factor removal beforehand; it records the factor count; the old factor stays until the operator removes it inside the window', () => {
    const a = fnBody('public', 'rpc_staff_authorize_owner_mfa_window');
    expect(a).not.toMatch(/factor_removal_required/);
    expect(a).toMatch(/factors_at_open/);
    expect(a).toMatch(/from auth\.mfa_factors f where f\.user_id = p_owner_user_id and f\.status::text = 'verified'/);
    const t = fnBody('private', 'guard_owner_mfa_window_insert');
    expect(t).toMatch(/v_state in \('none', 'unknown'\) or not private\.owner_has_history/);
    expect(t).not.toMatch(/v_state <> 'recovery_required'/);
    expect(t).toMatch(/new\.factors_at_open <> \(select count\(\*\) from auth\.mfa_factors/);
    expect(noComments).toMatch(/constraint owner_mfa_windows_factors_at_open check \(\(kind = 'recovery'\) = \(factors_at_open is not null\)\)/);
  });
  it('the attestation RPC is gated, verified against database state and the window snapshot, recorded once, and the factor gate refuses approval without it', () => {
    const b = fnBody('public', 'rpc_staff_attest_owner_factor_removal');
    expect(b).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', 'staff\.owner_factor_removal\.attest', true/);
    expect(b).toMatch(/'factors_still_present'/);
    expect(b).toMatch(/p_removed_count <> v_w\.factors_at_open/);
    expect(b).toMatch(/p_owner_user_id = v_actor/);
    expect(b).not.toMatch(/delete\s+from|update\s+auth\.|insert\s+into\s+auth\./i);
    const trg = fnBody('private', 'guard_owner_mfa_factor_insert');
    expect(trg).toMatch(/rq\.factors_removed_at is not null/);
    expect(trg).toMatch(/owner_mfa_operator_ok\(\(select w\.authorized_by/);
    const g = fnBody('private', 'guard_owner_recovery_request_update');
    expect(g).toMatch(/old\.factors_removed_at is null and new\.factors_removed_at is not null/);
    expect(g).toMatch(/old\.expires_at <= clock_timestamp\(\) or old\.factors_removed_at is null/);
    expect(fnBody('public', 'rpc_owner_claim_factor')).toMatch(/'removal_attestation_required'/);
  });
  it('cancelling or expiring a request revokes its open window automatically, with an audit row and a fixed code, never free text', () => {
    expect([...AUTO_REVOKE_CODES]).toEqual(['request_cancelled', 'request_expired']);
    for (const n of ['rpc_owner_recovery_cancel', 'rpc_staff_cancel_owner_recovery']) expect(fnBody('public', n), n).toMatch(/private\.revoke_request_windows\(/);
    expect(fnBody('private', 'close_expired_recovery_requests')).toMatch(/private\.revoke_request_windows\(r\.id, p_user, p_actor, p_actor_kind, 'request_expired'\)/);
    const h = fnBody('private', 'revoke_request_windows');
    expect(h).toMatch(/p_code not in \('request_cancelled', 'request_expired'\)/);
    expect(h).toMatch(/'owner\.mfa_window\.auto_revoke', 'success'/);
    expect(h).toMatch(/p2:owner_window:/);
  });
  it('stranded is a defined, reported state, and the detective review lists unexplained factor loss', () => {
    expect([...FACTOR_LOSS_CATEGORIES]).toEqual(['stranded', 'unexplained']);
    const ctx = fnBody('public', 'rpc_my_owner_context');
    expect(ctx).toMatch(/v_req\.factors_removed_at is not null and v_state = 'recovery_required'/);
    const l = fnBody('public', 'rpc_staff_list_owner_factor_loss');
    expect(l).toMatch(/'stranded'/);
    expect(l).toMatch(/'unexplained'/);
    expect(l).toMatch(/limit 50/);
    expect(fnBody('private', 'close_expired_recovery_requests')).toMatch(/'stranded', r\.factors_removed_at is not null/);
  });
  it('the cancellation lock never applies after factor removal; the target quota is unchanged (no exemption was added)', () => {
    expect(fnBody('public', 'rpc_owner_recovery_request')).toMatch(/private\.owner_factor_state\(v_actor\) = 'approved'/);
    expect(fnBody('public', 'rpc_staff_initiate_owner_recovery')).toMatch(/v_state = 'approved' and exists/);
    expect(RATE_LIMIT_POLICIES_REV5.operator_recovery_target.maxAttempts).toBe(2);
  });
});

describe('F3: expiry and authorization are enforced at the transition, not only in the RPC (static)', () => {
  const g = fnBody('private', 'guard_owner_recovery_request_update');
  it('the update guard refuses to approve an expired request, a self-approval, and an initiator or approver who is no longer an active operator', () => {
    expect(g).toMatch(/old\.expires_at <= clock_timestamp\(\) then\s+raise exception 'an expired recovery request cannot be approved'/);
    expect(g).toMatch(/new\.approved_by = old\.initiated_by/);
    expect(g).toMatch(/private\.owner_mfa_operator_ok\(new\.approved_by\) and private\.owner_mfa_operator_ok\(old\.initiated_by\)/);
  });
  it('the window gate rechecks initiator, approver and authorizer; the approval RPC rechecks the initiator; the request insert gate checks the initiator', () => {
    const w = fnBody('private', 'guard_owner_mfa_window_insert');
    expect(w).toMatch(/owner_mfa_operator_ok\(v_req\.initiated_by\) and private\.owner_mfa_operator_ok\(v_req\.approved_by\)/);
    expect(w).toMatch(/new\.kind in \('first', 'recovery'\) and not private\.owner_mfa_operator_ok\(new\.authorized_by\)/);
    expect(fnBody('public', 'rpc_staff_approve_owner_recovery')).toMatch(/not private\.owner_mfa_operator_ok\(v_req\.initiated_by\)/);
    expect(fnBody('private', 'guard_owner_recovery_request_insert')).toMatch(/not private\.owner_mfa_operator_ok\(new\.initiated_by\)/);
    const h = fnBody('private', 'owner_mfa_operator_ok');
    expect(h).toMatch(/s\.status = 'active' and rc\.capability_code = 'owner\.mfa\.authorize'/);
    expect(h).toMatch(/exception when others then\s+return false/); // fails closed
    expect(h).toMatch(/if p_user is null then return false/);
  });
  it('separate identities and step-up and capability checks are preserved on every operator RPC', () => {
    for (const n of ['rpc_staff_authorize_owner_mfa_window', 'rpc_staff_revoke_owner_mfa_window', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery', 'rpc_staff_cancel_owner_recovery', 'rpc_staff_attest_owner_factor_removal', 'rpc_staff_list_owner_factor_loss']) {
      expect(fnBody('public', n), n).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', '[a-z_.]+', true,/);
    }
    expect(noComments).toMatch(/constraint owner_recovery_requests_two_person check \(approved_by is null or initiated_by is null or approved_by <> initiated_by\)/);
    expect(noComments).toMatch(/constraint owner_recovery_requests_independent_evidence check \(second_verification_ref is null or second_verification_ref <> verification_ref\)/);
    expect(fnBody('public', 'rpc_staff_approve_owner_recovery')).toMatch(/v_req\.initiated_by = v_actor/);
  });
});

describe('F6: audit retention (static)', () => {
  it('no foreign key of the owner MFA and recovery tables cascades; the self-check asserts RESTRICT on the live catalog', () => {
    expect(noComments).not.toMatch(/on delete cascade/i);
    expect([...noComments.matchAll(/references auth\.users \(id\) on delete restrict/g)]).toHaveLength(4);
    expect(noComments).toMatch(/references private\.owner_mfa_windows \(id, user_id\) on delete restrict/);
    expect(noComments).toMatch(/self-check: owner MFA and recovery history must be protected by ON DELETE RESTRICT/);
    expect(noComments).not.toMatch(/delete\s+from\s+private\.owner_/i);
  });
  it('free text and sensitive material never enter an audit detail', () => {
    const calls = [...noComments.matchAll(/private\.write_audit\([\s\S]*?\);/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(65);
    for (const c of calls) expect(c).not.toMatch(/\bv_reason\b|\bp_reason\b|initiation_reason|approval_reason|cancel_reason|revoke_reason|reason_text|code_hash|p_hashes|p_code_hash|token|secret/i);
    expect(noComments).toMatch(/cancel_reason\s+text check/); // free text lives in the row
  });
  it('every audit action and outcome literal in the file satisfies the CHECK constraints of the audit table of 0003 (action pattern, length, outcome set)', () => {
    // 0003: action ~ '^[a-z]+(\.[a-z_]+)+$' and char_length(action) <= 80; outcome in ('success', 'denied', 'failed'); actor_kind in ('staff', 'organization_user', 'system')
    const actions = [
      ...[...noComments.matchAll(/private\.write_audit\([^,]+,\s*(?:'([a-z_]+)'|p_actor_kind),\s*'([^']+)',\s*'([a-z]+)'/g)].map((m) => ({ kind: m[1], action: m[2] as string, outcome: m[3] as string })),
      ...[...noComments.matchAll(/private\.staff_gate\('owner\.mfa\.authorize',\s*'([^']+)'/g)].map((m) => ({ kind: 'staff', action: m[1] as string, outcome: 'denied' })),
    ];
    expect(actions.length).toBeGreaterThanOrEqual(70);
    for (const a of actions) {
      expect(a.action, a.action).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
      expect(a.action.length, a.action).toBeLessThanOrEqual(80);
      expect(['success', 'denied', 'failed'], a.action).toContain(a.outcome);
      if (a.kind !== undefined) expect(['staff', 'organization_user', 'system'], a.action).toContain(a.kind);
    }
    for (const must of ['owner.mfa_window.auto_revoke', 'staff.owner_factor_removal.attest', 'staff.owner_factor_loss.review', 'owner.mfa_recovery.expire']) expect(actions.map((a) => a.action), must).toContain(must);
  });
  it('the window and request tables keep who, when and why together; finished rows are immutable; truncate is blocked', () => {
    expect(noComments).toMatch(/constraint owner_mfa_windows_revocation_group check \(num_nonnulls\(revoked_at, revoked_by, revoke_reason\) in \(0, 3\)\)/);
    expect(noComments).toMatch(/a finished recovery request cannot change again/);
    for (const t of ['owner_mfa_windows', 'owner_mfa_factors', 'owner_recovery_codes', 'owner_recovery_requests']) expect(noComments).toMatch(new RegExp(`create trigger ${t}_no_truncate`));
  });
});

describe('recovery state transitions and concurrency design (static)', () => {
  // A MODEL of the intended transition table, used only to test the DESIGN (no path out of a final state, one open request). It is compared with the SQL by the messages the guard raises.
  const TRANSITIONS: Record<string, string[]> = { awaiting_approval: ['pending', 'cancelled', 'expired'], pending: ['cancelled', 'expired', 'completed'], cancelled: [], completed: [], expired: [] };
  it('the intended table has no transition out of a final state and every non-final state can end', () => {
    for (const s of ['cancelled', 'completed', 'expired']) expect(TRANSITIONS[s]).toEqual([]);
    for (const s of ['awaiting_approval', 'pending']) expect(TRANSITIONS[s]!.length).toBeGreaterThan(0);
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...RECOVERY_REQUEST_STATUSES_REV5].sort());
  });
  it('the update guard implements exactly these transitions and nothing else', () => {
    const g = fnBody('private', 'guard_owner_recovery_request_update');
    for (const msg of ['a finished recovery request cannot change again', 'the approval sets the approval group', 'a cancellation changes only the cancellation record', 'an expiry changes only the status', 'a completion changes only the completion record', 'illegal recovery request transition', 'no change is allowed on an unchanged recovery request status']) expect(g, msg).toContain(msg);
    expect(g).toMatch(/old\.status = 'awaiting_approval' and new\.status = 'pending'/);
    expect(g).toMatch(/old\.status = 'pending' and new\.status = 'completed'/);
    expect(noComments).toMatch(/create unique index owner_recovery_requests_one_open_idx on private\.owner_recovery_requests \(user_id\) where status in \('awaiting_approval', 'pending'\)/);
    expect(noComments).toMatch(/create unique index owner_mfa_windows_one_open_idx on private\.owner_mfa_windows \(user_id\) where consumed_at is null and revoked_at is null/);
  });
  it('lock hierarchy: whenever several advisory locks are taken they appear in the order operator, owner recovery, owner window', () => {
    const order = ['p2:operator_recovery:', 'p2:owner_recovery:', 'p2:owner_window:'];
    for (const n of MUTATING_RPCS) {
      const b = fnBody('public', n);
      const pos = order.map((k) => b.indexOf(k)).filter((p) => p >= 0);
      expect(pos, n).toEqual([...pos].sort((a, c) => a - c));
    }
  });
  it('helpers that take the window lock are only called after the owner recovery lock; the helper itself takes only the window lock', () => {
    for (const n of MUTATING_RPCS) {
      const b = fnBody('public', n);
      for (const helper of ['close_expired_recovery_requests', 'revoke_request_windows']) {
        const call = b.indexOf(`private.${helper}(`);
        if (call < 0) continue;
        const lock = b.indexOf('p2:owner_recovery:');
        expect(lock, `${n} calls ${helper} without the owner recovery lock`).toBeGreaterThanOrEqual(0);
        expect(lock, `${n}: lock (2) before ${helper}`).toBeLessThan(call);
      }
    }
    const h = fnBody('private', 'revoke_request_windows');
    expect(h).not.toMatch(/p2:owner_recovery:|p2:operator_recovery:/);
  });
  it('argument validation raises BEFORE any lock or counter; after the first lock or counter no statement raises (refusals are returned and audited)', () => {
    for (const n of MUTATING_RPCS) {
      const b = fnBody('public', n);
      const first = Math.min(...['pg_advisory_xact_lock', 'rate_limit_hit'].map((k) => (b.indexOf(k) >= 0 ? b.indexOf(k) : Infinity)));
      if (!Number.isFinite(first)) continue;
      expect(b.slice(first), n).not.toMatch(/raise exception/);
    }
  });
  it('every initiate, approve and window insert that can lose a race is inside a block that turns the constraint failure into an audited refusal', () => {
    expect(fnBody('public', 'rpc_staff_initiate_owner_recovery')).toMatch(/when unique_violation then[\s\S]*'request_pending'/);
    expect(fnBody('public', 'rpc_staff_authorize_owner_mfa_window')).toMatch(/when unique_violation then[\s\S]*'window_already_open'/);
    expect(fnBody('public', 'rpc_staff_approve_owner_recovery')).toMatch(/exception when sqlstate '23514' then[\s\S]*'approval_rejected'/);
    expect(fnBody('public', 'rpc_staff_attest_owner_factor_removal')).toMatch(/exception when sqlstate '23514' then[\s\S]*'attestation_rejected'/);
  });
});

describe('recovery codes and requests still cannot influence privileges; MFA is never bypassed (static)', () => {
  it('the decision functions never mention recovery; the request RPC touches no factor, window or assurance object; nothing writes to auth.*', () => {
    for (const n of ['owner_mfa_ok', 'my_mfa_owner_org_ids']) expect(fnBody('private', n), n).not.toMatch(/recover/i);
    const r = fnBody('public', 'rpc_owner_recovery_request');
    expect(r).not.toMatch(/owner_mfa_factors|owner_mfa_windows|mfa_factors|aal|step_up_ok|owner_mfa_ok/);
    expect(noComments).not.toMatch(/\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+auth\./i);
  });
  it('the factor gate still requires: verified TOTP of this user, created inside the window, the ONLY verified factor, an active owner, an unrevoked unconsumed window', () => {
    const t = fnBody('private', 'guard_owner_mfa_factor_insert');
    for (const re of [/factor was not created inside the enrolment window/, /another verified factor exists/, /factor is not verified/, /only TOTP factors may be approved/, /enrolment window is revoked/, /enrolment window is already consumed/, /target is not an active organization owner/]) expect(t).toMatch(re);
  });
  it('the owner-code request defect fixed in rev4 stays fixed: timestamps from one captured instant', () => {
    const r = fnBody('public', 'rpc_owner_recovery_request');
    expect(r).toMatch(/v_now := clock_timestamp\(\);/);
    expect(r).toMatch(/values \(v_actor, 'owner_code', 'pending', v_now, v_now \+ interval '24 hours'/);
  });
});

describe('application-level throttle interface (P3, defense in depth; not authoritative)', () => {
  it('counts the attempt first, decides at the limit, fails closed on a malformed key or a failing store', async () => {
    const store = createInMemoryAppThrottleStore();
    const key = 'k'.repeat(24);
    const p = APP_THROTTLE_POLICIES.operator_recovery_attempt;
    for (let i = 0; i < p.maxAttempts; i++) expect(await appThrottleHit(store, 'operator_recovery_attempt', key, 1000 + i)).toEqual({ allowed: true });
    expect(await appThrottleHit(store, 'operator_recovery_attempt', key, 5000)).toEqual({ allowed: false, retryAfterSecs: p.windowSecs });
    expect(await appThrottleHit(store, 'operator_recovery_attempt', 'x@y.z', 1)).toEqual({ allowed: false, retryAfterSecs: p.windowSecs }); // raw identifiers are refused
    expect(await appThrottleHit({ hit: async () => { throw new Error('store down'); } }, 'target_owner_probe', key, 1)).toEqual({ allowed: false, retryAfterSecs: 60 });
    expect(await appThrottleHit({ hit: async () => 0 }, 'target_owner_probe', key, 1)).toEqual({ allowed: false, retryAfterSecs: APP_THROTTLE_POLICIES.target_owner_probe.windowSecs });
    // a new window starts after the window length
    expect(await appThrottleHit(store, 'operator_recovery_attempt', key, 1000 + p.windowSecs * 1000 + 1)).toEqual({ allowed: true });
  });
  it('scopes are independent and an attempt is counted regardless of any later outcome (the count happens before the RPC would run)', async () => {
    const store = createInMemoryAppThrottleStore();
    const key = 'a'.repeat(32);
    await appThrottleHit(store, 'owner_code_attempt_user', key, 1);
    expect(await store.hit(`owner_code_attempt_user:${key}`, 2, 3_600_000)).toBe(2);
    expect(await store.hit(`owner_code_attempt_ip:${key}`, 2, 3_600_000)).toBe(1);
  });
});
