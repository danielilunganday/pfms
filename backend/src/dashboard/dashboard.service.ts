import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { AccountsService } from '../accounts/accounts.service';
import { NetWorthService } from '../net-worth/net-worth.service';
import { LendingService } from '../lending/lending.service';
import { DebtsService } from '../debts/debts.service';
import { RecurringService } from '../recurring/recurring.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { BudgetsService } from '../budgets/budgets.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly netWorth: NetWorthService,
    private readonly lending: LendingService,
    private readonly debts: DebtsService,
    private readonly recurring: RecurringService,
    private readonly analytics: AnalyticsService,
    private readonly budgets: BudgetsService,
    private readonly settings: SettingsService,
  ) {}

  /** One call to populate the home screen — current position, this month,
   *  savings/budget health, upcoming obligations, and long-term trend seeds. */
  async summary() {
    const primary = await this.settings.get('primary_currency');
    const currentPeriod = dayjs().format('YYYY-MM');

    const [
      cashByCurrency,
      savingsAccountByCurrency,
      netWorthNow,
      loanPortfolio,
      debtsOutstanding,
      upcoming,
      monthSummary,
      budgetVsActual,
      emergencyFund,
    ] = await Promise.all([
      this.accounts.totalCashByCurrency(),
      this.accounts.totalSavingsAccountBalanceByCurrency(),
      this.netWorth.compute(),
      this.lending.portfolioSummary(),
      this.debts.totalOutstandingByCurrency(),
      this.recurring.upcoming(14),
      this.analytics.monthlySummary(currentPeriod, primary),
      this.budgets.budgetVsActual(currentPeriod, primary),
      this.analytics.emergencyFundCoverage(primary),
    ]);

    const overBudget = budgetVsActual.filter((b) => b.status === 'OVER');
    const nearLimit = budgetVsActual.filter((b) => b.status === 'WARNING');
    const largestCategories = [...budgetVsActual].sort(
      (a, b) => parseFloat(b.actual) - parseFloat(a.actual),
    );

    return {
      primaryCurrency: primary,
      currentPosition: {
        cashByCurrency,
        savingsAccountByCurrency,
        netWorth: netWorthNow,
        loansReceivable: loanPortfolio,
        debtsPayableByCurrency: debtsOutstanding,
      },
      currentMonth: monthSummary,
      budgetHealth: {
        overBudget,
        nearLimit,
        largestCategories: largestCategories.slice(0, 5),
      },
      savings: {
        emergencyFund,
      },
      upcoming: {
        recurringWithin14Days: upcoming,
      },
    };
  }
}
