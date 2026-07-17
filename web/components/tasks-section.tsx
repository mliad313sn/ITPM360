'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from '@/components/feedback';
import type { Task, TaskComment, TaskPriority, TaskStatus, UserRow, Project } from '@/lib/types';
import { Button, Modal, Field, Input, Select, Textarea, ErrorNote, EmptyState, cx, formatDate } from '@/components/ui';
import { TaskStatusBadge, PriorityLabel, taskStatusLabels } from '@/components/task-badges';
import { KanbanBoard } from '@/components/kanban';
import { GanttChart } from '@/components/gantt';

const emptyForm = {
  title: '', description: '', assignee_id: '', status: 'todo' as TaskStatus,
  priority: 'medium' as TaskPriority, start_date: '', due_date: '', blocker_explanation: '', next_steps: '',
  is_milestone: false, estimate_hours: '',
};

// Dependencies manager — shown when editing an existing task
function DependencyEditor({
  task,
  allTasks,
  onChanged,
}: {
  task: Task;
  allTasks: Task[];
  onChanged: () => void;
}) {
  const { toast } = useFeedback();
  const [adding, setAdding] = useState('');
  const candidates = allTasks.filter(
    (t) => t.id !== task.id && !task.dependencies.some((d) => d.id === t.id)
  );

  async function add() {
    if (!adding) return;
    try {
      await api(`/tasks/${task.id}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ depends_on_task_id: adding }),
      });
      setAdding('');
      onChanged();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Could not add dependency');
    }
  }

  async function remove(depId: string) {
    await api(`/tasks/${task.id}/dependencies/${depId}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Depends on (finish-to-start)
      </p>
      {task.dependencies.length > 0 && (
        <ul className="mb-2 space-y-1">
          {task.dependencies.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-sm">
              <span className="truncate text-slate-700">
                {d.title}
                <span className={cx('ml-2 text-xs', d.status === 'done' ? 'text-emerald-600' : 'text-amber-600')}>
                  {d.status === 'done' ? 'done' : 'not finished'}
                </span>
              </span>
              <button type="button" onClick={() => remove(d.id)} className="text-xs text-slate-400 hover:text-rose-500">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Select value={adding} onChange={(e) => setAdding(e.target.value)} className="flex-1">
          <option value="">Add a prerequisite task…</option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </Select>
        <Button type="button" variant="secondary" onClick={add} disabled={!adding}>Add</Button>
      </div>
    </div>
  );
}

// Comment thread — shown when editing an existing task
function CommentThread({ taskId }: { taskId: string }) {
  const { toast } = useFeedback();
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [body, setBody] = useState('');

  const load = () =>
    api<{ comments: TaskComment[] }>(`/tasks/${taskId}/comments`).then((d) => setComments(d.comments));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function post() {
    if (!body.trim()) return;
    try {
      await api(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      setBody('');
      load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Could not post comment');
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Discussion {comments && comments.length > 0 && `(${comments.length})`}
      </p>
      <div className="mb-2 max-h-40 space-y-2 overflow-y-auto">
        {comments?.length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
        {comments?.map((c) => (
          <div key={c.id} className="rounded-md bg-white px-3 py-2">
            <p className="text-xs font-medium text-slate-700">
              {c.author_name ?? 'Unknown'}
              <span className="ml-2 font-normal text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              post();
            }
          }}
          placeholder="Write a comment…"
        />
        <Button type="button" variant="secondary" onClick={post} disabled={!body.trim()}>Post</Button>
      </div>
    </div>
  );
}

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
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'list' | 'board' | 'timeline'>('list');

  // keep the open modal's task in sync after dependency edits reload the list
  useEffect(() => {
    setEditing((cur) => {
      if (!cur || cur === 'new') return cur;
      return tasks.find((t) => t.id === cur.id) ?? cur;
    });
  }, [tasks]);

  function open(t: Task | 'new', statusOverride?: TaskStatus) {
    setForm(
      t === 'new'
        ? emptyForm
        : {
            title: t.title,
            description: t.description ?? '',
            assignee_id: t.assignee_id ?? '',
            status: statusOverride ?? t.status,
            priority: t.priority,
            start_date: t.start_date?.slice(0, 10) ?? '',
            due_date: t.due_date?.slice(0, 10) ?? '',
            blocker_explanation: t.blocker_explanation ?? '',
            next_steps: t.next_steps ?? '',
            is_milestone: t.is_milestone,
            estimate_hours: t.estimate_hours ? String(Number(t.estimate_hours)) : '',
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
      estimate_hours: form.estimate_hours === '' ? null : Number(form.estimate_hours),
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
    if (!(await confirm({ title: 'Delete task?', body: t.title, confirmLabel: 'Delete', danger: true }))) return;
    await api(`/tasks/${t.id}`, { method: 'DELETE' });
    toast('success', 'Task deleted');
    onChanged();
  }

  const isOverdue = (t: Task) =>
    t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date(new Date().toDateString());

  // Kanban move: entering 'blocked' requires an explanation → route through the modal
  async function moveTask(t: Task, status: TaskStatus) {
    if (status === 'blocked') {
      open(t, 'blocked');
      return;
    }
    try {
      await api(`/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      onChanged();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Move failed');
    }
  }

  const views = [
    { key: 'list', label: 'List' },
    { key: 'board', label: 'Board' },
    { key: 'timeline', label: 'Timeline' },
  ] as const;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Tasks ({tasks.length})
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {views.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={cx(
                  'rounded-md px-3 py-1 text-xs font-medium transition',
                  view === v.key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          {canEdit && <Button variant="secondary" onClick={() => open('new')}>+ Add task</Button>}
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" hint="Break the project down into trackable work items." />
      ) : view === 'board' ? (
        <KanbanBoard tasks={tasks} canEdit={canEdit} onMove={moveTask} onOpen={(t) => open(t)} />
      ) : view === 'timeline' ? (
        <GanttChart tasks={tasks} />
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
                    {t.is_milestone && <span className="mr-1 text-indigo-500" title="Milestone">◆</span>}
                    {t.title}
                  </button>
                  <TaskStatusBadge status={t.status} />
                  <PriorityLabel priority={t.priority} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t.assignee_name ?? 'Unassigned'} · {formatDate(t.start_date)} →{' '}
                  <span className={cx(isOverdue(t) && 'font-semibold text-rose-600')}>{formatDate(t.due_date)}</span>
                  {t.estimate_hours && <> · ~{Number(t.estimate_hours)}h</>}
                  {t.dependencies.length > 0 && (
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      {t.dependencies.length} dep{t.dependencies.length > 1 ? 's' : ''}
                    </span>
                  )}
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
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Start date">
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </Field>
              <Field label="Estimate (hours)">
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.estimate_hours}
                  onChange={(e) => setForm({ ...form, estimate_hours: e.target.value })}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_milestone}
                onChange={(e) => setForm({ ...form, is_milestone: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Milestone — shown as a diamond on the timeline
            </label>
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
          {editing !== 'new' && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <DependencyEditor task={editing} allTasks={tasks} onChanged={onChanged} />
              <CommentThread taskId={editing.id} />
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
