import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lt } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { budgets, overallBudgets, transactions, categories } from '../db/schema';
import { money, ZERO } from '../common/money';
import { computeBudgetStatus } from './budget-math';

function periodBounds(period: string) {
  // period = "YYYY-MM"
  const [y, m] = period.split('-').map((s) => parseInt(s, 10));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

@Injectable()
export class BudgetsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async setBudget(input: {
    categoryId: string;
    period: string;
    amount: string;
    currency: string;
    warningThresholdPct?: string;
    criticalThresholdPct?: string;
  }) {
    const existing = await this.db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.categoryId, input.categoryId),
          eq(budgets.period, input.period),
          eq(budgets.currency, input.currency),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const [row] = await this.db
        .update(budgets)
        .set({
          amount: input.amount,
          warningThresholdPct: input.warningThresholdPct ?? existing[0].warningThresholdPct,
          criticalThresholdPct: input.criticalThresholdPct ?? existing[0].criticalThresholdPct,
        })
        .where(eq(budgets.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await this.db
      .insert(budgets)
      .values({
        categoryId: input.categoryId,
        period: input.period,
        amount: input.amount,
        currency: input.currency,
        ...(input.warningThresholdPct ? { warningThresholdPct: input.warningThresholdPct } : {}),
        ...(input.criticalThresholdPct ? { criticalThresholdPct: input.criticalThresholdPct } : {}),
      })
      .returning();
    return row;
  }

  /** Budget vs Actual for a given month + currency — the core of the budget engine (spec §9). */
  async budgetVsActual(period: string, currency: string) {
    const { start, end } = periodBounds(period);
    const budgetRows = await this.db
      .select({ budget: budgets, category: categories })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .where(and(eq(budgets.period, period), eq(budgets.currency, currency)));

    const results: any[] = [];
    for (const { budget, category } of budgetRows) {
      const expenseRows = await this.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.type, 'EXPENSE'),
            eq(transactions.categoryId, category.id),
            eq(transactions.currency, currency),
            gte(transactions.date, start),
            lt(transactions.date, end),
          ),
        );
      const actual = expenseRows.reduce((sum, t) => sum.plus(money(t.amount)), ZERO);
      const computed = computeBudgetStatus(budget.amount, actual, budget.warningThresholdPct, budget.criticalThresholdPct);

      results.push({
        categoryId: category.id,
        categoryName: category.name,
        isEssential: category.isEssential,
        period,
        currency,
        budget: money(budget.amount).toFixed(2),
        ...computed,
      });
    }
    return results.sort((a, b) => parseFloat(b.actual) - parseFloat(a.actual));
  }

  async listBudgets(period?: string) {
    if (period) return this.db.select().from(budgets).where(eq(budgets.period, period));
    return this.db.select().from(budgets);
  }

  // ── Overall monthly budget — catches EVERYTHING, not just categories
  // you happened to set a line for (spec gap: a one-off purchase like a
  // suit or new clothes previously wasn't guaranteed to count against
  // anything unless you'd pre-budgeted that exact category). ────────────
  async setOverallBudget(input: { period: string; currency: string; amount: string; warningThresholdPct?: string; criticalThresholdPct?: string }) {
    const existing = await this.db
      .select()
      .from(overallBudgets)
      .where(and(eq(overallBudgets.period, input.period), eq(overallBudgets.currency, input.currency)))
      .limit(1);
    if (existing.length > 0) {
      const [row] = await this.db
        .update(overallBudgets)
        .set({
          amount: input.amount,
          warningThresholdPct: input.warningThresholdPct ?? existing[0].warningThresholdPct,
          criticalThresholdPct: input.criticalThresholdPct ?? existing[0].criticalThresholdPct,
        })
        .where(eq(overallBudgets.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await this.db
      .insert(overallBudgets)
      .values({
        period: input.period,
        currency: input.currency,
        amount: input.amount,
        ...(input.warningThresholdPct ? { warningThresholdPct: input.warningThresholdPct } : {}),
        ...(input.criticalThresholdPct ? { criticalThresholdPct: input.criticalThresholdPct } : {}),
      })
      .returning();
    return row;
  }

  /** Total actual = every EXPENSE transaction in the period/currency,
   *  regardless of category — so nothing slips through uncounted. */
  async overallBudgetVsActual(period: string, currency: string) {
    const { start, end } = periodBounds(period);
    const [overall] = await this.db
      .select()
      .from(overallBudgets)
      .where(and(eq(overallBudgets.period, period), eq(overallBudgets.currency, currency)))
      .limit(1);

    const expenseRows = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'EXPENSE'),
          eq(transactions.currency, currency),
          gte(transactions.date, start),
          lt(transactions.date, end),
        ),
      );
    const actual = expenseRows.reduce((sum, t) => sum.plus(money(t.amount)), ZERO);

    if (!overall) {
      return {
        period,
        currency,
        capSet: false,
        budget: '0.00',
        actual: money(actual).toFixed(2),
        variance: '0.00',
        remaining: '0.00',
        pctUsed: '0.0',
        status: 'OK' as const,
        transactionCount: expenseRows.length,
      };
    }

    const computed = computeBudgetStatus(overall.amount, actual, overall.warningThresholdPct, overall.criticalThresholdPct);
    return {
      period,
      currency,
      capSet: true,
      budget: money(overall.amount).toFixed(2),
      ...computed,
      transactionCount: expenseRows.length,
    };
  }
}
