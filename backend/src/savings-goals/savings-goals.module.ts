import { Module } from '@nestjs/common';
import { SavingsGoalsService } from './savings-goals.service';
import { SavingsGoalsController } from './savings-goals.controller';

@Module({
  providers: [SavingsGoalsService],
  controllers: [SavingsGoalsController],
  exports: [SavingsGoalsService],
})
export class SavingsGoalsModule {}
