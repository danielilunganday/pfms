// Pure net worth aggregation math — extracted from NetWorthService so the
// "how do liquid + investments + receivables - liabilities become net
// worth, and what happens when a currency can't be converted" logic is
// directly unit-testable without a database or FX lookups.
import Decimal from 'decimal.js';
import { money, toDb, ZERO } from '../common/money';

export interface ConversionOutcome {
  source: string;
  currency: string;
  amount: string;
  converted: Decimal | null; // null = no exchange rate configured — must NOT be silently treated as 1:1
}

/** Sums the `converted` amounts from a list of conversion outcomes, and
 *  separately collects every entry that couldn't be converted (so the
 *  caller can surface them instead of quietly losing the money from the
 *  total, per spec §16/§37 — never assume 1:1). */
export function sumConvertedAmounts(outcomes: ConversionOutcome[]): {
  total: Decimal;
  unconverted: { source: string; currency: string; amount: string }[];
} {
  let total = ZERO;
  const unconverted: { source: string; currency: string; amount: string }[] = [];
  for (const o of outcomes) {
    if (o.converted === null) {
      unconverted.push({ source: o.source, currency: o.currency, amount: o.amount });
    } else {
      total = total.plus(o.converted);
    }
  }
  return { total, unconverted };
}

export interface NetWorthParts {
  liquidAssets: string | number | Decimal;
  investmentsValue: string | number | Decimal;
  receivablesValue: string | number | Decimal;
  totalLiabilities: string | number | Decimal;
}

export interface NetWorthTotals {
  totalAssets: string;
  netWorth: string;
}

/** totalAssets = liquid + investments + receivables; netWorth = assets -
 *  liabilities. Net worth is intentionally allowed to go negative — that's
 *  a true and useful signal, not an error condition to hide. */
export function computeNetWorthTotals(parts: NetWorthParts): NetWorthTotals {
  const totalAssets = money(parts.liquidAssets).plus(money(parts.investmentsValue)).plus(money(parts.receivablesValue));
  const netWorth = totalAssets.minus(money(parts.totalLiabilities));
  return { totalAssets: toDb(totalAssets), netWorth: toDb(netWorth) };
}
