import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, StatTile, Table } from '../components/ui';
import { fmtMoney, currentPeriod } from '../lib/format';

interface MonthlySummary {
  period: string; income: string; expenses: string; savings: string; investmentContributions: string;
  savingsRatePct: string; expenseRatioPct: string; investmentRatePct: string; netCashFlow: string;
}
interface CategoryLine { categoryName: string; amount: string }
interface Forecast { label: string; projectedAnnualIncome: string; projectedAnnualExpenses: string; projectedAnnualSavings: string; basedOnTrailingMonths: number }
interface TrendRow { period: string; income: string; expenses: string; essentialExpenses: string; discretionaryExpenses: string; netCashFlow: string }
interface Insights { messages: string[]; trendingUpCategories: { categoryName: string; currentAmount: string; priorAvg: string; pctChange: string }[] }

function TrendChart({ rows }: { rows: TrendRow[] }) {
  if (rows.length < 2) return <p className="text-sm text-[var(--muted)]">Record a couple more months of transactions to see a trend line.</p>;
  const w = 640, h = 180, pad = 24;
  const expenses = rows.map((r) => parseFloat(r.expenses));
  const income = rows.map((r) => parseFloat(r.income));
  const max = Math.max(1, ...expenses, ...income);
  const stepX = (w - pad * 2) / (rows.length - 1);
  const toPoints = (values: number[]) =>
    values.map((v, i) => `${pad + i * stepX},${h - pad - (v / max) * (h - pad * 2)}`).join(' ');

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
        <polyline points={toPoints(income)} fill="none" stroke="var(--good)" strokeWidth={2} />
        <polyline points={toPoints(expenses)} fill="none" stroke="var(--critical)" strokeWidth={2} />
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
        <div className="flex gap-4">
          <span><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: 'var(--good)' }} /> Income</span>
          <span><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: 'var(--critical)' }} /> Expenses</span>
        </div>
        <div>{rows[0].period} → {rows[rows.length - 1].period}</div>
      </div>
    </div>
  );
}

export function Analytics() {
  const [period, setPeriod] = useState(currentPeriod());
  const currency = 'USD';

  const { data: monthly } = useQuery({ queryKey: ['monthly-summary', period], queryFn: () => api.get<MonthlySummary>(`/analytics/monthly-summary?period=${period}&currency=${currency}`) });
  const { data: breakdown } = useQuery({ queryKey: ['category-breakdown', period], queryFn: () => api.get<CategoryLine[]>(`/analytics/category-breakdown?period=${period}&currency=${currency}&type=EXPENSE`) });
  const { data: forecast } = useQuery({ queryKey: ['forecast'], queryFn: () => api.get<Forecast>(`/analytics/forecast?currency=${currency}`) });
  const { data: trend } = useQuery({ queryKey: ['monthly-trend', currency], queryFn: () => api.get<TrendRow[]>(`/analytics/monthly-trend?currency=${currency}&months=12`) });
  const { data: insights } = useQuery({ queryKey: ['insights', currency], queryFn: () => api.get<Insights>(`/analytics/insights?currency=${currency}&months=6`) });

  const maxAmount = Math.max(1, ...(breakdown ?? []).map((b) => parseFloat(b.amount)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-[var(--text-secondary)]">Monthly review, spending patterns, and forecasts.</p>
        </div>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm" />
      </div>

      {monthly && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Income" value={fmtMoney(monthly.income, currency)} tone="good" />
          <StatTile label="Expenses" value={fmtMoney(monthly.expenses, currency)} />
          <StatTile label="Savings rate" value={`${monthly.savingsRatePct}%`} />
          <StatTile label="Expense ratio" value={`${monthly.expenseRatioPct}%`} />
        </div>
      )}

      {insights && insights.messages.length > 0 && (
        <Card title="What's changed">
          <ul className="space-y-2 text-sm">
            {insights.messages.map((m, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[var(--brand)]">•</span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {trend && (
        <Card title="Income vs expenses — last 12 months">
          <TrendChart rows={trend} />
        </Card>
      )}

      <Card title={`Largest spending categories — ${period}`}>
        {breakdown?.length === 0 && <p className="text-sm text-[var(--muted)]">No expenses recorded this month.</p>}
        <div className="space-y-2">
          {breakdown?.slice(0, 10).map((b) => (
            <div key={b.categoryName}>
              <div className="mb-0.5 flex justify-between text-sm">
                <span>{b.categoryName}</span>
                <span className="tabular-nums">{fmtMoney(b.amount, currency)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                <div className="h-full bg-[var(--brand)]" style={{ width: `${(parseFloat(b.amount) / maxAmount) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {forecast && (
        <Card title="Forecast (projection — not a guarantee)">
          <p className="mb-3 text-xs text-[var(--muted)]">{forecast.label}, based on your trailing {forecast.basedOnTrailingMonths} months</p>
          <Table headers={['', 'Projected annual']}>
            <tr><td className="py-1 pr-4">Income</td><td className="py-1 tabular-nums">{fmtMoney(forecast.projectedAnnualIncome, currency)}</td></tr>
            <tr><td className="py-1 pr-4">Expenses</td><td className="py-1 tabular-nums">{fmtMoney(forecast.projectedAnnualExpenses, currency)}</td></tr>
            <tr><td className="py-1 pr-4">Savings</td><td className="py-1 tabular-nums">{fmtMoney(forecast.projectedAnnualSavings, currency)}</td></tr>
          </Table>
        </Card>
      )}
    </div>
  );
}
