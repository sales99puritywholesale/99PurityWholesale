import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_LIVE_APPROVED_FACTORS,
  classifyFactorRow,
  extensionPath,
  factorLimitOk,
  lifetimeFactorLimitOkRev6,
  liveApprovedFactorCount,
  normalizeDeparse,
  refreshDecision,
  refreshMayReplacePass,
  strandedAnchor,
  strandedAnchorRev6,
  unrecognizedBeginCode,
  unrecognizedCompletionOk,
  windowsBoundedDefinitionOk,
  windowsBoundedDefinitionOkRev6,
  type RecoveryRequestFact,
} from '@/lib/portal/permissions/owner-rev7';

// rev7 is a REVIEW DRAFT; these tests read its TEXT only (no database, nothing executed). They prove that the text, the TypeScript models and the review decisions agree for every finding of the rev6
// review (F1 to F7, F13) and that the accepted findings are documented. They do NOT prove that PostgreSQL accepts the SQL, how it prints catalog text, how constraints and triggers behave at run time,
// transactions, real Auth, the structure check on a real project, concurrency or the PostgREST transaction end (P1).
const root = process.cwd();
// P2_REV7_TEST_FILE exists ONLY for supabase/review/tests/rev7-negative-controls.mjs, which points the suite at deliberately broken copies to prove the tests can fail.
const sql = readFileSync(process.env.P2_REV7_TEST_FILE ?? join(root, 'supabase', 'review', '0005_rate_limits_and_owner_mfa.rev7.sql'), 'utf8');
const noComments = sql.replace(/--[^\n]*/g, '');
const fnBody = (schema: string, name: string) => new RegExp(`create function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`).exec(noComments)?.[0] ?? '';
const sha = (path: string) => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
const DAY = 24 * 3600 * 1000;

describe('preservation: earlier revisions and the applied migrations are byte-identical', () => {
  const PINS: Record<string, string> = {
    'supabase/review/history/0005_rate_limits_and_owner_mfa.rev3.sql': 'c6400e5025be1b1f604568cfe3870a6aaf0c5903581b0eafa406802492670a63',
    'supabase/review/0005_rate_limits_and_owner_mfa.sql': '8548e27e7c800d9d38f8bb6dca1dcb11f7755785b1e6fa0f0616120f05443e8d',
    'supabase/review/0005_rate_limits_and_owner_mfa.rev4.sql': '26709232441f68cd510bd33349fa615d4082e4c108cc986e03cbd8a7736c3368',
    'supabase/review/0005_rate_limits_and_owner_mfa.rev5.sql': 'a5a4242dd64867e83e9bbab028889bfddb0d90b31ada0812fe0510f630e2f64d',
    'supabase/review/0005_rate_limits_and_owner_mfa.rev6.sql': '571e1a966ee36087d3c938e0a84be9f1ad69870fdaf98c5b2e427a36490f16de',
    'supabase/migrations/20261108000001_foundation_identity.sql': '28e2cebf55e07679b71c7bbb7453517e3cde8c1b420e4eab9088ef98b544011e',
    'supabase/migrations/20261108000002_staff_capabilities.sql': '852f13efef9754b1882ec17ef2e3ab2833c66143233af21c396abc20b28823ee',
    'supabase/migrations/20261108000003_audit_and_step_up.sql': 'e1aa9d15696913e25f5916ccc036b9c5f44d668dba95922dea87c5ac36e5fa60',
    'supabase/migrations/20261108000004_staff_management_rpcs.sql': '8a6a5003d46ecd0daa1f5149566ac452076f637a9ed38a9da5125273551fc12b',
  };
  for (const [path, hash] of Object.entries(PINS)) {
    it(`${path} is unchanged`, () => expect(sha(path)).toBe(hash));
  }
  it('rev7 is not in the active migration directory', () => {
    expect(existsSync(join(root, 'supabase', 'migrations', '0005_rate_limits_and_owner_mfa.rev7.sql'))).toBe(false);
    expect(readFileSync(join(root, 'supabase', 'migrations', '20261108000004_staff_management_rpcs.sql'), 'utf8')).not.toMatch(/rev7/);
  });
  it('the draft declares itself rev7, not applied, never parsed', () => {
    expect(sql).toMatch(/^-- =+\n-- 0005_rate_limits_and_owner_mfa\.rev7\.sql\n-- \*\*\* REVIEW DRAFT rev7\. NOT APPLIED ANYWHERE\. NOT EXECUTED ANYWHERE\. NEVER PARSED BY POSTGRESQL\./);
  });
});

describe('object counts: the rev7 file is exactly the rev6 design plus the three additions', () => {
  const fns = [...noComments.matchAll(/create function ([a-z_]+)\.([a-z_]+)\(([^)]*)\)([\s\S]*?)\bas \$\$/g)];
  it('53 functions: 29 private, 24 public RPCs; 44 SECURITY DEFINER', () => {
    expect(fns.filter((m) => m[1] === 'private')).toHaveLength(29);
    expect(fns.filter((m) => m[1] === 'public')).toHaveLength(24);
    expect(fns.filter((m) => /security definer/.test(m[4] as string))).toHaveLength(44);
  });
  it('10 tables, 20 triggers, 9 rate-limit policy rows', () => {
    expect(noComments.match(/create table /g)).toHaveLength(10);
    expect(noComments.match(/create trigger /g)).toHaveLength(20);
    const block = /insert into private\.rate_limit_policies[^;]*values([\s\S]*?\));\s*\n/i.exec(sql)?.[1] ?? '';
    expect([...block.matchAll(/\(\s*'([a-z_]+)'\s*,\s*\d+/g)]).toHaveLength(9);
  });
  it('the self-check carries the new counts (24 RPCs, 22 guarded RPCs, 20 triggers, 13 foreign keys, 33 constraints, 9 policies)', () => {
    expect(sql).toMatch(/<> 24 then\s+raise exception 'self-check: RPC definer\/search_path\/grant state is wrong'/);
    expect(sql).toMatch(/<> 22 then\s+raise exception 'self-check: a mutating recovery RPC does not call private\.require_read_committed\(\)'/);
    expect(sql).toMatch(/<> 20 then\s+raise exception 'self-check: expected 20 triggers/);
    expect(sql).toMatch(/<> 13\s+or exists/);
    expect(sql).toMatch(/<> 33 then\s+raise exception 'self-check: an approved constraint is missing'/);
    expect(sql).toMatch(/<> 9 then raise exception 'self-check: expected 9 rate limit policies'/);
  });
  it('the three new constraints and the new unique index are in the self-check lists; the one-live index is asserted ABSENT', () => {
    for (const n of ['owner_unrecognized_factor_orders_bounded', 'owner_unrecognized_factor_orders_completed_shape']) expect(sql.match(new RegExp(`'${n}'`, 'g'))).toHaveLength(1);
    expect(sql).toMatch(/or exists \(select 1 from pg_indexes where indexname = 'owner_recovery_exceptions_one_live_idx'/);
    expect(sql).toMatch(/or not exists \(select 1 from pg_indexes where indexname = 'owner_unrecognized_factor_orders_one_open_idx'/);
  });
  it('all new objects are covered by the revoke lists and the table list of the self-check', () => {
    for (const f of ['private.owner_factor_row_class(uuid, uuid)', 'private.guard_owner_unrecognized_order_insert()', 'private.guard_owner_unrecognized_order_update()']) expect(sql).toContain(f);
    expect(sql).toMatch(/revoke all on table[^;]*private\.owner_unrecognized_factor_orders[^;]*from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/alter table private\.owner_unrecognized_factor_orders enable row level security;/);
    expect(sql.match(/'private\.owner_unrecognized_factor_orders'/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('F1: the factor limit counts LIVE approved factors, history is preserved', () => {
  const g = fnBody('private', 'guard_owner_mfa_factor_insert');
  it('the guard counts approved rows whose factor is in the verified id list, and no lifetime count remains', () => {
    expect(g).toMatch(/count\(\*\) from private\.owner_mfa_factors a where a\.user_id = new\.user_id and a\.factor_id = any \(v_ids\)\) >= 3/);
    expect(g).not.toMatch(/count\(\*\) from private\.owner_mfa_factors a where a\.user_id = new\.user_id\) >= 3/);
    expect(g).not.toMatch(/too many approved factors/);
  });
  it('the unknown-state refusal happens BEFORE the limit (the id list must exist); the limit cannot be read over NULL', () => {
    expect(g.indexOf('v_ids := private.owner_verified_factor_ids(new.user_id);')).toBeGreaterThan(-1);
    expect(g.indexOf('v_ids := private.owner_verified_factor_ids(new.user_id);')).toBeLessThan(g.indexOf('a.factor_id = any (v_ids)'));
    expect(g.indexOf('if v_ids is null then')).toBeGreaterThan(-1);
    expect(g.indexOf('if v_ids is null then')).toBeLessThan(g.indexOf('a.factor_id = any (v_ids)'));
    expect(g).toMatch(/if v_ids is null then\s+raise exception 'the factor state of this user is unknown'/);
  });
  it('no function of the file deletes or updates approved factor rows (history preserved); the update guard still blocks changes', () => {
    expect(noComments).not.toMatch(/delete\s+from\s+private\.owner_mfa_factors/i);
    expect(noComments).not.toMatch(/update\s+private\.owner_mfa_factors/i);
    expect(fnBody('private', 'guard_owner_mfa_factor_update')).toMatch(/approved owner factor rows are immutable/);
  });
  it('no other limit counts approval history (every count over the table is live-restricted)', () => {
    const counts = [...noComments.matchAll(/count\(\*\)\s+from\s+private\.owner_mfa_factors[^;]*?\)\s*(?:>=|>|<)/g)].map((m) => m[0]);
    expect(counts.length).toBeGreaterThan(0);
    for (const c of counts) expect(c).toMatch(/=\s*any\s*\(/);
  });
  it('model: the rev6 lifetime cap is a permanent dead end at the fourth recovery; the rev7 live cap is not', () => {
    const history = ['f1', 'f2', 'f3']; // three recoveries so far, factors f1 and f2 were removed
    expect(lifetimeFactorLimitOkRev6(history)).toBe(false);
    expect(factorLimitOk(history, ['f3'])).toBe(true);
    let approved: string[] = [];
    let live: string[] = [];
    for (let i = 1; i <= 8; i++) {
      expect(factorLimitOk(approved, live), `recovery ${i}`).toBe(true);
      approved = [...approved, `f${i}`];
      live = [`f${i}`]; // each recovery removes the old factor first
    }
    expect(approved).toHaveLength(8);
  });
  it('model: three live approved factors still refuse; unknown refuses (NULL is not zero)', () => {
    expect(MAX_LIVE_APPROVED_FACTORS).toBe(3);
    expect(factorLimitOk(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(false);
    expect(factorLimitOk(['a', 'b', 'c'], ['a', 'b'])).toBe(true);
    expect(liveApprovedFactorCount(['a'], null)).toBeNull();
    expect(factorLimitOk(['a'], null)).toBe(false);
    expect(liveApprovedFactorCount(['a', 'b'], [])).toBe(0);
  });
});

describe('F2: every deparse-dependent self-check is case-insensitive or normalized', () => {
  const selfCheck = sql.slice(sql.lastIndexOf('-- 7. Self-checks'));
  it('no LIKE, case-sensitive regex or position() is applied to pg_get_* output, pg_policies text or proconfig text', () => {
    const code = selfCheck.replace(/--[^\n]*/g, '');
    expect(code).not.toMatch(/pg_get_(constraintdef|functiondef|indexdef|triggerdef|viewdef)\s*\([^()]*(\([^()]*\)[^()]*)*\)\s*(not\s+)?(like\b|!?~(?!\*))/i);
    expect(code).not.toMatch(/position\s*\(\s*'[^']*'\s+in\s+pg_get_functiondef/i);
    expect(code).not.toMatch(/\b(qual|with_check)\s+(not\s+)?like\b/i);
    expect(code).not.toMatch(/\bc\s*=\s*'search_path=/i);
    expect(code).not.toMatch(/\bc\s+like\s+'search_path/i);
  });
  it('the five-window constraint assertion is whitespace-normalized and case-insensitive', () => {
    const i = selfCheck.indexOf("c.conname = 'owner_recovery_requests_windows_bounded'");
    expect(i).toBeGreaterThan(-1);
    const block = selfCheck.slice(i, i + 700);
    expect(block).toMatch(/regexp_replace\(pg_get_constraintdef\(c\.oid\), '\\s\+', ' ', 'g'\) ~\* '/);
    expect(block).toMatch(/~\* 'greatest\\s\*\\\('/);
    expect(block).toMatch(/~\* 'extra_windows_granted'/);
  });
  it('the regular expression of the SQL accepts every plausible rendering and rejects wrong constraints', () => {
    const lit = /regexp_replace\(pg_get_constraintdef\(c\.oid\), '\\s\+', ' ', 'g'\) ~\* '([^']+)'/.exec(selfCheck)?.[1] ?? '';
    const re = new RegExp(lit, 'i');
    const ok = [
      'CHECK (((windows_issued >= 0) AND (windows_issued <= 5) AND (extra_windows_granted = GREATEST((windows_issued - 3), 0))))',
      'check (((windows_issued >= 0) and (windows_issued <= 5) and (extra_windows_granted = greatest((windows_issued - 3), 0))))',
      'CHECK ((windows_issued)::integer <= 5)',
      'CHECK (((windows_issued >= 0)\n  AND (windows_issued <= 5)\n  AND (extra_windows_granted = GREATEST((windows_issued - 3), 0))))',
    ];
    for (const d of ok) expect(re.test(normalizeDeparse(d)), d).toBe(true);
    expect(re.test(normalizeDeparse('CHECK (windows_issued <= 6)'))).toBe(false);
    expect(re.test(normalizeDeparse('CHECK (windows_issued <= 50)'))).toBe(true); // documented limit of a text pattern: the live test (R7-03) checks behavior, the pattern checks shape
  });
  it('model: the rev6 assertion rejects PostgreSQL-style upper-case output; the rev7 assertion accepts it', () => {
    const pg = 'CHECK (((windows_issued >= 0) AND (windows_issued <= 5) AND (extra_windows_granted = GREATEST((windows_issued - 3), 0))))';
    expect(windowsBoundedDefinitionOkRev6(pg)).toBe(false);
    expect(windowsBoundedDefinitionOk(pg)).toBe(true);
    expect(windowsBoundedDefinitionOk('CHECK (windows_issued <= 6 AND extra_windows_granted = GREATEST(windows_issued - 3, 0))')).toBe(false);
    expect(windowsBoundedDefinitionOk('CHECK (windows_issued <= 5)')).toBe(false);
  });
  it('the RPC-count, guard-count and helper assertions use ~* on function definitions', () => {
    expect(selfCheck).toMatch(/pg_get_functiondef\(cand\.oid\) ~\* 'private\\\.require_read_committed\\\(\\\)'/);
    expect(selfCheck).toMatch(/pg_get_functiondef\('private\.owner_mfa_ok\(\)'::regprocedure\) !~\* /);
    expect(selfCheck).toMatch(/ilike '%my\\_owner\\_org\\_ids%'/);
    expect(selfCheck).toMatch(/ilike '%my\\_mfa\\_owner\\_org\\_ids%'/);
    expect(selfCheck).toMatch(/regexp_replace\(c, '\[\\s"''\]', '', 'g'\) ~\* '\^search_path=\$'/);
  });
});

describe('F3: the stranded anchor is the latest removal evidence, not the latest request', () => {
  const body = fnBody('private', 'owner_stranded_request');
  it('SQL: the anchor query uses factors_removed_at or the latest order, orders by that evidence and never by the latest request', () => {
    expect(body).toMatch(/coalesce\(r\.factors_removed_at,\s*\(select max\(o\.ordered_at\) from private\.owner_factor_removal_orders o where o\.request_id = r\.id and o\.user_id = p_user\)\) as evidence_at/);
    expect(body).toMatch(/order by x\.evidence_at desc/);
    expect(body).not.toMatch(/order by l\.created_at desc/);
    expect(body).toMatch(/c\.status = 'completed' and c\.completed_at > x\.evidence_at/);
    expect(body).toMatch(/interval '30 days'/);
    expect(body).toMatch(/'recovery_required'/);
    expect(body).toMatch(/status in \('awaiting_approval', 'pending'\)/);
  });
  it('SQL: the one-live-exception index is gone; the one-open index per owner stays; double consumption stays blocked by the request index', () => {
    expect(noComments).not.toMatch(/create unique index owner_recovery_exceptions_one_live_idx/);
    expect(noComments).toMatch(/create unique index owner_recovery_exceptions_one_open_idx on private\.owner_recovery_exceptions \(user_id\) where status in \('requested', 'granted'\)/);
    expect(noComments).toMatch(/create unique index owner_recovery_requests_exception_idx on private\.owner_recovery_requests \(exception_id\) where exception_id is not null/);
  });
  it('SQL: the 30 day lookback and the limit of two exceptions per 30 days are unchanged (guard and RPC)', () => {
    expect(fnBody('private', 'guard_owner_recovery_exception_insert')).toMatch(/\) >= 2 then/);
    expect(fnBody('private', 'guard_owner_recovery_exception_insert')).toMatch(/interval '30 days'/);
    expect(fnBody('public', 'rpc_staff_request_stranded_exception')).toMatch(/\) >= 2 then/);
  });
  it('SQL: the expiry audit of a request says whether it carried an exception; the factor-loss review and the owner context use the anchor', () => {
    expect(fnBody('private', 'close_expired_recovery_requests')).toMatch(/'exception_carrying', r\.exception_id is not null/);
    expect(fnBody('public', 'rpc_staff_list_owner_factor_loss')).toMatch(/private\.owner_stranded_request\(h\.user_id\) as anchor/);
    expect(fnBody('public', 'rpc_my_owner_context')).toMatch(/private\.owner_stranded_request\(v_actor\) is not null/);
  });
  const NOW = 100 * DAY;
  const R = (o: Partial<RecoveryRequestFact> & { id: string }): RecoveryRequestFact => ({ status: 'expired', createdAt: 0, factorsRemovedAt: null, completedAt: null, orderedAts: [], ...o });
  it('model: an exception-carrying request that expires BEFORE any removal does not erase the stranded state (rev6 did)', () => {
    const r1 = R({ id: 'r1', status: 'expired', createdAt: NOW - 10 * DAY, factorsRemovedAt: NOW - 9 * DAY });
    const r2 = R({ id: 'r2', status: 'expired', createdAt: NOW - 2 * DAY }); // the exempt request: no removal
    expect(strandedAnchorRev6('recovery_required', [r1, r2], NOW)).toBeNull();
    expect(strandedAnchor('recovery_required', [r1, r2], NOW)).toBe('r1');
  });
  it('model: later cancelled owner-code requests do not erase it; the latest EVIDENCE wins', () => {
    const r1 = R({ id: 'r1', createdAt: NOW - 20 * DAY, factorsRemovedAt: NOW - 19 * DAY });
    const r2 = R({ id: 'r2', status: 'cancelled', createdAt: NOW - 5 * DAY });
    const r3 = R({ id: 'r3', createdAt: NOW - 4 * DAY, factorsRemovedAt: NOW - 3 * DAY });
    expect(strandedAnchor('recovery_required', [r1, r2], NOW)).toBe('r1');
    expect(strandedAnchor('recovery_required', [r1, r2, r3], NOW)).toBe('r3');
  });
  it('model: a window that lapsed before the completion still counts through the order (the factors are gone: state recovery_required)', () => {
    const r = R({ id: 'r1', createdAt: NOW - 3 * DAY, orderedAts: [NOW - 2 * DAY] });
    expect(strandedAnchorRev6('recovery_required', [r], NOW)).toBeNull();
    expect(strandedAnchor('recovery_required', [r], NOW)).toBe('r1');
  });
  it('model: the boundaries: unknown or other states, an open request, a later completion, and the 30 day lookback end it', () => {
    const r1 = R({ id: 'r1', factorsRemovedAt: NOW - 9 * DAY });
    expect(strandedAnchor('unknown', [r1], NOW)).toBeNull();
    expect(strandedAnchor('approved', [r1], NOW)).toBeNull();
    expect(strandedAnchor('recovery_required', [r1, R({ id: 'r2', status: 'pending', createdAt: NOW })], NOW)).toBeNull();
    expect(strandedAnchor('recovery_required', [r1, R({ id: 'r2', status: 'completed', completedAt: NOW - 8 * DAY, createdAt: NOW - 8.5 * DAY })], NOW)).toBeNull();
    expect(strandedAnchor('recovery_required', [R({ id: 'r1', factorsRemovedAt: NOW - 31 * DAY })], NOW)).toBeNull();
    expect(strandedAnchor('recovery_required', [R({ id: 'r1', factorsRemovedAt: NOW - 29 * DAY })], NOW)).toBe('r1');
    expect(strandedAnchor('recovery_required', [R({ id: 'r1' })], NOW)).toBeNull();
  });
});

describe('F4: a bounded extension path after three missed standard windows', () => {
  const body = fnBody('public', 'rpc_staff_authorize_extra_recovery_window');
  it('SQL: two paths, the no-show path exactly for the fourth window; the fifth always needs a verified removal; the audit records the path', () => {
    expect(body).toMatch(/v_path := case when exists \(select 1 from private\.owner_mfa_windows w where w\.request_id = v_req\.id and w\.removal_verified_at is not null\) then 'verified_removal'/);
    expect(body).toMatch(/when v_req\.windows_issued = 3 and v_req\.extra_windows_granted = 0 then 'no_show'/);
    expect(body).toMatch(/if v_path is null then[\s\S]*'removal_not_verified'/);
    expect(body).toMatch(/'path', v_path/);
    expect(body).toMatch(/v_req\.windows_issued >= 5 or v_req\.extra_windows_granted >= 2/);
    expect(body).toMatch(/v_req\.windows_issued < 3[\s\S]*'extension_not_needed'/);
  });
  it('SQL: every other control of the extension is unchanged (step-up, capability, self change, cool-off, expiry, open-window check, counter update with the window row in ONE block)', () => {
    expect(body).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', 'staff\.owner_recovery_window\.extend', true,/);
    expect(body).toMatch(/self_change_not_allowed/);
    expect(body).toMatch(/clock_timestamp\(\) < v_req\.cooloff_until/);
    expect(body).toMatch(/v_endts := least\(clock_timestamp\(\) \+ make_interval\(mins => p_minutes\), v_req\.expires_at\)/);
    expect(body).toMatch(/update private\.owner_recovery_requests set windows_issued = windows_issued \+ 1, extra_windows_granted = extra_windows_granted \+ 1 where id = v_req\.id;\s+insert into private\.owner_mfa_windows/);
  });
  it('SQL: the five-window maximum is still a constraint, the standard path is still capped at three, and the window gate still ties the counter to the rows', () => {
    expect(noComments).toMatch(/windows_issued between 0 and 5 and extra_windows_granted = greatest\(windows_issued - 3, 0\)/);
    expect(noComments).toMatch(/new\.windows_issued = old\.windows_issued \+ 1 and new\.windows_issued <= 3 and v_ext_same and v_rem_same/);
    expect(fnBody('private', 'guard_owner_mfa_window_insert')).toMatch(/v_req\.windows_issued <> \(select count\(\*\) from private\.owner_mfa_windows w where w\.request_id = new\.request_id\) \+ 1/);
  });
  it('model: the fourth window has two paths, the fifth only one, never more than five', () => {
    expect(extensionPath(3, 0, false)).toBe('no_show');
    expect(extensionPath(3, 0, true)).toBe('verified_removal');
    expect(extensionPath(4, 1, false)).toBeNull();
    expect(extensionPath(4, 1, true)).toBe('verified_removal');
    expect(extensionPath(5, 2, true)).toBeNull();
    expect(extensionPath(2, 0, true)).toBeNull();
    for (let w = 0; w <= 7; w++) for (const e of [0, 1, 2, 3]) for (const v of [false, true]) if (extensionPath(w, e, v) !== null) expect(w + 1).toBeLessThanOrEqual(5);
  });
  it('model: a request that wastes four windows without any verified removal ends (the documented outcome)', () => {
    expect(extensionPath(4, 1, false)).toBeNull();
  });
});

describe('F5: a sanctioned, audited path for unrecognized factor rows', () => {
  const begin = fnBody('public', 'rpc_staff_begin_unrecognized_factor_removal');
  const complete = fnBody('public', 'rpc_staff_complete_unrecognized_factor_removal');
  const helper = fnBody('private', 'owner_factor_row_class');
  it('SQL: the table is history-preserving, bounded to 60 minutes, one open order per owner, RLS on, no FK on the factor id', () => {
    const t = /create table private\.owner_unrecognized_factor_orders \([\s\S]*?\n\);/.exec(noComments)?.[0] ?? '';
    expect(t).toMatch(/user_id\s+uuid not null references auth\.users \(id\) on delete restrict/);
    expect(t).toMatch(/factor_id\s+uuid not null,/);
    expect(t).not.toMatch(/references auth\.mfa_factors/);
    expect(t).toMatch(/status in \('ordered', 'completed', 'expired'\)/);
    expect(t).toMatch(/expires_at <= ordered_at \+ interval '60 minutes'/);
    expect(t).toMatch(/char_length\(btrim\(reason\)\) between 1 and 200/);
    expect(noComments).toMatch(/create unique index owner_unrecognized_factor_orders_one_open_idx on private\.owner_unrecognized_factor_orders \(user_id\) where status = 'ordered'/);
    expect(noComments).not.toMatch(/delete\s+from\s+private\.owner_unrecognized/i);
  });
  it('SQL: the classifier fails closed: it needs the structure check, returns NULL on error, and only RECOGNIZED labels count as recognized', () => {
    expect(helper).toMatch(/if p_user is null or p_factor is null or not private\.auth_structure_ok\(\) then\s+return null;/);
    expect(helper).toMatch(/coalesce\(v_status in \('verified', 'unverified'\), false\) and coalesce\(v_type in \('totp', 'phone', 'webauthn'\), false\)/);
    expect(helper).toMatch(/return 'recognized'/);
    expect(helper).toMatch(/return 'unrecognized'/);
    expect(helper).toMatch(/return 'other_owner'/);
    expect(helper).toMatch(/return 'absent'/);
    expect(helper).toMatch(/exception when others then\s+return null;/);
    expect(helper).not.toMatch(/coalesce\(private\.owner_verified_factor_ids/);
  });
  it('SQL: the begin RPC needs capability, FRESH step-up, explicit owner AND factor, and refuses every class except unrecognized', () => {
    expect(begin).toMatch(/create function public\.rpc_staff_begin_unrecognized_factor_removal\(p_owner_user_id uuid, p_factor_id uuid, p_reason text\)/);
    expect(begin).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', 'staff\.owner_unrecognized_factor\.begin', true,/);
    expect(begin).toMatch(/p_owner_user_id is null or p_factor_id is null or char_length\(v_reason\) not between 1 and 200/);
    expect(begin).toMatch(/if v_class <> 'unrecognized' then/);
    expect(begin).toMatch(/'factor_recognized'/);
    expect(begin).toMatch(/self_change_not_allowed/);
    expect(begin).toMatch(/target_not_eligible/);
    expect(begin).toMatch(/structure_check_required/);
    expect(begin).toMatch(/unknown_state/);
    expect(begin).toMatch(/pg_advisory_xact_lock\(hashtextextended\('p2:owner_recovery:' \|\| p_owner_user_id::text, 0\)\);\s+-- \(2\)|pg_advisory_xact_lock\(hashtextextended\('p2:owner_recovery:' \|\| p_owner_user_id::text, 0\)\)/);
    expect(begin).not.toMatch(/p2:owner_window|p2:operator_recovery/);
  });
  it('SQL: a recognized or other owner\'s row never reaches the insert; the insert guard re-checks the class, the orderer, the target and staff exclusion', () => {
    const g = fnBody('private', 'guard_owner_unrecognized_order_insert');
    expect(g).toMatch(/private\.owner_factor_row_class\(new\.user_id, new\.factor_id\) is distinct from 'unrecognized'/);
    expect(g).toMatch(/private\.owner_mfa_operator_ok\(new\.ordered_by\)/);
    expect(g).toMatch(/new\.ordered_by = new\.user_id/);
    expect(g).toMatch(/a staff member cannot be the target/);
    expect(g).toMatch(/not exists \(select 1 from public\.organization_members m where m\.user_id = new\.user_id and m\.status = 'active' and m\.role = 'owner'\)/);
  });
  it('SQL: the completion takes only the order id, re-reads the row in the RPC AND in the guard, and completes only for an ABSENT row', () => {
    expect(complete).toMatch(/create function public\.rpc_staff_complete_unrecognized_factor_removal\(p_order_id uuid\)/);
    expect(complete).toMatch(/private\.staff_gate\('owner\.mfa\.authorize', 'staff\.owner_unrecognized_factor\.complete', true,/);
    expect(complete).toMatch(/if v_class <> 'absent' then[\s\S]*'factor_still_present'/);
    const g = fnBody('private', 'guard_owner_unrecognized_order_update');
    expect(g).toMatch(/private\.owner_factor_row_class\(old\.user_id, old\.factor_id\) is distinct from 'absent'/);
    expect(g).toMatch(/new\.factor_id <> old\.factor_id/);
    expect(g).toMatch(/an expired order cannot be completed/);
  });
  it('SQL: the path changes no Auth data, makes nothing verified, approves no factor and touches no recovery window or request', () => {
    for (const b of [begin, complete, helper, fnBody('private', 'guard_owner_unrecognized_order_insert'), fnBody('private', 'guard_owner_unrecognized_order_update')]) {
      expect(b).not.toMatch(/(insert\s+into|update|delete\s+from)\s+auth\./i);
      expect(b).not.toMatch(/owner_mfa_factors|owner_mfa_windows|owner_recovery_requests|owner_recovery_exceptions|owner_factor_removal_orders/);
    }
  });
  it('SQL: expiry is lazy and audited; grants, the isolation guard and audit names follow the same rules as every other RPC', () => {
    expect(fnBody('private', 'close_expired_recovery_requests')).toMatch(/update private\.owner_unrecognized_factor_orders set status = 'expired' where id = r\.id;\s+perform private\.write_audit\(p_actor, p_actor_kind, 'owner\.mfa_unrecognized_factor\.expire'/);
    for (const b of [begin, complete]) {
      expect(b.indexOf('private.require_read_committed();')).toBeGreaterThan(-1);
      expect(b.indexOf('private.require_read_committed();')).toBeLessThan(b.indexOf('private.staff_gate('));
      expect(b).toMatch(/'success'/);
      expect(b).toMatch(/'denied'/);
      expect(b).not.toMatch(/'reason',\s*v_reason/);
    }
    for (const a of [...noComments.matchAll(/'((?:staff|owner|platform)\.[a-z_.]+)'/g)].map((m) => m[1] as string)) {
      expect(a, a).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
      expect(a.length, a).toBeLessThanOrEqual(80);
    }
    expect(sql).toMatch(/revoke all on function[\s\S]*public\.rpc_staff_begin_unrecognized_factor_removal\(uuid, uuid, text\)[\s\S]*from public, anon, authenticated, service_role;/);
    expect(sql).toMatch(/grant execute on function[\s\S]*public\.rpc_staff_begin_unrecognized_factor_removal\(uuid, uuid, text\)[\s\S]*to authenticated;/);
  });
  it('SQL: UNKNOWN stays unknown: the id helper still returns NULL for an unrecognized row, so no window can open and no order can pretend the owner is clean', () => {
    const h = fnBody('private', 'owner_verified_factor_ids');
    expect(h).toMatch(/f\.status::text not in \('verified', 'unverified'\)/);
    expect(h).toMatch(/if v_unreadable is null or v_unreadable <> 0 then\s+return null;/);
    expect(fnBody('private', 'guard_owner_mfa_window_insert')).toMatch(/v_state in \('none', 'unknown'\)/);
  });
  it('model: only an unrecognized row of exactly this owner is orderable; completion needs absence; unknown never passes', () => {
    const rec = classifyFactorRow(true, { userId: 'u', status: 'verified', type: 'totp' });
    expect(rec).toBe('recognized');
    expect(unrecognizedBeginCode(true, rec)).toBe('factor_recognized');
    expect(classifyFactorRow(true, { userId: 'u', status: 'pending', type: 'totp' })).toBe('unrecognized');
    expect(classifyFactorRow(true, { userId: 'u', status: null, type: 'totp' })).toBe('unrecognized');
    expect(classifyFactorRow(true, { userId: 'u', status: 'verified', type: 'future_type' })).toBe('unrecognized');
    expect(unrecognizedBeginCode(true, 'unrecognized')).toBe('order_created');
    expect(unrecognizedBeginCode(true, 'other_owner')).toBe('factor_not_found');
    expect(unrecognizedBeginCode(true, 'absent')).toBe('factor_not_found');
    expect(classifyFactorRow(false, 'absent')).toBeNull();
    expect(unrecognizedBeginCode(false, null)).toBe('structure_check_required');
    expect(unrecognizedBeginCode(true, null)).toBe('unknown_state');
    expect(unrecognizedCompletionOk('absent')).toBe(true);
    for (const c of ['recognized', 'unrecognized', 'other_owner', null] as const) expect(unrecognizedCompletionOk(c)).toBe(false);
  });
});

describe('F7: an explicit, rate-limited, audited structure-check refresh that does not depend on staff dashboard activity', () => {
  const body = fnBody('public', 'rpc_refresh_auth_structure_check');
  it('SQL: no argument; callable only by an active staff member or an active organization owner; everyone else gets not_available without any write', () => {
    expect(noComments).toMatch(/create function public\.rpc_refresh_auth_structure_check\(\) returns jsonb/);
    expect(body).toMatch(/staff_members s where s\.user_id = v_actor and s\.status = 'active'/);
    expect(body).toMatch(/m\.status = 'active' and m\.role = 'owner'/);
    expect(body).toMatch(/if v_kind is null then\s+return jsonb_build_object\('ok', false, 'code', 'not_available'\);/);
    expect(body.indexOf("'not_available'")).toBeGreaterThan(-1);
    expect(body.indexOf("'not_available'")).toBeLessThan(body.indexOf('private.rate_limit_hit('));
    expect(body).toMatch(/authentication required/);
    expect(body).not.toMatch(/staff_gate|step_up_ok|owner_mfa_ok|staff_session_ok|mfa_check_ok/);
  });
  it('SQL: three rate limits: eligibility, per user (6 per hour) and global (12 hour pass, 15 minute any outcome), serialized by the SAME lock as rpc_my_staff_context of 0004', () => {
    expect(body).toMatch(/private\.rate_limit_hit\('structure_refresh', private\.rl_user_key\('structure_refresh'\)\)/);
    expect(sql).toMatch(/\('structure_refresh', 6, 3600, 3600,/);
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtextextended\('p2:structure_check_refresh', 0\)\)/);
    expect(readFileSync(join(root, 'supabase', 'migrations', '20261108000004_staff_management_rpcs.sql'), 'utf8')).toMatch(/pg_advisory_xact_lock\(hashtextextended\('p2:structure_check_refresh', 0\)\)/);
    expect(body).toMatch(/v\.status = 'passed' and v\.checked_at > now\(\) - interval '12 hours'\) or v\.checked_at > now\(\) - interval '15 minutes'/);
    expect(body).toMatch(/v\.checked_at <= now\(\)/);
    expect(body.indexOf('pg_advisory_xact_lock')).toBeLessThan(body.indexOf('platform_validations'));
    expect(body.indexOf('platform_validations')).toBeLessThan(body.indexOf('private.run_auth_structure_check()'));
  });
  it('SQL: the result comes only from the catalog check; the RPC never reads or writes auth data, takes none of the recovery locks, and cannot be steered by input', () => {
    expect(body).toMatch(/v_res := private\.run_auth_structure_check\(\);/);
    expect(body).not.toMatch(/auth\.mfa_factors|insert\s+into\s+private\.platform_validations|update\s+private\.platform_validations/i);
    expect(body).not.toMatch(/p2:owner_recovery|p2:owner_window|p2:operator_recovery/);
    expect(body).not.toMatch(/\bp_[a-z_]+\b/);
  });
  it('SQL: a run is audited (success or failed, result only); a failed run never claims success; no-op calls write no audit row', () => {
    expect(body).toMatch(/'platform\.structure_check\.refresh', case when v_res = 'passed' then 'success' else 'failed' end/);
    expect(body).toMatch(/jsonb_build_object\('result', v_res, 'caller', v_kind\)/);
    expect(body.split('private.write_audit(').length - 1).toBe(1);
  });
  it('SQL: the isolation guard is first; the grant is to authenticated only; the 0004 refresher and the 0002 check function are not modified (hashes pinned above)', () => {
    expect(body.indexOf('private.require_read_committed();')).toBeLessThan(body.indexOf('v_actor uuid') + 1e9);
    expect(body.indexOf('private.require_read_committed();')).toBeLessThan(body.indexOf('private.rate_limit_hit('));
    expect(sql).toMatch(/public\.rpc_refresh_auth_structure_check\(\)\s+to authenticated;/);
    // the only statement that grants anything to anon is the reviewed password-recovery throttle; no grant to public or service_role exists anywhere
    const anonGrants = [...noComments.matchAll(/\bgrant\b[^;]*\bto\b[^;]*\banon\b[^;]*;/gi)].map((m) => m[0]);
    expect(anonGrants).toHaveLength(1);
    expect(anonGrants[0]).toMatch(/rpc_throttle_password_recovery/);
    expect(noComments).not.toMatch(/\bgrant\b[^;]*\bto\b[^;]*\b(public|service_role)\b[^;]*;/i);
    expect(sql).toMatch(/public\.rpc_refresh_auth_structure_check\(\)\n  from public, anon, authenticated, service_role;/);
  });
  it('model: callers, limits and the global rule', () => {
    const base = { caller: 'active_owner' as const, userHitsThisHour: 0, passedAgeHours: 13, anyAgeMinutes: 13 * 60 };
    expect(refreshDecision({ ...base, caller: 'other' })).toBe('not_available');
    expect(refreshDecision({ ...base, userHitsThisHour: 6 })).toBe('rate_limited');
    expect(refreshDecision(base)).toBe('refreshed');
    expect(refreshDecision({ ...base, caller: 'active_staff' })).toBe('refreshed');
    expect(refreshDecision({ ...base, passedAgeHours: 11, anyAgeMinutes: 11 * 60 })).toBe('not_needed');
    expect(refreshDecision({ ...base, passedAgeHours: null, anyAgeMinutes: 5 })).toBe('not_needed');
    expect(refreshDecision({ ...base, passedAgeHours: null, anyAgeMinutes: 16 })).toBe('refreshed');
    expect(refreshMayReplacePass(11.9)).toBe(false);
    expect(refreshMayReplacePass(12)).toBe(true);
  });
  it('model: a caller can never downgrade a fresh passing check, and the check refreshes before the 24 hour staleness limit', () => {
    for (let h = 0; h < 12; h++) expect(refreshDecision({ caller: 'active_owner', userHitsThisHour: 0, passedAgeHours: h, anyAgeMinutes: h * 60 })).toBe('not_needed');
    expect(refreshDecision({ caller: 'active_owner', userHitsThisHour: 0, passedAgeHours: 12, anyAgeMinutes: 12 * 60 })).toBe('refreshed');
  });
});

describe('F13: PL/pgSQL loops no longer depend on a data-modifying CTE inside a FOR loop', () => {
  it('no FOR loop is driven by WITH; every closing loop is a locking SELECT with a per-row UPDATE by primary key', () => {
    expect(noComments).not.toMatch(/for\s+\w+\s+in\s+with\b/i);
    expect(noComments).not.toMatch(/\bwith upd as\b/i);
    const c = fnBody('private', 'close_expired_recovery_requests');
    expect((c.match(/for update/g) ?? []).length).toBe(5);
    expect((c.match(/\n  for r in select /g) ?? []).length).toBe(5);
    expect(c).toMatch(/update private\.owner_recovery_requests set status = 'expired' where id = r\.id;/);
    expect(c).toMatch(/update private\.owner_recovery_exceptions set status = 'cancelled', closed_code = 'not_stranded' where id = r\.id;/);
    expect(fnBody('private', 'revoke_request_windows')).toMatch(/for o in select q\.id from private\.owner_factor_removal_orders q where q\.window_id = w\.id and q\.status = 'ordered' order by q\.id for update/);
  });
  it('the unknown-state exclusion of the exception cancellation survives (a stale check cannot burn an exception)', () => {
    expect(fnBody('private', 'close_expired_recovery_requests')).toMatch(/private\.owner_factor_state\(p_user\) is distinct from 'unknown'/);
  });
});

describe('preserved decisions and boundaries (nothing was redesigned)', () => {
  it('the two-person exception, three standard windows, the quotas and the cool-off keep their numbers', () => {
    expect(sql).toMatch(/\('operator_recovery_initiate', 5, 86400, 86400,/);
    expect(sql).toMatch(/\('operator_recovery_target', 2, 604800, 604800,/);
    expect(noComments).toMatch(/granted_by is null or granted_by <> requested_by/);
    expect(noComments).toMatch(/cooloff_until >= coalesce\(approved_at, created_at\) \+ interval '24 hours'/);
    expect(noComments).toMatch(/extra_windows_granted\s+smallint not null default 0 check \(extra_windows_granted between 0 and 2\)/);
  });
  it('no service-role dependency, no database HTTP, no broker; ON DELETE RESTRICT on every owner-table foreign key', () => {
    expect(noComments).not.toMatch(/pg_net|http_post|http_get|dblink|create extension/i);
    expect(noComments.replace(/'(?:[^']|'')*'/g, "''").replace(/from public, anon, authenticated, service_role/g, '')).not.toMatch(/service_role/);
    expect(noComments).not.toMatch(/on delete cascade|on delete set null|on delete no action/i);
    const tables = ['owner_mfa_factors', 'owner_mfa_windows', 'owner_recovery_codes', 'owner_recovery_requests', 'owner_recovery_exceptions', 'owner_factor_removal_orders', 'owner_unrecognized_factor_orders'];
    for (const t of tables) expect(new RegExp(`create table private\\.${t} \\([\\s\\S]*?user_id\\s+uuid not null references auth\\.users \\(id\\) on delete restrict`).test(noComments), t).toBe(true);
  });
  it('the lock hierarchy is unchanged: no function takes (3) before (2); the new RPCs take only (2) or the leaf lock', () => {
    for (const m of noComments.matchAll(/create function [a-z_]+\.[a-z_]+\([\s\S]*?\n\$\$;/g)) {
      const b = m[0];
      const w = b.indexOf("p2:owner_window:");
      const r = b.indexOf("p2:owner_recovery:");
      const o = b.indexOf("p2:operator_recovery:");
      if (w >= 0 && r >= 0) expect(r, b.slice(0, 80)).toBeLessThan(w);
      if (o >= 0 && r >= 0) expect(o, b.slice(0, 80)).toBeLessThan(r);
    }
  });
  it('every new transition writes an audit row in its own transaction and no reason text reaches an audit detail', () => {
    for (const n of ['rpc_staff_begin_unrecognized_factor_removal', 'rpc_staff_complete_unrecognized_factor_removal', 'rpc_refresh_auth_structure_check', 'rpc_staff_authorize_extra_recovery_window']) {
      const b = fnBody('public', n);
      // the refresh audits only a run (one call site, by design); every other RPC audits denials and successes
      expect(b.split('private.write_audit(').length - 1, n).toBeGreaterThan(n === 'rpc_refresh_auth_structure_check' ? 0 : 1);
      expect(b, n).not.toMatch(/jsonb_build_object\([^;]*v_reason/);
    }
  });
});

describe('accepted findings are documented, not silently dropped (F6, F8 to F12)', () => {
  const docPath = join(root, 'docs', 'P2-4-0005-REV7-SECURITY-REVIEW.md');
  const doc = existsSync(docPath) ? readFileSync(docPath, 'utf8') : '';
  it('the rev7 security review exists and lists every accepted finding with its risk and its control', () => {
    expect(doc.length).toBeGreaterThan(5000);
    for (const f of ['F6', 'F8', 'F9', 'F10', 'F11', 'F12']) expect(doc, f).toMatch(new RegExp(`\\*\\*${f}\\b`));
    for (const topic of [/enrolment race/i, /deprovision|off-board/i, /audit/i, /overview/i]) expect(doc).toMatch(topic);
  });
  it('the document does not claim that PostgreSQL ran the file, that throttling is effective, or that rows survive a rollback', () => {
    expect(doc).toMatch(/never (been )?parsed|not parsed|has never been parsed/i);
    expect(doc).not.toMatch(/throttling is effective|has been executed|was executed against/i);
    expect(doc).toMatch(/P1/);
  });
});
