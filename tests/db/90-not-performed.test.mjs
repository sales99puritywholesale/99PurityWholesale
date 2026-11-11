// Tests that CANNOT be performed on a hosted Supabase project, or that are outside the P2.1 scope. They are registered as
// SKIPPED so they appear in every report as NOT PASSED (never as green). Reasons are stated plainly.
import { describe, it } from 'node:test';

const HOSTED = 'hosted Supabase project: no supabase_admin/superuser access, so DDL on auth objects and session_replication_role are unavailable';

// In local-stack mode (P2_DB_MODE=local) the supabase_admin connection exists, so these run in 30-guards and 60-structure-ddl
// and are NOT listed here as skipped.
if (process.env.P2_DB_MODE !== 'local') describe('NOT PERFORMED on a hosted project (platform restriction)', () => {
  for (const [id, what] of [
    ['T-AV-2', 'rename an expected column of auth.mfa_factors and expect the structure check to fail'],
    ['T-AV-3', 'rename an enum label of auth.factor_status and expect the structure check to fail'],
    ['T-AV-4', 'retype created_at of auth.mfa_factors and expect the structure check to fail'],
    ['T-AV-5', 'add an unrelated column to auth.mfa_factors and observe other_column_count'],
    ['T-AV-6', 'revoke SELECT on auth.mfa_factors from the definer owner and expect a failed check'],
    ['T-AV-11', 'drop auth.mfa_factors in a rolled-back transaction and expect a failed check'],
    ['T-V5B-3/4', 'drift scenarios for the structure guard (revoked privilege, renamed column) in rolled-back transactions'],
    ['T-EX-5', 'build a user who is both staff and an active member (needs session_replication_role = replica) and expect the update guard to reject'],
  ]) it(`${id}: ${what}`, { skip: HOSTED }, () => {});
});

describe('NOT PERFORMED: needs the service-role key (deferred by decision)', () => {
  for (const [id, what] of [
    ['T-CS real path', 'delete users through the Auth admin API and observe cascades and last-owner/last-admin protection through GoTrue'],
    ['T-0001-9 real signup', 'GoTrue-created sign-up firing the profile trigger as supabase_auth_admin (sign-ups are disabled; the trigger is covered by SQL inserts only)'],
    ['T-ISO-2', 'service-key PostgREST request isolation level (no service-role key is used in P2.1)'],
  ]) it(`${id}: ${what}`, { skip: 'service-role key is out of scope for P2.1' }, () => {});
});

describe('NOT PERFORMED: outside P2.1 scope or dependent on later migrations', () => {
  for (const [id, what] of [
    ['T-CL-1..11 / D-16(b) / DEP-1..4', 'fresh-TOTP check when a staff factor is claimed (needs 0004 step-up and the 0007 claim RPC)'],
    ['T-AUD-1..7', 'audit events, deletion and attribution hooks, pg_trigger_depth discriminator (0003)'],
    ['T-INV-*', 'invitation lifecycle (no invitation workflow in P2.1; tables only)'],
    ['T-OMFA-*', 'owner step-up for owner grants (0004 and RPCs)'],
    ['T-MFAW RPC level', 'enrolment window RPCs authorize/revoke/check/claim (0007); only the table-level rules are tested'],
    ['T-GF-*', 'feature flags and compliance gates (0005)'],
  ]) it(`${id}: ${what}`, { skip: 'outside the P2.1 scope' }, () => {});
});
