import { Module } from '@nestjs/common';
import { LendingService } from './lending.service';
import { LendingController } from './lending.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [LendingService],
  controllers: [LendingController],
  exports: [LendingService],
})
export class LendingModule {}
