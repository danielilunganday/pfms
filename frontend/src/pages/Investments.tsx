import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Table, Button, Input, Label, Select } from '../components/ui';
import { fmtMoney, todayIso } from '../lib/format';

interface InvestmentPerf {
  investmentId: string; name: string; currency: string; capitalInvested: string; currentValue: string;
  totalReturn: string; roiPct: string; status: string;
}

export function Investments() {
  const qc = useQueryClient();
  const { data: investments } = useQuery({ queryKey: ['investments'], queryFn: () => api.get<InvestmentPerf[]>('/investments') });
  const { data: types } = useQuery({
    queryKey: ['config', 'INVESTMENT_TYPE'],
    queryFn: () => api.get<{ id: string; value: string }[]>('/settings/config-options?listType=INVESTMENT_TYPE'),
  });

  const [form, setForm] = useState({ name: '', investmentType: '', dateInvested: todayIso(), initialCapital: '', currency: 'USD', riskLevel: 'Medium' });
  const create = useMutation({
    mutationFn: () => api.post('/investments', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['investments'] }); setForm({ ...form, name: '', initialCapital: '' }); },
  });

  const [markValue, setMarkValue] = useState<Record<string, string>>({});
  const markToMarket = useMutation({
    mutationFn: (id: string) => api.post(`/investments/${id}/mark-to-market`, { currentValue: markValue[id] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['investments'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Investments</h1>
        <p className="text-sm text-[var(--text-secondary)]">Capital invested, current value, and returns — never confused with expenses.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Portfolio" className="lg:col-span-2">
          <Table headers={['Name', 'Capital', 'Current value', 'Return', 'ROI', 'Update value']}>
            {investments?.map((inv) => (
              <tr key={inv.investmentId}>
                <td className="py-2 pr-4">{inv.name}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(inv.capitalInvested, inv.currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(inv.currentValue, inv.currency)}</td>
                <td className={`py-2 pr-4 tabular-nums ${parseFloat(inv.totalReturn) >= 0 ? 'text-[var(--good)]' : 'text-[var(--critical)]'}`}>{fmtMoney(inv.totalReturn, inv.currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{inv.roiPct}%</td>
                <td className="py-2 pr-4">
                  <div className="flex gap-1">
                    <Input className="w-24" type="number" step="0.01" placeholder="Value" value={markValue[inv.investmentId] ?? ''} onChange={(e) => setMarkValue({ ...markValue, [inv.investmentId]: e.target.value })} />
                    <Button variant="secondary" onClick={() => markToMarket.mutate(inv.investmentId)} disabled={!markValue[inv.investmentId]}>Set</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {investments?.length === 0 && <p className="text-sm text-[var(--muted)]">No investments tracked yet.</p>}
        </Card>

        <Card title="Add an investment">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>Type</Label>
              <Select value={form.investmentType} onChange={(e) => setForm({ ...form, investmentType: e.target.value })} required>
                <option value="">Select…</option>
                {types?.map((t) => <option key={t.id} value={t.value}>{t.value}</option>)}
              </Select>
            </div>
            <div><Label>Date invested</Label><Input type="date" value={form.dateInvested} onChange={(e) => setForm({ ...form, dateInvested: e.target.value })} required /></div>
            <div><Label>Initial capital</Label><Input type="number" step="0.01" value={form.initialCapital} onChange={(e) => setForm({ ...form, initialCapital: e.target.value })} required /></div>
            <div><Label>Risk level</Label>
              <Select value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })}>
                <option>Low</option><option>Medium</option><option>High</option>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>Add investment</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
