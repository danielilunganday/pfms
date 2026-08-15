import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { savingsGoals, goalContributions } from '../db/schema';
import { money, toDb, ZERO } from '../common/money';
import { computeGoalProjection } from './goal-projection';

@Injectable()
export class SavingsGoalsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: {
    name: string;
    goalType?: string;
    targetAmount: string;
    currency: string;
    targetDate?: string;
    monthlyTarget?: string;
  }) {
    const [row] = await this.db
      .insert(savingsGoals)
      .values({
        ...input,
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
      })
      .returning();
    return row;
  }

  async contribute(goalId: string, amount: string, date: string, transactionId?: string) {
    const [row] = await this.db
      .insert(goalContributions)
      .values({ goalId, amount, date: new Date(date), transactionId })
      .returning();

    const progress = await this.progress(goalId);
    if (progress.currentAmount.gte(progress.targetAmount) ) {
      await this.db.update(savingsGoals).set({ status: 'COMPLETED' }).where(eq(savingsGoals.id, goalId));
    }
    return row;
  }

  async list() {
    const goals = await this.db.select().from(savingsGoals);
    return Promise.all(goals.map((g) => this.progress(g.id)));
  }

  /**
   * Progress %, remaining amount, and whether the current contribution rate
   * will hit the target date (spec §12) — computed transparently from
   * goal_contributions, never a manually-entered number.
   */
  async progress(goalId: string) {
    const [goal] = await this.db.select().from(savingsGoals).where(eq(savingsGoals.id, goalId)).limit(1);
    if (!goal) throw new NotFoundException('Savings goal not found');

    const contributions = await this.db
      .select()
      .from(goalContributions)
      .where(eq(goalContributions.goalId, goalId));

    const currentAmount = contributions.reduce((sum, c) => sum.plus(money(c.amount)), ZERO);
    const targetAmount = money(goal.targetAmount);

    const projection = computeGoalProjection({
      targetAmount: goal.targetAmount,
      currentAmount: toDb(currentAmount),
      contributionDates: contributions.map((c) => c.date),
      targetDate: goal.targetDate,
    });

    return {
      goalId: goal.id,
      name: goal.name,
      goalType: goal.goalType,
      currency: goal.currency,
      targetAmount,
      currentAmount,
      remaining: projection.remaining,
      progressPct: projection.progressPct,
      targetDate: goal.targetDate,
      monthlyTarget: goal.monthlyTarget,
      projectedCompletionDate: projection.projectedCompletionDate,
      onTrack: projection.onTrack,
      status: goal.status,
      // Serialized versions for API responses
      targetAmountStr: toDb(targetAmount),
      currentAmountStr: toDb(currentAmount),
      remainingStr: projection.remainingStr,
    };
  }
}
