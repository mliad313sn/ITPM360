'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Task, TaskPriority, TaskStatus, UserRow, Project } from '@/lib/types';
import { Button, Modal, Field, Input, Select, Textarea, ErrorNote, EmptyState, cx, formatDate } from '@/components/ui';
import { TaskStatusBadge, PriorityLabel, taskStatusLabels } from '@/components/task-badges';

const emptyForm = {
  title: '', description: '', assignee_id: '', status: 'todo' as TaskStatus,
  priority: 'medium' as TaskPriority, start_date: '', due_date: '', blocker_explanation: '', next_steps: '',
};

export function TasksSection({
  project,
  tasks,
  users,
  canEdit,
  onChanged,
}: {
  project: Project;
  tasks: Task[];
  users: UserRow[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(t: Task | 'new') {
    setForm(
      t === 'new'
        ? emptyForm
        : {
            title: t.title,
            description: t.description ?? '',
            assignee_id: t.assignee_id ?? '',
            status: t.status,
            priority: t.priority,
            start_date: t.start_date?.slice(0, 10) ?? '',
            due_date: t.due_date?.slice(0, 10) ?? '',
            blocker_explanation: t.blocker_explanation ?? '',
            next_steps: t.next_steps ?? '',
          }
    );
    setError(null);
    setEditing(t);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.status === 'blocked' && !form.blocker_explanation.trim()) {
      setError('A blocked task requires a blocker explanation.');
      return;
    }
    setBusy(true);
    setError(null);
    const body = JSON.stringify({
      ...form,
      assignee_id: form.assignee_id || null,
      description: form.description || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      blocker_explanation: form.blocker_explanation || null,
      next_steps: form.next_steps || null,
    });
    try {
      if (editing === 'new') {
        await api(`/projects/${project.id}/tasks`, { method: 'POST', body });
      } else if (editing) {
        await api(`/tasks/${editing.id}`, { method: 'PATCH', body });
      }
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Task) {
    if (!confirm(`Delete task "${t.title}"?`)) return;
    await api(`/tasks/${t.id}`, { method: 'DELETE' });
    onChanged();
  }

  const isOverdue = (t: Task) =>
    t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date(new Date().toDateString());

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Tasks ({tasks.length})
        </h2>
        {canEdit && <Button variant="secondary" onClick={() => open('new')}>+ Add task</Button>}
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" hint="Break the project down into trackable work items." />
      ) : (
        <div className="divide-y divide-slate-100">
          {tasks.map((t) => (
            <div key={t.id} className="group flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => canEdit && open(t)}
                    className={cx('font-medium text-slate-900 text-left', canEdit && 'hover:text-indigo-600')}
                  >
                    {t.title}
                  </button>
                  <TaskStatusBadge status={t.status} />
                  <PriorityLabel priority={t.priority} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t.assignee_name ?? 'Unassigned'} · {formatDate(t.start_date)} →{' '}
                  <span className={cx(isOverdue(t) && 'font-semibold text-rose-600')}>{formatDate(t.due_date)}</span>
                </p>
                {t.status === 'blocked' && t.blocker_explanation && (
                  <p className="mt-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                    <span className="font-semibold">Blocker:</span> {t.blocker_explanation}
                  </p>
                )}
                {t.next_steps && t.status !== 'done' && (
                  <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                    <span className="font-semibold">Next steps:</span> {t.next_steps}
                  </p>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(t)}
                  className="invisible text-xs text-slate-400 hover:text-rose-500 group-hover:visible"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New task' : 'Edit task'} onClose={() => setEditing(null)} wide>
          <form onSubmit={save} className="space-y-4">
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Assignee">
                <Select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {users.filter((u) => u.is_active).map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
                  {(Object.keys(taskStatusLabels) as TaskStatus[]).map((s) => (
                    <option key={s} value={s}>{taskStatusLabels[s]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </Field>
            </div>
            {form.status === 'blocked' && (
              <Field label="Blocker explanation" hint="Required — why is this task blocked? This feeds meeting agendas and notifications.">
                <Textarea
                  value={form.blocker_explanation}
                  onChange={(e) => setForm({ ...form, blocker_explanation: e.target.value })}
                  className="min-h-16 border-rose-300"
                  required
                />
              </Field>
            )}
            <Field label="Next steps" hint="What happens next — pulled automatically into meeting agendas.">
              <Textarea value={form.next_steps} onChange={(e) => setForm({ ...form, next_steps: e.target.value })} className="min-h-16" />
            </Field>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save task'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
