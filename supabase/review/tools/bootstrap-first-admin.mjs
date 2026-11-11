// FIRST-ADMINISTRATOR BOOTSTRAP (prepared offline; NEVER RUN against a database; its execution needs the project owner's separate written approval).
// One-time owner-run utility for the hosted DEVELOPMENT project semtmllmwhxznxechfsk only. It establishes the first staff administrator through the permitted mechanism of the 0002-0004
// migrations (the staff tables have no API write grant, so only the database owner connection can write the first row): staff row + admin role + a 30 minute authenticator enrolment window +
// an audit event, in ONE transaction. It cannot be reused: it refuses if ANY staff row, role, window or approved factor exists. It is not a general super-admin mechanism: it targets exactly the
// user id AND email named in the approval, the identity must be an eligible dedicated account, and the database guards (last-admin, staff-not-member, window rules) run unchanged.
//
// MODES  (default = DRY RUN: every write happens inside the transaction and is ROLLED BACK; nothing persists)
//   --check    read-only preflight (no write at all)         --commit   persist (needs ALL of: --commit, P2_BOOTSTRAP_COMMIT=yes, P2_BOOTSTRAP_APPROVED=<approval string>)
//   --offline-selftest   no network, no environment read
// Required to connect: --harness-sha <this file's sha256>  --user-id <uuid>  --email <address>  --approval-ref <ref (no secrets)>  and credentials via --authorized-read-env-local (the single
// P2_DATABASE_URL line, in memory) or P2_DATABASE_URL in the process environment.
// Approval string (exact): approve-first-admin:<user-id>:<email lower case>:<approval-ref>      The identity is created by the owner in the Supabase Dashboard; this tool never creates it.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha, checkTarget, buildClientConfig, assertTls, makeReporter, setSecrets, clean, PINS as APPLY } from '../tests/apply-p3.mjs';

const ROOT = 'D:/99puritywholesale-platform/99puritywholesale';
const SCRATCH = 'C:/Users/ASUS/AppData/Local/Temp/claude/5be02bab2b43fae5/296f90d8-b904-4141-9838-dfdf9f6ee9b3/scratchpad';
export const PINS = {
  applyHarnessSha: '2c543932f88daecdd426f5689043b1acea053b47d6f6379669fa2fc915570fb7', // the reviewed TLS/target helpers this tool imports
  applyHarnessFile: 'supabase/review/tests/apply-p3.mjs',
  ref: APPLY.ref,
  // The two validation accounts predate the P3 application; a dedicated administrator must be created AFTER it (committed 2026-11-10T21:04:32Z) so neither can ever be promoted.
  adminCreatedAfter: '2026-11-10T21:04:32Z',
  requiredMigrations: ['20261108000002', '20261108000003', '20261108000004'],
  windowMinutes: 30,
};
export const EXIT = { OK: 0, FAILED_ROLLED_BACK: 1, REFUSED_FLAGS: 2, REFUSED_TARGET: 3, REFUSED_STATE: 4, COMMITTED_BUT_UNVERIFIED: 5, COMMIT_AMBIGUOUS: 6, INCONSISTENT: 7 };
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,255}$/;

// ---------------------------------------------------------------------------------------------------------------------------------------------- exact-text SQL allow-list
export const SQL = {
  begin: 'begin isolation level read committed', tlIdle: "set local idle_in_transaction_session_timeout = '120s'", tlStmt: "set local statement_timeout = '60s'", tlLock: "set local lock_timeout = '10s'",
  lock: "select pg_advisory_xact_lock(hashtextextended('p3-first-admin-bootstrap', 0))", rollback: 'rollback', commit: 'commit',
  migrations: "select count(*)::int n from supabase_migrations.schema_migrations where version = any($1::text[])",
  functions: "select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where (s.nspname = 'private' and p.proname in ('write_audit', 'guard_enrolment_window_insert')) or (s.nspname = 'public' and p.proname in ('rpc_staff_claim_factor', 'rpc_my_staff_context'))",
  staffState: "select (select count(*)::int from public.staff_members) members, (select count(*)::int from public.staff_roles) roles, (select count(*)::int from private.staff_mfa_enrolment_windows) windows, (select count(*)::int from private.staff_mfa_factors) factors",
  adminCaps: "select count(*)::int n from public.role_capabilities where role = 'admin'",
  user: "select u.id::text id, lower(u.email) email, u.email_confirmed_at is not null confirmed, (u.banned_until is not null and u.banned_until > now()) banned, (u.deleted_at is not null) deleted, (u.created_at > $2::timestamptz) created_after, exists (select 1 from auth.identities i where i.user_id = u.id) has_identity, (select count(*)::int from public.organization_members m where m.user_id = u.id) memberships, (select count(*)::int from auth.mfa_factors f where f.user_id = u.id) factors from auth.users u where u.id = $1::uuid",
  insStaff: "insert into public.staff_members (user_id, status, created_by) values ($1::uuid, 'active', null)",
  insRole: "insert into public.staff_roles (user_id, role, granted_by) values ($1::uuid, 'admin', null)",
  insWindow: "insert into private.staff_mfa_enrolment_windows (target_user_id, authorized_by, expires_at, reason) values ($1::uuid, null, now() + interval '30 minutes', 'bootstrap of the first administrator') returning id::text as id, expires_at::text as expires_at",
  audit: "select private.write_audit(null, 'system', 'staff.bootstrap.admin', 'success', null, 'staff_member', $1, $2::jsonb)::text as id",
  rowCheck: "select s.status, s.created_by is null as bootstrap_row, array(select r.role from public.staff_roles r where r.user_id = s.user_id and r.granted_by is null order by 1) roles, (select count(*)::int from private.staff_mfa_enrolment_windows w where w.target_user_id = s.user_id and w.authorized_by is null and w.consumed_at is null and w.revoked_at is null and w.expires_at > now()) open_windows, (select count(*)::int from public.audit_events a where a.action = 'staff.bootstrap.admin' and a.subject_id = s.user_id::text and a.outcome = 'success') audit_rows from public.staff_members s where s.user_id = $1::uuid",
};
const ALLOWED = new Map(Object.entries(SQL).map(([id, t]) => [norm(t), id]));
export function makeSender(log = []) {
  return (c, text, params) => { const id = ALLOWED.get(norm(text)); if (!id) throw new Error('STATEMENT NOT ALLOW-LISTED (refused before sending)'); log.push(id); return c.query(text, params); };
}
export const WRITERS = ['insStaff', 'insRole', 'insWindow', 'audit', 'commit'];

export const approvalString = (userId, email, ref) => `approve-first-admin:${userId}:${email.toLowerCase()}:${ref}`;

// ---------------------------------------------------------------------------------------------------------------------------------------------- the run
/** o: { mode: 'check'|'dry'|'commit', connect, userId, email, approvalRef, approved (string|undefined), commitFlag (bool), commitEnv (string|undefined), reporter, sqlLog? } -> { outcome, exitCode, windowId?, expiresAt? } */
export async function runBootstrap(o) {
  const { rep, note } = o.reporter; const send = makeSender(o.sqlLog ?? []);
  const out = { outcome: null, exitCode: EXIT.FAILED_ROLLED_BACK, committed: false, windowId: null, expiresAt: null };
  const email = String(o.email ?? '').trim().toLowerCase(); const userId = String(o.userId ?? '').trim().toLowerCase(); const ref = String(o.approvalRef ?? '');
  // ---- 1. flags and approval (before any connection)
  const inputsOk = UUID.test(userId) && EMAIL.test(email) && ref.length >= 4 && ref.length <= 120 && !/[\s]/.test(ref);
  rep('inputs: a user id (uuid), an e-mail address and an approval reference (no spaces) are required', inputsOk);
  if (!inputsOk) { out.outcome = 'refused_inputs'; out.exitCode = EXIT.REFUSED_FLAGS; return out; }
  if (o.mode === 'commit') {
    const okApproval = o.commitFlag === true && o.commitEnv === 'yes' && o.approved === approvalString(userId, email, ref);
    rep('commit needs --commit, P2_BOOTSTRAP_COMMIT=yes and the exact approval string for THIS user id, e-mail and reference', okApproval);
    if (!okApproval) { out.outcome = 'refused_commit_authorization'; out.exitCode = EXIT.REFUSED_FLAGS; return out; }
  }
  let before = null; let tx = null; let txOpen = false; let commitSent = false; let ok = false;
  const gates = async (c, label) => {
    const mig = (await send(c, SQL.migrations, [PINS.requiredMigrations])).rows[0].n; const fn = (await send(c, SQL.functions)).rows[0].n;
    rep(`${label}: migrations 0002, 0003 and 0004 are applied and their functions exist`, mig === 3 && fn === 4, `history ${mig}/3, functions ${fn}/4`);
    if (mig !== 3 || fn !== 4) return 'refused_migrations_missing';
    const st = (await send(c, SQL.staffState)).rows[0];
    const none = st.members === 0 && st.roles === 0 && st.windows === 0 && st.factors === 0;
    rep(`${label}: NO staff member, role, enrolment window or approved factor exists (this tool can only create the FIRST administrator)`, none, `members ${st.members}, roles ${st.roles}, windows ${st.windows}, factors ${st.factors}`);
    if (!none) return 'refused_first_admin_exists';
    const caps = (await send(c, SQL.adminCaps)).rows[0].n; rep(`${label}: the admin role has capabilities defined (it receives them through role_capabilities)`, caps > 0, `${caps} capabilities`);
    if (caps === 0) return 'refused_no_admin_capabilities';
    const u = (await send(c, SQL.user, [userId, PINS.adminCreatedAfter])).rows[0];
    rep(`${label}: the Auth user exists and its id and e-mail match the approval exactly`, Boolean(u) && u.id === userId && u.email === email);
    if (!u || u.id !== userId || u.email !== email) return 'refused_identity_mismatch';
    const elig = [['the e-mail address is confirmed', u.confirmed], ['the account is not banned or deleted', !u.banned && !u.deleted], ['the account has a sign-in identity', u.has_identity],
      ['the account was created AFTER the P3 application (so neither validation account can be promoted)', u.created_after], ['the account has no organization membership (staff cannot be members)', u.memberships === 0], ['the account has no authenticator factor yet', u.factors === 0]];
    for (const [n, v] of elig) rep(`${label}: ${n}`, v === true);
    return elig.every(([, v]) => v === true) ? null : 'refused_ineligible_identity';
  };
  try {
    let c0; try { c0 = await o.connect(); } catch (e) { rep('connection with strict TLS and the pinned CA', false, `error code ${e?.code ?? 'ERR'}`); out.outcome = 'refused_connect'; out.exitCode = EXIT.REFUSED_TARGET; return out; }
    try { const refusal = await gates(c0, 'PRE-STATE'); if (refusal) { out.outcome = refusal; out.exitCode = EXIT.REFUSED_STATE; return out; } before = (await send(c0, SQL.staffState)).rows[0]; ok = true; } finally { await c0.end().catch(() => {}); }
    if (o.mode === 'check') { rep('CHECK: every precondition holds; nothing was written (run without --check for a rolled-back dry run)', null); out.outcome = 'check_passed'; out.exitCode = EXIT.OK; return out; }
    // ---- 2. the transaction (dry run rolls back; commit persists)
    tx = await o.connect(); await send(tx, SQL.begin); txOpen = true; await send(tx, SQL.tlIdle); await send(tx, SQL.tlStmt); await send(tx, SQL.tlLock); await send(tx, SQL.lock);
    const refusal = await gates(tx, 'IN-TX RE-CHECK');
    if (refusal) { await send(tx, SQL.rollback); txOpen = false; out.outcome = refusal.replace('refused_', 'refused_in_tx_'); out.exitCode = EXIT.REFUSED_STATE; }
    else {
      await send(tx, SQL.insStaff, [userId]); rep('staff member inserted (status active, created_by NULL marks the bootstrap row)', true);
      await send(tx, SQL.insRole, [userId]); rep('admin role granted (granted_by NULL)', true);
      const w = (await send(tx, SQL.insWindow, [userId])).rows[0]; out.windowId = w.id; out.expiresAt = w.expires_at; rep(`authenticator enrolment window opened for ${PINS.windowMinutes} minutes (authorized_by NULL: the bootstrap form the database allows only here)`, UUID.test(w.id));
      await send(tx, SQL.audit, [userId, JSON.stringify({ approval_ref: ref, window_id: w.id })]); rep('audit event staff.bootstrap.admin written (detail: approval reference and window id only)', true);
      const st = (await send(tx, SQL.staffState)).rows[0]; const row = (await send(tx, SQL.rowCheck, [userId])).rows[0];
      const good = st.members === 1 && st.roles === 1 && st.windows === 1 && st.factors === 0 && row?.status === 'active' && row.bootstrap_row === true && JSON.stringify(row.roles) === JSON.stringify(['admin']) && row.open_windows === 1 && row.audit_rows === 1;
      rep('in-transaction verification: exactly one staff row, one admin role, one open window and one audit event; no approved factor yet', good, JSON.stringify(st));
      if (!good) { await send(tx, SQL.rollback); txOpen = false; out.outcome = 'rolled_back_verification_failed'; out.exitCode = EXIT.FAILED_ROLLED_BACK; }
      else if (o.mode === 'dry') { await send(tx, SQL.rollback); txOpen = false; rep('DRY RUN: every write succeeded and every guard passed; ROLLBACK issued (nothing persisted)', null); out.outcome = 'dry_run_rolled_back'; out.exitCode = EXIT.OK; out.windowId = null; out.expiresAt = null; }
      else { note('COMMIT sent'); commitSent = true; try { await send(tx, SQL.commit); out.committed = true; txOpen = false; } catch (e) { out.commitError = e?.code ?? 'ERR'; txOpen = false; } }
    }
  } catch (e) {
    note(`ERROR during the transaction: ${clean(e?.code ?? 'ERR')}`);
    if (txOpen && !commitSent && tx) { try { await send(tx, SQL.rollback); note('ROLLBACK issued (after error)'); } catch { note('rollback after error failed (the server aborts an abandoned transaction)'); } txOpen = false; }
    out.outcome = out.outcome ?? 'rolled_back_error'; out.exitCode = commitSent ? EXIT.COMMIT_AMBIGUOUS : EXIT.FAILED_ROLLED_BACK; out.windowId = out.committed ? out.windowId : null;
  } finally { if (tx) await tx.end().catch(() => {}); }
  if (!ok || !before) return out;
  // ---- 3. fresh-connection verification of whatever state the database is in
  let c1 = null;
  try {
    c1 = await o.connect(); const st = (await send(c1, SQL.staffState)).rows[0]; const row = (await send(c1, SQL.rowCheck, [userId])).rows[0];
    const persisted = st.members === 1 && Boolean(row);
    if (out.committed || (commitSent && persisted)) {
      const good = st.members === 1 && st.roles === 1 && st.windows === 1 && st.factors === 0 && row?.status === 'active' && row.bootstrap_row === true && JSON.stringify(row.roles) === JSON.stringify(['admin']) && row.audit_rows === 1;
      rep('POST-COMMIT (fresh connection): one bootstrap staff row, one admin role, one window, one audit event, no approved factor', good, JSON.stringify(st));
      if (out.committed) { out.outcome = good ? 'committed_verified' : 'committed_verification_failed'; out.exitCode = good ? EXIT.OK : EXIT.COMMITTED_BUT_UNVERIFIED; }
      else { out.outcome = good ? 'commit_error_but_persisted_verified' : 'commit_error_but_persisted_unverified'; out.exitCode = EXIT.COMMIT_AMBIGUOUS; }
    } else {
      const clean0 = st.members === before.members && st.roles === before.roles && st.windows === before.windows && st.factors === before.factors;
      rep('AFTER (fresh connection): no staff member, role, window or factor was persisted', clean0, JSON.stringify(st));
      if (commitSent) { out.outcome = clean0 ? 'commit_error_not_persisted_verified_clean' : 'commit_error_not_persisted_but_state_differs'; out.exitCode = clean0 ? EXIT.COMMIT_AMBIGUOUS : EXIT.INCONSISTENT; }
      else if (!clean0) { out.outcome = 'rollback_not_verified_clean'; out.exitCode = EXIT.INCONSISTENT; }
    }
  } catch (e) { rep('fresh-connection verification', false, `error code ${e?.code ?? 'ERR'}`); out.exitCode = commitSent || out.committed ? EXIT.COMMITTED_BUT_UNVERIFIED : EXIT.INCONSISTENT; out.outcome = (out.outcome ?? 'unknown') + '+fresh_verification_failed'; }
  finally { if (c1) await c1.end().catch(() => {}); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------- CLI
function cliMain() {
  const argv = process.argv.slice(2); const flag = (n) => argv.includes(n); const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const LOG = `${SCRATCH}/bootstrap-first-admin-log.txt`; const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const note = (s) => { console.log(s); try { appendFileSync(LOG, s + '\n'); } catch { /* best effort */ } };
  const reporter = makeReporter(note); const { rep } = reporter;
  const selfSha = sha(readFileSync(fileURLToPath(import.meta.url)));
  const applySha = sha(readFileSync(join(ROOT, PINS.applyHarnessFile)));
  rep('the imported TLS/target helper (apply-p3.mjs) has its reviewed hash', applySha === PINS.applyHarnessSha);
  if (applySha !== PINS.applyHarnessSha) return EXIT.REFUSED_FLAGS;
  if (flag('--offline-selftest')) { rep('this tool file has a recorded sha256 (printed for the approval)', true, selfSha); note(`offline self-test: ${reporter.results.filter((r) => r.ok).length} passed, ${reporter.failed()} FAILED (no connection was made, no environment file was read)`); return reporter.failed() ? 1 : 0; }
  if (opt('--harness-sha') !== selfSha) { console.log('REFUSING: --harness-sha must equal the sha256 of this tool file'); return EXIT.REFUSED_FLAGS; }
  const mode = flag('--commit') ? 'commit' : flag('--check') ? 'check' : 'dry';
  let v = process.env.P2_DATABASE_URL ?? '';
  if (!v && flag('--authorized-read-env-local')) { const line = readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?P2_DATABASE_URL\s*=/.test(l)); if (line) { v = line.slice(line.indexOf('=') + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, ''); } }
  if (!v) { console.log('STOP: P2_DATABASE_URL not set and --authorized-read-env-local not given'); return EXIT.REFUSED_FLAGS; }
  // approval inputs are validated BEFORE any connection
  const pre = runBootstrapInputsOnly({ mode, userId: opt('--user-id'), email: opt('--email'), approvalRef: opt('--approval-ref'), approved: process.env.P2_BOOTSTRAP_APPROVED, commitFlag: flag('--commit'), commitEnv: process.env.P2_BOOTSTRAP_COMMIT, reporter });
  if (pre) return pre;
  const pem = readFileSync(APPLY.caFile, 'utf8'); const tg = checkTarget(v, pem); setSecrets(tg.secrets ?? [v]);
  for (const x of tg.checks) rep(x.n, x.ok);
  if (!tg.ok) { note('STOP: target or CA check failed; nothing was executed'); return EXIT.REFUSED_TARGET; }
  const pg = createRequire(join(ROOT, 'package.json'))('pg');
  const connect = async () => { const k = new pg.Client(buildClientConfig(tg)); await k.connect(); try { assertTls(k); } catch (e) { await k.end().catch(() => {}); throw e; } return k; };
  return { run: async () => {
    const res = await runBootstrap({ mode, connect, userId: opt('--user-id'), email: opt('--email'), approvalRef: opt('--approval-ref'), approved: process.env.P2_BOOTSTRAP_APPROVED, commitFlag: flag('--commit'), commitEnv: process.env.P2_BOOTSTRAP_COMMIT, reporter });
    note(`first-admin bootstrap (${mode}): ${reporter.results.filter((r) => r.ok === true).length} passed, ${reporter.failed()} FAILED; outcome ${res.outcome}; exit ${res.exitCode}`);
    if (res.committed && res.windowId) { note(`Authenticator enrolment window opened (expires ${res.expiresAt}). Give the administrator this sign-in path: /login/mfa/setup?window=${res.windowId}&next=%2Fadmin`); }
    try { writeFileSync(`${SCRATCH}/first-admin-bootstrap-result-${mode}-${stamp}.json`, JSON.stringify({ tool: 'bootstrap-first-admin.mjs', mode, toolSha: selfSha, ref: PINS.ref, outcome: res.outcome, committed: res.committed, windowId: res.committed ? res.windowId : null, failures: reporter.failed(), exitCode: res.exitCode, at: new Date().toISOString() }), { flag: 'wx' }); } catch { note('result file could not be written (an existing file is never overwritten)'); }
    return res.exitCode;
  } };
}
function runBootstrapInputsOnly(o) {
  const email = String(o.email ?? '').trim().toLowerCase(); const userId = String(o.userId ?? '').trim().toLowerCase(); const ref = String(o.approvalRef ?? '');
  const inputsOk = UUID.test(userId) && EMAIL.test(email) && ref.length >= 4 && ref.length <= 120 && !/[\s]/.test(ref);
  o.reporter.rep('inputs: a user id (uuid), an e-mail address and an approval reference (no spaces) are required', inputsOk);
  if (!inputsOk) return EXIT.REFUSED_FLAGS;
  if (o.mode === 'commit' && !(o.commitFlag === true && o.commitEnv === 'yes' && o.approved === approvalString(userId, email, ref))) { o.reporter.rep('commit needs --commit, P2_BOOTSTRAP_COMMIT=yes and the exact approval string for THIS user id, e-mail and reference', false); return EXIT.REFUSED_FLAGS; }
  return 0;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const r = cliMain();
  if (typeof r === 'number') process.exitCode = r; else if (r?.run) process.exitCode = await r.run();
}
