'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { ProjectFormModal } from '@/components/project-form';
import { canCreateProjects, type Branch, type Project, type UserRow } from '@/lib/types';
import {
  PageHeader, Spinner, EmptyState, Button, Select, RagBadge, StatusBadge, formatDate,
} from '@/components/ui';

export default function ProjectsPage() {
  const me = useMe();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({ branch: '', status: '', rag: '' });

  const load = () => api<{ projects: Project[] }>('/projects').then((d) => setProjects(d.projects));
  useEffect(() => {
    load();
    api<{ branches: Branch[] }>('/branches').then((d) => setBranches(d.branches));
    api<{ users: UserRow[] }>('/users').then((d) => setUsers(d.users));
  }, []);

  const visible = useMemo(
    () =>
      (projects ?? []).filter(
        (p) =>
          (!filters.branch || p.branch_id === filters.branch) &&
          (!filters.status || p.status === filters.status) &&
          (!filters.rag || p.rag_status === filters.rag)
      ),
    [projects, filters]
  );

  if (!projects) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="All projects you can see across branches"
        action={canCreateProjects(me) && <Button onClick={() => setCreating(true)}>+ New project</Button>}
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <Select className="w-52" value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
        <Select className="w-40" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select className="w-36" value={filters.rag} onChange={(e) => setFilters({ ...filters, rag: e.target.value })}>
          <option value="">All RAG</option>
          <option value="green">Green</option>
          <option value="amber">Amber</option>
          <option value="red">Red</option>
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No projects match" hint="Adjust the filters or create a new project." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700">{p.name}</h3>
                <RagBadge rag={p.rag_status} />
              </div>
              <p className="mb-3 line-clamp-2 min-h-10 text-sm text-slate-500">{p.description ?? 'No description'}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <StatusBadge status={p.status} />
                <span>{p.branch_code}</span>
                <span>·</span>
                <span>PM {p.pm_name}</span>
                <span>·</span>
                <span>{formatDate(p.start_date)} → {formatDate(p.end_date)}</span>
              </div>
              <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>{p.members.length + 1} people</span>
                <span>{p.task_count} tasks</span>
                {p.blocked_count > 0 && (
                  <span className="font-medium text-rose-600">{p.blocked_count} blocked</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <ProjectFormModal
          project={null}
          branches={branches}
          users={users}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </>
  );
}
