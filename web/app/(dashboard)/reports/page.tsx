'use client';

import { useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';
import type { Branch } from '@/lib/types';
import { PageHeader, Button, Field, Input, Select, ErrorNote } from '@/components/ui';

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
        title="Monthly Report Generator"
        subtitle="Export project progress as presentation slides (.pptx) for stakeholder reviews"
      />

      <div className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-6">
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
    </>
  );
}
