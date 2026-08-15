import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, StatTile, StatusBadge } from '../components/ui';
import { fmtMoney, fmtDate } from '../lib/format';

interface DashboardData {
  primaryCurrency: string;
  currentPosition: {
    cashByCurrency: Record<string, string>;
    savingsAccountByCurrency: Record<string, string>;
    netWorth: { netWorth: string; totalAssets: string; totalLiabilities: string; liquidAssets: string; investmentsValue: string; receivablesValue: string; unconverted: any[] };
    loansReceivable: { totalOutstanding: string; byCurrency: Record<string, { principal: string; outstanding: string }> };
    debtsPayableByCurrency: Record<string, string>;
  };
  currentMonth: {
    period: string; income: string; expenses: string; savings: string; investmentContributions: string;
    savingsRatePct: string; expenseRatioPct: string; netCashFlow: string;
  };
  budgetHealth: {
    overBudget: { categoryName: string; actual: string; budget: string; pctUsed: string }[];
    nearLimit: { categoryName: string; actual: string; budget: string; pctUsed: string }[];
    largestCategories: { categoryName: string; actual: string; status: string }[];
  };
  savings: {
    emergencyFund: { coverageMonths: string; targetMonths: number; onTarget: boolean; emergencyFundBalance: string; avgEssentialMonthlyExpense: string };
  };
  upcoming: {
    recurringWithin14Days: { description: string; amount: string; currency: string; nextDueDate: string; type: string }[];
  };
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  });

  if (isLoading) return <div className="text-[var(--muted)]">Loading your financial position…</div>;
  if (error || !data) return <div className="text-[var(--critical)]">Could not load the dashboard.</div>;

  const cur = data.primaryCurrency;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-[var(--text-secondary)]">Your financial position at a glance.</p>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">Current position</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile label="Net worth" value={fmtMoney(data.currentPosition.netWorth.netWorth, cur)} />
          {Object.entries(data.currentPosition.cashByCurrency).map(([c, v]) => (
            <StatTile key={c} label={`Cash (${c})`} value={fmtMoney(v, c)} />
          ))}
          {Object.entries(data.currentPosition.savingsAccountByCurrency).map(([c, v]) => (
            <StatTile key={c} label={`Savings (${c})`} value={fmtMoney(v, c)} />
          ))}
          <StatTile label="Investments" value={fmtMoney(data.currentPosition.netWorth.investmentsValue, cur)} />
          <StatTile label="Loans receivable" value={fmtMoney(data.currentPosition.loansReceivable.totalOutstanding, cur)} />
          {Object.entries(data.currentPosition.debtsPayableByCurrency).map(([c, v]) => (
            <StatTile key={c} label={`I owe (${c})`} value={fmtMoney(v, c)} tone="critical" />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">This month ({data.currentMonth.period})</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Income" value={fmtMoney(data.currentMonth.income, cur)} tone="good" />
          <StatTile label="Expenses" value={fmtMoney(data.currentMonth.expenses, cur)} />
          <StatTile label="Net cash flow" value={fmtMoney(data.currentMonth.netCashFlow, cur)} tone={parseFloat(data.currentMonth.netCashFlow) >= 0 ? 'good' : 'critical'} />
          <StatTile label="Savings rate" value={`${data.currentMonth.savingsRatePct}%`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Budget health">
          {data.budgetHealth.overBudget.length === 0 && data.budgetHealth.nearLimit.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Nothing over budget this month.</p>
          ) : (
            <ul className="space-y-2">
              {data.budgetHealth.overBudget.map((b) => (
                <li key={b.categoryName} className="flex items-center justify-between text-sm">
                  <span>{b.categoryName}</span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status="OVER" />
                    <span className="tabular-nums text-[var(--critical)]">{fmtMoney(b.actual, cur)} / {fmtMoney(b.budget, cur)}</span>
                  </span>
                </li>
              ))}
              {data.budgetHealth.nearLimit.map((b) => (
                <li key={b.categoryName} className="flex items-center justify-between text-sm">
                  <span>{b.categoryName}</span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status="WARNING" />
                    <span className="tabular-nums">{fmtMoney(b.actual, cur)} / {fmtMoney(b.budget, cur)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Emergency fund">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="tabular-nums text-2xl font-semibold">{data.savings.emergencyFund.coverageMonths}</span>
            <span className="text-sm text-[var(--text-secondary)]">of {data.savings.emergencyFund.targetMonths} target months covered</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div
              className={`h-full ${data.savings.emergencyFund.onTarget ? 'bg-[var(--good)]' : 'bg-[var(--brand)]'}`}
              style={{
                width: `${Math.min(
                  100,
                  (parseFloat(data.savings.emergencyFund.coverageMonths) / Math.max(1, data.savings.emergencyFund.targetMonths)) * 100,
                )}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Balance {fmtMoney(data.savings.emergencyFund.emergencyFundBalance, cur)} vs. average essential spend {fmtMoney(data.savings.emergencyFund.avgEssentialMonthlyExpense, cur)}/mo
          </p>
        </Card>
      </div>

      <Card title="Upcoming (next 14 days)">
        {data.upcoming.recurringWithin14Days.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing due in the next two weeks.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {data.upcoming.recurringWithin14Days.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span>{r.description}</span>
                <span className="flex items-center gap-3 text-[var(--text-secondary)]">
                  <span>{fmtDate(r.nextDueDate)}</span>
                  <span className="tabular-nums">{fmtMoney(r.amount, r.currency)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
