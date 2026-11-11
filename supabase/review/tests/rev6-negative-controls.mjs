// OFFLINE negative controls for tests/portal/owner-rev6.test.ts. It never connects to anything and never reads an environment file. It writes deliberately BROKEN copies of the rev6 SQL draft into a
// scratch directory, points the test suite at each copy (P2_REV6_TEST_FILE) and requires the suite to FAIL for every one: a suite that cannot fail proves nothing. The rev6 draft itself is never
// modified (its sha256 is verified before and after). Usage (project root, uppercase drive letter on Windows): node supabase/review/tests/rev6-negative-controls.mjs [scratchDir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const src = join(root, 'supabase', 'review', '0005_rate_limits_and_owner_mfa.rev6.sql');
const orig = readFileSync(src, 'utf8');
const origSha = createHash('sha256').update(readFileSync(src)).digest('hex');
const dir = resolve(process.argv[2] ?? join(tmpdir(), 'p2-rev6-negative-controls'));
mkdirSync(dir, { recursive: true });

const once = (text, from, to) => { const i = text.indexOf(from); if (i < 0) throw new Error(`control setup: pattern not found: ${from.slice(0, 70)}`); return text.slice(0, i) + to + text.slice(i + from.length); };
const fnRange = (text, sig) => { const s = text.indexOf(`create function ${sig}(`); if (s < 0) throw new Error(`no function ${sig}`); const e = text.indexOf('\n$$;', s); return [s, e]; };
const inFn = (text, sig, from, to) => { const [s, e] = fnRange(text, sig); const body = text.slice(s, e); if (!body.includes(from)) throw new Error(`control setup: ${from.slice(0, 60)} not in ${sig}`); return text.slice(0, s) + body.replace(from, to) + text.slice(e); };
const GUARD = 'perform private.require_read_committed();';

const controls = [
  ['isolation guard removed from the removal completion RPC', (t) => inFn(t, 'public.rpc_staff_complete_factor_removal', GUARD, '-- removed')],
  ['isolation guard removed from the extension RPC', (t) => inFn(t, 'public.rpc_staff_authorize_extra_recovery_window', GUARD, '-- removed')],
  ['isolation guard removed from the exception grant RPC', (t) => inFn(t, 'public.rpc_staff_grant_stranded_exception', GUARD, '-- removed')],
  ['window counters may be banked (the extension equation is gone)', (t) => once(t, 'windows_issued between 0 and 5 and extra_windows_granted = greatest(windows_issued - 3, 0)', 'windows_issued between 0 and 5')],
  ['the hard maximum is six windows', (t) => once(t, 'windows_issued between 0 and 5 and extra_windows_granted = greatest(windows_issued - 3, 0)', 'windows_issued between 0 and 6 and extra_windows_granted = greatest(windows_issued - 3, 0)')],
  ['the standard window path may pass three', (t) => once(t, 'new.windows_issued = old.windows_issued + 1 and new.windows_issued <= 3 and v_ext_same and v_rem_same', 'new.windows_issued = old.windows_issued + 1 and v_ext_same and v_rem_same')],
  ['the window gate no longer ties the counter to the number of window rows', (t) => once(t, "\n       or v_req.windows_issued <> (select count(*) from private.owner_mfa_windows w where w.request_id = new.request_id) + 1 then", ' then')],
  ['a window can outlive its request', (t) => once(t, 'if new.expires_at > v_req.expires_at then\n      raise exception \'a recovery window cannot end after its request expires\'', "if false then\n      raise exception 'a recovery window cannot end after its request expires'")],
  ['the exception two-person constraint is gone', (t) => once(t, 'check (granted_by is null or granted_by <> requested_by)', 'check (true)')],
  ['the exception insert guard no longer confirms the stranded state', (t) => inFn(t, 'private.guard_owner_recovery_exception_insert', 'if private.owner_stranded_request(new.user_id) is distinct from new.stranded_request_id then', 'if false then')],
  ['the exception grant RPC allows a self grant', (t) => inFn(t, 'public.rpc_staff_grant_stranded_exception', 'if v_exc.requested_by = v_actor then', 'if false then')],
  ['the exception status shape allows a granted row without a granter', (t) => once(t, "(status = 'granted'   and granted_by is not null and consumed_at is null and closed_code is null)", "(status = 'granted'   and consumed_at is null and closed_code is null)")],
  ['the exception consume is no longer tied to a carrying request', (t) => inFn(t, 'private.guard_owner_recovery_exception_update', 'r.exception_id = old.id and r.user_id = old.user_id and r.origin = \'operator\' and r.created_at >= old.granted_at', 'true')],
  ['the request carries no exception id on insert', (t) => inFn(t, 'public.rpc_staff_initiate_owner_recovery', 'p_notarized, v_now + interval \'72 hours\', v_exc_id)', 'p_notarized, v_now + interval \'72 hours\', null)')],
  ['the claim no longer closes outstanding exceptions', (t) => inFn(t, 'public.rpc_owner_claim_factor', "perform private.close_expired_recovery_requests(v_actor, v_actor, 'organization_user');", '')],
  ['a stale structure check cancels exceptions (the unknown exclusion is gone)', (t) => inFn(t, 'private.close_expired_recovery_requests', "and private.owner_factor_state(p_user) is distinct from 'unknown'\n                and ", 'and ')],
  ['UNKNOWN is read as EMPTY in the factor id helper', (t) => inFn(t, 'private.owner_verified_factor_ids', 'if v_unreadable is null or v_unreadable <> 0 then\n    return null;', "if v_unreadable is null or v_unreadable <> 0 then\n    return '{}'::uuid[];")],
  ['the factor id helper ignores the structure check', (t) => inFn(t, 'private.owner_verified_factor_ids', 'if p_user is null or not private.auth_structure_ok() then', 'if p_user is null then')],
  ['the state function no longer fails closed on unknown ids', (t) => inFn(t, 'private.owner_factor_state', 'if p_user is null or private.owner_verified_factor_ids(p_user) is null then', 'if p_user is null then')],
  ['the MFA predicate ignores the structure check', (t) => inFn(t, 'private.owner_mfa_ok', 'if not private.auth_structure_ok() then', 'if false then')],
  ['the factor gate reads a NULL id list as no other factor', (t) => inFn(t, 'private.guard_owner_mfa_factor_insert', 'if v_ids is null then', 'if false then')],
  ['the factor gate no longer needs a verified window removal', (t) => inFn(t, 'private.guard_owner_mfa_factor_insert', 'w.id = new.window_id and w.removal_verified_at is not null', 'w.id = new.window_id')],
  ['the completion RPC accepts a client-supplied count', (t) => once(t, 'create function public.rpc_staff_complete_factor_removal(p_order_id uuid) returns jsonb', 'create function public.rpc_staff_complete_factor_removal(p_order_id uuid, p_removed_count integer) returns jsonb')],
  ['the order guard no longer re-reads the factor state at completion', (t) => inFn(t, 'private.guard_owner_factor_removal_order_update', 'if v_ids is null or cardinality(v_ids) <> 0 then', 'if false then')],
  ['the window can be verified without a completed order', (t) => inFn(t, 'private.guard_owner_mfa_window_update', "o.window_id = old.id and o.status = 'completed'", 'true')],
  ['a service_role grant appears', (t) => once(t, 'grant execute on function private.my_mfa_owner_org_ids() to authenticated;', 'grant execute on function private.my_mfa_owner_org_ids() to authenticated;\ngrant execute on function public.rpc_staff_begin_factor_removal(uuid) to service_role;')],
  ['a database HTTP extension appears', (t) => once(t, '-- 1. Rate-limit policies', 'create extension if not exists pg_net;\n-- 1. Rate-limit policies')],
  ['a foreign key cascades again (exceptions)', (t) => once(t, 'references auth.users (id) on delete restrict,\n  stranded_request_id', 'references auth.users (id) on delete cascade,\n  stranded_request_id')],
  ['reason text leaks into an audit detail (grant)', (t) => inFn(t, 'public.rpc_staff_grant_stranded_exception', "jsonb_build_object('exception_id', p_exception_id, 'requested_by', v_exc.requested_by)", "jsonb_build_object('exception_id', p_exception_id, 'why', v_reason)")],
  ['lock order reversed in the extension RPC', (t) => { const [s] = fnRange(t, 'public.rpc_staff_authorize_extra_recovery_window'); const a = "  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)\n"; const b = "  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));     -- (3)\n"; const i = t.indexOf(a + b, s); if (i < 0) throw new Error('lock pair not found'); return t.slice(0, i) + b + a + t.slice(i + a.length + b.length); }],
  ['an exception RPC takes the operator lock', (t) => inFn(t, 'public.rpc_staff_request_stranded_exception', "perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)", "perform pg_advisory_xact_lock(hashtextextended('p2:operator_recovery:' || v_actor::text, 0));\n  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)")],
  ['the owner cancellation lock drops on an unknown state', (t) => once(t, "in ('approved', 'unknown') then", "in ('approved') then")],
  ['the factor-loss review reports a partial list without a structure check', (t) => inFn(t, 'public.rpc_staff_list_owner_factor_loss', 'if not private.auth_structure_ok() then', 'if false then')],
  ['a quota number changes (3 instead of 5)', (t) => once(t, "('operator_recovery_initiate', 5, 86400, 86400,", "('operator_recovery_initiate', 3, 86400, 86400,")],
  ['the stranded lookback is 60 days', (t) => inFn(t, 'private.owner_stranded_request', "interval '30 days'", "interval '60 days'")],
];

let missed = 0;
const run = (file) => { const r = spawnSync('npx', ['vitest', 'run', 'tests/portal/owner-rev6.test.ts', '--reporter=dot'], { cwd: root, env: { ...process.env, P2_REV6_TEST_FILE: file }, shell: true, encoding: 'utf8' }); return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }; };

const base = run(src);
console.log(`${base.code === 0 ? 'PASS' : 'FAIL'}  baseline: the unmodified rev6 draft passes the suite`);
if (base.code !== 0) { console.log(base.out.split('\n').slice(-25).join('\n')); process.exit(1); }
for (const [label, mutate] of controls) {
  let text;
  try { text = mutate(orig); } catch (e) { console.log(`ERROR  ${label}: ${e.message}`); missed++; continue; }
  if (text === orig) { console.log(`ERROR  ${label}: the mutation changed nothing`); missed++; continue; }
  const f = join(dir, `broken-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 56)}.sql`);
  writeFileSync(f, text);
  const r = run(f);
  const caught = r.code !== 0;
  if (!caught) missed++;
  console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${label}`);
}
const afterSha = createHash('sha256').update(readFileSync(src)).digest('hex');
console.log(afterSha === origSha ? 'rev6 draft unchanged (sha256 verified before and after)' : 'ERROR: the rev6 draft changed during the controls');
console.log(missed === 0 && afterSha === origSha ? `NEGATIVE CONTROLS PASS: all ${controls.length} broken copies were caught` : `NEGATIVE CONTROLS FAILED: ${missed} not caught`);
process.exit(missed === 0 && afterSha === origSha ? 0 : 1);
