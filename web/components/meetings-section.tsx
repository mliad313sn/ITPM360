'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Meeting, Project, UserRow } from '@/lib/types';
import { Button, Modal, Field, Input, ErrorNote, cx } from '@/components/ui';

export function formatDateTime(d: string) {
  return new Date(d).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const meetingStatusStyles: Record<Meeting['status'], string> = {
  scheduled: 'bg-sky-50 text-sky-700',
  in_progress: 'bg-indigo-50 text-indigo-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export function MeetingStatusBadge({ status }: { status: Meeting['status'] }) {
  return (
    <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-medium', meetingStatusStyles[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}

export function MeetingsSection({
  project,
  meetings,
  users,
  canEdit,
  onChanged,
}: {
  project: Project;
  meetings: Meeting[];
  users: UserRow[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', scheduled_at: '', duration_minutes: 45, meeting_link: '', location: '' });
  const [attendees, setAttendees] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/projects/${project.id}/meetings`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          meeting_link: form.meeting_link || null,
          location: form.location || null,
          attendee_ids: attendees,
        }),
      });
      setCreating(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const toggleAttendee = (id: string) =>
    setAttendees((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Meetings ({meetings.length})
        </h2>
        {canEdit && (
          <Button
            variant="secondary"
            onClick={() => {
              setForm({ title: '', scheduled_at: '', duration_minutes: 45, meeting_link: '', location: '' });
              setAttendees([project.project_manager_id, ...project.members.map((m) => m.user_id)]);
              setError(null);
              setCreating(true);
            }}
          >
            + Schedule meeting
          </Button>
        )}
      </div>

      {meetings.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">No meetings yet. Schedule one — the agenda builds itself.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {meetings.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
              <div>
                <p className="font-medium text-slate-900">{m.title}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(m.scheduled_at)} · {m.duration_minutes} min · {m.attendees.length} attendees
                </p>
              </div>
              <MeetingStatusBadge status={m.status} />
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="Schedule meeting" onClose={() => setCreating(false)} wide>
          <form onSubmit={save} className="space-y-4">
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date & time">
                <Input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                  required
                />
              </Field>
              <Field label="Duration (minutes)">
                <Input
                  type="number"
                  min={5}
                  step={5}
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Meeting link">
                <Input value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} placeholder="https://…" />
              </Field>
              <Field label="Location">
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </Field>
            </div>
            <Field label="Attendees">
              <div className="flex flex-wrap gap-2">
                {users.filter((u) => u.is_active).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAttendee(u.id)}
                    className={cx(
                      'rounded-full border px-3 py-1 text-xs font-medium transition',
                      attendees.includes(u.id)
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300'
                    )}
                  >
                    {u.full_name}
                  </button>
                ))}
              </div>
            </Field>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Scheduling…' : 'Schedule'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
