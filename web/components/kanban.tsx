'use client';

import { useState } from 'react';
import type { Task, TaskStatus } from '@/lib/types';
import { cx, formatDate } from '@/components/ui';
import { PriorityLabel, taskStatusLabels } from '@/components/task-badges';

const COLUMNS: { status: TaskStatus; accent: string }[] = [
  { status: 'todo', accent: 'border-t-slate-400' },
  { status: 'in_progress', accent: 'border-t-indigo-500' },
  { status: 'blocked', accent: 'border-t-rose-500' },
  { status: 'in_review', accent: 'border-t-violet-500' },
  { status: 'done', accent: 'border-t-emerald-500' },
];

export function KanbanBoard({
  tasks,
  canEdit,
  onMove,
  onOpen,
}: {
  tasks: Task[];
  canEdit: boolean;
  // moving into 'blocked' is intercepted by the parent (explanation required)
  onMove: (task: Task, status: TaskStatus) => void;
  onOpen: (task: Task) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  return (
    <div className="grid grid-cols-5 gap-3 overflow-x-auto">
      {COLUMNS.map(({ status, accent }) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setOverCol(status);
            }}
            onDragLeave={() => setOverCol(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOverCol(null);
              const task = tasks.find((t) => t.id === dragId);
              if (task && task.status !== status) onMove(task, status);
              setDragId(null);
            }}
            className={cx(
              'min-h-48 rounded-lg border border-t-2 bg-slate-50 p-2 transition',
              accent,
              overCol === status ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200'
            )}
          >
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {taskStatusLabels[status]} <span className="font-normal text-slate-400">({items.length})</span>
            </p>
            <div className="space-y-2">
              {items.map((t) => (
                <div
                  key={t.id}
                  draggable={canEdit}
                  onDragStart={() => setDragId(t.id)}
                  onClick={() => canEdit && onOpen(t)}
                  className={cx(
                    'rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition',
                    canEdit && 'cursor-grab hover:border-indigo-300',
                    dragId === t.id && 'opacity-50'
                  )}
                >
                  <p className="text-sm font-medium leading-snug text-slate-900">{t.title}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-400">{t.assignee_name ?? 'Unassigned'}</span>
                    <PriorityLabel priority={t.priority} />
                  </div>
                  {t.due_date && (
                    <p className="mt-1 text-xs text-slate-400">due {formatDate(t.due_date)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
