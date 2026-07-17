'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { SearchResult } from '@/lib/types';
import { cx } from '@/components/ui';

const TYPE_ICONS: Record<SearchResult['type'], string> = { project: '📁', task: '☑️', meeting: '📅' };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(() => {
      api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(q.trim())}`)
        .then((d) => {
          setResults(d.results);
          setActive(0);
        })
        .catch(() => {});
    }, 180);
  }, [q]);

  const go = useCallback(
    (r: SearchResult) => {
      onClose();
      router.push(r.href);
    },
    [onClose, router]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[14vh]">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
              if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
              if (e.key === 'Enter' && results[active]) go(results[active]);
            }}
            placeholder="Search projects, tasks, meetings…"
            className="w-full bg-transparent py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">Type at least two characters to search.</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">No matches for “{q}”.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => go(r)}
                onMouseEnter={() => setActive(i)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                  i === active ? 'bg-indigo-50' : 'hover:bg-slate-50'
                )}
              >
                <span className="text-base">{TYPE_ICONS[r.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{r.name}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {r.type} · {r.context}
                  </span>
                </span>
                {i === active && <kbd className="text-[10px] text-slate-400">↵</kbd>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
