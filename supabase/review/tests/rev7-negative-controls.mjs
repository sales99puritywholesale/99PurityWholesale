// OFFLINE negative controls for tests/portal/owner-rev7.test.ts and for the rev7 rules of supabase/review/static-check-p22.mjs. It never connects to anything and never reads an environment file.
// It writes deliberately BROKEN copies of the rev7 SQL draft into a scratch directory, points the test suite at each copy (P2_REV7_TEST_FILE) and requires the suite to FAIL for every one: a suite that
// cannot fail proves nothing. Section A reverts each fix of the rev6 review findings F1, F2, F3, F4, F5, F7 and F13 (the previous failures); section B tampers with preserved properties. Section C feeds
// the REV6 file, renamed so that the rev7 rules apply, to the static checker and requires the rev6 defects to be reported. The rev7 draft itself is never modified (sha256 verified before and after).
// Usage (project root, uppercase drive letter on Windows): node supabase/review/tests/rev7-negative-controls.mjs [scratchDir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const src = join(root, 'supabase', 'review', '0005_rate_limits_and_owner_mfa.rev7.sql');
const rev6 = join(root, 'supabase', 'review', '0005_rate_limits_and_owner_mfa.rev6.sql');
const orig = readFileSync(src, 'utf8');
const origSha = createHash('sha256').update(readFileSync(src)).digest('hex');
const dir = resolve(process.argv[2] ?? join(tmpdir(), 'p2-rev7-negative-controls'));
mkdirSync(dir, { recursive: true });

const once = (text, from, to) => { const i = text.indexOf(from); if (i < 0) throw new Error(`control setup: pattern not found: ${from.slice(0, 80)}`); return text.slice(0, i) + to + text.slice(i + from.length); };
const fnRange = (text, sig) => { const s = text.indexOf(`create function ${sig}(`); if (s < 0) throw new Error(`no function ${sig}`); const e = text.indexOf('\n$$;', s); return [s, e]; };
const inFn = (text, sig, from, to) => { const [s, e] = fnRange(text, sig); const body = text.slice(s, e); if (!body.includes(from)) throw new Error(`control setup: ${from.slice(0, 70)} not in ${sig}`); return text.slice(0, s) + body.replace(from, to) + text.slice(e); };

const controls = [
  // ---- A. the previous failures (rev6 review findings) come back
  ['F1: the lifetime count of approved factors returns', (t) => inFn(t, 'private.guard_owner_mfa_factor_insert', 'a.user_id = new.user_id and a.factor_id = any (v_ids)) >= 3', 'a.user_id = new.user_id) >= 3')],
  ['F1: the live limit becomes four', (t) => inFn(t, 'private.guard_owner_mfa_factor_insert', 'a.factor_id = any (v_ids)) >= 3', 'a.factor_id = any (v_ids)) >= 4')],
  ['F1: the limit reads a NULL id list (the unknown check is gone)', (t) => inFn(t, 'private.guard_owner_mfa_factor_insert', 'if v_ids is null then', 'if false then')],
  ['F1: approval history can be deleted', (t) => once(t, '-- 4c. Recovery codes (hashes only) and recovery requests', 'delete from private.owner_mfa_factors where false;\n-- 4c. Recovery codes (hashes only) and recovery requests')],
  ['F2: the five-window self-check is case-sensitive again (like greatest)', (t) => once(t, "and pg_get_constraintdef(c.oid) ~* 'greatest\\s*\\(' and", "and pg_get_constraintdef(c.oid) like '%greatest%' and")],
  ['F2: a position() assertion on function text returns', (t) => once(t, "pg_get_functiondef('private.owner_mfa_ok()'::regprocedure) !~* 'private\\.auth_structure_ok\\(\\)'", "position('private.auth_structure_ok()' in pg_get_functiondef('private.owner_mfa_ok()'::regprocedure)) = 0")],
  ['F2: the policy assertion is case-sensitive again', (t) => once(t, "qual ilike '%my\\_mfa\\_owner\\_org\\_ids%'", "qual like '%my_mfa_owner_org_ids%'")],
  ['F2: the search_path assertion is an exact comparison again', (t) => once(t, "regexp_replace(c, '[\\s\"'']', '', 'g') ~* '^search_path=$'", "c = 'search_path=\"\"'")],
  ['F2: the normalization of the constraint text is gone', (t) => once(t, "regexp_replace(pg_get_constraintdef(c.oid), '\\s+', ' ', 'g') ~* 'windows_issued", "pg_get_constraintdef(c.oid) ~ 'windows_issued")],
  ['F3: the stranded anchor is the owner\'s latest request again', (t) => inFn(t, 'private.owner_stranded_request', 'order by x.evidence_at desc, x.created_at desc, x.id desc', 'order by x.created_at desc')],
  ['F3: the removal-order evidence is gone (a lapsed window erases the state)', (t) => inFn(t, 'private.owner_stranded_request', '(select max(o.ordered_at) from private.owner_factor_removal_orders o where o.request_id = r.id and o.user_id = p_user)', 'null::timestamptz')],
  ['F3: a later completed recovery no longer ends the stranded state', (t) => inFn(t, 'private.owner_stranded_request', "c.status = 'completed' and c.completed_at > x.evidence_at", 'false')],
  ['F3: the lookback is 60 days', (t) => inFn(t, 'private.owner_stranded_request', "interval '30 days'", "interval '60 days'")],
  ['F3: an open request no longer ends the stranded state', (t) => inFn(t, 'private.owner_stranded_request', "o.status in ('awaiting_approval', 'pending')", "o.status in ('awaiting_approval')")],
  ['F3: the one-live-exception index returns', (t) => once(t, 'create index owner_recovery_exceptions_owner_idx', "create unique index owner_recovery_exceptions_one_live_idx on private.owner_recovery_exceptions (stranded_request_id) where status in ('requested', 'granted', 'consumed');\ncreate index owner_recovery_exceptions_owner_idx")],
  ['F3: the expiry audit forgets exception-carrying requests', (t) => inFn(t, 'private.close_expired_recovery_requests', "'exception_carrying', r.exception_id is not null", "'exception_carrying', false")],
  ['F3: the factor-loss review ignores the anchor', (t) => inFn(t, 'public.rpc_staff_list_owner_factor_loss', 'private.owner_stranded_request(h.user_id) as anchor', 'null::uuid as anchor')],
  ['F4: the no-show path is removed (the dead end returns)', (t) => inFn(t, 'public.rpc_staff_authorize_extra_recovery_window', "when v_req.windows_issued = 3 and v_req.extra_windows_granted = 0 then 'no_show'", "when false then 'no_show'")],
  ['F4: the no-show path is unbounded (any window count)', (t) => inFn(t, 'public.rpc_staff_authorize_extra_recovery_window', "when v_req.windows_issued = 3 and v_req.extra_windows_granted = 0 then 'no_show'", "when true then 'no_show'")],
  ['F4: the hard maximum is six windows', (t) => once(t, 'windows_issued between 0 and 5 and extra_windows_granted = greatest(windows_issued - 3, 0)', 'windows_issued between 0 and 6 and extra_windows_granted = greatest(windows_issued - 3, 0)')],
  ['F4: the extension no longer records its path', (t) => inFn(t, 'public.rpc_staff_authorize_extra_recovery_window', ", 'path', v_path", '')],
  ['F5: the begin RPC accepts a recognized (verified) factor', (t) => inFn(t, 'public.rpc_staff_begin_unrecognized_factor_removal', "if v_class <> 'unrecognized' then", 'if false then')],
  ['F5: the order guard no longer re-reads the class at insert', (t) => inFn(t, 'private.guard_owner_unrecognized_order_insert', "if private.owner_factor_row_class(new.user_id, new.factor_id) is distinct from 'unrecognized' then", 'if false then')],
  ['F5: the completion guard accepts a row that is still present', (t) => inFn(t, 'private.guard_owner_unrecognized_order_update', "if private.owner_factor_row_class(old.user_id, old.factor_id) is distinct from 'absent' then", 'if false then')],
  ['F5: the completion RPC accepts a present row', (t) => inFn(t, 'public.rpc_staff_complete_unrecognized_factor_removal', "if v_class <> 'absent' then", 'if false then')],
  ['F5: the begin RPC needs no fresh step-up', (t) => inFn(t, 'public.rpc_staff_begin_unrecognized_factor_removal', "'staff.owner_unrecognized_factor.begin', true,", "'staff.owner_unrecognized_factor.begin', false,")],
  ['F5: the classifier ignores the structure check', (t) => inFn(t, 'private.owner_factor_row_class', 'if p_user is null or p_factor is null or not private.auth_structure_ok() then', 'if p_user is null or p_factor is null then')],
  ['F5: the classifier treats an unknown status as recognized', (t) => inFn(t, 'private.owner_factor_row_class', "coalesce(v_status in ('verified', 'unverified'), false)", 'true')],
  ['F5: the begin RPC no longer names the factor', (t) => once(t, 'create function public.rpc_staff_begin_unrecognized_factor_removal(p_owner_user_id uuid, p_factor_id uuid, p_reason text)', 'create function public.rpc_staff_begin_unrecognized_factor_removal(p_owner_user_id uuid, p_reason text)')],
  ['F5: reason text leaks into an audit detail (begin)', (t) => inFn(t, 'public.rpc_staff_begin_unrecognized_factor_removal', "jsonb_build_object('order_id', v_oid, 'factor_id', p_factor_id)", "jsonb_build_object('order_id', v_oid, 'why', v_reason)")],
  ['F5: the unrecognized-order lock takes the window lock first', (t) => inFn(t, 'public.rpc_staff_begin_unrecognized_factor_removal', "perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)", "perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));\n  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)")],
  ['F5: the unrecognized-order unique index is gone', (t) => once(t, 'create unique index owner_unrecognized_factor_orders_one_open_idx', 'create index owner_unrecognized_factor_orders_one_open_idx')],
  ['F7: the refresh takes a parameter', (t) => once(t, 'create function public.rpc_refresh_auth_structure_check() returns jsonb', 'create function public.rpc_refresh_auth_structure_check(p_force boolean) returns jsonb')],
  ['F7: the global 12 hour rule is gone (a caller could replace a fresh pass)', (t) => inFn(t, 'public.rpc_refresh_auth_structure_check', "v.status = 'passed' and v.checked_at > now() - interval '12 hours'", "v.status = 'passed' and v.checked_at > now() - interval '0 hours'")],
  ['F7: the per-user limit is gone', (t) => inFn(t, 'public.rpc_refresh_auth_structure_check', "v_hit := private.rate_limit_hit('structure_refresh', private.rl_user_key('structure_refresh'));", "v_hit := jsonb_build_object('allowed', true);")],
  ['F7: any authenticated user may refresh', (t) => inFn(t, 'public.rpc_refresh_auth_structure_check', 'if v_kind is null then', 'if false then')],
  ['F7: the refresh uses a different lock than the staff-context refresher', (t) => inFn(t, 'public.rpc_refresh_auth_structure_check', "'p2:structure_check_refresh', 0", "'p2:structure_check_refresh_x', 0")],
  ['F7: the refresh depends on a staff session again', (t) => inFn(t, 'public.rpc_refresh_auth_structure_check', 'if v_actor is null then', 'if v_actor is null or not private.staff_session_ok() then')],
  ['F7: a run is not audited', (t) => inFn(t, 'public.rpc_refresh_auth_structure_check', "'platform.structure_check.refresh'", "'platform.structure_check.refreshed'")],
  ['F7: the policy row is 60 per hour', (t) => once(t, "('structure_refresh', 6, 3600, 3600,", "('structure_refresh', 60, 3600, 3600,")],
  ['F7: the refresh is granted to anon', (t) => once(t, 'grant execute on function public.rpc_throttle_password_recovery(bytea, bytea) to anon, authenticated;', 'grant execute on function public.rpc_throttle_password_recovery(bytea, bytea) to anon, authenticated;\ngrant execute on function public.rpc_refresh_auth_structure_check() to anon;')],
  ['F13: a FOR loop over a data-modifying CTE returns', (t) => inFn(t, 'private.close_expired_recovery_requests', '  v_n integer := 0;\nbegin\n', '  v_n integer := 0;\nbegin\n  for r in with upd as (update private.owner_factor_removal_orders set status = status where false returning id) select upd.id from upd loop null; end loop;\n')],
  // ---- B. preserved properties are tampered with
  ['B: an owner foreign key cascades again (unrecognized orders)', (t) => once(t, "user_id      uuid not null references auth.users (id) on delete restrict,\n  factor_id", "user_id      uuid not null references auth.users (id) on delete cascade,\n  factor_id")],
  ['B: a service_role grant appears', (t) => once(t, 'grant execute on function private.my_mfa_owner_org_ids() to authenticated;', 'grant execute on function private.my_mfa_owner_org_ids() to authenticated;\ngrant execute on function public.rpc_staff_begin_factor_removal(uuid) to service_role;')],
  ['B: a database HTTP extension appears', (t) => once(t, '-- 1. Rate-limit policies', 'create extension if not exists pg_net;\n-- 1. Rate-limit policies')],
  ['B: the exception two-person constraint is gone', (t) => once(t, 'check (granted_by is null or granted_by <> requested_by)', 'check (true)')],
  ['B: a quota number changes (3 instead of 5)', (t) => once(t, "('operator_recovery_initiate', 5, 86400, 86400,", "('operator_recovery_initiate', 3, 86400, 86400,")],
  ['B: the isolation guard is removed from the new begin RPC', (t) => inFn(t, 'public.rpc_staff_begin_unrecognized_factor_removal', 'perform private.require_read_committed();', '-- removed')],
  ['B: the extension RPC takes the locks in the wrong order', (t) => { const [s] = fnRange(t, 'public.rpc_staff_authorize_extra_recovery_window'); const a = "  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)\n"; const b = "  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));     -- (3)\n"; const i = t.indexOf(a + b, s); if (i < 0) throw new Error('lock pair not found'); return t.slice(0, i) + b + a + t.slice(i + a.length + b.length); }],
  ['B: a previous revision is edited (rev6 hash pin is checked by the suite)', null],
];

let missed = 0;
const run = (file) => { const r = spawnSync('npx', ['vitest', 'run', 'tests/portal/owner-rev7.test.ts', '--reporter=dot'], { cwd: root, env: { ...process.env, P2_REV7_TEST_FILE: file }, shell: true, encoding: 'utf8' }); return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }; };

const base = run(src);
console.log(`${base.code === 0 ? 'PASS' : 'FAIL'}  baseline: the unmodified rev7 draft passes the suite`);
if (base.code !== 0) { console.log(base.out.split('\n').slice(-30).join('\n')); process.exit(1); }
let n = 0;
for (const [label, mutate] of controls) {
  if (mutate === null) continue; // the preservation pins are covered by the suite's own hash tests; no copy of a previous revision is ever written
  n++;
  let text;
  try { text = mutate(orig); } catch (e) { console.log(`ERROR  ${label}: ${e.message}`); missed++; continue; }
  if (text === orig) { console.log(`ERROR  ${label}: the mutation changed nothing`); missed++; continue; }
  const f = join(dir, `broken-${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.sql`);
  writeFileSync(f, text);
  const r = run(f);
  const caught = r.code !== 0;
  if (!caught) missed++;
  console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${label}`);
}

// ---- C. the static checker, fed the REV6 file under a rev7 name, must report the rev6 defects
const asRev7 = join(dir, '0005.rev7-from-rev6.sql');
writeFileSync(asRev7, readFileSync(rev6, 'utf8'));
const sc = spawnSync(process.execPath, [join(root, 'supabase', 'review', 'static-check-p22.mjs'), asRev7], { cwd: root, encoding: 'utf8' });
const rules = new Set([...(sc.stdout ?? '').matchAll(/^\s+(P\d+)-/gm)].map((m) => m[1]));
for (const [rule, what] of [['P32', 'lifetime factor count (F1)'], ['P33', 'case-sensitive deparse assertions (F2)'], ['P34', 'FOR loop over a data-modifying CTE (F13)'], ['P35', 'latest-request stranded anchor and the one-live index (F3)'], ['P38', 'extension without the no-show path (F4)']]) {
  const ok = rules.has(rule);
  if (!ok) missed++;
  n++;
  console.log(`${ok ? 'CAUGHT' : 'MISSED'}  static checker (${rule}) reports the rev6 defect: ${what}`);
}
const afterSha = createHash('sha256').update(readFileSync(src)).digest('hex');
console.log(afterSha === origSha ? 'rev7 draft unchanged (sha256 verified before and after)' : 'ERROR: the rev7 draft changed during the controls');
console.log(missed === 0 && afterSha === origSha ? `NEGATIVE CONTROLS PASS: all ${n} broken copies and rev6 defects were caught` : `NEGATIVE CONTROLS FAILED: ${missed} not caught`);
process.exit(missed === 0 && afterSha === origSha ? 0 : 1);
