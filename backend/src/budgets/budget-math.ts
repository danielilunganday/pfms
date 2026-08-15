// Pure, dependency-free budget math — kept separate from BudgetsService so
// the status/variance logic (the part users actually rely on to know
// whether they're "on track") is directly unit-testable without a database.
import Decimal from 'decimal.js';
import { money, toDb, ZERO } from '../common/money';

export type BudgetStatus = 'OK' | 'WARNING' | 'OVER';

export interface BudgetStatusResult {
  actual: string;
  variance: string;
  remaining: string;
  pctUsed: string;
  status: BudgetStatus;
}

/**
 * Given a budget cap and what's actually been spent, returns variance,
 * remaining headroom, % used, and a traffic-light status. A budget of 0
 * is treated as "no cap set" for the purpose of the percentage (avoids a
 * divide-by-zero) but still flags OVER the moment anything is spent against
 * it, since a $0 cap with any spend is unambiguously over.
 */
export function computeBudgetStatus(
  budgetAmount: string | number | Decimal,
  actualAmount: string | number | Decimal,
  warningThresholdPct: string | number | Decimal,
  criticalThresholdPct: string | number | Decimal,
): BudgetStatusResult {
  const budget = money(budgetAmount);
  const actual = money(actualAmount);
  const warn = money(warningThresholdPct);
  const crit = money(criticalThresholdPct);

  const variance = budget.minus(actual);
  const remaining = variance.gt(0) ? variance : ZERO;
  const pctUsed = budget.gt(0) ? actual.div(budget).times(100) : actual.gt(0) ? new Decimal(100) : ZERO;

  let status: BudgetStatus;
  if (pctUsed.gte(crit)) status = 'OVER';
  else if (pctUsed.gte(warn)) status = 'WARNING';
  else status = 'OK';

  return {
    actual: toDb(actual),
    variance: toDb(variance),
    remaining: toDb(remaining),
    pctUsed: pctUsed.toFixed(1),
    status,
  };
}
