'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/components/auth-context';
import { useFeedback } from '@/components/feedback';
import { isGlobalAdmin, canManageBranch, type Branch, type Country } from '@/lib/types';
import {
  PageHeader, Spinner, EmptyState, Button, Modal, Field, Input, Select, ErrorNote,
} from '@/components/ui';

const emptyForm = { country_id: '', name: '', code: '', city: '', timezone: 'UTC' };

export default function BranchesPage() {
  const me = useMe();
  const { toast, confirm } = useFeedback();
  const admin = isGlobalAdmin(me);
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([
      api<{ branches: Branch[] }>('/branches').then((d) => setBranches(d.branches)),
      api<{ countries: Country[] }>('/countries').then((d) => setCountries(d.countries)),
    ]);
  useEffect(() => {
    load();
  }, []);

  function open(b: Branch | 'new') {
    setForm(
      b === 'new'
        ? { ...emptyForm, country_id: countries[0]?.id ?? '' }
        : { country_id: b.country_id, name: b.name, code: b.code, city: b.city ?? '', timezone: b.timezone }
    );
    setError(null);
    setEditing(b);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing === 'new') {
        await api('/branches', { method: 'POST', body: JSON.stringify(form) });
      } else if (editing) {
        await api(`/branches/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: Branch) {
    const ok = await confirm({
      title: `Delete ${b.name}?`,
      body: 'This permanently removes the branch and all of its projects.',
      confirmLabel: 'Delete branch',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/branches/${b.id}`, { method: 'DELETE' });
      toast('success', `${b.name} deleted`);
      await load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  if (!branches) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Branches"
        subtitle="Local offices within each country"
        action={admin && <Button onClick={() => open('new')}>+ New branch</Button>}
      />

      {branches.length === 0 ? (
        <EmptyState title="No branches yet" hint="Create a country first, then add branches to it." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Branch</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Country</th>
                <th className="px-5 py-3">City</th>
                <th className="px-5 py-3">Timezone</th>
                <th className="px-5 py-3">Projects</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branches.map((b) => {
                const canEdit = canManageBranch(me, b.id);
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-medium text-slate-900">{b.name}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{b.code}</td>
                    <td className="px-5 py-3.5 text-slate-600">{b.country_name}</td>
                    <td className="px-5 py-3.5 text-slate-600">{b.city ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500">{b.timezone}</td>
                    <td className="px-5 py-3.5 text-slate-600">{b.project_count}</td>
                    <td className="px-5 py-3.5 text-right">
                      {canEdit && <Button variant="ghost" onClick={() => open(b)}>Edit</Button>}
                      {admin && (
                        <Button variant="ghost" className="text-rose-500 hover:text-rose-600" onClick={() => remove(b)}>
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New branch' : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Country">
              <Select
                value={form.country_id}
                onChange={(e) => setForm({ ...form, country_id: e.target.value })}
                disabled={editing !== 'new'}
                required
              >
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code" hint="e.g. DE-BER">
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  required
                />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
            </div>
            <Field label="Timezone" hint="IANA name, e.g. Europe/Berlin — drives deadline alerts">
              <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
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
