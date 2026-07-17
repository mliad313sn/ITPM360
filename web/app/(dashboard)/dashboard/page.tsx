'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { PageHeader, Spinner, RagBadge, StatusBadge, Select, cx, formatDate } from '@/components/ui';
import { RagDonut, StatusBars, CountryRagBars } from '@/components/charts';
import { TaskStatusBadge } from '@/components/task-badges';
import type { Branch, Project, Rag, TaskStatus } from '@/lib/types';

interface Summary {
  rag: Partial<Record<Rag, number>>;
  status: Record<string, number>;
  by_country: { country: string; rag_status: Rag; count: number }[];
  task_status: Partial<Record<TaskStatus, number>>;
  approaching_deadlines: {
    id: string; title: string; due_date: string; status: TaskStatus;
    project_name: string; project_id: string; assignee_name: string | null;
  }[];
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Approaching deadlines (14 days)</h2>
            {blocked > 0 && (
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                {blocked} blocked task{blocked === 1 ? '' : 's'} portfolio-wide
              </span>
            )}
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
