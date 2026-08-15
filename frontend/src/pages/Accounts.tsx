import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Table, Button, Input, Label, Select } from '../components/ui';
import { fmtMoney, todayIso } from '../lib/format';

interface Account {
  id: string;
  name: string;
  accountType: string;
  currency: string;
  openingBalance: string;
  balance: string;
  active: boolean;
}
interface ConfigOption { id: string; value: string }

export function Accounts() {
  const qc = useQueryClient();
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/accounts') });
  const { data: types } = useQuery({
    queryKey: ['config', 'ACCOUNT_TYPE'],
    queryFn: () => api.get<ConfigOption[]>('/settings/config-options?listType=ACCOUNT_TYPE'),
  });
  const { data: currencies } = useQuery({ queryKey: ['currencies'], queryFn: () => api.get<{ code: string }[]>('/settings/currencies') });

  const [form, setForm] = useState({ name: '', accountType: '', currency: 'USD', openingBalance: '0', openingDate: todayIso() });

  const createAccount = useMutation({
    mutationFn: () => api.post('/accounts', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setForm({ name: '', accountType: '', currency: 'USD', openingBalance: '0', openingDate: todayIso() });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-[var(--text-secondary)]">Where your money is held — cash, bank, mobile money, savings, investment accounts.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Your accounts" className="lg:col-span-2">
          <Table headers={['Name', 'Type', 'Currency', 'Balance']}>
            {accounts?.map((a) => (
              <tr key={a.id}>
                <td className="py-2 pr-4">{a.name}</td>
                <td className="py-2 pr-4 text-[var(--text-secondary)]">{a.accountType}</td>
                <td className="py-2 pr-4 text-[var(--text-secondary)]">{a.currency}</td>
                <td className="py-2 pr-4 tabular-nums font-medium">{fmtMoney(a.balance, a.currency)}</td>
              </tr>
            ))}
          </Table>
          {accounts?.length === 0 && <p className="text-sm text-[var(--muted)]">No accounts yet — add your first one.</p>}
        </Card>

        <Card title="Add an account">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createAccount.mutate();
            }}
          >
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })} required>
                <option value="">Select…</option>
                {types?.map((t) => (
                  <option key={t.id} value={t.value}>{t.value}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {currencies?.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Opening balance</Label>
              <Input type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} />
            </div>
            <div>
              <Label>Opening date</Label>
              <Input type="date" value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} required />
            </div>
            <Button type="submit" className="w-full" disabled={createAccount.isPending}>
              {createAccount.isPending ? 'Adding…' : 'Add account'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
