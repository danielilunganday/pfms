import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Table, Button, Input, Label, Select, StatusBadge } from '../components/ui';
import { fmtMoney, currentPeriod } from '../lib/format';

interface Category { id: string; name: string }
interface BudgetLine {
  categoryId: string; categoryName: string; isEssential: boolean; budget: string; actual: string; variance: string; remaining: string; pctUsed: string; status: string;
}
interface OverallBudget {
  period: string; currency: string; capSet: boolean; budget: string; actual: string; variance: string; remaining: string; pctUsed: string; status: string; transactionCount: number;
}

export function Budgets() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const currency = 'USD';
  const { data: categories } = useQuery({ queryKey: ['categories', 'EXPENSE'], queryFn: () => api.get<Category[]>('/categories?kind=EXPENSE') });
  const { data: lines, isLoading } = useQuery({
    queryKey: ['budgets-vs-actual', period, currency],
    queryFn: () => api.get<BudgetLine[]>(`/budgets/vs-actual?period=${period}&currency=${currency}`),
  });
  const { data: overall } = useQuery({
    queryKey: ['overall-budget', period, currency],
    queryFn: () => api.get<OverallBudget>(`/budgets/overall/vs-actual?period=${period}&currency=${currency}`),
  });

  const [form, setForm] = useState({ categoryId: '', amount: '' });
  const setBudget = useMutation({
    mutationFn: () => api.post('/budgets', { categoryId: form.categoryId, period, amount: form.amount, currency }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets-vs-actual'] }); setForm({ categoryId: '', amount: '' }); },
  });

  const [overallAmount, setOverallAmount] = useState('');
  const setOverall = useMutation({
    mutationFn: () => api.post('/budgets/overall', { period, currency, amount: overallAmount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['overall-budget'] }); setOverallAmount(''); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Budget</h1>
          <p className="text-sm text-[var(--text-secondary)]">Budget vs. actual, by category and month.</p>
        </div>
        <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
      </div>

      {overall && (
        <Card title={`Overall monthly budget — ${period}`}>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Every expense counts here — groceries, utilities, a one-off purchase like a suit or new clothes, anything —
            regardless of whether you've set a budget for that specific category below. This is your real ceiling for
            the month.
          </p>
          {overall.capSet ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 items-end">
              <div><div className="text-xs uppercase tracking-wide text-[var(--muted)]">Cap</div><div className="tabular-nums text-lg font-semibold">{fmtMoney(overall.budget, currency)}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-[var(--muted)]">Spent (all expenses)</div><div className="tabular-nums text-lg font-semibold">{fmtMoney(overall.actual, currency)}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-[var(--muted)]">Remaining</div><div className="tabular-nums text-lg font-semibold">{fmtMoney(overall.remaining, currency)}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-[var(--muted)]">% used</div><div className="tabular-nums text-lg font-semibold">{overall.pctUsed}%</div></div>
              <div className="flex items-center gap-2"><StatusBadge status={overall.status} /><span className="text-xs text-[var(--muted)]">{overall.transactionCount} expense(s)</span></div>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">No overall cap set for {period} yet.</p>
          )}
          <form className="mt-4 flex items-end gap-3 border-t border-[var(--border)] pt-4" onSubmit={(e) => { e.preventDefault(); setOverall.mutate(); }}>
            <div className="flex-1 max-w-xs">
              <Label>{overall.capSet ? 'Change cap' : 'Set a cap'} ({currency})</Label>
              <Input type="number" step="0.01" value={overallAmount} onChange={(e) => setOverallAmount(e.target.value)} placeholder={overall.capSet ? overall.budget : 'e.g. 1500'} required />
            </div>
            <Button type="submit" disabled={setOverall.isPending}>{setOverall.isPending ? 'Saving…' : 'Save'}</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Budget vs actual — ${period}`} className="lg:col-span-2">
          {isLoading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
          <Table headers={['Category', 'Budget', 'Actual', 'Remaining', '% used', 'Status']}>
            {lines?.map((l) => (
              <tr key={l.categoryId}>
                <td className="py-2 pr-4">
                  {l.categoryName}
                  {!l.isEssential && <span className="ml-1.5 rounded bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">discretionary</span>}
                </td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(l.budget, currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(l.actual, currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(l.remaining, currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{l.pctUsed}%</td>
                <td className="py-2 pr-4"><StatusBadge status={l.status} /></td>
              </tr>
            ))}
          </Table>
          {lines?.length === 0 && <p className="text-sm text-[var(--muted)]">No budgets set for this month yet.</p>}
        </Card>

        <Card title="Set a category budget">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setBudget.mutate(); }}>
            <div><Label>Category</Label>
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                <option value="">Select…</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div><Label>Monthly amount ({currency})</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </div>
            <p className="text-xs text-[var(--muted)]">Applies to {period}. Warning at 80% used, over at 100% — adjust anytime in Settings.</p>
            <Button type="submit" className="w-full" disabled={setBudget.isPending}>Save budget</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
