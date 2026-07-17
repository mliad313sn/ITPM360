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

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    api<{ tasks: Task[] }>('/my/tasks').then((d) => setTasks(d.tasks));
  }, []);

  if (!tasks) return <Spinner />;

  const buckets = new Map<string, Task[]>();
  for (const t of tasks) {
    const b = bucketOf(t);
    buckets.set(b, [...(buckets.get(b) ?? []), t]);
  }

  return (
    <>
      <PageHeader title="My Tasks" subtitle="Your open work across every project, ordered by urgency" />

      {tasks.length === 0 ? (
        <EmptyState title="Nothing assigned to you" hint="Tasks assigned to you across all projects appear here." />
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
