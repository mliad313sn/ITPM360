'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Task } from '@/lib/types';
import { PageHeader, Spinner, EmptyState, cx, formatDate } from '@/components/ui';
import { TaskStatusBadge, PriorityLabel } from '@/components/task-badges';

function bucketOf(t: Task): string {
  if (!t.due_date) return 'No due date';
  const due = new Date(t.due_date);
  const today = new Date(new Date().toDateString());
  const week = new Date(today);
  week.setDate(week.getDate() + 7);
  if (due < today) return 'Overdue';
  if (due.getTime() === today.getTime()) return 'Due today';
  if (due <= week) return 'This week';
  return 'Later';
}

const BUCKET_ORDER = ['Overdue', 'Due today', 'This week', 'Later', 'No due date'];
const BUCKET_TINT: Record<string, string> = {
  Overdue: 'text-rose-600',
  'Due today': 'text-amber-600',
  'This week': 'text-indigo-600',
  Later: 'text-slate-500',
  'No due date': 'text-slate-400',
};

// Eisenhower classification from existing data.
const isImportant = (t: Task) => t.priority === 'critical' || t.priority === 'high';
function isUrgent(t: Task) {
  if (!t.due_date) return false;
  const due = new Date(t.due_date);
  const soon = new Date(new Date().toDateString());
  soon.setDate(soon.getDate() + 7);
  return due <= soon; // due within 7 days or overdue
}

const QUADRANTS = [
  { key: 'do', title: 'Do now', sub: 'Important · Urgent', imp: true, urg: true, style: 'border-rose-300 bg-rose-50', head: 'text-rose-700' },
  { key: 'plan', title: 'Schedule', sub: 'Important · Not urgent', imp: true, urg: false, style: 'border-indigo-300 bg-indigo-50', head: 'text-indigo-700' },
  { key: 'delegate', title: 'Delegate', sub: 'Not important · Urgent', imp: false, urg: true, style: 'border-amber-300 bg-amber-50', head: 'text-amber-700' },
  { key: 'drop', title: 'Backlog', sub: 'Not important · Not urgent', imp: false, urg: false, style: 'border-slate-200 bg-slate-50', head: 'text-slate-500' },
] as const;

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [view, setView] = useState<'list' | 'matrix'>('list');

  useEffect(() => {
    api<{ tasks: Task[] }>('/my/tasks').then((d) => setTasks(d.tasks));
  }, []);

  if (!tasks) return <Spinner />;

  const buckets = new Map<string, Task[]>();
  for (const t of tasks) {
    const b = bucketOf(t);
    buckets.set(b, [...(buckets.get(b) ?? []), t]);
  }

  const views = [
    { key: 'list', label: 'By urgency' },
    { key: 'matrix', label: 'Priority matrix' },
  ] as const;

  return (
    <>
      <PageHeader
        title="My Tasks"
        subtitle="Your open work across every project"
        action={
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
        }
      />

      {tasks.length === 0 ? (
        <EmptyState title="Nothing assigned to you" hint="Tasks assigned to you across all projects appear here." />
      ) : view === 'matrix' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {QUADRANTS.map((q) => {
            const items = tasks.filter((t) => isImportant(t) === q.imp && isUrgent(t) === q.urg);
            return (
              <div key={q.key} className={cx('rounded-xl border p-4', q.style)}>
                <div className="mb-3">
                  <h2 className={cx('text-sm font-semibold uppercase tracking-wide', q.head)}>{q.title}</h2>
                  <p className="text-xs text-slate-500">{q.sub} · {items.length}</p>
                </div>
                <div className="space-y-2">
                  {items.length === 0 && <p className="text-xs text-slate-400">Nothing here.</p>}
                  {items.map((t) => (
                    <Link
                      key={t.id}
                      href={`/projects/${t.project_id}`}
                      className="block rounded-lg border border-slate-200 bg-white px-3 py-2 transition hover:border-indigo-300"
                    >
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">
                        {t.is_milestone && <span className="text-indigo-500">◆</span>}
                        {t.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <span className="truncate">{t.project_name}</span>
                        <PriorityLabel priority={t.priority} />
                        {t.due_date && <span className="shrink-0">{formatDate(t.due_date)}</span>}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {BUCKET_ORDER.filter((b) => buckets.has(b)).map((bucket) => (
            <div key={bucket}>
              <h2 className={cx('mb-2 text-sm font-semibold uppercase tracking-wide', BUCKET_TINT[bucket])}>
                {bucket} ({buckets.get(bucket)!.length})
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {buckets.get(bucket)!.map((t, i) => (
                  <Link
                    key={t.id}
                    href={`/projects/${t.project_id}`}
                    className={cx(
                      'flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-slate-50',
                      i > 0 && 'border-t border-slate-100'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-medium text-slate-900">
                        {t.is_milestone && <span title="Milestone">◆</span>}
                        {t.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t.project_name} · {t.branch_code}
                        {t.estimate_hours && ` · ~${Number(t.estimate_hours)}h`}
                      </p>
                      {t.status === 'blocked' && t.blocker_explanation && (
                        <p className="mt-1 truncate text-xs text-rose-600">⛔ {t.blocker_explanation}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <PriorityLabel priority={t.priority} />
                      <TaskStatusBadge status={t.status} />
                      <span className={cx('w-20 text-right text-xs', bucket === 'Overdue' ? 'font-semibold text-rose-600' : 'text-slate-500')}>
                        {formatDate(t.due_date)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
