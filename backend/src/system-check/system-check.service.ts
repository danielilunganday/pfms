import { Inject, Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import {
  transactions,
  loans,
  loanInterestAccruals,
  recurringTransactions,
  budgets,
  categories,
  netWorthSnapshots,
  currencies,
  exchangeRates,
  borrowers,
} from '../db/schema';
import { SettingsService } from '../settings/settings.service';

export type CheckLevel = 'OK' | 'WARNING' | 'ERROR';
export interface CheckResult {
  code: string;
  level: CheckLevel;
  message: string;
  count?: number;
}

const COMPOUNDING_DAYS: Record<string, number> = {
  WEEKLY: 7,
  MONTHLY: 31,
  QUARTERLY: 93,
  ANNUALLY: 366,
};

/**
 * Data Quality / System Check (spec gap: this reporting screen was never
 * built). Every check here inspects real invariants of the system — a
 * broken transfer pairing, a loan that's gone quiet on interest accrual, a
 * recurring bill that's stopped generating — rather than recomputing a
 * "trust me" health score. Each result is OK/WARNING/ERROR with a concrete,
 * actionable message; nothing here is a black box.
 */
@Injectable()
export class SystemCheckService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly settings: SettingsService,
  ) {}

  async runChecks(): Promise<{ results: CheckResult[]; summary: { ok: number; warning: number; error: number }; runAt: string }> {
    const results: CheckResult[] = [];

    // 1. PII encryption key
    if (!process.env.PII_ENCRYPTION_KEY) {
      results.push({
        code: 'PII_KEY_MISSING',
        level: process.env.NODE_ENV === 'production' ? 'ERROR' : 'WARNING',
        message:
          'PII_ENCRYPTION_KEY is not set — borrower national ID / address / phone number are protected with an insecure dev-only key. Generate one with `openssl rand -hex 32` and set it in the backend .env before storing real borrower data.',
      });
    } else {
      results.push({ code: 'PII_KEY_MISSING', level: 'OK', message: 'PII encryption key is configured.' });
    }

    // 2. Broken transfer pairs
    const brokenTransfers = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.type, 'TRANSFER'));
    const orphanTransfers = brokenTransfers.filter((t) => !t.linkedTransferId);
    if (orphanTransfers.length > 0) {
      results.push({
        code: 'ORPHAN_TRANSFERS',
        level: 'ERROR',
        message: `${orphanTransfers.length} transfer transaction(s) have no linked counterpart leg — the transfer pairing is broken and may distort account balances.`,
        count: orphanTransfers.length,
      });
    } else {
      results.push({ code: 'ORPHAN_TRANSFERS', level: 'OK', message: 'All transfers have a matching paired leg.' });
    }

    // 3. Loan interest accrual gaps
    const compoundingPeriod = await this.settings.get('loan_compounding_period').catch(() => 'MONTHLY');
    const graceDays = (COMPOUNDING_DAYS[compoundingPeriod.toUpperCase()] ?? 31) + 5; // small buffer before flagging
    const activeLoans = await this.db.select().from(loans);
    const staleLoans: string[] = [];
    for (const loan of activeLoans) {
      if (loan.status === 'REPAID' || loan.status === 'WRITTEN_OFF') continue;
      const [lastAccrual] = await this.db
        .select()
        .from(loanInterestAccruals)
        .where(eq(loanInterestAccruals.loanId, loan.id))
        .orderBy(desc(loanInterestAccruals.periodEnd))
        .limit(1);
      const lastPoint = lastAccrual ? dayjs(lastAccrual.periodEnd) : dayjs(loan.dateGiven);
      if (dayjs().diff(lastPoint, 'day') > graceDays) staleLoans.push(loan.id);
    }
    if (staleLoans.length > 0) {
      results.push({
        code: 'LOAN_ACCRUAL_GAP',
        level: 'WARNING',
        message: `${staleLoans.length} active loan(s) have not had interest accrued recently — run the daily job (POST /api/reminders/run-daily-job) or open each loan to bring accruals up to date.`,
        count: staleLoans.length,
      });
    } else {
      results.push({ code: 'LOAN_ACCRUAL_GAP', level: 'OK', message: 'All active loans have up-to-date interest accrual.' });
    }

    // 4. Recurring transactions overdue for generation
    const recurring = await this.db.select().from(recurringTransactions).where(eq(recurringTransactions.active, true));
    const overdueRecurring = recurring.filter((r) => dayjs().diff(dayjs(r.nextDueDate), 'day') > 3);
    if (overdueRecurring.length > 0) {
      results.push({
        code: 'RECURRING_OVERDUE',
        level: 'WARNING',
        message: `${overdueRecurring.length} recurring transaction(s) are overdue for generation (e.g. "${overdueRecurring[0].description}", due ${dayjs(overdueRecurring[0].nextDueDate).format('DD MMM YYYY')}) — visit Recurring and click "Generate due".`,
        count: overdueRecurring.length,
      });
    } else {
      results.push({ code: 'RECURRING_OVERDUE', level: 'OK', message: 'No recurring transactions are overdue for generation.' });
    }

    // 5. Budgets pointing at inactive categories
    const budgetRows = await this.db.select({ budget: budgets, category: categories }).from(budgets).innerJoin(categories, eq(budgets.categoryId, categories.id));
    const inactiveBudgeted = budgetRows.filter((r) => !r.category.active);
    if (inactiveBudgeted.length > 0) {
      results.push({
        code: 'BUDGET_INACTIVE_CATEGORY',
        level: 'WARNING',
        message: `${inactiveBudgeted.length} budget line(s) are set against a category that's since been deactivated.`,
        count: inactiveBudgeted.length,
      });
    } else {
      results.push({ code: 'BUDGET_INACTIVE_CATEGORY', level: 'OK', message: 'All budgets point at active categories.' });
    }

    // 6. Net worth snapshot staleness
    const [lastSnapshot] = await this.db.select().from(netWorthSnapshots).orderBy(desc(netWorthSnapshots.date)).limit(1);
    if (!lastSnapshot) {
      results.push({ code: 'NET_WORTH_STALE', level: 'WARNING', message: 'No net worth snapshot has ever been saved — visit Net Worth and save one to start tracking trend over time.' });
    } else if (dayjs().diff(dayjs(lastSnapshot.date), 'day') > 40) {
      results.push({ code: 'NET_WORTH_STALE', level: 'WARNING', message: `Last net worth snapshot was saved ${dayjs().diff(dayjs(lastSnapshot.date), 'day')} days ago — consider saving a fresh one for an accurate trend line.` });
    } else {
      results.push({ code: 'NET_WORTH_STALE', level: 'OK', message: 'Net worth snapshots are up to date.' });
    }

    // 7. Missing exchange rates for non-primary currencies in use
    const primary = await this.settings.get('primary_currency');
    const activeCurrencies = await this.db.select().from(currencies).where(eq(currencies.active, true));
    const missingRates: string[] = [];
    for (const c of activeCurrencies) {
      if (c.code === primary) continue;
      const [rate] = await this.db.select().from(exchangeRates).where(eq(exchangeRates.fromCurrency, c.code)).limit(1);
      if (!rate) missingRates.push(c.code);
    }
    if (missingRates.length > 0) {
      results.push({
        code: 'MISSING_EXCHANGE_RATE',
        level: 'WARNING',
        message: `No exchange rate configured for ${missingRates.join(', ')} → ${primary} — amounts in that currency show as "unconverted" on Net Worth instead of being consolidated.`,
        count: missingRates.length,
      });
    } else {
      results.push({ code: 'MISSING_EXCHANGE_RATE', level: 'OK', message: 'Every active currency has a configured exchange rate to the primary currency.' });
    }

    // 8. Borrowers missing a phone number (reminders can't be sent)
    const allBorrowers = await this.db.select().from(borrowers);
    const noPhone = allBorrowers.filter((b) => !b.phoneNumber);
    if (noPhone.length > 0) {
      results.push({
        code: 'BORROWER_NO_PHONE',
        level: 'WARNING',
        message: `${noPhone.length} borrower(s) have no phone number on file — SMS reminders cannot be sent to them.`,
        count: noPhone.length,
      });
    } else {
      results.push({ code: 'BORROWER_NO_PHONE', level: 'OK', message: 'Every borrower has a phone number on file.' });
    }

    const summary = {
      ok: results.filter((r) => r.level === 'OK').length,
      warning: results.filter((r) => r.level === 'WARNING').length,
      error: results.filter((r) => r.level === 'ERROR').length,
    };
    return { results, summary, runAt: new Date().toISOString() };
  }
}
