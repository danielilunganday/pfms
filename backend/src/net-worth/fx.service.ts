import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lte } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { exchangeRates } from '../db/schema';
import { money, ZERO } from '../common/money';

@Injectable()
export class FxService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async setRate(date: string, fromCurrency: string, toCurrency: string, rate: string, source?: string) {
    const [row] = await this.db
      .insert(exchangeRates)
      .values({ date: new Date(date), fromCurrency, toCurrency, rate, source })
      .returning();
    return row;
  }

  listRates() {
    return this.db.select().from(exchangeRates);
  }

  /** Latest known rate as of `asOf` for from→to (or the inverse of to→from if
   *  that's what was recorded). Returns null if nothing is configured yet —
   *  callers must treat that as "cannot convert", never silently assume 1:1. */
  async getRate(fromCurrency: string, toCurrency: string, asOf: Date = new Date()): Promise<ReturnType<typeof money> | null> {
    if (fromCurrency === toCurrency) return money(1);

    const direct = await this.db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrency, fromCurrency),
          eq(exchangeRates.toCurrency, toCurrency),
          lte(exchangeRates.date, asOf),
        ),
      )
      .orderBy(desc(exchangeRates.date))
      .limit(1);
    if (direct.length > 0) return money(direct[0].rate);

    const inverse = await this.db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrency, toCurrency),
          eq(exchangeRates.toCurrency, fromCurrency),
          lte(exchangeRates.date, asOf),
        ),
      )
      .orderBy(desc(exchangeRates.date))
      .limit(1);
    if (inverse.length > 0) {
      const r = money(inverse[0].rate);
      return r.gt(0) ? money(1).div(r) : null;
    }
    return null;
  }

  async convert(amount: ReturnType<typeof money>, fromCurrency: string, toCurrency: string, asOf: Date = new Date()) {
    const rate = await this.getRate(fromCurrency, toCurrency, asOf);
    if (rate === null) return { converted: null, rate: null };
    return { converted: amount.times(rate), rate };
  }
}
