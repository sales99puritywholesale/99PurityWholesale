import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTO_REVOKE_CODES_REV6,
  EXCEPTIONS_PER_OWNER_PER_30D,
  EXCEPTION_CLOSING_CODES,
  EXCEPTION_GRANT_DEADLINE_HOURS,
  EXCEPTION_STATUSES,
  EXCEPTION_USE_HOURS_AFTER_GRANT,
  OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H_REV6,
  OPERATOR_INITIATIONS_PER_OWNER_PER_7D_REV6,
  OPERATOR_RECOVERY_CODES_REV6,
  OWNER_RECOVERY_CODES_REV6,
  OWNER_WINDOW_CODES_REV6,
  PRODUCTION_PARSER_ACCEPTS_REV6_STATUSES,
  RATE_LIMIT_POLICIES_REV6,
  RECOVERY_COOLOFF_HOURS_REV6,
  RECOVERY_MAX_EXTENSIONS,
  RECOVERY_MAX_WINDOWS,
  RECOVERY_REQUEST_STATUSES_REV6,
  RECOVERY_STANDARD_WINDOWS,
  RECOVERY_VERIFICATION_METHODS_REV6,
  REMOVAL_METHODS,
  REMOVAL_ORDER_MAX_ATTEMPTS,
  REMOVAL_ORDER_STATUSES,
  STRANDED_LOOKBACK_DAYS,
  STRUCTURE_CHECK_MAX_AGE_HOURS,
  exceptionPeopleOk,
  exceptionTransitionAllowed,
  orderTransitionAllowed,
  parseOperatorRecoveryResultRev6,
  parseOwnerRecoveryResultRev6,
  parseOwnerWindowResultRev6,
  recoveryWindowEnd,
  removalOutcome,
  structureCheckFresh,
  verifiedFactorIds,
  windowCounterTransitionAllowed,
  windowCountersConsistent,
} from '@/lib/portal/permissions/owner-rev6';

// rev6 is a REVIEW DRAFT; these tests read its TEXT only (no database, nothing executed). They prove that the text, the TypeScript mirror and the design agree. They do NOT prove that PostgreSQL accepts
// the SQL, that a constraint or trigger behaves as written, or anything about transactions, real Auth, the structure check on a real project, or concurrency.
const root = process.cwd();
// P2_REV6_TEST_FILE exists ONLY for supabase/review/tests/rev6-negative-controls.mjs, which points the suite at deliberately broken copies to prove the tests can fail.
const sql = readFileSync(process.env.P2_REV6_TEST_FILE ?? join(root, 'supabase', 'review', '0005_rate_limits_and_owner_mfa.rev6.sql'), 'utf8');
const noComments = sql.replace(/--[^\n]*/g, '');
const fnBody = (schema: string, name: string) => new RegExp(`create function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(noComments)?.[0] ?? '';
// not result codes: the two categories of the factor-loss review, the removal method labels, and the closing code that an audit detail records under the key 'code'
const NON_CODE = ['stranded', 'unexplained', 'none_needed', 'manual', 'operator_cancelled'];
const codes = (body: string) =>
  [
    ...[...body.matchAll(/'code',\s*'([a-z_]+)'/g)].map((m) => m[1] as string),
    ...[...body.matchAll(/(?:then|else)\s+'([a-z_]+)'/g)].map((m) => m[1] as string),
    ...[...body.matchAll(/v_code\s*:=\s*'([a-z_]+)'/g)].map((m) => m[1] as string),
  ].filter((c) => !NON_CODE.includes(c));
const GATE = ['forbidden', 'step_up_required'];
const MUTATING_RPCS = ['rpc_staff_authorize_owner_mfa_window', 'rpc_staff_revoke_owner_mfa_window', 'rpc_owner_open_factor_window', 'rpc_owner_revoke_factor_window', 'rpc_owner_claim_factor',
  'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel', 'rpc_staff_initiate_owner_recovery', 'rpc_staff_approve_owner_recovery', 'rpc_staff_cancel_owner_recovery',
  'rpc_owner_set_recovery_codes', 'rpc_staff_list_owner_factor_loss', 'rpc_staff_owner_mfa_overview', 'rpc_staff_authorize_extra_recovery_window', 'rpc_staff_request_stranded_exception',
  'rpc_staff_grant_stranded_exception', 'rpc_staff_cancel_stranded_exception', 'rpc_staff_begin_factor_removal', 'rpc_staff_complete_factor_removal'];
const OPERATOR_RPCS = MUTATING_RPCS.filter((n) => n.startsWith('rpc_staff_'));

describe('rev6 mirror equals the rev6 SQL draft: numbers, lists and result codes', () => {
  it('rate-limit seed: the same eight buckets and numbers as before (no quota number changed)', () => {
    const block = /insert into private\.rate_limit_policies[^;]*values([\s\S]*?\));\s*\n/i.exec(sql)?.[1] ?? '';
    const rows = [...block.matchAll(/\(\s*'([a-z_]+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g)].map((m) => ({ bucket: m[1] as string, maxAttempts: Number(m[2]), windowSecs: Number(m[3]), blockSecs: Number(m[4]) }));
    expect(rows).toHaveLength(8);
    for (const r of rows) expect(RATE_LIMIT_POLICIES_REV6[r.bucket as keyof typeof RATE_LIMIT_POLICIES_REV6], r.bucket).toEqual({ maxAttempts: r.maxAttempts, windowSecs: r.windowSecs, blockSecs: r.blockSecs });
    expect([OPERATOR_INITIATIONS_PER_OPERATOR_PER_24H_REV6, OPERATOR_INITIATIONS_PER_OWNER_PER_7D_REV6]).toEqual([5, 2]);
  });
  it('methods: three real methods everywhere, notarization is a flag; the reference pattern is the same', () => {
    const list = `('${RECOVERY_VERIFICATION_METHODS_REV6.join("', '")}')`;
    expect(noComments.split(list).length - 1).toBeGreaterThanOrEqual(4);
    expect(noComments).not.toMatch(/notarized_statement/);
    expect(noComments).toContain(`'^[A-Za-z0-9._:/#-]{1,80}$'`);
  });
  it('lifecycle numbers and the approved exception numbers (30 day lookback, 2 per owner per 30 days, 24 h to grant, 72 h to use)', () => {
    expect([RECOVERY_COOLOFF_HOURS_REV6, STRANDED_LOOKBACK_DAYS, EXCEPTIONS_PER_OWNER_PER_30D, EXCEPTION_GRANT_DEADLINE_HOURS, EXCEPTION_USE_HOURS_AFTER_GRANT]).toEqual([24, 30, 2, 24, 72]);
    expect(noComments).toMatch(/cooloff_until is null or cooloff_until >= coalesce\(approved_at, created_at\) \+ interval '24 hours'/);
    expect(noComments).toMatch(/r\.factors_removed_at > clock_timestamp\(\) - interval '30 days'/);
    expect(noComments).toMatch(/e\.requested_at > clock_timestamp\(\) - interval '30 days'\) >= 2/);
    expect(noComments).toMatch(/granted_at is null and expires_at <= requested_at \+ interval '24 hours'/);
    expect(noComments).toMatch(/expires_at <= granted_at \+ interval '72 hours'/);
    expect(fnBody('public', 'rpc_staff_grant_stranded_exception')).toMatch(/expires_at = v_now \+ interval '72 hours'/);
    expect(fnBody('public', 'rpc_staff_request_stranded_exception')).toMatch(/interval '24 hours'/);
    expect(STRUCTURE_CHECK_MAX_AGE_HOURS).toBe(24);
    expect(fnBody('private', 'auth_structure_ok')).toMatch(/v\.checked_at > now\(\) - interval '24 hours' and v\.checked_at <= now\(\)/);
  });
  it('statuses and states match', () => {
    expect(noComments).toContain(`status in ('${RECOVERY_REQUEST_STATUSES_REV6.join("', '")}')`);
    expect(noComments).toContain(`status in ('${EXCEPTION_STATUSES.join("', '")}')`);
    expect(noComments).toContain(`status in ('${REMOVAL_ORDER_STATUSES.join("', '")}')`);
    expect(noComments).toContain(`closed_code in ('${EXCEPTION_CLOSING_CODES.join("', '")}')`);
    expect(noComments).toContain(`removal_method in ('${REMOVAL_METHODS.join("', '")}')`);
    expect(PRODUCTION_PARSER_ACCEPTS_REV6_STATUSES).toBe(true);
    expect([...AUTO_REVOKE_CODES_REV6]).toEqual(['request_cancelled', 'request_expired']);
  });
  const groups: Array<[string, string[], readonly string[]]> = [
    ['owner window, claim and own-window revocation', ['rpc_owner_open_factor_window', 'rpc_owner_claim_factor', 'rpc_owner_revoke_factor_window'], OWNER_WINDOW_CODES_REV6],
    ['operator', OPERATOR_RPCS, OPERATOR_RECOVERY_CODES_REV6],
    ['owner recovery', ['rpc_owner_set_recovery_codes', 'rpc_owner_recovery_request', 'rpc_owner_recovery_cancel'], OWNER_RECOVERY_CODES_REV6],
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
    expect(parseOperatorRecoveryResultRev6({ ok: true, code: 'completed' })).toEqual({ ok: true, code: 'completed' });
    expect(parseOperatorRecoveryResultRev6({ ok: false, code: 'factor_set_changed' })).toEqual({ ok: false, code: 'factor_set_changed' });
    expect(parseOwnerWindowResultRev6({ ok: false, code: 'removal_not_verified' })).toEqual({ ok: false, code: 'removal_not_verified' });
    expect(parseOwnerRecoveryResultRev6({ ok: false, code: 'request_not_accepted' })).toEqual({ ok: false, code: 'request_not_accepted' });
    for (const bad of [null, undefined, 'x', 1, [], {}, { ok: true }, { ok: true, code: 'factor_set_changed' }, { ok: false, code: 'completed' }, { ok: true, code: 'made_up' },
      { ok: true, code: 'removal_attestation_required' }, { ok: true, code: 'factor_removal_required' }, { ok: true, code: 'attested' }]) {
      expect(parseOperatorRecoveryResultRev6(bad), JSON.stringify(bad)).toEqual({ ok: false, code: 'invalid_response' });
    }
  });
});

describe('fail-closed Auth factor reads (approved decision 2)', () => {
  it('the structure-check predicate is the one of 0002 and fails closed on any error', () => {
    const b = fnBody('private', 'auth_structure_ok');
    expect(b).toMatch(/v\.check_name = 'auth_mfa_factors_shape' and v\.status = 'passed'/);
    expect(b).toMatch(/exception when others then\s+return false/);
    expect(b).toMatch(/security definer/);
  });
  it('UNKNOWN is NULL, never empty: the helper returns NULL on a missing, stale or failed check, on any unreadable row, on a null argument and on any error', () => {
    const b = fnBody('private', 'owner_verified_factor_ids');
    expect(b).toMatch(/if p_user is null or not private\.auth_structure_ok\(\) then\s+return null;/);
    expect(b).toMatch(/f\.status::text not in \('verified', 'unverified'\)/);
    expect(b).toMatch(/f\.factor_type::text not in \('totp', 'phone', 'webauthn'\)/);
    expect(b).toMatch(/f\.id is null or f\.status is null or f\.factor_type is null/);
    expect(b).toMatch(/if v_unreadable is null or v_unreadable <> 0 then\s+return null;/);
    expect(b).toMatch(/exception when others then\s+return null;/);
    expect(b).toMatch(/array_agg\(f\.id order by f\.id\) filter \(where f\.status::text = 'verified'\)/);
  });
  it('the state function, the MFA predicate, the factor gate and the window gate all fail closed on unknown', () => {
    expect(fnBody('private', 'owner_factor_state')).toMatch(/private\.owner_verified_factor_ids\(p_user\) is null then\s+return 'unknown';/);
    expect(fnBody('private', 'owner_mfa_ok')).toMatch(/if not private\.auth_structure_ok\(\) then\s+return false;/);
    expect(fnBody('private', 'guard_owner_mfa_factor_insert')).toMatch(/v_ids := private\.owner_verified_factor_ids\(new\.user_id\);\s+if v_ids is null then\s+raise exception 'the factor state of this user is unknown'/);
    expect(fnBody('private', 'guard_owner_mfa_window_insert')).toMatch(/v_ids is null or new\.factors_at_open is null or new\.factors_at_open <> cardinality\(v_ids\)/);
    expect(fnBody('private', 'guard_owner_factor_removal_order_insert')).toMatch(/v_ids is null or v_ids is distinct from new\.snapshot_factor_ids/);
    expect(fnBody('private', 'guard_owner_factor_removal_order_update')).toMatch(/v_ids is null or cardinality\(v_ids\) <> 0/);
  });
  it('no RPC turns unknown into zero: every RPC that reads the ids checks NULL first, and the overview returns NULL (unknown) rather than 0', () => {
    for (const n of ['rpc_staff_authorize_owner_mfa_window', 'rpc_staff_authorize_extra_recovery_window', 'rpc_staff_begin_factor_removal', 'rpc_staff_complete_factor_removal']) {
      const b = fnBody('public', n);
      expect(b, n).toMatch(/v_ids := private\.owner_verified_factor_ids\(/);
      expect(b, n).toMatch(/if v_ids is null then/);
    }
    expect(noComments).not.toMatch(/coalesce\(\s*private\.owner_verified_factor_ids/);
    expect(fnBody('public', 'rpc_staff_owner_mfa_overview')).toMatch(/v_ver := cardinality\(private\.owner_verified_factor_ids\(p_owner_user_id\)\)/);
    expect(fnBody('public', 'rpc_staff_list_owner_factor_loss')).toMatch(/if not private\.auth_structure_ok\(\) then[\s\S]*'structure_check_required'/);
  });
  it('auth.mfa_factors is read directly ONLY by the four reviewed functions; the self-check asserts it on the live definitions', () => {
    const readers = [...noComments.matchAll(/create function (?:public|private)\.([a-z_0-9]+)\([\s\S]*?\n\$\$;/g)].filter((m) => /auth\.mfa_factors/.test(m[0])).map((m) => m[1] as string);
    expect(readers.sort()).toEqual(['guard_owner_mfa_factor_insert', 'owner_factor_state', 'owner_mfa_ok', 'owner_verified_factor_ids']);
    expect(noComments).toMatch(/self-check: an owner-path function reads auth\.mfa_factors outside the fail-closed helpers/);
    expect(noComments).toMatch(/self-check: an owner factor read does not go through the structure-checked fail-closed helpers/);
    expect(noComments).not.toMatch(/\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+auth\./i);
  });
  it('MODEL: the pure rules agree (stale, failed, future-dated, unreadable rows and unknown statuses are all unknown, never empty)', () => {
    const now = 1_000_000_000_000;
    const ok = { status: 'passed', checkedAtMs: now - 3_600_000 };
    expect(structureCheckFresh(ok, now)).toBe(true);
    for (const bad of [null, { status: 'failed', checkedAtMs: now }, { status: 'passed', checkedAtMs: now - 25 * 3_600_000 }, { status: 'passed', checkedAtMs: now + 1000 }]) expect(structureCheckFresh(bad, now)).toBe(false);
    const rows = [{ id: 'b', status: 'verified', type: 'totp' }, { id: 'a', status: 'verified', type: 'totp' }, { id: 'c', status: 'unverified', type: 'totp' }];
    expect(verifiedFactorIds(rows, ok, now)).toEqual(['a', 'b']);
    expect(verifiedFactorIds([], ok, now)).toEqual([]); // the database READ this user's factors and none is verified
    expect(verifiedFactorIds(rows, null, now)).toBeNull();
    expect(verifiedFactorIds(rows, { status: 'passed', checkedAtMs: now - 30 * 3_600_000 }, now)).toBeNull();
    expect(verifiedFactorIds(null, ok, now)).toBeNull();
    for (const odd of [{ id: 'x', status: 'suspended', type: 'totp' }, { id: 'x', status: null, type: 'totp' }, { id: 'x', status: 'verified', type: 'sms' }, { id: null, status: 'verified', type: 'totp' }]) {
      expect(verifiedFactorIds([...rows, odd], ok, now), JSON.stringify(odd)).toBeNull();
    }
  });
});

describe('stranded-owner exception: state machine, ownership, atomicity and concurrency (static)', () => {
  const g = fnBody('private', 'guard_owner_recovery_exception_update');
  it('the table carries the ownership, status shape, two-person and expiry constraints; reuse is bounded by partial unique indexes', () => {
    expect(noComments).toMatch(/constraint owner_recovery_exceptions_stranded_fk foreign key \(stranded_request_id, user_id\)\s+references private\.owner_recovery_requests \(id, user_id\) on delete restrict/);
    expect(noComments).toMatch(/constraint owner_recovery_requests_exception_fk foreign key \(exception_id, user_id\)\s+references private\.owner_recovery_exceptions \(id, user_id\) on delete restrict/);
    expect(noComments).toMatch(/constraint owner_recovery_requests_id_user_key unique \(id, user_id\)/);
    expect(noComments).toMatch(/constraint owner_recovery_exceptions_id_user_key unique \(id, user_id\)/);
    expect(noComments).toMatch(/owner_recovery_exceptions_two_person check \(granted_by is null or granted_by <> requested_by\)/);
    expect(noComments).toMatch(/owner_recovery_exceptions_grant_group check \(num_nonnulls\(granted_by, granted_at, grant_reason\) in \(0, 3\)\)/);
    expect(noComments).toMatch(/\(status = 'requested' and granted_by is null and consumed_at is null and closed_code is null\)/);
    expect(noComments).toMatch(/\(status = 'granted'\s+and granted_by is not null and consumed_at is null and closed_code is null\)/);
    expect(noComments).toMatch(/\(status = 'consumed'\s+and granted_by is not null and consumed_at is not null and closed_code is null\)/);
    expect(noComments).toMatch(/create unique index owner_recovery_exceptions_one_open_idx on private\.owner_recovery_exceptions \(user_id\) where status in \('requested', 'granted'\)/);
    expect(noComments).toMatch(/create unique index owner_recovery_exceptions_one_live_idx on private\.owner_recovery_exceptions \(stranded_request_id\) where status in \('requested', 'granted', 'consumed'\)/);
    expect(noComments).toMatch(/create unique index owner_recovery_requests_exception_idx on private\.owner_recovery_requests \(exception_id\) where exception_id is not null/);
    expect(noComments).toMatch(/owner_recovery_requests_exception_origin check \(exception_id is null or origin = 'operator'\)/);
  });
  it('the update guard implements exactly the allowed transitions and rechecks expiry, people and the stranded state AT the transition', () => {
    for (const m of ['a finished exception cannot change again', 'an expired exception cannot be granted', 'the granter must be a different account than the requester',
      'the owner is no longer stranded on this request', 'an expired exception cannot be consumed', 'an exception is consumed only by a request that carries it',
      'an exception expires only after its deadline', 'illegal exception transition', 'no change is allowed on an unchanged exception status']) expect(g, m).toContain(m);
    expect(g).toMatch(/private\.owner_mfa_operator_ok\(new\.granted_by\) and private\.owner_mfa_operator_ok\(old\.requested_by\)/);
    expect(g).toMatch(/private\.owner_mfa_operator_ok\(old\.requested_by\) and private\.owner_mfa_operator_ok\(old\.granted_by\)/);
    expect(g).toMatch(/r\.exception_id = old\.id and r\.user_id = old\.user_id and r\.origin = 'operator' and r\.created_at >= old\.granted_at/);
    expect(exceptionTransitionAllowed('requested', 'granted')).toBe(true);
    for (const from of ['consumed', 'expired', 'cancelled']) for (const to of EXCEPTION_STATUSES) expect(exceptionTransitionAllowed(from, to), `${from}->${to}`).toBe(false);
    expect(exceptionTransitionAllowed('requested', 'consumed')).toBe(false); // consumption needs a grant first
    expect(exceptionTransitionAllowed('granted', 'requested')).toBe(false);
  });
  it('consumption order (X1): validated BEFORE the request exists, the request carries the exception, the exception is marked consumed in the same sub-transaction', () => {
    const ins = fnBody('private', 'guard_owner_recovery_request_insert');
    expect(ins).toMatch(/v_exc\.status <> 'granted' or v_exc\.expires_at <= clock_timestamp\(\)/);
    expect(ins).toMatch(/private\.owner_stranded_request\(new\.user_id\) is distinct from v_exc\.stranded_request_id/);
    expect(ins).toMatch(/owner_mfa_operator_ok\(v_exc\.requested_by\) and private\.owner_mfa_operator_ok\(v_exc\.granted_by\)/);
    const i = fnBody('public', 'rpc_staff_initiate_owner_recovery');
    const insertAt = i.indexOf('insert into private.owner_recovery_requests');
    const consumeAt = i.indexOf("set status = 'consumed'");
    const checkAt = i.indexOf('private.owner_stranded_request(p_owner_user_id)');
    expect(checkAt).toBeGreaterThan(0);
    expect(checkAt).toBeLessThan(insertAt);
    expect(insertAt).toBeLessThan(consumeAt);
    expect(i.slice(insertAt, consumeAt)).not.toMatch(/\bend;\s*exception\b/); // insert and consume share ONE begin/exception block
    expect(i).toMatch(/p_exception_id uuid default null/);
    expect(i).toMatch(/e\.id = p_exception_id and e\.user_id = p_owner_user_id and e\.status = 'granted' and e\.expires_at > clock_timestamp\(\) for update/);
    expect(i).toMatch(/exception_id\)\s+values \(p_owner_user_id, 'operator', 'awaiting_approval', v_now, v_actor, v_reason, p_method, p_ref, p_notarized, v_now \+ interval '72 hours', v_exc_id\)/);
    expect(i).toMatch(/'staff\.owner_recovery_exception\.consume', 'success'/);
  });
  it('the exception bypasses ONLY the per-owner quota: the operator quota block, the open-request check and the lock checks are not inside the exempt branch', () => {
    const i = fnBody('public', 'rpc_staff_initiate_owner_recovery');
    expect(i).toMatch(/if v_exc_id is null then[^]*bucket = 'operator_recovery_target'[^]*end if;/);
    expect(i.indexOf("bucket = 'operator_recovery_initiate'")).toBeLessThan(i.indexOf('if v_exc_id is null then'));
    expect(i).toMatch(/'quota_operator'/);
    const beforeExempt = i.slice(0, i.indexOf('if v_exc_id is null then'));
    expect(beforeExempt).toMatch(/'request_pending'/);
    expect(beforeExempt).toMatch(/'recovery_locked'/);
    expect(i).not.toMatch(/if v_exc_id is null then[^]*operator_recovery_initiate[^]*end if;\s*begin/);
  });
  it('the stranded state is rechecked at request, grant and consume, and by the lazy closing; all fail closed', () => {
    expect(fnBody('public', 'rpc_staff_request_stranded_exception')).toMatch(/v_strand := private\.owner_stranded_request\(p_owner_user_id\);\s+if v_strand is null then/);
    expect(fnBody('private', 'guard_owner_recovery_exception_insert')).toMatch(/private\.owner_stranded_request\(new\.user_id\) is distinct from new\.stranded_request_id/);
    expect(fnBody('public', 'rpc_staff_grant_stranded_exception')).toMatch(/private\.owner_stranded_request\(v_user\) is distinct from v_exc\.stranded_request_id/);
    const h = fnBody('private', 'owner_stranded_request');
    expect(h).toMatch(/private\.owner_factor_state\(p_user\) is distinct from 'recovery_required' then\s+return null;/);
    expect(h).toMatch(/o\.status in \('awaiting_approval', 'pending'\)/);
    expect(h).toMatch(/r\.factors_removed_at is not null/);
    expect(h).toMatch(/exception when others then\s+return null;/);
    expect(fnBody('private', 'close_expired_recovery_requests')).toMatch(/closed_code = 'not_stranded'[\s\S]*private\.owner_stranded_request\(p_user\) is distinct from e\.stranded_request_id/);
    // an UNKNOWN factor state (stale structure check) never cancels an exception: it only refuses its use
    expect(fnBody('private', 'close_expired_recovery_requests')).toMatch(/and private\.owner_factor_state\(p_user\) is distinct from 'unknown'\s+and private\.owner_stranded_request\(p_user\) is distinct from e\.stranded_request_id/);
  });
  it('a completed recovery invalidates an outstanding exception (the claim closes it under the owner lock); expired and cancelled exceptions are final', () => {
    const c = fnBody('public', 'rpc_owner_claim_factor');
    expect(c).toMatch(/update private\.owner_recovery_requests set status = 'completed'[\s\S]*private\.close_expired_recovery_requests\(v_actor, v_actor, 'organization_user'\)/);
    expect(c.indexOf("p2:owner_recovery:")).toBeLessThan(c.indexOf('close_expired_recovery_requests'));
    expect(fnBody('private', 'guard_owner_recovery_exception_update')).toContain('a finished exception cannot change again');
    expect(fnBody('private', 'close_expired_recovery_requests')).toMatch(/update private\.owner_recovery_exceptions set status = 'expired'[\s\S]*expires_at <= clock_timestamp\(\)/);
  });
  it('two people: the RPCs refuse a self grant and an inactive requester; step-up and capability on every exception RPC; the model agrees', () => {
    const gr = fnBody('public', 'rpc_staff_grant_stranded_exception');
    expect(gr).toMatch(/v_exc\.requested_by = v_actor/);
    expect(gr).toMatch(/'self_grant_not_allowed'/);
    expect(gr).toMatch(/not private\.owner_mfa_operator_ok\(v_exc\.requested_by\)/);
    for (const n of ['rpc_staff_request_stranded_exception', 'rpc_staff_grant_stranded_exception', 'rpc_staff_cancel_stranded_exception']) {
      expect(fnBody('public', n), n).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', 'staff\.owner_recovery_exception\.[a-z]+', true,/);
    }
    expect(exceptionPeopleOk({ requester: 'a', granter: 'b', requesterActive: true, granterActive: true })).toBe(true);
    expect(exceptionPeopleOk({ requester: 'a', granter: 'a', requesterActive: true, granterActive: true })).toBe(false);
    expect(exceptionPeopleOk({ requester: 'a', granter: 'b', requesterActive: false, granterActive: true })).toBe(false);
    expect(exceptionPeopleOk({ requester: 'a', granter: 'b', requesterActive: true, granterActive: false })).toBe(false);
    expect(exceptionPeopleOk({ requester: 'a', granter: null, requesterActive: true, granterActive: true })).toBe(false);
  });
  it('concurrency design: every exception RPC takes the owner recovery lock (2) on the owner derived from the row, before any read of its state; no lock (1) outside initiate', () => {
    for (const n of ['rpc_staff_request_stranded_exception', 'rpc_staff_grant_stranded_exception', 'rpc_staff_cancel_stranded_exception']) {
      const b = fnBody('public', n);
      expect(b, n).toMatch(/pg_advisory_xact_lock\(hashtextextended\('p2:owner_recovery:' \|\| (?:p_owner_user_id|v_user)::text, 0\)\)/);
      expect(b, n).not.toMatch(/p2:operator_recovery:/);
      expect(b.indexOf('p2:owner_recovery:'), n).toBeLessThan(b.indexOf('close_expired_recovery_requests'));
    }
    const gr = fnBody('public', 'rpc_staff_grant_stranded_exception');
    expect(gr).toMatch(/select e\.status, e\.requested_by, e\.stranded_request_id into v_exc\s+from private\.owner_recovery_exceptions e where e\.id = p_exception_id for update;/);
    expect(gr).toMatch(/exception_not_open/);
  });
  it('the exception grants nothing else: no function that decides MFA, step-up or staff access mentions recovery, and the exception tables are not read by them', () => {
    for (const n of ['owner_mfa_ok', 'my_mfa_owner_org_ids']) expect(fnBody('private', n), n).not.toMatch(/recover|owner_recovery_exceptions|owner_factor_removal_orders|stranded/i);
    expect(fnBody('public', 'rpc_owner_recovery_request')).not.toMatch(/owner_recovery_exceptions|owner_factor_removal_orders|stranded/i);
  });
});

describe('five-window invariants are constraints and triggers, not only RPC logic', () => {
  it('table constraint: issued 0..5, extension counter exactly the windows beyond the third, extensions at most 2 (hard maximum five)', () => {
    expect(noComments).toMatch(/windows_issued between 0 and 5 and extra_windows_granted = greatest\(windows_issued - 3, 0\)/);
    expect(noComments).toMatch(/extra_windows_granted\s+smallint not null default 0 check \(extra_windows_granted between 0 and 2\)/);
    expect([RECOVERY_STANDARD_WINDOWS, RECOVERY_MAX_EXTENSIONS, RECOVERY_MAX_WINDOWS]).toEqual([3, 2, 5]);
  });
  it('the update guard allows exactly: one standard window (up to the third), one extension (fourth or fifth, both counters together), the removal marker; nothing decreases; expiry and cool-off are immutable', () => {
    const g = fnBody('private', 'guard_owner_recovery_request_update');
    expect(g).toMatch(/new\.windows_issued = old\.windows_issued \+ 1 and new\.windows_issued <= 3 and v_ext_same and v_rem_same/);
    expect(g).toMatch(/new\.windows_issued = old\.windows_issued \+ 1 and new\.windows_issued between 4 and 5 and new\.extra_windows_granted = old\.extra_windows_granted \+ 1 and v_rem_same/);
    expect(g).toMatch(/if old\.status = 'pending' and v_appr_same and v_time_same and v_end_same then/);
    expect(g).toMatch(/v_time_same := new\.cooloff_until is not distinct from old\.cooloff_until and new\.expires_at = old\.expires_at;/);
    expect(g).toMatch(/an extension needs an unexpired request past its cool-off and a window with a verified removal/);
    for (const from of [0, 1, 2, 3, 4, 5]) for (const to of [0, 1, 2, 3, 4, 5]) {
      const f = { issued: from, extra: Math.max(from - 3, 0) };
      const t = { issued: to, extra: Math.max(to - 3, 0) };
      const expected = to === from + 1;
      expect(windowCounterTransitionAllowed(f, t), `${from}->${to}`).toBe(expected);
    }
    expect(windowCountersConsistent(6, 3)).toBe(false);
    expect(windowCountersConsistent(4, 0)).toBe(false); // banked: counter ahead of extensions
    expect(windowCountersConsistent(3, 1)).toBe(false); // banked: an extension without a window
    expect(windowCounterTransitionAllowed({ issued: 3, extra: 0 }, { issued: 4, extra: 0 })).toBe(false); // the standard path cannot pass three
  });
  it('the window insert gate: counter equals the number of window rows plus one, five maximum, a window cannot end after its request, snapshot read by the database', () => {
    const w = fnBody('private', 'guard_owner_mfa_window_insert');
    expect(w).toMatch(/v_req\.windows_issued not between 1 and 5\s+or v_req\.windows_issued <> \(select count\(\*\) from private\.owner_mfa_windows w where w\.request_id = new\.request_id\) \+ 1/);
    expect(w).toMatch(/if new\.expires_at > v_req\.expires_at then\s+raise exception 'a recovery window cannot end after its request expires'/);
    expect(recoveryWindowEnd(0, 30, 10 * 60_000)).toBe(10 * 60_000);
    expect(recoveryWindowEnd(0, 30, 3 * 60_000)).toBeNull(); // request ending: less than the 5 minute minimum remains
    expect(recoveryWindowEnd(0, 4, 3_600_000)).toBeNull();
    expect(recoveryWindowEnd(0, 61, 3_600_000 * 24)).toBeNull();
    expect(recoveryWindowEnd(0, 60, 3_600_000 * 24)).toBe(3_600_000);
  });
  it('standard path stops at three; the extension RPC is the only path to the fourth and fifth; it is atomic, explicit, step-up gated and never changes expiry or cool-off', () => {
    const a = fnBody('public', 'rpc_staff_authorize_owner_mfa_window');
    expect(a).toMatch(/if v_req\.windows_issued >= 3 then[\s\S]*'recovery_window_limit'/);
    const e = fnBody('public', 'rpc_staff_authorize_extra_recovery_window');
    expect(e).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', 'staff\.owner_recovery_window\.extend', true,/);
    expect(e).toMatch(/if v_req\.windows_issued < 3 then[\s\S]*'extension_not_needed'/);
    expect(e).toMatch(/if v_req\.windows_issued >= 5 or v_req\.extra_windows_granted >= 2 then[\s\S]*'recovery_window_limit'/);
    expect(e).toMatch(/where w\.request_id = v_req\.id and w\.removal_verified_at is not null[\s\S]*'removal_not_verified'/);
    expect(e).toMatch(/set windows_issued = windows_issued \+ 1, extra_windows_granted = extra_windows_granted \+ 1 where id = v_req\.id;\s+insert into private\.owner_mfa_windows/);
    expect(e).not.toMatch(/cooloff_until =|expires_at =/); // the extension never writes the request's timing
    expect(e).toMatch(/v_endts := least\(clock_timestamp\(\) \+ make_interval\(mins => p_minutes\), v_req\.expires_at\)/);
    expect(e).toMatch(/'request_ending'/);
    expect(e.indexOf('p2:owner_recovery:')).toBeLessThan(e.indexOf('p2:owner_window:'));
    expect(e).toMatch(/from private\.owner_recovery_requests r where r\.user_id = p_owner_user_id and r\.status = 'pending' for update/);
  });
  it('revocation, lapse and expiry never refund the counter: no statement decreases windows_issued or extra_windows_granted anywhere', () => {
    expect(noComments).not.toMatch(/windows_issued\s*=\s*windows_issued\s*-/);
    expect(noComments).not.toMatch(/extra_windows_granted\s*=\s*extra_windows_granted\s*-/);
    expect(noComments).not.toMatch(/windows_issued\s*=\s*(0|\d)\b/);
    const refs = [...noComments.matchAll(/set windows_issued = ([^;]+);/g)].map((m) => m[1]);
    for (const r of refs) expect(r).toMatch(/windows_issued \+ 1/);
  });
});

describe('per-window verified removal: manual first, no client evidence, no broker, no service-role dependency', () => {
  it('no count parameter, no client-supplied evidence anywhere, and the rev5 attestation is gone', () => {
    expect(noComments).not.toMatch(/p_removed_count|p_deleted_count|p_evidence|p_attestation|factors_removed_count|rpc_staff_attest_owner_factor_removal/);
    const c = fnBody('public', 'rpc_staff_complete_factor_removal');
    expect(c).toMatch(/\(p_order_id uuid\) returns jsonb/);
    expect(c).toMatch(/v_ids := private\.owner_verified_factor_ids\(v_user\);\s+if v_ids is null then/);
    expect(c).toMatch(/'unknown_state'/);
    expect(c).toMatch(/'factor_set_changed'/);
    expect(c).toMatch(/'factors_still_present'/);
    expect(c).toMatch(/v_o\.attempts \+ 1 >= 5 then\s+update private\.owner_factor_removal_orders set status = 'failed'/);
    expect(c).toMatch(/'already_completed'/);
    expect(REMOVAL_ORDER_MAX_ATTEMPTS).toBe(5);
    expect(fnBody('public', 'rpc_staff_begin_factor_removal')).toMatch(/\(p_owner_user_id uuid\) returns jsonb/);
  });
  it('the order completion is verified by the database TWICE: in the RPC and again in the order guard; the window and request markers need a completed order', () => {
    const og = fnBody('private', 'guard_owner_factor_removal_order_update');
    expect(og).toMatch(/v_ids := private\.owner_verified_factor_ids\(old\.user_id\);\s+if v_ids is null or cardinality\(v_ids\) <> 0 then\s+raise exception/);
    expect(fnBody('private', 'guard_owner_mfa_window_update')).toMatch(/o\.window_id = old\.id and o\.status = 'completed'/);
    expect(fnBody('private', 'guard_owner_recovery_request_update')).toMatch(/o\.request_id = old\.id and o\.status = 'completed'/);
    expect(fnBody('private', 'guard_owner_mfa_factor_insert')).toMatch(/w\.id = new\.window_id and w\.removal_verified_at is not null/);
    expect(fnBody('public', 'rpc_owner_claim_factor')).toMatch(/'removal_not_verified'/);
    expect(fnBody('private', 'guard_owner_recovery_request_update')).toMatch(/w\.id = new\.window_id and w\.request_id = old\.id and w\.removal_verified_at is not null/);
  });
  it('MODEL: unknown refuses, any verified factor refuses, a foreign verified factor makes the order stale, only no verified factor completes', () => {
    expect(removalOutcome(['a', 'b'], null)).toBe('unknown');
    expect(removalOutcome(['a', 'b'], [])).toBe('complete');
    expect(removalOutcome(['a', 'b'], ['a'])).toBe('still_present');
    expect(removalOutcome(['a', 'b'], ['a', 'z'])).toBe('set_changed');
    expect(removalOutcome(['a'], ['z'])).toBe('set_changed');
    for (const from of ['completed', 'expired', 'cancelled', 'failed']) for (const to of REMOVAL_ORDER_STATUSES) expect(orderTransitionAllowed(from, to), `${from}->${to}`).toBe(false);
    expect(orderTransitionAllowed('ordered', 'completed')).toBe(true);
  });
  it('the order and window verification are bound to one owner, one request and one window (composite keys, equal user ids in every guard)', () => {
    expect(noComments).toMatch(/owner_factor_removal_orders_request_fk foreign key \(request_id, user_id\)\s+references private\.owner_recovery_requests \(id, user_id\) on delete restrict/);
    expect(noComments).toMatch(/owner_factor_removal_orders_window_fk foreign key \(window_id, user_id\)\s+references private\.owner_mfa_windows \(id, user_id\) on delete restrict/);
    const oi = fnBody('private', 'guard_owner_factor_removal_order_insert');
    expect(oi).toMatch(/v_w\.user_id <> new\.user_id or v_w\.kind <> 'recovery' or v_w\.request_id is distinct from new\.request_id/);
    expect(oi).toMatch(/new\.expires_at > v_w\.expires_at/);
    expect(fnBody('private', 'guard_owner_factor_removal_order_update')).toMatch(/new\.snapshot_factor_ids <> old\.snapshot_factor_ids/);
    expect(noComments).toMatch(/create unique index owner_factor_removal_orders_one_live_idx on private\.owner_factor_removal_orders \(window_id\) where status in \('ordered', 'completed'\)/);
    expect(noComments).toMatch(/owner_mfa_windows_removal_shape check \(/);
    expect(noComments).toMatch(/factors_at_open = 0 and removal_method = 'none_needed'/);
  });
  it('no broker, no service-role dependency, no database HTTP or autonomous mechanism, no write to auth.*', () => {
    expect(noComments).not.toMatch(/\b(pg_net|http_post|http_get|net\.http|dblink|pg_background|create\s+extension)\b/i);
    // service_role may appear only in the REVOKE lists (the self-check literals and messages are string literals and are removed first); no GRANT to it exists and no function depends on it
    const noStrings = noComments.replace(/'(?:[^']|'')*'/g, "''");
    expect(noStrings.replace(/from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/gi, '')).not.toMatch(/service_role/i);
    expect(noStrings).not.toMatch(/grant\s+[^;]*\bto\b[^;]*service_role/i);
    expect(noComments).not.toMatch(/serviceRole|service_role_key|createClient|admin\.mfa|deleteFactor|listFactors/);
    expect(noComments).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+auth\./i);
  });
  it('orders are cancelled with their revoked window and expire lazily, both audited', () => {
    expect(fnBody('private', 'revoke_request_windows')).toMatch(/update private\.owner_factor_removal_orders set status = 'cancelled' where window_id = w\.id and status = 'ordered'/);
    expect(fnBody('private', 'close_expired_recovery_requests')).toMatch(/update private\.owner_factor_removal_orders set status = 'expired'/);
    expect(fnBody('public', 'rpc_staff_complete_factor_removal')).toMatch(/'window_not_open'/);
  });
});

describe('authorization, grants, safe errors and retention (static)', () => {
  it('the isolation guard is the FIRST action of every mutating RPC; the self-check asserts it on the live definitions', () => {
    for (const n of MUTATING_RPCS) {
      const b = fnBody('public', n);
      const g = b.indexOf('private.require_read_committed()');
      expect(g, n).toBeGreaterThan(0);
      for (const k of ['staff_gate(', 'pg_advisory_xact_lock', 'rate_limit_hit', 'write_audit(', 'insert into', 'update private', 'raise exception']) {
        const p = b.indexOf(k);
        if (p >= 0) expect(g, `${n}: guard must precede ${k}`).toBeLessThan(p);
      }
    }
    expect(noComments).toMatch(/\) <> 19 then\s+raise exception 'self-check: a mutating recovery RPC does not call private\.require_read_committed\(\)'/);
  });
  it('every operator RPC has the capability and step-up gate, every new RPC and helper is revoked from every API role and granted to authenticated only (RPCs)', () => {
    for (const n of OPERATOR_RPCS) {
      const b = fnBody('public', n);
      expect(b, n).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', '[a-z_.]+', (true|false),/);
      if (n !== 'rpc_staff_owner_mfa_overview') expect(b, n).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', '[a-z_.]+', true,/);
    }
    const grants = /revoke all on function public\.rpc_throttle_password_recovery[\s\S]*?from public, anon, authenticated, service_role;/.exec(noComments)?.[0] ?? '';
    for (const sig of ['rpc_staff_authorize_extra_recovery_window(uuid, text, integer)', 'rpc_staff_request_stranded_exception(uuid, text)', 'rpc_staff_grant_stranded_exception(uuid, text)',
      'rpc_staff_cancel_stranded_exception(uuid)', 'rpc_staff_begin_factor_removal(uuid)', 'rpc_staff_complete_factor_removal(uuid)', 'rpc_staff_initiate_owner_recovery(uuid, text, text, text, boolean, uuid)']) {
      expect(grants, sig).toContain(`public.${sig}`);
      expect(noComments, sig).toMatch(new RegExp(`grant execute on function[^;]*public\\.${sig.replace(/[()]/g, '\\$&')}[^;]*to authenticated;`));
    }
    const privRevoke = /revoke all on function private\.rate_limit_hit[\s\S]*?from public, anon, authenticated, service_role;/.exec(noComments)?.[0] ?? '';
    for (const f of ['auth_structure_ok()', 'owner_verified_factor_ids(uuid)', 'owner_stranded_request(uuid)', 'guard_owner_recovery_exception_insert()', 'guard_owner_recovery_exception_update()',
      'guard_owner_factor_removal_order_insert()', 'guard_owner_factor_removal_order_update()']) expect(privRevoke, f).toContain(`private.${f}`);
    expect(noComments).toMatch(/revoke all on table[^;]*private\.owner_recovery_exceptions, private\.owner_factor_removal_orders\s+from public, anon, authenticated, service_role;/);
    expect(noComments).toMatch(/alter table private\.owner_recovery_exceptions enable row level security;/);
    expect(noComments).toMatch(/alter table private\.owner_factor_removal_orders enable row level security;/);
  });
  it('every new function pins search_path, SECURITY DEFINER exactly where it reads other tables as the owner, and trigger functions are not callable', () => {
    for (const n of ['auth_structure_ok', 'owner_verified_factor_ids', 'owner_stranded_request', 'guard_owner_recovery_exception_insert', 'guard_owner_factor_removal_order_insert']) {
      expect(fnBody('private', n), n).toMatch(/security definer set search_path = ''/);
    }
    for (const n of ['guard_owner_recovery_exception_update', 'guard_owner_factor_removal_order_update']) {
      expect(fnBody('private', n), n).toMatch(/language plpgsql set search_path = ''/);
    }
    for (const n of [...OPERATOR_RPCS, 'rpc_owner_claim_factor']) expect(fnBody('public', n), n).toMatch(/language plpgsql volatile security definer set search_path = ''/);
  });
  it('safe error behavior: validation raises before any lock or counter; after the first lock no RPC raises (refusals are returned and audited); trigger messages are never returned', () => {
    for (const n of MUTATING_RPCS) {
      const b = fnBody('public', n);
      const first = Math.min(...['pg_advisory_xact_lock', 'rate_limit_hit'].map((k) => (b.indexOf(k) >= 0 ? b.indexOf(k) : Infinity)));
      if (!Number.isFinite(first)) continue;
      expect(b.slice(first), n).not.toMatch(/raise exception/);
    }
    for (const n of ['rpc_staff_authorize_extra_recovery_window', 'rpc_staff_request_stranded_exception', 'rpc_staff_grant_stranded_exception', 'rpc_staff_begin_factor_removal', 'rpc_staff_complete_factor_removal']) {
      expect(fnBody('public', n), n).toMatch(/exception\s+when (unique_violation|sqlstate '23514') then/);
    }
    expect(noComments).not.toMatch(/sqlerrm|get stacked diagnostics|message_text/i);
  });
  it('lock hierarchy: whenever several advisory locks are taken they appear in the order operator, owner recovery, owner window; helpers taking (3) run only after (2)', () => {
    const order = ['p2:operator_recovery:', 'p2:owner_recovery:', 'p2:owner_window:'];
    for (const n of MUTATING_RPCS) {
      const b = fnBody('public', n);
      const pos = order.map((k) => b.indexOf(k)).filter((p) => p >= 0);
      expect(pos, n).toEqual([...pos].sort((a, c) => a - c));
      for (const helper of ['close_expired_recovery_requests', 'revoke_request_windows']) {
        const call = b.indexOf(`private.${helper}(`);
        if (call < 0) continue;
        const lock = b.indexOf('p2:owner_recovery:');
        expect(lock, `${n} calls ${helper} without lock (2)`).toBeGreaterThanOrEqual(0);
        expect(lock, `${n}: lock (2) before ${helper}`).toBeLessThan(call);
      }
    }
    expect(fnBody('private', 'revoke_request_windows')).not.toMatch(/p2:owner_recovery:|p2:operator_recovery:/);
  });
  it('retention: twelve RESTRICT foreign keys among six tables, none cascades; the self-check asserts the catalog; nothing deletes history', () => {
    expect(noComments).not.toMatch(/on delete cascade/i);
    expect([...noComments.matchAll(/references auth\.users \(id\) on delete restrict/g)]).toHaveLength(6);
    expect(noComments).toMatch(/\) <> 12\s+or exists \(select 1 from pg_constraint c where c\.contype = 'f' and c\.confdeltype <> 'r'/);
    expect(noComments).toMatch(/self-check: owner MFA and recovery history must be protected by ON DELETE RESTRICT foreign keys/);
    expect(noComments).not.toMatch(/delete\s+from\s+private\.owner_/i);
    expect(noComments).toMatch(/\) <> 17 then\s+raise exception 'self-check: expected 17 triggers/);
    expect(noComments).toMatch(/\) <> 31 then\s+raise exception 'self-check: an approved constraint is missing'/);
    expect(noComments).toMatch(/\) <> 21 then\s+raise exception 'self-check: RPC definer\/search_path\/grant state is wrong'/);
  });
  it('audit privacy: no reason text, hash or token in any audit detail; every action and outcome literal satisfies the CHECK constraints of 0003', () => {
    const calls = [...noComments.matchAll(/private\.write_audit\([\s\S]*?\);/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(100);
    for (const c of calls) expect(c).not.toMatch(/\bv_reason\b|\bp_reason\b|initiation_reason|approval_reason|cancel_reason|revoke_reason|request_reason|grant_reason|reason_text|code_hash|p_hashes|p_code_hash|token|secret/i);
    const actions = [
      ...[...noComments.matchAll(/private\.write_audit\([^,]+,\s*(?:'([a-z_]+)'|p_actor_kind),\s*'([^']+)',\s*'([a-z]+)'/g)].map((m) => ({ kind: m[1], action: m[2] as string, outcome: m[3] as string })),
      ...[...noComments.matchAll(/private\.staff_gate\('owner\.mfa\.authorize',\s*'([^']+)'/g)].map((m) => ({ kind: 'staff', action: m[1] as string, outcome: 'denied' })),
    ];
    expect(actions.length).toBeGreaterThanOrEqual(100);
    for (const a of actions) {
      expect(a.action, a.action).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
      expect(a.action.length, a.action).toBeLessThanOrEqual(80);
      expect(['success', 'denied', 'failed'], a.action).toContain(a.outcome);
      if (a.kind !== undefined) expect(['staff', 'organization_user', 'system'], a.action).toContain(a.kind);
    }
    for (const must of ['staff.owner_recovery_exception.request', 'staff.owner_recovery_exception.grant', 'staff.owner_recovery_exception.cancel', 'staff.owner_recovery_exception.consume',
      'staff.owner_recovery_window.extend', 'staff.owner_factor_removal.begin', 'staff.owner_factor_removal.complete', 'owner.mfa_recovery_exception.expire', 'owner.mfa_recovery_exception.cancel',
      'owner.mfa_factor_removal.expire', 'owner.mfa_factor_removal.cancel']) expect(actions.map((a) => a.action), must).toContain(must);
    expect(noComments).toMatch(/request_reason\s+text not null check/);
  });
});

describe('cross-tenant and identity binding (static)', () => {
  it('every RPC that takes an object id derives the OWNER from the stored row and locks and checks THAT owner, never a caller-supplied owner', () => {
    for (const [n, v] of [['rpc_staff_grant_stranded_exception', 'v_user'], ['rpc_staff_cancel_stranded_exception', 'v_user'], ['rpc_staff_complete_factor_removal', 'v_user'], ['rpc_staff_approve_owner_recovery', 'v_user'], ['rpc_staff_cancel_owner_recovery', 'v_user']] as const) {
      const b = fnBody('public', n);
      expect(b, n).toMatch(new RegExp(`select [a-z.]*user_id into ${v} from private\\.[a-z_]+ [a-z] where [a-z]\\.id = p_[a-z_]+_id;`));
      expect(b, n).toMatch(new RegExp(`p2:owner_recovery:' \\|\\| ${v}::text`));
    }
    const begin = fnBody('public', 'rpc_staff_begin_factor_removal');
    expect(begin).toMatch(/w\.user_id = p_owner_user_id and w\.kind = 'recovery'/);
    expect(begin).toMatch(/r\.id = v_w\.request_id and r\.status = 'pending'/);
    const init = fnBody('public', 'rpc_staff_initiate_owner_recovery');
    expect(init).toMatch(/e\.id = p_exception_id and e\.user_id = p_owner_user_id/);
  });
  it('operators can never act on themselves and staff are never recovery targets', () => {
    for (const n of ['rpc_staff_authorize_extra_recovery_window', 'rpc_staff_request_stranded_exception', 'rpc_staff_begin_factor_removal', 'rpc_staff_authorize_owner_mfa_window']) {
      expect(fnBody('public', n), n).toMatch(/p_owner_user_id = v_actor/);
    }
    expect(fnBody('private', 'guard_owner_recovery_exception_insert')).toMatch(/a staff member cannot be a recovery target/);
    expect(fnBody('private', 'guard_owner_recovery_request_insert')).toMatch(/a staff member cannot be a recovery target/);
  });
  it('the owner cancellation lock lifts only for a state that is KNOWN not to be intact; an unknown state keeps it (fail closed)', () => {
    expect(fnBody('public', 'rpc_owner_recovery_request')).toMatch(/private\.owner_factor_state\(v_actor\) in \('approved', 'unknown'\) then/);
    expect(fnBody('public', 'rpc_staff_initiate_owner_recovery')).toMatch(/if v_state = 'unknown' or not private\.owner_has_history\(p_owner_user_id\) then/);
  });
  it('the owner-side RPCs act only on the caller (auth.uid) and never read an exception or an order', () => {
    for (const n of ['rpc_owner_claim_factor', 'rpc_owner_recovery_cancel', 'rpc_owner_recovery_request', 'rpc_owner_open_factor_window']) {
      const b = fnBody('public', n);
      expect(b, n).toMatch(/\(select auth\.uid\(\)\)/);
      expect(b, n).not.toMatch(/owner_factor_removal_orders|owner_recovery_exceptions/);
    }
  });
  it('MFA is never bypassed: the factor gate still needs a verified TOTP of this user created inside the window as the only verified factor; recovery objects are never read by the decision functions', () => {
    const t = fnBody('private', 'guard_owner_mfa_factor_insert');
    for (const re of [/factor was not created inside the enrolment window/, /another verified factor exists/, /factor is not verified/, /only TOTP factors may be approved/, /enrolment window is revoked/, /enrolment window is already consumed/,
      /target is not an active organization owner/, /the authorizer of this recovery window is no longer an active operator/, /the recovery request of this window is not usable/]) expect(t).toMatch(re);
    expect(t).toMatch(/exists \(select 1 from unnest\(v_ids\) as i\(fid\) where i\.fid <> new\.factor_id\)/);
    expect(noComments).not.toMatch(/insert\s+into\s+private\.owner_mfa_factors[^;]*select\b/i);
  });
});
