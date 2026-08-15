import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Table, Button, Input, Label, Select } from '../components/ui';
import { fmtMoney, fmtDate, todayIso } from '../lib/format';

interface Account { id: string; name: string; currency: string }
interface Category { id: string; name: string }
interface Recurring {
  id: string; description: string; type: string; amount: string; currency: string; frequency: string; nextDueDate: string; active: boolean;
}

export function Recurring() {
  const qc = useQueryClient();
  const { data: items } = useQuery({ queryKey: ['recurring'], queryFn: () => api.get<Recurring[]>('/recurring') });
  const { data: accounts } = useQuery({ queryKey: ['accounts-lite'], queryFn: () => api.get<Account[]>('/accounts') });
  const { data: expenseCats } = useQuery({ queryKey: ['categories', 'EXPENSE'], queryFn: () => api.get<Category[]>('/categories?kind=EXPENSE') });
  const { data: frequencies } = useQuery({
    queryKey: ['config', 'FREQUENCY'],
    queryFn: () => api.get<{ id: string; value: string }[]>('/settings/config-options?listType=FREQUENCY'),
  });

  const [form, setForm] = useState({ description: '', type: 'EXPENSE', categoryId: '', amount: '', currency: 'USD', accountId: '', frequency: 'MONTHLY', startDate: todayIso() });

  const create = useMutation({
    mutationFn: () => api.post('/recurring', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); setForm({ ...form, description: '', amount: '' }); },
  });
  const generateDue = useMutation({
    mutationFn: () => api.post<{ generated: number }>('/recurring/generate-due'),
    onSuccess: (res) => { qc.invalidateQueries(); alert(`Generated ${res.generated} transaction(s) from recurring items.`); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Recurring transactions</h1>
          <p className="text-sm text-[var(--text-secondary)]">Rent, subscriptions, loan repayments — obligations that repeat.</p>
        </div>
        <Button variant="secondary" onClick={() => generateDue.mutate()} disabled={generateDue.isPending}>
          {generateDue.isPending ? 'Generating…' : 'Generate due transactions now'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Recurring items" className="lg:col-span-2">
          <Table headers={['Description', 'Type', 'Amount', 'Frequency', 'Next due']}>
            {items?.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-4">{r.description}</td>
                <td className="py-2 pr-4 text-[var(--text-secondary)]">{r.type}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(r.amount, r.currency)}</td>
                <td className="py-2 pr-4 text-[var(--text-secondary)]">{r.frequency}</td>
                <td className="py-2 pr-4">{fmtDate(r.nextDueDate)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Add a recurring item">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></div>
            <div><Label>Type</Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </Select>
            </div>
            <div><Label>Category</Label>
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">—</option>
                {expenseCats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div><Label>Account</Label>
              <Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value, currency: accounts?.find(a=>a.id===e.target.value)?.currency ?? form.currency })} required>
                <option value="">Select…</option>
                {accounts?.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
            <div><Label>Frequency</Label>
              <Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                {frequencies?.map((f) => <option key={f.id} value={f.value}>{f.value}</option>)}
              </Select>
            </div>
            <div><Label>Start date</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></div>
            <Button type="submit" className="w-full" disabled={create.isPending}>Add recurring item</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
