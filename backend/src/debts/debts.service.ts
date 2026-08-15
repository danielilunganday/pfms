import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { debtsPayable } from '../db/schema';
import { money, toDb, ZERO } from '../common/money';

@Injectable()
export class DebtsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: {
    creditorName: string;
    date: string;
    originalAmount: string;
    currency: string;
    purpose?: string;
    dueDate?: string;
  }) {
    const [row] = await this.db
      .insert(debtsPayable)
      .values({
        ...input,
        date: new Date(input.date),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      })
      .returning();
    return row;
  }

  list() {
    return this.db.select().from(debtsPayable);
  }

  async recordPayment(id: string, amount: string) {
    const [existing] = await this.db.select().from(debtsPayable).where(eq(debtsPayable.id, id)).limit(1);
    if (!existing) throw new NotFoundException('Debt not found');
    const newPaid = money(existing.amountPaid).plus(money(amount));
    const outstanding = money(existing.originalAmount).minus(newPaid);
    const status = outstanding.lte(0) ? 'PAID' : newPaid.gt(0) ? 'PARTIAL' : 'OUTSTANDING';
    const [row] = await this.db
      .update(debtsPayable)
      .set({ amountPaid: toDb(newPaid), status })
      .where(eq(debtsPayable.id, id))
      .returning();
    return row;
  }

  async totalOutstandingByCurrency() {
    const all = await this.list();
    const totals: Record<string, ReturnType<typeof money>> = {};
    for (const d of all) {
      const outstanding = money(d.originalAmount).minus(money(d.amountPaid));
      if (outstanding.lte(0)) continue;
      totals[d.currency] = (totals[d.currency] ?? ZERO).plus(outstanding);
    }
    return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, toDb(v)]));
  }
}
