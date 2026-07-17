'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Meeting } from '@/lib/types';
import { PageHeader, Spinner, EmptyState, RagBadge, cx } from '@/components/ui';
import { MeetingStatusBadge, formatDateTime } from '@/components/meetings-section';

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);

  useEffect(() => {
    api<{ meetings: Meeting[] }>('/meetings').then((d) => setMeetings(d.meetings));
  }, []);

  if (!meetings) return <Spinner />;

  const upcoming = meetings
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const past = meetings.filter((m) => m.status !== 'scheduled');

  const MeetingRow = ({ m }: { m: Meeting }) => (
    <Link
      key={m.id}
      href={`/meetings/${m.id}`}
      className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-3.5 transition first:border-t-0 hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{m.title}</p>
        <p className="text-xs text-slate-500">
          {m.project_name} · {m.branch_name} · {formatDateTime(m.scheduled_at)} · {m.attendees.length} attendees
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <RagBadge rag={m.rag_status} />
        <MeetingStatusBadge status={m.status} />
      </div>
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Meeting Hub"
        subtitle="Project meetings with automatically generated agendas — RAG, blockers, next steps"
      />

      {meetings.length === 0 ? (
        <EmptyState title="No meetings" hint="Schedule meetings from any project page." />
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Upcoming ({upcoming.length})
            </h2>
            <div className={cx('overflow-hidden rounded-xl border border-slate-200 bg-white', !upcoming.length && 'p-5 text-sm text-slate-400')}>
              {upcoming.length ? upcoming.map((m) => <MeetingRow key={m.id} m={m} />) : 'Nothing scheduled.'}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Past & completed ({past.length})
            </h2>
            <div className={cx('overflow-hidden rounded-xl border border-slate-200 bg-white', !past.length && 'p-5 text-sm text-slate-400')}>
              {past.length ? past.map((m) => <MeetingRow key={m.id} m={m} />) : 'No history yet.'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
