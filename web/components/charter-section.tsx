'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from '@/components/feedback';
import type { Project } from '@/lib/types';
import { Button, Modal, Field, Textarea, ErrorNote } from '@/components/ui';

const FIELDS: { key: keyof Project; label: string; hint: string }[] = [
  { key: 'business_case', label: 'Business case', hint: 'Why this project exists — the problem and expected value' },
  { key: 'objectives', label: 'Objectives', hint: 'What success looks like — measurable goals' },
  { key: 'scope_in', label: 'In scope', hint: 'What this project will deliver' },
  { key: 'scope_out', label: 'Out of scope', hint: 'Explicitly excluded, to prevent scope creep' },
  { key: 'success_criteria', label: 'Success criteria', hint: 'How completion will be judged / accepted' },
];

export function CharterSection({
  project,
  canManage,
  onSaved,
}: {
  project: Project;
  canManage: boolean;
  onSaved: (p: Project) => void;
}) {
  const { toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasAny = FIELDS.some((f) => project[f.key]);

  function open() {
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, (project[f.key] as string) ?? ''])));
    setError(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { project: updated } = await api<{ project: Project }>(`/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f.key, form[f.key] || null]))),
      });
      onSaved(updated);
      setEditing(false);
      toast('success', 'Charter saved');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Project charter</h2>
        {canManage && <Button variant="secondary" onClick={open}>{hasAny ? 'Edit charter' : '+ Define charter'}</Button>}
      </div>

      {!hasAny ? (
        <p className="py-2 text-sm text-slate-400">
          No charter defined yet. Capture the business case, objectives, scope and success criteria to align stakeholders.
        </p>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-2">
          {FIELDS.filter((f) => project[f.key]).map((f) => (
            <div key={f.key} className={f.key === 'business_case' ? 'sm:col-span-2' : ''}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{f.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{project[f.key] as string}</dd>
            </div>
          ))}
        </dl>
      )}

      {editing && (
        <Modal title="Project charter" onClose={() => setEditing(false)} wide>
          <form onSubmit={save} className="space-y-4">
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <Textarea
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="min-h-16"
                />
              </Field>
            ))}
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save charter'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
