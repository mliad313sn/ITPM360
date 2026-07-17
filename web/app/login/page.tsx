'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken, ApiError } from '@/lib/api';
import { Button, Input, Field, ErrorNote } from '@/components/ui';
import type { Me } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api<{ token: string; user: Me }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, totp: totp || undefined }),
      });
      setToken(token);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.data.twofa_required) {
        setNeedsTotp(true);
        setError(totp ? 'Invalid authenticator code' : null);
      } else {
        setError(err instanceof ApiError ? err.message : 'Login failed');
      }
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            ITPM<span className="text-indigo-600">360</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to your workspace</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>
          {needsTotp && (
            <Field label="Authenticator code" hint="6-digit code from your authenticator app">
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
              />
            </Field>
          )}
          <ErrorNote message={error} />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : needsTotp ? 'Verify & sign in' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          Demo: admin@itpm360.dev / Password123!
        </p>
      </div>
    </main>
  );
}
