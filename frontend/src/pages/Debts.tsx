import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Table, Button, Input, Label, StatusBadge } from '../components/ui';
import { fmtMoney, fmtDate, todayIso } from '../lib/format';

interface Debt {
  id: string; creditorName: string; date: string; originalAmount: string; currency: string;
  purpose: string | null; dueDate: string | null; amountPaid: string; status: string;
}

export function Debts() {
  const qc = useQueryClient();
  const { data: debts } = useQuery({ queryKey: ['debts'], queryFn: () => api.get<Debt[]>('/debts') });

  const [form, setForm] = useState({ creditorName: '', date: todayIso(), originalAmount: '', currency: 'USD', purpose: '', dueDate: '' });
  const create = useMutation({
    mutationFn: () => api.post('/debts', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debts'] }); setForm({ ...form, creditorName: '', originalAmount: '' }); },
  });

  const [payment, setPayment] = useState<Record<string, string>>({});
  const pay = useMutation({
    mutationFn: (id: string) => api.post(`/debts/${id}/payments`, { amount: payment[id] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['debts'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Debts I owe</h1>
        <p className="text-sm text-[var(--text-secondary)]">Money you owe other people — separate from your own loans given (see Lending).</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Outstanding debts" className="lg:col-span-2">
          <Table headers={['Creditor', 'Purpose', 'Original', 'Paid', 'Due', 'Status', 'Pay']}>
            {debts?.map((d) => (
              <tr key={d.id}>
                <td className="py-2 pr-4">{d.creditorName}</td>
                <td className="py-2 pr-4 text-[var(--text-secondary)]">{d.purpose ?? '—'}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(d.originalAmount, d.currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(d.amountPaid, d.currency)}</td>
                <td className="py-2 pr-4">{fmtDate(d.dueDate)}</td>
                <td className="py-2 pr-4"><StatusBadge status={d.status} /></td>
                <td className="py-2 pr-4">
                  {d.status !== 'PAID' && (
                    <div className="flex gap-1">
                      <Input className="w-20" type="number" step="0.01" value={payment[d.id] ?? ''} onChange={(e) => setPayment({ ...payment, [d.id]: e.target.value })} />
                      <Button variant="secondary" onClick={() => pay.mutate(d.id)} disabled={!payment[d.id]}>Pay</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          {debts?.length === 0 && <p className="text-sm text-[var(--muted)]">You don't owe anyone right now.</p>}
        </Card>

        <Card title="Add a debt">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <div><Label>Creditor</Label><Input value={form.creditorName} onChange={(e) => setForm({ ...form, creditorName: e.target.value })} required /></div>
            <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
            <div><Label>Original amount</Label><Input type="number" step="0.01" value={form.originalAmount} onChange={(e) => setForm({ ...form, originalAmount: e.target.value })} required /></div>
            <div><Label>Purpose</Label><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
            <div><Label>Due date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={create.isPending}>Add debt</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
