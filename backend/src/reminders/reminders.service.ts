import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, lte, desc } from 'drizzle-orm';
import dayjs from 'dayjs';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { loanReminders, loans } from '../db/schema';
import { LendingService } from '../lending/lending.service';
import { SettingsService } from '../settings/settings.service';
import type { SmsProvider } from './sms-provider.interface';
import { SMS_PROVIDER } from './sms-provider.interface';
import { toDb } from '../common/money';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger('RemindersService');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly lending: LendingService,
    private readonly settings: SettingsService,
    // Active provider is chosen at startup by SMS_PROVIDER (see reminders.module.ts)
    // — defaults to the safe console stub until you configure a real one.
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /** Runs daily at 08:00 server time: accrues overdue interest, schedules
   *  repeating overdue reminders, and dispatches anything due. Also callable
   *  on demand via POST /api/reminders/run-daily-job for testing. */
  @Cron('0 8 * * *')
  async runDailyJob() {
    this.logger.log('Running daily lending job: accrue interest, schedule + dispatch reminders');
    const allLoans = await this.db.select().from(loans);

    for (const loan of allLoans) {
      if (loan.status === 'REPAID' || loan.status === 'WRITTEN_OFF') continue;
      await this.lending.accrueDueInterest(loan.id);
    }

    await this.scheduleOverdueReminders();
    return this.dispatchDueReminders();
  }

  private async scheduleOverdueReminders() {
    const repeatDays = await this.settings.getNumber('sms_reminder_overdue_repeat_days');
    const overdueLoans = await this.db.select().from(loans).where(eq(loans.status, 'OVERDUE'));

    for (const loan of overdueLoans) {
      const existing = await this.db
        .select()
        .from(loanReminders)
        .where(and(eq(loanReminders.loanId, loan.id), eq(loanReminders.triggerType, 'OVERDUE')))
        .orderBy(desc(loanReminders.scheduledFor));

      const last = existing[0];
      const nextAllowed = last ? dayjs(last.scheduledFor).add(repeatDays, 'day') : dayjs(loan.firstDueDate);
      if (dayjs().isBefore(nextAllowed, 'day')) continue;

      // Goes through LendingService (not a raw DB select) so phoneNumber
      // comes back decrypted — borrowers.phoneNumber is encrypted at rest.
      const borrower = await this.lending.getBorrower(loan.borrowerId).catch(() => null);
      if (!borrower) continue;

      await this.db.insert(loanReminders).values({
        loanId: loan.id,
        recipientPhone: borrower.phoneNumber,
        triggerType: 'OVERDUE',
        scheduledFor: new Date(),
        status: 'PENDING',
      });
    }
  }

  async dispatchDueReminders() {
    const due = await this.db
      .select()
      .from(loanReminders)
      .where(and(eq(loanReminders.status, 'PENDING'), lte(loanReminders.scheduledFor, new Date())));

    const results: any[] = [];
    for (const reminder of due) {
      const loan = await this.lending.getLoan(reminder.loanId);
      const borrower = await this.lending.getBorrower(loan.borrowerId);
      const balance = await this.lending.getOutstandingBalance(loan.id);

      const message = this.buildMessage(reminder.triggerType, borrower.fullName, toDb(balance), loan.currency, loan.firstDueDate);
      const result = await this.sms.send(reminder.recipientPhone, message);

      const [updated] = await this.db
        .update(loanReminders)
        .set({
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
          messageText: message,
        })
        .where(eq(loanReminders.id, reminder.id))
        .returning();
      results.push({ reminder: updated, providerResult: result });
    }
    return results;
  }

  private buildMessage(
    triggerType: string,
    borrowerName: string,
    balance: string,
    currency: string,
    dueDate: Date,
  ) {
    const dueStr = dayjs(dueDate).format('DD MMM YYYY');
    switch (triggerType) {
      case 'PRE_DUE':
        return `Hi ${borrowerName}, a reminder that your loan of ${currency} ${balance} is due on ${dueStr}. Please arrange repayment on time.`;
      case 'DUE':
        return `Hi ${borrowerName}, your loan repayment of ${currency} ${balance} is due today (${dueStr}).`;
      case 'OVERDUE':
        return `Hi ${borrowerName}, your loan is now overdue. Outstanding balance: ${currency} ${balance}. Interest continues to accrue until settled. Please contact us to arrange repayment.`;
      default:
        return `Hi ${borrowerName}, you have an outstanding balance of ${currency} ${balance}.`;
    }
  }

  async list(loanId?: string) {
    if (loanId) return this.db.select().from(loanReminders).where(eq(loanReminders.loanId, loanId));
    return this.db.select().from(loanReminders).orderBy(desc(loanReminders.scheduledFor));
  }
}
