'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { PageHeader, Spinner, RagBadge, StatusBadge, Select, cx, formatDate } from '@/components/ui';
import { RagDonut, StatusBars, CountryRagBars } from '@/components/charts';
import { TaskStatusBadge } from '@/components/task-badges';
import { HealthDot } from '@/components/evm';
import type { Branch, PortfolioRow, Project, Rag, TaskStatus } from '@/lib/types';

interface Summary {
  rag: Partial<Record<Rag, number>>;
  status: Record<string, number>;
  kpis: {
    total: number; on_track: number; at_risk: number; delayed: number;
    avg_progress: number; total_budget: number | null; budget_variance: number | null;
  };
  portfolio: PortfolioRow[];
  by_country: { country: string; rag_status: Rag; count: number }[];
  task_status: Partial<Record<TaskStatus, number>>;
  approaching_deadlines: {
    id: string; title: string; due_date: string; status: TaskStatus;
    project_name: string; project_id: string; assignee_name: string | null;
  }[];
  risks: { open: number; high: number };
}

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled',
};

export default function DashboardPage() {
  const me = useMe();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    api<{ branches: Branch[] }>('/branches').then((d) => setBranches(d.branches));
  }, []);

  useEffect(() => {
    const qs = branchId ? `?branch_id=${branchId}` : '';
    setSummary(null);
    api<Summary>(`/dashboard/summary${qs}`).then(setSummary);
    api<{ projects: Project[] }>(`/projects${branchId ? `?branch_id=${branchId}` : ''}`).then((d) =>
      setProjects(d.projects)
    );
  }, [branchId]);

  if (!summary || !projects) return <Spinner />;

  const ragData = (['green', 'amber', 'red'] as Rag[]).map((k) => ({
    name: k[0].toUpperCase() + k.slice(1),
    key: k,
    value: summary.rag[k] ?? 0,
  }));
  const statusData = Object.entries(STATUS_LABELS)
    .map(([k, name]) => ({ name, value: summary.status[k] ?? 0 }))
    .filter((d) => d.value > 0);
  const countryMap = new Map<string, { country: string; green: number; amber: number; red: number }>();
  for (const row of summary.by_country) {
    const entry = countryMap.get(row.country) ?? { country: row.country, green: 0, amber: 0, red: 0 };
    entry[row.rag_status] += row.count;
    countryMap.set(row.country, entry);
  }
  const blocked = summary.task_status.blocked ?? 0;

  return (
    <>
      <PageHeader
        title={branchId ? `${branches.find((b) => b.id === branchId)?.name ?? 'Branch'} dashboard` : 'Global dashboard'}
        subtitle={
          branchId
            ? 'Branch-level view for local project management'
            : `Executive portfolio view, ${me?.full_name.split(' ')[0]}`
        }
        action={
          <Select className="w-56" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">🌍 Global — all branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </Select>
        }
      />

      {/* Portfolio KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {[
          { label: 'Projects', value: summary.kpis.total, tone: 'text-slate-900' },
          { label: 'On track', value: summary.kpis.on_track, tone: 'text-emerald-600' },
          { label: 'At risk', value: summary.kpis.at_risk, tone: 'text-amber-600' },
          { label: 'Delayed', value: summary.kpis.delayed, tone: 'text-rose-600' },
          { label: 'Avg progress', value: `${summary.kpis.avg_progress}%`, tone: 'text-indigo-600' },
          { label: 'Open risks', value: summary.risks?.open ?? 0, tone: (summary.risks?.high ?? 0) > 0 ? 'text-orange-600' : 'text-slate-900' },
          {
            label: 'Budget variance',
            value:
              summary.kpis.budget_variance == null
                ? '—'
                : `${summary.kpis.budget_variance < 0 ? '-' : '+'}${Math.abs(summary.kpis.budget_variance).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })}`,
            tone: (summary.kpis.budget_variance ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600',
          },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className={cx('mt-1 text-2xl font-bold tabular-nums', k.tone)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">RAG distribution</h2>
          <RagDonut data={ragData} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Projects by lifecycle status</h2>
          <StatusBars data={statusData} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Portfolio health by country</h2>
          <CountryRagBars data={[...countryMap.values()]} />
        </div>
      </div>

      {/* Portfolio control table — earned-value rollup per project */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Portfolio control (earned value)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Project</th>
                <th className="px-4 py-2.5">RAG</th>
                <th className="px-4 py-2.5 w-40">Completion</th>
                <th className="px-4 py-2.5 text-center">SPI</th>
                <th className="px-4 py-2.5 text-center">CPI</th>
                <th className="px-4 py-2.5 text-right">Budget</th>
                <th className="px-4 py-2.5 text-right">VAC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.portfolio.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5"><RagBadge rag={p.rag_status} /></td>
                  <td className="px-4 py-2.5">
                    {p.percent_complete == null ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${p.percent_complete}%` }} />
                        </div>
                        <span className="w-9 text-right text-xs tabular-nums text-slate-500">{Math.round(p.percent_complete)}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      <HealthDot health={p.schedule_health} title={`SPI ${p.spi ?? 'n/a'}`} />
                      <span className="tabular-nums text-slate-700">{p.spi == null ? '—' : p.spi.toFixed(2)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      <HealthDot health={p.cost_health} title={`CPI ${p.cpi ?? 'n/a'}`} />
                      <span className="tabular-nums text-slate-700">{p.cpi == null ? '—' : p.cpi.toFixed(2)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {p.budget == null ? '—' : p.budget.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })}
                  </td>
                  <td className={cx('px-4 py-2.5 text-right tabular-nums font-medium', (p.vac ?? 0) < 0 ? 'text-rose-600' : 'text-slate-600')}>
                    {p.vac == null ? '—' : p.vac.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Approaching deadlines (14 days)</h2>
            <span className="flex gap-2">
              {summary.risks?.high > 0 && (
                <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                  {summary.risks.high} high risk{summary.risks.high === 1 ? '' : 's'}
                </span>
              )}
              {blocked > 0 && (
                <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                  {blocked} blocked task{blocked === 1 ? '' : 's'}
                </span>
              )}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {summary.approaching_deadlines.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">Nothing due in the next two weeks.</p>
            ) : (
              summary.approaching_deadlines.map((t, i) => {
                const overdue = new Date(t.due_date) < new Date(new Date().toDateString());
                return (
                  <Link
                    key={t.id}
                    href={`/projects/${t.project_id}`}
                    className={cx('flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50', i > 0 && 'border-t border-slate-100')}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                      <p className="text-xs text-slate-500">{t.project_name} · {t.assignee_name ?? 'unassigned'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <TaskStatusBadge status={t.status} />
                      <span className={cx('text-xs font-medium', overdue ? 'text-rose-600' : 'text-slate-500')}>
                        {overdue ? 'overdue ' : ''}{formatDate(t.due_date)}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recently updated projects</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {projects.slice(0, 8).map((p, i) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={cx('flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-slate-50', i > 0 && 'border-t border-slate-100')}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.branch_name} · PM {p.pm_name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={p.status} />
                  <RagBadge rag={p.rag_status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
