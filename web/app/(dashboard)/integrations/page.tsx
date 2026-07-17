'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { useFeedback } from '@/components/feedback';
import { isGlobalAdmin, type Webhook, type WebhookDelivery } from '@/lib/types';
import { PageHeader, Spinner, Button, Modal, Field, Input, ErrorNote, cx } from '@/components/ui';

export default function IntegrationsPage() {
  const me = useMe();
  const { toast, confirm } = useFeedback();
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ url: string; events: string[] }>({ url: '', events: [] });
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      api<{ webhooks: Webhook[] }>('/webhooks').then((d) => setWebhooks(d.webhooks)),
      api<{ deliveries: WebhookDelivery[] }>('/webhooks/deliveries/recent').then((d) => setDeliveries(d.deliveries)),
      api<{ events: string[] }>('/webhooks/events').then((d) => setEvents(d.events)),
    ]);
  useEffect(() => {
    load().catch(() => setWebhooks([]));
  }, []);

  if (!isGlobalAdmin(me)) {
    return <p className="py-20 text-center text-slate-500">Integrations are managed by global admins.</p>;
  }
  if (!webhooks) return <Spinner />;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/webhooks', { method: 'POST', body: JSON.stringify(form) });
      setCreating(false);
      toast('success', 'Webhook created');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    }
  }

  async function remove(w: Webhook) {
    if (!(await confirm({ title: 'Delete webhook?', body: w.url, confirmLabel: 'Delete', danger: true }))) return;
    await api(`/webhooks/${w.id}`, { method: 'DELETE' });
    toast('success', 'Webhook deleted');
    await load();
  }

  async function toggle(w: Webhook) {
    await api(`/webhooks/${w.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !w.is_active }) });
    await load();
  }

  async function test(w: Webhook) {
    await api(`/webhooks/${w.id}/test`, { method: 'POST' });
    toast('info', 'Test delivery dispatched — refresh deliveries in a moment.');
    setTimeout(load, 2500);
  }

  const toggleEvent = (ev: string) =>
    setForm((f) => ({ ...f, events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events, ev] }));

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Push project events into other enterprise systems — HMAC-signed webhooks + REST API"
        action={
          <Button onClick={() => { setForm({ url: '', events: [] }); setError(null); setCreating(true); }}>
            + New webhook
          </Button>
        }
      />

      <div className="space-y-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {webhooks.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No webhooks yet. Create one to receive JSON events (signed with HMAC-SHA256) on RAG changes,
              blocked tasks, completed meetings and more.
            </p>
          ) : (
            webhooks.map((w, i) => (
              <div key={w.id} className={cx('px-5 py-4', i > 0 && 'border-t border-slate-100')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-slate-900">
                      <span className={cx('h-2 w-2 rounded-full', w.is_active ? 'bg-emerald-500' : 'bg-slate-300')} />
                      <span className="truncate font-mono text-sm">{w.url}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {w.events.map((e) => (
                        <span key={e} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{e}</span>
                      ))}
                    </p>
                    <button
                      onClick={() => setRevealed(revealed === w.id ? null : w.id)}
                      className="mt-1 text-xs text-indigo-600 hover:underline"
                    >
                      {revealed === w.id ? 'Hide signing secret' : 'Show signing secret'}
                    </button>
                    {revealed === w.id && (
                      <code className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{w.secret}</code>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" onClick={() => test(w)}>Send test</Button>
                    <Button variant="ghost" onClick={() => toggle(w)}>{w.is_active ? 'Disable' : 'Enable'}</Button>
                    <Button variant="ghost" className="text-rose-500" onClick={() => remove(w)}>Delete</Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent deliveries</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {deliveries.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">No deliveries yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Event</th>
                    <th className="px-4 py-2.5">Endpoint</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Attempts</th>
                    <th className="px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{d.event}</td>
                      <td className="max-w-52 truncate px-4 py-2.5 font-mono text-xs text-slate-500">{d.url}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cx(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            d.response_status && d.response_status < 300
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          )}
                        >
                          {d.response_status || 'failed'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{d.attempts}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(d.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">REST API access</h2>
          <p>
            All data is also available through the authenticated REST API — <code className="rounded bg-slate-100 px-1">POST /api/auth/login</code> for
            a bearer token, then e.g. <code className="rounded bg-slate-100 px-1">GET /api/projects</code>,{' '}
            <code className="rounded bg-slate-100 px-1">GET /api/export/tasks?format=csv</code>. Webhook payloads are signed with
            <code className="ml-1 rounded bg-slate-100 px-1">X-ITPM360-Signature: sha256=HMAC(secret, body)</code>.
          </p>
        </div>
      </div>

      {creating && (
        <Modal title="New webhook" onClose={() => setCreating(false)} wide>
          <form onSubmit={create} className="space-y-4">
            <Field label="Endpoint URL">
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com/hooks/itpm360"
                required
              />
            </Field>
            <Field label="Events">
              <div className="flex flex-wrap gap-2">
                {events.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleEvent(ev)}
                    className={cx(
                      'rounded-full border px-3 py-1 text-xs font-medium transition',
                      form.events.includes(ev)
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300'
                    )}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </Field>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={!form.url || form.events.length === 0}>Create webhook</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
