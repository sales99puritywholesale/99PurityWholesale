import type { Metadata } from 'next';
import { Info, ShieldCheck, UserPlus } from 'lucide-react';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { getStaffAccessContext } from '@/lib/portal/staff-access';
import { evaluateCapability } from '@/lib/portal/permissions/evaluate';
import { staffDirectory } from '@/lib/portal/admin-ops/server';
import { STAFF_ROLES } from '@/lib/portal/admin-ops/schemas';
import { STAFF_ROLE_LABELS, STAFF_ROLE_SUMMARY } from '@/lib/portal/admin-ops/model';
import { messageFor } from '@/lib/portal/commerce/messages';
import { PortalPageHeader } from '@/components/portal/portal-page-header';
import { Flash, type Sp } from '@/components/portal/commerce-ui';
import { StaffDirectory, SubmitButton, type RoleInfo } from '@/components/portal/staff-directory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/portal/ui/card';
import { Input, Label, NativeSelect } from '@/components/portal/ui/input';
import { addStaffAction } from '../staff-actions';

export const metadata: Metadata = { title: 'Staff' };

const ROLES: RoleInfo[] = STAFF_ROLES.map((r) => ({ key: r, label: STAFF_ROLE_LABELS[r] ?? r, summary: STAFF_ROLE_SUMMARY[r] ?? '' }));

const STEPS = [
  'Open authenticator setup on the staff member\'s row.',
  'Share the authorization code (valid for 30 minutes).',
  'They sign in, set up their authenticator and enter the code.',
];

export default async function Page({ searchParams }: { searchParams: Sp }) {
  await requireStaffCapability('/admin/staff', 'staff.read');
  const res = await staffDirectory();
  const canManage = evaluateCapability(await getStaffAccessContext(), 'staff.manage').allowed;
  const rows = res.ok ? res.data.rows.map((r) => ({ user_id: r.user_id, email: r.email, status: r.status, created_at: r.created_at, roles: r.roles })) : [];

  const addCard = canManage ? (
    <Card className="portal-rise" style={{ animationDelay: '200ms' }}>
      <CardHeader className="flex-row items-center gap-2.5 space-y-0">
        <UserPlus aria-hidden="true" className="h-5 w-5 text-portal-text" />
        <CardTitle>Add a Staff Member</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-portal-muted">The person must already have a confirmed account and must not belong to a customer organization.</p>
        <form action={addStaffAction} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="staff-email">E-mail</Label>
            <Input id="staff-email" name="email" type="email" required maxLength={254} placeholder="Enter staff email" autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="staff-role">First role</Label>
            <NativeSelect id="staff-role" name="role" defaultValue="support">{ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</NativeSelect>
          </div>
          <SubmitButton className="w-full"><UserPlus aria-hidden="true" />Add (fresh code needed)</SubmitButton>
        </form>
      </CardContent>
    </Card>
  ) : null;

  return (
    <>
      <PortalPageHeader area="admin" title="Staff" description="Manage operations portal access, roles and authentication." />
      <Flash sp={searchParams} stepUpNext="/admin/staff" />
      {!res.ok && <p role="alert" className="mb-4 text-sm text-portal-danger">{messageFor(res.code)}</p>}
      <StaffDirectory rows={rows} roles={ROLES} canManage={canManage} aside={addCard} />

      <Card className="portal-rise mt-5 p-5" style={{ animationDelay: '260ms' }}>
        <div className="grid items-center gap-5 lg:grid-cols-[20rem_1fr]">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-portal-text" />
            <div>
              <h2 className="font-portal-heading text-base font-semibold text-portal-text">Authenticator Setup</h2>
              <p className="mt-0.5 text-xs text-portal-muted">After adding a staff member, open their authenticator setup window to generate a fresh authorization code (valid for 30 minutes).</p>
            </div>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3 lg:border-l lg:border-portal-border lg:pl-5">
            {STEPS.map((t, i) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E6F6F8] text-xs font-semibold text-portal-accent-strong ring-1 ring-[#b7e4ea]">{i + 1}</span>
                <span className="pt-0.5 text-xs leading-relaxed text-portal-muted">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <p className="portal-rise mt-5 flex items-start gap-2.5 rounded-2xl border border-portal-border bg-[#EEF4F8] px-4 py-3 text-sm text-portal-muted" style={{ animationDelay: '320ms' }}>
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-portal-text" />
        <span><strong className="font-semibold text-portal-text">Security</strong> <span className="ml-1">Every change needs a fresh authenticator code. You cannot change your own access, and the last administrator cannot be removed or disabled.</span></span>
      </p>
    </>
  );
}
