import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { accounts, transactions } from '../db/schema';
import { money, toDb, ZERO } from '../common/money';

@Injectable()
export class AccountsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: {
    name: string;
    accountType: string;
    currency: string;
    openingBalance?: string;
    openingDate: string;
    notes?: string;
  }) {
    const [row] = await this.db
      .insert(accounts)
      .values({
        name: input.name,
        accountType: input.accountType,
        currency: input.currency,
        openingBalance: input.openingBalance ?? '0',
        openingDate: new Date(input.openingDate),
        notes: input.notes,
      })
      .returning();
    return row;
  }

  async list() {
    const all = await this.db.select().from(accounts);
    return Promise.all(all.map(async (a) => ({ ...a, balance: toDb(await this.getBalance(a.id)) })));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    if (!row) throw new NotFoundException('Account not found');
    return row;
  }

  async update(id: string, patch: Partial<{ name: string; notes: string; active: boolean }>) {
    const [row] = await this.db.update(accounts).set(patch).where(eq(accounts.id, id)).returning();
    if (!row) throw new NotFoundException('Account not found');
    return row;
  }

  /**
   * balance = opening_balance + income - expenses + transfers_in - transfers_out
   * Transfers between the user's own accounts never touch income/expense totals
   * (spec §6, §15 — this is the critical distinction the whole system depends on).
   */
  async getBalance(accountId: string) {
    const account = await this.get(accountId);
    const txns = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));

    let balance = money(account.openingBalance);
    for (const t of txns) {
      const amt = money(t.amount);
      if (t.type === 'INCOME' && t.incomeStatus !== 'EXPECTED') {
        balance = balance.plus(amt);
      } else if (t.type === 'EXPENSE') {
        balance = balance.minus(amt);
      } else if (t.type === 'TRANSFER') {
        balance = t.transferDirection === 'IN' ? balance.plus(amt) : balance.minus(amt);
      }
    }
    return balance;
  }

  /** Sums balances across active accounts whose accountType is in `types`
   *  (omit for "all account types"). Used to build distinct dashboard lines
   *  — "Total Cash" and "Savings" are different concepts (spec §17) and must
   *  not be silently merged into one bucket. */
  private async totalByCurrency(types?: string[]) {
    const all = await this.db.select().from(accounts).where(eq(accounts.active, true));
    const filtered = types ? all.filter((a) => types.includes(a.accountType)) : all;
    const totals: Record<string, ReturnType<typeof money>> = {};
    for (const a of filtered) {
      const bal = await this.getBalance(a.id);
      totals[a.currency] = (totals[a.currency] ?? ZERO).plus(bal);
    }
    return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, toDb(v)]));
  }

  /** "Total Cash" — readily spendable money: Cash, Bank Account, Mobile Money.
   *  Deliberately EXCLUDES Savings Account and Investment Account so those
   *  can be reported as their own dashboard lines without double-counting. */
  totalCashByCurrency() {
    return this.totalByCurrency(['Cash', 'Bank Account', 'Mobile Money']);
  }

  /** "Savings" balance held in dedicated Savings Account(s) — separate from
   *  Savings Goals (which track intent/progress, not where the money sits). */
  totalSavingsAccountBalanceByCurrency() {
    return this.totalByCurrency(['Savings Account']);
  }

  /** Cash sitting in a brokerage/"Investment Account" — kept apart from the
   *  Investments module's tracked positions (spec §37: capital invested ≠
   *  the account balance it happened to sit in) so Net Worth never counts
   *  the same dollar twice. */
  totalInvestmentAccountBalanceByCurrency() {
    return this.totalByCurrency(['Investment Account']);
  }
}
