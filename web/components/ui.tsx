'use client';

import { ReactNode } from 'react';
import type { Rag, ProjectStatus, RoleName } from '@/lib/types';

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Buttons & form controls
// ---------------------------------------------------------------------------

const buttonVariants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-300',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
} as const;

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonVariants }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed',
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  );
}

const controlClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(controlClass, props.className)} {...props} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(controlClass, 'min-h-24', props.className)} {...props} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(controlClass, props.className)} {...props} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cx(
          'relative max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl',
          wide ? 'max-w-2xl' : 'max-w-md'
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const ragStyles: Record<Rag, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};
const ragDot: Record<Rag, string> = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500' };

export function RagBadge({ rag }: { rag: Rag }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ring-1 ring-inset',
        ragStyles[rag]
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', ragDot[rag])} />
      {rag}
    </span>
  );
}

const statusLabels: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const statusStyles: Record<ProjectStatus, string> = {
  planning: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  active: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  on_hold: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  cancelled: 'bg-rose-50 text-rose-600 ring-rose-600/20',
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', statusStyles[status])}>
      {statusLabels[status]}
    </span>
  );
}

export const roleLabels: Record<RoleName, string> = {
  global_admin: 'Global Admin',
  branch_manager: 'Branch Manager',
  project_manager: 'Project Manager',
  viewer: 'Viewer',
};

export function RoleChip({ role, branch, onRemove }: { role: RoleName; branch?: string | null; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {roleLabels[role]}
      {branch && <span className="text-slate-400">· {branch}</span>}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 text-slate-400 hover:text-rose-500" title="Remove role">
          ×
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page scaffolding
// ---------------------------------------------------------------------------

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white py-14 text-center">
      <p className="font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>;
}

export function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatMoney(v: string | null) {
  if (v == null) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
