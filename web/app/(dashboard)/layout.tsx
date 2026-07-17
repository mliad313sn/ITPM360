'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, getToken, clearToken } from '@/lib/api';
import { AuthContext } from '@/components/auth-context';
import { FeedbackProvider } from '@/components/feedback';
import { NotificationBell } from '@/components/notification-bell';
import { CommandPalette } from '@/components/command-palette';
import { Spinner, cx, roleLabels } from '@/components/ui';
import { isGlobalAdmin, type Me } from '@/lib/types';

const icons = {
  dashboard: <path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" />,
  mytasks: <path d="M9 11.5 11 13.5 15 9.5M8 3h8l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />,
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  countries: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.8 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.8-3.8-9S9.5 5.7 12 3z" />
    </>
  ),
  branches: <path d="M3 21V8l7-5 7 5v13M9 21v-6h2v6m4 0v-9h4v9M3 21h18" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4.5-6.2" />
    </>
  ),
  meetings: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  reports: <path d="M4 20V10m5.5 10V4m5.5 16v-8m5 8V7" />,
  capacity: (
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" rx="0.5" />
      <rect x="12" y="8" width="3" height="10" rx="0.5" />
      <rect x="17" y="5" width="3" height="13" rx="0.5" />
    </>
  ),
  integrations: <path d="M9 2v6m6-6v6M5 8h14v4a7 7 0 0 1-14 0zM12 19v3" />,
  audit: (
    <>
      <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
      <path d="M9.5 12l2 2 3.5-3.5" />
    </>
  ),
};

type NavItem = { href: string; label: string; icon: React.ReactNode; adminOnly?: boolean };
type NavGroup = { title: string | null; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
      { href: '/my-tasks', label: 'My Tasks', icon: icons.mytasks },
    ],
  },
  {
    title: 'Portfolio',
    items: [
      { href: '/projects', label: 'Projects', icon: icons.projects },
      { href: '/meetings', label: 'Meetings', icon: icons.meetings },
      { href: '/capacity', label: 'Capacity', icon: icons.capacity },
      { href: '/reports', label: 'Reports & Export', icon: icons.reports },
    ],
  },
  {
    title: 'Organization',
    items: [
      { href: '/countries', label: 'Countries', icon: icons.countries },
      { href: '/branches', label: 'Branches', icon: icons.branches },
      { href: '/users', label: 'Users', icon: icons.users },
      { href: '/integrations', label: 'Integrations', icon: icons.integrations, adminOnly: true },
      { href: '/audit', label: 'Audit Log', icon: icons.audit, adminOnly: true },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api<{ user: Me }>('/auth/me')
      .then(({ user }) => setMe(user))
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const admin = isGlobalAdmin(me);
  const primaryRole = admin ? 'Global Admin' : me.roles[0] ? roleLabels[me.roles[0].role] : 'Member';
  const initials = me.full_name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <AuthContext.Provider value={me}>
      <FeedbackProvider>
        <div className="flex min-h-screen bg-slate-50">
          <aside className="fixed inset-y-0 z-40 flex w-60 flex-col border-r border-slate-800/60 bg-slate-900">
            <div className="flex h-16 items-center px-5 text-lg font-bold tracking-tight text-white">
              ITPM<span className="text-indigo-400">360</span>
            </div>
            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
              {NAV.map((group) => {
                const items = group.items.filter((i) => !i.adminOnly || admin);
                if (!items.length) return null;
                return (
                  <div key={group.title ?? 'root'}>
                    {group.title && (
                      <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        {group.title}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {items.map((item) => {
                        const active = pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cx(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                              active
                                ? 'bg-indigo-600/90 text-white shadow-sm shadow-indigo-950/40'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            )}
                          >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              {item.icon}
                            </svg>
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
            <div className="border-t border-slate-800 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{me.full_name}</p>
                  <p className="truncate text-xs text-slate-400">{primaryRole}</p>
                </div>
              </div>
              <div className="mt-2 flex gap-3">
                <Link href="/security" className="text-xs font-medium text-slate-400 transition hover:text-white">
                  Security
                </Link>
                <button
                  onClick={() => {
                    clearToken();
                    router.replace('/login');
                  }}
                  className="text-xs font-medium text-slate-400 transition hover:text-white"
                >
                  Sign out
                </button>
              </div>
            </div>
          </aside>

          <div className="ml-60 flex min-h-screen flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-200/80 bg-slate-50/80 px-8 backdrop-blur">
              <button
                onClick={() => setPaletteOpen(true)}
                className="flex w-72 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-400 shadow-sm transition hover:border-slate-300 hover:text-slate-500"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <span className="flex-1 text-left">Search…</span>
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                  ⌘K
                </kbd>
              </button>
              <NotificationBell />
            </header>
            <main className="flex-1 px-8 py-8">
              <div className="mx-auto max-w-6xl">{children}</div>
            </main>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </FeedbackProvider>
    </AuthContext.Provider>
  );
}
