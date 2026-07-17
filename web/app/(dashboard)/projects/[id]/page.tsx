'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { ProjectFormModal } from '@/components/project-form';
import {
  canManageBranch, canManageProject, type Branch, type Project, type Rag, type UserRow,
} from '@/lib/types';
import {
  Button, Field, Modal, RagBadge, Select, Input, Spinner, StatusBadge, ErrorNote,
  cx, formatDate, formatMoney,
} from '@/components/ui';

const ragOptions: { rag: Rag; label: string; active: string }[] = [
  { rag: 'green', label: 'Green', active: 'bg-emerald-600 text-white' },
  { rag: 'amber', label: 'Amber', active: 'bg-amber-500 text-white' },
  { rag: 'red', label: 'Red', active: 'bg-rose-600 text-white' },
];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const [project, setProject] = useState<Project | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ user_id: '', member_role: 'member' });
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api<{ project: Project }>(`/projects/${id}`)
      .then((d) => setProject(d.project))
      .catch(() => setNotFound(true));
    api<{ branches: Branch[] }>('/branches').then((d) => setBranches(d.branches));
    api<{ users: UserRow[] }>('/users').then((d) => setUsers(d.users));
  }, [id]);

  if (notFound) {
    return (
      <div className="py-20 text-center text-slate-500">
        Project not found or you have no access.{' '}
        <Link href="/projects" className="text-indigo-600 hover:underline">Back to projects</Link>
      </div>
    );
  }
  if (!project) return <Spinner />;

  const canManage = canManageProject(me, project);

  async function setRag(rag: Rag) {
    if (!canManage || rag === project!.rag_status) return;
    const { project: updated } = await api<{ project: Project }>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ rag_status: rag }),
    });
    setProject(updated);
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { project: updated } = await api<{ project: Project }>(`/projects/${id}/members`, {
        method: 'POST',
        body: JSON.stringify(memberForm),
      });
      setProject(updated);
      setAddingMember(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add member');
    }
  }

  async function removeMember(userId: string) {
    await api(`/projects/${id}/members/${userId}`, { method: 'DELETE' });
    setProject({ ...project!, members: project!.members.filter((m) => m.user_id !== userId) });
  }

  async function removeProject() {
    if (!confirm(`Delete project "${project!.name}"? This cannot be undone.`)) return;
    try {
      await api(`/projects/${id}`, { method: 'DELETE' });
      router.push('/projects');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  const candidateMembers = users.filter(
    (u) => u.is_active && u.id !== project.project_manager_id && !project.members.some((m) => m.user_id === u.id)
  );

  return (
    <>
      <div className="mb-1 text-sm text-slate-500">
        <Link href="/projects" className="hover:text-indigo-600">Projects</Link>
        <span className="mx-1.5">/</span>
        <span>{project.branch_name}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {project.branch_name} · {project.country_name} · PM {project.pm_name}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            {canManageBranch(me, project.branch_id) && (
              <Button variant="danger" onClick={removeProject}>Delete</Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Description</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {project.description ?? 'No description provided.'}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Team ({project.members.length + 1})
              </h2>
              {canManage && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMemberForm({ user_id: candidateMembers[0]?.id ?? '', member_role: 'member' });
                    setError(null);
                    setAddingMember(true);
                  }}
                >
                  + Add member
                </Button>
              )}
            </div>
            <ul className="divide-y divide-slate-100">
              <li className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-900">{project.pm_name}</p>
                  <p className="text-xs text-indigo-600">Project Manager</p>
                </div>
              </li>
              {project.members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{m.full_name}</p>
                    <p className="text-xs text-slate-500">{m.member_role}</p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => removeMember(m.user_id)}
                      className="text-xs text-slate-400 hover:text-rose-500"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-400">
            Tasks, GRC checkpoints and the Meeting Hub land here in Phase 3.
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">RAG status</h2>
            <div className="flex gap-2">
              {ragOptions.map(({ rag, label, active }) => (
                <button
                  key={rag}
                  onClick={() => setRag(rag)}
                  disabled={!canManage}
                  className={cx(
                    'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition',
                    project.rag_status === rag
                      ? active
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:hover:bg-slate-100'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {!canManage && <p className="mt-2 text-xs text-slate-400">Only the PM, branch manager or a global admin can change RAG.</p>}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Details</h2>
            <dl className="space-y-2.5 text-sm">
              {[
                ['Timeline', `${formatDate(project.start_date)} → ${formatDate(project.end_date)}`],
                ['Budget', formatMoney(project.budget)],
                ['Tasks', String(project.task_count)],
                ['Blocked', String(project.blocked_count)],
                ['Created', formatDate(project.created_at)],
                ['Updated', formatDate(project.updated_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className={cx('font-medium', k === 'Blocked' && project.blocked_count > 0 ? 'text-rose-600' : 'text-slate-900')}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {editing && (
        <ProjectFormModal
          project={project}
          branches={branches}
          users={users}
          onClose={() => setEditing(false)}
          onSaved={(p) => {
            setProject(p);
            setEditing(false);
          }}
        />
      )}

      {addingMember && (
        <Modal title="Add team member" onClose={() => setAddingMember(false)}>
          <form onSubmit={addMember} className="space-y-4">
            <Field label="User">
              <Select
                value={memberForm.user_id}
                onChange={(e) => setMemberForm({ ...memberForm, user_id: e.target.value })}
                required
              >
                <option value="" disabled>Select user…</option>
                {candidateMembers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Role on project" hint="e.g. developer, analyst, QA">
              <Input
                value={memberForm.member_role}
                onChange={(e) => setMemberForm({ ...memberForm, member_role: e.target.value })}
              />
            </Field>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAddingMember(false)}>Cancel</Button>
              <Button type="submit">Add member</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
