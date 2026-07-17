'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from '@/components/feedback';
import { PageHeader, Spinner, Button, Field, Input, ErrorNote, cx } from '@/components/ui';

export default function SecurityPage() {
  const { toast } = useFeedback();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api<{ user: { totp_enabled: boolean } }>('/auth/me').then((d) => setEnabled(d.user.totp_enabled));
  useEffect(() => {
    load();
  }, []);

  if (enabled === null) return <Spinner />;

  async function startSetup() {
    setError(null);
    setCode('');
    const s = await api<{ secret: string; otpauth_url: string }>('/auth/2fa/setup', { method: 'POST' });
    setSetup(s);
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setSetup(null);
      toast('success', 'Two-factor authentication enabled');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to enable');
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password }) });
      setPassword('');
      toast('success', 'Two-factor authentication disabled');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to disable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Security" subtitle="Manage two-factor authentication for your account" />

      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Two-factor authentication</h2>
            <p className="text-sm text-slate-500">A time-based one-time code (TOTP) from an authenticator app.</p>
          </div>
          <span className={cx('rounded-full px-2.5 py-1 text-xs font-medium', enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {!enabled && !setup && (
          <Button onClick={startSetup}>Set up 2FA</Button>
        )}

        {!enabled && setup && (
          <form onSubmit={enable} className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="mb-2 text-sm text-slate-600">
                Add this account to your authenticator app using the secret below (or the otpauth URL), then enter the current code to confirm.
              </p>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Secret</p>
              <code className="block break-all rounded bg-white px-2 py-1 font-mono text-sm text-slate-800">{setup.secret}</code>
              <p className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">otpauth URL</p>
              <code className="block break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-500">{setup.otpauth_url}</code>
            </div>
            <Field label="Current 6-digit code">
              <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" required />
            </Field>
            <ErrorNote message={error} />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setSetup(null)}>Cancel</Button>
              <Button type="submit" disabled={busy || code.length !== 6}>{busy ? 'Enabling…' : 'Confirm & enable'}</Button>
            </div>
          </form>
        )}

        {enabled && (
          <form onSubmit={disable} className="space-y-4">
            <Field label="Confirm your password to disable">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </Field>
            <ErrorNote message={error} />
            <Button type="submit" variant="danger" disabled={busy || !password}>{busy ? 'Disabling…' : 'Disable 2FA'}</Button>
          </form>
        )}
      </div>
    </>
  );
}
