'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from '@/components/feedback';
import type { CostBreakdown, CostCategory, CostLine, EvmSnapshot, Project } from '@/lib/types';
import { Button, Modal, Field, Input, Select, ErrorNote, cx } from '@/components/ui';
import { SCurve } from '@/components/charts';

const CATEGORIES: CostCategory[] = ['labour', 'hardware', 'software', 'services', 'contingency', 'other'];
const money = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

const emptyForm = { category: 'services' as CostCategory, label: '', planned_amount: '', actual_amount: '' };

export function FinancialsSection({
  project,
  breakdown,
  snapshots,
  canManage,
  onChanged,
}: {
  project: Project;
  breakdown: CostBreakdown | null;
  snapshots: EvmSnapshot[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<CostLine | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(l: CostLine | 'new') {
    setForm(
      l === 'new'
        ? emptyForm
        : { category: l.category, label: l.label, planned_amount: String(Number(l.planned_amount)), actual_amount: String(Number(l.actual_amount)) }
    );
    setError(null);
    setEditing(l);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = JSON.stringify({
      ...form,
      planned_amount: Number(form.planned_amount) || 0,
      actual_amount: Number(form.actual_amount) || 0,
    });
    try {
      if (editing === 'new') await api(`/projects/${project.id}/costs`, { method: 'POST', body });
      else if (editing) await api(`/costs/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      toast('success', 'Cost line saved');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: CostLine) {
    if (!(await confirm({ title: 'Delete cost line?', body: l.label, confirmLabel: 'Delete', danger: true }))) return;
    await api(`/costs/${l.id}`, { method: 'DELETE' });
    toast('success', 'Cost line deleted');
    onChanged();
  }

  const categories = breakdown
    ? CATEGORIES.map((c) => ({ category: c, ...breakdown.by_category[c] })).filter((c) => c.planned > 0 || c.actual > 0)
    : [];
  const maxVal = Math.max(1, ...categories.flatMap((c) => [c.planned, c.actual]));
  const hasHistory = snapshots.length >= 2;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Financials</h2>
        {canManage && <Button variant="secondary" onClick={() => open('new')}>+ Cost line</Button>}
      </div>

      {hasHistory && (
        <div className="mb-5">
          <p className="mb-1 text-xs font-medium text-slate-500">Cost & schedule S-curve (PV / EV / AC)</p>
          <SCurve snapshots={snapshots} />
        </div>
      )}

      <p className="mb-2 text-xs font-medium text-slate-500">Cost breakdown — planned vs actual</p>
      {categories.length === 0 ? (
        <p className="py-2 text-sm text-slate-400">No cost lines yet. Break the budget down by category to track spend.</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {categories.map((c) => (
              <div key={c.category}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className="font-medium capitalize text-slate-700">{c.category}</span>
                  <span className="tabular-nums text-slate-500">
                    {money(c.actual)} <span className="text-slate-300">/ {money(c.planned)}</span>
                  </span>
                </div>
                <div className="relative h-3 rounded-full bg-slate-100">
                  <div className="absolute inset-y-0 rounded-full bg-slate-300" style={{ width: `${(c.planned / maxVal) * 100}%` }} />
                  <div
                    className={cx('absolute inset-y-0 rounded-full', c.actual > c.planned ? 'bg-rose-500' : 'bg-indigo-500')}
                    style={{ width: `${(c.actual / maxVal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {breakdown && (
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-sm font-medium">
              <span className="text-slate-500">Total</span>
              <span className={cx('tabular-nums', breakdown.totals.actual > breakdown.totals.planned ? 'text-rose-600' : 'text-slate-900')}>
                {money(breakdown.totals.actual)} / {money(breakdown.totals.planned)}
              </span>
            </div>
          )}
          {canManage && (
            <div className="mt-3 divide-y divide-slate-50">
              {breakdown!.cost_lines.map((l) => (
                <div key={l.id} className="group flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-600">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">{l.category}</span>{' '}
                    {l.label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-xs text-slate-400">{money(Number(l.actual_amount))} / {money(Number(l.planned_amount))}</span>
                    <button onClick={() => open(l)} className="text-xs text-slate-400 hover:text-indigo-600">Edit</button>
                    <button onClick={() => remove(l)} className="text-xs text-slate-400 hover:text-rose-500">×</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New cost line' : 'Edit cost line'} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CostCategory })}>
                {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
              </Select>
            </Field>
            <Field label="Label">
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned">
                <Input type="number" min="0" step="1000" value={form.planned_amount} onChange={(e) => setForm({ ...form, planned_amount: e.target.value })} />
              </Field>
              <Field label="Actual">
                <Input type="number" min="0" step="1000" value={form.actual_amount} onChange={(e) => setForm({ ...form, actual_amount: e.target.value })} />
              </Field>
            </div>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
