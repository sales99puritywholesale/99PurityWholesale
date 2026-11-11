// OFFLINE tests of the first-admin bootstrap tool. NO database, NO network, NO environment secrets, NO Docker. The "database" is a scripted in-memory fake that records every statement.
// They validate the tool's LOGIC (refusals, sequencing, rollback, ambiguity handling). They are NOT evidence that the tool works against the real database.
// Run: node supabase/review/tools/bootstrap-first-admin-offline.mjs
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as B from './bootstrap-first-admin.mjs';
import { makeReporter } from '../tests/apply-p3.mjs';

const TOOL = fileURLToPath(new URL('./bootstrap-first-admin.mjs', import.meta.url)).replace(/\\/g, '/');
let bad = 0; const t = (n, ok, d = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };
const { SQL, EXIT, WRITERS } = B;
const idOf = (text) => Object.entries(SQL).find(([, x]) => x === text)?.[0];
const UID = '11111111-2222-4333-8444-555555555555'; const EMAIL = 'dedicated.admin@example.test'; const REF = 'TICKET-1234';
const APPROVED = B.approvalString(UID, EMAIL, REF);
const SECRET = 'S3CR3T-PW-9f8e7d';

class Fake {
  constructor(o = {}) {
    this.o = o; this.connects = 0; this.events = []; this.commits = 0; this.violations = [];
    this.s = { members: 0, roles: 0, windows: 0, factors: 0, row: null, audit: 0, ...(o.initial ?? {}) };
    this.user = o.user === null ? undefined : { id: UID, email: EMAIL, confirmed: true, banned: false, deleted: false, created_after: true, has_identity: true, memberships: 0, factors: 0, ...(o.user ?? {}) };
  }
  connect() { this.connects++; if (this.o.failConnectAt === this.connects) { const e = new Error(`self-signed certificate ${SECRET}`); e.code = 'DEPTH_ZERO_SELF_SIGNED_CERT'; return Promise.reject(e); } return Promise.resolve(this.client()); }
  client() {
    const db = this; let tx = null; const view = () => tx ?? db.s;
    return {
      async end() { tx = null; },
      async query(text, params = []) {
        const id = idOf(text); if (!id) throw new Error('FAKE: unscripted statement'); db.events.push({ id, inTx: Boolean(tx) }); const rows = (r) => ({ rows: r });
        const w = () => { if (!tx) db.violations.push(`${id} outside a transaction`); };
        switch (id) {
          case 'begin': tx = { ...db.s }; return rows([]);
          case 'tlIdle': case 'tlStmt': case 'tlLock': return rows([]);
          case 'lock': if (db.o.raceStaff && tx) tx.members = 1; return rows([]);
          case 'rollback': tx = null; return rows([]);
          case 'commit': { db.commits++; if (db.o.failCommit === 'before') { tx = null; throw Object.assign(new Error('closed'), { code: '57P01' }); } db.s = tx; tx = null; if (db.o.failCommit === 'after') throw Object.assign(new Error('lost'), { code: '08006' }); return rows([]); }
          case 'migrations': return rows([{ n: db.o.migrations ?? 3 }]); case 'functions': return rows([{ n: db.o.functions ?? 4 }]); case 'adminCaps': return rows([{ n: db.o.caps ?? 28 }]);
          case 'staffState': { const v = view(); return rows([{ members: v.members, roles: v.roles, windows: v.windows, factors: v.factors }]); }
          case 'user': return rows(db.user ? [db.user] : []);
          case 'insStaff': w(); if (db.o.failAt === 'insStaff') throw Object.assign(new Error('x'), { code: '23514' }); view().members += 1; view().row = { status: 'active', bootstrap_row: true, roles: [], open_windows: 0, audit_rows: 0 }; return rows([]);
          case 'insRole': w(); if (db.o.failAt === 'insRole') throw Object.assign(new Error('x'), { code: '23514' }); view().roles += 1; view().row = { ...view().row, roles: ['admin'] }; return rows([]);
          case 'insWindow': w(); view().windows += 1; view().row = { ...view().row, open_windows: 1 }; return rows([{ id: '99999999-8888-4777-8666-555555555555', expires_at: '2026-11-11T00:30:00Z' }]);
          case 'audit': w(); if (!db.o.noAudit) { view().audit += 1; view().row = { ...view().row, audit_rows: 1 }; } return rows([{ id: 'a1' }]);
          case 'rowCheck': { const v = view(); return rows(v.row ? [{ ...v.row, audit_rows: v.audit }] : []); }
          default: throw new Error(`FAKE: no handler for ${id}`);
        }
      },
    };
  }
}
async function run(opts = {}, mode = 'dry', extra = {}) {
  const db = new Fake(opts); const lines = []; const reporter = makeReporter((s) => lines.push(s)); const sqlLog = [];
  const res = await B.runBootstrap({ mode, connect: () => db.connect(), userId: UID, email: EMAIL, approvalRef: REF, approved: APPROVED, commitFlag: mode === 'commit', commitEnv: 'yes', reporter, sqlLog, ...extra });
  return { res, db, lines, reporter, sqlLog, ids: db.events.map((e) => e.id) };
}
const cnt = (ids, id) => ids.filter((x) => x === id).length;
const wrote = (ids) => ids.some((x) => ['insStaff', 'insRole', 'insWindow', 'audit', 'commit'].includes(x));
const untouched = (r) => r.db.s.members === 0 && r.db.s.roles === 0 && r.db.s.windows === 0 && r.db.s.factors === 0 && r.db.s.audit === 0 && r.db.violations.length === 0;

// ============================================================ A. modes
{
  const c = await run({}, 'check');
  t('A1 --check: all preconditions hold, NOTHING is written and no transaction is opened (exit 0)', c.res.outcome === 'check_passed' && c.res.exitCode === EXIT.OK && !wrote(c.ids) && cnt(c.ids, 'begin') === 0 && untouched(c));
  const d = await run({}, 'dry');
  t('A2 dry run (the default): the exact writes run inside ONE transaction and are ROLLED BACK; COMMIT is never sent; nothing persists; the window id is not reported', d.res.outcome === 'dry_run_rolled_back' && d.res.exitCode === EXIT.OK && cnt(d.ids, 'commit') === 0 && cnt(d.ids, 'rollback') >= 1 && untouched(d) && d.res.windowId === null && d.reporter.failed() === 0);
  t('A2 dry run: the write sequence is staff row, admin role, enrolment window, audit event (in that order, all inside the transaction)', d.ids.filter((x) => ['insStaff', 'insRole', 'insWindow', 'audit'].includes(x)).join() === 'insStaff,insRole,insWindow,audit' && d.db.events.filter((e) => ['insStaff', 'insRole', 'insWindow', 'audit'].includes(e.id)).every((e) => e.inTx));
  const k = await run({}, 'commit');
  t('A3 commit: persists exactly one staff row, one admin role, one open window and one audit event; outcome committed_verified; the window id and expiry are reported for the operator', k.res.outcome === 'committed_verified' && k.res.exitCode === EXIT.OK && k.db.s.members === 1 && k.db.s.roles === 1 && k.db.s.windows === 1 && k.db.s.factors === 0 && k.db.s.audit === 1 && /^[0-9a-f-]{36}$/.test(k.res.windowId) && Boolean(k.res.expiresAt));
  t('A3 commit: the only writing statements are insStaff, insRole, insWindow, audit and ONE commit, in a transaction, and COMMIT comes after the in-transaction verification; the post-commit check is on a fresh connection', k.ids.filter((x) => WRITERS.includes(x)).join() === 'insStaff,insRole,insWindow,audit,commit' && k.ids.lastIndexOf('rowCheck') > k.ids.indexOf('commit') && k.db.connects === 3 && k.db.violations.length === 0);
  t('A3 commit: the approved factor count stays 0 (the administrator must still enrol and have the factor approved; the tool grants no MFA bypass)', k.db.s.factors === 0);
}

// ============================================================ B. commit authorization (refused before any connection)
for (const [label, extra] of [
  ['no --commit flag', { commitFlag: false }], ['P2_BOOTSTRAP_COMMIT not "yes"', { commitEnv: 'no' }], ['no P2_BOOTSTRAP_COMMIT', { commitEnv: undefined }], ['no approval string', { approved: undefined }],
  ['approval for another user id', { approved: B.approvalString('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', EMAIL, REF) }], ['approval for another e-mail', { approved: B.approvalString(UID, 'someone.else@example.test', REF) }],
  ['approval with another reference', { approved: B.approvalString(UID, EMAIL, 'OTHER-REF') }], ['approval string with trailing text', { approved: APPROVED + ' ' }]]) {
  const r = await run({}, 'commit', extra);
  t(`B1 commit refused before connecting (${label}): exit 2, no connection, nothing written`, r.res.exitCode === EXIT.REFUSED_FLAGS && r.db.connects === 0 && r.db.events.length === 0);
}
for (const [label, extra] of [['malformed user id', { userId: 'not-a-uuid' }], ['malformed e-mail', { email: 'nope' }], ['approval reference with spaces', { approvalRef: 'a b c d' }], ['missing approval reference', { approvalRef: '' }], ['missing user id', { userId: undefined }]]) {
  const r = await run({}, 'dry', extra); t(`B2 inputs refused before connecting (${label})`, r.res.exitCode === EXIT.REFUSED_FLAGS && r.db.connects === 0);
}
t('B3 the approval string binds the user id, the lower-cased e-mail and the reference', B.approvalString(UID, 'Dedicated.Admin@Example.Test', REF) === `approve-first-admin:${UID}:dedicated.admin@example.test:${REF}`);

// ============================================================ C. the first-administrator condition
for (const [label, initial] of [['a staff member exists', { members: 1 }], ['a staff role exists', { roles: 1 }], ['an enrolment window exists (open, lapsed or consumed)', { windows: 1 }], ['an approved factor exists', { factors: 1 }]]) {
  for (const mode of ['check', 'dry', 'commit']) {
    const r = await run({ initial }, mode);
    t(`C1 ${mode}: refused when ${label} (refused_first_admin_exists, exit 4); no transaction, nothing written`, r.res.outcome === 'refused_first_admin_exists' && r.res.exitCode === EXIT.REFUSED_STATE && cnt(r.ids, 'begin') === 0 && !wrote(r.ids));
  }
}
{
  const r = await run({ raceStaff: true }, 'commit');
  t('C2 a first administrator appearing after the advisory lock (a racing run) is caught by the in-transaction re-check: ROLLBACK, no write, no commit', r.res.outcome === 'refused_in_tx_first_admin_exists' && r.res.exitCode === EXIT.REFUSED_STATE && !wrote(r.ids) && r.db.commits === 0);
  const m = await run({ migrations: 2 }, 'commit'); t('C3 refused when migration 0002/0003/0004 are not all applied', m.res.outcome === 'refused_migrations_missing' && !wrote(m.ids));
  const f = await run({ functions: 3 }, 'commit'); t('C3 refused when a required function is missing', f.res.outcome === 'refused_migrations_missing' && !wrote(f.ids));
  const c = await run({ caps: 0 }, 'commit'); t('C4 refused when the admin role has no capabilities defined', c.res.outcome === 'refused_no_admin_capabilities' && !wrote(c.ids));
}

// ============================================================ D. identity eligibility
for (const [label, user, outcome] of [
  ['the user does not exist', null, 'refused_identity_mismatch'], ['the id does not match the approved id', { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }, 'refused_identity_mismatch'], ['the e-mail does not match the approved e-mail', { email: 'other@example.test' }, 'refused_identity_mismatch'],
  ['the e-mail is unconfirmed', { confirmed: false }, 'refused_ineligible_identity'], ['the account is banned', { banned: true }, 'refused_ineligible_identity'], ['the account is deleted', { deleted: true }, 'refused_ineligible_identity'],
  ['the account has no sign-in identity', { has_identity: false }, 'refused_ineligible_identity'], ['the account predates the P3 application (a validation account)', { created_after: false }, 'refused_ineligible_identity'],
  ['the account is an organization member', { memberships: 1 }, 'refused_ineligible_identity'], ['the account already has an authenticator factor', { factors: 1 }, 'refused_ineligible_identity']]) {
  const r = await run({ user }, 'commit');
  t(`D1 refused when ${label} (${outcome}, exit 4): no transaction, nothing written`, r.res.outcome === outcome && r.res.exitCode === EXIT.REFUSED_STATE && cnt(r.ids, 'begin') === 0 && !wrote(r.ids) && untouched(r));
}
t('D2 the validation-account cutoff is the P3 application time (a dedicated administrator must be created after it)', B.PINS.adminCreatedAfter === '2026-11-10T21:04:32Z');

// ============================================================ E. failures and ambiguity
for (const at of ['insStaff', 'insRole']) {
  const r = await run({ failAt: at }, 'commit');
  t(`E1 a failing write (${at}, e.g. a database guard) rolls everything back: outcome rolled_back_error, exit 1, COMMIT never sent, nothing persisted`, r.res.outcome === 'rolled_back_error' && r.res.exitCode === EXIT.FAILED_ROLLED_BACK && r.db.commits === 0 && untouched(r) && cnt(r.ids, 'rollback') >= 1);
}
{
  const r = await run({ noAudit: true }, 'commit');
  t('E2 in-transaction verification failing (no audit row) rolls back and never commits, even in commit mode', r.res.outcome === 'rolled_back_verification_failed' && r.res.exitCode === EXIT.FAILED_ROLLED_BACK && r.db.commits === 0 && untouched(r));
  const a = await run({ failCommit: 'before' }, 'commit');
  t('E3 COMMIT fails and nothing persisted: sent once (no retry), commit_error_not_persisted_verified_clean, exit 6, a fresh connection proves a clean state', a.res.outcome === 'commit_error_not_persisted_verified_clean' && a.res.exitCode === EXIT.COMMIT_AMBIGUOUS && cnt(a.ids, 'commit') === 1 && untouched(a));
  const b = await run({ failCommit: 'after' }, 'commit');
  t('E4 COMMIT reports an error but the state persisted: sent once, no retry or repair, commit_error_but_persisted_verified, exit 6', b.res.outcome === 'commit_error_but_persisted_verified' && b.res.exitCode === EXIT.COMMIT_AMBIGUOUS && cnt(b.ids, 'commit') === 1 && b.db.s.members === 1);
  const n = await run({ failConnectAt: 1 }, 'commit');
  t('E5 a TLS/connection failure stops the run (exit 3) with ZERO statements; the error is logged as its code only', n.res.exitCode === EXIT.REFUSED_TARGET && n.db.events.length === 0 && n.lines.some((l) => /DEPTH_ZERO_SELF_SIGNED_CERT/.test(l)) && !n.lines.join('\n').includes('S3CR3T'));
  const m = await run({ failConnectAt: 2 }, 'commit'); t('E6 the transaction connection failing writes nothing and does not commit', !wrote(m.ids) && m.db.commits === 0 && untouched(m));
}

// ============================================================ F. SQL allow-list and static review
{
  const send = B.makeSender([]); const sent = []; const c = { query: async (x) => { sent.push(x); return { rows: [] }; } };
  const refused = []; for (const text of ['insert into public.staff_members (user_id, status) values (1, 2)', 'update public.staff_roles set role = $1', 'delete from public.staff_members', 'select * from auth.mfa_factors', "insert into public.staff_roles (user_id, role, granted_by) values ($1::uuid, 'finance', null)", 'commit; select 1']) { try { send(c, text); } catch (e) { if (/NOT ALLOW-LISTED/.test(e.message)) refused.push(text); } }
  t('F1 any other SQL (other roles, updates, deletes, factor reads, extra statements) is refused BEFORE sending', refused.length === 6 && sent.length === 0);
  t('F2 the only writing statements in the registry are the staff row, the admin role (ONLY the admin role), the window, the audit call and COMMIT', JSON.stringify(Object.entries(SQL).filter(([, x]) => /^\s*(insert|update|delete|truncate)/i.test(x) || /private\.write_audit\(/.test(x) || /^commit$/i.test(x)).map(([id]) => id).sort()) === JSON.stringify(['audit', 'commit', 'insRole', 'insStaff', 'insWindow']) && /values \(\$1::uuid, 'admin', null\)/.test(SQL.insRole));
  const src = readFileSync(TOOL, 'utf8'); const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  t('F3 one COMMIT site; no retry; strict TLS builder; no connection string passed to pg; no service-role or secret reads; the only environment variables are P2_DATABASE_URL, P2_BOOTSTRAP_APPROVED and P2_BOOTSTRAP_COMMIT', (code.match(/SQL\.commit\b/g) ?? []).length === 1 && !/\bretry|setTimeout|while\s*\(true\)/.test(code) && /buildClientConfig\(tg\)/.test(code) && /assertTls\(k\)/.test(code) && !/connectionString/.test(code) && !/SERVICE_ROLE|service_role_key/i.test(code) && [...code.matchAll(/process\.env\.(\w+)/g)].every((m) => ['P2_DATABASE_URL', 'P2_BOOTSTRAP_APPROVED', 'P2_BOOTSTRAP_COMMIT'].includes(m[1])));
  t('F4 nothing secret or sensitive reaches a log: no URL, password or error message (codes only); the result file never holds the e-mail', !/(note|rep)\([^;]*(\.password|SECRETS|\.message)/.test(code) && !/email/.test(code.slice(code.indexOf('first-admin-bootstrap-result'), code.indexOf('first-admin-bootstrap-result') + 400)));
  t('F5 no general super-admin mechanism: no super_admin role, a single hard-coded admin role grant, no arbitrary role or user parameter reaches a write', !/super[_-]?admin/i.test(code) && (code.match(/'admin'/g) ?? []).length >= 1 && !/--role\b/.test(code));
}

// ============================================================ G. CLI gates (offline, before any connection)
{
  const env = { ...process.env }; delete env.P2_DATABASE_URL; delete env.P2_BOOTSTRAP_APPROVED; delete env.P2_BOOTSTRAP_COMMIT;
  const cli = (args, e = env) => spawnSync('node', [TOOL, ...args], { encoding: 'utf8', env: e, timeout: 60000 });
  const self = (cli(['--offline-selftest']).stdout.match(/\(([0-9a-f]{64})\)/) ?? [])[1];
  t('G1 the self-test passes and prints the tool hash', Boolean(self) && /offline self-test: \d+ passed, 0 FAILED/.test(cli(['--offline-selftest']).stdout));
  for (const [label, args, code] of [['no --harness-sha', ['--user-id', UID, '--email', EMAIL, '--approval-ref', REF], 2], ['a wrong --harness-sha', ['--harness-sha', '0'.repeat(64), '--user-id', UID, '--email', EMAIL, '--approval-ref', REF], 2], ['no credentials available', ['--harness-sha', self, '--user-id', UID, '--email', EMAIL, '--approval-ref', REF], 2]]) {
    const r = cli(args); t(`G2 CLI refuses (${label}) with exit ${code} before any connection`, r.status === code && !/BEFORE|transaction open|inputs:/.test(r.stdout.split('\n').slice(-3).join('\n').replace(/inputs:.*/g, '')), `exit ${r.status}`);
  }
  const fakeUrl = `postgresql://postgres:placeholder@db.semtmllmwhxznxechfsk.supabase.co:5432/postgres`; // a placeholder: every case below must refuse BEFORE any connection
  for (const [label, args, e] of [['commit without the approval variables', ['--commit'], {}], ['commit with a wrong approval string', ['--commit'], { P2_BOOTSTRAP_COMMIT: 'yes', P2_BOOTSTRAP_APPROVED: 'approve-first-admin:wrong' }], ['a malformed user id', ['--check'], {}]]) {
    const a = ['--harness-sha', self, '--user-id', label.includes('malformed') ? 'bad' : UID, '--email', EMAIL, '--approval-ref', REF, ...args];
    const r = cli(a, { ...env, P2_DATABASE_URL: fakeUrl, ...e }); t(`G3 CLI refuses before connecting (${label}): exit 2`, r.status === 2 && !/BEFORE|PRE-STATE|transaction open|URL host/.test(r.stdout), `exit ${r.status}`);
  }
}

console.log(bad === 0 ? 'all offline bootstrap tests pass (fake database only: NOT evidence that the tool works against the real database)' : `${bad} FAILED`); process.exit(bad ? 1 : 0);
