import { Module } from '@nestjs/common';
import { NetWorthService } from './net-worth.service';
import { NetWorthController } from './net-worth.controller';
import { FxService } from './fx.service';
import { AccountsModule } from '../accounts/accounts.module';
import { InvestmentsModule } from '../investments/investments.module';
import { LendingModule } from '../lending/lending.module';
import { DebtsModule } from '../debts/debts.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [AccountsModule, InvestmentsModule, LendingModule, DebtsModule, SettingsModule],
  providers: [NetWorthService, FxService],
  controllers: [NetWorthController],
  exports: [NetWorthService, FxService],
})
export class NetWorthModule {}
