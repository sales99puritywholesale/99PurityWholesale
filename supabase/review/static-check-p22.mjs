// TEXT-PATTERN GUARDRAIL for the P2.2+ migration drafts (0003 and later). NOT a SQL parser, NOT a proof of correctness and NOT a
// database test: it never connects to a database and does not prove the SQL parses or behaves. Passing means "no listed pattern
// found". The frozen checker static-check.mjs keeps governing 0001/0002 (its rule "every function lives in private" cannot hold for
// RPCs, which must live in the exposed schema public).
// Usage: node supabase/review/static-check-p22.mjs [--selftest] [file.sql ...]   (default: 0003..9999 drafts next to this file)
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase();
// rev5 (F8): initiate, approve, request and attest RPCs are mutating too (rev4 passed P19/P20 for them only because the audit calls happened to exist).
const MUTATING = /(grant|revoke|add|set|authorize|claim|create|remove|accept|transfer|invite|resend|lookup|cancel|reject|restore|change|initiate|approve|request|attest|refresh)/;
// RPC functions that are deliberately NOT capability-gated and the reason they may skip private.staff_gate / ownership checks
// Owner-MFA RPCs authorize themselves (active owner lookup, step-up, window checks) and are still subject to the audit rules P19/P20.
const OWNER_SELF_GATED = {
  rpc_owner_open_factor_window: 'active owner + strong-condition checks per factor state, audited',
  rpc_owner_claim_factor: 'active owner + step-up + open window; eligibility enforced by the approval trigger, audited',
  rpc_owner_set_recovery_codes: 'active non-staff owner + approved clean session + fresh step-up, audited',
  rpc_owner_recovery_request: 'authenticated caller; non-owner and staff get the generic refusal; per-user throttle keyed inside the database; audited',
  rpc_owner_recovery_cancel: 'active non-staff owner cancels only their own pending request, audited',
  rpc_owner_revoke_factor_window: 'active owner with approved clean session and fresh step-up revokes only their own additional window, audited (rev4)',
  rpc_refresh_auth_structure_check: 'rev7 (F7): input-free; only an active staff member or an active organization owner (else not_available, no write); per-user and global rate limits; the result is computed from the catalogs; audited when it runs',
};
const GATE_EXEMPT = {
  rpc_my_staff_context: 'reads only the caller\'s own status',
  rpc_my_owner_context: 'reads only the caller\'s own membership and assurance state',
  rpc_staff_claim_factor: 'self-service claim by an active staff member under step-up, rules enforced by the 0002 trigger',
  rpc_throttle_password_recovery: 'runs BEFORE sign-in by design; takes only two opaque keyed hashes and returns only {allowed, retry_after_secs}',
};
// The ONLY functions that may be granted to anon (reviewed individually). Everything else granted to anon, service_role or public fails P7.
const ANON_ALLOWED = new Set(['public.rpc_throttle_password_recovery(bytea,bytea)']);
const PRIVATE_EXECUTE_ALLOWED = ['my_org_ids', 'my_owner_org_ids', 'staff_session_ok', 'has_capability', 'my_mfa_owner_org_ids'];

function parseFunctions(sql) {
  const re = /create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_]+)\s*\(([^)]*)\)([\s\S]*?)\bas\s+\$\$([\s\S]*?)\$\$/gi;
  const out = []; let m;
  while ((m = re.exec(sql))) out.push({ full: m[1], schema: m[1].split('.')[0], name: m[1].split('.')[1], args: m[2], header: m[3], body: m[4] });
  return out;
}

export function check(name, raw) {
  const sql = strip(raw); const f = []; const add = (rule, msg) => f.push(`${rule}: ${msg}`);
  const fns = parseFunctions(sql); const nsql = norm(sql);
  const noStrings = sql.replace(/'(?:[^']|'')*'/g, "''");

  if (/\bsecret\b/i.test(sql.replace(/\bsecret[s]?_/gi, ''))) add('P1-no-secret-column', 'reference to "secret"');
  if (/super[_-]?admin/i.test(sql)) add('P2-no-super-admin', 'super_admin introduced');
  if (/user_metadata|raw_user_meta_data|raw_app_meta_data|app_metadata/i.test(sql)) add('P3-no-metadata-authorization', 'metadata reference');
  if (/eyJ[A-Za-z0-9_-]{10,}|sb_secret_|sb_publishable_|service_role_key/i.test(sql)) add('P4-no-embedded-credentials', 'credential-like string');
  if (/\b(insert\s+into|update|delete\s+from)\s+auth\./i.test(noStrings)) add('P5-no-writes-to-auth-schema', 'DML against the auth schema');
  if (/\b(drop|truncate)\b/i.test(noStrings.replace(/before truncate/gi, ''))) add('P6-no-drop-or-truncate', 'DROP or TRUNCATE statement');
  for (const g of noStrings.matchAll(/\bgrant\b([^;]*?)\bto\b([^;]*);/gi)) {
    const who = g[2].toLowerCase();
    if (!/\b(anon|service_role|public)\b/.test(who)) continue;
    const onlyAnonAndAuth = /^\s*anon\s*,\s*authenticated\s*$/.test(who);
    const fnsGranted = /grant\s+execute\s+on\s+function/i.test(g[0]) ? [...g[1].matchAll(/[a-z_]+\.[a-z_]+\([^)]*\)/gi)].map((x) => x[0].toLowerCase().replace(/\s+/g, '')) : [];
    const allowed = onlyAnonAndAuth && fnsGranted.length > 0 && fnsGranted.every((x) => ANON_ALLOWED.has(x));
    if (!allowed) add('P7-no-grant-to-anon-service-public', `grant ${norm(g[1]).trim()} to ${who.trim()}`);
  }
  if (/\bgrant\b[^;]*\ball\b/i.test(noStrings)) add('P8-no-grant-all', 'GRANT ALL');

  // rev6+ rules (files whose name carries a revision marker rev6 or later; earlier revisions are preserved history and are not re-judged by them)
  const isRev6 = /\brev([6-9]|[1-9]\d)\b/.test(name);
  if (isRev6) {
    // P31: no database-side HTTP, no autonomous-transaction emulation, no service-role dependency (no factor-removal broker exists in rev6)
    if (/\b(pg_net|http_get|http_post|http_request|net\.http|dblink|pg_background|create\s+extension)\b/i.test(noStrings)) add('P31-no-http-or-autonomous-extension', 'database HTTP or autonomous-transaction mechanism');
    if (/service_role/i.test(noStrings.replace(/from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/gi, '').replace(/has_(function|table)_privilege\(\s*''/gi, ''))) add('P31-no-service-role-dependency', 'a reference to service_role outside the REVOKE lists and privilege assertions');
  }
  // P29: fail-closed factor reads. Only the structure-checked helpers, the state function, the MFA predicate and the factor gate (the row of the factor itself) may read auth.mfa_factors directly.
  const FACTOR_READERS = new Set(['owner_verified_factor_ids', 'owner_factor_state', 'owner_mfa_ok', 'guard_owner_mfa_factor_insert', 'owner_factor_row_class']);
  for (const fn of fns) {
    if (!isRev6) break;
    if (/auth\.mfa_factors/i.test(fn.body) && !FACTOR_READERS.has(fn.name)) add('P29-factor-read-outside-helpers', `${fn.full}: reads auth.mfa_factors directly; use private.owner_verified_factor_ids() (NULL = unknown)`);
    // a helper result must never be turned into zero: coalesce(owner_verified_factor_ids(...)) or cardinality(...) compared with zero without a NULL guard is flagged
    if (/coalesce\s*\(\s*private\.owner_verified_factor_ids/i.test(fn.body)) add('P29-unknown-read-as-empty', `${fn.full}: coalesce() over private.owner_verified_factor_ids turns UNKNOWN into empty`);
  }
  // rev7 rules (files whose name carries rev7 or later; rev6 and earlier are preserved history and are not re-judged by them)
  const isRev7 = /\brev([7-9]|[1-9]\d)\b/.test(name);
  if (isRev7) {
    // P32 (F1): a count over private.owner_mfa_factors in a limit must be over LIVE factors (= any(<verified ids>)); a lifetime count makes the fourth recovery impossible
    for (const fn of fns) for (const m of fn.body.matchAll(/count\(\*\)\s+from\s+private\.owner_mfa_factors\b([^;]*?)(?:\)\s*(?:>=|>|<=|<|=)|;)/gi)) if (!/=\s*any\s*\(/i.test(m[1])) add('P32-lifetime-factor-count', `${fn.full}: count(*) over private.owner_mfa_factors is not restricted to live verified factors (= any(...))`);
    // P33 (F2): assertions on deparsed catalog text must be case-insensitive: LIKE / case-sensitive regex / position() on pg_get_* output, pg_policies text or proconfig text
    const rawSql = strip(raw);
    for (const m of rawSql.matchAll(/pg_get_(?:constraintdef|functiondef|indexdef|triggerdef|viewdef)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*(?:not\s+)?(?:like\b|!?~(?!\*))/gi)) add('P33-case-sensitive-deparse-assertion', `case-sensitive comparison on deparsed catalog text: ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`);
    for (const m of rawSql.matchAll(/position\s*\(\s*'[^']*'\s+in\s+pg_get_functiondef/gi)) add('P33-case-sensitive-deparse-assertion', 'position() on pg_get_functiondef output is case-sensitive; use ~*');
    for (const m of rawSql.matchAll(/\b(?:qual|with_check)\s+(?:not\s+)?like\b/gi)) add('P33-case-sensitive-deparse-assertion', 'LIKE on pg_policies text; use ilike');
    for (const m of rawSql.matchAll(/\bc\s*=\s*'search_path=/gi)) add('P33-case-sensitive-deparse-assertion', 'exact comparison on proconfig text; normalize quotes and blanks first');
    // P34 (F13): no data-modifying CTE as the query of a FOR loop (rev4 to rev6 form, never executed); use SELECT ... FOR UPDATE and a per-row UPDATE
    if (/\bfor\s+\w+\s+in\s+with\b/i.test(noStrings)) add('P34-for-loop-with-modifying-cte', 'FOR ... IN WITH ... loop: use a locking SELECT loop and a per-row UPDATE');
    // P35 (F3): the stranded anchor is the request with the latest removal EVIDENCE, never "the owner's latest request"
    for (const fn of fns) if (fn.name === 'owner_stranded_request' && (!/evidence_at/.test(fn.body) || /order by l\.created_at desc/i.test(fn.body))) add('P35-stranded-anchor-latest-request', `${fn.full}: the stranded anchor must be the latest removal evidence, not the latest request`);
    if (/create\s+unique\s+index\s+owner_recovery_exceptions_one_live_idx/i.test(noStrings)) add('P35-one-live-exception-index', 'the one-live-exception-per-anchor index blocks every further exception after a fruitless consumption');
    // P36 (F7): the refresh RPC takes no argument, calls only the catalog check, is rate limited and never reads auth.mfa_factors itself
    for (const fn of fns) if (fn.name === 'rpc_refresh_auth_structure_check') {
      if (fn.args.trim() !== '') add('P36-refresh-takes-input', `${fn.full}: must take no argument (the result must not be influenced by the caller)`);
      if (!/private\.run_auth_structure_check\(\)/.test(fn.body) || !/private\.rate_limit_hit\('structure_refresh'/.test(fn.body) || !/pg_advisory_xact_lock\(hashtextextended\('p2:structure_check_refresh'/.test(fn.body)) add('P36-refresh-controls', `${fn.full}: must call the catalog check, the structure_refresh limit and the shared advisory lock`);
      if (!/'12 hours'/.test(fn.body) || !/'15 minutes'/.test(fn.body)) add('P36-refresh-global-limit', `${fn.full}: the global 12 hour and 15 minute rules are missing`);
    }
    // P37 (F5): the unrecognized-factor RPCs require step-up, name owner and factor, use the row classifier and never touch recognized factors
    for (const fn of fns) if (/^rpc_staff_(begin|complete)_unrecognized_factor_removal$/.test(fn.name)) {
      if (!/private\.staff_gate\('owner\.mfa\.authorize'[^;]*,\s*true\s*,/.test(fn.body)) add('P37-unrecognized-no-step-up', `${fn.full}: must use the staff gate with a fresh step-up`);
      if (!/private\.owner_factor_row_class\(/.test(fn.body)) add('P37-unrecognized-no-classifier', `${fn.full}: must classify the row through private.owner_factor_row_class`);
      if (fn.name.includes('begin') && !/p_owner_user_id uuid,\s*p_factor_id uuid/.test(fn.args)) add('P37-unrecognized-no-explicit-confirmation', `${fn.full}: must take the owner id AND the factor id`);
      if (fn.name.includes('begin') && !/<>\s*'unrecognized'/.test(fn.body)) add('P37-unrecognized-accepts-recognized', `${fn.full}: must refuse every class other than unrecognized`);
    }
    // P38 (F4): the extension RPC has the bounded no-show path (the fourth window only); the fifth window always needs a verified removal
    for (const fn of fns) if (fn.name === 'rpc_staff_authorize_extra_recovery_window' && (!/'no_show'/.test(fn.body) || !/windows_issued\s*=\s*3\s+and\s+v_req\.extra_windows_granted\s*=\s*0/.test(fn.body))) add('P38-extension-no-show-path', `${fn.full}: the bounded no-show path (windows_issued = 3 and no extension yet) is missing or unbounded`);
  }
  for (const fn of fns) {
    const hdr = norm(fn.header); const body = norm(fn.body);
    const definer = /security definer/.test(hdr);
    if (!/set search_path = ''/.test(hdr)) add('P9-pinned-search-path', `${fn.full}: search_path = '' missing`);
    if (/\bexecute\b/.test(body)) add('P10-no-dynamic-sql', `${fn.full}: EXECUTE inside body`);
    if (/auth\.(uid|jwt)\(\)/.test(body.replace(/\(select auth\.(uid|jwt)\(\)\)/g, ''))) add('P11-wrapped-auth-calls', `${fn.full}: auth.uid()/auth.jwt() must be wrapped as (select auth.uid())`);
    // Only for EXPOSED functions: private helpers such as private.write_audit take the actor explicitly because their callers
    // (definer RPCs) have already derived it from auth.uid(); they are not executable by any API role.
    if (fn.schema === 'public' && /\bp_(actor|caller|user_role|role_of_caller|is_admin|is_staff)\w*\b/.test(norm(fn.args))) add('P12-no-caller-identity-parameter', `${fn.full}: caller identity or privilege must come from auth.uid(), never a parameter`);
    if (fn.schema === 'public') {
      if (!/^rpc_[a-z_]+$/.test(fn.name)) add('P13-public-function-naming', `${fn.full}: public functions must be named rpc_*`);
      if (!definer) add('P14-rpc-security-definer', `${fn.full}: public RPC must be SECURITY DEFINER`);
      if (!/returns jsonb/.test(hdr)) add('P15-rpc-returns-jsonb', `${fn.full}: public RPC must return jsonb`);
      if (!/(volatile|stable)/.test(hdr)) add('P16-rpc-volatility-explicit', `${fn.full}: state volatility explicitly`);
      if (!/\(select auth\.uid\(\)\)/.test(body) && fn.name !== 'rpc_throttle_password_recovery') add('P17-rpc-uses-caller-identity', `${fn.full}: must derive the caller from (select auth.uid())`);
      // P30 (rev6+): every public RPC except the anon throttle and the read-only contexts calls the READ COMMITTED guard BEFORE the gate, any lock, counter or write
      if (isRev6 && !['rpc_throttle_password_recovery', 'rpc_my_owner_context', 'rpc_my_staff_context'].includes(fn.name)) {
        const g = body.indexOf('private.require_read_committed()');
        const firsts = ['private.staff_gate(', 'pg_advisory_xact_lock', 'private.rate_limit_hit', 'private.write_audit(', 'insert into', 'update ', 'delete from'].map((k) => body.indexOf(k)).filter((p) => p >= 0);
        if (g < 0 || (firsts.length && g > Math.min(...firsts))) add('P30-isolation-guard-first', `${fn.full}: private.require_read_committed() must be the first action`);
      }
      const gated = /private\.staff_gate\(/.test(body) || /private\.my_owner_org_ids\(\)/.test(body) || /private\.my_org_ids\(\)/.test(body) || /private\.staff_session_ok\(\)/.test(body);
      if (!gated && !GATE_EXEMPT[fn.name] && !OWNER_SELF_GATED[fn.name]) add('P18-rpc-authorization-gate', `${fn.full}: no staff gate, session check or organization-scope check found`);
      if (MUTATING.test(fn.name) && !GATE_EXEMPT[fn.name] && !/private\.write_audit\(/.test(body)) add('P19-mutation-audited', `${fn.full}: mutating RPC does not write an audit event`);
      if (MUTATING.test(fn.name) && !/'success'/.test(body) && !GATE_EXEMPT[fn.name] && /rpc_.*(grant|revoke|add|set|authorize|claim|initiate|approve|request|attest|cancel|refresh)/.test(fn.name)) add('P20-success-audit', `${fn.full}: no success audit`);
      const revoked = new RegExp(`revoke\\s+all\\s+on\\s+function[^;]*${fn.full.replace('.', '\\.')}\\([^)]*\\)[^;]*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role`, 'i').test(noStrings);
      const grantee = ANON_ALLOWED.has(`${fn.full}(${norm(fn.args).replace(/\bp_[a-z_]+\s+/g, '').replace(/\s+/g, '')})`) ? 'anon\\s*,\\s*authenticated' : 'authenticated';
      const granted = new RegExp(`grant\\s+execute\\s+on\\s+function[^;]*${fn.full.replace('.', '\\.')}\\([^)]*\\)[^;]*to\\s+${grantee}\\s*;`, 'i').test(noStrings);
      if (!revoked) add('P21-rpc-revoke-all', `${fn.full}: no REVOKE ALL ... FROM public, anon, authenticated, service_role`);
      if (!granted) add('P22-rpc-grant-authenticated-only', `${fn.full}: no GRANT EXECUTE ... TO authenticated`);
    } else if (fn.schema === 'private') {
      if (/\bgrant\s+execute\b[^;]*\bprivate\./i.test(noStrings) && !new RegExp(PRIVATE_EXECUTE_ALLOWED.join('|')).test(noStrings)) add('P23-private-execute-grants', 'unexpected EXECUTE grant on a private function');
    }
  }
  // any function in private granted to authenticated must be in the approved set
  for (const m of noStrings.matchAll(/grant\s+execute\s+on\s+function\s+([^;]*?)\s+to\s+authenticated/gi)) for (const q of m[1].matchAll(/private\.([a-z_]+)\(/gi)) if (!PRIVATE_EXECUTE_ALLOWED.includes(q[1])) add('P23-private-execute-grants', `private.${q[1]} granted to authenticated`);

  // tables
  for (const t of noStrings.matchAll(/create\s+table\s+([a-z_]+\.[a-z_]+)/gi)) {
    const tn = t[1].toLowerCase();
    if (!new RegExp(`alter\\s+table\\s+${tn.replace('.', '\\.')}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(noStrings)) add('P24-rls-enabled', `${tn}: RLS not enabled`);
    if (!new RegExp(`revoke\\s+all\\s+on\\s+table[^;]*${tn.replace('.', '\\.')}[^;]*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role`, 'i').test(noStrings)) add('P25-table-revoke-all', `${tn}: no REVOKE ALL from public, anon, authenticated, service_role`);
    if (/force row level security/i.test(noStrings)) add('P26-no-force-rls', 'FORCE ROW LEVEL SECURITY would break the definer design; not part of the approved design');
  }
  if (/create\s+table/i.test(noStrings) && !/do\s+\$\$/i.test(nsql)) add('P27-self-check', 'migration creates objects but has no self-check DO block');
  if (/\bbegin\s*;|\bcommit\s*;/i.test(noStrings)) add('P28-no-explicit-transaction-control', 'BEGIN/COMMIT in a migration (the runner wraps the file)');
  return { name, findings: f, stats: { functions: fns.length, definers: fns.filter((x) => /security definer/i.test(x.header)).length, publicRpcs: fns.filter((x) => x.schema === 'public').length } };
}

function selftest() {
  const base = (body, extra = '', hdr = `language plpgsql volatile security definer set search_path = ''`, name = 'public.rpc_x_set') => `
create function ${name}(p_id uuid) returns jsonb ${hdr} as $$ declare v uuid := (select auth.uid()); g text; begin g := private.staff_gate('staff.manage','a.b',true,'x',null); ${body} perform private.write_audit(v,'staff','a.b','success',null,null,null,'{}'::jsonb); return '{}'::jsonb; end; $$;
revoke all on function ${name}(uuid) from public, anon, authenticated, service_role;
grant execute on function ${name}(uuid) to authenticated; ${extra}`;
  const cases = [
    ['clean sample', base(''), null],
    ['missing search_path', base('', '', 'language plpgsql volatile security definer'), 'P9'],
    ['not security definer', base('', '', `language plpgsql volatile set search_path = ''`), 'P14'],
    ['dynamic SQL', base(`execute 'select 1';`), 'P10'],
    ['unwrapped auth.uid()', base(`v := auth.uid();`), 'P11'],
    ['wrong public name', base('', '', undefined, 'public.do_it'), 'P13'],
    ['returns text', base('').replace('returns jsonb', 'returns text'), 'P15'],
    ['grant to anon', base('', `grant execute on function public.rpc_x_set(uuid) to anon;`), 'P7'],
    ['anon + authenticated grant of a function that is NOT on the allowlist', base('', `grant execute on function public.rpc_x_set(uuid) to anon, authenticated;`), 'P7'],
    ['anon grant on a private function', base('', `grant execute on function private.write_audit(uuid) to anon, authenticated;`), 'P7'],
    ['allowlisted anon throttle is accepted', `create function public.rpc_throttle_password_recovery(p_email_hash bytea, p_ip_hash bytea) returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin return '{}'::jsonb; end; $$;
revoke all on function public.rpc_throttle_password_recovery(bytea, bytea) from public, anon, authenticated, service_role;
grant execute on function public.rpc_throttle_password_recovery(bytea, bytea) to anon, authenticated;`, null],
    ['allowlisted function granted to service_role is still refused', `create function public.rpc_throttle_password_recovery(p_email_hash bytea, p_ip_hash bytea) returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin return '{}'::jsonb; end; $$;
revoke all on function public.rpc_throttle_password_recovery(bytea, bytea) from public, anon, authenticated, service_role;
grant execute on function public.rpc_throttle_password_recovery(bytea, bytea) to anon, authenticated;
grant execute on function public.rpc_throttle_password_recovery(bytea, bytea) to service_role;`, 'P7'],
    ['grant to service_role', base('', `grant select on public.t to service_role;`), 'P7'],
    ['grant all', base('', `grant all on public.t to authenticated;`), 'P8'],
    ['no gate', base('').replace(`g := private.staff_gate('staff.manage','a.b',true,'x',null);`, ''), 'P18'],
    ['no audit', base('').replace(`perform private.write_audit(v,'staff','a.b','success',null,null,null,'{}'::jsonb);`, ''), 'P19'],
    // rev6 rules: the label carries the revision marker the rules key on
    ['rev6 clean sample (guard first, helper read)', base('perform private.require_read_committed();').replace('g := private.staff_gate', 'perform private.require_read_committed(); g := private.staff_gate'), null],
    ['rev6 direct auth.mfa_factors read in an RPC', base('perform private.require_read_committed(); perform 1 from auth.mfa_factors;'), 'P29'],
    ['rev6 unknown read as empty via coalesce', base('perform private.require_read_committed(); perform coalesce(private.owner_verified_factor_ids(v), \'{}\'::uuid[]);'), 'P29'],
    ['rev6 RPC without the isolation guard', base('perform 1;'), 'P30'],
    ['rev6 isolation guard after the gate', base('perform 1;').replace('perform 1;', 'perform private.require_read_committed();'), 'P30'],
    ['rev6 database HTTP extension', base('perform private.require_read_committed();', 'select net.http_post(url := 1);'), 'P31'],
    ['rev6 dblink', base('perform private.require_read_committed();', 'create extension dblink;'), 'P31'],
    ['rev6 service_role grant', base('perform private.require_read_committed();', 'grant execute on function public.rpc_x_set(uuid) to service_role;'), 'P31'],
    // rev5 (F8): the recovery-workflow verbs are mutating; a missing audit or a missing success audit must now be caught for them too
    ...['initiate', 'approve', 'request', 'attest'].flatMap((verb) => {
      const nm = `public.rpc_x_${verb}`;
      const noAudit = base('', '', undefined, nm).replace(`perform private.write_audit(v,'staff','a.b','success',null,null,null,'{}'::jsonb);`, '');
      const denyOnly = base('', '', undefined, nm).replace(`'success'`, `'denied'`);
      return [[`${verb}: no audit at all is flagged (P19)`, noAudit, 'P19'], [`${verb}: no success audit is flagged (P20)`, denyOnly, 'P20'], [`${verb}: clean sample accepted`, base('', '', undefined, nm), null]];
    }),
    // rev7 rules: the label carries the revision marker the rules key on
    ['rev7 lifetime factor count (F1)', base('perform private.require_read_committed(); if (select count(*) from private.owner_mfa_factors a where a.user_id = v) >= 3 then null; end if;'), 'P32'],
    ['rev7 live factor count accepted (F1)', base('perform private.require_read_committed(); if (select count(*) from private.owner_mfa_factors a where a.user_id = v and a.factor_id = any (v_ids)) >= 3 then null; end if;').replace('g := private.staff_gate', 'perform private.require_read_committed(); g := private.staff_gate'), null],
    ['rev7 case-sensitive constraint assertion (F2)', base('', `do $$ begin if not exists (select 1 from pg_constraint c where pg_get_constraintdef(c.oid) like '%greatest%') then null; end if; end; $$;`), 'P33'],
    ['rev7 case-sensitive position() assertion (F2)', base('', `do $$ begin if position('x' in pg_get_functiondef('private.f()'::regprocedure)) = 0 then null; end if; end; $$;`), 'P33'],
    ['rev7 case-sensitive policy assertion (F2)', base('', `do $$ begin if exists (select 1 from pg_policies where qual like '%x%') then null; end if; end; $$;`), 'P33'],
    ['rev7 case-insensitive assertions accepted (F2)', base('', `do $$ begin if not exists (select 1 from pg_constraint c where pg_get_constraintdef(c.oid) ~* 'greatest') and exists (select 1 from pg_policies where qual ilike '%x%') then null; end if; end; $$;`).replace('g := private.staff_gate', 'perform private.require_read_committed(); g := private.staff_gate').replace("base_placeholder", ''), null],
    ['rev7 FOR loop over a data-modifying CTE (F13)', base('perform private.require_read_committed(); for r in with upd as (update private.t set a = 1 returning id) select id from upd loop null; end loop;'), 'P34'],
    ['rev7 stranded anchor = latest request (F3)', `create function private.owner_stranded_request(p_user uuid) returns uuid language plpgsql stable security definer set search_path = '' as $$ begin return (select l.id from private.owner_recovery_requests l where l.user_id = p_user order by l.created_at desc limit 1); end; $$;`, 'P35'],
    ['rev7 one-live-exception index returns (F3)', base('', `create unique index owner_recovery_exceptions_one_live_idx on private.owner_recovery_exceptions (stranded_request_id) where status in ('consumed');`), 'P35'],
    ['rev7 refresh RPC with a parameter (F7)', base('').replace('public.rpc_x_set', 'public.rpc_refresh_auth_structure_check').replace(/rpc_x_set/g, 'rpc_refresh_auth_structure_check'), 'P36'],
    ['rev7 unrecognized RPC without step-up (F5)', base('perform private.require_read_committed(); perform private.owner_factor_row_class(v, v);', '', undefined, 'public.rpc_staff_begin_unrecognized_factor_removal').replace("'staff.manage','a.b',true", "'staff.manage','a.b',false"), 'P37'],
    ['rev7 extension without the bounded no-show path (F4)', base('perform private.require_read_committed();', '', undefined, 'public.rpc_staff_authorize_extra_recovery_window'), 'P38'],
    ['no revoke', base('').replace(/revoke all[^;]*;/, ''), 'P21'],
    ['no grant to authenticated', base('').replace(/grant execute[^;]*;/, ''), 'P22'],
    ['caller identity parameter', base('').replace('p_id uuid', 'p_actor uuid'), 'P12'],
    ['write to auth schema', base(`delete from auth.mfa_factors where true;`), 'P5'],
    ['drop statement', base('', `drop table public.t;`), 'P6'],
    ['private function granted to authenticated', base('', `grant execute on function private.write_audit(uuid) to authenticated;`), 'P23'],
    ['table without RLS', base('', `create table public.t (id uuid);`), 'P24'],
    ['table without revoke', base('', `create table public.t (id uuid); alter table public.t enable row level security;`), 'P25'],
    ['super_admin', base('', `-- c\ninsert into x values ('super_admin');`), 'P2'],
    ['metadata authorization', base(`if (select auth.jwt()) -> 'user_metadata' is null then null; end if;`), 'P3'],
    ['explicit transaction control', base('', `begin;`), 'P28'],
  ];
  let bad = 0;
  for (const [label, sql, expect] of cases) {
    const found = check(label, sql).findings.map((x) => x.split('-')[0]);
    const ok = expect === null ? found.length === 0 : found.includes(expect);
    if (!ok) { bad++; console.log(`SELFTEST FAIL  ${label}: expected ${expect ?? 'no findings'}, got [${found.join(',')}]`); }
  }
  const clean = cases.filter((c) => c[2] === null).length;
  console.log(bad ? `SELFTEST FAILED (${bad})` : `SELFTEST PASS (${cases.length} samples: ${clean} clean accepted + ${cases.length - clean} violations detected)`);
  return bad === 0;
}

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--selftest')) { process.exit(selftest() ? 0 : 1); }
const files = args.length ? args : readdirSync(here).filter((x) => /^(0*[3-9]|[1-9]\d)\d*_.*\.sql$/.test(x) && Number(x.split('_')[0]) >= 3).sort().map((x) => join(here, x));
let failed = false;
for (const file of files) {
  const r = check(file, readFileSync(file, 'utf8'));
  console.log(`${r.findings.length ? 'FAIL' : 'PASS'}  ${file.split(/[\\/]/).pop()}  (functions=${r.stats.functions}, definers=${r.stats.definers}, public RPCs=${r.stats.publicRpcs})`);
  for (const x of r.findings) console.log('      ' + x);
  if (r.findings.length) failed = true;
}
console.log(failed ? 'STATIC CHECK FAILED' : 'STATIC CHECK PASS (text-pattern guardrail only: no SQL was parsed or executed; not a proof of correctness)');
process.exit(failed ? 1 : 0);
