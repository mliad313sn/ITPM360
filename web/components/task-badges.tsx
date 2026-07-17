'use client';

import type { TaskPriority, TaskStatus } from '@/lib/types';
import { cx } from '@/components/ui';

export const taskStatusLabels: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  in_review: 'In review',
  done: 'Done',
};

const taskStatusStyles: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  in_progress: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  blocked: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  in_review: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', taskStatusStyles[status])}>
      {taskStatusLabels[status]}
    </span>
  );
}

const priorityStyles: Record<TaskPriority, string> = {
  low: 'text-slate-400',
  medium: 'text-sky-600',
  high: 'text-amber-600',
  critical: 'text-rose-600',
};

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return <span className={cx('text-xs font-semibold uppercase', priorityStyles[priority])}>{priority}</span>;
}
