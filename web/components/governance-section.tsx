'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from '@/components/feedback';
import type { Project, RaciEntry, RaciRole, Stakeholder, UserRow } from '@/lib/types';
import { Button, Modal, Field, Input, Select, Textarea, ErrorNote, cx } from '@/components/ui';

const LEVELS = [
  { v: 3, label: 'High' },
  { v: 2, label: 'Medium' },
  { v: 1, label: 'Low' },
];

// Power/interest strategy per quadrant (thresholded at ≥2 = high enough to act).
function strategy(influence: number, interest: number) {
  const hiInf = influence >= 2;
  const hiInt = interest >= 2;
  if (hiInf && hiInt) return { label: 'Manage closely', color: 'text-rose-700' };
  if (hiInf && !hiInt) return { label: 'Keep satisfied', color: 'text-amber-700' };
  if (!hiInf && hiInt) return { label: 'Keep informed', color: 'text-indigo-700' };
  return { label: 'Monitor', color: 'text-slate-500' };
}

const RACI_META: Record<RaciRole, { letter: string; style: string; label: string }> = {
  responsible: { letter: 'R', style: 'bg-indigo-100 text-indigo-700', label: 'Responsible' },
  accountable: { letter: 'A', style: 'bg-rose-100 text-rose-700', label: 'Accountable' },
  consulted: { letter: 'C', style: 'bg-amber-100 text-amber-700', label: 'Consulted' },
  informed: { letter: 'I', style: 'bg-slate-100 text-slate-600', label: 'Informed' },
};

export function GovernanceSection({
  project,
  stakeholders,
  raci,
  users,
  canManage,
  onChanged,
}: {
  project: Project;
  stakeholders: Stakeholder[];
  raci: RaciEntry[];
  users: UserRow[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const [shForm, setShForm] = useState<Stakeholder | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', title: '', influence: 2, interest: 2, engagement: '' });
  const [raciForm, setRaciForm] = useState(false);
  const [raciInput, setRaciInput] = useState<{ activity: string; user_id: string; assignment: RaciRole }>({
    activity: '', user_id: '', assignment: 'responsible',
  });
  const [error, setError] = useState<string | null>(null);

  function openStakeholder(s: Stakeholder | 'new') {
    setForm(
      s === 'new'
        ? { name: '', title: '', influence: 2, interest: 2, engagement: '' }
        : { name: s.name, title: s.title ?? '', influence: s.influence, interest: s.interest, engagement: s.engagement ?? '' }
    );
    setError(null);
    setShForm(s);
  }

  async function saveStakeholder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = JSON.stringify({ ...form, title: form.title || null, engagement: form.engagement || null });
    try {
      if (shForm === 'new') await api(`/projects/${project.id}/stakeholders`, { method: 'POST', body });
      else if (shForm) await api(`/stakeholders/${shForm.id}`, { method: 'PATCH', body });
      setShForm(null);
      toast('success', 'Stakeholder saved');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  async function removeStakeholder(s: Stakeholder) {
    if (!(await confirm({ title: 'Remove stakeholder?', body: s.name, confirmLabel: 'Remove', danger: true }))) return;
    await api(`/stakeholders/${s.id}`, { method: 'DELETE' });
    onChanged();
  }

  async function addRaci(e: React.FormEvent) {
    e.preventDefault();
    if (!raciInput.activity.trim() || !raciInput.user_id) return;
    try {
      await api(`/projects/${project.id}/raci`, { method: 'POST', body: JSON.stringify(raciInput) });
      setRaciForm(false);
      setRaciInput({ activity: '', user_id: '', assignment: 'responsible' });
      onChanged();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Failed to add');
    }
  }

  async function removeRaci(id: string) {
    await api(`/raci/${id}`, { method: 'DELETE' });
    onChanged();
  }

  // Build the RACI matrix: activities × people
  const activities = [...new Set(raci.map((r) => r.activity))];
  const people = [...new Map(raci.map((r) => [r.user_id, r.full_name])).entries()];
  const cell = (activity: string, userId: string) =>
    raci.find((r) => r.activity === activity && r.user_id === userId);

  // 3×3 power/interest grid
  const grid = (inf: number, int: number) =>
    stakeholders.filter((s) => s.influence === inf && s.interest === int);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Stakeholders & governance</h2>

      {/* Power / interest grid */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">Power / interest grid</p>
          {canManage && <Button variant="secondary" onClick={() => openStakeholder('new')}>+ Stakeholder</Button>}
        </div>
        {stakeholders.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">No stakeholders mapped yet.</p>
        ) : (
          <div className="flex gap-2">
            <div className="flex items-center">
              <span className="-rotate-90 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-400">Influence →</span>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-3 gap-1.5">
                {[3, 2, 1].map((inf) =>
                  [1, 2, 3].map((int) => {
                    const people = grid(inf, int);
                    const strat = strategy(inf, int);
                    return (
                      <div key={`${inf}-${int}`} className="min-h-16 rounded-lg border border-slate-100 bg-slate-50 p-1.5">
                        <p className={cx('mb-1 text-[9px] font-semibold uppercase', strat.color)}>{strat.label}</p>
                        <div className="space-y-1">
                          {people.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => canManage && openStakeholder(s)}
                              className="block w-full truncate rounded bg-white px-1.5 py-0.5 text-left text-[11px] text-slate-700 shadow-sm hover:text-indigo-600"
                              title={s.engagement ?? s.name}
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">Interest →</p>
            </div>
          </div>
        )}
      </div>

      {/* RACI matrix */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">RACI responsibility matrix</p>
          {canManage && <Button variant="secondary" onClick={() => setRaciForm(true)}>+ Assignment</Button>}
        </div>
        {activities.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">No RACI assignments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">Activity</th>
                  {people.map(([uid, name]) => (
                    <th key={uid} className="px-1 py-2 text-center font-medium">{name.split(' ')[0]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activities.map((a) => (
                  <tr key={a}>
                    <td className="py-2 pr-3 font-medium text-slate-700">{a}</td>
                    {people.map(([uid]) => {
                      const c = cell(a, uid);
                      return (
                        <td key={uid} className="px-1 py-2 text-center">
                          {c ? (
                            <button
                              onClick={() => canManage && removeRaci(c.id)}
                              className={cx('inline-flex h-6 w-6 items-center justify-center rounded font-bold', RACI_META[c.assignment].style)}
                              title={`${RACI_META[c.assignment].label}${canManage ? ' — click to remove' : ''}`}
                            >
                              {RACI_META[c.assignment].letter}
                            </button>
                          ) : (
                            <span className="text-slate-200">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
              {(Object.keys(RACI_META) as RaciRole[]).map((r) => (
                <span key={r} className="inline-flex items-center gap-1">
                  <span className={cx('inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold', RACI_META[r].style)}>
                    {RACI_META[r].letter}
                  </span>
                  {RACI_META[r].label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {shForm && (
        <Modal title={shForm === 'new' ? 'New stakeholder' : 'Edit stakeholder'} onClose={() => setShForm(null)}>
          <form onSubmit={saveStakeholder} className="space-y-4">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Title / area">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Influence (power)">
                <Select value={form.influence} onChange={(e) => setForm({ ...form, influence: Number(e.target.value) })}>
                  {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
                </Select>
              </Field>
              <Field label="Interest">
                <Select value={form.interest} onChange={(e) => setForm({ ...form, interest: Number(e.target.value) })}>
                  {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Engagement strategy">
              <Textarea value={form.engagement} onChange={(e) => setForm({ ...form, engagement: e.target.value })} className="min-h-16" />
            </Field>
            <ErrorNote message={error} />
            <div className="flex justify-between gap-2">
              <div>
                {shForm !== 'new' && canManage && (
                  <Button type="button" variant="ghost" className="text-rose-500" onClick={() => { setShForm(null); removeStakeholder(shForm); }}>
                    Remove
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setShForm(null)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {raciForm && (
        <Modal title="RACI assignment" onClose={() => setRaciForm(false)}>
          <form onSubmit={addRaci} className="space-y-4">
            <Field label="Activity" hint="Type an existing activity to add to it, or a new one">
              <Input
                value={raciInput.activity}
                onChange={(e) => setRaciInput({ ...raciInput, activity: e.target.value })}
                list="raci-activities"
                required
              />
              <datalist id="raci-activities">
                {activities.map((a) => <option key={a} value={a} />)}
              </datalist>
            </Field>
            <Field label="Person">
              <Select value={raciInput.user_id} onChange={(e) => setRaciInput({ ...raciInput, user_id: e.target.value })} required>
                <option value="" disabled>Select…</option>
                {users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Responsibility">
              <Select value={raciInput.assignment} onChange={(e) => setRaciInput({ ...raciInput, assignment: e.target.value as RaciRole })}>
                {(Object.keys(RACI_META) as RaciRole[]).map((r) => <option key={r} value={r}>{RACI_META[r].label}</option>)}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRaciForm(false)}>Cancel</Button>
              <Button type="submit">Add</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
