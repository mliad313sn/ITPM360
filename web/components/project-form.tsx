'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Branch, Project, ProjectStatus, Rag, UserRow } from '@/lib/types';
import { Button, Modal, Field, Input, Select, Textarea, ErrorNote } from '@/components/ui';

export function ProjectFormModal({
  project,
  branches,
  users,
  onClose,
  onSaved,
}: {
  project: Project | null; // null = create
  branches: Branch[];
  users: UserRow[];
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const [form, setForm] = useState({
    branch_id: project?.branch_id ?? branches[0]?.id ?? '',
    name: project?.name ?? '',
    description: project?.description ?? '',
    project_manager_id: project?.project_manager_id ?? '',
    rag_status: (project?.rag_status ?? 'green') as Rag,
    status: (project?.status ?? 'planning') as ProjectStatus,
    start_date: project?.start_date?.slice(0, 10) ?? '',
    end_date: project?.end_date?.slice(0, 10) ?? '',
    budget: project?.budget ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeUsers = users.filter((u) => u.is_active);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = JSON.stringify({
      ...form,
      description: form.description || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      budget: form.budget === '' ? null : Number(form.budget),
    });
    try {
      const data = project
        ? await api<{ project: Project }>(`/projects/${project.id}`, { method: 'PATCH', body })
        : await api<{ project: Project }>('/projects', { method: 'POST', body });
      onSaved(data.project);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <Modal title={project ? `Edit ${project.name}` : 'New project'} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Branch">
            <Select
              value={form.branch_id}
              onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
              disabled={!!project}
              required
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Project manager">
            <Select
              value={form.project_manager_id}
              onChange={(e) => setForm({ ...form, project_manager_id: e.target.value })}
              required
            >
              <option value="" disabled>Select PM…</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="RAG status">
            <Select value={form.rag_status} onChange={(e) => setForm({ ...form, rag_status: e.target.value as Rag })}>
              <option value="green">Green — on track</option>
              <option value="amber">Amber — at risk</option>
              <option value="red">Red — critical</option>
            </Select>
          </Field>
          <Field label="Lifecycle status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Start date">
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </Field>
          <Field label="End date">
            <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </Field>
          <Field label="Budget">
            <Input
              type="number"
              min="0"
              step="1000"
              value={form.budget ?? ''}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
          </Field>
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}</Button>
        </div>
      </form>
    </Modal>
  );
}
