import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, StatTile, Input } from '../components/ui';
import { fmtMoney, fmtDate } from '../lib/format';

interface NetWorthNow {
  currency: string; liquidAssets: string; investmentsValue: string; receivablesValue: string;
  totalAssets: string; totalLiabilities: string; netWorth: string; unconverted: { source: string; currency: string; amount: string }[];
}
interface Snapshot { date: string; netWorth: string; currency: string }

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <p className="text-xs text-[var(--muted)]">Save a few snapshots over time to see a trend line.</p>;
  const w = 560, h = 140, pad = 8;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="mt-2">
      <polyline points={coords.join(' ')} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => {
        const [x, y] = c.split(',');
        return <circle key={i} cx={x} cy={y} r={3} fill="#2a78d6" />;
      })}
    </svg>
  );
}

export function NetWorth() {
  const qc = useQueryClient();
  const { data: now } = useQuery({ queryKey: ['net-worth'], queryFn: () => api.get<NetWorthNow>('/net-worth') });
  const { data: history } = useQuery({ queryKey: ['net-worth-history'], queryFn: () => api.get<Snapshot[]>('/net-worth/history') });

  const snapshot = useMutation({
    mutationFn: () => api.post('/net-worth/snapshot'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['net-worth-history'] }); },
  });

  const [rateForm, setRateForm] = useState({ date: new Date().toISOString().slice(0, 10), fromCurrency: 'ZIG', toCurrency: 'USD', rate: '' });
  const setRate = useMutation({
    mutationFn: () => api.post('/net-worth/exchange-rates', rateForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['net-worth'] }); setRateForm({ ...rateForm, rate: '' }); },
  });

  const chartPoints = (history ?? []).slice().reverse().map((s) => parseFloat(s.netWorth));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Net worth</h1>
          <p className="text-sm text-[var(--text-secondary)]">Assets minus liabilities, consolidated to {now?.currency ?? 'USD'}.</p>
        </div>
        <Button onClick={() => snapshot.mutate()} disabled={snapshot.isPending}>{snapshot.isPending ? 'Saving…' : 'Save snapshot'}</Button>
      </div>

      {now && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Net worth" value={fmtMoney(now.netWorth, now.currency)} />
          <StatTile label="Liquid assets" value={fmtMoney(now.liquidAssets, now.currency)} />
          <StatTile label="Investments" value={fmtMoney(now.investmentsValue, now.currency)} />
          <StatTile label="Receivables (loans out)" value={fmtMoney(now.receivablesValue, now.currency)} />
          <StatTile label="Total assets" value={fmtMoney(now.totalAssets, now.currency)} />
          <StatTile label="Total liabilities" value={fmtMoney(now.totalLiabilities, now.currency)} tone="critical" />
        </div>
      )}

      {now && now.unconverted.length > 0 && (
        <Card title="Not included above — no exchange rate configured yet">
          <ul className="text-sm text-[var(--text-secondary)]">
            {now.unconverted.map((u, i) => (
              <li key={i}>{fmtMoney(u.amount, u.currency)} ({u.source})</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Net worth over time" className="lg:col-span-2">
          <Sparkline points={chartPoints} />
        </Card>

        <Card title="Set an exchange rate">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); setRate.mutate(); }}>
            <Input type="date" value={rateForm.date} onChange={(e) => setRateForm({ ...rateForm, date: e.target.value })} />
            <div className="flex gap-2">
              <Input value={rateForm.fromCurrency} onChange={(e) => setRateForm({ ...rateForm, fromCurrency: e.target.value })} placeholder="From (ZIG)" />
              <Input value={rateForm.toCurrency} onChange={(e) => setRateForm({ ...rateForm, toCurrency: e.target.value })} placeholder="To (USD)" />
            </div>
            <Input type="number" step="0.000001" value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })} placeholder="Rate" required />
            <Button type="submit" className="w-full" disabled={setRate.isPending}>Save rate</Button>
          </form>
        </Card>
      </div>

      <Card title="Snapshot history">
        <ul className="divide-y divide-[var(--border)] text-sm">
          {history?.map((s, i) => (
            <li key={i} className="flex justify-between py-1.5">
              <span className="text-[var(--text-secondary)]">{fmtDate(s.date)}</span>
              <span className="tabular-nums font-medium">{fmtMoney(s.netWorth, s.currency)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
