'use client';

import type { Evm, Health } from '@/lib/types';
import { cx } from '@/components/ui';

const HEALTH_DOT: Record<Health, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  unknown: 'bg-slate-300',
};
const HEALTH_TEXT: Record<Health, string> = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  red: 'text-rose-600',
  unknown: 'text-slate-400',
};

// A performance index (SPI/CPI) is favourable ≥ 1. Colour by band; always
// shown with its numeric value so colour never carries meaning alone.
export function indexHealth(index: number | null): Health {
  if (index == null) return 'unknown';
  if (index >= 0.95) return 'green';
  if (index >= 0.85) return 'amber';
  return 'red';
}

export function HealthDot({ health, title }: { health: Health; title?: string }) {
  return <span className={cx('inline-block h-2.5 w-2.5 rounded-full', HEALTH_DOT[health])} title={title ?? health} />;
}

// Compact gauge for a performance index, favourable at 1.0 (range 0–2 clamped).
export function IndexGauge({ label, value }: { label: string; value: number | null }) {
  const health = indexHealth(value);
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / 2)) * 100;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('mt-1 text-3xl font-bold tabular-nums', HEALTH_TEXT[health])}>
        {value == null ? '—' : value.toFixed(2)}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cx('h-full rounded-full', HEALTH_DOT[health])} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">1.00 = on plan</p>
    </div>
  );
}

const money = (v: number | null) =>
  v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 0 });

// Full earned-value panel for a single project.
export function EvmPanel({ evm }: { evm: Evm }) {
  const rows: [string, string, string | null][] = [
    ['Budget (BAC)', money(evm.bac), null],
    ['Actual cost (AC)', money(evm.ac), null],
    ['Earned value (EV)', money(evm.ev), null],
    ['Planned value (PV)', money(evm.pv), null],
    ['Schedule variance (SV)', money(evm.sv), evm.sv == null ? null : evm.sv >= 0 ? 'pos' : 'neg'],
    ['Cost variance (CV)', money(evm.cv), evm.cv == null ? null : evm.cv >= 0 ? 'pos' : 'neg'],
    ['Est. at completion (EAC)', money(evm.eac), null],
    ['Variance at completion (VAC)', money(evm.vac), evm.vac == null ? null : evm.vac >= 0 ? 'pos' : 'neg'],
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Earned value management
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <IndexGauge label="SPI · schedule" value={evm.spi} />
        <IndexGauge label="CPI · cost" value={evm.cpi} />
      </div>

      {/* Multi-dimensional health: On time / On budget / Scope */}
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        {([
          ['On time', evm.schedule_health],
          ['On budget', evm.cost_health],
          ['Scope / risk', evm.scope_health],
        ] as [string, Health][]).map(([label, h]) => (
          <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 py-2">
            <div className="flex items-center justify-center gap-1.5">
              <HealthDot health={h} />
              <span className="text-xs font-medium text-slate-700">{label}</span>
            </div>
          </div>
        ))}
      </div>

      {evm.percent_complete != null && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Progress (earned)</span>
            <span className="tabular-nums">
              {evm.percent_complete}% actual · {evm.planned_percent}% planned
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="absolute inset-y-0 rounded-full bg-indigo-500" style={{ width: `${evm.percent_complete}%` }} />
            {evm.planned_percent != null && (
              <div className="absolute inset-y-0 w-0.5 bg-slate-500" style={{ left: `${evm.planned_percent}%` }} title="Planned" />
            )}
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([k, v, sign]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-slate-50 py-0.5">
            <dt className="text-slate-500">{k}</dt>
            <dd className={cx('font-medium tabular-nums', sign === 'neg' ? 'text-rose-600' : sign === 'pos' ? 'text-emerald-600' : 'text-slate-900')}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {evm.bac == null && (
        <p className="mt-3 text-xs text-slate-400">Set a project budget and actual cost to unlock cost metrics.</p>
      )}
    </section>
  );
}
