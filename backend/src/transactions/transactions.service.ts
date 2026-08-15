import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, lte, desc } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { transactions, auditLog } from '../db/schema';
import { money, toDb } from '../common/money';

export interface TxnFilter {
  type?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  accountId?: string;
  categoryId?: string;
  currency?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class TransactionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async audit(action: 'CREATE' | 'UPDATE' | 'DELETE', recordId: string, oldValue?: any, newValue?: any) {
    await this.db.insert(auditLog).values({
      tableName: 'transactions',
      recordId,
      action,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
    });
  }

  async createIncome(input: {
    accountId: string;
    categoryId?: string;
    currency: string;
    amount: string;
    date: string;
    description?: string;
    incomeSource?: string;
    incomeStatus?: 'EXPECTED' | 'RECEIVED';
    paymentMethod?: string;
  }) {
    if (money(input.amount).lte(0)) throw new BadRequestException('Income amount must be positive');
    const [row] = await this.db
      .insert(transactions)
      .values({
        type: 'INCOME',
        date: new Date(input.date),
        accountId: input.accountId,
        categoryId: input.categoryId,
        currency: input.currency,
        amount: toDb(money(input.amount)),
        description: input.description,
        incomeSource: input.incomeSource,
        incomeStatus: input.incomeStatus ?? 'RECEIVED',
        paymentMethod: input.paymentMethod,
      })
      .returning();
    await this.audit('CREATE', row.id, null, row);
    return row;
  }

  async createExpense(input: {
    accountId: string;
    categoryId?: string;
    currency: string;
    amount: string;
    date: string;
    description?: string;
    paymentMethod?: string;
    isEssential?: boolean;
  }) {
    if (money(input.amount).lte(0)) throw new BadRequestException('Expense amount must be positive');
    const [row] = await this.db
      .insert(transactions)
      .values({
        type: 'EXPENSE',
        date: new Date(input.date),
        accountId: input.accountId,
        categoryId: input.categoryId,
        currency: input.currency,
        amount: toDb(money(input.amount)),
        description: input.description,
        paymentMethod: input.paymentMethod,
        isEssential: input.isEssential ?? false,
      })
      .returning();
    await this.audit('CREATE', row.id, null, row);
    return row;
  }

  /**
   * Transfers move money between the user's own accounts. They must NEVER be
   * counted as income or expense (spec §6, §15, §37) — that's why both legs
   * are typed TRANSFER, not INCOME/EXPENSE, and are excluded from those totals
   * everywhere in the system (budgets, income/expense analytics, etc).
   * Supports same-currency and cross-currency transfers.
   */
  async createTransfer(input: {
    fromAccountId: string;
    toAccountId: string;
    fromAmount: string;
    fromCurrency: string;
    toAmount?: string;
    toCurrency?: string;
    date: string;
    description?: string;
  }) {
    if (input.fromAccountId === input.toAccountId) {
      throw new BadRequestException('Cannot transfer an account to itself');
    }
    const fromAmt = money(input.fromAmount);
    if (fromAmt.lte(0)) throw new BadRequestException('Transfer amount must be positive');
    const toCurrency = input.toCurrency ?? input.fromCurrency;
    const toAmount = input.toAmount ? money(input.toAmount) : fromAmt;

    const [outRow] = await this.db
      .insert(transactions)
      .values({
        type: 'TRANSFER',
        date: new Date(input.date),
        accountId: input.fromAccountId,
        currency: input.fromCurrency,
        amount: toDb(fromAmt),
        description: input.description,
        transferDirection: 'OUT',
      })
      .returning();

    const [inRow] = await this.db
      .insert(transactions)
      .values({
        type: 'TRANSFER',
        date: new Date(input.date),
        accountId: input.toAccountId,
        currency: toCurrency,
        amount: toDb(toAmount),
        description: input.description,
        transferDirection: 'IN',
        linkedTransferId: outRow.id,
      })
      .returning();

    await this.db
      .update(transactions)
      .set({ linkedTransferId: inRow.id })
      .where(eq(transactions.id, outRow.id));

    await this.audit('CREATE', outRow.id, null, outRow);
    await this.audit('CREATE', inRow.id, null, inRow);
    return { out: outRow, in: inRow };
  }

  async list(filter: TxnFilter = {}) {
    const conditions = [] as any[];
    if (filter.type) conditions.push(eq(transactions.type, filter.type));
    if (filter.accountId) conditions.push(eq(transactions.accountId, filter.accountId));
    if (filter.categoryId) conditions.push(eq(transactions.categoryId, filter.categoryId));
    if (filter.currency) conditions.push(eq(transactions.currency, filter.currency));
    if (filter.dateFrom) conditions.push(gte(transactions.date, new Date(filter.dateFrom)));
    if (filter.dateTo) conditions.push(lte(transactions.date, new Date(filter.dateTo)));

    const query = this.db.select().from(transactions);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(transactions.date));
    }
    return query.orderBy(desc(transactions.date));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (!row) throw new NotFoundException('Transaction not found');
    return row;
  }

  async markIncomeReceived(id: string) {
    const existing = await this.get(id);
    if (existing.type !== 'INCOME') throw new BadRequestException('Only income transactions have a status');
    const [row] = await this.db
      .update(transactions)
      .set({ incomeStatus: 'RECEIVED', updatedAt: new Date() })
      .where(eq(transactions.id, id))
      .returning();
    await this.audit('UPDATE', id, existing, row);
    return row;
  }

  async delete(id: string) {
    const existing = await this.get(id);
    await this.db.delete(transactions).where(eq(transactions.id, id));
    await this.audit('DELETE', id, existing, null);
    return { deleted: true };
  }

  /** Attaches a receipt/photo (already saved to disk by the controller) to a
   *  transaction — e.g. a photo of a grocery receipt or a clothing purchase
   *  slip, so the record behind a budget line is inspectable later. */
  async attachReceipt(id: string, receiptUrl: string) {
    const existing = await this.get(id);
    const [row] = await this.db
      .update(transactions)
      .set({ receiptUrl, updatedAt: new Date() })
      .where(eq(transactions.id, id))
      .returning();
    await this.audit('UPDATE', id, existing, row);
    return row;
  }
}
