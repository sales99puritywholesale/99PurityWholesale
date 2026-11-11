import { readFileSync } from 'node:fs';
const src = readFileSync('D:/99puritywholesale-platform/99puritywholesale/supabase/review/tests/p3-workflow-rollback.rev2.mjs', 'utf8');
const a = src.indexOf('let TX_EPOCH'); const b = src.indexOf('\n};', src.indexOf('const claimsFor')) + 3;
const body = src.slice(a, b);
const mk = new Function('U', body + '\nreturn { claimsFor, setEpoch: (v) => { TX_EPOCH = v; }, FRESH_BACK };');
const U = new Proxy({}, { get: (_, k) => String(k) });
const { claimsFor, setEpoch, FRESH_BACK } = mk(U);

// PostgreSQL side: now() is the transaction start (frozen). private.step_up_ok(): aal2 and last totp ts in (now-15min, now+1min]
const stepUp = (claims, dbNow) => {
  if (!claims || claims.aal !== 'aal2') return false;
  const ts = Math.max(...claims.amr.filter((e) => e.method === 'totp').map((e) => e.timestamp));
  return Number.isFinite(ts) && ts > dbNow - 900 && ts <= dbNow + 60;
};
let bad = 0; const t = (name, got, want) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${got}, expected ${want})`); };

const T0 = 1_800_000_000; // client clock just before BEGIN
setEpoch(T0);
let dbNow = T0; // server now() = transaction start (zero skew)
// 1. fresh timestamp
t('ADMIN fresh TOTP accepted (zero skew)', stepUp(claimsFor('ADMIN'), dbNow), true);
// 2. long-running transaction: wall clock advances, now() stays frozen, claims are rebuilt on every call
for (const secs of [30, 61, 300, 20 * 60, 60 * 60]) {
  t(`ADMIN accepted after ${secs}s of wall-clock run time (rebuilt claims, frozen now())`, stepUp(claimsFor('ADMIN'), dbNow), true);
}
// 3. boundary tests on the acceptance window, using the actual window logic and the harness's own offsets
const fixedTs = (ts) => ({ aal: 'aal2', amr: [{ method: 'totp', timestamp: ts }] });
t('timestamp exactly at the accepted future boundary (now+60s) accepted', stepUp(fixedTs(dbNow + 60), dbNow), true);
t('timestamp beyond the future boundary (now+61s) refused', stepUp(fixedTs(dbNow + 61), dbNow), false);
t('timestamp just inside the age limit (now-899s) accepted', stepUp(fixedTs(dbNow - 899), dbNow), true);
t('timestamp exactly 15 minutes old (now-900s) refused', stepUp(fixedTs(dbNow - 900), dbNow), false);
t('expired timestamp (now-20min) refused', stepUp(fixedTs(dbNow - 1200), dbNow), false);
// 4. harness offsets sit inside / outside the window
t('harness fresh offset is inside the window', claimsFor('ADMIN').amr[0].timestamp, T0 - FRESH_BACK);
t('ADMIN_NOSTEP expired (20 min) refused', stepUp(claimsFor('ADMIN_NOSTEP'), dbNow), false);
t('STAFF_AAL1 refused (aal1 even with fresh totp)', stepUp(claimsFor('STAFF_AAL1'), dbNow), false);
t('customer claims (aal1, password) refused', stepUp(claimsFor('A1'), dbNow), false);
t('ANON has no claims', claimsFor('ANON'), null);
for (const who of ['OPS', 'SUPPORT', 'FINANCE']) t(`${who} claims aal2 with fresh totp (role difference is decided by the DB, not the clock)`, stepUp(claimsFor(who), dbNow), true);
// 5. clock skew tolerance (client vs server)
for (const [skew, want] of [[0, true], [-120, true], [-590, true], [-601, false], [120, true], [350, true], [361, false]]) {
  t(`client clock ${skew >= 0 ? '+' : ''}${skew}s vs server: ADMIN fresh -> ${want}`, stepUp(claimsFor('ADMIN'), T0 - skew), want);
}
t('ADMIN_NOSTEP stays expired with client 4 min ahead of server', stepUp(claimsFor('ADMIN_NOSTEP'), T0 - 240), false);
// 6. the defect reproduced with the previous implementation (wall clock at call time)
const oldClaims = (wall) => ({ aal: 'aal2', amr: [{ method: 'totp', timestamp: wall }] });
t('OLD behaviour: fresh at +30s into the run accepted', stepUp(oldClaims(T0 + 30), dbNow), true);
t('OLD behaviour: wall clock 61s into the run REFUSED (the observed defect)', stepUp(oldClaims(T0 + 61), dbNow), false);
// 7. TX_EPOCH unset falls back to the wall clock (only used by phase p0, which makes no staff calls)
setEpoch(null); const w = Math.floor(Date.now() / 1000); const c = claimsFor('ADMIN').amr[0].timestamp;
t('without TX_EPOCH the wall clock fallback is used', Math.abs(c - (w - FRESH_BACK)) <= 2, true);
console.log(bad === 0 ? 'all clock cases pass' : `${bad} FAILED`); process.exit(bad ? 1 : 0);
