import { Module } from '@nestjs/common';
import { SystemCheckService } from './system-check.service';
import { SystemCheckController } from './system-check.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [SystemCheckService],
  controllers: [SystemCheckController],
})
export class SystemCheckModule {}
