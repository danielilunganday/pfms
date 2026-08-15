// Precise decimal money arithmetic — never use raw JS floats for currency math.
// Postgres `numeric` columns come back from `pg` as strings; always route them
// through this helper before doing arithmetic.
import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

export function money(value: string | number | Decimal | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  return new Decimal(value);
}

/** Format a Decimal to a fixed 2-decimal string suitable for storage in a numeric(18,2) column. */
export function toDb(value: Decimal): string {
  return value.toFixed(2);
}

/** Format for display, e.g. "1,234.56" */
export function toDisplay(value: Decimal | string | number): string {
  const d = money(value as any);
  return d.toNumber().toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const ZERO = new Decimal(0);
