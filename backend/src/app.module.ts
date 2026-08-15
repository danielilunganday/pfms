import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BudgetsModule } from './budgets/budgets.module';
import { RecurringModule } from './recurring/recurring.module';
import { SavingsGoalsModule } from './savings-goals/savings-goals.module';
import { InvestmentsModule } from './investments/investments.module';
import { LendingModule } from './lending/lending.module';
import { DebtsModule } from './debts/debts.module';
import { NetWorthModule } from './net-worth/net-worth.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RemindersModule } from './reminders/reminders.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ImportModule } from './import/import.module';
import { SystemCheckModule } from './system-check/system-check.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global rate limiting — protects the whole API (esp. /auth/login) from
    // brute-force / abuse. Generous default since the SPA polls frequently
    // via React Query; AuthController overrides this to a much stricter
    // limit on login/register specifically (see @Throttle there).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DbModule,
    AuthModule,
    SettingsModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    BudgetsModule,
    RecurringModule,
    SavingsGoalsModule,
    InvestmentsModule,
    LendingModule,
    DebtsModule,
    NetWorthModule,
    AnalyticsModule,
    RemindersModule,
    DashboardModule,
    ImportModule,
    SystemCheckModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
