# P3 rev2 artifact addendum (review preparation; nothing here is approved or executed)

This addendum supplements `P3-TIER-R-EXECUTION-MANIFEST.md` and `P3-TIER-R-ALLOWLIST.txt`, which are preserved unchanged and still describe the earlier harness/migration pins. **No database execution, migration approval or Phase T approval is included.** Any run needs its own explicit approval naming the hashes below.

## 1. Artifact set and pins

| Artifact | Path | SHA-256 | Status |
|---|---|---|---|
| Original migration | `supabase/review/p3/20261110000100_p3_catalog_pricing_orders.sql` | `bfd391c1b9635ded359fd1186c741d096889f1f7ee752c7e4dbca4530ffa799e` | approved earlier, unchanged, contains the NULL defect |
| Revised migration candidate | `supabase/review/p3/20261110000100_p3_catalog_pricing_orders.rev2.sql` | `d5efe7e9753b13c6ccaedf1fb70d31ab3431d967d46764ceb3cb290ce5195beb` | candidate, never parsed by PostgreSQL |
| Seed | `supabase/review/p3/seed-products.sql` | `1b3b922dbb627456271685cb03c0bff93b8cda03021bc5eb7410e274bd2a8164` | approved, unchanged |
| Original dry-execution harness | `supabase/review/tests/dry-execute-p3.mjs` | `4060fe9422a434187943f9a87183018abad52a4354f9ec8bde2895bd15aa9338` | unchanged, pinned to the original migration |
| **Revised dry-execution harness** | `supabase/review/tests/dry-execute-p3.rev2.mjs` | `cb825bdf996049ba3f2af77fe2542d48cd7786a20c2bf51bbed08dd041d28e93` | new, pinned to the candidate and the seed |
| Previous Phase T harness | `supabase/review/tests/p3-workflow-rollback.mjs` | `791879b19189c6a780d3a5253850184a1908a31e1c8f3b6b8025c2f27abaf909` | unchanged |
| **Revised Phase T harness** | `supabase/review/tests/p3-workflow-rollback.rev2.mjs` | `924aac9c7aad34f4cd58ac3362d9305998bc68f38f4f594cb4c83aa5ce83909b` | new, pinned to the candidate and the seed |
| Allow-list documentation (revision 2 header) | `docs/P3-TIER-R-ALLOWLIST.txt` | `b70389a710fed399d9be8c1872a1520151e104fdd1739b1cc2dbc89668619617` | header now names the revised harness; the 116 statements are unchanged (statements-only sha256 `0cec85111dd71156f81ec807e659dd410c81f99bc50b391a61afb0e63f507ceb`) |
| Allow-list, revision 1 (historical) | `docs/P3-TIER-R-ALLOWLIST.rev1-historical.txt` | `21c041bd4d9d78e91f9927be05ca7fffc9dfa06ebbdfdd6f908cc49bc613ae45` | preserved byte-for-byte; its header named harness `ea42dfbf…` |
| Execution Manifest (section 0 = revision 2 pins and run history; sections 1-2 kept as revision 1 / historical) | `docs/P3-TIER-R-EXECUTION-MANIFEST.md` | `725e769c2a0c145b1d96f1fbe76591dd4c3c6c388ae0c25c408eb0b57429fb90` | updated |
| Offline shipping test | `supabase/review/tests/p3-ship-validation-offline.mjs` | `a27508f1a28b5c9f9cbcc412d94d2440576d5a928a973553fac66c1a710bab97` | offline model + static checks |
| Offline artifact-set / safety-review test | `supabase/review/tests/p3-rev2-artifacts-offline.mjs` | `cbf8160194aee908e28ba83efaad8f45f26b3f7ab98394a3aa1a1924db307486` | offline |
| Offline clock test (30 cases) | `supabase/review/tests/p3-rev2-clock-offline.mjs` | `51c20d0d731d88d3e970646ea3675db0d85b7490be6e1191161c1c50e27be1f7` | offline |
| Offline trigger test (14 cases) | `supabase/review/tests/p3-rev2-trigger-offline.mjs` | `5433767476b35d092522d222cfbeed543d2e656f99e472494bc58f4ad73e07cd` | offline |

The Execution Manifest now carries the revision 2 pins in its section 0; this addendum remains as the shipping-coverage record.

## 2. Order of any future execution (each step needs its own approval; none is authorized now)
1. Rolled-back dry execution of the candidate: `dry-execute-p3.rev2.mjs --authorized-rolled-back-execution [--authorized-read-env-local] --harness-sha cb825bdf…`. Writes a new timestamped result file (flag `wx`), never overwrites.
2. Phase `t` prerequisites: a P0 run of the revised Phase T harness (writes `P3-TIER-R-P0-RESULT.rev2.json`; the previous P0 result is for another harness hash and is not accepted).
3. Phase `t` of the revised Phase T harness.

## 3. Shipping validation coverage (37 invalid cases + 3 valid cases)

Three layers, with different strength of evidence:
* **Offline model** (`p3-ship-validation-offline.mjs`): a SQL three-valued-logic model of the validator before and after the fix. It reproduces NULL semantics; it is **not PostgreSQL** and proves nothing about the real function.
* **Phase T** (revised harness): `rpc_checkout` called as a member of ORG_A inside the rollback-only transaction; each invalid case must answer SQLSTATE `22023`; one aggregate check asserts that no order was created and the cart item count is unchanged across all rejected checkouts. Not yet run.
* **Dry run** (revised dry harness): the private function called directly (must return an explicit `false`, never NULL) and `rpc_checkout` called as an authenticated non-member (validation runs before the membership check; must answer `22023`); a final check asserts that carts, orders, items, events and rules are empty. Not yet run.

All invalid cases: expected SQLSTATE **22023** at `rpc_checkout`; expected side effects **none** (no order, no cart change, no audit row). Per-case side effects are asserted collectively (aggregate check in Phase T, emptiness check in the dry run), not one by one.

| # | Case group (count) | Cases | Offline model: old logic | Offline model: rev2 logic | Phase T check name | Dry run (PostgreSQL) |
|---|---|---|---|---|---|---|
| 1 | Required field missing (6) | name, line1, city, region, postal, country | **NULL: not rejected (defect reproduced)** | `false`, rejected | `T15f ship <k> missing -> 22023` | function `false`; rpc `22023` |
| 2 | Required field = JSON null (6) | same six | `false`, rejected | `false`, rejected | `T15f ship <k> = JSON null -> 22023` | same |
| 3 | Required field = empty string (5) | name, line1, city, region, postal | rejected | rejected | `T15f ship <k> = empty string -> 22023` | same |
| 4 | Empty / blank (2) | name whitespace only; country empty string | rejected | rejected | `T15f ship name = whitespace only`, `country = empty string` | same |
| 5 | Wrong JSON value type (6) | name number, line1 boolean, city array, region object, postal number, country number | rejected | rejected | `T15f ship <k> = <type> -> 22023` | same |
| 6 | Country format (2) | lower case `us`; three letters `USA` | rejected | rejected | `T15f ship country lower case / 3 letters` | same |
| 7 | Optional line2 invalid (3) | JSON null; number; over 160 characters | rejected | rejected | `T15f ship line2 = JSON null / number / over 160 characters` | same |
| 8 | Unknown key (1) | `extra` | rejected | rejected | `T15f ship unknown key` | same |
| 9 | Empty object (1) | `{}` | **NULL: not rejected (a seventh defect case)** | `false`, rejected | `T15f ship empty object` | same |
| 10 | Malformed shipping object (4) | JSON null, array, string, number | rejected | rejected | `T15f ship shipping object is ...` | same |
| 11 | Missing shipping object (1) | SQL NULL (parameter omitted) | rejected | rejected | `T15f ship shipping object is SQL NULL (omitted)` | same |
| | **Total invalid** | **37** (6+6+5+2+6+2+3+1+1+4+1) | 7 let through | 0 let through | 37 checks + 1 aggregate | 37 function + 37 rpc |

Valid addresses (3), expected: no error; Phase T places an order (rolled back); dry run answers `organization_not_found` for the non-member.

| Valid case | Offline model | Phase T | Dry run (PostgreSQL) |
|---|---|---|---|
| Complete address | accepted (old and rev2) | O1, A2 and the replay checkouts (`order_placed`) | function `true`; rpc passes validation |
| Complete address with `line2` | accepted | K3 checkout inside setup `T15e` (`order_placed`) | same |
| `line2` of exactly 160 characters | accepted (161 rejected) | not covered in Phase T | function `true`; rpc passes validation |

## 4. Reconciliation of "37 offline cases" and "41 new cases"
The figure "41 new shipping cases" in the previous report was wrong. Correct accounting:
* The offline model and the revised Phase T harness use the **same 37 invalid cases** (the case definitions are textually identical in both harnesses and in the dry harness; an offline test compares them).
* Phase T also keeps the **5 original T15f checks** (`#1`..`#5`): #1 (city missing) and #3 (unknown key) duplicate cases already in the 37; #2 (country `usa`, lower case three letters) is a near-duplicate of the two country-format cases; #4 (notes over 500 characters) and #5 (null idempotency key) are **not** shipping cases and have no model counterpart.
* Phase T therefore has 5 + 37 = 42 invalid-checkout checks plus 1 aggregate side-effect check (43 T15f result lines), not 41 new ones. The offline model covers the 37 plus 3 valid cases.

## 5. What is and is not proven
Proven offline: the pins, the exact differences between artifacts, the model's NULL behaviour, the harness gate/dependency logic (using fakes), the log hygiene of the harness source, the 116 allow-list statements. **Not proven:** that the revised SQL parses, that `shop_ship_to_ok` behaves as modelled in PostgreSQL, that any checkout case is rejected by the real database. Those are the purpose of the dry run and Phase T, which have not been run on the candidate.
