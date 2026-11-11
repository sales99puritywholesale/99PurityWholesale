// CONCURRENCY tests for the staff RPCs (last-admin protection and exclusion races, structure-check refresh). They need SEVERAL database sessions and therefore
// COMMITTED fixtures; this cannot be done inside a rolled-back transaction. Because committed staff fixtures conflict with the first-administrator bootstrap
// rule (both staff tables must be empty), this script is DISABLED by default and refuses unless ALL of the following hold:
//   1. migrations 0003 + 0004 are applied (checked), 2. public.staff_members and public.staff_roles are EMPTY (checked), 3. the operator passes
//   --authorized-committed-fixtures (an explicit approval to commit and then remove disposable fixtures), 4. the cleanup procedure below is accepted:
//   fixtures are removed by this script in one transaction that sets session_replication_role = replica ONLY for the cleanup (needs the owner role); if the
//   platform refuses that, the script STOPS and prints the exact manual cleanup (nothing else is deleted).
// Recommended instead: run this file against a LOCAL disposable PostgreSQL 17 with the Supabase auth schema (Docker), where no approval conflict exists.
//   --list prints the scenarios offline.
const SCENARIOS = [
  'S1 two admins revoke each other at the same instant (A revokes B, B revokes A): exactly one succeeds, the other gets last_admin_protected, one active admin remains (50 rounds)',
  'S2 two admins disable each other at the same instant: exactly one updated, the other invariant_protected, one active admin remains (50 rounds)',
  'S3 one admin is demoted while a second admin is concurrently added: no round ends with zero active admins (50 rounds)',
  'S4 add_member for a user while the same user is concurrently added as an organization member: never both staff and member (exclusion race, 50 rounds)',
  'S5 20 concurrent rpc_my_staff_context calls with an expired structure check: exactly one refresh row update, all callers get a consistent answer',
  'S6 two concurrent claim_factor calls for the same window with two different factors: exactly one approval, window consumed once',
  'S7 two concurrent authorize_enrolment_window calls for the same target: exactly one window, the other window_already_open',
];
if (process.argv.includes('--list') || !process.argv.includes('--authorized-committed-fixtures')) {
  for (const s of SCENARIOS) console.log(s);
  if (!process.argv.includes('--list')) { console.error('\nREFUSING: pass --authorized-committed-fixtures only after approval (see the header). Nothing was read or created.'); process.exit(2); }
  process.exit(0);
}
console.error('STOP: the executable body of this suite is intentionally not shipped until the approval conflict with the bootstrap rule is resolved (see docs/P2-2-RPC-TEST-PLAN.md section 4). Scenarios above are the agreed list.');
process.exit(2);
