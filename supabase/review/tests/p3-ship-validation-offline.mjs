// P3 rev2 OFFLINE checks. No database, no network, no environment file. Run: node supabase/review/tests/p3-ship-validation-offline.mjs
//  (1) a SQL three-valued-logic MODEL of private.shop_ship_to_ok before and after the fix, run over the exact shipping cases of the rev2 harness (T15f)
//  (2) static checks of the revised migration candidate against the unchanged original
//  (3) the T12b arithmetic (ORG_B V11 = 11000)
// The model reproduces PostgreSQL's NULL semantics (NULL AND TRUE = NULL, NOT NULL = NULL, IF NULL does not enter the branch). It is NOT PostgreSQL: the real function is exercised only by the rolled-back dry run and phase t, which have not run on the revised candidate.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = 'D:/99puritywholesale-platform/99puritywholesale';
const rd = (p) => readFileSync(`${root}/${p}`);
const sha = (b) => createHash('sha256').update(b).digest('hex');
let bad = 0; const t = (n, ok, d = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  (' + d + ')' : ''}`); };

// ---------- three-valued logic
const AND = (...xs) => (xs.includes(false) ? false : xs.includes(null) ? null : true);
const NOT = (x) => (x === null ? null : !x);
const OR = (...xs) => (xs.includes(true) ? true : xs.includes(null) ? null : false);
const EQ = (a, b) => (a === null || b === null ? null : a === b);
const BETWEEN = (n, lo, hi) => (n === null ? null : n >= lo && n <= hi);
const LE = (n, hi) => (n === null ? null : n <= hi);
const REGEX = (s, re) => (s === null ? null : re.test(s));
// jsonb helpers: a missing key is SQL NULL for -> and ->>; a JSON null is the jsonb value 'null' for -> but SQL NULL for ->>
const jtype = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v);
const arrow = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? { present: true, v: o[k] } : null); // SQL NULL when missing
const typeOf = (o, k) => { const a = arrow(o, k); return a === null ? null : jtype(a.v); }; // jsonb_typeof(NULL) is NULL (the function is strict)
const textOf = (o, k) => { const a = arrow(o, k); if (a === null || a.v === null) return null; return typeof a.v === 'string' ? a.v : JSON.stringify(a.v); };
const clen = (s) => (s === null ? null : [...s.trim()].length);

// the validation expression of shop_ship_to_ok after the key check, as the migration writes it (p_ship is a non-null object with only allowed keys)
function expr(o) {
  const line2 = OR(NOT(Object.prototype.hasOwnProperty.call(o, 'line2')), AND(EQ(typeOf(o, 'line2'), 'string'), LE(clen(textOf(o, 'line2')), 160)));
  return AND(
    EQ(typeOf(o, 'name'), 'string'), BETWEEN(clen(textOf(o, 'name')), 1, 120),
    EQ(typeOf(o, 'line1'), 'string'), BETWEEN(clen(textOf(o, 'line1')), 1, 160),
    line2,
    EQ(typeOf(o, 'city'), 'string'), BETWEEN(clen(textOf(o, 'city')), 1, 80),
    EQ(typeOf(o, 'region'), 'string'), BETWEEN(clen(textOf(o, 'region')), 1, 80),
    EQ(typeOf(o, 'postal'), 'string'), BETWEEN(clen(textOf(o, 'postal')), 1, 20),
    EQ(typeOf(o, 'country'), 'string'), REGEX(textOf(o, 'country'), /^[A-Z]{2}$/));
}
const ALLOWED = new Set(['name', 'line1', 'line2', 'city', 'region', 'postal', 'country']);
function shipOk(p, fixed) { // p = parsed shipping value, or undefined for SQL NULL
  if (p === undefined || jtype(p) !== 'object') return false;
  for (const k of Object.keys(p)) if (!ALLOWED.has(k)) return false;
  const v = expr(p);
  return fixed ? (v === null ? false : v) : v; // rev2: coalesce(expr, false)
}
// the caller in rpc_checkout: old "if ... or not shop_ship_to_ok(x) or ..." versus rev2 "... or shop_ship_to_ok(x) is not true or ..."; a rejection (22023) happens only when the condition is TRUE
const rejectsOld = (p) => OR(false, NOT(shipOk(p, false)), false) === true;
const rejectsNew = (p) => OR(false, shipOk(p, true) !== true, false) === true;

// ---------- the exact cases of the rev2 harness (extracted from its source, not retyped)
const harness = readFileSync(`${root}/supabase/review/tests/p3-workflow-rollback.rev2.mjs`, 'utf8');
const SHIP = { name: 'P3 Test Facility', line1: '1 Test Way', city: 'Testville', region: 'TX', postal: '78701', country: 'US' };
const a = harness.indexOf('const REQ = ['); const b = harness.indexOf("['shipping object is SQL NULL (omitted)', null]];", a) + "['shipping object is SQL NULL (omitted)', null]];".length;
const cases = new Function('SHIP', `${harness.slice(a, b)}\nreturn shipCases;`)(SHIP);
t('extracted the rev2 shipping cases from the harness source', Array.isArray(cases) && cases.length === 37, `${cases.length} cases`);
const parse = (js) => (js === null ? undefined : JSON.parse(js));

t('model: the valid complete address is accepted by the old and the new function', shipOk(SHIP, false) === true && shipOk(SHIP, true) === true && !rejectsOld(SHIP) && !rejectsNew(SHIP));
t('model: a valid address with the optional line2 is accepted by both', shipOk({ ...SHIP, line2: 'Suite 2' }, true) === true && !rejectsOld({ ...SHIP, line2: 'Suite 2' }) && !rejectsNew({ ...SHIP, line2: 'Suite 2' }));
t('model: valid with line2 of exactly 160 characters accepted, 161 rejected (rule preserved)', shipOk({ ...SHIP, line2: 'x'.repeat(160) }, true) === true && shipOk({ ...SHIP, line2: 'x'.repeat(161) }, true) === false);

const REQ = ['name', 'line1', 'city', 'region', 'postal', 'country'];
for (const k of REQ) {
  const o = Object.fromEntries(Object.entries(SHIP).filter(([x]) => x !== k));
  t(`DEFECT reproduced (model, old logic): ${k} missing -> the validator returns NULL and the caller does NOT reject`, shipOk(o, false) === null && rejectsOld(o) === false);
  t(`FIX (model, rev2 logic): ${k} missing -> explicit false and the caller rejects (22023)`, shipOk(o, true) === false && rejectsNew(o) === true);
}
let newMiss = []; let oldMiss = [];
for (const [lbl, js] of cases) { const p = parse(js); if (!rejectsNew(p)) newMiss.push(lbl); if (!rejectsOld(p)) oldMiss.push(lbl); }
t(`FIX (model): all ${cases.length} harness shipping cases are rejected by the rev2 logic`, newMiss.length === 0, newMiss.join('; '));
t('model (old logic): the cases the OLD logic lets through are exactly the six "missing" ones plus the empty object {} (every key missing): 7 cases', oldMiss.sort().join('|') === [...REQ.map((k) => `${k} missing`), 'empty object'].sort().join('|'), oldMiss.join('; '));
t('model: explicit JSON null, empty string, whitespace-only and wrong types were already rejected by the old logic (no behaviour change there)', cases.filter(([l]) => /JSON null|empty string|whitespace|number|boolean|array|object|lower case|3 letters|unknown key|over 160/.test(l) && !/missing|empty object/.test(l)).every(([, js]) => rejectsOld(parse(js))));
t('model: a missing shipping object (SQL NULL) and non-object JSON values are rejected by both', [undefined, null, [], 'x', 5].every((p) => rejectsOld(p) && rejectsNew(p)));
t('model: rev2 never changes the answer for any input the old logic answered true or false (it only turns NULL into false)', cases.every(([, js]) => { const p = parse(js); const o = shipOk(p, false); return o === null || o === shipOk(p, true); }) && [SHIP, { ...SHIP, line2: 'Suite 2' }].every((p) => shipOk(p, false) === shipOk(p, true)));

// ---------- static checks of the revised migration candidate
const orig = rd('supabase/review/p3/20261110000100_p3_catalog_pricing_orders.sql'); const rev2 = rd('supabase/review/p3/20261110000100_p3_catalog_pricing_orders.rev2.sql');
t('the ORIGINAL migration is unchanged (sha256 bfd391c1...a799e)', sha(orig) === 'bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e');
t('the revised candidate has its own hash, recorded in the rev2 harness', sha(rev2) === 'd5efe7e9753b13c6ccaedf1fb70d31ab3431d967d46764ceb3cb290ce5195beb' && harness.includes(sha(rev2)));
t('the seed is unchanged (sha256 1b3b922d...8164)', sha(rd('supabase/review/p3/seed-products.sql')) === '1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164');
const O = orig.toString('utf8').split('\n'); const N = rev2.toString('utf8').split('\n');
const removed = O.filter((l) => !N.includes(l)); const added = N.filter((l) => !O.includes(l));
t('the diff removes exactly 3 original lines (the first and last line of the validation return, and the caller condition)', removed.length === 3 && /^  return jsonb_typeof\(p_ship -> 'name'\)/.test(removed[0]) && /~ '\^\[A-Z\]\{2\}\$';$/.test(removed[1]) && /not private\.shop_ship_to_ok\(p_ship_to\)/.test(removed[2]), `${removed.length} removed`);
t('every added line is a rev2 comment, the coalesce wrapper, its false argument, the reformatted first/last validation lines or the "is not true" condition', added.every((l) => /^--/.test(l.trim()) || /^  +-- rev2/.test(l) || /return coalesce\($/.test(l) || /^\s+false\);$/.test(l) || /jsonb_typeof\(p_ship -> 'name'\)/.test(l) || /\^\[A-Z\]\{2\}\$',$/.test(l) || /shop_ship_to_ok\(p_ship_to\) is not true/.test(l)), `${added.length} added`);
t('the validator now ends in coalesce(..., false) and still contains all six required-field type and length rules, the line2 rule and the unknown-key rule', /return coalesce\(/.test(rev2.toString()) && ['name', 'line1', 'city', 'region', 'postal', 'country'].every((k) => rev2.toString().includes(`jsonb_typeof(p_ship -> '${k}') = 'string'`)) && rev2.toString().includes("not in ('name', 'line1', 'line2', 'city', 'region', 'postal', 'country')") && rev2.toString().includes("(not (p_ship ? 'line2') or (jsonb_typeof(p_ship -> 'line2') = 'string'"));
t('rpc_checkout rejects with "is not true" and still raises 22023 (error behaviour unchanged)', /private\.shop_ship_to_ok\(p_ship_to\) is not true/.test(rev2.toString()) && /raise exception 'invalid arguments' using errcode = '22023'/.test(rev2.toString()));
t('function signatures, grants and every other statement are untouched (the only differing non-comment lines are the three above)', removed.length === 3 && added.filter((l) => !/^\s*--/.test(l)).length <= 7);

// ---------- T12b: ORG_B V11
const E = (m) => { const x = /const EXPECT_B = \{ V11: (\d+), V12: (\d+), V31: (\d+) \}/.exec(harness); return x ? { V11: Number(x[1]), V12: Number(x[2]), V31: Number(x[3]) } : null; };
const eb = E(); const prices = { V11: [10000, 11000], V12: [18000, 15000], V31: [20000, 5000] };
const fixedAmount = (valueE4) => Number((BigInt(valueE4) + 50n) / 100n); // Aspen markup_amount for a fixed rule: round(value, 2 decimals) in cents
const orgAmount = fixedAmount(50000); // ORG_B default rule: fixed $5.0000
const unitB = (k) => Math.max(prices[k][0] + orgAmount, prices[k][1]);
t('T12b arithmetic: ORG_B rule is a FIXED $5.0000 = 500 cents; V11 base 10000 + 500 = 10500 < floor 11000, so the unit price is 11000', orgAmount === 500 && prices.V11[0] + orgAmount === 10500 && unitB('V11') === 11000);
t('T12b: the rev2 harness expects V11 11000, V12 18500 (18000+500, floor 15000) and V31 20500 (20000+500, floor 5000)', eb && eb.V11 === 11000 && eb.V12 === unitB('V12') && eb.V31 === unitB('V31'), JSON.stringify(eb));
t('T12b: the pricing implementation was not changed to fit the old expectation (pricing.ts still takes max(price, floor))', /Math\.max\(raw, floor\)/.test(rd('src/lib/portal/commerce/pricing.ts').toString()));

console.log(bad === 0 ? 'all offline rev2 checks pass' : `${bad} FAILED`); process.exit(bad ? 1 : 0);
