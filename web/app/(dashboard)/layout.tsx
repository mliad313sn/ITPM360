'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, getToken, clearToken } from '@/lib/api';
import { AuthContext } from '@/components/auth-context';
import { Spinner, cx, roleLabels } from '@/components/ui';
import { isGlobalAdmin, type Me } from '@/lib/types';

const icons = {
  dashboard: <path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" />,
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
};

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
  { href: '/projects', label: 'Projects', icon: icons.projects },
  { href: '/countries', label: 'Countries', icon: icons.countries },
  { href: '/branches', label: 'Branches', icon: icons.branches },
  { href: '/users', label: 'Users', icon: icons.users },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api<{ user: Me }>('/auth/me')
      .then(({ user }) => setMe(user))
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const primaryRole = isGlobalAdmin(me)
    ? 'Global Admin'
    : me.roles[0]
      ? roleLabels[me.roles[0].role]
      : 'Member';

  return (
    <AuthContext.Provider value={me}>
      <div className="flex min-h-screen bg-slate-50">
        <aside className="fixed inset-y-0 z-40 flex w-60 flex-col border-r border-slate-800 bg-slate-900">
          <div className="flex h-16 items-center px-5 text-lg font-bold tracking-tight text-white">
            ITPM<span className="text-indigo-400">360</span>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-2">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                    active ? 'bg-indigo-600/90 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {item.icon}
                  </svg>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-slate-800 p-4">
            <div className="mb-2">
              <p className="truncate text-sm font-medium text-white">{me.full_name}</p>
              <p className="truncate text-xs text-slate-400">{primaryRole}</p>
            </div>
            <button
              onClick={() => {
                clearToken();
                router.replace('/login');
              }}
              className="text-xs font-medium text-slate-400 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="ml-60 flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </AuthContext.Provider>
  );
}
