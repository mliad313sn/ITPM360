'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from '@/components/feedback';
import type { Project } from '@/lib/types';
import { Button, Modal, Field, Input, Textarea, ErrorNote, cx } from '@/components/ui';

type AnalysisType = 'swot' | 'root_cause' | 'gap';
type Content = Record<string, unknown>;
type Analyses = Partial<Record<AnalysisType, { content: Content; updated_at: string }>>;

const TABS: { key: AnalysisType; label: string }[] = [
  { key: 'swot', label: 'SWOT' },
  { key: 'root_cause', label: 'Root cause (5 Whys)' },
  { key: 'gap', label: 'Gap analysis' },
];

const bullets = (s: unknown) =>
  String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);

function SwotView({ c }: { c: Content }) {
  const quads: [string, string, string][] = [
    ['strengths', 'Strengths', 'border-emerald-200 bg-emerald-50'],
    ['weaknesses', 'Weaknesses', 'border-rose-200 bg-rose-50'],
    ['opportunities', 'Opportunities', 'border-indigo-200 bg-indigo-50'],
    ['threats', 'Threats', 'border-amber-200 bg-amber-50'],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {quads.map(([key, label, style]) => (
        <div key={key} className={cx('rounded-lg border p-3', style)}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
          <ul className="space-y-1 text-sm text-slate-700">
            {bullets(c[key]).length === 0 ? (
              <li className="text-slate-400">—</li>
            ) : (
              bullets(c[key]).map((b, i) => <li key={i}>• {b}</li>)
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RootCauseView({ c }: { c: Content }) {
  const whys = Array.isArray(c.whys) ? (c.whys as string[]) : [];
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Problem</p>
        <p className="text-slate-700">{String(c.problem || '—')}</p>
      </div>
      <ol className="space-y-1.5">
        {whys.filter(Boolean).map((w, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 font-semibold text-indigo-500">Why {i + 1}?</span>
            <span className="text-slate-700">{w}</span>
          </li>
        ))}
      </ol>
      <div className="rounded-lg bg-rose-50 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Root cause</p>
        <p className="text-slate-800">{String(c.root_cause || '—')}</p>
      </div>
      <div className="rounded-lg bg-emerald-50 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Countermeasure</p>
        <p className="text-slate-800">{String(c.countermeasure || '—')}</p>
      </div>
    </div>
  );
}

function GapView({ c }: { c: Content }) {
  const fields: [string, string][] = [
    ['current_state', 'Current state'],
    ['target_state', 'Target state'],
    ['gap', 'Gap'],
    ['actions', 'Actions to close'],
  ];
  return (
    <dl className="space-y-2.5 text-sm">
      {fields.map(([k, label]) => (
        <div key={k}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
          <dd className="whitespace-pre-wrap text-slate-700">{String(c[k] || '—')}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AnalysisSection({
  project,
  analyses,
  canManage,
  onChanged,
}: {
  project: Project;
  analyses: Analyses;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { toast } = useFeedback();
  const [tab, setTab] = useState<AnalysisType>('swot');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Content>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = analyses[tab]?.content ?? {};

  function open() {
    setDraft({ ...current, whys: Array.isArray(current.whys) ? current.whys : ['', '', '', '', ''] });
    setError(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/projects/${project.id}/analyses/${tab}`, { method: 'PUT', body: JSON.stringify({ content: draft }) });
      setEditing(false);
      toast('success', 'Analysis saved');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const field = (key: string) => String((draft[key] as string) ?? '');
  const setField = (key: string, v: string) => setDraft((d) => ({ ...d, [key]: v }));

  const hasContent = Object.values(current).some((v) => (Array.isArray(v) ? v.some(Boolean) : v));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Analysis</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cx('rounded-md px-3 py-1 text-xs font-medium transition', tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700')}
              >
                {t.label}
              </button>
            ))}
          </div>
          {canManage && <Button variant="secondary" onClick={open}>{hasContent ? 'Edit' : '+ Add'}</Button>}
        </div>
      </div>

      {!hasContent ? (
        <p className="py-2 text-sm text-slate-400">No {TABS.find((t) => t.key === tab)!.label} captured yet.</p>
      ) : tab === 'swot' ? (
        <SwotView c={current} />
      ) : tab === 'root_cause' ? (
        <RootCauseView c={current} />
      ) : (
        <GapView c={current} />
      )}

      {editing && (
        <Modal title={`Edit — ${TABS.find((t) => t.key === tab)!.label}`} onClose={() => setEditing(false)} wide>
          <form onSubmit={save} className="space-y-4">
            {tab === 'swot' && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(['strengths', 'weaknesses', 'opportunities', 'threats'] as const).map((k) => (
                  <Field key={k} label={k[0].toUpperCase() + k.slice(1)} hint="One per line">
                    <Textarea value={field(k)} onChange={(e) => setField(k, e.target.value)} className="min-h-24" />
                  </Field>
                ))}
              </div>
            )}
            {tab === 'root_cause' && (
              <>
                <Field label="Problem statement">
                  <Textarea value={field('problem')} onChange={(e) => setField('problem', e.target.value)} className="min-h-16" />
                </Field>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Field key={i} label={`Why ${i + 1}?`}>
                    <Input
                      value={(Array.isArray(draft.whys) ? (draft.whys as string[])[i] : '') ?? ''}
                      onChange={(e) => {
                        const whys = Array.isArray(draft.whys) ? [...(draft.whys as string[])] : ['', '', '', '', ''];
                        whys[i] = e.target.value;
                        setDraft((d) => ({ ...d, whys }));
                      }}
                    />
                  </Field>
                ))}
                <Field label="Root cause">
                  <Textarea value={field('root_cause')} onChange={(e) => setField('root_cause', e.target.value)} className="min-h-16" />
                </Field>
                <Field label="Countermeasure">
                  <Textarea value={field('countermeasure')} onChange={(e) => setField('countermeasure', e.target.value)} className="min-h-16" />
                </Field>
              </>
            )}
            {tab === 'gap' && (
              <>
                {([['current_state', 'Current state'], ['target_state', 'Target state'], ['gap', 'Gap'], ['actions', 'Actions to close']] as const).map(([k, label]) => (
                  <Field key={k} label={label}>
                    <Textarea value={field(k)} onChange={(e) => setField(k, e.target.value)} className="min-h-16" />
                  </Field>
                ))}
              </>
            )}
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
