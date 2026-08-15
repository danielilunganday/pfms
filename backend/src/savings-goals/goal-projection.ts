// Pure savings-goal projection math — extracted from SavingsGoalsService so
// the "will I hit my target date at this rate" logic is unit-testable
// without a database.
import dayjs from 'dayjs';
import { money, toDb, ZERO, Money } from '../common/money';

export interface GoalProjection {
  remaining: Money;
  remainingStr: string;
  progressPct: string;
  projectedCompletionDate: string | null;
  onTrack: boolean | null;
}

export function computeGoalProjection(params: {
  targetAmount: string | number;
  currentAmount: string | number;
  contributionDates: (Date | string)[]; // one entry per contribution, same length/order as amounts summed into currentAmount
  targetDate?: Date | string | null;
  now?: Date | string;
}): GoalProjection {
  const targetAmount = money(params.targetAmount);
  const currentAmount = money(params.currentAmount);
  const remaining = targetAmount.minus(currentAmount);
  const progressPct = targetAmount.gt(0) ? currentAmount.div(targetAmount).times(100) : ZERO;
  const now = dayjs(params.now ?? new Date());

  let projectedCompletionDate: string | null = null;
  let onTrack: boolean | null = null;

  if (params.contributionDates.length > 0 && remaining.gt(0)) {
    const dates = params.contributionDates.map((d) => dayjs(d));
    const earliest = dates.reduce((a, b) => (a.isBefore(b) ? a : b));
    const monthsElapsed = Math.max(1, now.diff(earliest, 'month', true));
    const avgMonthly = currentAmount.div(monthsElapsed);
    if (avgMonthly.gt(0)) {
      const monthsToGo = remaining.div(avgMonthly).toNumber();
      projectedCompletionDate = now.add(monthsToGo, 'month').format('YYYY-MM-DD');
      if (params.targetDate) {
        onTrack = !dayjs(projectedCompletionDate).isAfter(dayjs(params.targetDate));
      }
    }
  }

  return {
    remaining: remaining.gt(0) ? remaining : ZERO,
    remainingStr: toDb(remaining.gt(0) ? remaining : ZERO),
    progressPct: progressPct.toFixed(1),
    projectedCompletionDate,
    onTrack,
  };
}
