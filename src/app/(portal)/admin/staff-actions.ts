'use server';

import { redirect } from 'next/navigation';
import { requireStaffCapability } from '@/lib/portal/staff-gate';
import { enrolmentWindowSchema, staffAddSchema, staffLookupSchema, staffRoleSchema, staffStatusSchema } from '@/lib/portal/admin-ops/schemas';
import { staffAddMember, staffAuthorizeWindow, staffGrantRole, staffLookup, staffRevokeRole, staffSetStatus } from '@/lib/portal/admin-ops/server';
import { messageFor } from '@/lib/portal/commerce/messages';
import type { SecretState } from '@/components/portal/one-time-secret';
import { back } from '@/components/portal/commerce-ui';

/**
 * Staff-management actions, using the applied P2 functions (migration 0004): each is gated by staff.manage and needs a fresh step-up in the database, which also refuses
 * changing your own access, removing the last administrator, and making an organization member a staff member. There is no super-admin role.
 */
const PATH = '/admin/staff';
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const go = (r: { ok: true } | { ok: false; code: string }) => redirect(back(PATH, {}, r.ok ? { ok: true } : r));
const bad = () => redirect(back(PATH, {}, { ok: false, code: 'invalid_response' }));

/** Looks the person up by e-mail, then makes them staff with the chosen first role. The person must already have a confirmed account that is not an organization member. */
export async function addStaffAction(f: FormData): Promise<void> {
  await requireStaffCapability(PATH, 'staff.manage');
  const lookup = staffLookupSchema.safeParse({ email: str(f, 'email') });
  const role = staffAddSchema.shape.role.safeParse(str(f, 'role'));
  if (!lookup.success || !role.success) return bad();
  const found = await staffLookup(lookup.data.email);
  if (!found.ok) return go(found);
  const u = found.data;
  if (!u.found || !u.user_id) return go({ ok: false, code: 'user_not_found' });
  if (!u.email_confirmed) return go({ ok: false, code: 'target_not_eligible' });
  if (u.is_staff) return go({ ok: false, code: 'already_staff' });
  if (u.is_organization_member) return go({ ok: false, code: 'organization_member_conflict' });
  return go(await staffAddMember(u.user_id, role.data));
}

export async function grantRoleAction(f: FormData): Promise<void> {
  await requireStaffCapability(PATH, 'staff.manage');
  const p = staffRoleSchema.safeParse({ userId: str(f, 'userId'), role: str(f, 'role') });
  if (!p.success) return bad();
  return go(await staffGrantRole(p.data.userId, p.data.role));
}

export async function revokeRoleAction(f: FormData): Promise<void> {
  await requireStaffCapability(PATH, 'staff.manage');
  const p = staffRoleSchema.safeParse({ userId: str(f, 'userId'), role: str(f, 'role') });
  if (!p.success) return bad();
  return go(await staffRevokeRole(p.data.userId, p.data.role));
}

export async function setStaffStatusAction(f: FormData): Promise<void> {
  await requireStaffCapability(PATH, 'staff.manage');
  const p = staffStatusSchema.safeParse({ userId: str(f, 'userId'), status: str(f, 'status') });
  if (!p.success) return bad();
  return go(await staffSetStatus(p.data.userId, p.data.status));
}

/**
 * Opens the authenticator setup window for a staff member (staff.manage and a fresh step-up are enforced by the database, which also refuses opening one for yourself, for someone who
 * is not active staff, and a second window while one is open). The window id is returned ONCE to this page; it is the authorization code the staff member types on the sign-in setup screen.
 */
export async function openEnrolmentWindowAction(_prev: SecretState, f: FormData): Promise<SecretState> {
  await requireStaffCapability(PATH, 'staff.manage');
  const p = enrolmentWindowSchema.safeParse({ userId: str(f, 'userId'), minutes: Number(str(f, 'minutes') || '30') });
  if (!p.success) return { status: 'error', message: messageFor('invalid_response') };
  const r = await staffAuthorizeWindow(p.data.userId, 'authenticator setup for a staff member', p.data.minutes);
  if (!r.ok) return { status: 'error', message: messageFor(r.code) };
  return { status: 'created', secret: r.data.window_id, note: `Give this authorization code to the staff member now; it is not shown again. It is valid for ${p.data.minutes} minutes (until ${Number.isNaN(Date.parse(r.data.expires_at)) ? 'then' : `${new Date(r.data.expires_at).toISOString().slice(11, 16)} UTC`}). They sign in, choose the authenticator setup, scan the QR code, enter the first code and paste this value into "Authorization code".` };
}
