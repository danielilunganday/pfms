import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import dayjs from 'dayjs';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { borrowers, loans, loanInterestAccruals, loanRepayments, loanReminders } from '../db/schema';
import { money, toDb, ZERO } from '../common/money';
import { SettingsService } from '../settings/settings.service';
import { computeNewAccruals, computeOutstandingBalance, allocateRepayment } from './interest-engine';
import { encryptPII, decryptPII } from '../common/pii-crypto';

/** Borrower PII (national ID, address, phone number) is encrypted at rest
 *  (spec gap fix: this was previously stored plain text). Every write goes
 *  through encryptBorrowerRow(), every read through decryptBorrowerRow(), so
 *  the rest of the app — controllers, reminders, net worth — always sees
 *  plain values and never has to know encryption is involved. */
function encryptBorrowerRow<T extends { nationalId?: string | null; address?: string | null; phoneNumber?: string }>(
  input: T,
): T {
  return {
    ...input,
    ...(input.nationalId !== undefined ? { nationalId: encryptPII(input.nationalId) } : {}),
    ...(input.address !== undefined ? { address: encryptPII(input.address) } : {}),
    ...(input.phoneNumber !== undefined ? { phoneNumber: encryptPII(input.phoneNumber) as string } : {}),
  };
}

function decryptBorrowerRow<T extends { nationalId?: string | null; address?: string | null; phoneNumber?: string | null }>(
  row: T,
): T {
  return {
    ...row,
    nationalId: decryptPII(row.nationalId ?? null),
    address: decryptPII(row.address ?? null),
    phoneNumber: decryptPII(row.phoneNumber ?? null) ?? '',
  };
}

@Injectable()
export class LendingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly settings: SettingsService,
  ) {}

  // ── Borrowers (KYC) ─────────────────────────────────────────────────
  async createBorrower(input: {
    fullName: string;
    nationalId?: string;
    address?: string;
    phoneNumber: string;
    email?: string;
    notes?: string;
  }) {
    if (!input.phoneNumber) throw new BadRequestException('A phone number is required to send reminders');
    const [row] = await this.db.insert(borrowers).values(encryptBorrowerRow(input)).returning();
    return decryptBorrowerRow(row);
  }

  async updateBorrower(
    id: string,
    input: Partial<{ fullName: string; nationalId: string; address: string; phoneNumber: string; email: string; notes: string }>,
  ) {
    await this.getBorrower(id); // throws if not found
    const [row] = await this.db
      .update(borrowers)
      .set(encryptBorrowerRow(input))
      .where(eq(borrowers.id, id))
      .returning();
    return decryptBorrowerRow(row);
  }

  async listBorrowers() {
    const rows = await this.db.select().from(borrowers);
    return rows.map(decryptBorrowerRow);
  }

  async getBorrower(id: string) {
    const [row] = await this.db.select().from(borrowers).where(eq(borrowers.id, id)).limit(1);
    if (!row) throw new NotFoundException('Borrower not found');
    return decryptBorrowerRow(row);
  }

  // ── Loans ────────────────────────────────────────────────────────────
  async createLoan(input: {
    borrowerId: string;
    principal: string;
    currency: string;
    dateGiven: string;
    interestRatePercent?: string; // omit to use the current system default (currently 20%)
    firstDueDate?: string; // omit to default to dateGiven + 1 month
    notes?: string;
  }) {
    await this.getBorrower(input.borrowerId); // throws if not found
    if (money(input.principal).lte(0)) throw new BadRequestException('Principal must be positive');

    const rate = input.interestRatePercent ?? String(await this.settings.getDefaultLoanInterestRate());
    const dateGiven = new Date(input.dateGiven);
    const firstDueDate = input.firstDueDate
      ? new Date(input.firstDueDate)
      : dayjs(dateGiven).add(1, 'month').toDate();

    const [row] = await this.db
      .insert(loans)
      .values({
        borrowerId: input.borrowerId,
        principal: toDb(money(input.principal)),
        currency: input.currency,
        dateGiven,
        interestRatePercent: rate,
        firstDueDate,
        notes: input.notes,
      })
      .returning();

    await this.scheduleStandardReminders(row.id);
    return row;
  }

  async getLoan(id: string) {
    const [row] = await this.db.select().from(loans).where(eq(loans.id, id)).limit(1);
    if (!row) throw new NotFoundException('Loan not found');
    return row;
  }

  listLoans() {
    return this.db.select().from(loans);
  }

  /** Change the interest rate at your discretion — applies only to periods
   *  accrued FROM NOW ON. Past accrual rows keep the rate that was actually
   *  charged at the time (spec §37: original ≠ converted/changed value). */
  async setLoanInterestRate(loanId: string, ratePercent: string) {
    const [row] = await this.db
      .update(loans)
      .set({ interestRatePercent: ratePercent, updatedAt: new Date() })
      .where(eq(loans.id, loanId))
      .returning();
    if (!row) throw new NotFoundException('Loan not found');
    return row;
  }

  async writeOff(loanId: string, notes?: string) {
    const [row] = await this.db
      .update(loans)
      .set({ status: 'WRITTEN_OFF', notes, updatedAt: new Date() })
      .where(eq(loans.id, loanId))
      .returning();
    return row;
  }

  // ── Interest accrual ────────────────────────────────────────────────
  private async loadAccrualsAndRepayments(loanId: string) {
    const accrualRows = await this.db
      .select()
      .from(loanInterestAccruals)
      .where(eq(loanInterestAccruals.loanId, loanId))
      .orderBy(asc(loanInterestAccruals.periodEnd));
    const repaymentRows = await this.db
      .select()
      .from(loanRepayments)
      .where(eq(loanRepayments.loanId, loanId))
      .orderBy(asc(loanRepayments.date));
    return {
      accruals: accrualRows.map((a) => ({
        periodStart: a.periodStart,
        periodEnd: a.periodEnd,
        openingBalance: money(a.openingBalance),
        interestRatePercentApplied: money(a.interestRatePercentApplied),
        interestCharged: money(a.interestCharged),
        closingBalance: money(a.closingBalance),
      })),
      repayments: repaymentRows.map((r) => ({ date: r.date, amount: money(r.amount) })),
    };
  }

  /** Generates any newly-due compounding periods up to `asOf` (default: now).
   *  Safe to call repeatedly — already-recorded periods are never rewritten. */
  async accrueDueInterest(loanId: string, asOf: Date = new Date()) {
    const loan = await this.getLoan(loanId);
    if (loan.status === 'REPAID' || loan.status === 'WRITTEN_OFF') return [];

    const { accruals, repayments } = await this.loadAccrualsAndRepayments(loanId);
    const newPeriods = computeNewAccruals({
      principal: money(loan.principal),
      dateGiven: loan.dateGiven,
      ratePercent: money(loan.interestRatePercent),
      existingAccruals: accruals,
      repayments,
      asOf,
    });

    const created: any[] = [];
    for (const p of newPeriods) {
      const [row] = await this.db
        .insert(loanInterestAccruals)
        .values({
          loanId,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          openingBalance: toDb(p.openingBalance),
          interestRatePercentApplied: p.interestRatePercentApplied.toFixed(2),
          interestCharged: toDb(p.interestCharged),
          closingBalance: toDb(p.closingBalance),
        })
        .onConflictDoNothing()
        .returning();
      if (row) created.push(row);
    }

    // Update status: OVERDUE if still owing past the first due date, unless already REPAID/WRITTEN_OFF
    const balance = await this.getOutstandingBalance(loanId, asOf);
    if (balance.gt(0) && asOf > loan.firstDueDate && loan.status === 'ACTIVE') {
      await this.db.update(loans).set({ status: 'OVERDUE', updatedAt: new Date() }).where(eq(loans.id, loanId));
    }
    return created;
  }

  async getOutstandingBalance(loanId: string, asOf: Date = new Date()) {
    const loan = await this.getLoan(loanId);
    const { accruals, repayments } = await this.loadAccrualsAndRepayments(loanId);
    return computeOutstandingBalance({ principal: money(loan.principal), accruals, repayments, asOf });
  }

  /** Full picture of a loan: balance, accrual history, repayment history. */
  async loanDetail(loanId: string) {
    const loan = await this.getLoan(loanId);
    const borrower = await this.getBorrower(loan.borrowerId);
    const accrualRows = await this.db
      .select()
      .from(loanInterestAccruals)
      .where(eq(loanInterestAccruals.loanId, loanId))
      .orderBy(asc(loanInterestAccruals.periodEnd));
    const repaymentRows = await this.db
      .select()
      .from(loanRepayments)
      .where(eq(loanRepayments.loanId, loanId))
      .orderBy(asc(loanRepayments.date));
    const balance = await this.getOutstandingBalance(loanId);

    return {
      loan,
      borrower,
      accruals: accrualRows,
      repayments: repaymentRows,
      outstandingBalance: toDb(balance),
    };
  }

  // ── Repayments ──────────────────────────────────────────────────────
  async recordRepayment(loanId: string, amount: string, date: string) {
    const loan = await this.getLoan(loanId);
    if (loan.status === 'WRITTEN_OFF') {
      throw new BadRequestException('Cannot record a repayment against a written-off loan');
    }
    // Make sure interest is accrued up to the repayment date first, so the
    // interest-first allocation reflects everything actually owed by then.
    const repaymentDate = new Date(date);
    await this.accrueDueInterest(loanId, repaymentDate);

    const { accruals } = await this.loadAccrualsAndRepayments(loanId);
    const totalInterestChargedToDate = accruals
      .filter((a) => a.periodEnd <= repaymentDate)
      .reduce((s, a) => s.plus(a.interestCharged), ZERO);

    const priorRepaymentRows = await this.db
      .select()
      .from(loanRepayments)
      .where(eq(loanRepayments.loanId, loanId));
    const interestAlreadyRepaid = priorRepaymentRows.reduce(
      (s, r) => s.plus(money(r.appliedToInterest)),
      ZERO,
    );

    const amt = money(amount);
    if (amt.lte(0)) throw new BadRequestException('Repayment amount must be positive');

    const { appliedToInterest, appliedToPrincipal } = allocateRepayment({
      amount: amt,
      totalInterestChargedToDate,
      totalInterestAlreadyRepaid: interestAlreadyRepaid,
    });

    const [row] = await this.db
      .insert(loanRepayments)
      .values({
        loanId,
        date: repaymentDate,
        amount: toDb(amt),
        currency: loan.currency,
        appliedToInterest: toDb(appliedToInterest),
        appliedToPrincipal: toDb(appliedToPrincipal),
      })
      .returning();

    const remaining = await this.getOutstandingBalance(loanId, repaymentDate);
    if (remaining.lte(0)) {
      await this.db.update(loans).set({ status: 'REPAID', updatedAt: new Date() }).where(eq(loans.id, loanId));
    } else if (loan.status === 'OVERDUE') {
      // still owing but partially paid — stays OVERDUE/ACTIVE as appropriate; leave as-is
    }

    return row;
  }

  // ── Reminders (scheduling only — dispatch lives in RemindersModule) ──
  async scheduleStandardReminders(loanId: string) {
    const loan = await this.getLoan(loanId);
    const borrower = await this.getBorrower(loan.borrowerId);
    const daysBefore = await this.settings.getNumber('sms_reminder_days_before_due');

    const preDueDate = dayjs(loan.firstDueDate).subtract(daysBefore, 'day').toDate();
    const rows = [
      {
        loanId,
        recipientPhone: borrower.phoneNumber,
        triggerType: 'PRE_DUE',
        scheduledFor: preDueDate,
        status: 'PENDING' as const,
      },
      {
        loanId,
        recipientPhone: borrower.phoneNumber,
        triggerType: 'DUE',
        scheduledFor: loan.firstDueDate,
        status: 'PENDING' as const,
      },
    ];
    return this.db.insert(loanReminders).values(rows).returning();
  }

  async remindersForLoan(loanId: string) {
    return this.db.select().from(loanReminders).where(eq(loanReminders.loanId, loanId));
  }

  /** Overview across all loans given — used by the dashboard and net worth engine. */
  async portfolioSummary() {
    const all = await this.listLoans();
    let totalPrincipalOut = ZERO;
    let totalOutstanding = ZERO;
    const byCurrency: Record<string, { principal: any; outstanding: any }> = {};
    const details: any[] = [];
    for (const loan of all) {
      if (loan.status === 'WRITTEN_OFF') continue;
      const balance = await this.getOutstandingBalance(loan.id);
      totalPrincipalOut = totalPrincipalOut.plus(money(loan.principal));
      totalOutstanding = totalOutstanding.plus(balance);
      byCurrency[loan.currency] = byCurrency[loan.currency] || { principal: ZERO, outstanding: ZERO };
      byCurrency[loan.currency].principal = byCurrency[loan.currency].principal.plus(money(loan.principal));
      byCurrency[loan.currency].outstanding = byCurrency[loan.currency].outstanding.plus(balance);
      details.push({ loanId: loan.id, borrowerId: loan.borrowerId, status: loan.status, outstandingBalance: toDb(balance) });
    }
    return {
      totalPrincipalOut: toDb(totalPrincipalOut),
      totalOutstanding: toDb(totalOutstanding),
      byCurrency: Object.fromEntries(
        Object.entries(byCurrency).map(([k, v]) => [k, { principal: toDb(v.principal), outstanding: toDb(v.outstanding) }]),
      ),
      loans: details,
    };
  }
}
