'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { useFeedback } from '@/components/feedback';
import { isGlobalAdmin, type Branch, type RoleName, type UserRow } from '@/lib/types';
import {
  PageHeader, Spinner, Button, Modal, Field, Input, Select, ErrorNote, RoleChip, roleLabels, cx,
} from '@/components/ui';

const emptyUser = { email: '', full_name: '', password: '', job_title: '' };
const ROLE_OPTIONS: RoleName[] = ['global_admin', 'branch_manager', 'project_manager', 'viewer'];

export default function UsersPage() {
  const me = useMe();
  const { toast } = useFeedback();
  const admin = isGlobalAdmin(me);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [creating, setCreating] = useState(false);
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [userForm, setUserForm] = useState(emptyUser);
  const [roleForm, setRoleForm] = useState<{ role: RoleName; branch_id: string }>({ role: 'viewer', branch_id: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([
      api<{ users: UserRow[] }>('/users').then((d) => setUsers(d.users)),
      api<{ branches: Branch[] }>('/branches').then((d) => setBranches(d.branches)),
    ]);
  useEffect(() => {
    load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(userForm) });
      setCreating(false);
      setUserForm(emptyUser);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function addRole(e: React.FormEvent) {
    e.preventDefault();
    if (!roleTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/users/${roleTarget.id}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          role: roleForm.role,
          branch_id: roleForm.role === 'global_admin' ? null : roleForm.branch_id,
        }),
      });
      setRoleTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Role assignment failed');
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(user: UserRow, roleId: string) {
    try {
      await api(`/users/${user.id}/roles/${roleId}`, { method: 'DELETE' });
      toast('success', 'Role removed');
      await load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Remove failed');
    }
  }

  async function toggleActive(user: UserRow) {
    await api(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !user.is_active }) });
    await load();
  }

  if (!users) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="People and their scoped role assignments"
        action={admin && <Button onClick={() => { setUserForm(emptyUser); setError(null); setCreating(true); }}>+ New user</Button>}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Job title</th>
              <th className="px-5 py-3">Roles</th>
              {admin && <th className="px-5 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className={cx('hover:bg-slate-50', !u.is_active && 'opacity-50')}>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-slate-900">
                    {u.full_name}
                    {!u.is_active && <span className="ml-2 text-xs font-normal text-rose-500">deactivated</span>}
                  </p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </td>
                <td className="px-5 py-3.5 text-slate-600">{u.job_title ?? '—'}</td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap gap-1.5">
                    {u.roles.length === 0 && <span className="text-xs text-slate-400">No roles</span>}
                    {u.roles.map((r) => (
                      <RoleChip
                        key={r.id}
                        role={r.role}
                        branch={r.branch_name}
                        onRemove={admin ? () => removeRole(u, r.id!) : undefined}
                      />
                    ))}
                  </div>
                </td>
                {admin && (
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setRoleForm({ role: 'viewer', branch_id: branches[0]?.id ?? '' });
                        setError(null);
                        setRoleTarget(u);
                      }}
                    >
                      Add role
                    </Button>
                    <Button
                      variant="ghost"
                      className={u.is_active ? 'text-rose-500 hover:text-rose-600' : 'text-emerald-600'}
                      onClick={() => toggleActive(u)}
                      disabled={u.id === me?.id}
                    >
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title="New user" onClose={() => setCreating(false)}>
          <form onSubmit={createUser} className="space-y-4">
            <Field label="Full name">
              <Input value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} required />
            </Field>
            <Field label="Email">
              <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required />
            </Field>
            <Field label="Job title">
              <Input value={userForm.job_title} onChange={(e) => setUserForm({ ...userForm, job_title: e.target.value })} />
            </Field>
            <Field label="Password" hint="Minimum 8 characters">
              <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} minLength={8} required />
            </Field>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {roleTarget && (
        <Modal title={`Add role for ${roleTarget.full_name}`} onClose={() => setRoleTarget(null)}>
          <form onSubmit={addRole} className="space-y-4">
            <Field label="Role">
              <Select value={roleForm.role} onChange={(e) => setRoleForm({ ...roleForm, role: e.target.value as RoleName })}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{roleLabels[r]}</option>
                ))}
              </Select>
            </Field>
            {roleForm.role !== 'global_admin' && (
              <Field label="Branch scope">
                <Select value={roleForm.branch_id} onChange={(e) => setRoleForm({ ...roleForm, branch_id: e.target.value })} required>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </Select>
              </Field>
            )}
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRoleTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add role'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
