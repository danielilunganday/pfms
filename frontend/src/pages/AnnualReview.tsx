import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, StatTile, Table } from '../components/ui';
import { fmtMoney } from '../lib/format';

interface AnnualSummary { year: number; currency: string; income: string; expenses: string; savings: string; savingsRatePct: string; netCashFlow: string }
interface MonthlyRow { period: string; income: string; expenses: string; essentialExpenses: string; discretionaryExpenses: string; netCashFlow: string }

export function AnnualReview() {
  const [year, setYear] = useState(new Date().getFullYear());
  const currency = 'USD';

  const { data: summary } = useQuery({
    queryKey: ['annual-summary', year],
    queryFn: () => api.get<AnnualSummary>(`/analytics/annual-summary?year=${year}&currency=${currency}`),
  });
  // monthly-trend always returns a trailing window ending THIS month — for a
  // past year, request enough months back to actually include it, then
  // filter down to just that year below.
  const now = new Date();
  const monthsBack = Math.max(12, (now.getFullYear() - year) * 12 + (now.getMonth() + 1));
  const { data: monthly } = useQuery({
    queryKey: ['annual-monthly', year],
    queryFn: () => api.get<MonthlyRow[]>(`/analytics/monthly-trend?currency=${currency}&months=${monthsBack}`),
  });

  const yearRows = (monthly ?? []).filter((m) => m.period.startsWith(String(year)));
  const maxExpense = Math.max(1, ...yearRows.map((r) => parseFloat(r.expenses)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Annual review</h1>
          <p className="text-sm text-[var(--text-secondary)]">Year-end summary — income, expenses, savings rate, and the month-by-month shape of your year.</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm"
        >
          {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Income" value={fmtMoney(summary.income, currency)} tone="good" />
          <StatTile label="Expenses" value={fmtMoney(summary.expenses, currency)} />
          <StatTile label="Savings" value={fmtMoney(summary.savings, currency)} />
          <StatTile label="Savings rate" value={`${summary.savingsRatePct}%`} />
        </div>
      )}

      <Card title={`Month by month — ${year}`}>
        {yearRows.length === 0 && <p className="text-sm text-[var(--muted)]">No transactions recorded for {year} yet — data only appears for months you've entered.</p>}
        <div className="space-y-2">
          {yearRows.map((r) => (
            <div key={r.period}>
              <div className="mb-0.5 flex justify-between text-sm">
                <span>{r.period}</span>
                <span className="tabular-nums">{fmtMoney(r.expenses, currency)} spent · {fmtMoney(r.income, currency)} income</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                <div className="h-full bg-[var(--brand)]" style={{ width: `${(parseFloat(r.expenses) / maxExpense) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {yearRows.length > 0 && (
        <Card title="Monthly detail">
          <Table headers={['Month', 'Income', 'Expenses', 'Essential', 'Discretionary', 'Net cash flow']}>
            {yearRows.map((r) => (
              <tr key={r.period}>
                <td className="py-2 pr-4">{r.period}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(r.income, currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(r.expenses, currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(r.essentialExpenses, currency)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtMoney(r.discretionaryExpenses, currency)}</td>
                <td className={`py-2 pr-4 tabular-nums font-medium ${parseFloat(r.netCashFlow) < 0 ? 'text-[var(--critical)]' : 'text-[var(--good)]'}`}>
                  {fmtMoney(r.netCashFlow, currency)}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
