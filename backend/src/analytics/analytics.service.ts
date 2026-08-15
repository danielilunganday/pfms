import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lt } from 'drizzle-orm';
import dayjs from 'dayjs';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { transactions, categories, goalContributions, investmentTransactions, savingsGoals } from '../db/schema';
import { money, toDb, ZERO } from '../common/money';
import { SettingsService } from '../settings/settings.service';

function monthBounds(period: string) {
  const [y, m] = period.split('-').map((s) => parseInt(s, 10));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function yearBounds(year: number) {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly settings: SettingsService,
  ) {}

  private async sumTxns(type: 'INCOME' | 'EXPENSE', currency: string, start: Date, end: Date, essentialOnly?: boolean) {
    const conditions = [
      eq(transactions.type, type),
      eq(transactions.currency, currency),
      gte(transactions.date, start),
      lt(transactions.date, end),
    ];
    if (type === 'INCOME') conditions.push(eq(transactions.incomeStatus, 'RECEIVED'));
    if (essentialOnly !== undefined) conditions.push(eq(transactions.isEssential, essentialOnly));
    const rows = await this.db.select().from(transactions).where(and(...conditions));
    return rows.reduce((s, t) => s.plus(money(t.amount)), ZERO);
  }

  /** Monthly Review core numbers (spec §18): income, expenses, savings,
   *  investments, savings rate, expense ratio, investment rate. */
  async monthlySummary(period: string, currency: string) {
    const { start, end } = monthBounds(period);
    const income = await this.sumTxns('INCOME', currency, start, end);
    const expenses = await this.sumTxns('EXPENSE', currency, start, end);
    const essentialExpenses = await this.sumTxns('EXPENSE', currency, start, end, true);
    const discretionaryExpenses = expenses.minus(essentialExpenses);

    const contributions = await this.db
      .select()
      .from(goalContributions)
      .where(and(gte(goalContributions.date, start), lt(goalContributions.date, end)));
    const savings = contributions.reduce((s, c) => s.plus(money(c.amount)), ZERO);

    const investTxns = await this.db
      .select()
      .from(investmentTransactions)
      .where(
        and(
          eq(investmentTransactions.type, 'CONTRIBUTION'),
          eq(investmentTransactions.currency, currency),
          gte(investmentTransactions.date, start),
          lt(investmentTransactions.date, end),
        ),
      );
    const investmentContributions = investTxns.reduce((s, t) => s.plus(money(t.amount)), ZERO);

    const savingsRate = income.gt(0) ? savings.div(income).times(100) : ZERO;
    const expenseRatio = income.gt(0) ? expenses.div(income).times(100) : ZERO;
    const investmentRate = income.gt(0) ? investmentContributions.div(income).times(100) : ZERO;

    return {
      period,
      currency,
      income: toDb(income),
      expenses: toDb(expenses),
      essentialExpenses: toDb(essentialExpenses),
      discretionaryExpenses: toDb(discretionaryExpenses),
      savings: toDb(savings),
      investmentContributions: toDb(investmentContributions),
      savingsRatePct: savingsRate.toFixed(1),
      expenseRatioPct: expenseRatio.toFixed(1),
      investmentRatePct: investmentRate.toFixed(1),
      netCashFlow: toDb(income.minus(expenses)),
    };
  }

  async annualSummary(year: number, currency: string) {
    const { start, end } = yearBounds(year);
    const income = await this.sumTxns('INCOME', currency, start, end);
    const expenses = await this.sumTxns('EXPENSE', currency, start, end);
    const contributions = await this.db
      .select()
      .from(goalContributions)
      .where(and(gte(goalContributions.date, start), lt(goalContributions.date, end)));
    const savings = contributions.reduce((s, c) => s.plus(money(c.amount)), ZERO);

    return {
      year,
      currency,
      income: toDb(income),
      expenses: toDb(expenses),
      savings: toDb(savings),
      savingsRatePct: income.gt(0) ? savings.div(income).times(100).toFixed(1) : '0.0',
      netCashFlow: toDb(income.minus(expenses)),
    };
  }

  /** Category spend for a period, sorted largest first — feeds "largest
   *  spending categories" on the dashboard and monthly review. */
  async categoryBreakdown(period: string, currency: string, type: 'INCOME' | 'EXPENSE' = 'EXPENSE') {
    const { start, end } = monthBounds(period);
    const rows = await this.db
      .select({ txn: transactions, category: categories })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.type, type),
          eq(transactions.currency, currency),
          gte(transactions.date, start),
          lt(transactions.date, end),
        ),
      );
    const totals = new Map<string, ReturnType<typeof money>>();
    for (const { txn, category } of rows) {
      const name = category?.name ?? 'Uncategorized';
      totals.set(name, (totals.get(name) ?? ZERO).plus(money(txn.amount)));
    }
    return Array.from(totals.entries())
      .map(([categoryName, amount]) => ({ categoryName, amount: toDb(amount) }))
      .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
  }

  /** Emergency Fund Coverage (spec §22) = emergency fund balance / average
   *  essential monthly expense over the trailing N months. Target months is
   *  configurable via the "emergency_fund_target_months" system setting. */
  async emergencyFundCoverage(currency: string, trailingMonths = 3) {
    const now = dayjs();
    let totalEssential = ZERO;
    for (let i = 1; i <= trailingMonths; i++) {
      const period = now.subtract(i, 'month').format('YYYY-MM');
      const { start, end } = monthBounds(period);
      totalEssential = totalEssential.plus(await this.sumTxns('EXPENSE', currency, start, end, true));
    }
    const avgEssentialMonthly = totalEssential.div(trailingMonths);

    const goals = await this.db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.goalType, 'EMERGENCY_FUND'));
    let emergencyFundBalance = ZERO;
    for (const g of goals) {
      const contributions = await this.db
        .select()
        .from(goalContributions)
        .where(eq(goalContributions.goalId, g.id));
      emergencyFundBalance = emergencyFundBalance.plus(
        contributions.reduce((s, c) => s.plus(money(c.amount)), ZERO),
      );
    }

    const targetMonths = await this.settings.getNumber('emergency_fund_target_months');
    const coverageMonths = avgEssentialMonthly.gt(0)
      ? emergencyFundBalance.div(avgEssentialMonthly)
      : ZERO;

    return {
      currency,
      avgEssentialMonthlyExpense: toDb(avgEssentialMonthly),
      emergencyFundBalance: toDb(emergencyFundBalance),
      coverageMonths: coverageMonths.toFixed(1),
      targetMonths,
      onTarget: coverageMonths.gte(targetMonths),
    };
  }

  /**
   * Month-by-month totals over a trailing window — the data behind "which
   * month did I spend more, which did I spend less" (spec gap: previously
   * only a single month or single year could be viewed at once, never a
   * trend across many months side by side).
   */
  async monthlyTrend(currency: string, months = 12) {
    const now = dayjs();
    const periods: string[] = [];
    for (let i = months - 1; i >= 0; i--) periods.push(now.subtract(i, 'month').format('YYYY-MM'));

    const rows: {
      period: string;
      income: string;
      expenses: string;
      essentialExpenses: string;
      discretionaryExpenses: string;
      netCashFlow: string;
    }[] = [];
    for (const period of periods) {
      const { start, end } = monthBounds(period);
      const income = await this.sumTxns('INCOME', currency, start, end);
      const expenses = await this.sumTxns('EXPENSE', currency, start, end);
      const essentialExpenses = await this.sumTxns('EXPENSE', currency, start, end, true);
      const discretionaryExpenses = expenses.minus(essentialExpenses);
      rows.push({
        period,
        income: toDb(income),
        expenses: toDb(expenses),
        essentialExpenses: toDb(essentialExpenses),
        discretionaryExpenses: toDb(discretionaryExpenses),
        netCashFlow: toDb(income.minus(expenses)),
      });
    }
    return rows;
  }

  /** Per-category monthly totals over the same trailing window, so a chart
   *  or table can show "Clothing" or "Groceries" month over month, not just
   *  the current month's snapshot. */
  async categoryMonthlyTrend(currency: string, months = 12, type: 'INCOME' | 'EXPENSE' = 'EXPENSE') {
    const now = dayjs();
    const periods: string[] = [];
    for (let i = months - 1; i >= 0; i--) periods.push(now.subtract(i, 'month').format('YYYY-MM'));

    const byPeriod: Record<string, { categoryName: string; amount: string }[]> = {};
    const categoryTotals = new Map<string, number>();
    for (const period of periods) {
      const breakdown = await this.categoryBreakdown(period, currency, type);
      byPeriod[period] = breakdown;
      for (const b of breakdown) categoryTotals.set(b.categoryName, (categoryTotals.get(b.categoryName) ?? 0) + parseFloat(b.amount));
    }

    const topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);

    const series = topCategories.map((categoryName) => ({
      categoryName,
      monthly: periods.map((period) => ({
        period,
        amount: byPeriod[period].find((b) => b.categoryName === categoryName)?.amount ?? '0.00',
      })),
    }));

    return { periods, categories: series };
  }

  /**
   * Plain-language, fully-derived spending insights — "which month did you
   * spend more, which did you spend less, what's crept up" (spec gap: no
   * insight/pattern surfacing existed before, only raw numbers). Every
   * statement here is computed directly from the same monthlyTrend /
   * categoryMonthlyTrend figures shown elsewhere — nothing hidden or
   * modeled, just arithmetic over your own transaction history.
   */
  async insights(currency: string, months = 6) {
    const trend = await this.monthlyTrend(currency, months);
    const catTrend = await this.categoryMonthlyTrend(currency, months);
    const messages: string[] = [];

    const withSpend = trend.filter((t) => parseFloat(t.expenses) > 0);
    if (withSpend.length >= 2) {
      const highest = withSpend.reduce((a, b) => (parseFloat(b.expenses) > parseFloat(a.expenses) ? b : a));
      const lowest = withSpend.reduce((a, b) => (parseFloat(b.expenses) < parseFloat(a.expenses) ? b : a));
      messages.push(`Your highest-spending month was ${highest.period}, at ${currency} ${parseFloat(highest.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}.`);
      messages.push(`Your lowest-spending month was ${lowest.period}, at ${currency} ${parseFloat(lowest.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}.`);
    }

    if (trend.length >= 2) {
      const thisMonth = trend[trend.length - 1];
      const lastMonth = trend[trend.length - 2];
      const lastExp = parseFloat(lastMonth.expenses);
      const thisExp = parseFloat(thisMonth.expenses);
      if (lastExp > 0) {
        const pctChange = ((thisExp - lastExp) / lastExp) * 100;
        const direction = pctChange > 0 ? 'up' : pctChange < 0 ? 'down' : 'flat';
        if (Math.abs(pctChange) >= 1) {
          messages.push(`Spending this month (${thisMonth.period}) is ${direction} ${Math.abs(pctChange).toFixed(0)}% versus last month (${lastMonth.period}).`);
        }
      }
    }

    // Categories trending up: current month vs the average of the prior
    // (up to 3) months, for categories that actually had prior spend.
    const trendingUp: { categoryName: string; currentAmount: string; priorAvg: string; pctChange: string }[] = [];
    for (const c of catTrend.categories) {
      if (c.monthly.length < 2) continue;
      const current = c.monthly[c.monthly.length - 1];
      const priorWindow = c.monthly.slice(Math.max(0, c.monthly.length - 4), c.monthly.length - 1);
      const priorAvg = priorWindow.reduce((s, m) => s + parseFloat(m.amount), 0) / Math.max(1, priorWindow.length);
      const currentAmt = parseFloat(current.amount);
      if (priorAvg > 0 && currentAmt > priorAvg * 1.2) {
        const pctChange = ((currentAmt - priorAvg) / priorAvg) * 100;
        trendingUp.push({ categoryName: c.categoryName, currentAmount: current.amount, priorAvg: priorAvg.toFixed(2), pctChange: pctChange.toFixed(0) });
        messages.push(`"${c.categoryName}" spending is up ${pctChange.toFixed(0)}% this month versus your recent average (${currency} ${currentAmt.toFixed(2)} vs ~${currency} ${priorAvg.toFixed(2)}) — worth a look if it's discretionary.`);
      }
    }

    const thisMonthDiscretionary = trend.length > 0 ? parseFloat(trend[trend.length - 1].discretionaryExpenses) : 0;
    const thisMonthIncome = trend.length > 0 ? parseFloat(trend[trend.length - 1].income) : 0;
    if (thisMonthIncome > 0) {
      const discretionaryPct = (thisMonthDiscretionary / thisMonthIncome) * 100;
      messages.push(`Discretionary (non-essential) spending is ${discretionaryPct.toFixed(0)}% of this month's income — essentials are tracked separately via each category's "essential" flag.`);
    }

    if (messages.length === 0) {
      messages.push('Not enough transaction history yet to surface spending patterns — record a few months of transactions and check back here.');
    }

    return { currency, monthsAnalyzed: months, messages, trendingUpCategories: trendingUp };
  }

  /**
   * Simple trailing-average forecast — ALWAYS clearly labeled a projection,
   * never presented as a guaranteed result (spec §21).
   */
  async forecastAnnual(currency: string, trailingMonths = 3) {
    const now = dayjs();
    let income = ZERO;
    let expenses = ZERO;
    for (let i = 1; i <= trailingMonths; i++) {
      const period = now.subtract(i, 'month').format('YYYY-MM');
      const { start, end } = monthBounds(period);
      income = income.plus(await this.sumTxns('INCOME', currency, start, end));
      expenses = expenses.plus(await this.sumTxns('EXPENSE', currency, start, end));
    }
    const avgMonthlyIncome = income.div(trailingMonths);
    const avgMonthlyExpense = expenses.div(trailingMonths);

    return {
      label: 'PROJECTION — based on your trailing average, not a guarantee',
      currency,
      basedOnTrailingMonths: trailingMonths,
      projectedAnnualIncome: toDb(avgMonthlyIncome.times(12)),
      projectedAnnualExpenses: toDb(avgMonthlyExpense.times(12)),
      projectedAnnualSavings: toDb(avgMonthlyIncome.minus(avgMonthlyExpense).times(12)),
    };
  }
}
