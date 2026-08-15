import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { investments, investmentTransactions } from '../db/schema';
import { money, toDb, ZERO } from '../common/money';

@Injectable()
export class InvestmentsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: {
    name: string;
    investmentType: string;
    dateInvested: string;
    initialCapital: string;
    currency: string;
    expectedReturn?: string;
    expectedReturnDate?: string;
    riskLevel?: string;
    notes?: string;
  }) {
    const [row] = await this.db
      .insert(investments)
      .values({
        ...input,
        dateInvested: new Date(input.dateInvested),
        expectedReturnDate: input.expectedReturnDate ? new Date(input.expectedReturnDate) : null,
        currentValue: input.initialCapital,
      })
      .returning();

    await this.db.insert(investmentTransactions).values({
      investmentId: row.id,
      type: 'CONTRIBUTION',
      amount: input.initialCapital,
      currency: input.currency,
      date: new Date(input.dateInvested),
    });
    return row;
  }

  /** Additional capital added to an existing investment — an allocation, not
   *  an expense (spec §13, §37). */
  async addContribution(investmentId: string, amount: string, date: string) {
    await this.db.insert(investmentTransactions).values({
      investmentId,
      type: 'CONTRIBUTION',
      amount,
      currency: (await this.get(investmentId)).currency,
      date: new Date(date),
    });
    return this.recomputeCurrentValue(investmentId, money(amount), 'add');
  }

  /** A realized return/payout from the investment. */
  async recordReturn(investmentId: string, amount: string, date: string) {
    await this.db.insert(investmentTransactions).values({
      investmentId,
      type: 'RETURN',
      amount,
      currency: (await this.get(investmentId)).currency,
      date: new Date(date),
    });
    return this.get(investmentId);
  }

  async recordWithdrawal(investmentId: string, amount: string, date: string) {
    await this.db.insert(investmentTransactions).values({
      investmentId,
      type: 'WITHDRAWAL',
      amount,
      currency: (await this.get(investmentId)).currency,
      date: new Date(date),
    });
    return this.recomputeCurrentValue(investmentId, money(amount), 'subtract');
  }

  async updateCurrentValue(investmentId: string, currentValue: string) {
    const [row] = await this.db
      .update(investments)
      .set({ currentValue })
      .where(eq(investments.id, investmentId))
      .returning();
    return row;
  }

  private async recomputeCurrentValue(id: string, delta: ReturnType<typeof money>, dir: 'add' | 'subtract') {
    const inv = await this.get(id);
    const newValue = dir === 'add' ? money(inv.currentValue).plus(delta) : money(inv.currentValue).minus(delta);
    return this.updateCurrentValue(id, toDb(newValue));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(investments).where(eq(investments.id, id)).limit(1);
    if (!row) throw new NotFoundException('Investment not found');
    return row;
  }

  /** ROI = (current_value + realized_returns - capital_invested) / capital_invested */
  async performance(id: string) {
    const inv = await this.get(id);
    const txns = await this.db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.investmentId, id));

    const capitalInvested = txns
      .filter((t) => t.type === 'CONTRIBUTION')
      .reduce((s, t) => s.plus(money(t.amount)), ZERO);
    const realizedReturns = txns
      .filter((t) => t.type === 'RETURN')
      .reduce((s, t) => s.plus(money(t.amount)), ZERO);
    const withdrawals = txns
      .filter((t) => t.type === 'WITHDRAWAL')
      .reduce((s, t) => s.plus(money(t.amount)), ZERO);

    const currentValue = money(inv.currentValue);
    const unrealizedGain = currentValue.plus(withdrawals).minus(capitalInvested);
    const totalReturn = realizedReturns.plus(unrealizedGain);
    const roiPct = capitalInvested.gt(0) ? totalReturn.div(capitalInvested).times(100) : ZERO;

    return {
      investmentId: id,
      name: inv.name,
      currency: inv.currency,
      capitalInvested: toDb(capitalInvested),
      realizedReturns: toDb(realizedReturns),
      currentValue: toDb(currentValue),
      unrealizedGain: toDb(unrealizedGain),
      totalReturn: toDb(totalReturn),
      roiPct: roiPct.toFixed(2),
      status: inv.status,
    };
  }

  async list() {
    const all = await this.db.select().from(investments);
    return Promise.all(all.map((i) => this.performance(i.id)));
  }
}
