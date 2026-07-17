'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { isGlobalAdmin, type AuditLog } from '@/lib/types';
import { PageHeader, Spinner, cx } from '@/components/ui';

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-700',
  update: 'bg-sky-50 text-sky-700',
  delete: 'bg-rose-50 text-rose-700',
  status_change: 'bg-amber-50 text-amber-700',
  login: 'bg-slate-100 text-slate-600',
  export: 'bg-violet-50 text-violet-700',
};

export default function AuditPage() {
  const me = useMe();
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (me && isGlobalAdmin(me)) {
      api<{ audit_logs: AuditLog[] }>('/audit-logs?limit=200').then((d) => setLogs(d.audit_logs));
    }
  }, [me]);

  if (!isGlobalAdmin(me)) {
    return <p className="py-20 text-center text-slate-500">The audit log is restricted to global admins.</p>;
  }
  if (!logs) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Complete trail of critical changes for security and IT compliance reviews"
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Changes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l.id} className="align-top hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                  {new Date(l.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-slate-700">{l.actor_name ?? 'system'}</td>
                <td className="px-4 py-2.5">
                  <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', ACTION_STYLES[l.action] ?? 'bg-slate-100 text-slate-600')}>
                    {l.action.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{l.entity_type}</td>
                <td className="px-4 py-2.5">
                  {l.changes ? (
                    <>
                      <button
                        onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        {expanded === l.id ? 'Hide diff' : 'View diff'}
                      </button>
                      {expanded === l.id && (
                        <pre className="mt-1.5 max-w-md overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
                          {JSON.stringify(l.changes, null, 2)}
                        </pre>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
