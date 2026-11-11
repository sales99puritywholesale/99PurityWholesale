// OFFLINE negative controls for tests/portal/owner-rev5.test.ts. It never connects to anything and never reads an environment file. It writes deliberately BROKEN copies of the rev5 SQL
// draft into a scratch directory, points the test suite at each copy (P2_REV5_TEST_FILE) and requires the suite to FAIL for every one: a suite that cannot fail proves nothing.
// The rev5 draft itself is never modified. Usage (from the project root, with an uppercase drive letter on Windows): node supabase/review/tests/rev5-negative-controls.mjs [scratchDir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd();
const src = join(root, 'supabase', 'review', '0005_rate_limits_and_owner_mfa.rev5.sql');
const orig = readFileSync(src, 'utf8');
const origSha = createHash('sha256').update(readFileSync(src)).digest('hex');
const dir = resolve(process.argv[2] ?? join(tmpdir(), 'p2-rev5-negative-controls'));
mkdirSync(dir, { recursive: true });

const once = (text, from, to) => { const i = text.indexOf(from); if (i < 0) throw new Error(`control setup: pattern not found: ${from.slice(0, 60)}`); return text.slice(0, i) + to + text.slice(i + from.length); };
const fnStart = (text, name) => text.indexOf(`create function public.${name}(`);
const removeInFn = (text, name, what) => { const s = fnStart(text, name); if (s < 0) throw new Error(`no function ${name}`); const e = text.indexOf('\n$$;', s); const body = text.slice(s, e); if (!body.includes(what)) throw new Error(`control setup: ${what.slice(0, 50)} not in ${name}`); return text.slice(0, s) + body.replace(what, '-- removed by control') + text.slice(e); };

const controls = [
  ['isolation guard removed from the approval RPC', (t) => removeInFn(t, 'rpc_staff_approve_owner_recovery', 'perform private.require_read_committed();')],
  ['isolation guard removed from the attestation RPC', (t) => removeInFn(t, 'rpc_staff_attest_owner_factor_removal', 'perform private.require_read_committed();')],
  ['a retention foreign key cascades again', (t) => once(t, 'references auth.users (id) on delete restrict,\n  origin', 'references auth.users (id) on delete cascade,\n  origin')],
  ['the approval guard no longer refuses an expired request', (t) => once(t, "if old.expires_at <= clock_timestamp() then\n      raise exception 'an expired recovery request cannot be approved'", "if false then\n      raise exception 'an expired recovery request cannot be approved'")],
  ['a notarized statement is a method again', (t) => once(t, "('video_id_check', 'in_person', 'verified_business_contact')", "('video_id_check', 'in_person', 'notarized_statement', 'verified_business_contact')")],
  ['the factor gate no longer requires the removal attestation', (t) => once(t, 'where w.id = new.window_id and rq.factors_removed_at is not null', 'where w.id = new.window_id')],
  ['the old removal precondition is back', (t) => once(t, "    -- rev5 (R1): NO factor-removal precondition any more.", "    if v_state <> 'recovery_required' then return jsonb_build_object('ok', false, 'code', 'factor_removal_required'); end if;\n    -- rev5 (R1): NO factor-removal precondition any more.")],
  ['cancelling no longer revokes the window (owner cancel)', (t) => once(t, "perform private.revoke_request_windows(v_req.id, v_actor, v_actor, 'organization_user', 'request_cancelled');", '')],
  ['the owner cancellation lock ignores the factor state again', (t) => once(t, "                and r.cancelled_by = v_actor and r.cancelled_at > clock_timestamp() - interval '24 hours')\n     and private.owner_factor_state(v_actor) = 'approved' then", "                and r.cancelled_by = v_actor and r.cancelled_at > clock_timestamp() - interval '24 hours') then")],
  ['lock order reversed in the attestation RPC', (t) => { const s = t.indexOf('create function public.rpc_staff_attest_owner_factor_removal('); const a = "  perform pg_advisory_xact_lock(hashtextextended('p2:owner_recovery:' || p_owner_user_id::text, 0));   -- (2)\n"; const b = "  perform pg_advisory_xact_lock(hashtextextended('p2:owner_window:' || p_owner_user_id::text, 0));     -- (3)\n"; const i = t.indexOf(a + b, s); if (i < 0) throw new Error('control setup: lock pair not found'); return t.slice(0, i) + b + a + t.slice(i + a.length + b.length); }],
  ['reason text leaks into an audit detail', (t) => once(t, "jsonb_build_object('request_id', p_request_id, 'origin', v_req.origin, 'factors_removed', v_req.factors_removed_at is not null));", "jsonb_build_object('request_id', p_request_id, 'origin', v_req.origin, 'why', v_reason));")],
  ['dblink introduced', (t) => once(t, '-- 1. Rate-limit policies', "create extension if not exists dblink;\n-- 1. Rate-limit policies")],
  ['the status list loses stranded', (t) => once(t, "elsif v_req.factors_removed_at is not null and v_state = 'recovery_required'", "elsif v_req.factors_removed_at is not null and v_state = 'recovery_required_x'")],
  ['a quota number changes (3 instead of 5)', (t) => once(t, "('operator_recovery_initiate', 5, 86400, 86400,", "('operator_recovery_initiate', 3, 86400, 86400,")],
];

let missed = 0;
const run = (file) => { const r = spawnSync('npx', ['vitest', 'run', 'tests/portal/owner-rev5.test.ts', '--reporter=dot'], { cwd: root, env: { ...process.env, P2_REV5_TEST_FILE: file }, shell: true, encoding: 'utf8' }); return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }; };

const base = run(src);
console.log(`${base.code === 0 ? 'PASS' : 'FAIL'}  baseline: the unmodified rev5 draft passes the suite`);
if (base.code !== 0) { console.log(base.out.split('\n').slice(-25).join('\n')); process.exit(1); }
for (const [label, mutate] of controls) {
  let text;
  try { text = mutate(orig); } catch (e) { console.log(`ERROR  ${label}: ${e.message}`); missed++; continue; }
  if (text === orig) { console.log(`ERROR  ${label}: the mutation changed nothing`); missed++; continue; }
  const f = join(dir, `broken-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.sql`);
  writeFileSync(f, text);
  const r = run(f);
  const caught = r.code !== 0;
  if (!caught) missed++;
  console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${label}`);
}
const afterSha = createHash('sha256').update(readFileSync(src)).digest('hex');
console.log(afterSha === origSha ? 'rev5 draft unchanged (sha256 verified before and after)' : 'ERROR: the rev5 draft changed during the controls');
console.log(missed === 0 && afterSha === origSha ? `NEGATIVE CONTROLS PASS: all ${controls.length} broken copies were caught` : `NEGATIVE CONTROLS FAILED: ${missed} not caught`);
process.exit(missed === 0 && afterSha === origSha ? 0 : 1);
