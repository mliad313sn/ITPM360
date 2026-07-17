'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { PageHeader, Spinner, RagBadge, StatusBadge, cx, formatDate } from '@/components/ui';
import type { Project, Rag } from '@/lib/types';

const ragTiles: { rag: Rag; label: string; bar: string }[] = [
  { rag: 'green', label: 'On track', bar: 'bg-emerald-500' },
  { rag: 'amber', label: 'At risk', bar: 'bg-amber-500' },
  { rag: 'red', label: 'Critical', bar: 'bg-rose-500' },
];

export default function DashboardPage() {
  const me = useMe();
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    api<{ projects: Project[] }>('/projects').then((d) => setProjects(d.projects));
  }, []);

  if (!projects) return <Spinner />;

  const blocked = projects.reduce((n, p) => n + p.blocked_count, 0);
  const active = projects.filter((p) => p.status === 'active').length;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${me?.full_name.split(' ')[0]}`}
        subtitle="Portfolio snapshot across your countries and branches"
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Projects</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{projects.length}</p>
          <p className="mt-1 text-xs text-slate-400">{active} active</p>
        </div>
        {ragTiles.map(({ rag, label, bar }) => {
          const count = projects.filter((p) => p.rag_status === rag).length;
          const pct = projects.length ? Math.round((count / projects.length) * 100) : 0;
          return (
            <div key={rag} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{count}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={cx('h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Blocked tasks</p>
          <p className={cx('mt-1 text-3xl font-bold', blocked ? 'text-rose-600' : 'text-slate-900')}>{blocked}</p>
          <p className="mt-1 text-xs text-slate-400">across portfolio</p>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recently updated</h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {projects.slice(0, 8).map((p, i) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className={cx(
              'flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-slate-50',
              i > 0 && 'border-t border-slate-100'
            )}
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-500">
                {p.branch_name} · {p.country_name} · PM {p.pm_name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden text-xs text-slate-400 sm:block">{formatDate(p.updated_at)}</span>
              <StatusBadge status={p.status} />
              <RagBadge rag={p.rag_status} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
