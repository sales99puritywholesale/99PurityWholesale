'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Boxes, Coins, Crown, Headset, KeyRound, MoreHorizontal, Search, ShieldCheck, ShieldOff, UserCog, type LucideIcon } from 'lucide-react';
import { grantRoleAction, openEnrolmentWindowAction, revokeRoleAction, setStaffStatusAction } from '@/app/(portal)/admin/staff-actions';
import { cn } from '@/lib/portal/utils';
import { Avatar } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Input, Label, NativeSelect } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { OneTimeSecretForm } from './one-time-secret';

/**
 * The staff directory, built from the shadcn-style components: role cards (click to filter), a searchable team table, a per-row action menu and three dialogs (roles, authenticator
 * setup window, disable or re-enable). Display only: every change is a server action that re-checks the staff session, the capability and the fresh authenticator code in the database.
 */
export type StaffRowView = { user_id: string; email: string | null; status: 'active' | 'disabled'; created_at: string; roles: string[] };
export type RoleInfo = { key: string; label: string; summary: string };
type ModalState = { kind: 'roles' | 'window' | 'status'; userId: string } | null;

const ROLE_ICONS: Record<string, LucideIcon> = { admin: Crown, finance: Coins, operations: Boxes, support: Headset };
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function Pending({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'outline' | 'destructive' }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} disabled={pending}>{pending ? 'Working...' : children}</Button>;
}

export function StaffDirectory({ rows, roles, canManage, aside }: { rows: StaffRowView[]; roles: RoleInfo[]; canManage: boolean; aside?: ReactNode }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const counts = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, rows.filter((x) => x.roles.includes(r.key)).length])), [rows, roles]);
  const shown = useMemo(() => rows.filter((x) => (!role || x.roles.includes(role)) && (!query.trim() || (x.email ?? '').toLowerCase().includes(query.trim().toLowerCase()))), [rows, role, query]);
  const target = modal ? rows.find((x) => x.user_id === modal.userId) : undefined;
  const labelOf = (k: string) => roles.find((r) => r.key === k)?.label ?? k;
  const close = () => setModal(null);

  return (
    <div className="space-y-5">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((r, i) => {
          const active = role === r.key;
          const Icon = ROLE_ICONS[r.key] ?? UserCog;
          return (
            <li key={r.key} className="portal-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setRole(active ? null : r.key)}
                className={cn('portal-lift flex h-full w-full items-center gap-3.5 rounded-2xl border p-4 text-left', active ? 'border-[#9fdbe3] bg-[#E6F6F8]' : 'border-portal-border bg-portal-card')}
              >
                <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors', active ? 'border-[#b7e4ea] bg-white text-portal-accent-strong' : 'border-portal-border bg-white text-portal-text')}>
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-portal-heading text-sm font-semibold text-portal-text">
                    {r.label}
                    <span className="rounded-full bg-white/80 px-1.5 text-[11px] font-medium text-portal-muted ring-1 ring-portal-border">{counts[r.key] ?? 0}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-portal-muted">{r.summary}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="portal-rise overflow-hidden rounded-2xl border border-portal-border bg-portal-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]" style={{ animationDelay: '120ms' }}>
          <header className="flex flex-wrap items-center justify-between gap-3 p-5">
            <h2 className="font-portal-heading text-xl font-semibold text-portal-text">Team <span className="text-portal-muted">({shown.length}{shown.length !== rows.length ? ` of ${rows.length}` : ''})</span></h2>
            <div className="flex items-center gap-2">
              {role && <Button variant="ghost" size="sm" onClick={() => setRole(null)} className="bg-[#E6F6F8] text-portal-accent-strong hover:bg-[#d3eff3]">{labelOf(role)} only, clear</Button>}
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-portal-muted" />
                <Input aria-label="Search staff by e-mail" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff by email..." className="w-60 rounded-full bg-portal-canvas pl-9 transition-all focus-visible:w-72 focus-visible:bg-white" />
              </div>
            </div>
          </header>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Staff Member</TableHead><TableHead>Roles</TableHead><TableHead>Joined</TableHead><TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((s, i) => (
                <TableRow key={s.user_id} className="portal-rise" style={{ animationDelay: `${160 + i * 40}ms` }}>
                  <TableCell>
                    <span className="flex items-center gap-3">
                      <Avatar className="bg-portal-canvas text-portal-text ring-1 ring-portal-border">{(s.email ?? '?').slice(0, 1)}</Avatar>
                      <span className="break-all font-medium text-portal-text">{s.email ?? s.user_id}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1.5">
                      {s.roles.length ? s.roles.map((r) => <Badge key={r} variant={r === 'admin' ? 'info' : 'default'}>{labelOf(r)}</Badge>) : <span className="text-xs text-portal-muted">No role</span>}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-portal-text">{dateLabel(s.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'active' ? 'success' : 'danger'}><span className={cn('h-1.5 w-1.5 rounded-full', s.status === 'active' ? 'bg-portal-success' : 'bg-portal-danger')} />{s.status === 'active' ? 'Active' : 'Disabled'}</Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" aria-label={`Actions for ${s.email ?? 'this person'}`} className="h-8 w-11 rounded-lg"><MoreHorizontal aria-hidden="true" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuItem onSelect={() => setModal({ kind: 'roles', userId: s.user_id })}><UserCog aria-hidden="true" />Manage roles</DropdownMenuItem>
                          {s.status === 'active' && <DropdownMenuItem onSelect={() => setModal({ kind: 'window', userId: s.user_id })}><KeyRound aria-hidden="true" />Open authenticator setup</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive={s.status === 'active'} onSelect={() => setModal({ kind: 'status', userId: s.user_id })}>
                            {s.status === 'active' ? <ShieldOff aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                            {s.status === 'active' ? 'Disable access' : 'Re-enable access'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow className="hover:bg-transparent"><TableCell colSpan={canManage ? 5 : 4} className="py-10 text-center text-sm text-portal-muted">{rows.length === 0 ? 'No staff yet.' : 'No staff match your search.'}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        {aside}
      </div>

      <Dialog open={modal?.kind === 'roles' && !!target} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage roles</DialogTitle><DialogDescription>{target?.email}</DialogDescription></DialogHeader>
          {target && (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-portal-muted">Current roles</p>
                {target.roles.length === 0 && <p className="text-sm text-portal-muted">No role yet.</p>}
                <ul className="space-y-2">
                  {target.roles.map((r) => (
                    <li key={r} className="flex items-center justify-between rounded-xl border border-portal-border px-3 py-2">
                      <span className="text-sm font-medium text-portal-text">{labelOf(r)}</span>
                      <form action={revokeRoleAction}><input type="hidden" name="userId" value={target.user_id} /><input type="hidden" name="role" value={r} /><Pending variant="outline">Remove</Pending></form>
                    </li>
                  ))}
                </ul>
              </div>
              {roles.some((r) => !target.roles.includes(r.key)) && (
                <form action={grantRoleAction} className="flex items-end gap-2 border-t border-portal-border pt-4">
                  <input type="hidden" name="userId" value={target.user_id} />
                  <div className="flex-1">
                    <Label htmlFor="grant-role">Add a role</Label>
                    <NativeSelect id="grant-role" name="role">{roles.filter((r) => !target.roles.includes(r.key)).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</NativeSelect>
                  </div>
                  <Pending>Grant</Pending>
                </form>
              )}
              <p className="text-xs text-portal-muted">Each change needs a fresh authenticator code. You cannot change your own access, and the last administrator cannot be removed.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={modal?.kind === 'window' && !!target} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Authenticator setup</DialogTitle><DialogDescription>{target?.email}</DialogDescription></DialogHeader>
          {target && (
            <OneTimeSecretForm action={openEnrolmentWindowAction} label="Generate authorization code" secretLabel="Authorization code for this staff member">
              <input type="hidden" name="userId" value={target.user_id} />
              <input type="hidden" name="minutes" value="30" />
              <ol className="space-y-2.5 text-sm text-portal-muted">
                {['Generate a code (valid for 30 minutes, for this person only).', 'Send it to them. It is shown once and is not stored.', 'They sign in, scan the QR code and enter the code in "Authorization code".'].map((t, i) => (
                  <li key={t} className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F6F8] text-xs font-semibold text-portal-accent-strong">{i + 1}</span>{t}</li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-portal-muted">Needs a fresh authenticator code from you.</p>
            </OneTimeSecretForm>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={modal?.kind === 'status' && !!target} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{target?.status === 'active' ? 'Disable access?' : 'Re-enable access?'}</DialogTitle><DialogDescription>{target?.email}</DialogDescription></DialogHeader>
          {target && (
            <form action={setStaffStatusAction}>
              <input type="hidden" name="userId" value={target.user_id} />
              <input type="hidden" name="status" value={target.status === 'active' ? 'disabled' : 'active'} />
              <p className="text-sm text-portal-muted">{target.status === 'active' ? 'They will lose access to the operations portal immediately. Their roles are kept, so you can re-enable them later. The last active administrator cannot be disabled.' : 'They will be able to use the operations portal again with their existing roles.'}</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Pending variant={target.status === 'active' ? 'destructive' : 'default'}>{target.status === 'active' ? 'Disable access' : 'Re-enable access'}</Pending>
              </DialogFooter>
              <p className="mt-3 text-right text-xs text-portal-muted">Needs a fresh authenticator code.</p>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A submit button with a working state, for server-rendered forms (the Add staff card). */
export function SubmitButton({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} className={className}>{pending ? 'Working...' : children}</Button>;
}
