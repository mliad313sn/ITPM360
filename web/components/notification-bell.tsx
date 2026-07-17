'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { NotificationRow } from '@/lib/types';
import { cx } from '@/components/ui';

const TYPE_META: Record<string, { icon: string; tint: string }> = {
  task_blocked: { icon: '⛔', tint: 'bg-rose-50' },
  rag_downgrade: { icon: '📉', tint: 'bg-amber-50' },
  deadline_approaching: { icon: '⏰', tint: 'bg-sky-50' },
  task_assigned: { icon: '📌', tint: 'bg-indigo-50' },
  meeting_scheduled: { icon: '📅', tint: 'bg-violet-50' },
  grc_checkpoint_due: { icon: '🛡️', tint: 'bg-slate-100' },
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<{ notifications: NotificationRow[]; unread: number }>('/notifications')
      .then((d) => {
        setItems(d.notifications);
        setUnread(d.unread);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function openItem(n: NotificationRow) {
    if (!n.is_read) {
      api(`/notifications/${n.id}/read`, { method: 'POST' }).then(load);
    }
    setOpen(false);
    if (n.entity_type === 'task' || n.entity_type === 'project') {
      // task notifications deep-link to their project
      if (n.entity_type === 'project' && n.entity_id) router.push(`/projects/${n.entity_id}`);
      else router.push('/my-tasks');
    } else if (n.entity_type === 'meeting' && n.entity_id) {
      router.push(`/meetings/${n.entity_id}`);
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => api('/notifications/read-all', { method: 'POST' }).then(load)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">All caught up.</p>
            ) : (
              items.map((n) => {
                const meta = TYPE_META[n.type] ?? { icon: '🔔', tint: 'bg-slate-100' };
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={cx(
                      'flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50',
                      !n.is_read && 'bg-indigo-50/40'
                    )}
                  >
                    <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm', meta.tint)}>
                      {meta.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-slate-500">{n.body}</span>}
                      <span className="text-xs text-slate-400">{timeAgo(n.created_at)}</span>
                    </span>
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
