'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from '@/components/feedback';
import type { Agenda, Meeting } from '@/lib/types';
import { Button, RagBadge, Spinner, Textarea, cx, formatDate } from '@/components/ui';
import { MeetingStatusBadge, formatDateTime } from '@/components/meetings-section';
import { TaskStatusBadge } from '@/components/task-badges';

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast, confirm } = useFeedback();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api<{ meeting: Meeting; agenda: Agenda; agenda_frozen: boolean }>(`/meetings/${id}`)
      .then((d) => {
        setMeeting(d.meeting);
        setAgenda(d.agenda);
        setFrozen(d.agenda_frozen);
        setMinutes(d.meeting.minutes ?? '');
      })
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <div className="py-20 text-center text-slate-500">
        Meeting not found or no access.{' '}
        <Link href="/meetings" className="text-indigo-600 hover:underline">Back to Meeting Hub</Link>
      </div>
    );
  }
  if (!meeting || !agenda) return <Spinner />;

  async function complete() {
    const ok = await confirm({
      title: 'Complete this meeting?',
      body: 'The live agenda will be frozen as the permanent record along with the minutes.',
      confirmLabel: 'Complete meeting',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d = await api<{ meeting: Meeting; agenda: Agenda; agenda_frozen: boolean }>(
        `/meetings/${id}/complete`,
        { method: 'POST', body: JSON.stringify({ minutes: minutes || null }) }
      );
      setMeeting(d.meeting);
      setAgenda(d.agenda);
      setFrozen(d.agenda_frozen);
      toast('success', 'Meeting completed — agenda archived');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to complete meeting');
    } finally {
      setBusy(false);
    }
  }

  async function saveMinutes() {
    setBusy(true);
    try {
      const d = await api<{ meeting: Meeting }>(`/meetings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ minutes }),
      });
      setMeeting(d.meeting);
      toast('success', 'Minutes saved');
    } finally {
      setBusy(false);
    }
  }

  const open = meeting.status === 'scheduled' || meeting.status === 'in_progress';

  return (
    <>
      <div className="mb-1 text-sm text-slate-500">
        <Link href="/meetings" className="hover:text-indigo-600">Meeting Hub</Link>
        <span className="mx-1.5">/</span>
        <Link href={`/projects/${meeting.project_id}`} className="hover:text-indigo-600">
          {meeting.project_name}
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{meeting.title}</h1>
            <MeetingStatusBadge status={meeting.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDateTime(meeting.scheduled_at)} · {meeting.duration_minutes} min
            {meeting.location && ` · ${meeting.location}`}
            {meeting.meeting_link && (
              <>
                {' · '}
                <a href={meeting.meeting_link} className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">
                  Join link
                </a>
              </>
            )}
          </p>
        </div>
        {open && (
          <Button onClick={complete} disabled={busy}>
            {busy ? 'Completing…' : 'Complete meeting'}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {frozen ? 'Agenda (frozen record)' : 'Live agenda'}
              </h2>
              <span className="text-xs text-slate-400">
                {frozen ? `Captured ${formatDateTime(agenda.generated_at)}` : 'Auto-generated from project data'}
              </span>
            </div>

            <div className="space-y-5">
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-700">1. Project health</span>
                <RagBadge rag={agenda.rag_status} />
                <span className="text-xs text-slate-500">status: {agenda.project_status.replace('_', ' ')}</span>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-slate-700">
                  2. Blocked items ({agenda.blocked_tasks.length})
                </h3>
                {agenda.blocked_tasks.length === 0 ? (
                  <p className="text-sm text-slate-400">Nothing blocked. 🎉</p>
                ) : (
                  <ul className="space-y-2">
                    {agenda.blocked_tasks.map((t) => (
                      <li key={t.id} className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-2.5">
                        <p className="text-sm font-medium text-slate-900">
                          {t.title} <span className="font-normal text-slate-500">— {t.assignee_name ?? 'unassigned'}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-rose-700">{t.blocker_explanation}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-slate-700">
                  3. Next steps ({agenda.next_steps.length})
                </h3>
                {agenda.next_steps.length === 0 ? (
                  <p className="text-sm text-slate-400">No recorded next steps.</p>
                ) : (
                  <ul className="space-y-2">
                    {agenda.next_steps.map((t) => (
                      <li key={t.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-4 py-2.5">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {t.title} <span className="font-normal text-slate-500">— {t.assignee_name ?? 'unassigned'}</span>
                          </p>
                          <p className="mt-0.5 text-sm text-slate-600">{t.next_steps}</p>
                        </div>
                        <TaskStatusBadge status={t.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {agenda.overdue_tasks.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-700">
                    4. Overdue ({agenda.overdue_tasks.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {agenda.overdue_tasks.map((t) => (
                      <li key={t.id} className="flex justify-between rounded-lg bg-amber-50 px-4 py-2 text-sm">
                        <span className="font-medium text-slate-900">{t.title}</span>
                        <span className="text-amber-700">due {formatDate(t.due_date)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {agenda.open_grc_checkpoints.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-700">
                    {agenda.overdue_tasks.length > 0 ? '5' : '4'}. Open GRC checkpoints ({agenda.open_grc_checkpoints.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {agenda.open_grc_checkpoints.map((g) => (
                      <li key={g.id} className="flex justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm">
                        <span className="font-medium text-slate-900">
                          <span className="uppercase text-xs text-slate-400">{g.checkpoint_type}</span> {g.title}
                        </span>
                        <span className="text-slate-500">{g.status.replace('_', ' ')} · due {formatDate(g.due_date)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Minutes</h2>
            {open ? (
              <>
                <Textarea
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="Decisions, actions and notes…"
                  className="min-h-32"
                />
                <div className="mt-3 flex justify-end">
                  <Button variant="secondary" onClick={saveMinutes} disabled={busy}>Save minutes</Button>
                </div>
              </>
            ) : (
              <p className={cx('whitespace-pre-wrap text-sm leading-relaxed', meeting.minutes ? 'text-slate-700' : 'text-slate-400')}>
                {meeting.minutes ?? 'No minutes recorded.'}
              </p>
            )}
          </section>
        </div>

        <div>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Attendees ({meeting.attendees.length})
            </h2>
            <ul className="space-y-2">
              {meeting.attendees.map((a) => (
                <li key={a.user_id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-900">{a.full_name}</span>
                  <span className="text-xs text-slate-400">{a.attendance}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
