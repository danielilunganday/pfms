import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getAuthToken } from '../lib/api';
import { Card, Table, Button, Input, Label, Select } from '../components/ui';
import { fmtMoney, fmtDate, todayIso } from '../lib/format';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

interface Account { id: string; name: string; currency: string }
interface Category { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }
interface Txn {
  id: string; type: string; date: string; currency: string; amount: string; description: string | null;
  isEssential: boolean; incomeStatus: string | null; receiptUrl: string | null;
}

type Tab = 'income' | 'expense' | 'transfer';

export function Transactions() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('expense');
  const { data: accounts } = useQuery({ queryKey: ['accounts-lite'], queryFn: () => api.get<Account[]>('/accounts') });
  const { data: incomeCats } = useQuery({ queryKey: ['categories', 'INCOME'], queryFn: () => api.get<Category[]>('/categories?kind=INCOME') });
  const { data: expenseCats } = useQuery({ queryKey: ['categories', 'EXPENSE'], queryFn: () => api.get<Category[]>('/categories?kind=EXPENSE') });
  const { data: txns } = useQuery({ queryKey: ['transactions'], queryFn: () => api.get<Txn[]>('/transactions') });
  const { data: paymentMethods } = useQuery({
    queryKey: ['config', 'PAYMENT_METHOD'],
    queryFn: () => api.get<{ id: string; value: string }[]>('/settings/config-options?listType=PAYMENT_METHOD'),
  });

  const [income, setIncome] = useState({ accountId: '', categoryId: '', currency: 'USD', amount: '', date: todayIso(), description: '', incomeStatus: 'RECEIVED' });
  const [expense, setExpense] = useState({ accountId: '', categoryId: '', currency: 'USD', amount: '', date: todayIso(), description: '', paymentMethod: '', isEssential: false });
  const [transfer, setTransfer] = useState({ fromAccountId: '', toAccountId: '', fromCurrency: 'USD', fromAmount: '', date: todayIso(), description: '' });

  const invalidate = () => qc.invalidateQueries();

  const createIncome = useMutation({
    mutationFn: () => api.post('/transactions/income', income),
    onSuccess: () => { invalidate(); setIncome({ ...income, amount: '', description: '' }); },
  });
  const createExpense = useMutation({
    mutationFn: () => api.post('/transactions/expense', expense),
    onSuccess: () => { invalidate(); setExpense({ ...expense, amount: '', description: '' }); },
  });
  const createTransfer = useMutation({
    mutationFn: () => api.post('/transactions/transfer', transfer),
    onSuccess: () => { invalidate(); setTransfer({ ...transfer, fromAmount: '', description: '' }); },
  });

  const uploadReceipt = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE_URL}/transactions/${id}/receipt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    onSuccess: () => invalidate(),
  });
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <p className="text-sm text-[var(--text-secondary)]">Record income, expenses, and transfers — each takes seconds.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 dark:bg-white/10 p-1">
            {(['income', 'expense', 'transfer'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition ${
                  tab === t ? 'bg-white dark:bg-[var(--surface-1)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--muted)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'income' && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createIncome.mutate(); }}>
              <div><Label>Account</Label>
                <Select value={income.accountId} onChange={(e) => setIncome({ ...income, accountId: e.target.value, currency: accounts?.find(a=>a.id===e.target.value)?.currency ?? income.currency })} required>
                  <option value="">Select…</option>
                  {accounts?.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </Select>
              </div>
              <div><Label>Category</Label>
                <Select value={income.categoryId} onChange={(e) => setIncome({ ...income, categoryId: e.target.value })}>
                  <option value="">Uncategorized</option>
                  {incomeCats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div><Label>Amount</Label><Input type="number" step="0.01" value={income.amount} onChange={(e) => setIncome({ ...income, amount: e.target.value })} required /></div>
              <div><Label>Date</Label><Input type="date" value={income.date} onChange={(e) => setIncome({ ...income, date: e.target.value })} required /></div>
              <div><Label>Status</Label>
                <Select value={income.incomeStatus} onChange={(e) => setIncome({ ...income, incomeStatus: e.target.value })}>
                  <option value="RECEIVED">Received</option>
                  <option value="EXPECTED">Expected (not yet received)</option>
                </Select>
              </div>
              <div><Label>Description</Label><Input value={income.description} onChange={(e) => setIncome({ ...income, description: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={createIncome.isPending}>Record income</Button>
            </form>
          )}

          {tab === 'expense' && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createExpense.mutate(); }}>
              <div><Label>Account</Label>
                <Select value={expense.accountId} onChange={(e) => setExpense({ ...expense, accountId: e.target.value, currency: accounts?.find(a=>a.id===e.target.value)?.currency ?? expense.currency })} required>
                  <option value="">Select…</option>
                  {accounts?.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </Select>
              </div>
              <div><Label>Category</Label>
                <Select value={expense.categoryId} onChange={(e) => setExpense({ ...expense, categoryId: e.target.value })}>
                  <option value="">Uncategorized</option>
                  {expenseCats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div><Label>Amount</Label><Input type="number" step="0.01" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} required /></div>
              <div><Label>Date</Label><Input type="date" value={expense.date} onChange={(e) => setExpense({ ...expense, date: e.target.value })} required /></div>
              <div><Label>Payment method</Label>
                <Select value={expense.paymentMethod} onChange={(e) => setExpense({ ...expense, paymentMethod: e.target.value })}>
                  <option value="">—</option>
                  {paymentMethods?.map((p) => <option key={p.id} value={p.value}>{p.value}</option>)}
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={expense.isEssential} onChange={(e) => setExpense({ ...expense, isEssential: e.target.checked })} />
                Essential expense
              </label>
              <div><Label>Description</Label><Input value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={createExpense.isPending}>Record expense</Button>
            </form>
          )}

          {tab === 'transfer' && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createTransfer.mutate(); }}>
              <div><Label>From account</Label>
                <Select value={transfer.fromAccountId} onChange={(e) => setTransfer({ ...transfer, fromAccountId: e.target.value, fromCurrency: accounts?.find(a=>a.id===e.target.value)?.currency ?? transfer.fromCurrency })} required>
                  <option value="">Select…</option>
                  {accounts?.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </Select>
              </div>
              <div><Label>To account</Label>
                <Select value={transfer.toAccountId} onChange={(e) => setTransfer({ ...transfer, toAccountId: e.target.value })} required>
                  <option value="">Select…</option>
                  {accounts?.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </Select>
              </div>
              <div><Label>Amount</Label><Input type="number" step="0.01" value={transfer.fromAmount} onChange={(e) => setTransfer({ ...transfer, fromAmount: e.target.value })} required /></div>
              <div><Label>Date</Label><Input type="date" value={transfer.date} onChange={(e) => setTransfer({ ...transfer, date: e.target.value })} required /></div>
              <div><Label>Description</Label><Input value={transfer.description} onChange={(e) => setTransfer({ ...transfer, description: e.target.value })} /></div>
              <p className="text-xs text-[var(--muted)]">Transfers move money between your own accounts — never counted as income or expense.</p>
              <Button type="submit" className="w-full" disabled={createTransfer.isPending}>Record transfer</Button>
            </form>
          )}
        </Card>

        <Card title="Recent transactions" className="lg:col-span-2">
          <Table headers={['Date', 'Type', 'Description', 'Amount', 'Receipt']}>
            {txns?.slice(0, 30).map((t) => (
              <tr key={t.id}>
                <td className="py-2 pr-4 whitespace-nowrap text-[var(--text-secondary)]">{fmtDate(t.date)}</td>
                <td className="py-2 pr-4">
                  <span className={`text-xs font-medium ${t.type === 'INCOME' ? 'text-[var(--good)]' : t.type === 'EXPENSE' ? 'text-[var(--critical)]' : 'text-[var(--brand)]'}`}>
                    {t.type}{t.incomeStatus === 'EXPECTED' ? ' (expected)' : ''}
                  </span>
                </td>
                <td className="py-2 pr-4">{t.description ?? '—'}</td>
                <td className="py-2 pr-4 tabular-nums font-medium">{fmtMoney(t.amount, t.currency)}</td>
                <td className="py-2 pr-4">
                  <input
                    ref={(el) => { fileInputs.current[t.id] = el; }}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadReceipt.mutate({ id: t.id, file });
                      e.target.value = '';
                    }}
                  />
                  {t.receiptUrl ? (
                    <a
                      href={`${UPLOADS_ORIGIN}${t.receiptUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-[var(--brand)] hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputs.current[t.id]?.click()}
                      className="text-xs font-medium text-[var(--muted)] hover:text-[var(--brand)]"
                      disabled={uploadReceipt.isPending}
                    >
                      + Attach
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
