import { Inject, Injectable } from '@nestjs/common';
import { eq, lte } from 'drizzle-orm';
import dayjs from 'dayjs';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { recurringTransactions, transactions } from '../db/schema';

function advance(date: Date, frequency: string): Date {
  const d = dayjs(date);
  switch (frequency.toUpperCase()) {
    case 'DAILY':
      return d.add(1, 'day').toDate();
    case 'WEEKLY':
      return d.add(1, 'week').toDate();
    case 'FORTNIGHTLY':
      return d.add(2, 'week').toDate();
    case 'MONTHLY':
      return d.add(1, 'month').toDate();
    case 'QUARTERLY':
      return d.add(3, 'month').toDate();
    case 'ANNUALLY':
      return d.add(1, 'year').toDate();
    default:
      return d.add(1, 'month').toDate();
  }
}

@Injectable()
export class RecurringService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: {
    description: string;
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
    categoryId?: string;
    amount: string;
    currency: string;
    accountId: string;
    frequency: string;
    startDate: string;
    endDate?: string;
  }) {
    const [row] = await this.db
      .insert(recurringTransactions)
      .values({
        ...input,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        nextDueDate: new Date(input.startDate),
      })
      .returning();
    return row;
  }

  list(activeOnly = false) {
    if (activeOnly) return this.db.select().from(recurringTransactions).where(eq(recurringTransactions.active, true));
    return this.db.select().from(recurringTransactions);
  }

  /** Upcoming obligations for the dashboard — does NOT create a transaction,
   *  since expected and actual must stay distinguishable (spec §11). */
  async upcoming(withinDays = 14) {
    const cutoff = dayjs().add(withinDays, 'day').toDate();
    return this.db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.active, true))
      .then((rows) => rows.filter((r) => r.nextDueDate <= cutoff));
  }

  /**
   * Materializes any recurring items whose nextDueDate has arrived into a real
   * transaction, then advances nextDueDate. Intended to run daily via the
   * scheduler AND be callable on demand. A recurring item never auto-marks
   * itself "done" just because it's recurring — this explicit materialization
   * step is what keeps expected vs. actual transactions distinct.
   */
  async generateDue(asOf: Date = new Date()) {
    const due = await this.db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.active, true))
      .then((rows) => rows.filter((r) => r.nextDueDate <= asOf));

    const created: any[] = [];
    for (const r of due) {
      // Catch up on EVERY missed period, not just the earliest one — otherwise
      // a recurring item that's been due for months (server downtime, or a
      // backfilled start date) would silently under-report expected spend.
      let cursor = r.nextDueDate;
      while (cursor <= asOf && !(r.endDate && cursor > r.endDate)) {
        const [txn] = await this.db
          .insert(transactions)
          .values({
            type: r.type,
            date: cursor,
            accountId: r.accountId,
            categoryId: r.categoryId,
            currency: r.currency,
            amount: r.amount,
            description: r.description,
            isRecurring: true,
            recurringId: r.id,
            incomeStatus: r.type === 'INCOME' ? 'RECEIVED' : undefined,
          })
          .returning();
        created.push(txn);
        cursor = advance(cursor, r.frequency);
      }
      await this.db
        .update(recurringTransactions)
        .set({ nextDueDate: cursor })
        .where(eq(recurringTransactions.id, r.id));
    }
    return { generated: created.length, transactions: created };
  }

  async deactivate(id: string) {
    const [row] = await this.db
      .update(recurringTransactions)
      .set({ active: false })
      .where(eq(recurringTransactions.id, id))
      .returning();
    return row;
  }
}
