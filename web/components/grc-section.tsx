'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from '@/components/feedback';
import type { GrcCheckpoint, GrcStatus, GrcType, Project } from '@/lib/types';
import { Button, Modal, Field, Input, Select, Textarea, ErrorNote, cx, formatDate } from '@/components/ui';

const typeStyles: Record<GrcType, string> = {
  governance: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  risk: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  compliance: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

const statusStyles: Record<GrcStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_review: 'bg-indigo-50 text-indigo-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
  waived: 'bg-slate-100 text-slate-500 line-through',
};

const emptyForm = { checkpoint_type: 'governance' as GrcType, title: '', description: '', due_date: '', notes: '' };

export function GrcSection({
  project,
  checkpoints,
  canManage,
  onChanged,
}: {
  project: Project;
  checkpoints: GrcCheckpoint[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { toast } = useFeedback();
  const [editing, setEditing] = useState<GrcCheckpoint | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(c: GrcCheckpoint | 'new') {
    setForm(
      c === 'new'
        ? emptyForm
        : {
            checkpoint_type: c.checkpoint_type,
            title: c.title,
            description: c.description ?? '',
            due_date: c.due_date?.slice(0, 10) ?? '',
            notes: c.notes ?? '',
          }
    );
    setError(null);
    setEditing(c);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = JSON.stringify({
      ...form,
      description: form.description || null,
      due_date: form.due_date || null,
      notes: form.notes || null,
    });
    try {
      if (editing === 'new') {
        await api(`/projects/${project.id}/grc`, { method: 'POST', body });
      } else if (editing) {
        await api(`/grc/${editing.id}`, { method: 'PATCH', body });
      }
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(c: GrcCheckpoint, status: GrcStatus) {
    try {
      await api(`/grc/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast('success', `Checkpoint ${status.replace('_', ' ')}`);
      onChanged();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Update failed');
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          GRC checkpoints ({checkpoints.length})
        </h2>
        {canManage && <Button variant="secondary" onClick={() => open('new')}>+ Add checkpoint</Button>}
      </div>

      {checkpoints.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">
          No governance, risk or compliance gates defined for this project.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {checkpoints.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium uppercase ring-1 ring-inset', typeStyles[c.checkpoint_type])}>
                    {c.checkpoint_type}
                  </span>
                  <button
                    onClick={() => canManage && open(c)}
                    className={cx('font-medium text-slate-900 text-left', canManage && 'hover:text-indigo-600')}
                  >
                    {c.title}
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Due {formatDate(c.due_date)}
                  {c.reviewed_by_name && ` · decided by ${c.reviewed_by_name} on ${formatDate(c.reviewed_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-medium', statusStyles[c.status])}>
                  {c.status.replace('_', ' ')}
                </span>
                {canManage && (c.status === 'pending' || c.status === 'in_review') && (
                  <>
                    {c.status === 'pending' && (
                      <Button variant="ghost" onClick={() => setStatus(c, 'in_review')}>Start review</Button>
                    )}
                    <Button variant="ghost" className="text-emerald-600" onClick={() => setStatus(c, 'approved')}>Approve</Button>
                    <Button variant="ghost" className="text-rose-500" onClick={() => setStatus(c, 'rejected')}>Reject</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New GRC checkpoint' : 'Edit checkpoint'} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Type">
              <Select
                value={form.checkpoint_type}
                onChange={(e) => setForm({ ...form, checkpoint_type: e.target.value as GrcType })}
              >
                <option value="governance">Governance</option>
                <option value="risk">Risk</option>
                <option value="compliance">Compliance</option>
              </Select>
            </Field>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" />
            </Field>
            <Field label="Due date">
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </Field>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-16" />
            </Field>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save checkpoint'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
