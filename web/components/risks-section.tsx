'use client';

import { useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from '@/components/feedback';
import type { Project, Risk, RiskCategory, RiskStatus, UserRow } from '@/lib/types';
import { Button, Modal, Field, Input, Select, Textarea, ErrorNote, cx, formatDate } from '@/components/ui';

// Severity (likelihood×impact, 1-25) mapped to reserved status colors.
// Always paired with the numeric score, so colour never carries meaning alone.
export function severityBand(sev: number) {
  if (sev >= 15) return { label: 'Critical', chip: 'bg-rose-100 text-rose-800', cell: 'bg-rose-500' };
  if (sev >= 10) return { label: 'High', chip: 'bg-orange-100 text-orange-800', cell: 'bg-orange-400' };
  if (sev >= 5) return { label: 'Medium', chip: 'bg-amber-100 text-amber-800', cell: 'bg-amber-300' };
  return { label: 'Low', chip: 'bg-emerald-100 text-emerald-800', cell: 'bg-emerald-400' };
}

const CATEGORY_LABELS: Record<RiskCategory, string> = {
  risk: 'Risk',
  issue: 'Issue',
  assumption: 'Assumption',
  dependency: 'Dependency',
};

const STATUS_STYLES: Record<RiskStatus, string> = {
  open: 'bg-rose-50 text-rose-700',
  mitigating: 'bg-indigo-50 text-indigo-700',
  closed: 'bg-slate-100 text-slate-500',
  accepted: 'bg-emerald-50 text-emerald-700',
};

const emptyForm = {
  category: 'risk' as RiskCategory,
  title: '',
  description: '',
  likelihood: 3,
  impact: 3,
  status: 'open' as RiskStatus,
  owner_id: '',
  mitigation_plan: '',
  due_date: '',
};

// Compact 5×5 probability/impact heat matrix with live risk counts per cell.
function HeatMatrix({ risks }: { risks: Risk[] }) {
  const open = risks.filter((r) => r.status === 'open' || r.status === 'mitigating');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of open) m.set(`${r.likelihood}-${r.impact}`, (m.get(`${r.likelihood}-${r.impact}`) ?? 0) + 1);
    return m;
  }, [open]);

  return (
    <div className="flex items-end gap-2">
      <span className="mb-6 origin-center -rotate-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Likelihood ↑
      </span>
      <div>
        <div className="grid grid-cols-5 gap-1">
          {[5, 4, 3, 2, 1].map((likelihood) =>
            [1, 2, 3, 4, 5].map((impact) => {
              const sev = likelihood * impact;
              const n = counts.get(`${likelihood}-${impact}`) ?? 0;
              return (
                <div
                  key={`${likelihood}-${impact}`}
                  title={`Likelihood ${likelihood} × Impact ${impact} = severity ${sev}`}
                  className={cx(
                    'flex h-7 w-7 items-center justify-center rounded text-xs font-bold text-white/90',
                    severityBand(sev).cell,
                    n === 0 && 'opacity-25'
                  )}
                >
                  {n || ''}
                </div>
              );
            })
          )}
        </div>
        <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Impact →</p>
      </div>
    </div>
  );
}

export function RisksSection({
  project,
  risks,
  users,
  canManage,
  onChanged,
}: {
  project: Project;
  risks: Risk[];
  users: UserRow[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<Risk | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(r: Risk | 'new') {
    setForm(
      r === 'new'
        ? emptyForm
        : {
            category: r.category,
            title: r.title,
            description: r.description ?? '',
            likelihood: r.likelihood,
            impact: r.impact,
            status: r.status,
            owner_id: r.owner_id ?? '',
            mitigation_plan: r.mitigation_plan ?? '',
            due_date: r.due_date?.slice(0, 10) ?? '',
          }
    );
    setError(null);
    setEditing(r);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = JSON.stringify({
      ...form,
      owner_id: form.owner_id || null,
      description: form.description || null,
      mitigation_plan: form.mitigation_plan || null,
      due_date: form.due_date || null,
    });
    try {
      if (editing === 'new') await api(`/projects/${project.id}/risks`, { method: 'POST', body });
      else if (editing) await api(`/risks/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      toast('success', 'Risk saved');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Risk) {
    if (!(await confirm({ title: 'Delete this entry?', body: r.title, confirmLabel: 'Delete', danger: true }))) return;
    await api(`/risks/${r.id}`, { method: 'DELETE' });
    toast('success', 'Entry deleted');
    onChanged();
  }

  const live = form.likelihood * form.impact;
  const openCount = risks.filter((r) => r.status === 'open' || r.status === 'mitigating').length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Risk register — RAID ({openCount} open)
        </h2>
        {canManage && <Button variant="secondary" onClick={() => open('new')}>+ Log risk</Button>}
      </div>

      {risks.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">
          No risks, issues, assumptions or dependencies logged. Track them here with likelihood × impact scoring.
        </p>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="shrink-0">
            <HeatMatrix risks={risks} />
          </div>
          <div className="min-w-0 flex-1 divide-y divide-slate-100">
            {risks.map((r) => {
              const band = severityBand(r.severity);
              const muted = r.status === 'closed' || r.status === 'accepted';
              return (
                <div key={r.id} className={cx('flex items-start justify-between gap-3 py-2.5', muted && 'opacity-60')}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                        {CATEGORY_LABELS[r.category]}
                      </span>
                      <button
                        onClick={() => canManage && open(r)}
                        className={cx('text-sm font-medium text-slate-900', canManage && 'hover:text-indigo-600')}
                      >
                        {r.title}
                      </button>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      L{r.likelihood} × I{r.impact} · owner {r.owner_name ?? 'unassigned'}
                      {r.due_date && ` · due ${formatDate(r.due_date)}`}
                    </p>
                    {r.mitigation_plan && (
                      <p className="mt-1 truncate text-xs text-slate-500">
                        <span className="font-medium">Mitigation:</span> {r.mitigation_plan}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', band.chip)} title={band.label}>
                      {r.severity}
                    </span>
                    <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_STYLES[r.status])}>
                      {r.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Log risk / issue' : 'Edit entry'} onClose={() => setEditing(null)} wide>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as RiskCategory })}>
                  {(Object.keys(CATEGORY_LABELS) as RiskCategory[]).map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RiskStatus })}>
                  <option value="open">Open</option>
                  <option value="mitigating">Mitigating</option>
                  <option value="accepted">Accepted</option>
                  <option value="closed">Closed</option>
                </Select>
              </Field>
            </div>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Likelihood (1-5)">
                <Select value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <Field label="Impact (1-5)">
                <Select value={form.impact} onChange={(e) => setForm({ ...form, impact: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <div>
                <span className="text-sm font-medium text-slate-700">Severity</span>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={cx('rounded-full px-2.5 py-1 text-sm font-bold', severityBand(live).chip)}>{live}</span>
                  <span className="text-xs text-slate-500">{severityBand(live).label}</span>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner">
                <Select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {users.filter((u) => u.is_active).map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Target resolution date">
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Mitigation / response plan">
              <Textarea value={form.mitigation_plan} onChange={(e) => setForm({ ...form, mitigation_plan: e.target.value })} className="min-h-16" />
            </Field>
            <ErrorNote message={error} />
            <div className="flex justify-between gap-2">
              <div>
                {editing !== 'new' && canManage && (
                  <Button type="button" variant="ghost" className="text-rose-500" onClick={() => remove(editing)}>
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save entry'}</Button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
