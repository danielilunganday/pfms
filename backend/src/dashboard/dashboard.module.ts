import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AccountsModule } from '../accounts/accounts.module';
import { NetWorthModule } from '../net-worth/net-worth.module';
import { LendingModule } from '../lending/lending.module';
import { DebtsModule } from '../debts/debts.module';
import { RecurringModule } from '../recurring/recurring.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    AccountsModule,
    NetWorthModule,
    LendingModule,
    DebtsModule,
    RecurringModule,
    AnalyticsModule,
    BudgetsModule,
    SettingsModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
