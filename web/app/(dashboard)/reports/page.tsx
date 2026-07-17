'use client';

import { useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { useFeedback } from '@/components/feedback';
import { isGlobalAdmin, type Branch } from '@/lib/types';
import { PageHeader, Button, Field, Input, Select, ErrorNote } from '@/components/ui';

async function downloadAuthed(url: string, filename: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Download failed');
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function ExportSection() {
  const me = useMe();
  const { toast } = useFeedback();
  const stamp = new Date().toISOString().slice(0, 10);

  const items: { entity: string; label: string; adminOnly?: boolean }[] = [
    { entity: 'projects', label: 'Projects' },
    { entity: 'tasks', label: 'Tasks' },
    { entity: 'audit-logs', label: 'Audit log', adminOnly: true },
  ];

  async function run(entity: string, format: 'csv' | 'json') {
    try {
      await downloadAuthed(`/api/export/${entity}?format=${format}`, `itpm360-${entity}-${stamp}.${format}`);
      toast('success', `${entity} exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Export failed');
    }
  }

  return (
    <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-1 font-semibold text-slate-900">Data export</h2>
      <p className="mb-4 text-sm text-slate-500">
        Feed project data into other enterprise systems. Exports respect your access scope and are audit-logged.
      </p>
      <div className="space-y-2.5">
        {items
          .filter((i) => !i.adminOnly || isGlobalAdmin(me))
          .map((i) => (
            <div key={i.entity} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-2.5">
              <span className="text-sm font-medium text-slate-700">{i.label}</span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => run(i.entity, 'csv')}>CSV</Button>
                <Button variant="secondary" onClick={() => run(i.entity, 'json')}>JSON</Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ branches: Branch[] }>('/branches').then((d) => setBranches(d.branches));
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ month });
      if (branchId) qs.set('branch_id', branchId);
      const res = await fetch(`/api/reports/monthly?${qs}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Report generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `itpm360-report-${month}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Reports & Export"
        subtitle="Presentation-ready monthly reports and raw data exports for other systems"
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Monthly Report Generator</h2>
        <Field label="Report month">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Scope">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">🌍 Global — all branches you can see</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </Select>
        </Field>
        <ErrorNote message={error} />
        <Button onClick={generate} disabled={busy || !month} className="w-full">
          {busy ? 'Generating slides…' : 'Generate PowerPoint report'}
        </Button>
        <p className="text-xs text-slate-400">
          The deck includes a portfolio health summary and one slide per project: RAG status, task
          progress, work completed in the month, meetings held, blockers with reasons, next steps and
          open GRC checkpoints. Every export is recorded in the audit log.
        </p>
      </div>

      <ExportSection />
      </div>
    </>
  );
}
