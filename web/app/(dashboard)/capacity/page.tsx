'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { useFeedback } from '@/components/feedback';
import { isGlobalAdmin, type CapacityData } from '@/lib/types';
import { PageHeader, Spinner, EmptyState, Select, cx } from '@/components/ui';

// Utilization → status colour. Hours shown in the cell, so colour is a cue, not the sole signal.
function cellStyle(hours: number, capacity: number) {
  if (hours <= 0) return 'bg-slate-50 text-slate-300';
  const util = capacity > 0 ? hours / capacity : 0;
  if (util > 1) return 'bg-rose-500 text-white';
  if (util > 0.85) return 'bg-amber-400 text-amber-950';
  if (util > 0.5) return 'bg-emerald-400 text-emerald-950';
  return 'bg-emerald-100 text-emerald-800';
}

function fmtWeek(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function CapacityPage() {
  const me = useMe();
  const admin = isGlobalAdmin(me);
  const { toast } = useFeedback();
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState<CapacityData | null>(null);

  const load = (w = weeks) => api<CapacityData>(`/capacity?weeks=${w}`).then(setData);
  useEffect(() => {
    load(weeks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  async function setCapacity(userId: string, value: number) {
    await api(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ weekly_capacity_hours: value }) });
    toast('success', 'Capacity updated');
    load();
  }

  if (!data) return <Spinner />;

  const overloaded = data.people.filter((p) => p.overallocated_weeks > 0);

  return (
    <>
      <PageHeader
        title="Resource & Capacity"
        subtitle="Assigned workload versus weekly availability across your teams"
        action={
          <Select className="w-36" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            <option value={4}>Next 4 weeks</option>
            <option value={8}>Next 8 weeks</option>
            <option value={12}>Next 12 weeks</option>
          </Select>
        }
      />

      {overloaded.length > 0 && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span className="font-semibold">{overloaded.length}</span> {overloaded.length === 1 ? 'person is' : 'people are'} over-allocated
          in at least one week: {overloaded.map((p) => p.full_name).join(', ')}. Rebalance assignments or extend timelines.
        </div>
      )}

      {data.people.length === 0 ? (
        <EmptyState title="No assigned workload" hint="Assign tasks with estimates and due dates to see the capacity heatmap." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Person</th>
                  <th className="px-3 py-3 text-center">Cap/wk</th>
                  {data.week_starts.map((w) => (
                    <th key={w} className="px-2 py-3 text-center font-medium">{fmtWeek(w)}</th>
                  ))}
                  <th className="px-3 py-3 text-center">Unsched.</th>
                  <th className="px-3 py-3 text-center">Logged 4w</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.people.map((p) => (
                  <tr key={p.user_id}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900">{p.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {p.job_title ?? 'Team member'} · {p.open_tasks} open · {p.total_remaining}h left
                        {p.peak_utilization != null && (
                          <span className={cx('ml-1 font-medium', p.peak_utilization > 1 ? 'text-rose-600' : 'text-slate-400')}>
                            · peak {Math.round(p.peak_utilization * 100)}%
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {admin ? (
                        <input
                          type="number"
                          min={0}
                          step={4}
                          defaultValue={p.weekly_capacity}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v !== p.weekly_capacity) setCapacity(p.user_id, v);
                          }}
                          className="w-14 rounded border border-slate-200 px-1.5 py-1 text-center text-xs focus:border-indigo-500 focus:outline-none"
                        />
                      ) : (
                        <span className="text-slate-600">{p.weekly_capacity}h</span>
                      )}
                    </td>
                    {p.weeks.map((h, i) => (
                      <td key={i} className="px-1 py-1.5">
                        <div
                          className={cx('mx-auto flex h-9 w-14 items-center justify-center rounded text-xs font-semibold tabular-nums', cellStyle(h, p.weekly_capacity))}
                          title={h > 0 ? `${h}h of ${p.weekly_capacity}h (${Math.round((h / p.weekly_capacity) * 100)}%)` : 'No load'}
                        >
                          {h > 0 ? `${h}h` : ''}
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center text-slate-500">
                      {p.unscheduled_hours > 0 ? `${p.unscheduled_hours}h` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-500">
                      {p.logged_recent > 0 ? `${p.logged_recent}h` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="font-medium">Weekly utilization:</span>
            {[
              ['≤50%', 'bg-emerald-100'],
              ['50–85%', 'bg-emerald-400'],
              ['85–100%', 'bg-amber-400'],
              ['over 100%', 'bg-rose-500'],
            ].map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className={cx('h-3 w-3 rounded', color)} />
                {label}
              </span>
            ))}
            <span className="text-slate-400">
              Remaining hours = estimate × (1 − % complete), bucketed by due week. Overdue work lands in the current week.
            </span>
          </div>
        </>
      )}
    </>
  );
}
