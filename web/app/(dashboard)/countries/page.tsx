'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { isGlobalAdmin, type Country } from '@/lib/types';
import {
  PageHeader, Spinner, EmptyState, Button, Modal, Field, Input, ErrorNote, formatDate,
} from '@/components/ui';

export default function CountriesPage() {
  const me = useMe();
  const admin = isGlobalAdmin(me);
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [editing, setEditing] = useState<Country | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', iso_code: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api<{ countries: Country[] }>('/countries').then((d) => setCountries(d.countries));
  useEffect(() => {
    load();
  }, []);

  function open(c: Country | 'new') {
    setForm(c === 'new' ? { name: '', iso_code: '' } : { name: c.name, iso_code: c.iso_code });
    setError(null);
    setEditing(c);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing === 'new') {
        await api('/countries', { method: 'POST', body: JSON.stringify(form) });
      } else if (editing) {
        await api(`/countries/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Country) {
    if (!confirm(`Delete ${c.name}? This removes all its branches and projects.`)) return;
    try {
      await api(`/countries/${c.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  if (!countries) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Countries"
        subtitle="Top level of the organization hierarchy"
        action={admin && <Button onClick={() => open('new')}>+ New country</Button>}
      />

      {countries.length === 0 ? (
        <EmptyState title="No countries yet" hint="Add the first country to start building the hierarchy." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Country</th>
                <th className="px-5 py-3">ISO</th>
                <th className="px-5 py-3">Branches</th>
                <th className="px-5 py-3">Created</th>
                {admin && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {countries.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 font-medium text-slate-900">{c.name}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{c.iso_code}</td>
                  <td className="px-5 py-3.5 text-slate-600">{c.branch_count}</td>
                  <td className="px-5 py-3.5 text-slate-500">{formatDate(c.created_at)}</td>
                  {admin && (
                    <td className="px-5 py-3.5 text-right">
                      <Button variant="ghost" onClick={() => open(c)}>Edit</Button>
                      <Button variant="ghost" className="text-rose-500 hover:text-rose-600" onClick={() => remove(c)}>
                        Delete
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New country' : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="ISO code" hint="2-letter ISO 3166-1 code, e.g. DE">
              <Input
                value={form.iso_code}
                onChange={(e) => setForm({ ...form, iso_code: e.target.value.toUpperCase() })}
                maxLength={2}
                pattern="[A-Za-z]{2}"
                required
              />
            </Field>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
