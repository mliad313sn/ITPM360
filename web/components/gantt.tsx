'use client';

import type { Task, TaskStatus } from '@/lib/types';
import { cx } from '@/components/ui';
import { taskStatusLabels } from '@/components/task-badges';

// Status is a state → status-style fills, with a legend rendered below.
const BAR_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-slate-300',
  in_progress: 'bg-indigo-500',
  blocked: 'bg-rose-500',
  in_review: 'bg-violet-500',
  done: 'bg-emerald-500',
};

const DAY = 86_400_000;

export function GanttChart({ tasks }: { tasks: Task[] }) {
  const dated = tasks.filter((t) => t.start_date || t.due_date);
  if (dated.length === 0) {
    return <p className="py-6 text-sm text-slate-400">No tasks with dates yet — set start/due dates to see the timeline.</p>;
  }

  const starts = dated.map((t) => new Date(t.start_date ?? t.due_date!).getTime());
  const ends = dated.map((t) => new Date(t.due_date ?? t.start_date!).getTime());
  let min = Math.min(...starts);
  let max = Math.max(...ends, min + DAY);
  // pad to whole months
  const minD = new Date(min);
  min = new Date(minD.getFullYear(), minD.getMonth(), 1).getTime();
  const maxD = new Date(max);
  max = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 1).getTime();
  const span = max - min;

  // month gridlines
  const months: { t: number; label: string }[] = [];
  const cursor = new Date(min);
  while (cursor.getTime() < max) {
    months.push({
      t: cursor.getTime(),
      label: cursor.toLocaleDateString(undefined, { month: 'short', year: months.length === 0 ? '2-digit' : undefined }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const pct = (t: number) => ((t - min) / span) * 100;
  const today = Date.now();

  return (
    <div>
      <div className="relative ml-56 h-6 border-b border-slate-200">
        {months.map((m) => (
          <span key={m.t} className="absolute top-0 text-xs text-slate-400" style={{ left: `${pct(m.t)}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="relative">
        {/* gridlines */}
        <div className="pointer-events-none absolute inset-0 ml-56">
          {months.map((m) => (
            <div key={m.t} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${pct(m.t)}%` }} />
          ))}
          {today >= min && today <= max && (
            <div className="absolute inset-y-0 w-px bg-indigo-500/70" style={{ left: `${pct(today)}%` }}>
              <span className="absolute -top-0.5 left-1 text-[10px] font-medium text-indigo-600">today</span>
            </div>
          )}
        </div>
        {dated.map((t) => {
          const s = new Date(t.start_date ?? t.due_date!).getTime();
          const e = Math.max(new Date(t.due_date ?? t.start_date!).getTime() + DAY, s + DAY);
          const tip = `${t.title}: ${t.start_date?.slice(0, 10) ?? '…'} → ${t.due_date?.slice(0, 10) ?? '…'} (${taskStatusLabels[t.status]})`;
          return (
            <div key={t.id} className="flex items-center gap-0 py-1.5">
              <div className="w-56 shrink-0 truncate pr-3 text-sm text-slate-700" title={t.title}>
                {t.is_milestone && <span className="mr-1 text-indigo-500">◆</span>}
                {t.title}
              </div>
              <div className="relative h-4 flex-1">
                {t.is_milestone ? (
                  <div
                    className={cx('absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 rounded-[3px]', BAR_COLORS[t.status])}
                    style={{ left: `calc(${pct(e)}% - 7px)` }}
                    title={tip}
                  />
                ) : (
                  <div
                    className={cx('absolute inset-y-0 rounded-full', BAR_COLORS[t.status])}
                    style={{ left: `${pct(s)}%`, width: `${Math.max(((e - s) / span) * 100, 0.8)}%` }}
                    title={tip}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-3">
        {(Object.keys(BAR_COLORS) as TaskStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className={cx('h-2 w-2 rounded-full', BAR_COLORS[s])} />
            {taskStatusLabels[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
